import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(APP_DIR, "data");
const LEDGER_PATH = path.join(DATA_DIR, "kalshi_mlb_2026_prestart_moneyline_ledger.csv");
const MISSING_PATH = path.join(DATA_DIR, "kalshi_mlb_2026_prestart_moneyline_missing.csv");
const LEDGER_TMP_PATH = `${LEDGER_PATH}.tmp`;
const MISSING_TMP_PATH = `${MISSING_PATH}.tmp`;

const GAMMA_BASE = process.env.POLYMARKET_GAMMA_BASE || "https://gamma-api.polymarket.com";
const CLOB_BASE = process.env.POLYMARKET_CLOB_BASE || "https://clob.polymarket.com";
const MLB_BASE = process.env.MLB_BASE || "https://statsapi.mlb.com";
const FIRST_2026_DATE = "2026-03-26";

const BASE_LEDGER_COLUMNS = [
  "date",
  "game_pk",
  "match",
  "scheduled_start_utc",
  "winner",
  "snapshot_target_utc",
  "snapshot_source",
  "home_team_name",
  "away_team_name",
  "home_yes_bid",
  "away_yes_bid",
  "home_snapshot_time_utc",
  "away_snapshot_time_utc",
  "home_snapshot_stale_seconds",
  "away_snapshot_stale_seconds",
  "kalshi_event_ticker",
  "kalshi_home_market_ticker",
  "kalshi_away_market_ticker",
  "data_status",
  "missing_reason",
  "price_source",
  "polymarket_event_slug",
  "polymarket_market_slug",
  "polymarket_market_id",
  "polymarket_home_token_id",
  "polymarket_away_token_id",
  "polymarket_event_url"
];

const MISSING_COLUMNS = [
  "date",
  "game_pk",
  "match",
  "scheduled_start_utc",
  "reason",
  "kalshi_event_ticker"
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.rebuild) {
    await rebuildFromPolymarket(args);
    return;
  }

  const limit = Number(args.limit || Infinity);
  const rows = parseCsv(await fs.readFile(LEDGER_PATH, "utf8"));
  const newRows = await appendNewMlbRows(rows, args);
  const missingBefore = rows.filter(isBlankMarketRow).length;
  let attempted = 0;
  let filled = 0;

  for (const row of rows) {
    if (!isBlankMarketRow(row)) {
      row.price_source ||= "kalshi";
      row.data_status ||= "filled";
      continue;
    }
    if (attempted >= limit) break;
    attempted += 1;

    const fill = await polymarketFill(row).catch((error) => ({ error: error.message || String(error) }));
    if (!fill || fill.error) {
      row.price_source = row.price_source || "";
      row.data_status = "missing";
      row.missing_reason = `Polymarket fill failed: ${fill?.error || "No Polymarket moneyline fill found."}`;
      console.log(`${row.date} ${row.match}: missing - ${row.missing_reason}`);
      continue;
    }

    Object.assign(row, fill);
    row.price_source = "polymarket";
    row.data_status = "filled";
    row.missing_reason = "";
    filled += 1;
    console.log(`${row.date} ${row.match}: filled from Polymarket ${row.home_yes_bid}/${row.away_yes_bid}`);
    await sleep(250);
  }

  const missingRows = rows.filter(isBlankMarketRow).map((row) => ({
    date: row.date,
    game_pk: row.game_pk,
    match: row.match,
    scheduled_start_utc: row.scheduled_start_utc,
    reason: row.missing_reason || "Market values remain blank after Kalshi and Polymarket attempts.",
    kalshi_event_ticker: row.kalshi_event_ticker
  }));

  await backupExistingFiles();
  await writeCsv(LEDGER_TMP_PATH, BASE_LEDGER_COLUMNS, rows);
  await writeCsv(MISSING_TMP_PATH, MISSING_COLUMNS, missingRows);
  await fs.rename(LEDGER_TMP_PATH, LEDGER_PATH);
  await fs.rename(MISSING_TMP_PATH, MISSING_PATH);

  console.log(`Done. Existing rows preserved. New MLB rows added: ${newRows}. Blank before fill: ${missingBefore}. Attempted: ${attempted}. Polymarket filled: ${filled}. Remaining blank: ${missingRows.length}.`);
}

async function appendNewMlbRows(rows, args) {
  const existingGamePks = new Set(rows.map((row) => String(row.game_pk || "")));
  const latestStoredDate = rows.reduce((max, row) => row.date > max ? row.date : max, "");
  const startDate = args.start || (latestStoredDate ? addDays(latestStoredDate, 1) : FIRST_2026_DATE);
  const endDate = args.end || latestCompletedResultDate(new Date());
  if (startDate > endDate) {
    console.log(`No new MLB dates to append. Latest stored date ${latestStoredDate || "none"}; latest completed date ${endDate}.`);
    return 0;
  }

  let added = 0;
  console.log(`Appending new MLB moneyline rows only: ${startDate} through ${endDate}`);
  for (const date of dateRange(startDate, endDate)) {
    const games = await fetchMlbGames(date);
    for (const game of games) {
      if (existingGamePks.has(String(game.gamePk))) continue;
      rows.push(baseLedgerRow(game));
      existingGamePks.add(String(game.gamePk));
      added += 1;
    }
    console.log(`${date}: appended ${added} total new rows so far`);
  }
  rows.sort((a, b) => `${a.date} ${a.match} ${a.game_pk}`.localeCompare(`${b.date} ${b.match} ${b.game_pk}`));
  return added;
}

async function rebuildFromPolymarket(args) {
  const startDate = args.start || FIRST_2026_DATE;
  const endDate = args.end || latestCompletedResultDate(new Date());
  const maxGames = Number(args.limit || Infinity);
  const rows = [];
  let seenGames = 0;
  let filled = 0;

  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`Building Polymarket MLB moneyline probe: ${startDate} through ${endDate}`);

  for (const date of dateRange(startDate, endDate)) {
    const games = await fetchMlbGames(date);
    for (const game of games) {
      if (seenGames >= maxGames) break;
      seenGames += 1;

      const row = baseLedgerRow(game);
      if (!game.isFinal) {
        row.data_status = "missing";
        row.missing_reason = "MLB game is not final yet.";
        rows.push(row);
        continue;
      }

      const fill = await polymarketFill(row).catch((error) => ({ error: error.message || String(error) }));
      if (!fill || fill.error) {
        row.data_status = "missing";
        row.missing_reason = `Polymarket fill failed: ${fill?.error || "No Polymarket moneyline fill found."}`;
        rows.push(row);
        console.log(`${row.date} ${row.match}: missing - ${row.missing_reason}`);
        continue;
      }

      Object.assign(row, fill);
      row.price_source = "polymarket";
      row.data_status = "filled";
      row.missing_reason = "";
      rows.push(row);
      filled += 1;
      console.log(`${row.date} ${row.match}: filled from Polymarket ${row.home_yes_bid}/${row.away_yes_bid}`);
      await sleep(250);
    }
    if (seenGames >= maxGames) break;
    console.log(`${date}: ${rows.length} MLB rows, ${filled} Polymarket-filled so far`);
  }

  rows.sort((a, b) => `${a.date} ${a.match} ${a.game_pk}`.localeCompare(`${b.date} ${b.match} ${b.game_pk}`));
  const missingRows = rows.filter(isBlankMarketRow).map((row) => ({
    date: row.date,
    game_pk: row.game_pk,
    match: row.match,
    scheduled_start_utc: row.scheduled_start_utc,
    reason: row.missing_reason || "Polymarket moneyline values remain blank.",
    kalshi_event_ticker: ""
  }));

  await backupExistingFiles();
  await writeCsv(LEDGER_TMP_PATH, BASE_LEDGER_COLUMNS, rows);
  await writeCsv(MISSING_TMP_PATH, MISSING_COLUMNS, missingRows);
  await fs.rename(LEDGER_TMP_PATH, LEDGER_PATH);
  await fs.rename(MISSING_TMP_PATH, MISSING_PATH);
  console.log(`Done. Ledger rows: ${rows.length}. Polymarket filled: ${filled}. Blank/unfilled rows: ${missingRows.length}.`);
}

async function fetchMlbGames(date) {
  const body = await publicJson(`${MLB_BASE}/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`);
  return (body.dates || []).flatMap((day) => day.games || []).map((game) => {
    const away = game.teams?.away;
    const home = game.teams?.home;
    const awayScore = Number(away?.score);
    const homeScore = Number(home?.score);
    const winner = Number.isFinite(awayScore) && Number.isFinite(homeScore)
      ? (homeScore > awayScore ? "Home" : "Away")
      : "";
    return {
      gamePk: game.gamePk,
      date: game.officialDate || date,
      scheduledStartUtc: game.gameDate || "",
      isFinal: game.status?.abstractGameState === "Final" || game.status?.statusCode === "F" || game.status?.statusCode === "FR",
      awayTeam: away?.team?.name || "",
      homeTeam: home?.team?.name || "",
      winner
    };
  }).filter((game) => game.date === date && game.gamePk && game.awayTeam && game.homeTeam && game.scheduledStartUtc);
}

function baseLedgerRow(game) {
  return {
    date: game.date,
    game_pk: game.gamePk,
    match: `${game.awayTeam} @ ${game.homeTeam}`,
    scheduled_start_utc: game.scheduledStartUtc,
    winner: game.winner,
    snapshot_target_utc: "",
    snapshot_source: "",
    home_team_name: game.homeTeam,
    away_team_name: game.awayTeam,
    home_yes_bid: "",
    away_yes_bid: "",
    home_snapshot_time_utc: "",
    away_snapshot_time_utc: "",
    home_snapshot_stale_seconds: "",
    away_snapshot_stale_seconds: "",
    kalshi_event_ticker: "",
    kalshi_home_market_ticker: "",
    kalshi_away_market_ticker: "",
    data_status: "",
    missing_reason: "",
    price_source: "",
    polymarket_event_slug: "",
    polymarket_market_slug: "",
    polymarket_market_id: "",
    polymarket_home_token_id: "",
    polymarket_away_token_id: "",
    polymarket_event_url: ""
  };
}

async function polymarketFill(row) {
  const event = await fetchMoneylineEvent(row);
  if (!event) throw new Error("No matching Polymarket MLB event.");
  const market = moneylineMarket(event.event, row);
  if (!market) throw new Error(`No Polymarket moneyline market in ${event.eventSlug}.`);

  const target = new Date(new Date(row.scheduled_start_utc).getTime() - 60_000);
  const [home, away] = await Promise.all([
    nearestHistoricalPrice(market.homeTokenId, target),
    nearestHistoricalPrice(market.awayTokenId, target)
  ]);
  if (!home || !away) throw new Error("No historical prestart price for one or both moneyline tokens.");

  return {
    snapshot_target_utc: target.toISOString(),
    snapshot_source: "Polymarket CLOB historical price, nearest point <= MLB scheduled start minus 60 seconds",
    home_yes_bid: formatPrice(home.price * 100),
    away_yes_bid: formatPrice(away.price * 100),
    home_snapshot_time_utc: new Date(home.t * 1000).toISOString(),
    away_snapshot_time_utc: new Date(away.t * 1000).toISOString(),
    home_snapshot_stale_seconds: String(Math.floor(target.getTime() / 1000) - home.t),
    away_snapshot_stale_seconds: String(Math.floor(target.getTime() / 1000) - away.t),
    polymarket_event_slug: event.eventSlug,
    polymarket_market_slug: market.marketSlug,
    polymarket_market_id: market.marketId,
    polymarket_home_token_id: market.homeTokenId,
    polymarket_away_token_id: market.awayTokenId,
    polymarket_event_url: `https://polymarket.us/event/${event.eventSlug}`
  };
}

async function fetchMoneylineEvent(row) {
  for (const eventSlug of eventSlugCandidates(row)) {
    const event = await gammaEvent(eventSlug);
    if (event) return { eventSlug, event };
  }
  return null;
}

async function gammaEvent(eventSlug) {
  const url = new URL(`${GAMMA_BASE}/events`);
  url.searchParams.set("slug", eventSlug);
  const body = await publicJson(url.toString());
  const events = Array.isArray(body) ? body : body?.data || [];
  return events.find((event) => event.slug === eventSlug) || events[0] || null;
}

function moneylineMarket(event, row) {
  const homeName = normalizeTeam(row.home_team_name);
  const awayName = normalizeTeam(row.away_team_name);
  for (const market of event.markets || []) {
    if (String(market.sportsMarketType || "").toLowerCase() !== "moneyline") continue;
    const outcomes = parseJsonArray(market.outcomes);
    const tokenIds = parseJsonArray(market.clobTokenIds);
    let homeTokenId = "";
    let awayTokenId = "";
    for (let index = 0; index < outcomes.length; index += 1) {
      const outcome = normalizeTeam(outcomes[index]);
      if (outcome === homeName) homeTokenId = tokenIds[index] || "";
      if (outcome === awayName) awayTokenId = tokenIds[index] || "";
    }
    if (homeTokenId && awayTokenId) {
      return {
        marketSlug: market.slug || "",
        marketId: market.id || market.conditionId || "",
        homeTokenId,
        awayTokenId
      };
    }
  }
  return null;
}

async function nearestHistoricalPrice(tokenId, target) {
  if (!tokenId) return null;
  for (const windowMinutes of [15, 60, 180, 720, 1440]) {
    const startTs = Math.floor((target.getTime() - windowMinutes * 60_000) / 1000);
    const endTs = Math.floor(target.getTime() / 1000);
    const url = new URL(`${CLOB_BASE}/prices-history`);
    url.searchParams.set("market", tokenId);
    url.searchParams.set("startTs", String(startTs));
    url.searchParams.set("endTs", String(endTs));
    url.searchParams.set("interval", "1m");
    url.searchParams.set("fidelity", "10");
    const body = await publicJson(url.toString());
    const targetSeconds = Math.floor(target.getTime() / 1000);
    const points = (Array.isArray(body.history) ? body.history : [])
      .map((point) => ({ t: Number(point.t), price: Number(point.p) }))
      .filter((point) => Number.isFinite(point.t) && point.t <= targetSeconds && Number.isFinite(point.price));
    if (points.length) return points.sort((a, b) => b.t - a.t)[0];
  }
  return null;
}

function eventSlugCandidates(row) {
  const away = asArray(POLYMARKET_TEAM_ABBR[normalizeTeam(row.away_team_name)]);
  const home = asArray(POLYMARKET_TEAM_ABBR[normalizeTeam(row.home_team_name)]);
  const slugs = [];
  for (const awayAbbr of away) for (const homeAbbr of home) slugs.push(`mlb-${awayAbbr}-${homeAbbr}-${row.date}`);
  return slugs;
}

async function publicJson(url) {
  let response;
  let text = "";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    response = await fetch(url, { headers: { accept: "application/json" } });
    text = await response.text();
    if (response.status !== 429) break;
    await sleep(Math.min(10_000, 1000 * attempt * attempt));
  }
  if (!response.ok) throw new Error(`${url} failed ${response.status}: ${text.slice(0, 180)}`);
  return text ? JSON.parse(text) : {};
}

function isBlankMarketRow(row) {
  return !isFilledPrice(row.home_yes_bid) || !isFilledPrice(row.away_yes_bid);
}

function isFilledPrice(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return Number.isFinite(Number(text));
}

function parseCsv(text) {
  const parsedRows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((item) => item !== "")) parsedRows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    parsedRows.push(row);
  }
  const [headers = [], ...body] = parsedRows;
  return body.map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] ?? ""])));
}

async function writeCsv(filePath, columns, rows) {
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column] ?? "")).join(","))].join("\n") + "\n";
  await fs.writeFile(filePath, csv);
}

async function backupExistingFiles() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.mkdir(path.join(DATA_DIR, "backups"), { recursive: true });
  for (const filePath of [LEDGER_PATH, MISSING_PATH]) {
    try {
      await fs.copyFile(filePath, path.join(DATA_DIR, "backups", `${path.basename(filePath)}.${stamp}.bak`));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseArgs(args) {
  return Object.fromEntries(args.map((arg) => {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }).filter(([key]) => key));
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTeam(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatPrice(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function latestCompletedResultDate(now) {
  const eastern = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  return addDays(eastern, -1);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateRange(start, end) {
  const dates = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const POLYMARKET_TEAM_ABBR = {
  "arizona diamondbacks": "ari",
  "athletics": ["oak", "ath"],
  "atlanta braves": "atl",
  "baltimore orioles": "bal",
  "boston red sox": "bos",
  "chicago cubs": "chc",
  "chicago white sox": "cws",
  "cincinnati reds": "cin",
  "cleveland guardians": "cle",
  "colorado rockies": "col",
  "detroit tigers": "det",
  "houston astros": "hou",
  "kansas city royals": "kc",
  "los angeles angels": "laa",
  "los angeles dodgers": "lad",
  "miami marlins": "mia",
  "milwaukee brewers": "mil",
  "minnesota twins": "min",
  "new york mets": "nym",
  "new york yankees": "nyy",
  "philadelphia phillies": "phi",
  "pittsburgh pirates": "pit",
  "san diego padres": "sd",
  "san francisco giants": "sf",
  "seattle mariners": "sea",
  "st louis cardinals": "stl",
  "st. louis cardinals": "stl",
  "tampa bay rays": "tb",
  "texas rangers": "tex",
  "toronto blue jays": "tor",
  "washington nationals": "wsh"
};

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
