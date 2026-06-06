import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(APP_DIR, "data");
export const LEDGER_PATH = path.join(DATA_DIR, "mlb_2026_totals_prestart_game_line_ledger.csv");
export const MISSING_PATH = path.join(DATA_DIR, "mlb_2026_totals_prestart_missing.csv");
export const UPDATE_LOG_PATH = path.join(DATA_DIR, "totals-prestart-update-log.json");

loadLocalEnv();

const execFileAsync = promisify(execFile);
const MIN_MAIN_GAMES = 50;
const MIN_TOTALS_GAME_SHARE = 0.25;

export async function csvLedgerText() {
  return fs.readFile(LEDGER_PATH, "utf8");
}

export async function readLedger() {
  const text = await fs.readFile(LEDGER_PATH, "utf8");
  return parseCsv(text).map((row) => ({
    ...row,
    total_line: Number(row.total_line),
    over_price: Number(row.over_price),
    under_price: Number(row.under_price),
    final_total_runs: Number(row.final_total_runs)
  })).filter((row) => Number.isFinite(row.total_line) && Number.isFinite(row.over_price) && Number.isFinite(row.under_price));
}

export async function report() {
  const rows = await readLedger();
  const missingRows = await readMissingRows();
  const filledGameCount = countUniqueGames(rows);
  const coveredGameCount = countUniqueGames([...rows, ...missingRows]);
  const minTotalsGames = Math.max(MIN_MAIN_GAMES, Math.ceil(coveredGameCount * MIN_TOTALS_GAME_SHARE));
  const latestPullDate = rows.reduce((max, row) => row.date > max ? row.date : max, "");
  const weeklyCutoff = latestPullDate ? addDays(latestPullDate, -7) : "";
  const monthlyCutoff = latestPullDate ? addDays(latestPullDate, -30) : "";

  const pairBuckets = enrichBuckets(pairEdgeSummary(rows), rows, weeklyCutoff, monthlyCutoff, coveredGameCount, pairEdgeSummary)
    .filter((bucket) => bucket.games >= minTotalsGames)
    .sort(compareOpportunityBuckets)
    .slice(0, 24);
  const scoreTruth = scoreTruthThresholdSummary(rows);

  return {
    title: "MLB",
    subtitle: "Totals Game Start Snapshot",
    latestPullDate,
    totalRows: rows.length,
    lineRows: rows.length,
    filledGames: filledGameCount,
    uniqueGames: coveredGameCount,
    assignedRows: coveredGameCount,
    settledRows: coveredGameCount,
    minPromotedGames: minTotalsGames,
    minPromotedGameShare: MIN_TOTALS_GAME_SHARE,
    missingRows: missingRows.length,
    buckets: pairBuckets,
    thresholdBuckets: scoreTruth.thresholds,
    analysis: {
      ...analysisSummary(pairBuckets),
      opportunities: scoreTruth.opportunities,
      scoreTruth: scoreTruth.summary
    },
    pairedAudit: pairedAuditSummary(pairSummary(rows), coveredGameCount),
    updateLog: await readUpdateLog()
  };
}

function countUniqueGames(rows) {
  return new Set(rows.map((row) => String(row.game_pk || "")).filter(Boolean)).size;
}

function scoreTruthThresholdSummary(rows) {
  const games = uniqueSettledGames(rows);
  const totalGames = games.length;
  const thresholds = [];
  if (!totalGames) {
    return {
      summary: { method: "MLB final-score total runs", games: 0, minEdgeCents: 3 },
      thresholds,
      opportunities: []
    };
  }

  for (let threshold = 3.5; threshold <= 15.5; threshold += 1) {
    const overWins = games.filter((game) => game.totalRuns > threshold).length;
    const underWins = totalGames - overWins;
    thresholds.push(scoreTruthSideRecord({ side: "Over", threshold, wins: overWins, losses: underWins, totalGames }));
    thresholds.push(scoreTruthSideRecord({ side: "Under", threshold, wins: underWins, losses: overWins, totalGames }));
  }

  return {
    summary: {
      method: "MLB final-score total runs",
      games: totalGames,
      minEdgeCents: 3,
      note: "Every settled game counts for every total threshold; Polymarket is only used later for live price matching."
    },
    thresholds,
    opportunities: thresholds
      .filter((item) => item.line >= 6.5 && item.line <= 11.5 && item.maxPrice >= 5 && item.maxPrice <= 95)
      .sort((a, b) => b.evPct - a.evPct || b.games - a.games || a.line - b.line)
      .slice(0, 18)
  };
}

function uniqueSettledGames(rows) {
  const byGame = new Map();
  for (const row of rows) {
    const gamePk = String(row.game_pk || "").trim();
    const totalRuns = Number(row.final_total_runs);
    if (!gamePk || !Number.isFinite(totalRuns)) continue;
    if (!byGame.has(gamePk)) {
      byGame.set(gamePk, {
        gamePk,
        date: row.date,
        awayTeamName: row.away_team_name,
        homeTeamName: row.home_team_name,
        totalRuns
      });
    }
  }
  return [...byGame.values()];
}

function scoreTruthSideRecord({ side, threshold, wins, losses, totalGames }) {
  const fairCents = wins / totalGames * 100;
  const maxPrice = Math.max(0, fairCents - 3);
  return {
    key: `score-truth|${side}|${threshold}`,
    label: `${side} ${threshold} fair ${roundOne(fairCents)}c`,
    displayLabel: `${side} ${threshold} <= ${roundOne(maxPrice)}c`,
    sourceModel: "score-truth",
    line: threshold,
    totalLine: threshold,
    side,
    maxPrice: roundOne(maxPrice),
    fairCents: roundOne(fairCents),
    games: totalGames,
    totalGames,
    gamesLabel: `${totalGames}/${totalGames}`,
    wins,
    losses,
    record: `${wins}-${losses}`,
    winRatePct: fairCents,
    avgPrice: roundOne(maxPrice),
    evPct: evPct(wins / totalGames, maxPrice),
    winsOverBreakEven: roundOne(wins - (maxPrice / 100 * totalGames)),
    pattern: "score truth: MLB final-score baseline, live price must be below max entry"
  };
}

export async function getData(now = new Date()) {
  const startedAt = now.toISOString();
  const rowsBefore = await safeReadLedgerCount();
  const scriptPath = path.join(APP_DIR, "scripts", "build-mlb-totals-prestart-2026.js");
  const { stdout, stderr } = await execFileAsync("node", [scriptPath], {
    cwd: APP_DIR,
    timeout: 8 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024
  });
  const rowsAfter = await safeReadLedgerCount();
  const result = {
    ranAt: startedAt,
    status: "completed",
    message: lastMeaningfulLine(stdout) || "MLB totals game-start snapshot data rebuilt.",
    rowsBefore,
    rowsAfter,
    rowsAdded: Math.max(0, rowsAfter - rowsBefore),
    missingRows: await readMissingCount(),
    stdout,
    stderr
  };
  await appendUpdateLog(result);
  return result;
}

function enrichBuckets(seasonBuckets, rows, weeklyCutoff, monthlyCutoff, totalGames, summarize) {
  const weeklyByKey = new Map(summarize(rows.filter((row) => row.date > weeklyCutoff)).map((bucket) => [bucket.key, bucket]));
  const monthlyByKey = new Map(summarize(rows.filter((row) => row.date > monthlyCutoff)).map((bucket) => [bucket.key, bucket]));
  return seasonBuckets.map((bucket) => {
    const weekly = weeklyByKey.get(bucket.key);
    const monthly = monthlyByKey.get(bucket.key);
    const full = {
      ...bucket,
      weeklyEvDeltaPct: weekly?.evPct || 0,
      monthlyEvDeltaPct: monthly?.evPct || 0,
      weeklyGames: weekly?.games || 0,
      monthlyGames: monthly?.games || 0,
      totalGames,
      gamesLabel: `${bucket.games}/${totalGames}`
    };
    full.opportunityScore = opportunityScore(full, totalGames);
    full.statisticalEdge = statisticalEdge(full);
    full.liveStatus = liveStatus(full);
    return full;
  });
}

function pairSummary(rows) {
  const groups = new Map();
  for (const row of rows) {
    const overBucket = centsBucket(row.over_price);
    const underBucket = centsBucket(row.under_price);
    if (!overBucket || !underBucket) continue;
    const key = `${row.total_line}|${overBucket}|${underBucket}`;
    if (!groups.has(key)) groups.set(key, { key, totalLine: row.total_line, overBucket, underBucket, games: 0, overWins: 0, overSum: 0, underSum: 0 });
    const group = groups.get(key);
    group.games += 1;
    group.overWins += row.result === "Over" ? 1 : 0;
    group.overSum += row.over_price;
    group.underSum += row.under_price;
  }
  return [...groups.values()].map((group) => {
    const underWins = group.games - group.overWins;
    return {
      key: group.key,
      totalLine: group.totalLine,
      overBucket: group.overBucket,
      underBucket: group.underBucket,
      games: group.games,
      overWins: group.overWins,
      underWins,
      overAvgPrice: group.overSum / group.games,
      underAvgPrice: group.underSum / group.games,
      overEvPct: evPct(group.overWins / group.games, group.overSum / group.games),
      underEvPct: evPct(underWins / group.games, group.underSum / group.games)
    };
  });
}

function pairEdgeSummary(rows) {
  return pairSummary(rows).map((group) => {
    const edgeSide = group.overEvPct >= group.underEvPct ? "Over" : "Under";
    const wins = edgeSide === "Over" ? group.overWins : group.underWins;
    const losses = group.games - wins;
    const avgPrice = edgeSide === "Over" ? group.overAvgPrice : group.underAvgPrice;
    const bucket = edgeSide === "Over" ? group.overBucket : group.underBucket;
    const edgeEvPct = edgeSide === "Over" ? group.overEvPct : group.underEvPct;
    return {
      key: group.key,
      label: `${edgeSide} ${group.totalLine} ${bucket}`,
      displayLabel: `${edgeSide} ${group.totalLine} ${bucket}`,
      pairLabel: `Over ${group.totalLine} ${group.overBucket} / Under ${group.totalLine} ${group.underBucket}`,
      side: edgeSide,
      totalLine: group.totalLine,
      bucket,
      bucketMin: Number(bucket.split("-")[0]),
      games: group.games,
      wins,
      losses,
      winRatePct: wins / group.games * 100,
      avgPrice,
      evPct: edgeEvPct,
      winsOverBreakEven: wins - (group.games * avgPrice / 100),
      overWins: group.overWins,
      underWins: group.underWins,
      overEvPct: group.overEvPct,
      underEvPct: group.underEvPct
    };
  });
}

function pairedAuditSummary(groups, totalRows) {
  return groups.map((group) => ({
    pairLabel: `Over ${group.totalLine} ${group.overBucket} / Under ${group.totalLine} ${group.underBucket}`,
    games: group.games,
    gamesLabel: `${group.games}/${totalRows}`,
    overWins: group.overWins,
    underWins: group.underWins,
    overEvPct: group.overEvPct,
    underEvPct: group.underEvPct
  })).sort((a, b) => b.games - a.games);
}

function analysisSummary(pairBuckets) {
  return {
    opportunities: pairBuckets.filter(isBestCandidate).slice(0, 5),
    pullbacks: pairBuckets.filter((bucket) => bucket.evPct > 0 && bucket.weeklyEvDeltaPct < 0 && bucket.monthlyEvDeltaPct < 0).slice(0, 5),
    thresholds: []
  };
}

function isBestCandidate(bucket) {
  return bucket.evPct > 0
    && bucket.winsOverBreakEven > 0
    && bucket.monthlyEvDeltaPct > 0
    && bucket.weeklyEvDeltaPct > 0;
}

function opportunityScore(bucket, totalGames) {
  const excessWinsScore = bucket.winsOverBreakEven * 2.2;
  const sampleScore = Math.sqrt(bucket.games) * 1.1;
  const seasonScore = Math.max(-25, Math.min(25, bucket.evPct)) * 0.8;
  const statisticalScore = Math.max(-4, Math.min(4, statisticalEdge(bucket))) * 7;
  const monthlyScore = bucket.monthlyEvDeltaPct > 0 ? 14 : bucket.monthlyEvDeltaPct < 0 ? -22 : -4;
  const weeklyScore = bucket.weeklyEvDeltaPct > 0 ? 10 : bucket.weeklyEvDeltaPct < 0 ? -18 : -3;
  const pullbackPenalty = bucket.weeklyEvDeltaPct < 0 && bucket.monthlyEvDeltaPct < 0 ? -35 : 0;
  const negativeSeasonPenalty = bucket.evPct <= 0 ? -45 : 0;
  const sampleShareScore = Math.min(10, (bucket.games / Math.max(1, totalGames)) * 40);
  return excessWinsScore + sampleScore + seasonScore + statisticalScore + monthlyScore + weeklyScore
    + sampleShareScore + pullbackPenalty + negativeSeasonPenalty;
}

function statisticalEdge(bucket) {
  const breakEven = bucket.avgPrice / 100;
  const actual = bucket.wins / bucket.games;
  if (!Number.isFinite(breakEven) || breakEven <= 0 || breakEven >= 1 || bucket.games <= 0) return 0;
  const standardError = Math.sqrt(breakEven * (1 - breakEven) / bucket.games);
  return standardError > 0 ? (actual - breakEven) / standardError : 0;
}

function liveStatus(bucket) {
  if (bucket.evPct <= 0) return "not profitable";
  if (bucket.weeklyEvDeltaPct < 0 && bucket.monthlyEvDeltaPct < 0) return "season edge, current pullback";
  if (bucket.weeklyEvDeltaPct > 0 && bucket.monthlyEvDeltaPct > 0) return "confirmed";
  return "mixed";
}

function compareOpportunityBuckets(a, b) {
  return b.opportunityScore - a.opportunityScore
    || b.evPct - a.evPct
    || b.monthlyEvDeltaPct - a.monthlyEvDeltaPct
    || b.weeklyEvDeltaPct - a.weeklyEvDeltaPct
    || a.bucketMin - b.bucketMin;
}

function centsBucket(value) {
  const cents = Number(value);
  if (!Number.isFinite(cents) || cents < 0 || cents > 100) return "";
  const low = Math.min(95, Math.floor(cents / 5) * 5);
  return `${low}-${low + 5}`;
}

function evPct(winRate, avgOdds) {
  if (!Number.isFinite(winRate) || !Number.isFinite(avgOdds) || avgOdds <= 0) return 0;
  return ((winRate * 100) - avgOdds) / avgOdds * 100;
}

function roundOne(value) {
  return Math.round(Number(value) * 10) / 10;
}

async function safeReadLedgerCount() { try { return (await readLedger()).length; } catch { return 0; } }
async function readMissingRows() {
  try { return parseCsv(await fs.readFile(MISSING_PATH, "utf8")); } catch { return []; }
}
async function readMissingCount() {
  try { return Math.max(0, (await fs.readFile(MISSING_PATH, "utf8")).trim().split(/\r?\n/).length - 1); } catch { return 0; }
}
async function readUpdateLog() { try { return JSON.parse(await fs.readFile(UPDATE_LOG_PATH, "utf8")); } catch { return []; } }
async function appendUpdateLog(entry) {
  const log = await readUpdateLog();
  log.unshift(entry);
  await fs.writeFile(UPDATE_LOG_PATH, JSON.stringify(log.slice(0, 20), null, 2));
}
function lastMeaningfulLine(text) { return text.trim().split(/\r?\n/).reverse().find((line) => line.trim()) || ""; }
function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") { cell += "\""; i += 1; }
      else if (char === "\"") quoted = false;
      else cell += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...body] = rows;
  return body.filter((line) => line.length === headers.length).map((line) => Object.fromEntries(headers.map((h, i) => [h, line[i] ?? ""])));
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
