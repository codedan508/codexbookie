import { constants as cryptoConstants, sign as cryptoSign } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_BASE_URL = "https://external-api.kalshi.com/trade-api/v2";
const DEFAULT_SERIES = "KXBTCD";
const DEFAULT_LIMIT = 100;
const DEFAULT_DEPTH = 20;
const DEFAULT_INTERVAL_SECONDS = 5;
const DEFAULT_SAMPLES = 1;
const BTC_HOURLY_BLACKOUT_START_ET = 16;
const BTC_HOURLY_BLACKOUT_END_ET = 17;
const BTC_HOURLY_STRIKE_STEP_DOLLARS = 100;

const options = parseArgs(process.argv.slice(2));
const env = await loadEnv();
const config = await loadKalshiConfig(env);

if (!config.configured) {
  throw new Error("Kalshi API credentials are required. Public Kalshi API reads are disabled in this scanner.");
}

if (isBitcoinHourlyBlackoutNow()) {
  console.log("4:00 PM Eastern Time Bitcoin hourly pause: no 5:00 PM hourly contract exists. Scanning and recording are paused until 5:00 PM Eastern Time, then resume for the 6:00 PM hourly.");
  process.exit(0);
}

const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, "-");

const seriesTicker = options.series || env.KALSHI_SCANNER_SERIES || DEFAULT_SERIES;
const limit = clampInt(options.limit || env.KALSHI_SCANNER_LIMIT, 1, 1000, DEFAULT_LIMIT);
const depth = clampInt(options.depth || env.KALSHI_SCANNER_DEPTH, 1, 100, DEFAULT_DEPTH);
const intervalSeconds = clampInt(options.interval || env.KALSHI_SCANNER_INTERVAL_SECONDS, 1, 300, DEFAULT_INTERVAL_SECONDS);
const samples = clampInt(options.samples || env.KALSHI_SCANNER_SAMPLES, 1, 1000000, DEFAULT_SAMPLES);
const includeOrderbooks = options.books !== "false";
const btcSpot = await getBtcSpotPrice();

if (!Number.isFinite(btcSpot?.price)) {
  throw new Error("Bitcoin recording blocked: actual BTC price is not connected, so strike rows were not saved.");
}

let totalRows = 0;
for (let sample = 0; sample < samples; sample += 1) {
  if (isBitcoinHourlyBlackoutNow()) {
    console.log("4:00 PM Eastern Time Bitcoin hourly pause: no 5:00 PM hourly contract exists. Scanning and recording are paused until 5:00 PM Eastern Time, then resume for the 6:00 PM hourly.");
    break;
  }
  const markets = (await fetchMarkets(seriesTicker, limit)).filter(isBitcoinHourlyMarket).filter(validBitcoinHourlyStrike);
  const currentEvent = selectCurrentEventMarkets(markets);
  const timestamp = new Date();
  const rows = activeStrikeRows(currentEvent, timestamp, btcSpot);
  await persistSpotLine(btcSpot, timestamp, currentEvent, rows);
  await persistContractLines(rows);
  totalRows += rows.length;
  console.log(`Sample ${sample + 1}/${samples}: saved ${rows.length} active strike rows`);
  if (sample < samples - 1) await sleep(intervalSeconds * 1000);
}

console.log(`Saved ${totalRows} active strike rows to records/BITCOIN SCAN RECORDING/bitcoin strike price log and BTC spot rows to records/BITCOIN SCAN RECORDING/bitcoin spot price log`);

async function fetchMarkets(series, maxMarkets) {
  const params = new URLSearchParams({
    series_ticker: series,
    status: "open",
    limit: String(maxMarkets)
  });
  const data = await kalshiFetch(`/markets?${params.toString()}`);
  return Array.isArray(data.markets) ? data.markets : [];
}

async function kalshiFetch(apiPath) {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "Kalshi Scanner recorder"
  };

  const method = "GET";
  const timestamp = String(Date.now());
  const basePath = new URL(baseUrl).pathname.replace(/\/$/, "");
  const signPath = `${basePath}${apiPath.split("?")[0]}`;
  const message = `${timestamp}${method}${signPath}`;
  headers["KALSHI-ACCESS-KEY"] = config.apiKeyId;
  headers["KALSHI-ACCESS-TIMESTAMP"] = timestamp;
  headers["KALSHI-ACCESS-SIGNATURE"] = cryptoSign("sha256", Buffer.from(message), {
    key: config.privateKeyPem,
    padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
    saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST
  }).toString("base64");

  const response = await fetch(`${baseUrl}${apiPath}`, { headers });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText || "Kalshi request failed";
    throw new Error(`${response.status} ${message}`);
  }
  return data;
}

function compactMarketRecord(market) {
  return {
    type: "market",
    ticker: market.ticker || "",
    eventTicker: market.event_ticker || "",
    seriesTicker: market.series_ticker || "",
    title: market.title || market.subtitle || "",
    closeTime: market.close_time || market.expected_expiration_time || "",
    yesBid: cents(market.yes_bid_dollars ?? market.yes_bid),
    yesAsk: cents(market.yes_ask_dollars ?? market.yes_ask),
    noBid: cents(market.no_bid_dollars ?? market.no_bid),
    noAsk: cents(market.no_ask_dollars ?? market.no_ask),
    volume: numberOrZero(market.volume),
    openInterest: numberOrZero(market.open_interest)
  };
}

function selectCurrentEventMarkets(markets) {
  const future = markets
    .map((market) => ({ market, end: Date.parse(market.close_time || market.expected_expiration_time || "") }))
    .filter((item) => Number.isFinite(item.end) && item.end > Date.now())
    .sort((a, b) => a.end - b.end);
  const eventTicker = future[0]?.market?.event_ticker || markets[0]?.event_ticker || "";
  return markets.filter((market) => market.event_ticker === eventTicker);
}

async function getBtcSpotPrice() {
  const url = String(env.KALSHI_BTC_SPOT_URL || env.BTC_SPOT_URL || env.BTC_PRICE_URL || "").trim();
  if (!url) return null;
  const parsed = new URL(url);
  if (!/(\.|^)kalshi\.com$/i.test(parsed.hostname)) {
    throw new Error("KALSHI_BTC_SPOT_URL must be an approved Kalshi endpoint.");
  }
  const headers = { accept: "application/json" };
  if (env.BTC_PRICE_API_KEY) headers.authorization = `Bearer ${env.BTC_PRICE_API_KEY}`;
  const response = await fetch(url, { headers });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { value: extractBtcPriceFromText(text) };
  }
  if (!response.ok) throw new Error(`BTC price source failed: ${response.status}`);
  const price = extractBtcPrice(data, env.BTC_PRICE_INDEX || "BRTI");
  if (!Number.isFinite(price)) throw new Error("Kalshi BTC spot source did not return a usable BTC price.");
  return { price, source: "Kalshi public BTC spot" };
}

function activeStrikeRows(markets, timestamp, btcSpot) {
  const btcPrice = Number(btcSpot?.price);
  if (!Number.isFinite(btcPrice)) return [];
  return markets
    .map((market) => ({
      timestamp: timestamp.toISOString(),
      contract_end_time: market.close_time || market.expected_expiration_time || "",
      event_ticker: market.event_ticker || "",
      btc_price: Math.round(btcPrice),
      btc_price_source: btcSpot.source || "BTC spot",
      ticker: market.ticker || "",
      strike: bitcoinStrike(market),
      yes_ask: dollarsDecimal(market.yes_ask_dollars ?? market.yes_ask),
      no_ask: dollarsDecimal(market.no_ask_dollars ?? market.no_ask),
      yes_bid: dollarsDecimal(market.yes_bid_dollars ?? market.yes_bid),
      no_bid: dollarsDecimal(market.no_bid_dollars ?? market.no_bid)
    }))
    .filter((row) => Math.abs(Number(row.strike) - btcPrice) <= BTC_HOURLY_STRIKE_STEP_DOLLARS * 5)
    .filter((row) => isActiveAsk(row.yes_ask) || isActiveAsk(row.no_ask))
    .sort((a, b) => a.strike - b.strike);
}

async function persistSpotLine(btcSpot, timestamp, markets, rows) {
  const contractEndTime = rows[0]?.contract_end_time || markets[0]?.close_time || markets[0]?.expected_expiration_time || "";
  const decision = Date.parse(contractEndTime);
  if (!Number.isFinite(decision)) return;
  const dir = path.join(__dirname, "records", "BITCOIN SCAN RECORDING", "bitcoin spot price log", easternDate(new Date(decision)));
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `btc-spot-${easternHour(new Date(decision))}00-et.txt`);
  await fs.appendFile(file, `BTC SPOT PRICE - $${Math.round(btcSpot.price).toLocaleString()} - ${timestamp.toISOString()}\n`, "utf8");
}

async function persistContractLines(rows) {
  if (!rows.length) return;
  const decision = Date.parse(rows[0].contract_end_time || "");
  if (!Number.isFinite(decision)) return;
  const dir = path.join(__dirname, "records", "BITCOIN SCAN RECORDING", "bitcoin strike price log", easternDate(new Date(decision)));
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `btc-hourly-${easternHour(new Date(decision))}00-et.txt`);
  const body = rows.map((row) => {
    const expiry = formatContractExpiry(row.contract_end_time);
    const strike = `$${Number(row.strike).toLocaleString()}`;
    return `BTC HOURLY (${expiry}) - ${strike} - YES ABOVE ${centsText(row.yes_ask)} | NO ABOVE ${centsText(row.no_ask)} - ${row.timestamp}`;
  }).join("\n");
  await fs.appendFile(file, `${body}\n`, "utf8");
}

function formatContractExpiry(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function centsText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number * 100)}c`;
}

function extractBtcPrice(data, index = "BRTI") {
  const wanted = String(index || "BRTI").toUpperCase();
  const direct = [
    data?.value,
    data?.price,
    data?.last,
    data?.indexValue,
    data?.latestValue
  ].map(Number).find(Number.isFinite);
  if (Number.isFinite(direct)) return direct;
  const arrays = [data?.values, data?.latest_values, data?.data, data?.indices, data?.results].filter(Array.isArray);
  for (const array of arrays) {
    for (const item of array) {
      const id = String(item?.id || item?.externalId || item?.index || item?.symbol || item?.ticker || "").toUpperCase();
      if (id && id !== wanted) continue;
      const value = [item?.value, item?.price, item?.last, item?.indexValue, item?.latestValue].map(Number).find(Number.isFinite);
      if (Number.isFinite(value)) return value;
    }
  }
  return extractBtcPriceFromText(JSON.stringify(data));
}

function extractBtcPriceFromText(text) {
  const match = String(text || "").match(/\$?\s*(\d{2,3},\d{3}(?:\.\d+)?|\d{5,6}(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function isActiveAsk(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0.02 && number <= 0.98;
}

function csvRow(row) {
  return [
    row.timestamp,
    row.contract_end_time,
    row.event_ticker,
    row.btc_price,
    row.btc_price_source,
    row.ticker,
    row.strike,
    row.yes_ask,
    row.no_ask,
    row.yes_bid,
    row.no_bid
  ].map(csvCell).join(",");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function dollarsDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const decimal = number > 1 ? number / 100 : number;
  return decimal.toFixed(2);
}

function isBitcoinHourlyBlackoutNow(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false
  }).format(now));
  return hour >= BTC_HOURLY_BLACKOUT_START_ET && hour < BTC_HOURLY_BLACKOUT_END_ET;
}

function isBitcoinHourlyMarket(market) {
  const text = `${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase();
  return text.includes("KXBTCD") && /KXBTCD-\d{2}[A-Z]{3}\d{4}-T\d/i.test(text);
}

function validBitcoinHourlyStrike(market) {
  const strike = bitcoinStrike(market);
  return Number.isFinite(strike) && Math.abs(strike % BTC_HOURLY_STRIKE_STEP_DOLLARS) < 0.01;
}

function bitcoinStrike(market) {
  const text = `${market.ticker || ""} ${market.title || ""}`.replace(/,/g, "");
  const thresholdMatch = text.match(/-T(\d+(?:\.\d+)?)/i);
  if (thresholdMatch) return Math.round(Number(thresholdMatch[1]) + 0.01);
  const titleMatch = text.match(/\$?\s*(\d{2,6}(?:\.\d+)?)\s*(?:or above|to)/i);
  if (titleMatch) return Number(titleMatch[1]);
  return NaN;
}

function easternDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function easternHour(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false
  }).format(date);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactOrderbook(data) {
  const book = data.orderbook_fp || data.orderbook || data;
  return {
    yes: compactLevels(book.yes_dollars || book.yes || []),
    no: compactLevels(book.no_dollars || book.no || [])
  };
}

function compactLevels(levels) {
  return levels.slice(0, 10).map((level) => {
    if (Array.isArray(level)) return [cents(level[0]), numberOrZero(level[1])];
    return [cents(level.price_dollars ?? level.price), numberOrZero(level.quantity ?? level.count)];
  });
}

function cents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number <= 1 ? Math.round(number * 100) : Math.round(number);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

async function loadEnv() {
  const candidates = [
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", "kalshi-live-credentials-setup", ".env")
  ];
  for (const file of candidates) {
    try {
      return parseEnv(await fs.readFile(file, "utf8"));
    } catch {}
  }
  return {};
}

async function loadKalshiConfig(env) {
  const privateKeyPath = env.KALSHI_PRIVATE_KEY_PATH || "";
  const privateKeyPem = privateKeyPath && existsSync(privateKeyPath)
    ? await fs.readFile(privateKeyPath, "utf8")
    : "";
  return {
    configured: Boolean(env.KALSHI_API_KEY_ID && privateKeyPem),
    apiKeyId: env.KALSHI_API_KEY_ID || "",
    privateKeyPem,
    baseUrl: env.KALSHI_BASE_URL || DEFAULT_BASE_URL
  };
}

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    out[key] = value;
  }
  return out;
}
