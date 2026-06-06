import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(APP_DIR, "public");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.EV_COMMAND_CENTER_PORT || 2040);
const MIN_GAMES = 50;
const MAKER_APP_BASE = process.env.MAKER_APP_BASE || "http://127.0.0.1:2010";

const ATTACHED_APPS = [
  { id: "mlb-moneyline-start", name: "MLB Moneyline", authority: "MLB", oddsFeed: "Polymarket", snapshot: "game start", baseUrl: "http://127.0.0.1:2030" },
  { id: "mlb-yrfi-nrfi-3am", name: "MLB YRFI/NRFI", authority: "MLB", oddsFeed: "Polymarket", snapshot: "current model", baseUrl: "http://127.0.0.1:2021" },
  { id: "mlb-totals-start", name: "MLB Totals", authority: "MLB", oddsFeed: "Polymarket", snapshot: "game start", baseUrl: "http://127.0.0.1:2032" }
];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      return json(res, 200, await dashboard());
    }
    if (req.method === "POST" && url.pathname === "/api/refresh-reports") {
      return json(res, 200, await dashboard());
    }
    if (req.method === "POST" && url.pathname === "/api/get-data-all") {
      const updates = await runGetDataAll();
      const fresh = await dashboard();
      return json(res, 200, { updates, ...fresh });
    }
    if (req.method === "POST" && url.pathname === "/api/matching-bets") {
      return json(res, 200, await matchingBets());
    }
    if (req.method === "POST" && url.pathname === "/api/offer-found-bets") {
      const body = await readJson(req);
      const matches = Array.isArray(body.matches) ? body.matches : [];
      if (!matches.length) return text(res, 400, "No found bets supplied. Click Find Bets first.");
      const result = await fetchJson(`${MAKER_APP_BASE}/api/found-bets`, {
        method: "POST",
        timeoutMs: 8 * 60_000,
        body: JSON.stringify({ matches })
      });
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/get-data/")) {
      const id = decodeURIComponent(url.pathname.split("/").at(-1) || "");
      const app = ATTACHED_APPS.find((item) => item.id === id);
      if (!app) return text(res, 404, "Unknown app");
      const update = await callGetData(app);
      return json(res, 200, { update, ...(await dashboard()) });
    }
    if (req.method === "GET") {
      const filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
      if (!filePath.startsWith(PUBLIC_DIR)) return text(res, 403, "Forbidden");
      return send(res, 200, await fs.readFile(filePath), contentType(filePath));
    }
    return text(res, 404, "Not found");
  } catch (error) {
    return text(res, 500, error.stack || error.message || String(error));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`EV Command Center running at http://${HOST}:${PORT}`);
});

async function dashboard() {
  const reports = await Promise.all(ATTACHED_APPS.map(readAttachedReport));
  const candidates = reports.flatMap((report) => report.candidates).sort(compareCandidates);
  return {
    generatedAt: new Date().toISOString(),
    minGames: MIN_GAMES,
    apps: reports.map(({ candidates, ...report }) => ({ ...report, candidateCount: candidates.length })),
    best: candidates.slice(0, 12),
    byApp: reports.map((report) => ({
      appId: report.app.id,
      appName: report.app.name,
      snapshot: report.app.snapshot,
      status: report.status,
      best: report.candidates.slice().sort(compareCandidates).slice(0, 3)
    }))
  };
}

async function matchingBets() {
  const board = await dashboard();
  const criteria = board.best.map(candidateToCriteria).filter(Boolean);
  const events = await currentPolymarketMlbEvents();
  const matches = [];
  for (const event of events) {
    for (const market of event.markets || []) {
      for (const criterion of criteria) {
        const match = matchMarket(event, market, criterion);
        if (match) matches.push(match);
      }
    }
  }
  const deduped = [];
  const seen = new Set();
  for (const match of matches.sort(compareMatches)) {
    const key = `${match.marketId}|${match.side}|${match.criterionLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(match);
  }
  const bestByGameAndSystem = bestMatchPerGameAndSystem(deduped);
  const exposure = await makerExposureSnapshot().catch(() => ({ marketSlugs: new Set() }));
  const placeable = bestByGameAndSystem.filter((match) => !matchHasLiveExposure(match, exposure));
  return {
    generatedAt: new Date().toISOString(),
    matchDate: currentMatchDate(),
    criteriaCount: criteria.length,
    eventsChecked: events.length,
    rawMatches: bestByGameAndSystem.length,
    hiddenLiveExposure: bestByGameAndSystem.length - placeable.length,
    matches: placeable.slice(0, 80)
  };
}

async function makerExposureSnapshot() {
  const state = await fetchJson(`${MAKER_APP_BASE}/api/state`, { timeoutMs: 20_000 });
  const marketSlugs = new Set();
  for (const order of state.openOrdersLive || []) {
    if (order.marketSlug) marketSlugs.add(String(order.marketSlug));
    if (order.marketMetadata?.slug) marketSlugs.add(String(order.marketMetadata.slug));
  }
  for (const position of state.positionsLive || []) {
    if (position.marketSlug) marketSlugs.add(String(position.marketSlug));
    if (position.marketMetadata?.slug) marketSlugs.add(String(position.marketMetadata.slug));
  }
  return { marketSlugs };
}

function matchHasLiveExposure(match, exposure) {
  return candidateGatewaySlugs(match).some((slug) => exposure.marketSlugs.has(slug));
}

function candidateGatewaySlugs(match) {
  const raw = String(match?.marketSlug || "").trim();
  const type = String(match?.marketType || "").toLowerCase();
  const line = Number(match?.line);
  const slugs = [];
  const add = (slug) => {
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  };

  add(raw);
  if (raw.startsWith("aec-") || raw.startsWith("astatc-") || raw.startsWith("tsc-")) return slugs;

  if (type === "moneyline") {
    add(`aec-${raw}`);
    addGatewayTeamAliases(`aec-${raw}`, add);
  } else if (type === "nrfi") {
    const base = raw.replace(/-nrfi$/i, "").replace(/-yrfi$/i, "");
    add(`astatc-${base}-yrfi`);
    addGatewayTeamAliases(`astatc-${base}-yrfi`, add);
  } else if (type === "totals" && Number.isFinite(line)) {
    const base = raw.replace(/-over-under-\d+(?:\.\d+)?$/i, "").replace(/-totals-\d+(?:\.\d+)?$/i, "");
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

function formatTotalLineForSlug(line) {
  return String(Number(line).toFixed(1)).replace(".", "pt");
}

function bestMatchPerGameAndSystem(matches) {
  const best = new Map();
  for (const match of matches) {
    const key = `${match.eventSlug || match.eventTitle}|${match.sourceApp}`;
    const current = best.get(key);
    if (!current || compareSystemMatches(match, current) < 0) best.set(key, match);
  }
  return [...best.values()].sort(compareMatches);
}

function compareSystemMatches(a, b) {
  return b.criterionEvPct - a.criterionEvPct
    || b.criterionGames - a.criterionGames
    || b.criterionScore - a.criterionScore
    || b.price - a.price
    || a.startTime.localeCompare(b.startTime);
}

function candidateToCriteria(item) {
  const label = String(item.label || "");
  const bucket = label.match(/(\d+)-(\d+)/);
  if (!bucket) return null;
  const low = Number(bucket[1]);
  const high = Number(bucket[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;

  const total = label.match(/\b(Over|Under)\s+(\d+(?:\.\d+)?)\s+(\d+-\d+)/i);
  if (total) {
    return {
      type: "totals",
      side: titleCase(total[1]),
      line: Number(total[2]),
      low,
      high,
      source: item
    };
  }

  const yrfi = label.match(/\b(YRFI|NRFI|Yes|No)\s+(\d+-\d+)/i);
  if (yrfi) {
    const raw = yrfi[1].toLowerCase();
    return {
      type: "nrfi",
      side: raw === "yrfi" || raw === "yes" ? "Yes" : "No",
      low,
      high,
      source: item
    };
  }

  const moneyline = label.match(/\b(Home|Away)\s+(\d+-\d+)/i);
  if (moneyline) {
    return {
      type: "moneyline",
      side: titleCase(moneyline[1]),
      low,
      high,
      source: item
    };
  }

  return null;
}

async function currentPolymarketMlbEvents() {
  const urls = [
    "https://gamma-api.polymarket.com/events?limit=100&closed=false&tag_slug=mlb&order=volume24hr&ascending=false",
    "https://gamma-api.polymarket.com/events?limit=100&closed=false&tag_slug=mlb&order=startDate&ascending=true"
  ];
  const lists = await Promise.all(urls.map((url) => fetchJson(url, { timeoutMs: 15_000 }).catch(() => [])));
  const targetDate = currentMatchDate();
  const bySlug = new Map();
  for (const event of lists.flat()) {
    const slug = String(event.slug || "");
    const match = slug.match(/^mlb-[a-z0-9]+-[a-z0-9]+-(2026-\d{2}-\d{2})$/);
    if (!match || match[1] !== targetDate) continue;
    if (event.ended === true) continue;
    bySlug.set(slug, event);
  }
  return [...bySlug.values()];
}

function currentMatchDate() {
  return process.env.MATCH_DATE || etDate(new Date());
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

function matchMarket(event, market, criterion) {
  const marketType = String(market.sportsMarketType || "").toLowerCase();
  if (criterion.type !== marketType) return null;
  if (criterion.type === "totals" && Number(market.line) !== criterion.line) return null;

  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices).map((price) => Number(price) * 100);
  if (!outcomes.length || !prices.length) return null;

  const outcomeIndex = outcomeIndexFor(event, outcomes, criterion);
  if (outcomeIndex < 0) return null;
  const price = cleanCents(prices[outcomeIndex]);
  if (!priceInBucket(price, criterion.low, criterion.high)) return null;

  const source = criterion.source;
  return {
    sourceApp: source.appName,
    sourceSnapshot: source.snapshot,
    criterionLabel: source.label,
    criterionScore: source.score,
    criterionEvPct: source.evPct,
    criterionGames: source.games,
    criterionGamesLabel: source.gamesLabel,
    eventTitle: event.title || "",
    eventSlug: event.slug || "",
    startTime: event.startTime || market.gameStartTime || "",
    marketType,
    marketQuestion: market.question || "",
    marketSlug: market.slug || "",
    marketId: market.id || market.conditionId || "",
    side: String(outcomes[outcomeIndex] || criterion.side),
    displaySide: displaySide(criterion, outcomes[outcomeIndex]),
    line: criterion.line ?? market.line ?? "",
    price,
    bucket: `${criterion.low}-${criterion.high}`,
    url: `https://polymarket.us/event/${event.slug || ""}`
  };
}

function cleanCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.round(number * 10) / 10;
}

function outcomeIndexFor(event, outcomes, criterion) {
  if (criterion.type === "totals" || criterion.type === "nrfi") {
    return outcomes.findIndex((outcome) => String(outcome).toLowerCase() === criterion.side.toLowerCase());
  }
  if (criterion.type === "moneyline") {
    const teamName = teamForSide(event, criterion.side);
    if (!teamName) return -1;
    const normalized = normalizeText(teamName);
    return outcomes.findIndex((outcome) => normalizeText(outcome) === normalized);
  }
  return -1;
}

function teamForSide(event, side) {
  const ordering = side.toLowerCase();
  const team = (event.teams || []).find((item) => String(item.ordering || "").toLowerCase() === ordering);
  if (team?.name) return team.name;
  const parts = String(event.title || "").split(/\s+vs\.?\s+/i);
  if (parts.length === 2) return ordering === "away" ? parts[0] : parts[1];
  return "";
}

function displaySide(criterion, outcome) {
  if (criterion.type === "nrfi") return criterion.side === "Yes" ? "YRFI" : "NRFI";
  if (criterion.type === "totals") return criterion.side;
  return criterion.side;
}

function priceInBucket(price, low, high) {
  return Number.isFinite(price) && price >= low && price < high;
}

function compareMatches(a, b) {
  return b.criterionScore - a.criterionScore
    || b.criterionGames - a.criterionGames
    || b.criterionEvPct - a.criterionEvPct
    || a.startTime.localeCompare(b.startTime);
}

async function readAttachedReport(app) {
  const result = {
    app,
    status: "offline",
    latestPullDate: "",
    rowCount: 0,
    missingRows: 0,
    subtitle: "",
    error: "",
    candidates: []
  };
  try {
    const report = await fetchJson(`${app.baseUrl}/api/report`, { timeoutMs: 12_000 });
    result.status = "online";
    result.latestPullDate = report.latestPullDate || "";
    result.lastUpdatedAt = report.lastUpdatedAt || "";
    result.rowCount = Number(report.settledRows || report.assignedRows || report.totalRows || 0);
    result.filledRows = Number(report.filledRows || result.rowCount || 0);
    result.missingRows = Number(report.missingRows || 0);
    result.subtitle = report.subtitle || "";
    result.candidates = extractCandidates(app, report);
  } catch (error) {
    result.error = error.message || String(error);
  }
  return result;
}

function extractCandidates(app, report) {
  const primary = Array.isArray(report.analysis?.opportunities) && report.analysis.opportunities.length
    ? report.analysis.opportunities
    : Array.isArray(report.buckets) ? report.buckets : [];
  const seen = new Set();
  return primary
    .map((item) => normalizeCandidate(app, report, item))
    .filter((item) => {
      if (!item || item.games < MIN_GAMES || item.evPct <= 0) return false;
      const key = `${app.id}|${item.label}|${item.games}|${item.evPct.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({ ...item, score: opportunityScore(item) }))
    .sort(compareCandidates);
}

function normalizeCandidate(app, report, item) {
  const games = Number(item.games || 0);
  const wins = Number(item.wins ?? parseRecord(item.record).wins);
  const losses = Number(item.losses ?? parseRecord(item.record).losses);
  const evPct = Number(item.evPct ?? item.yesEvPct ?? item.overEvPct ?? 0);
  const weeklyEvPct = Number(item.weeklyEvDeltaPct || 0);
  const monthlyEvPct = Number(item.monthlyEvDeltaPct || 0);
  const winsOverBreakEven = Number(item.winsOverBreakEven || 0);
  if (!Number.isFinite(games) || !Number.isFinite(evPct)) return null;
  return {
    appId: app.id,
    appName: app.name,
    baseUrl: app.baseUrl,
    snapshot: app.snapshot,
    market: report.subtitle || app.name,
    latestPullDate: report.latestPullDate || "",
    label: item.displayLabel || item.label || item.pairLabel || item.key || "Unknown",
    pairLabel: item.pairLabel || item.label || "",
    games,
    totalGames: Number(item.totalGames || report.settledRows || report.assignedRows || report.totalRows || 0),
    gamesLabel: item.gamesLabel || `${games}`,
    wins: Number.isFinite(wins) ? wins : null,
    losses: Number.isFinite(losses) ? losses : null,
    evPct,
    weeklyEvPct,
    monthlyEvPct,
    winsOverBreakEven: Number.isFinite(winsOverBreakEven) ? winsOverBreakEven : 0,
    liveStatus: item.liveStatus || "",
    pattern: item.pattern || ""
  };
}

function opportunityScore(item) {
  const sample = Math.sqrt(Math.max(0, item.games)) * 1.6;
  const sampleShare = item.totalGames ? Math.min(12, item.games / item.totalGames * 60) : 0;
  const edge = Math.max(-20, Math.min(30, item.evPct)) * 1.1;
  const breakEven = Math.max(-10, Math.min(20, item.winsOverBreakEven)) * 2.3;
  const weekly = item.weeklyEvPct > 0 ? Math.min(12, item.weeklyEvPct / 2) : Math.max(-18, item.weeklyEvPct / 2);
  const monthly = item.monthlyEvPct > 0 ? Math.min(14, item.monthlyEvPct / 2) : Math.max(-22, item.monthlyEvPct / 2);
  const currentPenalty = item.weeklyEvPct < 0 && item.monthlyEvPct < 0 ? -35 : 0;
  return sample + sampleShare + edge + breakEven + weekly + monthly + currentPenalty;
}

function compareCandidates(a, b) {
  return b.score - a.score
    || b.games - a.games
    || b.evPct - a.evPct
    || b.winsOverBreakEven - a.winsOverBreakEven;
}

async function runGetDataAll() {
  const updates = [];
  for (const app of ATTACHED_APPS) {
    updates.push(await callGetData(app));
  }
  return updates;
}

async function callGetData(app) {
  try {
    const body = await fetchJson(`${app.baseUrl}/api/get-data`, { method: "POST", timeoutMs: 8 * 60_000 });
    return { appId: app.id, appName: app.name, status: "completed", update: body.update || body };
  } catch (error) {
    return { appId: app.id, appName: app.name, status: "failed", error: error.message || String(error) };
  }
}

async function fetchJson(url, { method = "GET", timeoutMs = 30_000, body = null } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {})
      },
      body
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${new URL(url).port} ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const textBody = Buffer.concat(chunks).toString("utf8");
  return textBody ? JSON.parse(textBody) : {};
}

function parseRecord(record) {
  const match = String(record || "").match(/(\d+)\D+(\d+)/);
  return { wins: match ? Number(match[1]) : NaN, losses: match ? Number(match[2]) : NaN };
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

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleCase(value) {
  const text = String(value || "").toLowerCase();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function json(res, status, body) {
  return send(res, status, Buffer.from(JSON.stringify(body)), "application/json");
}

function text(res, status, body) {
  return send(res, status, Buffer.from(body), "text/plain; charset=utf-8");
}

function send(res, status, body, type) {
  res.writeHead(status, {
    "content-type": type,
    "content-length": body.length,
    "cache-control": "no-store, no-cache, must-revalidate"
  });
  res.end(body);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
