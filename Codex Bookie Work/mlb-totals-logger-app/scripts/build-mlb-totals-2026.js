import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(APP_DIR, "data");
const LEDGER_PATH = path.join(DATA_DIR, "mlb_2026_totals_3am_game_line_ledger.csv");
const SUMMARY_PATH = path.join(DATA_DIR, "mlb_2026_totals_3am_bucket_ev_summary.csv");
const MISSING_PATH = path.join(DATA_DIR, "mlb_2026_totals_3am_missing.csv");

loadLocalEnv();

const MLB_BASE = process.env.MLB_BASE || "https://statsapi.mlb.com";
const GAMMA_BASE = process.env.POLYMARKET_GAMMA_BASE || "https://gamma-api.polymarket.com";
const CLOB_BASE = process.env.POLYMARKET_CLOB_BASE || "https://clob.polymarket.com";
const FIRST_2026_DATE = "2026-03-26";
const TARGET_LINES = new Set([7.5, 8.5, 9.5]);

const LEDGER_COLUMNS = [
  "date",
  "game_pk",
  "game_number",
  "sport",
  "market",
  "match",
  "away_team_name",
  "home_team_name",
  "total_line",
  "over_price",
  "under_price",
  "final_total_runs",
  "result",
  "paired_bucket",
  "paired_winning_side",
  "paired_over_bucket_plus_or_minus",
  "paired_under_bucket_plus_or_minus",
  "source_pull_time",
  "polymarket_event_slug",
  "polymarket_market_slug",
  "polymarket_market_id",
  "over_token_id",
  "under_token_id",
  "polymarket_event_url"
];

const SUMMARY_COLUMNS = [
  "total_line",
  "paired_bucket",
  "edge_side",
  "games",
  "wins",
  "losses",
  "win_rate_pct",
  "avg_price",
  "ev_pct",
  "over_wins",
  "under_wins",
  "avg_over_price",
  "avg_under_price",
  "over_ev_pct",
  "under_ev_pct"
];

const MISSING_COLUMNS = [
  "date",
  "game_pk",
  "game_number",
  "match",
  "total_line",
  "reason",
  "polymarket_event_slug",
  "polymarket_market_slug"
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["from-existing"]) {
    await rebuildFromExistingLedger();
    return;
  }

  const startDate = args.start || FIRST_2026_DATE;
  const endDate = args.end || latestCompletedResultDate(new Date());
  const rows = [];
  const missing = [];

  if (startDate > endDate) throw new Error(`Start date ${startDate} is after end date ${endDate}.`);

  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`Building MLB 2026 totals 3am ET dataset: ${startDate} through ${endDate}`);

  for (const date of dateRange(startDate, endDate)) {
    const games = await fetchMlbGames(date);
    let addedForDate = 0;
    for (const game of games) {
      if (!game.isFinal) {
        missing.push(missingRow(game, "", "MLB game is not final yet.", "", ""));
        continue;
      }
      if (!Number.isFinite(game.finalTotalRuns)) {
        missing.push(missingRow(game, "", "Could not read final total runs from MLB schedule.", "", ""));
        continue;
      }

      const event = await fetchTotalsEvent(game).catch((error) => ({ error: error.message || String(error) }));
      if (!event || event.error) {
        missing.push(missingRow(game, "", event?.error || "No matching Polymarket MLB event found.", "", ""));
        continue;
      }

      const target = etDateTimeToUtc(game.date, "03:00");
      const markets = totalsMarkets(event.event, game, target);
      if (!markets.length) {
        missing.push(missingRow(game, "", "No eligible 7.5/8.5/9.5 totals market existed by 3am ET.", event.eventSlug, ""));
        continue;
      }

      for (const market of markets) {
        const prices = await fetch3amOverUnderPrices(market, game.date).catch((error) => ({ error: error.message || String(error) }));
        if (!prices || prices.error) {
          missing.push(missingRow(game, market.line, prices?.error || "No 3am historical Over/Under price found.", event.eventSlug, market.marketSlug));
          continue;
        }

        const result = game.finalTotalRuns > market.line ? "Over" : "Under";
        const paired = pairedOutcome(prices.over.price * 100, result);
        rows.push({
          date: game.date,
          game_pk: game.gamePk,
          game_number: game.gameNumber,
          sport: "MLB",
          market: "Game Total O/U",
          match: `${game.awayTeam} @ ${game.homeTeam}`,
          away_team_name: game.awayTeam,
          home_team_name: game.homeTeam,
          total_line: String(market.line),
          over_price: formatPrice(prices.over.price * 100),
          under_price: formatPrice(prices.under.price * 100),
          final_total_runs: String(game.finalTotalRuns),
          result,
          paired_bucket: paired.pairedBucket,
          paired_winning_side: paired.winningSide,
          paired_over_bucket_plus_or_minus: paired.overPlusMinus,
          paired_under_bucket_plus_or_minus: paired.underPlusMinus,
          source_pull_time: `03:00 ET history nearest over=${new Date(prices.over.t * 1000).toISOString()} under=${new Date(prices.under.t * 1000).toISOString()}`,
          polymarket_event_slug: event.eventSlug,
          polymarket_market_slug: market.marketSlug,
          polymarket_market_id: market.marketId,
          over_token_id: market.overTokenId,
          under_token_id: market.underTokenId,
          polymarket_event_url: `https://polymarket.us/event/${event.eventSlug}`
        });
        addedForDate += 1;
      }
    }
    console.log(`${date}: ${addedForDate} total-line rows added`);
  }

  rows.sort((a, b) => `${a.date} ${a.match} ${a.total_line}`.localeCompare(`${b.date} ${b.match} ${b.total_line}`));
  missing.sort((a, b) => `${a.date} ${a.match} ${a.total_line}`.localeCompare(`${b.date} ${b.match} ${b.total_line}`));
  const summary = summarizeBuckets(rows);
  await writeCsv(LEDGER_PATH, LEDGER_COLUMNS, rows);
  await writeCsv(SUMMARY_PATH, SUMMARY_COLUMNS, summary);
  await writeCsv(MISSING_PATH, MISSING_COLUMNS, missing);

  console.log(`Done. Ledger rows: ${rows.length}. Missing audit rows: ${missing.length}. Summary buckets: ${summary.length}.`);
  console.log(`Wrote ${LEDGER_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
  console.log(`Wrote ${MISSING_PATH}`);
}

async function rebuildFromExistingLedger() {
  const rows = parseCsv(await fs.readFile(LEDGER_PATH, "utf8")).map((row) => {
    const paired = pairedOutcome(Number(row.over_price), row.result);
    return {
      ...row,
      paired_bucket: paired.pairedBucket,
      paired_winning_side: paired.winningSide,
      paired_over_bucket_plus_or_minus: paired.overPlusMinus,
      paired_under_bucket_plus_or_minus: paired.underPlusMinus
    };
  });
  await writeCsv(LEDGER_PATH, LEDGER_COLUMNS, rows);
  await writeCsv(SUMMARY_PATH, SUMMARY_COLUMNS, summarizeBuckets(rows));
  console.log(`Rebuilt paired total marks from existing ledger. Ledger rows: ${rows.length}.`);
}

async function fetchMlbGames(date) {
  const body = await publicJson(`${MLB_BASE}/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`);
  return (body.dates || []).flatMap((day) => day.games || []).map((game) => {
    const away = game.teams?.away;
    const home = game.teams?.home;
    const awayScore = Number(away?.score);
    const homeScore = Number(home?.score);
    return {
      gamePk: game.gamePk,
      gameNumber: game.gameNumber || "",
      date: game.officialDate || date,
      isFinal: game.status?.statusCode === "F" && game.status?.detailedState === "Final",
      awayTeam: away?.team?.name || "",
      homeTeam: home?.team?.name || "",
      finalTotalRuns: Number.isFinite(awayScore) && Number.isFinite(homeScore) ? awayScore + homeScore : NaN
    };
  }).filter((game) => game.date === date && game.gamePk && game.awayTeam && game.homeTeam);
}

async function fetchTotalsEvent(game) {
  for (const eventSlug of eventSlugCandidates(game)) {
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

function totalsMarkets(event, game, target) {
  return (event.markets || []).filter((market) => {
    if (String(market.sportsMarketType || "").toLowerCase() !== "totals") return false;
    const line = Number(market.line);
    if (!TARGET_LINES.has(line)) return false;
    if (new Date(market.startDate || market.createdAt || 0) > target) return false;
    const normalizedQuestion = normalizeTeam(market.question || "");
    if (!normalizedQuestion.includes(normalizeTeam(game.awayTeam)) || !normalizedQuestion.includes(normalizeTeam(game.homeTeam))) return false;
    const tokens = overUnderTokens(market);
    return Boolean(tokens.overTokenId && tokens.underTokenId);
  }).map((market) => {
    const tokens = overUnderTokens(market);
    return {
      line: Number(market.line),
      marketSlug: market.slug || "",
      marketId: market.id || market.conditionId || "",
      overTokenId: tokens.overTokenId,
      underTokenId: tokens.underTokenId
    };
  }).sort((a, b) => a.line - b.line);
}

function overUnderTokens(market) {
  const outcomes = parseJsonArray(market.outcomes);
  const tokenIds = parseJsonArray(market.clobTokenIds);
  const tokens = {};
  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = String(outcomes[index] || "").toLowerCase();
    if (outcome === "over") tokens.overTokenId = tokenIds[index] || "";
    if (outcome === "under") tokens.underTokenId = tokenIds[index] || "";
  }
  return tokens;
}

async function fetch3amOverUnderPrices(market, date) {
  const target = etDateTimeToUtc(date, "03:00");
  const [over, under] = await Promise.all([
    nearestHistoricalPrice(market.overTokenId, target),
    nearestHistoricalPrice(market.underTokenId, target)
  ]);
  if (!over || !under) throw new Error("No historical price around 3am for one or both Over/Under tokens.");
  return { over, under };
}

async function nearestHistoricalPrice(tokenId, target) {
  for (const windowMinutes of [15, 60, 180, 720]) {
    const startTs = Math.floor((target.getTime() - windowMinutes * 60_000) / 1000);
    const endTs = Math.floor((target.getTime() + windowMinutes * 60_000) / 1000);
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
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price));
    if (points.length) return points.sort((a, b) => Math.abs(a.t - targetSeconds) - Math.abs(b.t - targetSeconds))[0];
  }
  return null;
}

function summarizeBuckets(rows) {
  const groups = new Map();
  for (const row of rows) addPairedBucket(groups, row);
  return [...groups.values()].map((group) => {
    const overWinRate = group.overWins / group.games;
    const underWins = group.games - group.overWins;
    const underWinRate = underWins / group.games;
    const avgOverPrice = group.overPriceSum / group.games;
    const avgUnderPrice = group.underPriceSum / group.games;
    const overEvPct = evPct(overWinRate, avgOverPrice);
    const underEvPct = evPct(underWinRate, avgUnderPrice);
    const edgeSide = overEvPct >= underEvPct ? "Over" : "Under";
    const wins = edgeSide === "Over" ? group.overWins : underWins;
    const avgPrice = edgeSide === "Over" ? avgOverPrice : avgUnderPrice;
    const edgeEvPct = edgeSide === "Over" ? overEvPct : underEvPct;
    return {
      total_line: group.line,
      paired_bucket: group.pairedBucket,
      edge_side: edgeSide,
      games: group.games,
      wins,
      losses: group.games - wins,
      win_rate_pct: round((wins / group.games) * 100, 1),
      avg_price: round(avgPrice, 1),
      ev_pct: round(edgeEvPct, 2),
      over_wins: group.overWins,
      under_wins: underWins,
      avg_over_price: round(avgOverPrice, 1),
      avg_under_price: round(avgUnderPrice, 1),
      over_ev_pct: round(overEvPct, 2),
      under_ev_pct: round(underEvPct, 2)
    };
  }).sort((a, b) => Number(a.total_line) - Number(b.total_line) || Number(a.paired_bucket.match(/Over (\d+)-/)?.[1] || 0) - Number(b.paired_bucket.match(/Over (\d+)-/)?.[1] || 0));
}

function addPairedBucket(groups, row) {
  const line = String(row.total_line);
  const paired = pairedOutcome(Number(row.over_price), row.result);
  if (!paired.pairedBucket) return;
  const key = `${line}|${paired.pairedBucket}`;
  if (!groups.has(key)) {
    groups.set(key, { line, pairedBucket: paired.pairedBucket, games: 0, overWins: 0, overPriceSum: 0, underPriceSum: 0 });
  }
  const group = groups.get(key);
  group.games += 1;
  group.overPriceSum += Number(row.over_price);
  group.underPriceSum += Number(row.under_price);
  if (paired.winningSide === "Over") group.overWins += 1;
}

function pairedOutcome(overPrice, result) {
  const overBucket = bucketLabel(Number(overPrice));
  const underBucket = complementBucketLabel(overBucket);
  const winningSide = result === "Over" ? "Over" : result === "Under" ? "Under" : "";
  return {
    overBucket,
    underBucket,
    pairedBucket: overBucket && underBucket ? `Over ${overBucket} / Under ${underBucket}` : "",
    winningSide,
    overPlusMinus: overBucket && winningSide ? `Over ${overBucket} ${winningSide === "Over" ? "+" : "-"}` : "",
    underPlusMinus: underBucket && winningSide ? `Under ${underBucket} ${winningSide === "Under" ? "+" : "-"}` : ""
  };
}

function eventSlugCandidates(game) {
  const away = asArray(POLYMARKET_TEAM_ABBR[normalizeTeam(game.awayTeam)]);
  const home = asArray(POLYMARKET_TEAM_ABBR[normalizeTeam(game.homeTeam)]);
  const slugs = [];
  for (const awayAbbr of away) for (const homeAbbr of home) slugs.push(`mlb-${awayAbbr}-${homeAbbr}-${game.date}`);
  return slugs;
}

async function publicJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} failed ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function missingRow(game, line, reason, eventSlug, marketSlug) {
  return {
    date: game.date,
    game_pk: game.gamePk,
    game_number: game.gameNumber,
    match: `${game.awayTeam} @ ${game.homeTeam}`,
    total_line: line,
    reason,
    polymarket_event_slug: eventSlug,
    polymarket_market_slug: marketSlug
  };
}

function writeCsv(filePath, columns, rows) {
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column] ?? "")).join(","))].join("\n") + "\n";
  return fs.writeFile(filePath, csv);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function parseCsv(text) {
  const rows = [];
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
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body.map((items) => Object.fromEntries(header.map((key, index) => [key, items[index] ?? ""])));
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
  }).filter(([key, value]) => key && value));
}

function loadLocalEnv() {
  const envPath = path.join(APP_DIR, ".env");
  if (!fsSync.existsSync(envPath)) return;
  const text = fsSync.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function bucketLabel(value) {
  if (!Number.isFinite(value)) return "";
  const floor = Math.floor(value / 5) * 5;
  const cappedFloor = Math.max(0, Math.min(95, floor));
  return `${cappedFloor}-${cappedFloor + 5}`;
}

function complementBucketLabel(bucket) {
  const [minText, maxText] = String(bucket || "").split("-");
  const min = Number(minText);
  const max = Number(maxText);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  return `${100 - max}-${100 - min}`;
}

function evPct(winRate, avgPrice) {
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) return 0;
  return ((winRate / (avgPrice / 100)) - 1) * 100;
}

function formatPrice(value) {
  return String(round(value, 1));
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function latestCompletedResultDate(now) {
  return addDays(etDate(now), -1);
}

function etDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function etDateTimeToUtc(date, hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const noonUtc = new Date(`${date}T16:00:00.000Z`);
  const offsetMinutes = getEtOffsetMinutes(noonUtc);
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour, minute) - offsetMinutes * 60_000);
}

function getEtOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return (asUtc - date.getTime()) / 60_000;
}

function dateRange(start, end) {
  const dates = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function addDays(date, days) {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTeam(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
