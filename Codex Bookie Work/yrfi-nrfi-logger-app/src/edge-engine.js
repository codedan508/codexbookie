import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(APP_DIR, "data");
export const LEDGER_PATH = path.join(DATA_DIR, "mlb_2026_yrfi_nrfi_3am_game_ledger.csv");
export const MISSING_PATH = path.join(DATA_DIR, "mlb_2026_yrfi_nrfi_3am_missing.csv");
export const UPDATE_LOG_PATH = path.join(DATA_DIR, "yrfi-update-log.json");

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
  "yes_price",
  "no_price",
  "result",
  "paired_bucket",
  "paired_winning_side",
  "paired_yes_bucket_plus_or_minus",
  "paired_no_bucket_plus_or_minus",
  "yes_bucket_plus_or_minus",
  "no_bucket_plus_or_minus",
  "source_pull_time",
  "polymarket_event_slug",
  "polymarket_market_slug",
  "polymarket_market_id",
  "yes_token_id",
  "no_token_id",
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
    .filter((bucket) => bucket.yesBucketMin >= 40 && bucket.yesBucketMin < 60)
    .map((bucket) => ({ ...bucket, totalGames: rows.length, gamesLabel: `${bucket.games}/${rows.length}` }))
    .sort(compareBuckets);
  const total = portfolioSummary(visibleBuckets);
  const updateLog = await readUpdateLog();
  const missingRows = await readMissingCount();

  return {
    title: "MLB",
    subtitle: "YRFI / NRFI",
    marketKey: "mlb_yrfi_nrfi",
    latestPullDate,
    totalRows: rows.length,
    settledRows: rows.length,
    missingRows,
    totalEvPct: total.totalEvPct,
    positiveBucketCount: visibleBuckets.filter((bucket) => bucket.evPct > 0).length,
    buckets: visibleBuckets,
    analysis: analysisSummary(visibleBuckets, rows.length),
    updateLog
  };
}

export async function getData(now = new Date()) {
  const before = await safeReadLedgerCount();
  const startedAt = now.toISOString();
  const scriptPath = path.join(APP_DIR, "scripts", "build-yrfi-nrfi-2026.js");
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
    message: lastMeaningfulLine(stdout) || "YRFI/NRFI data rebuilt.",
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
    const yesWinRate = group.yesWins / group.games;
    const noWins = group.games - group.yesWins;
    const noWinRate = noWins / group.games;
    const avgYesOdds = group.yesOddsSum / group.games;
    const avgNoOdds = group.noOddsSum / group.games;
    const yesEvPct = evPct(yesWinRate, avgYesOdds);
    const noEvPct = evPct(noWinRate, avgNoOdds);
    const edgeSide = yesEvPct >= noEvPct ? "Yes" : "No";
    const edgeWins = edgeSide === "Yes" ? group.yesWins : noWins;
    const edgeLosses = group.games - edgeWins;
    const edgeBucket = edgeSide === "Yes" ? group.yesBucket : group.noBucket;
    const edgeAvgOdds = edgeSide === "Yes" ? avgYesOdds : avgNoOdds;
    const edgeWinRate = edgeSide === "Yes" ? yesWinRate : noWinRate;

    return pairedBucketRecord({
      key: group.key,
      yesBucket: group.yesBucket,
      noBucket: group.noBucket,
      games: group.games,
      yesWins: group.yesWins,
      noWins,
      edgeSide,
      edgeBucket,
      edgeWins,
      edgeLosses,
      edgeWinRate,
      edgeAvgOdds,
      yesEvPct,
      noEvPct
    });
  });
}

function addPairedBucket(groups, row) {
  const yesOdds = Number(row.yes_price);
  const noOdds = Number(row.no_price);
  const paired = pairedFromRow(row);
  if (!paired.yesBucket || !paired.noBucket) return;
  const key = paired.yesBucket;
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      yesBucket: paired.yesBucket,
      noBucket: paired.noBucket,
      games: 0,
      yesWins: 0,
      yesOddsSum: 0,
      noOddsSum: 0
    });
  }
  const group = groups.get(key);
  group.games += 1;
  group.yesOddsSum += yesOdds;
  group.noOddsSum += noOdds;
  if (paired.winningSide === "Yes") group.yesWins += 1;
}

function pairedBucketRecord({
  key,
  yesBucket,
  noBucket,
  games,
  yesWins,
  noWins,
  edgeSide,
  edgeBucket,
  edgeWins,
  edgeLosses,
  edgeWinRate,
  edgeAvgOdds,
  yesEvPct,
  noEvPct
}) {
  const yesBucketMin = Number(yesBucket.split("-")[0]);
  const noBucketMin = Number(noBucket.split("-")[0]);
  return {
    key,
    label: `Yes ${yesBucket} / No ${noBucket}`,
    displayLabel: `${edgeSide === "Yes" ? "YRFI" : "NRFI"} ${edgeBucket}`,
    games,
    wins: edgeWins,
    losses: edgeLosses,
    record: `${edgeWins}-${edgeLosses}`,
    side: edgeSide,
    bucket: edgeBucket,
    bucketMin: yesBucketMin,
    yesBucket,
    noBucket,
    yesBucketMin,
    noBucketMin,
    yesWins,
    noWins,
    edgeSide,
    yesEvPct,
    noEvPct,
    winRatePct: edgeWinRate * 100,
    avgOdds: edgeAvgOdds,
    evPct: edgeSide === "Yes" ? yesEvPct : noEvPct
  };
}

function compareBuckets(a, b) {
  if (a.yesBucketMin !== b.yesBucketMin) return a.yesBucketMin - b.yesBucketMin;
  if (a.noBucketMin !== b.noBucketMin) return a.noBucketMin - b.noBucketMin;
  return 0;
}

function sideEvFor(side, bucket) {
  if (!bucket) return 0;
  return side === "Yes" ? bucket.yesEvPct : bucket.noEvPct;
}

function pairedFromRow(row) {
  const pairMatch = String(row.paired_bucket || "").match(/^Yes (\d+-\d+) \/ No (\d+-\d+)$/);
  const fallbackYesBucket = bucketLabel(Number(row.yes_price));
  return {
    yesBucket: pairMatch?.[1] || fallbackYesBucket,
    noBucket: pairMatch?.[2] || complementBucketLabel(fallbackYesBucket),
    winningSide: row.paired_winning_side || (row.result === "YRFI" ? "Yes" : row.result === "NRFI" ? "No" : "")
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

function analysisCard(bucket) {
  return {
    label: bucket.label,
    displayLabel: bucket.displayLabel,
    games: bucket.games,
    totalGames: bucket.totalGames,
    gamesLabel: bucket.gamesLabel || `${bucket.games}/${bucket.totalGames || bucket.games}`,
    record: bucket.record,
    edgeSide: bucket.edgeSide,
    yesEvPct: bucket.yesEvPct,
    noEvPct: bucket.noEvPct,
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
