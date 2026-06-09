import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(APP_DIR, "data");
const LEDGER_PATH = path.join(DATA_DIR, "mlb_2026_yrfi_nrfi_3am_game_ledger.csv");
const SUMMARY_PATH = path.join(DATA_DIR, "mlb_2026_yrfi_nrfi_3am_bucket_ev_summary.csv");
const MISSING_PATH = path.join(DATA_DIR, "mlb_2026_yrfi_nrfi_3am_missing.csv");

loadLocalEnv();

const MLB_BASE = process.env.MLB_BASE || "https://statsapi.mlb.com";
const GAMMA_BASE = process.env.POLYMARKET_GAMMA_BASE || "https://gamma-api.polymarket.com";
const CLOB_BASE = process.env.POLYMARKET_CLOB_BASE || "https://clob.polymarket.com";
const FIRST_2026_DATE = "2026-03-26";

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

const SUMMARY_COLUMNS = [
  "paired_bucket",
  "edge_side",
  "games",
  "wins",
  "losses",
  "win_rate_pct",
  "avg_price",
  "ev_pct",
  "yes_wins",
  "no_wins",
  "avg_yes_price",
  "avg_no_price",
  "yes_ev_pct",
  "no_ev_pct"
];

const MISSING_COLUMNS = [
  "date",
  "game_pk",
  "game_number",
  "match",
  "reason",
  "polymarket_event_slug"
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["from-existing"]) {
    await rebuildFromExistingLedger();
    return;
  }

  if (!args.rebuild) {
    await incrementalUpdate(args);
    return;
  }

  const startDate = args.start || FIRST_2026_DATE;
  const endDate = args.end || latestCompletedResultDate(new Date());
  const rows = [];
  const missing = [];

  if (startDate > endDate) {
    throw new Error(`Start date ${startDate} is after end date ${endDate}.`);
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  const dates = dateRange(startDate, endDate);
  console.log(`Building MLB 2026 YRFI/NRFI 3am ET dataset: ${startDate} through ${endDate}`);

  for (const date of dates) {
    const games = await fetchMlbGames(date);
    if (!games.length) {
      console.log(`${date}: no MLB games`);
      continue;
    }

    let addedForDate = 0;
    const matchupCounts = countMatchups(games);
    for (const game of games) {
      if (matchupCounts.get(matchupKey(game)) > 1) {
        missing.push(missingRow(game, "Ambiguous duplicate MLB matchup on same date; skipped because the Polymarket event slug does not uniquely identify game number.", ""));
        continue;
      }

      if (!game.isFinal) {
        missing.push(missingRow(game, "MLB game is not final yet.", ""));
        continue;
      }

      const firstInning = await firstInningRuns(game.gamePk);
      if (!firstInning) {
        missing.push(missingRow(game, "Could not read first-inning runs from MLB live feed.", ""));
        continue;
      }

      const market = await fetchNrfiMarket(game).catch((error) => ({ error: error.message || String(error) }));
      if (!market || market.error) {
        missing.push(missingRow(game, market?.error || "No matching Polymarket YRFI/NRFI market found.", market?.eventSlug || ""));
        continue;
      }

      const prices = await fetch3amYesNoPrices(market, game.date).catch((error) => ({ error: error.message || String(error) }));
      if (!prices || prices.error) {
        missing.push(missingRow(game, prices?.error || "No 3am historical Yes/No price found.", market.eventSlug));
        continue;
      }

      const result = firstInning.totalRuns > 0 ? "YRFI" : "NRFI";
      const paired = pairedOutcome(prices.yes.price * 100, result);
      rows.push({
        date: game.date,
        game_pk: game.gamePk,
        game_number: game.gameNumber,
        sport: "MLB",
        market: "YRFI/NRFI",
        match: `${game.awayTeam} @ ${game.homeTeam}`,
        away_team_name: game.awayTeam,
        home_team_name: game.homeTeam,
        yes_price: formatPrice(prices.yes.price * 100),
        no_price: formatPrice(prices.no.price * 100),
        result,
        paired_bucket: paired.pairedBucket,
        paired_winning_side: paired.winningSide,
        paired_yes_bucket_plus_or_minus: paired.yesPlusMinus,
        paired_no_bucket_plus_or_minus: paired.noPlusMinus,
        yes_bucket_plus_or_minus: `${bucketLabel(prices.yes.price * 100)} ${result === "YRFI" ? "+" : "-"}`,
        no_bucket_plus_or_minus: `${bucketLabel(prices.no.price * 100)} ${result === "NRFI" ? "+" : "-"}`,
        source_pull_time: `03:00 ET history nearest yes=${new Date(prices.yes.t * 1000).toISOString()} no=${new Date(prices.no.t * 1000).toISOString()}`,
        polymarket_event_slug: market.eventSlug,
        polymarket_market_slug: market.marketSlug,
        polymarket_market_id: market.marketId,
        yes_token_id: market.yesTokenId,
        no_token_id: market.noTokenId,
        polymarket_event_url: `https://polymarket.us/event/${market.eventSlug}`
      });
      addedForDate += 1;
    }

    console.log(`${date}: ${addedForDate}/${games.length} rows added`);
  }

  rows.sort((a, b) => `${a.date} ${a.match}`.localeCompare(`${b.date} ${b.match}`));
  missing.sort((a, b) => `${a.date} ${a.match}`.localeCompare(`${b.date} ${b.match}`));

  const summary = summarizeBuckets(rows);
  await writeCsv(LEDGER_PATH, LEDGER_COLUMNS, rows);
  await writeCsv(SUMMARY_PATH, SUMMARY_COLUMNS, summary);
  await writeCsv(MISSING_PATH, MISSING_COLUMNS, missing);

  const positive = summary.filter((row) => Number(row.ev_pct) > 0);
  const negative = summary.filter((row) => Number(row.ev_pct) < 0);
  console.log(`Done. Ledger rows: ${rows.length}. Missing audit rows: ${missing.length}. Summary buckets: ${summary.length}.`);
  console.log(`EV positive buckets: ${positive.length}. EV negative buckets: ${negative.length}.`);
  console.log(`Wrote ${LEDGER_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
  console.log(`Wrote ${MISSING_PATH}`);
}

async function incrementalUpdate(args) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const rows = await readCsvIfExists(LEDGER_PATH);
  const missing = await readCsvIfExists(MISSING_PATH);
  const coveredGamePks = new Set([
    ...rows.map((row) => String(row.game_pk || "")),
    ...missing.map((row) => String(row.game_pk || ""))
  ].filter(Boolean));
  const latestStoredDate = [...rows, ...missing].reduce((max, row) => row.date > max ? row.date : max, "");
  const startDate = args.start || (latestStoredDate ? addDays(latestStoredDate, 1) : FIRST_2026_DATE);
  const endDate = args.end || latestCompletedResultDate(new Date());

  if (startDate > endDate) {
    const summary = summarizeBuckets(rows);
    await writeCsv(SUMMARY_PATH, SUMMARY_COLUMNS, summary);
    console.log(`No new MLB YRFI/NRFI dates to append. Latest stored date ${latestStoredDate || "none"}; latest completed date ${endDate}. Ledger rows preserved: ${rows.length}.`);
    return;
  }

  const dates = dateRange(startDate, endDate);
  let addedRows = 0;
  let addedMissing = 0;
  console.log(`Appending MLB 2026 YRFI/NRFI 3am ET dataset: ${startDate} through ${endDate}`);

  for (const date of dates) {
    const games = await fetchMlbGames(date);
    if (!games.length) {
      console.log(`${date}: no MLB games`);
      continue;
    }

    let addedForDate = 0;
    const matchupCounts = countMatchups(games);
    for (const game of games) {
      const gameKey = String(game.gamePk);
      if (coveredGamePks.has(gameKey)) continue;

      if (matchupCounts.get(matchupKey(game)) > 1) {
        addMissingOnce(missing, coveredGamePks, game, "Ambiguous duplicate MLB matchup on same date; skipped because the Polymarket event slug does not uniquely identify game number.", "");
        addedMissing += 1;
        continue;
      }

      if (!game.isFinal) {
        addMissingOnce(missing, coveredGamePks, game, "MLB game is not final yet.", "");
        addedMissing += 1;
        continue;
      }

      const firstInning = await firstInningRuns(game.gamePk);
      if (!firstInning) {
        addMissingOnce(missing, coveredGamePks, game, "Could not read first-inning runs from MLB live feed.", "");
        addedMissing += 1;
        continue;
      }

      const market = await fetchNrfiMarket(game).catch((error) => ({ error: error.message || String(error) }));
      if (!market || market.error) {
        addMissingOnce(missing, coveredGamePks, game, market?.error || "No matching Polymarket YRFI/NRFI market found.", market?.eventSlug || "");
        addedMissing += 1;
        continue;
      }

      const prices = await fetch3amYesNoPrices(market, game.date).catch((error) => ({ error: error.message || String(error) }));
      if (!prices || prices.error) {
        addMissingOnce(missing, coveredGamePks, game, prices?.error || "No 3am historical Yes/No price found.", market.eventSlug);
        addedMissing += 1;
        continue;
      }

      const result = firstInning.totalRuns > 0 ? "YRFI" : "NRFI";
      const paired = pairedOutcome(prices.yes.price * 100, result);
      rows.push({
        date: game.date,
        game_pk: game.gamePk,
        game_number: game.gameNumber,
        sport: "MLB",
        market: "YRFI/NRFI",
        match: `${game.awayTeam} @ ${game.homeTeam}`,
        away_team_name: game.awayTeam,
        home_team_name: game.homeTeam,
        yes_price: formatPrice(prices.yes.price * 100),
        no_price: formatPrice(prices.no.price * 100),
        result,
        paired_bucket: paired.pairedBucket,
        paired_winning_side: paired.winningSide,
        paired_yes_bucket_plus_or_minus: paired.yesPlusMinus,
        paired_no_bucket_plus_or_minus: paired.noPlusMinus,
        yes_bucket_plus_or_minus: `${bucketLabel(prices.yes.price * 100)} ${result === "YRFI" ? "+" : "-"}`,
        no_bucket_plus_or_minus: `${bucketLabel(prices.no.price * 100)} ${result === "NRFI" ? "+" : "-"}`,
        source_pull_time: `03:00 ET history nearest yes=${new Date(prices.yes.t * 1000).toISOString()} no=${new Date(prices.no.t * 1000).toISOString()}`,
        polymarket_event_slug: market.eventSlug,
        polymarket_market_slug: market.marketSlug,
        polymarket_market_id: market.marketId,
        yes_token_id: market.yesTokenId,
        no_token_id: market.noTokenId,
        polymarket_event_url: `https://polymarket.us/event/${market.eventSlug}`
      });
      coveredGamePks.add(gameKey);
      addedRows += 1;
      addedForDate += 1;
    }

    console.log(`${date}: ${addedForDate}/${games.length} new rows added`);
  }

  rows.sort((a, b) => `${a.date} ${a.match}`.localeCompare(`${b.date} ${b.match}`));
  missing.sort((a, b) => `${a.date} ${a.match}`.localeCompare(`${b.date} ${b.match}`));
  const summary = summarizeBuckets(rows);
  await backupExistingFiles();
  await writeCsv(LEDGER_PATH, LEDGER_COLUMNS, rows);
  await writeCsv(SUMMARY_PATH, SUMMARY_COLUMNS, summary);
  await writeCsv(MISSING_PATH, MISSING_COLUMNS, missing);

  console.log(`Done. Preserved existing ledger. Added rows: ${addedRows}. Added missing audit rows: ${addedMissing}. Ledger rows: ${rows.length}. Missing audit rows: ${missing.length}.`);
}

async function backupExistingFiles() {
  const backupDir = path.join(DATA_DIR, "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const filePath of [LEDGER_PATH, SUMMARY_PATH, MISSING_PATH]) {
    if (!fsSync.existsSync(filePath)) continue;
    const target = path.join(backupDir, `${path.basename(filePath)}.${stamp}.bak`);
    await fs.copyFile(filePath, target);
  }
}

async function readCsvIfExists(filePath) {
  if (!fsSync.existsSync(filePath)) return [];
  const text = await fs.readFile(filePath, "utf8");
  return parseCsv(text);
}

function addMissingOnce(missing, coveredGamePks, game, reason, eventSlug) {
  const gameKey = String(game.gamePk);
  if (coveredGamePks.has(gameKey)) return;
  missing.push(missingRow(game, reason, eventSlug));
  coveredGamePks.add(gameKey);
}

async function rebuildFromExistingLedger() {
  const text = await fs.readFile(LEDGER_PATH, "utf8");
  const rows = parseCsv(text).map((row) => {
    const paired = pairedOutcome(Number(row.yes_price), row.result);
    return {
      ...row,
      paired_bucket: paired.pairedBucket,
      paired_winning_side: paired.winningSide,
      paired_yes_bucket_plus_or_minus: paired.yesPlusMinus,
      paired_no_bucket_plus_or_minus: paired.noPlusMinus
    };
  });
  const summary = summarizeBuckets(rows);
  await writeCsv(LEDGER_PATH, LEDGER_COLUMNS, rows);
  await writeCsv(SUMMARY_PATH, SUMMARY_COLUMNS, summary);
  console.log(`Rebuilt paired row marks from existing ledger. Ledger rows: ${rows.length}. Summary buckets: ${summary.length}.`);
}

async function fetchMlbGames(date) {
  const body = await publicJson(`${MLB_BASE}/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`);
  return (body.dates || []).flatMap((day) => day.games || []).map((game) => {
    const officialDate = game.officialDate || date;
    const away = game.teams?.away;
    const home = game.teams?.home;
    return {
      gamePk: game.gamePk,
      gameNumber: game.gameNumber || "",
      date: officialDate,
      status: game.status?.detailedState || "",
      isFinal: ["F", "FR"].includes(game.status?.statusCode) || game.status?.abstractGameState === "Final",
      awayTeam: away?.team?.name || "",
      homeTeam: home?.team?.name || ""
    };
  }).filter((game) => game.date === date && game.gamePk && game.awayTeam && game.homeTeam);
}

async function firstInningRuns(gamePk) {
  const body = await publicJson(`${MLB_BASE}/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`);
  const inning = body.liveData?.linescore?.innings?.[0];
  const awayRuns = Number(inning?.away?.runs);
  const homeRuns = Number(inning?.home?.runs);
  if (!Number.isFinite(awayRuns) || !Number.isFinite(homeRuns)) return null;
  return {
    awayRuns,
    homeRuns,
    totalRuns: awayRuns + homeRuns
  };
}

async function fetchNrfiMarket(game) {
  for (const eventSlug of eventSlugCandidates(game)) {
    const event = await gammaEvent(eventSlug);
    if (!event) continue;
    const market = (event.markets || []).find((candidate) => isNrfiMarket(candidate, game));
    if (!market) continue;
    const tokens = yesNoTokens(market);
    if (!tokens.yesTokenId || !tokens.noTokenId) {
      return { error: "Matched market, but could not map Yes/No token IDs.", eventSlug };
    }
    return {
      eventSlug,
      marketSlug: market.slug || "",
      marketId: market.id || market.conditionId || "",
      yesTokenId: tokens.yesTokenId,
      noTokenId: tokens.noTokenId
    };
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

function isNrfiMarket(market, game) {
  const type = String(market.sportsMarketType || "").toLowerCase();
  const question = String(market.question || "");
  if (type !== "nrfi" && !/run scored in the first inning/i.test(question)) return false;
  const outcomes = parseJsonArray(market.outcomes).map(normalizeOutcome);
  if (!outcomes.includes("yes") || !outcomes.includes("no")) return false;
  const normalizedQuestion = normalizeTeam(question);
  return normalizedQuestion.includes(normalizeTeam(game.awayTeam)) && normalizedQuestion.includes(normalizeTeam(game.homeTeam));
}

function yesNoTokens(market) {
  const outcomes = parseJsonArray(market.outcomes);
  const tokenIds = parseJsonArray(market.clobTokenIds);
  const tokens = {};
  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = normalizeOutcome(outcomes[index]);
    if (outcome === "yes") tokens.yesTokenId = tokenIds[index] || "";
    if (outcome === "no") tokens.noTokenId = tokenIds[index] || "";
  }
  return tokens;
}

async function fetch3amYesNoPrices(market, date) {
  const target = etDateTimeToUtc(date, "03:00");
  const [yes, no] = await Promise.all([
    nearestHistoricalPrice(market.yesTokenId, target),
    nearestHistoricalPrice(market.noTokenId, target)
  ]);
  if (!yes || !no) throw new Error("No historical price around 3am for one or both Yes/No tokens.");
  return { yes, no };
}

async function nearestHistoricalPrice(tokenId, target) {
  if (!tokenId) return null;
  for (const windowMinutes of [15, 60, 180, 720, 1440, 2880, 5760, 10080]) {
    const startTs = Math.floor((target.getTime() - windowMinutes * 60_000) / 1000);
    const endTs = Math.floor((target.getTime() + windowMinutes * 60_000) / 1000);
    const url = new URL(`${CLOB_BASE}/prices-history`);
    url.searchParams.set("market", tokenId);
    url.searchParams.set("startTs", String(startTs));
    url.searchParams.set("endTs", String(endTs));
    url.searchParams.set("interval", "1m");
    url.searchParams.set("fidelity", "10");
    const body = await publicJson(url.toString());
    const history = Array.isArray(body.history) ? body.history : [];
    const targetSeconds = Math.floor(target.getTime() / 1000);
    const points = history
      .map((point) => ({ t: Number(point.t), price: Number(point.p) }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price));
    if (points.length) {
      return points.sort((a, b) => Math.abs(a.t - targetSeconds) - Math.abs(b.t - targetSeconds))[0];
    }
  }
  return null;
}

function summarizeBuckets(rows) {
  const groups = new Map();
  for (const row of rows) {
    addPairedBucket(groups, row);
  }

  return [...groups.values()].map((group) => {
    const yesWinRate = group.yesWins / group.games;
    const noWins = group.games - group.yesWins;
    const noWinRate = noWins / group.games;
    const avgYesPrice = group.yesPriceSum / group.games;
    const avgNoPrice = group.noPriceSum / group.games;
    const yesEvPct = evPct(yesWinRate, avgYesPrice);
    const noEvPct = evPct(noWinRate, avgNoPrice);
    const edgeSide = yesEvPct >= noEvPct ? "Yes" : "No";
    const wins = edgeSide === "Yes" ? group.yesWins : noWins;
    const avgPrice = edgeSide === "Yes" ? avgYesPrice : avgNoPrice;
    const edgeEvPct = edgeSide === "Yes" ? yesEvPct : noEvPct;
    return {
      paired_bucket: group.pairedBucket,
      edge_side: edgeSide,
      games: group.games,
      wins,
      losses: group.games - wins,
      win_rate_pct: round((wins / group.games) * 100, 1),
      avg_price: round(avgPrice, 1),
      ev_pct: round(edgeEvPct, 2),
      yes_wins: group.yesWins,
      no_wins: noWins,
      avg_yes_price: round(avgYesPrice, 1),
      avg_no_price: round(avgNoPrice, 1),
      yes_ev_pct: round(yesEvPct, 2),
      no_ev_pct: round(noEvPct, 2)
    };
  }).sort(compareSummary);
}

function addPairedBucket(groups, row) {
  const yesPrice = Number(row.yes_price);
  const noPrice = Number(row.no_price);
  const paired = pairedOutcome(yesPrice, row.result);
  if (!paired.pairedBucket) return;
  const key = paired.pairedBucket;
  if (!groups.has(key)) {
    groups.set(key, {
      pairedBucket: paired.pairedBucket,
      yesBucketMin: Number(paired.yesBucket.split("-")[0]),
      games: 0,
      yesWins: 0,
      yesPriceSum: 0,
      noPriceSum: 0
    });
  }
  const group = groups.get(key);
  group.games += 1;
  group.yesPriceSum += yesPrice;
  group.noPriceSum += noPrice;
  if (paired.winningSide === "Yes") group.yesWins += 1;
}

function compareSummary(a, b) {
  return Number(a.paired_bucket.match(/Yes (\d+)-/)?.[1] || 0) - Number(b.paired_bucket.match(/Yes (\d+)-/)?.[1] || 0);
}

function pairedOutcome(yesPrice, result) {
  const yesBucket = bucketLabel(Number(yesPrice));
  const noBucket = complementBucketLabel(yesBucket);
  const winningSide = result === "YRFI" ? "Yes" : result === "NRFI" ? "No" : "";
  return {
    yesBucket,
    noBucket,
    pairedBucket: yesBucket && noBucket ? `Yes ${yesBucket} / No ${noBucket}` : "",
    winningSide,
    yesPlusMinus: yesBucket && winningSide ? `Yes ${yesBucket} ${winningSide === "Yes" ? "+" : "-"}` : "",
    noPlusMinus: noBucket && winningSide ? `No ${noBucket} ${winningSide === "No" ? "+" : "-"}` : ""
  };
}

function eventSlugCandidates(game) {
  const away = asArray(POLYMARKET_TEAM_ABBR[normalizeTeam(game.awayTeam)]);
  const home = asArray(POLYMARKET_TEAM_ABBR[normalizeTeam(game.homeTeam)]);
  const slugs = [];
  for (const awayAbbr of away) {
    for (const homeAbbr of home) {
      slugs.push(`mlb-${awayAbbr}-${homeAbbr}-${game.date}`);
    }
  }
  return slugs;
}

async function publicJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} failed ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
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

function missingRow(game, reason, eventSlug) {
  return {
    date: game.date,
    game_pk: game.gamePk,
    game_number: game.gameNumber,
    match: `${game.awayTeam} @ ${game.homeTeam}`,
    reason,
    polymarket_event_slug: eventSlug || ""
  };
}

function writeCsv(filePath, columns, rows) {
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column] ?? "")).join(","))
  ].join("\n") + "\n";
  return fs.writeFile(filePath, csv);
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

function normalizeOutcome(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized === "yes" || normalized.startsWith("yes ")) return "yes";
  if (normalized === "no" || normalized.startsWith("no ")) return "no";
  return normalized;
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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function etDateTimeToUtc(date, hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const noonUtc = new Date(`${date}T16:00:00.000Z`);
  const offsetMinutes = getEtOffsetMinutes(noonUtc);
  return new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hour,
    minute
  ) - offsetMinutes * 60_000);
}

function getEtOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
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

function countMatchups(games) {
  const counts = new Map();
  for (const game of games) counts.set(matchupKey(game), (counts.get(matchupKey(game)) || 0) + 1);
  return counts;
}

function matchupKey(game) {
  return `${game.date}:${normalizeTeam(game.awayTeam)}:${normalizeTeam(game.homeTeam)}`;
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
