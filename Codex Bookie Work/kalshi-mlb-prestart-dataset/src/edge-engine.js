import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(APP_DIR, "data");
export const LEDGER_PATH = path.join(DATA_DIR, "kalshi_mlb_2026_prestart_moneyline_ledger.csv");
export const MISSING_PATH = path.join(DATA_DIR, "kalshi_mlb_2026_prestart_moneyline_missing.csv");
export const UPDATE_LOG_PATH = path.join(DATA_DIR, "kalshi-prestart-update-log.json");

const execFileAsync = promisify(execFile);

export async function csvLedgerText() {
  return fs.readFile(LEDGER_PATH, "utf8");
}

export async function readLedger() {
  const text = await fs.readFile(LEDGER_PATH, "utf8");
  return parseCsv(text).map((row) => ({
    ...row,
    home_yes_bid: parseOptionalNumber(row.home_yes_bid),
    away_yes_bid: parseOptionalNumber(row.away_yes_bid)
  }));
}

export async function readFilledLedger() {
  return (await readLedger()).filter((row) => Number.isFinite(row.home_yes_bid) && Number.isFinite(row.away_yes_bid));
}

export async function report() {
  const allRows = await readLedger();
  const rows = allRows.filter((row) => Number.isFinite(row.home_yes_bid) && Number.isFinite(row.away_yes_bid));
  const latestPullDate = allRows.reduce((max, row) => row.date > max ? row.date : max, "");
  const weeklyCutoff = latestPullDate ? addDays(latestPullDate, -7) : "";
  const monthlyCutoff = latestPullDate ? addDays(latestPullDate, -30) : "";
  const seasonBuckets = sideBucketSummary(rows);
  const weeklyBuckets = sideBucketSummary(rows.filter((row) => row.date > weeklyCutoff));
  const monthlyBuckets = sideBucketSummary(rows.filter((row) => row.date > monthlyCutoff));
  const weeklyByKey = new Map(weeklyBuckets.map((bucket) => [bucket.key, bucket]));
  const monthlyByKey = new Map(monthlyBuckets.map((bucket) => [bucket.key, bucket]));
  const buckets = seasonBuckets
    .map((bucket) => {
      const weekly = weeklyByKey.get(bucket.key);
      const monthly = monthlyByKey.get(bucket.key);
      const weeklyHistory = bucketWeeklyHistory(rows, bucket, latestPullDate);
      const dailyHistory = bucketDailyHistory(rows, bucket, latestPullDate);
      const basketHistory = bucketBasketHistory(rows, bucket);
      const twoWeekHistory = bucketTwoWeekHistory(rows, bucket, latestPullDate);
      const weekdayPattern = bucketWeekdayPattern(rows, bucket);
      return {
        ...bucket,
        weeklyEvDeltaPct: weekly?.evPct || 0,
        monthlyEvDeltaPct: monthly?.evPct || 0,
        weeklyGames: weekly?.games || 0,
        monthlyGames: monthly?.games || 0,
        weeklyWins: weekly?.wins || 0,
        weeklyLosses: weekly?.losses || 0,
        monthlyWins: monthly?.wins || 0,
        monthlyLosses: monthly?.losses || 0,
        weeklyHistory,
        dailyHistory,
        basketHistory,
        twoWeekHistory,
        weekdayPattern,
        totalGames: allRows.length,
        gamesLabel: `${bucket.games}/${allRows.length}`
      };
    })
    .filter((bucket) => bucket.bucketMin >= 30 && bucket.bucketMin < 70)
    .sort(compareBuckets);

  const total = portfolioSummary(buckets);
  return {
    title: "MLB",
    subtitle: "Moneyline Game Start Snapshot",
    marketKey: "polymarket_mlb_prestart_moneyline",
    latestPullDate,
    lastUpdatedAt: await readLastUpdatedAt(),
    totalRows: allRows.length,
    settledRows: allRows.length,
    filledRows: rows.length,
    missingRows: allRows.length - rows.length,
    missingAuditRows: await readMissingCount(),
    totalEvPct: total.totalEvPct,
    positiveBucketCount: buckets.filter((bucket) => bucket.evPct > 0).length,
    buckets,
    analysis: analysisSummary(buckets, allRows.length, latestPullDate),
    pairedAudit: pairedAuditSummary(pairedBucketSummary(rows), allRows.length),
    updateLog: await readUpdateLog()
  };
}

export async function getData(now = new Date()) {
  const before = await safeReadLedgerCount();
  const startedAt = now.toISOString();
  const scriptPath = path.join(APP_DIR, "scripts", "fill-polymarket-moneyline-missing.js");
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: APP_DIR,
    env: process.env,
    maxBuffer: 1024 * 1024 * 16
  });
  const after = await safeReadLedgerCount();
  const result = {
    ranAt: startedAt,
    status: "completed",
    message: lastMeaningfulLine(stdout) || "Polymarket MLB prestart data rebuilt.",
    rowsBefore: before,
    rowsAfter: after,
    rowsAdded: Math.max(0, after - before),
    missingRows: await readMissingCount(),
    stdout: stdout.trim().split(/\r?\n/).slice(-12).join("\n"),
    stderr: stderr.trim()
  };
  await appendUpdateLog(result);
  return result;
}

function pairedBucketSummary(rows) {
  const groups = new Map();
  for (const row of rows) {
    const paired = pairedFromRow(row);
    if (!paired.homeBucket || !paired.awayBucket) continue;
    const key = paired.homeBucket;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        homeBucket: paired.homeBucket,
        awayBucket: paired.awayBucket,
        games: 0,
        homeWins: 0,
        homeOddsSum: 0,
        awayOddsSum: 0
      });
    }
    const group = groups.get(key);
    group.games += 1;
    group.homeWins += row.winner === "Home" ? 1 : 0;
    group.homeOddsSum += row.home_yes_bid;
    group.awayOddsSum += row.away_yes_bid;
  }

  return [...groups.values()].map((group) => {
    const awayWins = group.games - group.homeWins;
    const homeWinRate = group.homeWins / group.games;
    const awayWinRate = awayWins / group.games;
    const avgHomeOdds = group.homeOddsSum / group.games;
    const avgAwayOdds = group.awayOddsSum / group.games;
    const homeEvPct = evPct(homeWinRate, avgHomeOdds);
    const awayEvPct = evPct(awayWinRate, avgAwayOdds);
    const edgeSide = homeEvPct >= awayEvPct ? "Home" : "Away";
    const wins = edgeSide === "Home" ? group.homeWins : awayWins;
    const avgPrice = edgeSide === "Home" ? avgHomeOdds : avgAwayOdds;
    const winRate = edgeSide === "Home" ? homeWinRate : awayWinRate;
    const edgeBucket = edgeSide === "Home" ? group.homeBucket : group.awayBucket;
    return {
      key: group.key,
      label: `Home ${group.homeBucket} / Away ${group.awayBucket}`,
      displayLabel: `${edgeSide} ${edgeBucket}`,
      games: group.games,
      wins,
      losses: group.games - wins,
      record: `${wins}-${group.games - wins}`,
      winRatePct: winRate * 100,
      avgPrice,
      evPct: edgeSide === "Home" ? homeEvPct : awayEvPct,
      edgeSide,
      edgeBucket,
      homeBucket: group.homeBucket,
      awayBucket: group.awayBucket,
      homeBucketMin: Number(group.homeBucket.split("-")[0]),
      awayBucketMin: Number(group.awayBucket.split("-")[0]),
      homeWins: group.homeWins,
      awayWins,
      avgHomePrice: avgHomeOdds,
      avgAwayPrice: avgAwayOdds,
      homeEvPct,
      awayEvPct
    };
  });
}

function sideBucketSummary(rows) {
  const groups = new Map();
  for (const row of rows) {
    addSideBucket(groups, "Home", row.home_yes_bid, row.winner === "Home");
    addSideBucket(groups, "Away", row.away_yes_bid, row.winner === "Away");
  }
  return [...groups.values()].map((group) => {
    const winRate = group.wins / group.games;
    const avgPrice = group.priceSum / group.games;
    return {
      key: group.key,
      label: `${group.side} ${group.bucket}`,
      displayLabel: `${group.side} ${group.bucket}`,
      side: group.side,
      bucket: group.bucket,
      bucketMin: Number(group.bucket.split("-")[0]),
      games: group.games,
      wins: group.wins,
      losses: group.games - group.wins,
      record: `${group.wins}-${group.games - group.wins}`,
      winRatePct: winRate * 100,
      avgPrice,
      evPct: evPct(winRate, avgPrice),
      winsOverBreakEven: group.wins - (group.games * avgPrice / 100),
      lowerEvPct: lowerBoundEvPct(winRate, avgPrice, group.games)
    };
  });
}

function addSideBucket(groups, side, price, won) {
  const bucket = centsBucket(price);
  if (!bucket) return;
  const key = `${side}|${bucket}`;
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      side,
      bucket,
      games: 0,
      wins: 0,
      priceSum: 0
    });
  }
  const group = groups.get(key);
  group.games += 1;
  group.wins += won ? 1 : 0;
  group.priceSum += price;
}

function pairedFromRow(row) {
  const homeBucket = centsBucket(row.home_yes_bid);
  const awayBucket = centsBucket(row.away_yes_bid);
  return { homeBucket, awayBucket };
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

function lowerBoundEvPct(winRate, avgOdds, games) {
  if (!Number.isFinite(winRate) || !Number.isFinite(avgOdds) || avgOdds <= 0 || games <= 1) return 0;
  const standardError = Math.sqrt(Math.max(0, winRate * (1 - winRate)) / games);
  const lowerWinRate = Math.max(0, winRate - 1.28 * standardError);
  return evPct(lowerWinRate, avgOdds);
}

function sideEvFor(side, bucket) {
  if (!bucket) return 0;
  return side === "Home" ? bucket.homeEvPct : bucket.awayEvPct;
}

function portfolioSummary(buckets) {
  const games = buckets.reduce((sum, bucket) => sum + bucket.games, 0);
  if (!games) return { totalEvPct: 0 };
  const weighted = buckets.reduce((sum, bucket) => sum + bucket.evPct * bucket.games, 0);
  return { totalEvPct: weighted / games };
}

function compareBuckets(a, b) {
  return a.bucketMin - b.bucketMin || (a.side === "Away" ? -1 : 1) - (b.side === "Away" ? -1 : 1);
}

function pairedAuditSummary(buckets, totalGames) {
  return buckets.map((bucket) => ({
    pairLabel: bucket.label,
    games: bucket.games,
    gamesLabel: `${bucket.games}/${totalGames}`,
    homeWins: bucket.homeWins,
    awayWins: bucket.awayWins,
    homeEvPct: bucket.homeEvPct,
    awayEvPct: bucket.awayEvPct
  }));
}

function bucketWeeklyHistory(rows, bucket, latestPullDate) {
  if (!latestPullDate) return [];
  const history = [];
  for (let index = 5; index >= 0; index -= 1) {
    const end = addDays(latestPullDate, -7 * index);
    const start = addDays(end, -6);
    const weekRows = rows.filter((row) => row.date >= start && row.date <= end);
    const summary = sideBucketSummary(weekRows).find((item) => item.key === bucket.key);
    history.push({
      start,
      end,
      games: summary?.games || 0,
      wins: summary?.wins || 0,
      losses: summary?.losses || 0,
      evPct: summary?.evPct || 0,
      state: weeklyState(summary)
    });
  }
  return history;
}

function bucketDailyHistory(rows, bucket, latestPullDate) {
  if (!latestPullDate) return [];
  const history = [];
  const firstDate = rows.reduce((min, row) => row.date < min ? row.date : min, latestPullDate);
  const totalDays = Math.max(0, Math.floor((new Date(`${latestPullDate}T00:00:00Z`) - new Date(`${firstDate}T00:00:00Z`)) / 86400000));
  for (let index = totalDays; index >= 0; index -= 1) {
    const date = addDays(latestPullDate, -index);
    const dayRows = rows.filter((row) => row.date === date);
    const summary = sideBucketSummary(dayRows).find((item) => item.key === bucket.key);
    history.push({
      start: date,
      end: date,
      games: summary?.games || 0,
      wins: summary?.wins || 0,
      losses: summary?.losses || 0,
      evPct: summary?.evPct || 0,
      state: periodState(summary, 3)
    });
  }
  return history;
}

function bucketBasketHistory(rows, bucket) {
  const bucketRows = rows
    .map((row) => rowSideEntry(row, bucket))
    .filter(Boolean)
    .sort((a, b) => `${a.date} ${a.gamePk}`.localeCompare(`${b.date} ${b.gamePk}`));
  const chunks = [];
  for (let start = 0; start < bucketRows.length; start += 5) {
    const chunk = bucketRows.slice(start, start + 5);
    if (chunk.length < 5) continue;
    const summary = summarizeEntries(chunk);
    chunks.push({
      start: chunk[0].date,
      end: chunk[chunk.length - 1].date,
      games: summary.games,
      wins: summary.wins,
      losses: summary.losses,
      evPct: summary.evPct,
      state: periodState(summary, 5)
    });
  }
  return chunks;
}

function bucketTwoWeekHistory(rows, bucket, latestPullDate) {
  if (!latestPullDate) return [];
  const history = [];
  for (let index = 3; index >= 0; index -= 1) {
    const end = addDays(latestPullDate, -14 * index);
    const start = addDays(end, -13);
    const periodRows = rows.filter((row) => row.date >= start && row.date <= end);
    const summary = sideBucketSummary(periodRows).find((item) => item.key === bucket.key);
    history.push({
      start,
      end,
      games: summary?.games || 0,
      wins: summary?.wins || 0,
      losses: summary?.losses || 0,
      evPct: summary?.evPct || 0,
      state: periodState(summary, 10)
    });
  }
  return history;
}

function bucketWeekdayPattern(rows, bucket) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const reads = names.map((name, dayIndex) => {
    const dayRows = rows.filter((row) => new Date(`${row.date}T00:00:00Z`).getUTCDay() === dayIndex);
    const summary = sideBucketSummary(dayRows).find((item) => item.key === bucket.key);
    return {
      day: name,
      games: summary?.games || 0,
      wins: summary?.wins || 0,
      losses: summary?.losses || 0,
      evPct: summary?.evPct || 0,
      state: periodState(summary, 10)
    };
  }).filter((item) => item.state !== "thin");
  return reads.sort((a, b) => Math.abs(b.evPct) - Math.abs(a.evPct))[0] || null;
}

function rowSideEntry(row, bucket) {
  const price = bucket.side === "Home" ? row.home_yes_bid : row.away_yes_bid;
  if (centsBucket(price) !== bucket.bucket) return null;
  return {
    date: row.date,
    gamePk: row.game_pk,
    won: row.winner === bucket.side,
    price
  };
}

function summarizeEntries(entries) {
  const games = entries.length;
  const wins = entries.filter((entry) => entry.won).length;
  const price = entries.reduce((sum, entry) => sum + entry.price, 0) / games;
  const winRate = wins / games;
  return {
    games,
    wins,
    losses: games - wins,
    evPct: evPct(winRate, price)
  };
}

function weeklyState(summary) {
  return periodState(summary, 5);
}

function periodState(summary, minGames) {
  if (!summary || summary.games < minGames) return "thin";
  if (summary.evPct >= 3) return "up";
  if (summary.evPct <= -3) return "down";
  return "flat";
}

function analysisSummary(buckets, totalGames, latestPullDate) {
  const eligible = buckets.filter((bucket) => bucket.games >= 50);
  const opportunities = eligible
    .map((bucket) => ({
      ...bucket,
      stabilityScore: stabilityScore(bucket),
      sampleLabel: `${bucket.games}/${totalGames}`
    }))
    .filter((bucket) => bucket.evPct > 0)
    .sort((a, b) => b.stabilityScore - a.stabilityScore)
    .slice(0, 5);

  const patterns = buckets
    .flatMap((bucket) => patternReads(bucket))
    .filter((item) => item.patternScore > 0)
    .filter((item) => Number(item.patternStrengthPct) >= 75)
    .sort((a, b) => b.patternScore - a.patternScore)
    .map(pairPatternRead(buckets, latestPullDate))
    .filter(uniquePatternPair())
    .slice(0, 5);

  const riskFlags = pairedCorrectionReads(buckets)
    .filter((item) => item.games >= 50 && item.monthlyGames >= 30 && item.weeklyGames >= 10)
    .filter((item) => item.isCorrecting)
    .slice(0, 5);

  return { opportunities, patterns, riskFlags };
}

function stabilityScore(bucket) {
  const rawWinPremium = Math.max(0, bucket.winRatePct - 50) * 0.65;
  const breakEvenWinsPerGame = Math.max(0, bucket.winsOverBreakEven / bucket.games) * 25;
  const samplePremium = Math.min(3, bucket.games / 100);
  return bucket.lowerEvPct + rawWinPremium + breakEvenWinsPerGame + samplePremium;
}

function patternReads(bucket) {
  return [
    sequencePattern(bucket, "daily", bucket.dailyHistory, "calendar days"),
    sequencePattern(bucket, "basket", bucket.basketHistory, "5-bet basket chunks"),
    sequencePattern(bucket, "weekly", bucket.weeklyHistory, "weekly blocks"),
    sequencePattern(bucket, "multi-week", bucket.twoWeekHistory, "two-week blocks"),
    weekdayPatternRead(bucket)
  ].filter(Boolean);
}

function sequencePattern(bucket, kind, history, label) {
  const meaningful = (history || []).filter((period) => period.state !== "thin");
  const states = meaningful.map((week) => week.state);
  const compact = states.map((state) => state[0].toUpperCase()).join(" ");
  const latest = meaningful[meaningful.length - 1];
  const base = {
    ...bucket,
    displayLabel: `${bucket.displayLabel} · ${kind}`,
    label: `${bucket.displayLabel} · ${kind}`,
    weeklySequence: compact || "thin",
    patternScore: 0,
    pattern: "No clean weekly pattern yet."
  };
  if (meaningful.length < 4) {
    return null;
  }

  const chop = chopPattern(states);
  const sampleScore = Math.min(5, Math.sqrt(bucket.games) / 3);

  if (chop && chop.transitions >= 20 && chop.hitRatePct >= 70) {
    const next = chop.lastState === "up" ? "down" : "up";
    return {
      ...base,
      patternScore: patternKindWeight(kind) + chop.hitRatePct / 2 + Math.min(12, chop.transitions / 3) + sampleScore,
      weeklyEvDeltaPct: latest?.evPct || bucket.weeklyEvDeltaPct,
      patternType: `${label} chop`,
      patternStrengthPct: chop.hitRatePct,
      patternTransitions: chop.transitions,
      patternHits: chop.hits,
      nextDirection: next,
      pattern: `${label} chopped ${chop.hits} of ${chop.transitions} transition chances.`
    };
  }

  return null;
}

function weekdayPatternRead(bucket) {
  return null;
}

function patternKindWeight(kind) {
  if (kind === "basket") return 6;
  if (kind === "daily") return 5;
  if (kind === "weekly") return 1;
  if (kind === "multi-week") return 0;
  return 0;
}

function pairPatternRead(buckets, latestPullDate) {
  const byLabel = new Map(buckets.map((bucket) => [bucket.displayLabel, bucket]));
  return (item) => {
    const pair = byLabel.get(oppositeLabel(item));
    const next = directionLabel(item.nextDirection);
    const pairNext = directionLabel(oppositeDirection(item.nextDirection));
    const baseLabel = item.displayLabel.split(" · ")[0];
    const pairLabel = pair?.displayLabel || oppositeLabel(item);
    const upLabel = item.nextDirection === "up" ? baseLabel : pairLabel;
    const indicationDate = latestPullDate ? addDays(latestPullDate, 1) : "";
    return {
      ...item,
      baseDisplayLabel: baseLabel,
      pairedDisplayLabel: pairLabel,
      displayLabel: `${baseLabel} / ${pairLabel}`,
      games: item.games + (pair?.games || 0),
      primaryRead: `${baseLabel} ${next}`,
      inverseRead: `${pairLabel} ${pairNext}`,
      primaryDirection: item.nextDirection,
      inverseDirection: oppositeDirection(item.nextDirection),
      pairedRead: `${baseLabel} ${next} / ${pairLabel} ${pairNext}`,
      nextRead: `${next.toUpperCase()}: ${baseLabel}`,
      indicationDate,
      indicationRead: `${formatUsDateShort(indicationDate)} indication: ${upLabel} up`,
      pattern: item.pattern || ""
    };
  };
}

function oppositeDirection(direction) {
  if (direction === "up") return "down";
  if (direction === "down") return "up";
  return "flat";
}

function directionLabel(direction) {
  if (direction === "up") return "up";
  if (direction === "down") return "down";
  return "watch";
}

function formatUsDateShort(dateText) {
  const match = String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : "Next";
}

function uniquePatternPair() {
  const seen = new Set();
  return (item) => {
    const labels = [item.baseDisplayLabel || item.displayLabel, item.pairedDisplayLabel || ""].sort();
    const key = labels.join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

function chopPattern(states) {
  const clean = states.filter((state) => state === "up" || state === "down");
  if (clean.length < 2) return null;
  let hits = 0;
  for (let index = 1; index < clean.length; index += 1) {
    if (clean[index] !== clean[index - 1]) hits += 1;
  }
  const transitions = clean.length - 1;
  return {
    hits,
    transitions,
    hitRatePct: hits / transitions * 100,
    lastState: clean[clean.length - 1]
  };
}

function stateSequenceLabel(states) {
  return states.map((state) => state === "up" ? "up" : state === "down" ? "down" : "flat").join("-");
}

function trailingStreak(states) {
  const state = states[states.length - 1];
  if (!state || state === "flat") return { state, count: 0 };
  let count = 1;
  for (let index = states.length - 2; index >= 0; index -= 1) {
    if (states[index] !== state) break;
    count += 1;
  }
  return { state, count };
}

function sequenceText(weeks) {
  return weeks.map((week) => `${week.state} ${week.wins}W-${week.losses}L ${formatSigned(week.evPct)}EV`).join(" → ");
}

function formatSigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function pairedCorrectionReads(buckets) {
  const byLabel = new Map(buckets.map((bucket) => [bucket.displayLabel, bucket]));
  const reads = [];
  for (const bucket of buckets) {
    const pair = byLabel.get(oppositeLabel(bucket));
    if (!pair || bucket.displayLabel > pair.displayLabel) continue;
    const bucketCooling = bucket.evPct > 0 && bucket.weeklyEvDeltaPct < bucket.evPct - 8 && bucket.monthlyEvDeltaPct < bucket.evPct - 6;
    const pairCooling = pair.evPct > 0 && pair.weeklyEvDeltaPct < pair.evPct - 8 && pair.monthlyEvDeltaPct < pair.evPct - 6;
    const leader = bucket.evPct >= pair.evPct ? bucket : pair;
    const trailer = leader === bucket ? pair : bucket;
    reads.push({
      key: `${bucket.displayLabel}|${pair.displayLabel}`,
      displayLabel: `${bucket.displayLabel} / ${pair.displayLabel}`,
      label: `${bucket.displayLabel} / ${pair.displayLabel}`,
      games: bucket.games + pair.games,
      wins: leader.wins,
      losses: leader.losses,
      weeklyGames: bucket.weeklyGames + pair.weeklyGames,
      monthlyGames: bucket.monthlyGames + pair.monthlyGames,
      evPct: leader.evPct,
      weeklyEvDeltaPct: leader.weeklyEvDeltaPct,
      monthlyEvDeltaPct: leader.monthlyEvDeltaPct,
      weeklySwingPct: leader.weeklyEvDeltaPct - leader.evPct,
      monthlySwingPct: leader.monthlyEvDeltaPct - leader.evPct,
      isCorrecting: bucketCooling || pairCooling,
      pattern: correctionPattern(bucket, pair, leader, trailer, bucketCooling || pairCooling)
    });
  }
  return reads.sort((a, b) => Math.abs(b.weeklySwingPct) + Math.abs(b.monthlySwingPct) - (Math.abs(a.weeklySwingPct) + Math.abs(a.monthlySwingPct)));
}

function oppositeLabel(bucket) {
  const side = bucket.side === "Home" ? "Away" : "Home";
  const low = 100 - (bucket.bucketMin + 5);
  return `${side} ${low}-${low + 5}`;
}

function correctionPattern(bucket, pair, leader, trailer, cooling) {
  const pairText = `${bucket.displayLabel} (${bucket.wins} W | ${bucket.losses} L) vs ${pair.displayLabel} (${pair.wins} W | ${pair.losses} L)`;
  if (cooling) return `${pairText}; ${leader.displayLabel} led season EV, but its week/month are correcting toward the paired side.`;
  return `${pairText}; paired bins are moving apart or staying mixed, not a clean correction.`;
}

async function readMissingCount() {
  try {
    const text = await fs.readFile(MISSING_PATH, "utf8");
    return Math.max(0, text.trim().split(/\r?\n/).length - 1);
  } catch {
    return 0;
  }
}

async function safeReadLedgerCount() {
  try {
    return (await readFilledLedger()).length;
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

async function readLastUpdatedAt() {
  const log = await readUpdateLog();
  return log[0]?.ranAt || "";
}

async function appendUpdateLog(entry) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const log = await readUpdateLog();
  log.unshift(entry);
  await fs.writeFile(UPDATE_LOG_PATH, JSON.stringify(log.slice(0, 12), null, 2));
}

function lastMeaningfulLine(text) {
  return text.trim().split(/\r?\n/).reverse().find((line) => line.trim()) || "";
}

function parseOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [headers, ...body] = rows;
  return body.filter((line) => line.length === headers.length).map((line) => Object.fromEntries(headers.map((header, index) => [header, line[index] ?? ""])));
}
