#!/usr/bin/env node

process.env.TZ = "America/New_York";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(APP_ROOT, "results", "weather-polymarket-history");

const POLYMARKET_US_GATEWAY_BASE = "https://gateway.polymarket.us";
const POLYMARKET_US_API_BASE = "https://api.polymarket.us";
const POLYMARKET_PUBLIC_CLOB_BASE = "https://clob.polymarket.com";
const POLYMARKET_GAMMA_BASE = "https://gamma-api.polymarket.com";
const SEARCH_QUERY = process.env.SEARCH_QUERY || "highest temperature";
const DAYS = Number(process.env.DAYS || 90);
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 1000);
const MAX_PAGES = Number(process.env.MAX_PAGES || 220);
const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS || 6 * 60 * 60);
const PRIMARY_CITIES = new Set(["Chicago", "Los Angeles", "Miami", "New York", "San Francisco"]);
const GAMMA_CITY_SLUGS = new Map([
  ["Chicago", "chicago"],
  ["Los Angeles", "los-angeles"],
  ["Miami", "miami"],
  ["New York", "nyc"],
  ["San Francisco", "san-francisco"]
]);
const PRICE_BUCKETS = [0.65, 0.50, 0.35, 0.20];
const CITY_SNAPSHOT_TIMES = new Map([
  ["New York", { key: "0005", hour: 0, minute: 5 }],
  ["Miami", { key: "0005", hour: 0, minute: 5 }],
  ["Chicago", { key: "0105", hour: 1, minute: 5 }],
  ["Los Angeles", { key: "0305", hour: 3, minute: 5 }],
  ["San Francisco", { key: "0305", hour: 3, minute: 5 }]
]);

const today = easternDate(new Date());
const cutoff = addDays(today, -DAYS);

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const events = await discoverEvents();
  const rows = [];
  const errors = [];
  const sourceNotes = [];

  for (const [eventIndex, event] of events.entries()) {
    const markets = (event.markets || []).filter((market) => market.enableOrderBook !== false);
    const snapshot = CITY_SNAPSHOT_TIMES.get(event.city);
    if (!snapshot) continue;
    const targetTs = easternLocalTimestamp(event.eventDate, snapshot.hour, snapshot.minute);
    const marketContexts = [];
    for (const market of markets) {
      const yesMarket = yesMarketSide(market);
      const yesTokenId = yesMarket?.priceHistoryId;
      const yesFinal = yesMarket?.finalPrice;
      if (!yesTokenId) continue;
      marketContexts.push({ market, yesTokenId, yesFinal });
    }
    console.log(`[${eventIndex + 1}/${events.length}] ${event.slug} (${marketContexts.length} markets)`);
    const histories = await fetchBatchAvailablePriceHistory(
      marketContexts.map((item) => item.yesTokenId),
      targetTs - WINDOW_SECONDS,
      targetTs + WINDOW_SECONDS
    );

    for (const { market, yesTokenId, yesFinal } of marketContexts) {
      const historyResult = histories.get(yesTokenId) || { history: [], source: "missing", note: "Batch CLOB history missing token" };
      const nearest = firstHistoryPointAtOrAfter(historyResult.history, targetTs);
      if (historyResult.note) sourceNotes.push({ event_slug: event.slug, market_slug: market.slug, snapshot: snapshot.key, note: historyResult.note });
      rows.push({
        event_date: event.eventDate,
        event_title: event.title,
        event_slug: event.slug,
        market_slug: market.slug,
        bin: market.groupItemTitle || market.title || market.question || "",
        snapshot: snapshot.key,
        target_eastern: `${event.eventDate} ${String(snapshot.hour).padStart(2, "0")}:${String(snapshot.minute).padStart(2, "0")} ET`,
        snapshot_utc: nearest ? new Date(nearest.t * 1000).toISOString() : "",
        minutes_after_target: nearest ? round((nearest.t - targetTs) / 60, 2) : "",
        yes_price: nearest ? nearest.p : "",
        no_price: nearest ? round(1 - Number(nearest.p), 6) : "",
        yes_final: Number.isFinite(yesFinal) ? yesFinal : "",
        city: event.city,
        nearest_bucket: nearest ? nearestBucket(Number(nearest.p)) : "",
        snapshot_policy: "first_available_at_or_after_target",
        bucket_distance: nearest ? round(Math.abs(Number(nearest.p) - nearestBucket(Number(nearest.p))), 4) : "",
        price_history_id: yesTokenId,
        price_history_source: historyResult.source || "unavailable",
        missing_price_reason: nearest ? "" : (historyResult.note || "No public historical price point returned for this token")
      });
    }
  }

  const csvPath = path.join(OUT_DIR, "primary-weather-price-history.csv");
  const jsonPath = path.join(OUT_DIR, "primary-weather-price-history.json");
  const summaryPath = path.join(OUT_DIR, "latest-summary.json");

  await fs.writeFile(csvPath, toCsv(rows), "utf8");
  await fs.writeFile(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), days: DAYS, cutoff, today, events, rows, errors }, null, 2), "utf8");
  const selectedRows = selectClosestContracts(rows);
  const bucketSummary = bucketAnalysis(selectedRows);
  const cityBucketSummary = cityBucketAnalysis(selectedRows);
  const errorCounts = countBy(errors, (error) => error.error || "unknown");
  await fs.writeFile(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "Polymarket Gamma public event slugs + public CLOB prices-history",
    query: SEARCH_QUERY,
    primaryCities: [...PRIMARY_CITIES],
    citySnapshotTimes: Object.fromEntries(CITY_SNAPSHOT_TIMES.entries()),
    priceBuckets: PRICE_BUCKETS,
    days: DAYS,
    cutoff,
    today,
    maxEvents: MAX_EVENTS,
    events: events.length,
    markets: new Set(rows.map((row) => row.market_slug)).size,
    rows: rows.length,
    selectedRows: selectedRows.length,
    snapshotsWithPrice: rows.filter((row) => row.yes_price !== "").length,
    bucketSummary,
    cityBucketSummary,
    recommendedBucketAdjustments: recommendedBucketAdjustments(bucketSummary),
    errors: errors.length,
    sourceNotes: sourceNotes.length,
    errorCounts,
    sourceNoteCounts: countBy(sourceNotes, (row) => row.note || "unknown"),
    csvPath,
    jsonPath
  }, null, 2), "utf8");

  console.log(JSON.stringify({
    csvPath,
    jsonPath,
    events: events.length,
    rows: rows.length,
    selectedRows: selectedRows.length,
    snapshotsWithPrice: rows.filter((row) => row.yes_price !== "").length,
    bucketSummary,
    cityBucketSummary,
    errors: errors.length,
    errorCounts
  }, null, 2));
}

async function discoverEvents() {
  const events = [];
  const dates = eachDate(cutoff, today);
  for (const eventDate of dates) {
    for (const city of PRIMARY_CITIES) {
      const event = await fetchGammaEventForCityDate(city, eventDate).catch((error) => {
        console.warn(`gamma miss ${city} ${eventDate}: ${error.message}`);
        return null;
      });
      if (!event) continue;
      const eventClosed = event.closed === true || String(eventDate) < today;
      events.push({ ...event, eventDate, city, closed: eventClosed });
      if (events.length >= MAX_EVENTS) return events;
      await delay(35);
    }
  }
  return events.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.slug.localeCompare(b.slug));
}

async function fetchGammaEventForCityDate(city, eventDate) {
  const citySlug = GAMMA_CITY_SLUGS.get(city);
  if (!citySlug) return null;
  const slug = `highest-temperature-in-${citySlug}-on-${dateSlug(eventDate)}`;
  const url = new URL("/events", POLYMARKET_GAMMA_BASE);
  url.searchParams.set("slug", slug);
  const data = await fetchJson(url);
  const event = Array.isArray(data) ? data[0] : null;
  if (!event || !Array.isArray(event.markets) || !event.markets.length) return null;
  return event;
}


async function fetchBatchAvailablePriceHistory(tokenIds, startTs, endTs) {
  const result = new Map();
  const clobTokenIds = tokenIds.filter(isLikelyClobTokenId);
  for (const tokenId of tokenIds) {
    if (!isLikelyClobTokenId(tokenId)) {
      result.set(tokenId, {
        history: [],
        source: "non-clob-token",
        note: "Token is not a public CLOB token id"
      });
    }
  }
  for (let i = 0; i < clobTokenIds.length; i += 20) {
    const batch = clobTokenIds.slice(i, i + 20);
    const batchResult = await fetchPublicClobBatchHistory(batch, startTs, endTs).catch((error) => ({
      history: {},
      source: "clob.polymarket.com/batch-prices-history",
      note: `Batch CLOB history unavailable: ${error.message}`
    }));
    for (const tokenId of batch) {
      const history = Array.isArray(batchResult.history?.[tokenId]) ? batchResult.history[tokenId] : [];
      result.set(tokenId, {
        history,
        source: batchResult.source || "clob.polymarket.com/batch-prices-history",
        note: history.length ? "" : (batchResult.note || "No CLOB batch history returned for token")
      });
    }
    await delay(20);
  }
  return result;
}

async function fetchPublicClobBatchHistory(tokenIds, startTs, endTs) {
  const url = new URL("/batch-prices-history", POLYMARKET_PUBLIC_CLOB_BASE);
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      markets: tokenIds,
      start_ts: Math.floor(startTs),
      end_ts: Math.floor(endTs),
      interval: "1m",
      fidelity: 60
    })
  });
  if (!response.ok) throw new Error(`${url.hostname} ${response.status}`);
  const data = await response.json();
  return { history: data.history || {}, source: "clob.polymarket.com/batch-prices-history" };
}

async function fetchAvailablePriceHistory(tokenId, startTs, endTs) {
  // Polymarket US gateway exposes archived event/final-outcome data. Historical
  // price timestamps should exist somewhere in trade/report data, but this public
  // CLOB route only works when a true CLOB token id is present. Keep this bounded
  // while the official Report API or another verified history source is wired.
  if (!isLikelyClobTokenId(tokenId)) {
    return {
      history: [],
      source: "polymarket.us-gateway-archive",
      note: "US archive side is not a public CLOB token id; historical prices need official report/trade-history source"
    };
  }
  const publicClob = await fetchPublicClobHistory(tokenId, startTs, endTs).catch((error) => ({
    history: [],
    source: "clob.polymarket.com",
    note: `Public CLOB history unavailable: ${error.message}`
  }));
  if (Array.isArray(publicClob.history) && publicClob.history.length) return publicClob;
  return {
    history: [],
    source: publicClob.source || "clob.polymarket.com",
    note: publicClob.note || "US archive side has no public CLOB price history; final settlement only"
  };
}

async function fetchPublicClobHistory(tokenId, startTs, endTs) {
  const url = new URL("/prices-history", POLYMARKET_PUBLIC_CLOB_BASE);
  url.searchParams.set("market", tokenId);
  url.searchParams.set("startTs", String(Math.floor(startTs)));
  url.searchParams.set("endTs", String(Math.floor(endTs)));
  url.searchParams.set("fidelity", "60");
  const data = await fetchJson(url);
  return { history: Array.isArray(data.history) ? data.history : [], source: "clob.polymarket.com" };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url.hostname} ${response.status}`);
  return response.json();
}

function isLikelyClobTokenId(value) {
  return /^\d{30,}$/.test(String(value || ""));
}

function firstHistoryPointAtOrAfter(history, targetTs) {
  let best = null;
  for (const point of history || []) {
    const t = Number(point.t);
    const p = Number(point.p);
    if (!Number.isFinite(t) || !Number.isFinite(p)) continue;
    if (t < targetTs) continue;
    if (!best || t < best.t) {
      best = { t, p };
    }
  }
  return best;
}

function yesMarketSide(market = {}) {
  const outcomes = parseJsonishArray(market.outcomes);
  const outcomePrices = parseJsonishArray(market.outcomePrices).map(Number);
  const tokenIds = parseJsonishArray(market.clobTokenIds);
  const yesIndex = outcomes.findIndex((outcome) => /^yes$/i.test(String(outcome || "")));
  if (tokenIds.length) {
    return {
      priceHistoryId: tokenIds[yesIndex >= 0 ? yesIndex : 0],
      finalPrice: Number.isFinite(outcomePrices[yesIndex]) ? outcomePrices[yesIndex] : null
    };
  }

  const sides = Array.isArray(market.marketSides) ? market.marketSides : [];
  const yesSide = sides.find((side) => /^yes$/i.test(String(side.description || "")) || side.long === true);
  if (!yesSide) return null;
  return {
    priceHistoryId: yesSide.id || yesSide.identifier || market.id || market.slug,
    finalPrice: Number(yesSide.price)
  };
}

function eventDateFromEvent(event) {
  const source = event.endDate || event.endDateIso || "";
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? easternDate(new Date(parsed)) : "";
}

function eachDate(startDate, endDate) {
  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function dateSlug(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthName = new Date(year, month - 1, day).toLocaleString("en-US", { month: "long" }).toLowerCase();
  return `${monthName}-${day}-${year}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cityFromTitle(title) {
  const match = String(title || "").match(/^Highest temperature in (.+?) on /i);
  if (!match) return "";
  const raw = match[1].trim();
  return raw === "NYC" ? "New York" : raw;
}

function nearestBucket(price) {
  let best = PRICE_BUCKETS[0];
  for (const bucket of PRICE_BUCKETS) {
    if (Math.abs(price - bucket) < Math.abs(price - best)) best = bucket;
  }
  return best;
}

function selectClosestContracts(rows) {
  const byCityDay = groupBy(
    rows.filter((row) => row.yes_price !== "" && row.yes_price != null && Number.isFinite(Number(row.yes_price))),
    (row) => `${row.event_slug}|${row.city}|${row.event_date}`
  );
  const selected = [];
  for (const [, cityDayRows] of byCityDay.entries()) {
    for (const bucket of PRICE_BUCKETS) {
      const ranked = [...cityDayRows].sort((a, b) =>
        Math.abs(Number(a.yes_price) - bucket) - Math.abs(Number(b.yes_price) - bucket)
        || String(a.market_slug).localeCompare(String(b.market_slug))
      );
      const best = ranked[0];
      if (!best) continue;
      const bestDistance = Math.abs(Number(best.yes_price) - bucket);
      const nearTies = ranked.filter((row) => Math.abs(Math.abs(Number(row.yes_price) - bucket) - bestDistance) <= 0.005);
      selected.push({
        ...best,
        target_bucket: bucket,
        bucket_distance: round(bestDistance, 4),
        ambiguous_bucket_pick: nearTies.length > 1,
        ambiguous_candidates: nearTies.length
      });
    }
  }
  return selected;
}

function bucketAnalysis(selectedRows) {
  const byBucket = new Map();
  for (const row of selectedRows) {
    if (row.yes_price === "" || row.yes_price == null) continue;
    const price = Number(row.yes_price);
    const final = Number(row.yes_final);
    if (!Number.isFinite(price) || !Number.isFinite(final)) continue;
    const bucket = Number(row.target_bucket);
    const key = bucket.toFixed(2);
    const entry = byBucket.get(key) || {
      bucket,
      rows: 0,
      wins: 0,
      avgPrice: 0,
      avgDistance: 0,
      ambiguous: 0
    };
    entry.rows += 1;
    entry.wins += final >= 0.99 ? 1 : 0;
    entry.avgPrice += price;
    entry.avgDistance += Number(row.bucket_distance);
    entry.ambiguous += row.ambiguous_bucket_pick ? 1 : 0;
    byBucket.set(key, entry);
  }

  return [...byBucket.values()].map((entry) => {
    const winRate = entry.rows ? entry.wins / entry.rows : 0;
    const avgPrice = entry.rows ? entry.avgPrice / entry.rows : 0;
    return {
      bucket: round(entry.bucket, 2),
      rows: entry.rows,
      wins: entry.wins,
      actualHitRate: round(winRate, 4),
      avgPrice: round(avgPrice, 4),
      yesBuyEv: round(winRate - avgPrice, 4),
      avgBucketDistance: round(entry.avgDistance / entry.rows, 4),
      ambiguousPicks: entry.ambiguous
    };
  }).sort((a, b) => b.bucket - a.bucket);
}


function cityBucketAnalysis(selectedRows) {
  const byCityBucket = new Map();
  for (const row of selectedRows) {
    if (row.yes_price === "" || row.yes_price == null) continue;
    const price = Number(row.yes_price);
    const final = Number(row.yes_final);
    if (!Number.isFinite(price) || !Number.isFinite(final)) continue;
    const bucket = Number(row.target_bucket);
    const key = `${row.city}|${bucket.toFixed(2)}`;
    const entry = byCityBucket.get(key) || {
      city: row.city,
      bucket,
      rows: 0,
      wins: 0,
      avgPrice: 0,
      minPrice: Infinity,
      maxPrice: -Infinity,
      avgDistance: 0,
      ambiguous: 0
    };
    entry.rows += 1;
    entry.wins += final >= 0.99 ? 1 : 0;
    entry.avgPrice += price;
    entry.minPrice = Math.min(entry.minPrice, price);
    entry.maxPrice = Math.max(entry.maxPrice, price);
    entry.avgDistance += Number(row.bucket_distance);
    entry.ambiguous += row.ambiguous_bucket_pick ? 1 : 0;
    byCityBucket.set(key, entry);
  }
  return [...byCityBucket.values()].map((entry) => {
    const hitRate = entry.rows ? entry.wins / entry.rows : 0;
    const avgPrice = entry.rows ? entry.avgPrice / entry.rows : 0;
    return {
      city: entry.city,
      bucket: round(entry.bucket, 2),
      rows: entry.rows,
      wins: entry.wins,
      actualHitRate: round(hitRate, 4),
      avgPrice: round(avgPrice, 4),
      minPrice: round(entry.minPrice, 4),
      maxPrice: round(entry.maxPrice, 4),
      yesBuyEv: round(hitRate - avgPrice, 4),
      avgBucketDistance: round(entry.avgDistance / entry.rows, 4),
      ambiguousPicks: entry.ambiguous
    };
  }).sort((a, b) => Math.abs(b.yesBuyEv) - Math.abs(a.yesBuyEv));
}

function recommendedBucketAdjustments(summary) {
  return summary
    .filter((row) => row.rows >= 8 && Math.abs(row.yesBuyEv) >= 0.10)
    .map((row) => {
      const note = row.avgBucketDistance > 0.04
        ? "wide rounding drift; consider adding adjacent bucket"
        : row.rows < 20
          ? "thin sample; monitor before betting"
          : "sample usable for review";
      return { bucket: row.bucket, rows: row.rows, yesBuyEv: row.yesBuyEv, actualHitRate: row.actualHitRate, note };
    });
}

function easternLocalTimestamp(date, hour, minute) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(new Date(year, month - 1, day, hour, minute, 0).getTime() / 1000);
}

function easternDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day + days, 12, 0, 0);
  return easternDate(value);
}

function parseJsonishArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows || []) {
    const key = keyFn(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function toCsv(rows) {
  const columns = [
    "event_date",
    "event_title",
    "event_slug",
    "market_slug",
    "bin",
    "snapshot",
    "target_eastern",
    "snapshot_utc",
    "minutes_after_target",
    "yes_price",
    "no_price",
    "yes_final",
    "city",
    "nearest_bucket",
    "snapshot_policy",
    "bucket_distance",
    "price_history_id",
    "price_history_source",
    "missing_price_reason"
  ];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ].join("\n") + "\n";
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(Number(value) * factor) / factor;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
