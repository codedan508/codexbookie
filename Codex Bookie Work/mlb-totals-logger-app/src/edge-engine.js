import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(APP_DIR, "data");
export const LEDGER_PATH = path.join(DATA_DIR, "mlb_2026_totals_3am_game_line_ledger.csv");
export const MISSING_PATH = path.join(DATA_DIR, "mlb_2026_totals_3am_missing.csv");
export const UPDATE_LOG_PATH = path.join(DATA_DIR, "totals-update-log.json");

loadLocalEnv();

const execFileAsync = promisify(execFile);

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

export async function readLedger() {
  const text = await fs.readFile(LEDGER_PATH, "utf8");
  return parseCsv(text).map(normalizeLedgerRow);
}

export async function csvLedgerText() {
  return fs.readFile(LEDGER_PATH, "utf8");
}

export async function report() {
  const rows = await readLedger();
  const latestPullDate = rows.reduce((max, row) => row.date > max ? row.date : max, "");
  const weeklyCutoff = latestPullDate ? addDays(latestPullDate, -7) : "";
  const monthlyCutoff = latestPullDate ? addDays(latestPullDate, -30) : "";
  const allBuckets = pairedBucketSummary(rows);
  const weeklyBuckets = pairedBucketSummary(rows.filter((row) => row.date > weeklyCutoff));
  const monthlyBuckets = pairedBucketSummary(rows.filter((row) => row.date > monthlyCutoff));
  const weeklyByKey = new Map(weeklyBuckets.map((bucket) => [bucket.key, bucket]));
  const monthlyByKey = new Map(monthlyBuckets.map((bucket) => [bucket.key, bucket]));
  const buckets = allBuckets.map((bucket) => {
    const weekly = weeklyByKey.get(bucket.key);
    const monthly = monthlyByKey.get(bucket.key);
    return {
      ...bucket,
      weeklyEvDeltaPct: sideEvFor(bucket.edgeSide, weekly),
      monthlyEvDeltaPct: sideEvFor(bucket.edgeSide, monthly),
      weeklyGames: weekly?.games || 0,
      monthlyGames: monthly?.games || 0
    };
  });
  const visibleBuckets = buckets
    .filter((bucket) => bucket.overBucketMin >= 40 && bucket.overBucketMin < 60)
    .map((bucket) => ({ ...bucket, totalGames: rows.length, gamesLabel: `${bucket.games}/${rows.length}` }))
    .sort(compareBuckets);
  const total = portfolioSummary(visibleBuckets);
  const updateLog = await readUpdateLog();
  const missingRows = await readMissingCount();
  const scoreTruth = scoreTruthThresholdSummary(rows);

  return {
    title: "MLB",
    subtitle: "Game Totals O/U",
    marketKey: "mlb_totals_ou",
    latestPullDate,
    totalRows: rows.length,
    settledRows: rows.length,
    missingRows,
    totalEvPct: total.totalEvPct,
    positiveBucketCount: visibleBuckets.filter((bucket) => bucket.evPct > 0).length,
    buckets: visibleBuckets,
    thresholdBuckets: scoreTruth.thresholds,
    analysis: {
      ...analysisSummary(visibleBuckets, rows.length),
      opportunities: scoreTruth.opportunities,
      scoreTruth: scoreTruth.summary
    },
    pairedAudit: pairedAuditSummary(buckets, rows.length),
    updateLog
  };
}

function scoreTruthThresholdSummary(rows) {
  const games = uniqueSettledGames(rows);
  const totalGames = games.length;
  const thresholds = [];
  const opportunities = [];
  if (!totalGames) {
    return {
      summary: { method: "MLB final-score total runs", games: 0, minEdgeCents: 3 },
      thresholds,
      opportunities
    };
  }

  for (let threshold = 3.5; threshold <= 15.5; threshold += 1) {
    const overWins = games.filter((game) => game.totalRuns > threshold).length;
    const underWins = totalGames - overWins;
    thresholds.push(scoreTruthSideRecord({ side: "Over", threshold, wins: overWins, losses: underWins, totalGames }));
    thresholds.push(scoreTruthSideRecord({ side: "Under", threshold, wins: underWins, losses: overWins, totalGames }));
  }

  const qualified = thresholds
    .filter((item) => item.line >= 6.5 && item.line <= 11.5 && item.maxPrice >= 30 && item.maxPrice <= 95)
    .sort((a, b) => b.evPct - a.evPct || b.games - a.games || a.line - b.line)
    .slice(0, 18);

  return {
    summary: {
      method: "MLB final-score total runs",
      games: totalGames,
      minEdgeCents: 3,
      note: "Every settled game counts for every total threshold; Polymarket is only used later for live price matching."
    },
    thresholds,
    opportunities: qualified
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
  const maxEntryCents = Math.max(0, fairCents - 3);
  return {
    key: `score-truth|${side}|${threshold}`,
    label: `${side} ${threshold} fair ${roundOne(fairCents)}c`,
    displayLabel: `${side} ${threshold} <= ${Math.round(maxEntryCents)}c`,
    sourceModel: "score-truth",
    line: threshold,
    totalLine: threshold,
    side,
    maxPrice: Math.round(maxEntryCents),
    fairCents: roundOne(fairCents),
    games: totalGames,
    totalGames,
    gamesLabel: `${totalGames}/${totalGames}`,
    wins,
    losses,
    record: `${wins}-${losses}`,
    winRatePct: fairCents,
    avgOdds: roundOne(maxEntryCents),
    evPct: evPct(wins / totalGames, maxEntryCents),
    winsOverBreakEven: roundOne(wins - (maxEntryCents / 100 * totalGames)),
    pattern: "score truth: MLB final-score baseline, live price must be below max entry"
  };
}

export async function getData(now = new Date()) {
  const before = await safeReadLedgerCount();
  const startedAt = now.toISOString();
  const scriptPath = path.join(APP_DIR, "scripts", "build-mlb-totals-2026.js");
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: APP_DIR,
    env: process.env,
    maxBuffer: 1024 * 1024 * 8
  });
  const after = await safeReadLedgerCount();
  const missingRows = await readMissingCount();
  const result = {
    ranAt: startedAt,
    status: "completed",
    message: lastMeaningfulLine(stdout) || "MLB totals data rebuilt.",
    rowsBefore: before,
    rowsAfter: after,
    rowsAdded: Math.max(0, after - before),
    missingRows,
    stdout: stdout.trim().split(/\r?\n/).slice(-12).join("\n"),
    stderr: stderr.trim()
  };
  await appendUpdateLog(result);
  return result;
}

function pairedBucketSummary(rows) {
  const groups = new Map();
  for (const row of rows) {
    addPairedBucket(groups, row);
  }

  return [...groups.values()].map((group) => {
    const overWinRate = group.overWins / group.games;
    const underWins = group.games - group.overWins;
    const underWinRate = underWins / group.games;
    const avgOverOdds = group.overOddsSum / group.games;
    const avgUnderOdds = group.underOddsSum / group.games;
    const overEvPct = evPct(overWinRate, avgOverOdds);
    const underEvPct = evPct(underWinRate, avgUnderOdds);
    const edgeSide = overEvPct >= underEvPct ? "Over" : "Under";
    const edgeWins = edgeSide === "Over" ? group.overWins : underWins;
    const edgeLosses = group.games - edgeWins;
    const edgeBucket = edgeSide === "Over" ? group.overBucket : group.underBucket;
    const edgeAvgOdds = edgeSide === "Over" ? avgOverOdds : avgUnderOdds;
    const edgeWinRate = edgeSide === "Over" ? overWinRate : underWinRate;

    return pairedBucketRecord({
      key: group.key,
      totalLine: group.totalLine,
      overBucket: group.overBucket,
      underBucket: group.underBucket,
      games: group.games,
      overWins: group.overWins,
      underWins,
      edgeSide,
      edgeBucket,
      edgeWins,
      edgeLosses,
      edgeWinRate,
      edgeAvgOdds,
      overEvPct,
      underEvPct
    });
  });
}

function addPairedBucket(groups, row) {
  const overOdds = Number(row.over_price);
  const underOdds = Number(row.under_price);
  const paired = pairedFromRow(row);
  if (!paired.overBucket || !paired.underBucket) return;
  const totalLine = String(row.total_line || "");
  const key = `${totalLine}|${paired.overBucket}`;
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      totalLine,
      overBucket: paired.overBucket,
      underBucket: paired.underBucket,
      games: 0,
      overWins: 0,
      overOddsSum: 0,
      underOddsSum: 0
    });
  }
  const group = groups.get(key);
  group.games += 1;
  group.overOddsSum += overOdds;
  group.underOddsSum += underOdds;
  if (paired.winningSide === "Over") group.overWins += 1;
}

function pairedBucketRecord({
  key,
  totalLine,
  overBucket,
  underBucket,
  games,
  overWins,
  underWins,
  edgeSide,
  edgeBucket,
  edgeWins,
  edgeLosses,
  edgeWinRate,
  edgeAvgOdds,
  overEvPct,
  underEvPct
}) {
  const overBucketMin = Number(overBucket.split("-")[0]);
  const underBucketMin = Number(underBucket.split("-")[0]);
  return {
    key,
    label: `Over ${overBucket} / Under ${underBucket}`,
    displayLabel: `${edgeSide} ${totalLine} ${edgeBucket}`,
    totalLine,
    games,
    wins: edgeWins,
    losses: edgeLosses,
    record: `${edgeWins}-${edgeLosses}`,
    side: edgeSide,
    bucket: edgeBucket,
    bucketMin: overBucketMin,
    overBucket,
    underBucket,
    overBucketMin,
    underBucketMin,
    overWins,
    underWins,
    edgeSide,
    overEvPct,
    underEvPct,
    winRatePct: edgeWinRate * 100,
    avgOdds: edgeAvgOdds,
    evPct: edgeSide === "Over" ? overEvPct : underEvPct
  };
}

function compareBuckets(a, b) {
  if (Number(a.totalLine) !== Number(b.totalLine)) return Number(a.totalLine) - Number(b.totalLine);
  if (a.overBucketMin !== b.overBucketMin) return a.overBucketMin - b.overBucketMin;
  if (a.underBucketMin !== b.underBucketMin) return a.underBucketMin - b.underBucketMin;
  return 0;
}

function sideEvFor(side, bucket) {
  if (!bucket) return 0;
  return side === "Over" ? bucket.overEvPct : bucket.underEvPct;
}

function pairedFromRow(row) {
  const pairMatch = String(row.paired_bucket || "").match(/^Over (\d+-\d+) \/ Under (\d+-\d+)$/);
  const fallbackOverBucket = bucketLabel(Number(row.over_price));
  return {
    overBucket: pairMatch?.[1] || fallbackOverBucket,
    underBucket: pairMatch?.[2] || complementBucketLabel(fallbackOverBucket),
    winningSide: row.paired_winning_side || (row.result === "Over" ? "Over" : row.result === "Under" ? "Under" : "")
  };
}

function portfolioSummary(buckets) {
  const qualified = buckets.filter((bucket) => bucket.games >= 50);
  if (!qualified.length) return { totalEvPct: 0 };
  const games = qualified.reduce((sum, bucket) => sum + bucket.games, 0);
  const totalEvPct = qualified.reduce((sum, bucket) => sum + bucket.evPct * bucket.games, 0) / games;
  return { totalEvPct };
}

function analysisSummary(buckets, totalGames) {
  const rankedBuckets = buckets.map((bucket) => {
    const sampleWeight = Math.min(1, bucket.games / 150);
    const trendWeight = trendMultiplier(bucket);
    const confidenceScore = bucket.evPct * sampleWeight * trendWeight;
    return {
      ...bucket,
      sampleWeight,
      trendWeight,
      confidenceScore,
      sampleLabel: sampleLabel(bucket.games),
      pattern: patternForBucket(bucket)
    };
  });

  const opportunities = rankedBuckets
    .filter((bucket) => bucket.evPct > 0 && bucket.games >= 50)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 5)
    .map(analysisCard);

  const riskFlags = rankedBuckets
    .filter((bucket) => bucket.evPct > 0 && bucket.weeklyEvDeltaPct < 0 && bucket.monthlyEvDeltaPct < 0)
    .sort((a, b) => b.evPct - a.evPct)
    .slice(0, 4)
    .map(analysisCard);

  const patterns = rankedBuckets
    .filter((bucket) => bucket.games >= 50 || Math.abs(bucket.weeklyEvDeltaPct) >= 3 || Math.abs(bucket.monthlyEvDeltaPct) >= 6)
    .sort((a, b) => patternPriority(b) - patternPriority(a))
    .slice(0, 6)
    .map(analysisCard);

  return { opportunities, riskFlags, patterns };
}

function pairedAuditSummary(buckets, totalRows) {
  return buckets
    .map((bucket) => ({
      key: bucket.key,
      totalLine: bucket.totalLine,
      overBucket: bucket.overBucket,
      underBucket: bucket.underBucket,
      overBucketMin: bucket.overBucketMin,
      underBucketMin: bucket.underBucketMin,
      pairLabel: `Over ${bucket.totalLine} ${bucket.overBucket} / Under ${bucket.totalLine} ${bucket.underBucket}`,
      games: bucket.games,
      gamesLabel: `${bucket.games}/${totalRows}`,
      overWins: bucket.overWins,
      underWins: bucket.underWins,
      edgeSide: bucket.edgeSide,
      overEvPct: bucket.overEvPct,
      underEvPct: bucket.underEvPct
    }))
    .sort(compareBuckets);
}

function analysisCard(bucket) {
  return {
    label: bucket.label,
    displayLabel: bucket.displayLabel,
    games: bucket.games,
    totalGames: bucket.totalGames,
    gamesLabel: bucket.gamesLabel || `${bucket.games}/${bucket.totalGames || bucket.games}`,
    record: bucket.record,
    edgeSide: bucket.edgeSide,
    overEvPct: bucket.overEvPct,
    underEvPct: bucket.underEvPct,
    winRatePct: bucket.winRatePct,
    evPct: bucket.evPct,
    weeklyEvDeltaPct: bucket.weeklyEvDeltaPct,
    monthlyEvDeltaPct: bucket.monthlyEvDeltaPct,
    confidenceScore: bucket.confidenceScore,
    sampleLabel: bucket.sampleLabel,
    pattern: bucket.pattern
  };
}

function trendMultiplier(bucket) {
  if (bucket.weeklyEvDeltaPct > 0 && bucket.monthlyEvDeltaPct > 0) return 1.12;
  if (bucket.weeklyEvDeltaPct > 0 && bucket.monthlyEvDeltaPct < 0) return 1.04;
  if (bucket.weeklyEvDeltaPct < 0 && bucket.monthlyEvDeltaPct < 0) return 0.72;
  return 1;
}

function sampleLabel(games) {
  if (games >= 300) return "heavy sample";
  if (games >= 150) return "strong sample";
  if (games >= 50) return "medium sample";
  return "thin sample";
}

function patternForBucket(bucket) {
  const seasonPositive = bucket.evPct > 0;
  const weekUp = bucket.weeklyEvDeltaPct > 0;
  const monthUp = bucket.monthlyEvDeltaPct > 0;
  const weekDown = bucket.weeklyEvDeltaPct < 0;
  const monthDown = bucket.monthlyEvDeltaPct < 0;

  if (seasonPositive && weekUp && monthUp) return "confirmed: weekly and monthly EV positive";
  if (seasonPositive && weekUp && monthDown) return "rebound: weekly positive after monthly weakness";
  if (seasonPositive && weekDown && monthDown) return "correction risk: season positive, recent EV negative";
  if (!seasonPositive && weekUp && monthUp) return "watchlist: recent EV positive, season negative";
  if (seasonPositive && weekDown && monthUp) return "pullback: monthly positive, weekly negative";
  return "mixed: no clean trend";
}

function patternPriority(bucket) {
  const pattern = bucket.pattern || "";
  const sampleBonus = Math.min(4, bucket.games / 50);
  if (pattern.startsWith("momentum")) return 14 + sampleBonus;
  if (pattern.startsWith("rebound")) return 12 + sampleBonus;
  if (pattern.startsWith("correction")) return 10 + sampleBonus;
  if (pattern.startsWith("pullback")) return 8 + sampleBonus;
  if (pattern.startsWith("watchlist")) return 6 + sampleBonus;
  return sampleBonus;
}

async function safeReadLedgerCount() {
  try {
    return (await readLedger()).length;
  } catch {
    return 0;
  }
}

async function readMissingCount() {
  try {
    const text = await fs.readFile(MISSING_PATH, "utf8");
    return Math.max(0, text.trim().split(/\r?\n/).length - 1);
  } catch {
    return 0;
  }
}

async function readUpdateLog() {
  try {
    return JSON.parse(await fs.readFile(UPDATE_LOG_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function appendUpdateLog(result) {
  const log = await readUpdateLog();
  log.unshift(result);
  await fs.writeFile(UPDATE_LOG_PATH, JSON.stringify(log.slice(0, 30), null, 2));
}

function lastMeaningfulLine(text) {
  return text.trim().split(/\r?\n/).reverse().find((line) => line.trim()) || "";
}

function normalizeLedgerRow(row) {
  return Object.fromEntries(LEDGER_COLUMNS.map((column) => [column, row[column] || ""]));
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

function evPct(winRate, avgOdds) {
  if (!Number.isFinite(avgOdds) || avgOdds <= 0) return 0;
  return ((winRate / (avgOdds / 100)) - 1) * 100;
}

function roundOne(value) {
  return Math.round(Number(value) * 10) / 10;
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

function addDays(date, days) {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
