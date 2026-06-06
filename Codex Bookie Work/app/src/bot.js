import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(APP_DIR, "orders-state.json");
const LOG_DIR = path.join(APP_DIR, "logs");
const GATEWAY_BASE = "https://gateway.polymarket.us";
const TRADE_BASE = "https://api.polymarket.us";
const args = new Set(process.argv.slice(2));

let config = loadConfig();
let rules = defaultRules();

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun && args.has("--once")) {
  await runScan("manual-once");
} else if (isDirectRun) {
  console.log("Polymarket MLB maker bot is manual-only. Run with --once or use the Offer Bets button.");
}

export async function checkDueOffers() {
  return [];
}

function hasDueMarkedCancel(state, now) {
  return Object.values(state.targetMarks || {}).some((mark) => {
    if (!mark || mark.status === "canceled" || !mark.cancelAt) return false;
    const cancelAt = new Date(mark.cancelAt);
    return Number.isFinite(cancelAt.getTime()) && cancelAt <= now;
  });
}

export async function runScan(reason) {
  await refreshOperatorSettings();
  requireTradingConfig();
  const state = await readState();
  if (!normalizeSettings(state.settings || {}).sellBetsEnabled) {
    throw new Error("Trigger Safety is BETS OFF. Turn it to BETS ON before placing offers.");
  }
  const snapshot = await fetchAccountSnapshot();
  await ensureDir(LOG_DIR);
  const now = new Date();
  const et = etParts(now);
  const gameDate = et.date;
  reconcileOrderState(state, snapshot.openOrders, snapshot.positions);
  state.orders ??= {};
  state.orderLocks ??= {};
  state.targetMarks ??= {};
  const plannedLocks = new Set([
    ...Object.keys(state.orderLocks),
    ...Object.keys(state.orders)
  ]);
  const plannedExposures = liveExposureKeys(snapshot.openOrders, snapshot.positions);
  const plannedMarkets = liveMarketKeys(snapshot.openOrders, snapshot.positions);
  const markets = await fetchTodayMlbMoneylines(gameDate);
  const selections = [];
  const moneylineRules = rules.filter((item) => item.enabled && item.market === "moneyline");
  const firstInningRules = rules.filter((item) => item.enabled && item.market === "first_inning_run");
  const totalsRules = rules.filter((item) => item.enabled && item.market === "totals");

  for (const market of markets) {
    if (hasGameStarted(market)) continue;
    const bbo = await fetchMarketBbo(market.slug);
    const sides = normalizeMarketSides(market);
    if (!sides.away || !sides.home) continue;
    applyBboToSides(sides, bbo);
    updateMarkedTargetsForMarket(state, market, sides);
    for (const rule of moneylineRules) {
      const target = sides[rule.side];
      if (!Number.isFinite(target.ask) || !Number.isFinite(target.bid)) continue;
      const observedBidCents = cents(target.bid);
      const makerBidCents = makerLimitCentsForRule(rule, observedBidCents, et);
      if (!Number.isFinite(makerBidCents)) continue;
      const orderKey = orderLockKey(gameDate, market, target, rule);
      const exposureKey = positionMatchKey(market.slug, target.teamName);
      markTarget(state, { market, target, rule, observedBidCents, makerBidCents, exposureKey });
      if (plannedMarkets.has(market.slug)) continue;
      if (plannedExposures.has(exposureKey)) continue;
      if (plannedLocks.has(orderKey)) continue;
      plannedLocks.add(orderKey);
      plannedExposures.add(exposureKey);
      plannedMarkets.add(market.slug);
      selections.push({ market, target, rule, observedBidCents, makerBidCents, orderKey });
    }
    if (firstInningRules.length) {
      const firstInningMarket = await fetchFirstInningRunMarketForMoneyline(market).catch(() => null);
      if (firstInningMarket && !firstInningMarket.closed && !hasGameStarted(firstInningMarket)) {
        const firstInningBbo = await fetchMarketBbo(firstInningMarket.slug);
        const firstInningSides = normalizeFirstInningRunSides(firstInningMarket);
        applyBboToSides(firstInningSides, firstInningBbo);
        updateMarkedTargetsForMarket(state, firstInningMarket, firstInningSides);
        for (const rule of firstInningRules) {
          const target = firstInningSides[rule.side];
          if (!target || !Number.isFinite(target.ask) || !Number.isFinite(target.bid)) continue;
          const observedBidCents = cents(target.bid);
          const makerBidCents = makerLimitCentsForRule(rule, observedBidCents, et);
          if (!Number.isFinite(makerBidCents)) continue;
          const orderKey = orderLockKey(gameDate, firstInningMarket, target, rule);
          const exposureKey = positionMatchKey(firstInningMarket.slug, target.teamName);
          markTarget(state, { market: firstInningMarket, target, rule, observedBidCents, makerBidCents, exposureKey });
          if (plannedMarkets.has(firstInningMarket.slug)) continue;
          if (plannedExposures.has(exposureKey)) continue;
          if (plannedLocks.has(orderKey)) continue;
          plannedLocks.add(orderKey);
          plannedExposures.add(exposureKey);
          plannedMarkets.add(firstInningMarket.slug);
          selections.push({ market: firstInningMarket, target, rule, observedBidCents, makerBidCents, orderKey });
        }
      }
    }
    if (totalsRules.length) {
      const lines = [...new Set(totalsRules.map((rule) => Number(rule.line)).filter(Number.isFinite))];
      for (const totalMarket of await fetchTotalsMarketsForMoneyline(market, lines)) {
        if (!totalMarket || totalMarket.closed || hasGameStarted(totalMarket)) continue;
        const totalBbo = await fetchMarketBbo(totalMarket.slug);
        const totalSides = normalizeTotalsSides(totalMarket);
        applyBboToSides(totalSides, totalBbo);
        updateMarkedTargetsForMarket(state, totalMarket, totalSides);
        for (const rule of totalsRules.filter((item) => Number(item.line) === Number(totalMarket.line))) {
          const target = totalSides[rule.side];
          if (!target || !Number.isFinite(target.ask) || !Number.isFinite(target.bid)) continue;
          const observedBidCents = cents(target.bid);
          const makerBidCents = makerLimitCentsForRule(rule, observedBidCents, et);
          if (!Number.isFinite(makerBidCents)) continue;
          const orderKey = orderLockKey(gameDate, totalMarket, target, rule);
          const exposureKey = positionMatchKey(totalMarket.slug, target.teamName);
          markTarget(state, { market: totalMarket, target, rule, observedBidCents, makerBidCents, exposureKey });
          if (plannedMarkets.has(totalMarket.slug)) continue;
          if (plannedExposures.has(exposureKey)) continue;
          if (plannedLocks.has(orderKey)) continue;
          plannedLocks.add(orderKey);
          plannedExposures.add(exposureKey);
          plannedMarkets.add(totalMarket.slug);
          selections.push({ market: totalMarket, target, rule, observedBidCents, makerBidCents, orderKey });
        }
      }
    }
  }

  const placed = [];
  const skipped = [];
  for (const selection of selections) {
    const order = buildMakerOrder(selection);
    const preview = await previewOrder(order);
    if (hasMatchingOrders(preview)) {
      skipped.push({
        orderKey: selection.orderKey,
        reason: "preview_showed_matching_orders",
        marketSlug: selection.market.slug,
        matchup: selection.market.question,
        targetSide: selection.target.sideName,
        targetTeam: selection.target.teamName,
        observedBidCents: selection.observedBidCents,
        makerBidCents: selection.makerBidCents,
        preview
      });
      continue;
    }
    const response = await createOrder(order);
    const confirmation = await confirmLiveExposure(response.id || "", selection).catch((error) => ({
      confirmed: true,
      confirmationPending: true,
      reason: cleanApiError(error)
    }));
    const placedRecord = {
      orderKey: selection.orderKey,
      orderId: response.id || "",
      gameDate,
      rule: selection.rule.id,
      ruleName: selection.rule.name,
      marketSlug: selection.market.slug,
      matchup: selection.market.question,
      targetSide: selection.target.sideName,
      targetTeam: selection.target.teamName,
      observedBidCents: selection.observedBidCents,
      makerBidCents: selection.makerBidCents,
      limitCents: Number(order.price.value) * 100,
      quantity: order.quantity,
      preview,
      response,
      confirmation
    };
    placed.push(placedRecord);
    state.orders[selection.orderKey] = placedRecord;
    state.orderLocks[selection.orderKey] = {
      lockedAt: new Date().toISOString(),
      reason: "limit_order_accepted",
      orderId: response.id || "",
      gameDate,
      marketSlug: selection.market.slug,
      targetSide: selection.target.sideName,
      targetTeam: selection.target.teamName,
      rule: selection.rule.id,
      ruleName: selection.rule.name,
      observedBidCents: selection.observedBidCents,
      makerBidCents: selection.makerBidCents,
      limitCents: Number(order.price.value) * 100
    };
    await writeState(state);
  }

  const logRecord = {
    pulledAt: new Date().toISOString(),
    reason,
    gameDate,
    activeRules: rules.filter((rule) => rule.enabled).map((rule) => rule.id),
    scannedMarkets: markets.length,
    markedTargets: Object.values(state.targetMarks || {}).filter((target) => target.gameDate === gameDate),
    selections: selections.map((selection) => ({
      rule: selection.rule.id,
      ruleName: selection.rule.name,
      marketSlug: selection.market.slug,
      matchup: selection.market.question,
      targetSide: selection.target.sideName,
      targetTeam: selection.target.teamName,
      observedBidCents: selection.observedBidCents,
      makerBidCents: selection.makerBidCents
    })),
    skipped,
    placed
  };
  const logPath = path.join(LOG_DIR, `orders-${gameDate}-${Date.now()}.json`);
  await fs.writeFile(logPath, JSON.stringify(logRecord, null, 2));
  console.log(`Scan complete: ${markets.length} MLB moneylines, ${placed.length} maker orders placed. Log: ${logPath}`);
  return logRecord;
}

export async function offerFoundBets(matches = [], reason = "found-bets-ui") {
  await refreshOperatorSettings();
  requireTradingConfig();
  const cleanMatches = Array.isArray(matches) ? matches.slice(0, 80) : [];
  const state = await readState();
  if (!normalizeSettings(state.settings || {}).sellBetsEnabled) {
    throw new Error("Trigger Safety is BETS OFF. Turn it to BETS ON before offering found bets.");
  }
  const snapshot = await fetchAccountSnapshot();
  await ensureDir(LOG_DIR);
  const now = new Date();
  const gameDate = etParts(now).date;
  reconcileOrderState(state, snapshot.openOrders, snapshot.positions);
  state.orders ??= {};
  state.orderLocks ??= {};
  state.targetMarks ??= {};

  const plannedLocks = new Set([
    ...Object.keys(state.orderLocks),
    ...Object.keys(state.orders)
  ]);
  const plannedExposures = liveExposureKeys(snapshot.openOrders, snapshot.positions);
  const plannedMarkets = liveMarketKeys(snapshot.openOrders, snapshot.positions);
  const selections = [];
  const skipped = [];

  for (const [index, match] of cleanMatches.entries()) {
    const marketSlug = String(match?.marketSlug || "").trim();
    const foundPrice = Math.floor(Number(match?.price));
    if (!marketSlug || !isTrustedFoundMatch(match) || !Number.isFinite(foundPrice) || foundPrice < 1 || foundPrice > 99) {
      skipped.push({ marketSlug, reason: "invalid_found_bet", match });
      continue;
    }

    const market = await fetchFoundMarket(match).catch((error) => {
      skipped.push({ marketSlug, reason: "market_lookup_failed", error: cleanApiError(error), candidates: candidateGatewaySlugs(match) });
      return null;
    });
    if (!market) continue;
    if (market.closed || hasGameStarted(market)) {
      skipped.push({ marketSlug, reason: "market_closed_or_started", match });
      continue;
    }

    const target = targetForFoundMatch(market, match);
    if (!target) {
      skipped.push({ marketSlug, reason: "outcome_not_found", match });
      continue;
    }

    const bbo = await fetchMarketBbo(market.slug).catch(() => null);
    if (bbo) applyBboToSides({ target }, bbo);
    const currentBidCents = Number.isFinite(target.bid) ? cents(target.bid) : foundPrice;
    const bucket = foundBucket(match);
    if (!bucket || !priceInFoundBucket(foundPrice, bucket)) {
      skipped.push({ marketSlug, reason: "found_price_not_in_bucket", foundPrice, bucket, match });
      continue;
    }
    if (!priceInFoundBucket(currentBidCents, bucket)) {
      skipped.push({ marketSlug, reason: "live_bid_moved_out_of_found_bucket", foundPrice, currentBidCents, bucket, match });
      continue;
    }
    const makerBidCents = currentBidCents;
    const orderKey = foundOrderLockKey(gameDate, market, target, foundPrice, match);
    const exposureKey = positionMatchKey(market.slug, target.teamName);
    const rule = foundRuleForMatch(match, index);
    const selection = { market, target, rule, observedBidCents: currentBidCents, makerBidCents, orderKey };

    if (!goodTillTimeForSelection(selection)) {
      skipped.push({ orderKey, marketSlug, reason: "missing_pre_game_expiration", match });
      continue;
    }
    if (plannedMarkets.has(market.slug)) {
      skipped.push({ orderKey, marketSlug, reason: "market_already_has_live_exposure" });
      continue;
    }
    if (plannedExposures.has(exposureKey)) {
      skipped.push({ orderKey, marketSlug, reason: "outcome_already_has_live_exposure" });
      continue;
    }
    if (plannedLocks.has(orderKey)) {
      skipped.push({ orderKey, marketSlug, reason: "order_lock_already_exists" });
      continue;
    }
    plannedLocks.add(orderKey);
    plannedExposures.add(exposureKey);
    plannedMarkets.add(market.slug);
    selections.push(selection);
  }

  const placed = [];
  for (const selection of selections) {
    const order = buildMakerOrder(selection);
    const preview = await previewOrder(order);
    if (hasMatchingOrders(preview)) {
      skipped.push({
        orderKey: selection.orderKey,
        reason: "preview_showed_matching_orders",
        marketSlug: selection.market.slug,
        matchup: selection.market.question,
        targetSide: selection.target.sideName,
        targetTeam: selection.target.teamName,
        observedBidCents: selection.observedBidCents,
        makerBidCents: selection.makerBidCents,
        preview
      });
      continue;
    }

    const response = await createOrder(order);
    const confirmation = await confirmLiveExposure(response.id || "", selection).catch((error) => ({
      confirmed: true,
      confirmationPending: true,
      reason: cleanApiError(error)
    }));
    const placedRecord = {
      orderKey: selection.orderKey,
      orderId: response.id || "",
      gameDate,
      rule: selection.rule.id,
      ruleName: selection.rule.name,
      marketSlug: selection.market.slug,
      matchup: selection.market.question,
      targetSide: selection.target.sideName,
      targetTeam: selection.target.teamName,
      observedBidCents: selection.observedBidCents,
      makerBidCents: selection.makerBidCents,
      limitCents: Number(order.price.value) * 100,
      quantity: order.quantity,
      tif: order.tif,
      goodTillTime: order.goodTillTime,
      preview,
      response,
      confirmation
    };
    placed.push(placedRecord);
    state.orders[selection.orderKey] = placedRecord;
    state.orderLocks[selection.orderKey] = {
      lockedAt: new Date().toISOString(),
      reason: "found_bet_limit_order_accepted",
      orderId: response.id || "",
      gameDate,
      marketSlug: selection.market.slug,
      targetSide: selection.target.sideName,
      targetTeam: selection.target.teamName,
      rule: selection.rule.id,
      ruleName: selection.rule.name,
      observedBidCents: selection.observedBidCents,
      makerBidCents: selection.makerBidCents,
      limitCents: Number(order.price.value) * 100,
      tif: order.tif,
      goodTillTime: order.goodTillTime
    };
    await writeState(state);
  }

  const logRecord = {
    pulledAt: new Date().toISOString(),
    reason,
    gameDate,
    requestedMatches: cleanMatches.length,
    selections: selections.map((selection) => ({
      rule: selection.rule.id,
      ruleName: selection.rule.name,
      marketSlug: selection.market.slug,
      matchup: selection.market.question,
      targetSide: selection.target.sideName,
      targetTeam: selection.target.teamName,
      observedBidCents: selection.observedBidCents,
      makerBidCents: selection.makerBidCents,
      expires: goodTillTimeForSelection(selection)
    })),
    skipped,
    placed
  };
  const logPath = path.join(LOG_DIR, `found-bets-${gameDate}-${Date.now()}.json`);
  await fs.writeFile(logPath, JSON.stringify(logRecord, null, 2));
  return logRecord;
}

export async function validateFoundMatches(matches = [], options = {}) {
  const cleanMatches = Array.isArray(matches) ? matches.slice(0, 80) : [];
  const valid = [];
  const skipped = [];
  let liveExposureSet = new Set();
  let liveMarketSet = new Set();

  if (options.excludeLiveExposure) {
    const snapshot = await fetchAccountSnapshot();
    liveExposureSet = liveExposureKeys(snapshot.openOrders, snapshot.positions);
    liveMarketSet = liveMarketKeys(snapshot.openOrders, snapshot.positions);
  }

  for (const match of cleanMatches) {
    const marketSlug = String(match?.marketSlug || "").trim();
    const foundPrice = Math.floor(Number(match?.price));
    if (!marketSlug || !isTrustedFoundMatch(match) || !Number.isFinite(foundPrice) || foundPrice < 1 || foundPrice > 99) {
      skipped.push({ marketSlug, reason: "invalid_found_bet", match });
      continue;
    }

    const market = await fetchFoundMarket(match).catch((error) => {
      skipped.push({ marketSlug, reason: "market_lookup_failed", error: cleanApiError(error), candidates: candidateGatewaySlugs(match), match });
      return null;
    });
    if (!market) continue;
    if (market.closed || hasGameStarted(market)) {
      skipped.push({ marketSlug, reason: "market_closed_or_started", match });
      continue;
    }

    const target = targetForFoundMatch(market, match);
    if (!target) {
      skipped.push({ marketSlug, reason: "outcome_not_found", match });
      continue;
    }

    const bbo = await fetchMarketBbo(market.slug).catch(() => null);
    if (bbo) applyBboToSides({ target }, bbo);
    const currentBidCents = Number.isFinite(target.bid) ? cents(target.bid) : foundPrice;
    const bucket = foundBucket(match);
    if (!bucket || !priceInFoundBucket(foundPrice, bucket)) {
      skipped.push({ marketSlug, reason: "found_price_not_in_bucket", foundPrice, bucket, match });
      continue;
    }
    if (!priceInFoundBucket(currentBidCents, bucket)) {
      skipped.push({ marketSlug, reason: "live_bid_moved_out_of_found_bucket", foundPrice, currentBidCents, bucket, match });
      continue;
    }
    const exposureKey = positionMatchKey(market.slug, target.teamName);
    if (options.excludeLiveExposure && liveMarketSet.has(market.slug)) {
      skipped.push({ marketSlug, reason: "market_already_has_live_exposure", match });
      continue;
    }
    if (options.excludeLiveExposure && liveExposureSet.has(exposureKey)) {
      skipped.push({ marketSlug, reason: "outcome_already_has_live_exposure", match });
      continue;
    }

    valid.push({
      ...match,
      gatewayMarketSlug: market.slug,
      foundPrice,
      price: currentBidCents
    });
  }

  return { matches: valid, skipped };
}

async function confirmLiveExposure(orderId, selection) {
  const exposureKey = positionMatchKey(selection.market.slug, selection.target.teamName);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await delay(1_000);
    const snapshot = await fetchAccountSnapshot();
    const hasOrder = snapshot.openOrders.some((order) =>
      String(order.id || order.orderId || "") === String(orderId || "") ||
      positionMatchKey(order.marketSlug, order.marketMetadata?.outcome || order.marketMetadata?.team?.name) === exposureKey
    );
    const hasPosition = snapshot.positions.some((position) =>
      positionMatchKey(position.marketSlug, position.marketMetadata?.outcome || position.marketMetadata?.team?.name) === exposureKey
    );
    if (hasOrder || hasPosition) {
      return { confirmed: true, attempt: attempt + 1, hasOrder, hasPosition };
    }
    const directOrder = orderId ? await fetchOrderById(orderId).catch(() => null) : null;
    const directState = String(directOrder?.state || "").toUpperCase();
    if (directState && !["ORDER_STATE_CANCELED", "ORDER_STATE_CANCELLED", "ORDER_STATE_REJECTED", "ORDER_STATE_FAILED"].includes(directState)) {
      return { confirmed: true, attempt: attempt + 1, hasOrder: false, hasPosition: false, hasDirectOrder: true, directState };
    }
  }
  return { confirmed: false, attempts: 5 };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cancelDueMarkedOrders(state = null) {
  await refreshOperatorSettings();
  requireTradingConfig();
  const currentState = state || await readState();
  currentState.targetMarks ??= {};
  const snapshot = await fetchAccountSnapshot();
  reconcileOrderState(currentState, snapshot.openOrders, snapshot.positions);
  const now = new Date();
  const canceled = [];

  for (const order of snapshot.openOrders) {
    const team = order.marketMetadata?.outcome || order.marketMetadata?.team?.name;
    const key = positionMatchKey(order.marketSlug, team);
    const mark = currentState.targetMarks[key];
    if (!mark || mark.status === "canceled" || !mark.cancelAt) continue;
    if (now < new Date(mark.cancelAt)) continue;
    const orderId = String(order.id || order.orderId || "");
    if (!orderId) continue;
    const response = await cancelOrder(orderId, order.marketSlug);
    mark.status = "canceled";
    mark.canceledAt = now.toISOString();
    mark.cancelOrderId = orderId;
    mark.cancelReason = cancelReasonForTargetSide(mark.targetSide);
    canceled.push({ orderId, marketSlug: order.marketSlug, targetTeam: team, response });
  }

  if (canceled.length) {
    await ensureDir(LOG_DIR);
    await fs.writeFile(path.join(LOG_DIR, `cancels-${etParts(now).date}-${Date.now()}.json`), JSON.stringify({
      pulledAt: now.toISOString(),
      canceled
    }, null, 2));
  }
  await writeState(currentState);
  return canceled;
}

function orderLockKey(gameDate, market, target, rule) {
  const targetName = String(target.teamName || target.sideName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${gameDate}:${market.slug}:${target.sideName}:${targetName}:${rule.id}`;
}

function foundOrderLockKey(gameDate, market, target, limitCents, match) {
  const targetName = String(target.teamName || target.sideName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const source = String(match?.sourceApp || match?.criterionLabel || "found").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${gameDate}:${market.slug}:${target.sideName}:${targetName}:found:${limitCents}:${source}`;
}

function foundRuleForMatch(match, index) {
  const market = foundMarketType(match);
  const side = foundSideName(match);
  const line = Number(match?.line);
  const label = String(match?.criterionLabel || match?.marketQuestion || `${side} found bet`).trim();
  return {
    id: `found_${index}_${market}_${side}`.replace(/[^a-z0-9_]+/g, "_"),
    name: label,
    sport: "mlb",
    market,
    side,
    line: market === "totals" && Number.isFinite(line) ? line : undefined,
    min: Math.max(1, Math.min(99, Math.round(Number(match?.price || 0)))),
    max: Math.max(1, Math.min(99, Math.round(Number(match?.price || 0)))),
    enabled: true
  };
}

function foundMarketType(match) {
  const raw = String(match?.marketType || "").toLowerCase();
  if (raw === "totals") return "totals";
  if (raw === "nrfi" || raw.includes("first_inning")) return "first_inning_run";
  return "moneyline";
}

function foundSideName(match) {
  const market = foundMarketType(match);
  const raw = String(match?.displaySide || match?.side || "").toLowerCase();
  if (market === "totals") return raw.includes("under") ? "under" : "over";
  if (market === "first_inning_run") return raw.includes("nrfi") || raw === "no" ? "no" : "yes";
  return raw.includes("away") ? "away" : raw.includes("home") ? "home" : "outcome";
}

function isTrustedFoundMatch(match) {
  return String(match?.sourceApp || "").startsWith("MLB ") &&
    String(match?.criterionLabel || "").trim().length > 0 &&
    String(match?.eventSlug || "").trim().length > 0 &&
    Number(match?.criterionGames) >= 50 &&
    Number.isFinite(Number(match?.criterionEvPct));
}

async function fetchFoundMarket(match) {
  const errors = [];
  for (const slug of candidateGatewaySlugs(match)) {
    const market = await fetchMarketBySlug(slug).catch((error) => {
      errors.push(`${slug}: ${cleanApiError(error)}`);
      return null;
    });
    if (market) return market;
  }
  throw new Error(errors.join(" | ") || "No market slug candidates");
}

function candidateGatewaySlugs(match) {
  const raw = String(match?.marketSlug || "").trim();
  const market = foundMarketType(match);
  const line = Number(match?.line);
  const slugs = [];
  const add = (slug) => {
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  };

  add(raw);
  if (raw.startsWith("aec-") || raw.startsWith("astatc-") || raw.startsWith("tsc-")) return slugs;

  if (market === "moneyline") {
    add(`aec-${raw}`);
    addGatewayTeamAliases(`aec-${raw}`, add);
  } else if (market === "first_inning_run") {
    const base = raw.replace(/-nrfi$/i, "").replace(/-yrfi$/i, "");
    add(`astatc-${base}-yrfi`);
    addGatewayTeamAliases(`astatc-${base}-yrfi`, add);
  } else if (market === "totals" && Number.isFinite(line)) {
    const base = raw
      .replace(/-over-under-\d+(?:\.\d+)?$/i, "")
      .replace(/-totals-\d+(?:\.\d+)?$/i, "")
      .replace(/-total-\d+pt\d+$/i, "");
    add(`tsc-${base}-${formatTotalLineForSlug(line)}`);
    addGatewayTeamAliases(`tsc-${base}-${formatTotalLineForSlug(line)}`, add);
  }
  return slugs;
}

function addGatewayTeamAliases(slug, add) {
  const variants = new Set([slug]);
  for (const current of [...variants]) {
    variants.add(current.replace(/-ari-/g, "-az-"));
    variants.add(current.replace(/-oak-/g, "-ath-"));
  }
  for (const variant of variants) add(variant);
}

function foundBucket(match) {
  const raw = String(match?.bucket || match?.criterionLabel || "");
  const capped = raw.match(/<=\s*(\d+(?:\.\d+)?)c?/i);
  if (capped) {
    const max = Number(capped[1]);
    return Number.isFinite(max) ? { low: 1, high: max, inclusiveHigh: true } : null;
  }
  const parsed = raw.match(/(\d+)-(\d+)/);
  if (!parsed) return null;
  const low = Number(parsed[1]);
  const high = Number(parsed[2]);
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

function priceInFoundBucket(price, bucket) {
  if (!Number.isFinite(price) || !bucket) return false;
  return bucket.inclusiveHigh ? price >= bucket.low && price <= bucket.high : price >= bucket.low && price < bucket.high;
}

function targetForFoundMatch(market, match) {
  const wanted = [
    match?.side,
    match?.displaySide,
    foundSideName(match)
  ].map(normalizeTeamName).filter(Boolean);
  const side = (market.marketSides || []).find((item) => {
    const labels = [
      item.description,
      item.team?.name,
      item.team?.shortName,
      item.team?.abbreviation
    ].map(normalizeTeamName).filter(Boolean);
    return labels.some((label) => wanted.includes(label));
  });
  if (!side) return null;
  return {
    sideName: foundSideName(match),
    teamName: side.team?.name || side.description || String(match?.side || match?.displaySide || ""),
    price: Number(side.price),
    bid: null,
    ask: null,
    long: Boolean(side.long),
    raw: side
  };
}

function buildMakerOrder(selection) {
  const limitCents = Math.max(1, Math.min(99, Math.round(selection.makerBidCents)));
  const price = selection.target.long ? limitCents / 100 : (100 - limitCents) / 100;
  const quantity = config.contractsPerOrder;
  const intent = selection.target.long ? "ORDER_INTENT_BUY_LONG" : "ORDER_INTENT_BUY_SHORT";
  const goodTillTime = goodTillTimeForSelection(selection);
  if (!goodTillTime) {
    throw new Error(`Missing pre-game expiration for ${selection.market?.slug || "market"}. Order not placed.`);
  }
  const order = {
    marketSlug: selection.market.slug,
    intent,
    type: "ORDER_TYPE_LIMIT",
    price: { value: price.toFixed(2), currency: "USD" },
    quantity,
    tif: "TIME_IN_FORCE_GOOD_TILL_DATE",
    goodTillTime,
    participateDontInitiate: true,
    manualOrderIndicator: "MANUAL_ORDER_INDICATOR_AUTOMATIC",
    synchronousExecution: false
  };
  return order;
}

function goodTillTimeForSelection(selection) {
  const start = new Date(selection.market.gameStartTime || selection.market.startDate || "");
  if (!Number.isFinite(start.getTime())) return "";
  const expires = new Date(start.getTime() - 60_000);
  if (expires <= new Date(Date.now() + 10_000)) return "";
  return expires.toISOString();
}

async function previewOrder(body) {
  return authedJson("POST", "/v1/order/preview", { request: body });
}

function hasMatchingOrders(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasMatchingOrders);
  for (const [key, nested] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if ((lower.includes("match") || lower.includes("execution")) && Array.isArray(nested) && nested.length > 0) {
      return true;
    }
    if (lower.includes("participatedontinitiate") && nested === false) return true;
    if (hasMatchingOrders(nested)) return true;
  }
  return false;
}

async function createOrder(body) {
  const pathName = "/v1/orders";
  const res = await authedFetch("POST", pathName, body);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create order failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchOrderById(orderId) {
  const body = await authedJson("GET", `/v1/order/${encodeURIComponent(orderId)}`);
  return body.order || body;
}

async function cancelOrder(orderId, marketSlug) {
  const pathName = `/v1/order/${encodeURIComponent(orderId)}/cancel`;
  const res = await authedFetch("POST", pathName, { marketSlug });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cancel order failed ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export async function fetchAccountSnapshot() {
  requireTradingConfig();
  const [balancesBody, positionsBody, openOrdersBody] = await Promise.all([
    authedJson("GET", "/v1/account/balances"),
    authedJson("GET", "/v1/portfolio/positions"),
    authedJson("GET", "/v1/orders/open").catch((error) => ({ error: error.message, orders: [] }))
  ]);

  const balance = Array.isArray(balancesBody.balances) ? balancesBody.balances[0] || {} : {};
  const positionsMap = positionsBody.positions || {};
  const positions = Object.entries(positionsMap)
    .map(([marketSlug, position]) => ({ marketSlug, ...position }))
    .filter((position) => Math.abs(Number(position.netPositionDecimal || 0)) > 0);
  const openOrders = Array.isArray(openOrdersBody.orders) ? openOrdersBody.orders : [];
  const currentBalance = amountNumber(balance.currentBalance);
  const buyingPower = amountNumber(balance.buyingPower);
  const positionsValue = positions.reduce((total, position) => total + amountNumber(position.cashValue), 0);
  const openOrdersValue = openOrders.reduce((total, order) => {
    const price = amountNumber(order.price);
    const quantity = amountNumber(order.leavesQuantity || order.remainingQuantity || order.quantity);
    return total + price * quantity;
  }, amountNumber(balance.openOrders));
  const openCash = Math.max(0, buyingPower - openOrdersValue);

  return {
    account: {
      accountTotal: money(buyingPower + positionsValue),
      openPositions: money(positionsValue),
      pendingOrderTotal: money(openOrdersValue),
      openCash: money(openCash),
      lastUpdated: balance.lastUpdated || new Date().toISOString()
    },
    positions,
    openOrders,
    rawBalance: balance
  };
}

export function reconcileOrderState(state, openOrders = [], positions = []) {
  state.orders ??= {};
  state.orderLocks ??= {};
  state.targetMarks ??= {};

  const liveOrderIds = new Set(openOrders.map((order) => String(order.id || order.orderId || "")).filter(Boolean));
  const livePositionKeys = new Set(positions.map((position) =>
    positionMatchKey(position.marketSlug, position.marketMetadata?.outcome || position.marketMetadata?.team?.name)
  ).filter(Boolean));

  for (const [key, order] of Object.entries(state.orders)) {
    const orderId = String(order.orderId || order.id || "");
    const positionKey = positionMatchKey(order.marketSlug, order.targetTeam);
    if (orderId && liveOrderIds.has(orderId)) continue;
    if (positionKey && livePositionKeys.has(positionKey)) continue;
    delete state.orders[key];
    delete state.orderLocks[key];
  }

  for (const [key, lock] of Object.entries(state.orderLocks)) {
    const orderId = String(lock.orderId || "");
    const positionKey = positionMatchKey(lock.marketSlug, lock.targetTeam);
    if (state.orders[key]) continue;
    if (orderId && liveOrderIds.has(orderId)) continue;
    if (positionKey && livePositionKeys.has(positionKey)) continue;
    delete state.orderLocks[key];
  }

  return state;
}

function updateMarkedTargetsForMarket(state, market, sides) {
  for (const side of Object.values(sides)) {
    const key = positionMatchKey(market.slug, side.teamName);
    const mark = state.targetMarks?.[key];
    if (!mark) continue;
    mark.lastSeenAt = new Date().toISOString();
    mark.latestBidCents = Number.isFinite(side.bid) ? cents(side.bid) : mark.latestBidCents;
    mark.latestAskCents = Number.isFinite(side.ask) ? cents(side.ask) : mark.latestAskCents;
    mark.gameStartTime = market.gameStartTime || market.startDate || mark.gameStartTime || "";
    mark.cancelAt = cancelAtForMarkedTarget(mark.gameStartTime, mark.targetSide);
  }
}

function makerLimitCentsForRule(rule, observedBidCents, et) {
  if (observedBidCents >= rule.min && observedBidCents <= rule.max) {
    return observedBidCents;
  }
  return NaN;
}

function markTarget(state, { market, target, rule, observedBidCents, makerBidCents, exposureKey }) {
  const now = new Date().toISOString();
  const previous = state.targetMarks[exposureKey] || {};
  state.targetMarks[exposureKey] = {
    ...previous,
    key: exposureKey,
    status: previous.status === "canceled" ? "canceled" : "active",
    firstMarkedAt: previous.firstMarkedAt || now,
    lastSeenAt: now,
    gameDate: etParts(new Date(market.gameStartTime || market.startDate || Date.now())).date,
    marketSlug: market.slug,
    matchup: market.question || previous.matchup || "",
    targetSide: target.sideName,
    targetTeam: target.teamName,
    rule: rule.id,
    ruleName: rule.name,
    gameStartTime: market.gameStartTime || market.startDate || previous.gameStartTime || "",
    initialAskCents: previous.initialAskCents,
    initialBidCents: previous.initialBidCents ?? makerBidCents,
    latestAskCents: Number.isFinite(target.ask) ? cents(target.ask) : previous.latestAskCents,
    qualifyingBidCents: observedBidCents,
    latestBidCents: makerBidCents,
    cancelAt: cancelAtForMarkedTarget(market.gameStartTime || market.startDate || previous.gameStartTime, target.sideName)
  };
  return state.targetMarks[exposureKey];
}

function cancelAtForMarkedTarget(gameStartTime, targetSide) {
  const start = new Date(gameStartTime || 0);
  if (!Number.isFinite(start.getTime()) || start.getTime() <= 0) return "";
  return new Date(start.getTime() - 60_000).toISOString();
}

function cancelReasonForTargetSide(targetSide) {
  return "polymarket_good_till_date_pre_start";
}

function positionMatchKey(marketSlug, teamName) {
  if (!marketSlug || !teamName) return "";
  return `${marketSlug}:${String(teamName).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function liveExposureKeys(openOrders = [], positions = []) {
  const keys = new Set();
  for (const order of openOrders) {
    const team = order.marketMetadata?.outcome || order.marketMetadata?.team?.name;
    const key = positionMatchKey(order.marketSlug, team);
    if (key) keys.add(key);
  }
  for (const position of positions) {
    const team = position.marketMetadata?.outcome || position.marketMetadata?.team?.name;
    const key = positionMatchKey(position.marketSlug, team);
    if (key) keys.add(key);
  }
  return keys;
}

function liveMarketKeys(openOrders = [], positions = []) {
  const keys = new Set();
  for (const order of openOrders) {
    if (order.marketSlug) keys.add(order.marketSlug);
  }
  for (const position of positions) {
    if (position.marketSlug) keys.add(position.marketSlug);
  }
  return keys;
}

export async function fetchMlbSlateForDate(date) {
  const markets = await fetchTodayMlbMoneylines(date);
  const state = await readState();
  let liveMarketSet = new Set();
  let liveExposureSet = new Set();
  try {
    const snapshot = await fetchAccountSnapshot();
    liveMarketSet = liveMarketKeys(snapshot.openOrders, snapshot.positions);
    liveExposureSet = liveExposureKeys(snapshot.openOrders, snapshot.positions);
  } catch {}
  const slate = [];
  for (const market of markets) {
    const sides = normalizeMarketSides(market);
    if (!sides.away || !sides.home) continue;
    let firstInningMarket = null;
    let firstInningSides = {};
    const totalsSlate = [];
    try {
      const bbo = await fetchMarketBbo(market.slug);
      applyBboToSides(sides, bbo);
      updateMarkedTargetsForMarket(state, market, sides);
    } catch {}
    try {
      firstInningMarket = await fetchFirstInningRunMarketForMoneyline(market);
      if (firstInningMarket) {
        const firstInningBbo = await fetchMarketBbo(firstInningMarket.slug);
        firstInningSides = normalizeFirstInningRunSides(firstInningMarket);
        applyBboToSides(firstInningSides, firstInningBbo);
        updateMarkedTargetsForMarket(state, firstInningMarket, firstInningSides);
      }
    } catch {}
    try {
      const totalMarkets = await fetchTotalsMarketsForMoneyline(market, [7.5, 8.5, 9.5]);
      for (const totalMarket of totalMarkets) {
        const totalBbo = await fetchMarketBbo(totalMarket.slug);
        const totalSides = normalizeTotalsSides(totalMarket);
        applyBboToSides(totalSides, totalBbo);
        updateMarkedTargetsForMarket(state, totalMarket, totalSides);
        totalsSlate.push({
          slug: totalMarket.slug,
          line: Number(totalMarket.line),
          overBid: Number.isFinite(totalSides.over?.bid) ? Math.round(totalSides.over.bid * 100) : null,
          underBid: Number.isFinite(totalSides.under?.bid) ? Math.round(totalSides.under.bid * 100) : null
        });
      }
    } catch {}
    slate.push({
      slug: market.slug,
      firstInningRunSlug: firstInningMarket?.slug || "",
      totals: totalsSlate,
      away: sides.away.teamName,
      home: sides.home.teamName,
      awayBid: Number.isFinite(sides.away.bid) ? Math.round(sides.away.bid * 100) : null,
      homeBid: Number.isFinite(sides.home.bid) ? Math.round(sides.home.bid * 100) : null,
      awayAsk: Number.isFinite(sides.away.ask) ? Math.round(sides.away.ask * 100) : null,
      homeAsk: Number.isFinite(sides.home.ask) ? Math.round(sides.home.ask * 100) : null,
      yrfiBid: Number.isFinite(firstInningSides.yes?.bid) ? Math.round(firstInningSides.yes.bid * 100) : null,
      nrfiBid: Number.isFinite(firstInningSides.no?.bid) ? Math.round(firstInningSides.no.bid * 100) : null,
      started: hasGameStarted(market),
      hasLiveExposure: liveMarketSet.has(market.slug) ||
        (firstInningMarket?.slug ? liveMarketSet.has(firstInningMarket.slug) : false) ||
        totalsSlate.some((total) => liveMarketSet.has(total.slug)),
      targets: [
        ...targetMarksForMarket(state, market.slug, liveExposureSet),
        ...(firstInningMarket?.slug ? targetMarksForMarket(state, firstInningMarket.slug, liveExposureSet) : []),
        ...totalsSlate.flatMap((total) => targetMarksForMarket(state, total.slug, liveExposureSet))
      ],
      gameTime: market.gameStartTime || market.startDate || ""
    });
  }
  await writeState(state);
  return slate.sort((a, b) => String(a.gameTime).localeCompare(String(b.gameTime)));
}

function targetMarksForMarket(state, marketSlug, liveExposureSet = new Set()) {
  return Object.values(state.targetMarks || {})
    .filter((target) => target.marketSlug === marketSlug && target.status !== "canceled")
    .map((target) => ({
      side: target.targetSide,
      team: target.targetTeam,
      rule: target.rule,
      latestBidCents: target.latestBidCents,
      latestAskCents: target.latestAskCents,
      cancelAt: target.cancelAt,
      hasLiveExposure: liveExposureSet.has(positionMatchKey(target.marketSlug, target.targetTeam))
    }));
}

function hasGameStarted(market, now = new Date()) {
  const start = new Date(market.gameStartTime || market.startDate || market.endDate || 0);
  return Number.isFinite(start.getTime()) && start <= now;
}

async function fetchTodayMlbMoneylines(gameDate) {
  const startUtc = etDateToUtc(gameDate, "00:00");
  const endUtc = etDateToUtc(gameDate, "23:59");
  const [body, officialGames] = await Promise.all([
    publicJson("/v2/leagues/mlb/events"),
    fetchOfficialMlbGames(gameDate)
  ]);
  const markets = (body.events || []).flatMap((event) => event.markets || []);
  return markets.filter((market) => {
    const gameTime = new Date(market.gameStartTime || market.startDate || market.endDate || 0);
    return market.category === "sports" &&
      String(market.marketType || "").toLowerCase() === "moneyline" &&
      String(market.sportsMarketTypeV2 || "").includes("MONEYLINE") &&
      market.marketSides?.some((side) => side?.team?.league === "mlb") &&
      gameTime >= startUtc &&
      gameTime <= endUtc;
  }).map((market) => ({
    ...market,
    officialSchedule: matchOfficialMlbGame(market, officialGames)
  }));
}

async function fetchMarketBbo(slug) {
  const body = await publicJson(`/v1/markets/${encodeURIComponent(slug)}/bbo`);
  return body.marketData || {};
}

async function fetchMarketBySlug(slug) {
  const body = await publicJson(`/v1/market/slug/${encodeURIComponent(slug)}`);
  return body.market || null;
}

async function fetchFirstInningRunMarketForMoneyline(market) {
  const slug = String(market.slug || "");
  if (!slug.startsWith("aec-mlb-")) return null;
  const firstInningSlug = `astatc-${slug.slice("aec-".length)}-yrfi`;
  const firstInningMarket = await fetchMarketBySlug(firstInningSlug);
  if (!firstInningMarket) return null;
  if (String(firstInningMarket.sportsMarketType || "") !== "baseball_team_first_inning_run") return null;
  return {
    ...firstInningMarket,
    officialSchedule: market.officialSchedule
  };
}

async function fetchTotalsMarketsForMoneyline(market, lines) {
  const slug = String(market.slug || "");
  if (!slug.startsWith("aec-mlb-")) return [];
  const base = slug.slice("aec-".length);
  const markets = await Promise.all(lines.map(async (line) => {
    const totalSlug = `tsc-${base}-${formatTotalLineForSlug(line)}`;
    const totalMarket = await fetchMarketBySlug(totalSlug).catch(() => null);
    if (!totalMarket) return null;
    if (String(totalMarket.sportsMarketType || "").toLowerCase() !== "totals") return null;
    if (Number(totalMarket.line) !== Number(line)) return null;
    return {
      ...totalMarket,
      officialSchedule: market.officialSchedule
    };
  }));
  return markets.filter(Boolean);
}

function formatTotalLineForSlug(line) {
  return Number(line).toFixed(1).replace(".", "pt");
}

function normalizeMarketSides(market) {
  const result = {};
  const official = market.officialSchedule;
  if (!official?.away || !official?.home) return result;
  for (const side of market.marketSides || []) {
    const teamName = side.team?.name || side.description || "";
    const normalized = normalizeTeamName(teamName);
    const ordering = normalized === official.awayKey
      ? "away"
      : normalized === official.homeKey
        ? "home"
        : "";
    if (ordering !== "away" && ordering !== "home") continue;
    result[ordering] = {
      sideName: ordering,
      teamName,
      price: Number(side.price),
      bid: null,
      ask: null,
      long: Boolean(side.long),
      raw: side
    };
  }
  return result;
}

function normalizeFirstInningRunSides(market) {
  const result = {};
  for (const side of market.marketSides || []) {
    const description = String(side.description || "").trim().toLowerCase();
    const key = description === "yes" || description === "yes run" ? "yes"
      : description === "no" || description === "no run" ? "no"
        : "";
    if (!key) continue;
    result[key] = {
      sideName: key,
      teamName: key === "yes" ? "YRFI" : "NRFI",
      price: Number(side.price),
      bid: null,
      ask: null,
      long: Boolean(side.long),
      raw: side
    };
  }
  return result;
}

function normalizeTotalsSides(market) {
  const result = {};
  for (const side of market.marketSides || []) {
    const description = String(side.description || "").trim().toLowerCase();
    const key = description === "over" ? "over" : description === "under" ? "under" : "";
    if (!key) continue;
    result[key] = {
      sideName: key,
      teamName: `${key === "over" ? "Over" : "Under"} ${Number(market.line).toFixed(1)}`,
      price: Number(side.price),
      bid: null,
      ask: null,
      long: Boolean(side.long),
      raw: side
    };
  }
  return result;
}

async function fetchOfficialMlbGames(gameDate) {
  const body = await officialMlbJson(`/api/v1/schedule?sportId=1&date=${encodeURIComponent(gameDate)}`);
  return (body.dates || []).flatMap((date) => date.games || []).map((game) => ({
    gamePk: game.gamePk,
    startTime: game.gameDate || "",
    away: game.teams?.away?.team?.name || "",
    home: game.teams?.home?.team?.name || "",
    awayKey: normalizeTeamName(game.teams?.away?.team?.name || ""),
    homeKey: normalizeTeamName(game.teams?.home?.team?.name || "")
  })).filter((game) => game.awayKey && game.homeKey);
}

function matchOfficialMlbGame(market, officialGames) {
  const sideKeys = new Set((market.marketSides || [])
    .map((side) => normalizeTeamName(side.team?.name || side.description || ""))
    .filter(Boolean));
  if (sideKeys.size !== 2) return null;
  const gameTime = new Date(market.gameStartTime || market.startDate || market.endDate || 0).getTime();
  const candidates = officialGames.filter((game) =>
    sideKeys.has(game.awayKey) &&
    sideKeys.has(game.homeKey)
  );
  if (candidates.length <= 1 || !Number.isFinite(gameTime)) return candidates[0] || null;
  return candidates
    .map((game) => ({ game, delta: Math.abs(new Date(game.startTime || 0).getTime() - gameTime) }))
    .sort((a, b) => a.delta - b.delta)[0]?.game || null;
}

function normalizeTeamName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function applyBboToSides(sides, bbo) {
  const longBid = amountValue(bbo.bestBid);
  const longAsk = amountValue(bbo.bestAsk);
  const shortBid = Number.isFinite(longAsk) ? round(1 - longAsk, 4) : null;
  const shortAsk = Number.isFinite(longBid) ? round(1 - longBid, 4) : null;

  for (const side of Object.values(sides)) {
    if (side.long) {
      side.bid = longBid;
      side.ask = longAsk;
    } else {
      side.bid = shortBid;
      side.ask = shortAsk;
    }
  }
}

function amountValue(amount) {
  if (!amount) return null;
  const value = Number(amount.value);
  return Number.isFinite(value) ? value : null;
}

async function publicJson(pathName) {
  const res = await fetch(`${GATEWAY_BASE}${pathName}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Public API failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function officialMlbJson(pathName) {
  const res = await fetch(`https://statsapi.mlb.com${pathName}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`MLB API failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function authedFetch(method, pathName, body) {
  const timestamp = String(Date.now());
  const signature = sign(`${timestamp}${method}${pathName}`);
  return fetch(`${TRADE_BASE}${pathName}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-PM-Access-Key": config.keyId,
      "X-PM-Timestamp": timestamp,
      "X-PM-Signature": signature
    },
    body: JSON.stringify(body)
  });
}

async function authedJson(method, pathName, body) {
  const res = await authedFetch(method, pathName, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathName} failed ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function cleanApiError(error) {
  const message = error?.message || String(error || "");
  if (message.includes("failed 429") || message.includes("Error 1015") || message.includes("rate limited")) {
    return "Polymarket rate limited account refresh after order placement.";
  }
  return message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

function amountNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "object" && "value" in value) return amountNumber(value.value);
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function sign(message) {
  const key = loadEd25519PrivateKey(config.secretKey);
  return crypto.sign(null, Buffer.from(message), key).toString("base64");
}

function loadEd25519PrivateKey(secret) {
  const trimmed = String(secret || "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed) throw new Error("POLYMARKET_SECRET_KEY is empty.");
  if (trimmed.includes("BEGIN")) {
    return crypto.createPrivateKey(trimmed);
  }

  const raw = /^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0
    ? Buffer.from(trimmed, "hex")
    : decodeBase64Secret(trimmed);

  if (raw.length === 32) return keyFromEd25519Seed(raw);
  if (raw.length > 32 && raw.length < 64) return keyFromEd25519Seed(raw.subarray(0, 32));
  try {
    return crypto.createPrivateKey({ key: raw, format: "der", type: "pkcs8" });
  } catch {
    if (raw.length >= 32) return keyFromEd25519Seed(raw.subarray(0, 32));
    throw new Error("POLYMARKET_SECRET_KEY must be an Ed25519 seed, PKCS8 key, or PEM key.");
  }
}

function decodeBase64Secret(secret) {
  let normalized = String(secret || "").trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("SECRET KEY contains non-base64 characters. Paste only the key value, not labels or notes.");
  }
  while (normalized.length % 4 !== 0) normalized += "=";
  return Buffer.from(normalized, "base64");
}

function keyFromEd25519Seed(seed) {
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return crypto.createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, seed]),
    format: "der",
    type: "pkcs8"
  });
}

function loadConfig() {
  loadDotEnv();
  return {
    keyId: process.env.POLYMARKETKEYID || process.env.POLYMARKET_KEY_ID || "",
    secretKey: process.env.POLYMARKETSECRETKEY || process.env.POLYMARKET_SECRET_KEY || "",
    contractsPerOrder: 10,
    makerBidOffsetCents: 0,
    scanTimesEt: [],
    sellBetsEnabled: false
  };
}

function parseScanTimes(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultRules() {
  return [];
}

async function refreshOperatorSettings() {
  const state = await readState();
  const settings = normalizeSettings(state.settings || {});
  config = {
    ...config,
    contractsPerOrder: settings.contractsPerOrder,
    makerBidOffsetCents: settings.makerBidOffsetCents,
    scanTimesEt: settings.scanTimesEt
  };
  rules = settings.rules;
}

export function normalizeSettings(input = {}) {
  const defaults = {
    contractsPerOrder: 10,
    makerBidOffsetCents: 0,
    scanTimesEt: [],
    rules: defaultRules()
  };
  return {
    contractsPerOrder: positiveNumber(input.contractsPerOrder, defaults.contractsPerOrder),
    makerBidOffsetCents: nonnegativeNumber(input.makerBidOffsetCents, defaults.makerBidOffsetCents),
    scanTimesEt: [],
    sellBetsEnabled: Boolean(input.sellBetsEnabled),
    rules: normalizeRules(input.rules, defaults.rules)
  };
}

function normalizeRules(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map(normalizeRule).filter(Boolean);
  return cleaned;
}

function normalizeRule(rule) {
  const sport = String(rule?.sport || "mlb").toLowerCase();
  const market = String(rule?.market || "moneyline").toLowerCase();
  const side = String(rule?.side || "").toLowerCase();
  const line = Number(rule?.line);
  const min = Math.round(Number(rule?.min));
  const max = Math.round(Number(rule?.max));
  if (sport !== "mlb" || !["moneyline", "first_inning_run", "totals"].includes(market)) return null;
  if (market === "moneyline" && !["away", "home"].includes(side)) return null;
  if (market === "first_inning_run" && !["yes", "no"].includes(side)) return null;
  if (market === "totals" && (!["over", "under"].includes(side) || ![7.5, 8.5, 9.5].includes(line))) return null;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 99 || min >= max) return null;
  const id = String(rule?.id || `${sport}_${market}_${side}_${Number.isFinite(line) ? formatTotalLineForSlug(line) : ""}_${min}_${max}_${Date.now()}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const labelSide = market === "moneyline"
    ? (side === "away" ? "Away" : "Home")
    : market === "first_inning_run"
      ? (side === "yes" ? "YRFI" : "NRFI")
      : `${side === "over" ? "Over" : "Under"} ${line.toFixed(1)}`;
  return {
    id: id || `${sport}_${market}_${side}_${min}_${max}`,
    name: String(rule?.name || `${labelSide} ${min}-${max}c`).trim(),
    sport,
    market,
    side,
    line: market === "totals" ? line : undefined,
    min,
    max,
    enabled: rule?.enabled !== false
  };
}

function normalizeScanTimes(value, fallback) {
  if (!Array.isArray(value) || !value.length) return fallback;
  const cleaned = [...new Set(value.map((item) => String(item).trim()).filter((item) => /^\d{2}:\d{2}$/.test(item)))].sort();
  if (!cleaned.length) return fallback;
  const legacyTwoScanSetup = cleaned.length === 2 && cleaned.includes("03:00") && cleaned.includes("11:00");
  return legacyTwoScanSetup ? fallback : cleaned;
}

function defaultScanTimes() {
  return [];
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function requireTradingConfig() {
  if (!config.keyId || !config.secretKey) {
    throw new Error("Missing KEY ID or SECRET KEY in .env. Real order entry cannot run without credentials.");
  }
  if (!Number.isFinite(config.contractsPerOrder) || config.contractsPerOrder <= 0) {
    throw new Error("CONTRACTS_PER_ORDER must be a positive number.");
  }
  if (!Number.isFinite(config.makerBidOffsetCents) || config.makerBidOffsetCents < 0) {
    throw new Error("MAKER_BID_OFFSET_CENTS must be zero or positive.");
  }
  for (const rule of rules) {
    const validSide = rule.market === "first_inning_run"
      ? ["yes", "no"].includes(rule.side)
      : rule.market === "totals"
        ? ["over", "under"].includes(rule.side) && [7.5, 8.5, 9.5].includes(Number(rule.line))
        : ["away", "home"].includes(rule.side);
    if (rule.enabled && !validSide) throw new Error(`${rule.id} has invalid side: ${rule.side}`);
    if (rule.enabled && (!Number.isFinite(rule.min) || !Number.isFinite(rule.max) || rule.min >= rule.max)) {
      throw new Error(`${rule.id} has invalid bid range.`);
    }
  }
}

function loadDotEnv() {
  const envPath = path.join(APP_DIR, ".env");
  try {
    const text = fsSyncRead(envPath);
    const rawLines = text.split(/\r?\n/);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!["POLYMARKETKEYID", "POLYMARKET_KEY_ID", "POLYMARKETSECRETKEY", "POLYMARKET_SECRET_KEY"].includes(key)) continue;
      if (!(key in process.env)) process.env[key] = value;
    }
    loadPolymarketRawKeyBlock(rawLines);
  } catch {}
}

function loadPolymarketRawKeyBlock(lines) {
  let section = "";
  const keyIdParts = [];
  const secretParts = [];
  let rawKeyId = "";
  let rawSecret = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const label = trimmed.replace(/[:=].*$/, "").replace(/\s+/g, "").toUpperCase();
    if (label === "KEYID" || label === "KEY_ID" || label === "POLYMARKETKEYID" || label === "POLYMARKET_KEY_ID") {
      section = rawKeyId ? "" : "key";
      continue;
    }
    if (label === "SECRETKEY" || label === "SECRET_KEY" || label === "POLYMARKETSECRETKEY" || label === "POLYMARKET_SECRET_KEY") {
      section = rawSecret ? "" : "secret";
      continue;
    }
    if (section === "key") {
      const keyChunk = trimmed.match(/[0-9a-f-]+/i)?.[0] || "";
      if (keyChunk) keyIdParts.push(keyChunk);
      const candidate = keyIdParts.join("");
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
        rawKeyId = candidate;
        section = "";
      }
      continue;
    }
    if (section === "secret") {
      const secretChunk = trimmed.replace(/\s+/g, "");
      if (/^[A-Za-z0-9+/=_-]+$/.test(secretChunk)) {
        secretParts.push(secretChunk);
        const candidate = secretParts.join("");
        if (decodedSecretLength(candidate) >= 64) {
          rawSecret = candidate;
          section = "";
        }
      }
    }
  }
  const keyId = rawKeyId || keyIdParts.join("").trim();
  const secretKey = normalizeBase64Secret(rawSecret || secretParts.join("").trim());
  if (keyId && !process.env.POLYMARKETKEYID && !process.env.POLYMARKET_KEY_ID) {
    process.env.POLYMARKETKEYID = keyId;
  }
  if (secretKey && !process.env.POLYMARKETSECRETKEY && !process.env.POLYMARKET_SECRET_KEY) {
    process.env.POLYMARKETSECRETKEY = secretKey;
  }
}

function decodedSecretLength(secret) {
  try {
    let normalized = String(secret || "").trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) normalized += "=";
    return Buffer.from(normalized, "base64").length;
  } catch {
    return 0;
  }
}

function normalizeBase64Secret(secret) {
  let normalized = String(secret || "").trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) normalized += "=";
  return normalized;
}

function fsSyncRead(file) {
  return fsSync.readFileSync(file, "utf8");
}

function etDateToUtc(date, hhmm) {
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

function etParts(date) {
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
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

export async function readState() {
  try {
    const state = JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
    stripLiveFields(state);
    state.orders ??= {};
    state.orderLocks ??= {};
    state.targetMarks ??= {};
    state.settings = normalizeSettings(state.settings || {});
    state.upcomingOffers = [];
    return state;
  } catch {
    const state = { orders: {}, orderLocks: {}, targetMarks: {}, upcomingOffers: [], settings: normalizeSettings({}) };
    return state;
  }
}

export async function writeState(state) {
  await ensureDir(APP_DIR);
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

function stripLiveFields(state) {
  delete state.account;
  delete state.accountError;
  delete state.positionsLive;
  delete state.openOrdersLive;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export function hydrateDailyOffers(state, et) {
  state.settings = normalizeSettings(state.settings || {});
  state.upcomingOffers = [];
  delete state.lastDailyOfferSetupDate;
  return state;
}

export function addManualOffer(state, date, time) {
  state.upcomingOffers ??= [];
  const id = `manual-${date}-${time}-${Date.now()}`;
  state.upcomingOffers.push({ id, date, time, kind: "manual", status: "pending" });
  sortOffers(state);
  return state.upcomingOffers.at(-1);
}

export function removeOffer(state, id) {
  state.upcomingOffers = (state.upcomingOffers || []).filter((offer) => offer.id !== id);
}

function pruneCompletedManualOffers(state) {
  const today = etParts(new Date()).date;
  state.upcomingOffers = (state.upcomingOffers || []).filter((offer) =>
    offer.kind !== "manual" || offer.status === "pending" || offer.date === today
  );
}

function sortOffers(state) {
  state.upcomingOffers.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function cents(value) {
  return Math.round(Number(value) * 1000) / 10;
}

async function logError(scope, error) {
  await ensureDir(LOG_DIR);
  const line = `[${new Date().toISOString()}] ${scope}: ${error.stack || error.message || error}\n`;
  await fs.appendFile(path.join(LOG_DIR, "errors.log"), line);
  console.error(line.trim());
}
