import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(APP_DIR, "data");
const LEDGER_PATH = path.join(DATA_DIR, "kalshi_mlb_2026_prestart_moneyline_ledger.csv");
const MISSING_PATH = path.join(DATA_DIR, "kalshi_mlb_2026_prestart_moneyline_missing.csv");
const LEDGER_TMP_PATH = `${LEDGER_PATH}.tmp`;
const MISSING_TMP_PATH = `${MISSING_PATH}.tmp`;

const MLB_BASE = process.env.MLB_BASE || "https://statsapi.mlb.com";
const KALSHI_BASE = process.env.KALSHI_BASE || "https://api.elections.kalshi.com";
const KALSHI_HISTORY_BASE = process.env.KALSHI_HISTORY_BASE || "https://external-api.kalshi.com";
const SERIES_TICKER = "KXMLBGAME";
const FIRST_2026_DATE = "2026-03-26";

const TEAM_CODES = new Map([
  ["Arizona Diamondbacks", "AZ"],
  ["Athletics", "ATH"],
  ["Atlanta Braves", "ATL"],
  ["Baltimore Orioles", "BAL"],
  ["Boston Red Sox", "BOS"],
  ["Chicago Cubs", "CHC"],
  ["Chicago White Sox", "CWS"],
  ["Cincinnati Reds", "CIN"],
  ["Cleveland Guardians", "CLE"],
  ["Colorado Rockies", "COL"],
  ["Detroit Tigers", "DET"],
  ["Houston Astros", "HOU"],
  ["Kansas City Royals", "KC"],
  ["Los Angeles Angels", "LAA"],
  ["Los Angeles Dodgers", "LAD"],
  ["Miami Marlins", "MIA"],
  ["Milwaukee Brewers", "MIL"],
  ["Minnesota Twins", "MIN"],
  ["New York Mets", "NYM"],
  ["New York Yankees", "NYY"],
  ["Philadelphia Phillies", "PHI"],
  ["Pittsburgh Pirates", "PIT"],
  ["San Diego Padres", "SD"],
  ["Seattle Mariners", "SEA"],
  ["San Francisco Giants", "SF"],
  ["St. Louis Cardinals", "STL"],
  ["Tampa Bay Rays", "TB"],
  ["Texas Rangers", "TEX"],
  ["Toronto Blue Jays", "TOR"],
  ["Washington Nationals", "WSH"]
]);

const LEDGER_COLUMNS = [
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
  "missing_reason"
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
  const startDate = args.start || FIRST_2026_DATE;
  const endDate = args.end || latestCompletedResultDate(new Date());
  const maxGames = Number(args.limit || Infinity);
  const rows = [];
  const missing = [];

  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`Building Kalshi MLB prestart moneyline probe: ${startDate} through ${endDate}`);

  let seenGames = 0;
  for (const date of dateRange(startDate, endDate)) {
    const games = await fetchMlbGames(date);
    for (const game of games) {
      if (seenGames >= maxGames) break;
      seenGames += 1;

      if (!game.isFinal) {
        addMissing(rows, missing, game, "MLB game is not final yet.", "");
        continue;
      }

      const eventTicker = kalshiEventTicker(game);
      if (!eventTicker) {
        addMissing(rows, missing, game, "No Kalshi team-code mapping for this matchup.", "");
        continue;
      }

      const event = await fetchKalshiEvent(eventTicker).catch((error) => ({ error: error.message || String(error) }));
      if (!event || event.error) {
        addMissing(rows, missing, game, event?.error || "No matching Kalshi event found.", eventTicker);
        continue;
      }

      const markets = marketsForGame(event.markets || [], game);
      if (!markets.home || !markets.away) {
        addMissing(rows, missing, game, "Could not identify both home and away Kalshi moneyline markets.", eventTicker, markets);
        continue;
      }

      const targetTs = Math.floor(new Date(game.scheduledStartUtc).getTime() / 1000) - 60;
      const homeSnapshot = await prestartBidSnapshot(markets.home.ticker, targetTs).catch((error) => ({ error: error.message || String(error) }));
      await sleep(1400);
      const awaySnapshot = await prestartBidSnapshot(markets.away.ticker, targetTs).catch((error) => ({ error: error.message || String(error) }));
      if (homeSnapshot?.error || awaySnapshot?.error) {
        addMissing(rows, missing, game, `Snapshot failed: home=${homeSnapshot?.error || "ok"} away=${awaySnapshot?.error || "ok"}`, eventTicker, markets);
        continue;
      }

      rows.push({
        ...baseLedgerRow(game),
        snapshot_target_utc: new Date(targetTs * 1000).toISOString(),
        snapshot_source: "Kalshi 1-minute candlestick yes_bid close, last candle <= scheduled start minus 60 seconds",
        home_yes_bid: formatPrice(homeSnapshot.price * 100),
        away_yes_bid: formatPrice(awaySnapshot.price * 100),
        home_snapshot_time_utc: new Date(homeSnapshot.ts * 1000).toISOString(),
        away_snapshot_time_utc: new Date(awaySnapshot.ts * 1000).toISOString(),
        home_snapshot_stale_seconds: String(targetTs - homeSnapshot.ts),
        away_snapshot_stale_seconds: String(targetTs - awaySnapshot.ts),
        kalshi_event_ticker: eventTicker,
        kalshi_home_market_ticker: markets.home.ticker,
        kalshi_away_market_ticker: markets.away.ticker,
        data_status: "filled",
        missing_reason: ""
      });
    }
    if (seenGames >= maxGames) break;
    console.log(`${date}: ${rows.length} rows, ${missing.length} missing so far`);
  }

  rows.sort((a, b) => `${a.date} ${a.match}`.localeCompare(`${b.date} ${b.match}`));
  missing.sort((a, b) => `${a.date} ${a.match}`.localeCompare(`${b.date} ${b.match}`));
  await writeCsv(LEDGER_TMP_PATH, LEDGER_COLUMNS, rows);
  await writeCsv(MISSING_TMP_PATH, MISSING_COLUMNS, missing);
  await fs.rename(LEDGER_TMP_PATH, LEDGER_PATH);
  await fs.rename(MISSING_TMP_PATH, MISSING_PATH);
  console.log(`Done. Ledger rows: ${rows.length}. Missing rows: ${missing.length}.`);
  console.log(`Wrote ${LEDGER_PATH}`);
  console.log(`Wrote ${MISSING_PATH}`);
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
      isFinal: game.status?.statusCode === "F" && game.status?.detailedState === "Final",
      awayTeam: away?.team?.name || "",
      homeTeam: home?.team?.name || "",
      winner
    };
  }).filter((game) => game.date === date && game.gamePk && game.awayTeam && game.homeTeam && game.scheduledStartUtc);
}

function kalshiEventTicker(game) {
  const away = TEAM_CODES.get(game.awayTeam);
  const home = TEAM_CODES.get(game.homeTeam);
  if (!away || !home) return "";
  const start = new Date(game.scheduledStartUtc);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(start).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const month = String(parts.month || "").toUpperCase();
  const day = String(parts.day || "").padStart(2, "0");
  const hour = String(parts.hour || "").padStart(2, "0");
  const minute = String(parts.minute || "").padStart(2, "0");
  return `${SERIES_TICKER}-${parts.year}${month}${day}${hour}${minute}${away}${home}`;
}

async function fetchKalshiEvent(eventTicker) {
  const body = await publicJson(`${KALSHI_BASE}/trade-api/v2/events/${encodeURIComponent(eventTicker)}`);
  if (body.error) throw new Error(body.error.message || "Kalshi event error");
  return body;
}

function marketsForGame(markets, game) {
  const awayCode = TEAM_CODES.get(game.awayTeam);
  const homeCode = TEAM_CODES.get(game.homeTeam);
  const found = {};
  for (const market of markets) {
    if (market.ticker?.endsWith(`-${homeCode}`)) found.home = market;
    if (market.ticker?.endsWith(`-${awayCode}`)) found.away = market;
  }
  return found;
}

async function prestartBidSnapshot(marketTicker, targetTs) {
  const url = new URL(`${KALSHI_HISTORY_BASE}/trade-api/v2/series/${SERIES_TICKER}/markets/${marketTicker}/candlesticks`);
  url.searchParams.set("start_ts", String(targetTs - 30 * 60));
  url.searchParams.set("end_ts", String(targetTs));
  url.searchParams.set("period_interval", "1");
  url.searchParams.set("include_latest_before_start", "true");
  const body = await publicJson(url.toString());
  const candles = body.candlesticks || [];
  for (const candle of candles.slice().reverse()) {
    const ts = Number(candle.end_period_ts);
    const price = Number(candle.yes_bid?.close_dollars);
    if (Number.isFinite(ts) && ts <= targetTs && Number.isFinite(price) && price > 0 && price < 1) {
      return { ts, price };
    }
  }
  throw new Error("No yes_bid candle before scheduled start minus 60 seconds.");
}

async function publicJson(url) {
  let response;
  let text = "";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "codex-kalshi-mlb-prestart-dataset/1.0"
      }
    });
    text = await response.text();
    if (response.status !== 429) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : Math.min(12_000, 1500 * attempt * attempt);
    await sleep(waitMs);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON from ${url}: ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.message || `HTTP ${response.status}`);
  }
  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function latestCompletedResultDate(now) {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return dateOnly(et);
}

function* dateRange(start, end) {
  let cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cursor <= stop) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function dateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) parsed[match[1]] = match[2] ?? true;
  }
  return parsed;
}

function missingRow(game, reason, eventTicker) {
  return {
    date: game.date,
    game_pk: game.gamePk,
    match: `${game.awayTeam} @ ${game.homeTeam}`,
    scheduled_start_utc: game.scheduledStartUtc,
    reason,
    kalshi_event_ticker: eventTicker
  };
}

function addMissing(rows, missing, game, reason, eventTicker, markets = {}) {
  rows.push(blankLedgerRow(game, reason, eventTicker, markets));
  missing.push(missingRow(game, reason, eventTicker));
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
    missing_reason: ""
  };
}

function blankLedgerRow(game, reason, eventTicker, markets = {}) {
  return {
    ...baseLedgerRow(game),
    kalshi_event_ticker: eventTicker,
    kalshi_home_market_ticker: markets.home?.ticker || "",
    kalshi_away_market_ticker: markets.away?.ticker || "",
    data_status: "missing",
    missing_reason: reason
  };
}

async function writeCsv(filePath, columns, rows) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column] ?? "")).join(","));
  }
  await fs.writeFile(filePath, `${lines.join("\n")}\n`);
}

function csvCell(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}

function formatPrice(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
