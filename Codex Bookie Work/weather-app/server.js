import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { constants as cryptoConstants, createPrivateKey as cryptoCreatePrivateKey, randomUUID, sign as cryptoSign } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { app, expressCompat } = await createApp();
const PORT = Number(process.env.PORT || 3003);
const BASE_URLS = ["https://external-api.kalshi.com/trade-api/v2"];
const RESULTS_DIR = path.join(__dirname, "results");
const RECORDS_DIR = path.join(__dirname, "records");
const LOCAL_ENV_PATHS = [
  path.join(__dirname, ".env"),
  path.join(__dirname, "..", "kalshi-live-credentials-setup", ".env")
];
const WEBULL_OPENAPI_ENV_PATH = path.join(__dirname, "credentials", "WEBULL_OPENAPI.env");
const WEBULL_WEATHER_ROWS_SCRIPT = path.join(__dirname, "tools", "webull_weather_rows.py");
const WEBULL_PYTHON_PATH = path.join(__dirname, ".venv", "bin", "python");
const POLYMARKET_CLOB_ENV_PATH = path.join(__dirname, "credentials", "POLYMARKET_CLOB.env");
const DEFAULT_SETTINGS = {
  accountValue: 20,
  contracts: 10,
  minNetProfitPct: 10,
  minDisplayEvPct: 5,
  maxTradeDollars: 0,
  maxOpenDollars: 0,
  minBuyPriceCents: 55,
  minTargetProfitDollars: 0.5,
  feeCushionCents: 3,
  skipComboMarkets: true,
  enableBitcoin: false,
  enableBitcoinArb: false,
  enableOtherMarkets: false,
  enableSportsArb: false,
  enableSpArb: false,
  enableGoldScanning: false,
  enableCrudeOilScanning: false,
  enableWeatherScanning: true,
  bookScanOnly: false,
  continuous: true,
  orderbookConcurrency: 2,
  candleConcurrency: 1,
  maxResults: 100
};
const KALSHI_STANDARD_FEE_RATE = 0.07;
const MAX_SPORTS_CLOSE_HOURS = 24;
const MAX_TOUCH_TARGET_CENTS = 90;
const BTC_MICRO_MAX_TARGET_CENTS = 98;
const MAX_TOUCH_DISTANCE_CENTS = 20;
const MIN_TOUCH_SAMPLE_CANDLES = 8;
const LIVE_MAX_CONTRACTS = 100;
const LIVE_MONITOR_MS = 500;
const LIVE_TARGET_ARM_RETRIES = 20;
const LIVE_TARGET_ARM_RETRY_MS = 500;
const LIVE_HIDE_TARGET_ORDERS = true;
const LIVE_AUTO_STOP_EXITS_ENABLED = true;
const LIVE_AUTO_LADDER_EXITS_ENABLED = false;
const LIVE_MAX_RISK_FRACTION = 0.1;
const LIVE_SIZING_ACCOUNT_CAP_DOLLARS = 20;
const LIVE_MAX_ENTRY_CASH_FRACTION = 1;
const LIVE_MAX_ENTRY_EQUITY_FRACTION = 1;
const USER_MAX_TRADE_DOLLARS_LIMIT = 50;
const USER_MAX_OPEN_DOLLARS_LIMIT = 100;
const LIVE_REENTRY_COOLDOWN_MS = 3 * 60 * 1000;
const LIVE_POSITION_RECONCILE_GRACE_MS = 3_000;
const LIVE_PORTFOLIO_RECONCILE_MS = 15_000;
const LIVE_SOFT_STOP_CONFIRMATIONS = 8;
const LIVE_ACTIVE_RECHECK_EVERY_PASSES = 2;
const LIVE_PROFIT_LOCK_PROGRESS = 0.65;
const LIVE_DEFAULT_MAX_DOLLARS_AT_RISK = 5;
const YES_ENTRY_MIN_CENTS = 55;
const YES_ENTRY_MAX_CENTS = 90;
const SIDE_ENTRY_MIN_CENTS = 55;
const SIDE_ENTRY_MAX_CENTS = 90;
const PAPER_STARTING_CASH = 0;
const PAPER_MAX_CONTRACTS = LIVE_MAX_CONTRACTS;
const PAPER_MONITOR_MS = LIVE_MONITOR_MS;
const PAPER_MAX_RISK_FRACTION = LIVE_MAX_RISK_FRACTION;
const PAPER_SOFT_STOP_CONFIRMATIONS = LIVE_SOFT_STOP_CONFIRMATIONS;
const PAPER_ACTIVE_RECHECK_EVERY_PASSES = LIVE_ACTIVE_RECHECK_EVERY_PASSES;
const PAPER_PROFIT_LOCK_PROGRESS = LIVE_PROFIT_LOCK_PROGRESS;
const DETAILED_REQUEST_MIN_GAP_MS = 300;
const CANDLE_CACHE_MS = 75_000;
const CANDLE_RATE_LIMIT_COOLDOWN_MS = 45_000;
const DETAIL_RATE_LIMIT_COOLDOWN_MS = 30_000;
const TENNIS_PAUSE_WINDOW_MS = 45_000;
const TENNIS_OBS_PAUSE_WINDOW_MS = 120_000;
const TENNIS_PAUSE_MAX_RANGE_CENTS = 0.5;
const MIN_TIME_LEFT_MINUTES = 10;
const BTC_HOURLY_FORCE_EXIT_MINUTES = 10;
const PRIORITY_SERIES = [
  "KXITFWMATCH",
  "KXATPMATCH",
  "KXWTAMATCH",
  "KXATP",
  "KXWTA",
  "KXMLSGAME",
  "KXBTC",
  "KXBTCD"
];
const BTC_SERIES = ["KXBTCD"];
const SP_HOURLY_SERIES = "KXINXU";
const TENNIS_SERIES = ["KXITFWMATCH", "KXATPMATCH", "KXWTAMATCH", "KXATP", "KXWTA"];
const SECONDARY_SERIES_GROUPS = [
  { name: "baseball", series: [] },
  { name: "basketball", series: ["KXNBAGAME", "KXWNBAGAME"] },
  { name: "hockey", series: ["KXNHLGAME"] },
  { name: "football", series: ["KXNFLGAME"] },
  { name: "calendar-other", series: [] }
];
const SECONDARY_MARKET_LIMIT = 4;
const SECONDARY_SCAN_EVERY_PASSES = 10;
const PRIORITY_MARKET_LIMIT = 18;
const DYNAMIC_GAME_SERIES_PER_PASS = 10;
const DYNAMIC_SERIES_CACHE_MS = 10 * 60 * 1000;
const WEATHER_SERIES_CACHE_MS = 30 * 60 * 1000;
const WEATHER_SERIES_PER_PASS = 40;
const WEATHER_DAY_SCAN_INTERVAL_MS = 60_000;
const WEATHER_NIGHT_SCAN_INTERVAL_MS = 60 * 60_000;
const WEATHER_BEACON_DAY_SCAN_INTERVAL_MS = 60_000;
const WEATHER_BEACON_NIGHT_SCAN_INTERVAL_MS = 60 * 60_000;
const WEATHER_BEACON_RECORDING_FOLDER = "official source weather log";
const WEATHER_GOV_HEADERS = {
  accept: "application/geo+json, application/json",
  "user-agent": "Prediction Weather local scanner; weather station research dashboard"
};
const POLYMARKET_US_API_BASE_URL = "https://api.polymarket.us";
const POLYMARKET_US_GATEWAY_BASE_URL = "https://gateway.polymarket.us";
const POLYMARKET_WEATHER_CACHE_MS = 5 * 60_000;
const WEBULL_WEATHER_CACHE_MS = 5 * 60_000;
const FANDUEL_WEATHER_CACHE_MS = 5 * 60_000;
const DRAFTKINGS_WEATHER_CACHE_MS = 5 * 60_000;
const SPORTS_FILTER_CACHE_MS = 60 * 60 * 1000;
const LIVE_MILESTONE_CACHE_MS = 20_000;
const LIVE_MILESTONE_EVENT_LIMIT = 80;
const POTENTIAL_LIVE_MILESTONE_EVENT_LIMIT = 120;
const LIVE_SERIES_FALLBACK_MARKET_LIMIT = 60;
const LIVE_SERIES_FALLBACK_MAX_SERIES = 8;
const LIVE_SERIES_FALLBACK_MAX_EVENT_AGE_HOURS = 5;
const BTC_INTERLEAVE_MS = 500;
const TENNIS_INTERLEAVE_EVERY_EVENTS = 2;
const BTC_INTERLEAVE_MARKET_LIMIT = 3;
const ORDERBOOK_DEPTH = 100;
const BTC_STARTUP_BOOTSTRAP_ATTEMPTS = 1;
const BTC_STARTUP_BOOTSTRAP_GAP_MS = 250;
const BTC_MICRO_MIN_TARGET_DISTANCE_CENTS = 1;
const BTC_MICRO_MAX_TARGET_DISTANCE_CENTS = 10;
const BTC_MICRO_MIN_TARGET_PROFIT_DOLLARS = 0.01;
const BTC_DESTROYER_TARGET_DISTANCE_CENTS = 6;
const BTC_DESTROYER_STOP_DISTANCE_CENTS = 30;
const BTC_RESEARCH_NORMAL_TARGET_CENTS = 8;
const BTC_RESEARCH_LATE_TARGET_CENTS = 3;
const BTC_RESEARCH_STOP_CENTS = 20;
const BTC_RESEARCH_LATE_STOP_CENTS = 40;
const BTC_RESEARCH_MAX_SPREAD_CENTS = 3;
const BTC_RESEARCH_MIN_ENTRY_CENTS = 45;
const BTC_RESEARCH_MAX_NORMAL_ENTRY_CENTS = 65;
const BTC_RESEARCH_LATE_ENTRY_CENTS = 90;
const BTC_RESEARCH_LATE_MINUTES = 14;
const BTC_RESEARCH_MOMENTUM_CENTS = 1;
const BTC_RESEARCH_SKEW_RATIO = 1.25;
const BTC_RESEARCH_MIN_NEAR_DEPTH = 50;
const BTC_RESEARCH_MIN_STRONG_DEPTH = 250;
const BTC_ENTRY_IOC_CUSHION_CENTS = 1;
const BTC_EV_SWING_TARGET_DISTANCE_CENTS = 10;
const BTC_EV_SWING_MIN_ENTRY_CENTS = 45;
const BTC_EV_SWING_MAX_ENTRY_CENTS = 65;
const BTC_CROSS_STRIKE_ARB_MAX_COMBINED_CENTS = 80;
const BTC_CROSS_STRIKE_ARB_MIN_MINUTES_LEFT = 30;
const BTC_CROSS_STRIKE_ARB_MAX_FIRST_LEG_CENTS = 40;
const BTC_CROSS_STRIKE_ARB_MIN_FIRST_LEG_CENTS = 35;
const BTC_CROSS_STRIKE_ARB_HEDGE_TARGET_CENTS = 40;
const BTC_CROSS_STRIKE_ARB_STRIKE_STEP_DOLLARS = 100;
const BTC_CROSS_STRIKE_ARB_RETRY_MS = 150;
const TRADE_RECENT_WINDOW_CANDLES = 30;
const TRADE_NEAR_WINDOW_CANDLES = 15;
const VOL_STOP_MIN_CENTS = 6;
const VOL_STOP_MAX_CENTS = 18;
const VOL_TARGET_MAX_CENTS = 98;
const MIN_PROFIT_TO_LOSS_RATIO = 0.6;
const SPORTS_PAIR_ARB_MAX_COMBINED_ASK_CENTS = 95;
const SPORTS_PAIR_ARB_MIN_EDGE_CENTS = 2;
const SPORTS_PAIR_ARB_MAX_SPREAD_CENTS = 3;
const SPORTS_PAIR_ARB_LOG_COOLDOWN_MS = 30_000;
const SPORTS_PAIR_ARB_SUBMIT_COOLDOWN_MS = 1_000;
const SPORTS_PAIR_ARB_MIN_SIDE_SIZE = 3;
const SPORTS_PAIR_ARB_MIN_LEG_ASK_CENTS = 30;
const SPORTS_PAIR_ARB_MAX_LEG_ASK_CENTS = 70;
const SPORTS_PAIR_ARB_LOCK_MS = 180_000;
const SPORTS_ARB_VOLATILE_LOCK_MS = 180_000;
const SPORTS_PAIR_ARB_PROBE_MAX_OBSERVED_COMBINED_CENTS = 110;
const SPORTS_PAIR_ARB_PROBE_EXECUTE_COMBINED_CENTS = 101;
const SPORTS_PAIR_ARB_PROBE_TARGET_COMBINED_CENTS = 95;
const SPORTS_PAIR_ARB_RETRY_MS = 1_000;
const SPORTS_PAIR_ARB_MAX_ACTIVE_EVENTS = 1;
const SPORTS_PAIR_ARB_NO_FILL_MAX_ATTEMPTS = 45;
const SPORTS_ARB_LIVE_SERIES = [
  "KXMLBGAME"
];
const ENTRY_CONFIRMATION_MAX_MS = 5_000;
const SHADOW_PAPER_IDLE_WARNING_MS = 5 * 60 * 1000;
const SHADOW_PAPER_LOG_GAP_MS = 15_000;
const SHADOW_PAPER_STARTING_CASH = 20;
const SHADOW_PAPER_MAX_TRADE_DOLLARS = 2;
const BTC_DESTROYER_BOOK_SAMPLE_MS = 500;
const BTC_DESTROYER_CONFIRM_SAMPLES = 1;
const BTC_DESTROYER_WALL_MIN_CONTRACTS = 5_000;
const BTC_DESTROYER_WALL_RATIO = 1.35;
const BTC_DESTROYER_READ_MIN_PCT = 58;
const BTC_DESTROYER_READ_GAP_PCT = 15;
const BTC_DESTROYER_NEAR_WINDOW_CENTS = 5;
const BTC_DESTROYER_NEAR_MIN_CONTRACTS = 100;
const BTC_DESTROYER_NEAR_RATIO = 1.2;
const BTC_LADDER_WINDOW_CENTS = 5;
const BTC_LADDER_TARGET_WINDOW_CENTS = 2;
const BTC_LADDER_THIN_CONTRACTS = 25;
const BTC_LADDER_COLLAPSE_RATIO = 4;
const BTC_LADDER_HEAVY_CONTRACTS = 2_000;
const CONSECUTIVE_STOP_LOSS_BRAKE_LIMIT = 3;
const BTC_MIN_ENTRY_CENTS = 45;
const BTC_TECHNICAL_EARLY_MAX_ENTRY_CENTS = 65;
const BTC_TECHNICAL_LATE_MAX_ENTRY_CENTS = 88;
const BTC_TECHNICAL_HIGH_ENTRY_MINUTES_LEFT = 15;
const BTC_TECHNICAL_LATE_RELAXED_STOP_ENTRY_CENTS = 80;
const BTC_TECHNICAL_LATE_RELAXED_STOP_CENTS = 49;
const MIN_SCRAPE_STOP_DISTANCE_CENTS = 18;
const SPORTS_MICRO_MIN_TARGET_DISTANCE_CENTS = 3;
const SPORTS_MICRO_MAX_TARGET_DISTANCE_CENTS = 4;
const SPORTS_MICRO_MIN_TARGET_PROFIT_DOLLARS = 0.01;
const MAX_EXECUTION_SPREAD_CENTS = 3;
const LIVE_ENTRY_IOC_RETRIES = 5;
const LIVE_ENTRY_IOC_RETRY_MS = 250;
const LIVE_ENTRY_RECONCILE_MS = 150;
const SPORTS_LEADER_MIN_RANGE_CENTS = 6;
const SPORTS_LEADER_MIN_RECENT_AMPLITUDE_CENTS = 3;
const SPORTS_LEADER_MIN_DIRECTION_CHANGES = 1;
const SPORTS_ARB_MIN_RECENT_RANGE_CENTS = 3;
const SPORTS_ARB_MIN_RECENT_SAMPLES = 6;
const SPORTS_LEADER_MIN_VOLUME_DOLLARS = 1000;
const SPORTS_ARB_MIN_ACTIVITY = 1000;
const SPORTS_ARB_MIN_TRADED_DOLLARS = 1000;
const SPORTS_BEST_CHOP_MIN_SCANNED_MARKETS = 100;
const SPORTS_BOOK_WATCH_MAX_IDLE_MS = 3 * 60 * 1000;
const LATE_LOCK_ENTRY_MIN_CENTS = 90;
const BTC_LATE_LOCK_ENTRY_MIN_CENTS = 80;
const BTC_LATE_LOCK_MAX_ENTRY_CENTS = 95;
const LATE_LOCK_TARGET_MAX_CENTS = 98;
const LATE_LOCK_STOP_CENTS = 49;
const LATE_LOCK_MIN_TARGET_PROFIT_DOLLARS = 0.01;
const BTC_HOURLY_BLACKOUT_START_ET = 16;
const BTC_HOURLY_BLACKOUT_END_ET = 17;
const BTC_HOURLY_STRIKE_STEP_DOLLARS = 100;
const TENNIS_INTERLEAVE_MARKET_LIMIT = 8;
const TARGET_SERIES_EVENT_PAGES_PER_PASS = 1;
const CALENDAR_EVENT_PAGES_PER_PASS = 1;
const BTC_EXECUTION_SPREAD_CUSHION_CENTS = 2;
const BTC_EXECUTION_TARGET_PAD_CENTS = 4;
const BTC_EXECUTION_STOP_PAD_CENTS = 11;
const BTC_ACTIVE_TREND_RECHECK_MS = 30_000;
const CALENDAR_BUCKET_ORDER = [
  "tennis",
  "crypto",
  "baseball",
  "soccer",
  "basketball",
  "afl",
  "cricket",
  "football",
  "hockey",
  "rugby",
  "college-lacrosse",
  "sports-other",
  "daily-temperature"
];
let lastDetailedRequestAt = 0;

let activeScan = null;
let secondaryScanIndex = 0;
let detailedCooldownUntil = 0;
let lastDetailedCooldownLogAt = 0;
let candleCooldownUntil = 0;
let lastCandleCooldownLogAt = 0;
const candleCache = new Map();
let cachedBtcTechnicalBias = null;
const btcBookMemory = new Map();
let lastBtcStatusScanAt = 0;
let lastWeatherDailyScanAt = 0;
let cachedDynamicGameSeries = { fetchedAt: 0, series: [] };
let cachedWeatherSeries = { fetchedAt: 0, series: [] };
let cachedPolymarketWeatherMarkets = { fetchedAt: 0, markets: [] };
let cachedWebullWeatherMarkets = { fetchedAt: 0, markets: [] };
let cachedFanduelWeatherMarkets = { fetchedAt: 0, markets: [] };
let cachedDraftKingsWeatherMarkets = { fetchedAt: 0, markets: [] };
let lastWebullUnavailableLogAt = 0;
let lastFanduelUnavailableLogAt = 0;
let lastDraftKingsUnavailableLogAt = 0;
let cachedSportsGameFilters = { fetchedAt: 0, terms: [] };
let cachedLiveMilestoneEvents = { fetchedAt: 0, tickers: [], detailsByTicker: {} };
const portfolioMarketDetailCache = new Map();
let bitcoinImmediateScanInProgress = false;
let liveTruthTimer = null;
let portfolioReconcileTimer = null;
const liveTruth = {
  lastRefreshAt: 0,
  positionsByTicker: new Map(),
  ordersByTicker: new Map(),
  lastError: ""
};
const liveConfig = await loadLiveConfig();
const SCAN_ASSETS = {
  bitcoin: {
    key: "bitcoin",
    settingsKey: "enableBitcoinArb",
    label: "Bitcoin",
    shortLabel: "BTC",
    contractLabel: "BTC HOURLY",
    series: "KXBTCD",
    defaultSeries: "KXBTCD",
    spotIndex: "KALSHI_BTC_SPOT",
    spotUrlEnv: "KALSHI_BTC_SPOT_URL",
    strikeStep: 100,
    recordingFolder: "BITCOIN SCAN RECORDING",
    strikeFolder: "bitcoin strike price log",
    spotFolder: "bitcoin spot price log",
    fileSlug: "btc"
  },
  sp: {
    key: "sp",
    settingsKey: "enableSpArb",
    label: "S&P",
    shortLabel: "S&P",
    contractLabel: "S&P HOURLY",
    series: liveConfig.assetSeries?.sp || SP_HOURLY_SERIES,
    defaultSeries: SP_HOURLY_SERIES,
    spotIndex: "KALSHI_SPOT_SP",
    spotUrlEnv: "KALSHI_SP_SPOT_URL",
    strikeStep: 25,
    recordingFolder: "S&P SCAN RECORDING",
    strikeFolder: "s&p strike price log",
    spotFolder: "s&p spot price log",
    fileSlug: "sp"
  },
  gold: {
    key: "gold",
    settingsKey: "enableGoldScanning",
    label: "Gold",
    shortLabel: "GOLD",
    contractLabel: "GOLD HOURLY",
    series: liveConfig.assetSeries?.gold || "KXGOLD",
    defaultSeries: "KXGOLD",
    spotIndex: "KALSHI_SPOT_GOLD",
    spotUrlEnv: "KALSHI_GOLD_SPOT_URL",
    strikeStep: 10,
    recordingFolder: "GOLD SCAN RECORDING",
    strikeFolder: "gold strike price log",
    spotFolder: "gold spot price log",
    fileSlug: "gold"
  },
  crude: {
    key: "crude",
    settingsKey: "enableCrudeOilScanning",
    label: "Crude Oil",
    shortLabel: "CRUDE OIL",
    contractLabel: "CRUDE OIL HOURLY",
    series: liveConfig.assetSeries?.crude || "KXOIL",
    defaultSeries: "KXOIL",
    spotIndex: "KALSHI_SPOT_CRUDE",
    spotUrlEnv: "KALSHI_CRUDE_SPOT_URL",
    strikeStep: 1,
    recordingFolder: "CRUDE OIL SCAN RECORDING",
    strikeFolder: "crude oil strike price log",
    spotFolder: "crude oil spot price log",
    fileSlug: "crude-oil"
  },
  weather: {
    key: "weather",
    settingsKey: "enableWeatherScanning",
    label: "Weather",
    shortLabel: "WEATHER",
    contractLabel: "WEATHER DAILY",
    series: liveConfig.assetSeries?.weather || [],
    defaultSeries: [],
    strikeStep: 1,
    recordingFolder: "WEATHER SCAN RECORDING",
    strikeFolder: "weather daily contract log",
    spotFolder: "",
    fileSlug: "weather",
    noSpot: true,
    marketType: "daily"
  }
};
const WEATHER_BEACON_STATIONS = [
  { city: "Atlanta", series: "KXHIGHATL", stationId: "KATL", confidence: "candidate", note: "Kalshi CLI source points to Atlanta daily high-temperature settlement." },
  { city: "Austin", series: "KXHIGHAUS", stationId: "KAUS", confidence: "in-progress", note: "Kalshi rules say Austin Bergstrom; exact beacon proof still being checked." },
  { city: "Boston", series: "KXHIGHBOS", stationId: "KBOS", confidence: "candidate", note: "Kalshi CLI source points to Boston daily high-temperature settlement." },
  { city: "Chicago", series: "KXHIGHCHI", stationId: "KMDW", confidence: "candidate", note: "Kalshi CLI source points to Chicago daily high-temperature settlement." },
  { city: "Dallas", series: "KXHIGHDAL", stationId: "KDFW", confidence: "candidate", note: "Kalshi CLI source points to Dallas daily high-temperature settlement." },
  { city: "Denver", series: "KXHIGHDEN", stationId: "KDEN", confidence: "candidate", note: "Kalshi CLI source points to Denver daily high-temperature settlement." },
  { city: "Houston", series: "KXHIGHHOU", stationId: "KHOU", confidence: "candidate", note: "Kalshi CLI source points to Houston daily high-temperature settlement." },
  { city: "Las Vegas", series: "KXHIGHLV", stationId: "KLAS", confidence: "candidate", note: "Kalshi CLI source points to Las Vegas daily high-temperature settlement." },
  { city: "Los Angeles", series: "KXHIGHLAX", stationId: "KLAX", confidence: "candidate", note: "Kalshi CLI source points to Los Angeles daily high-temperature settlement." },
  { city: "Miami", series: "KXHIGHMIA", stationId: "KMIA", confidence: "candidate", note: "Kalshi CLI source points to Miami daily high-temperature settlement." },
  { city: "Minneapolis", series: "KXHIGHMSP", stationId: "KMSP", confidence: "candidate", note: "Kalshi CLI source points to Minneapolis daily high-temperature settlement." },
  { city: "New Orleans", series: "KXHIGHMSY", stationId: "KMSY", confidence: "candidate", note: "Kalshi CLI source points to New Orleans daily high-temperature settlement." },
  { city: "New York", series: "KXHIGHNY", stationId: "KNYC", confidence: "strong-candidate", note: "Kalshi rules say Central Park; final exact beacon-coordinate proof still being checked." },
  { city: "Oklahoma City", series: "KXHIGHOKC", stationId: "KOKC", confidence: "candidate", note: "Kalshi CLI source points to Oklahoma City daily high-temperature settlement." },
  { city: "Philadelphia", series: "KXHIGHPHIL", stationId: "KPHL", confidence: "candidate", note: "Kalshi CLI source points to Philadelphia daily high-temperature settlement." },
  { city: "Phoenix", series: "KXHIGHPHX", stationId: "KPHX", confidence: "candidate", note: "Kalshi CLI source points to Phoenix daily high-temperature settlement." },
  { city: "San Antonio", series: "KXHIGHSAT", stationId: "KSAT", confidence: "candidate", note: "Kalshi CLI source points to San Antonio daily high-temperature settlement." },
  { city: "San Francisco", series: "KXHIGHTSFO", stationId: "KSFO", confidence: "candidate", note: "Kalshi active daily high-temperature series uses SFO." },
  { city: "Seattle", series: "KXHIGHSEA", stationId: "KSEA", confidence: "candidate", note: "Kalshi CLI source points to Seattle daily high-temperature settlement." },
  { city: "Washington DC", series: "KXHIGHDC", stationId: "KDCA", confidence: "candidate", note: "Kalshi CLI source points to Washington DC daily high-temperature settlement." }
].sort((a, b) => a.city.localeCompare(b.city));
let weatherBeaconCache = {
  rows: [],
  fetchedAt: 0,
  nextRefreshAt: 0,
  intervalMs: WEATHER_BEACON_DAY_SCAN_INTERVAL_MS,
  lastError: ""
};
let latestSnapshot = {
  running: false,
  results: [],
  audit: [],
  gameScanLog: [],
  sportsArbCandidates: [],
  sportsArbWatch: null,
  spArbWatch: null,
  bitcoinArbWatch: null,
  paper: await loadPersistedPaperState(),
  counters: emptyCounters(),
  settings: DEFAULT_SETTINGS,
  btcTechnicalBias: null,
  polymarketWeatherMatches: [],
  webullWeatherMatches: [],
  fanduelWeatherMatches: [],
  draftKingsWeatherMatches: [],
  weatherBeaconReadings: [],
  weatherBeaconFetchedAt: null,
  weatherBeaconNextRefreshAt: null,
  baseUrl: null,
  startedAt: null,
  stoppedAt: null
};

app.use(expressCompat.json());
app.use(expressCompat.static(path.join(__dirname, "public")));

app.get("/api/state", (_req, res) => {
  res.json(latestSnapshot);
});

app.get("/api/recording/bitcoin/latest", async (_req, res) => {
  try {
    const preview = await latestAssetRecordingPreview(SCAN_ASSETS.bitcoin);
    res.json({ ok: true, ...preview });
  } catch (error) {
    res.statusCode = 500;
    res.json({ ok: false, error: error.message });
  }
});

app.get("/api/recording/latest", async (_req, res) => {
  try {
    const previews = {};
    for (const asset of [SCAN_ASSETS.weather]) {
      previews[asset.key] = await latestAssetRecordingPreview(asset);
    }
    res.json({
      ok: true,
      previews,
      polymarketWeatherMatches: latestSnapshot.polymarketWeatherMatches || [],
      webullWeatherMatches: latestSnapshot.webullWeatherMatches || [],
      fanduelWeatherMatches: latestSnapshot.fanduelWeatherMatches || [],
      draftKingsWeatherMatches: latestSnapshot.draftKingsWeatherMatches || []
    });
  } catch (error) {
    res.statusCode = 500;
    res.json({ ok: false, error: error.message });
  }
});

app.get("/api/weather/beacons/latest", async (_req, res) => {
  try {
    const payload = await latestWeatherBeaconReadings();
    res.json({ ok: true, ...payload });
  } catch (error) {
    res.statusCode = 500;
    res.json({ ok: false, error: error.message });
  }
});

app.get("/api/live/status", async (_req, res) => {
  const balance = liveConfig.configured ? await refreshLiveAccountFromKalshi().catch((error) => ({ ok: false, error: error.message })) : null;
  publishPaper();
  res.json({
    ok: true,
    configured: liveConfig.configured,
    liveTradingEnabled: liveConfig.liveTradingEnabled,
    baseUrl: liveConfig.baseUrl,
    envPath: liveConfig.envPath,
    balance,
    paper: paperState
  });
});

app.get("/api/live/positions", async (_req, res) => {
  try {
    const positions = await getLivePositions({ countFilter: "position" });
    res.json({ ok: true, positions, paper: paperState });
  } catch (error) {
    res.status(500).json({ ok: false, error: kalshiErrorDetail(error) || error.message, paper: paperState });
  }
});

app.post("/api/live/wind-down", async (_req, res) => {
  paperState.enabled = false;
  paperState.windingDown = true;
  paperState.stoppedAt = new Date().toISOString();
  paperLog("Wind down requested. No new positions will be opened; completed arb holds remain manual-only.");
  publishPaper();
  await persistLatestResults().catch(() => {});
  res.json({ ok: true, paper: paperState });
});

app.post("/api/live/emergency-stop-all", async (_req, res) => {
  paperState.enabled = false;
  paperState.windingDown = false;
  paperState.stoppedAt = new Date().toISOString();
  const protectedArbs = activeSystemTrades().filter((trade) => isCompletedSportsArbHold(trade) || isCompletedBitcoinArbHold(trade));
  const openTrades = activeSystemTrades().filter((trade) => !isCompletedSportsArbHold(trade) && !isCompletedBitcoinArbHold(trade));
  if (protectedArbs.length) {
    paperLog(`Emergency stop all skipped ${protectedArbs.length} completed arb hold leg(s); locked arbitrages are manual-only.`);
  }
  if (openTrades.length) {
    for (const trade of openTrades) {
      await emergencyCloseTrade(trade, "EMERGENCY_STOP_ALL", "emergency stop all requested");
    }
  } else {
    paperLog("Emergency stop all requested. No active tracked position to exit.");
  }
  if (activeScan?.running) {
    activeScan.abortController.abort();
    activeScan.stopRequested = true;
    logAudit("warn", "Emergency stop requested; market scan stopped after emergency exits.");
  }
  publishPaper();
  await persistLatestResults().catch(() => {});
  res.json({ ok: true, paper: paperState });
});

app.post("/api/live/emergency-stop-position", async (req, res) => {
  const tradeId = String(req.body?.id || "");
  const trade = activeSystemTrades().find((row) => row.id === tradeId);
  if (!trade) {
    res.statusCode = 404;
    res.json({ ok: false, error: "Active position not found." });
    return;
  }
  if (isCompletedSportsArbHold(trade) || isCompletedBitcoinArbHold(trade)) {
    res.statusCode = 409;
    res.json({ ok: false, error: "Completed arbitrage holds are manual-only. Emergency stop will not sell a locked arb leg." });
    return;
  }
  await emergencyCloseTrade(trade, "EMERGENCY_STOP", "single-position emergency stop requested");
  publishPaper();
  await persistLatestResults().catch(() => {});
  res.json({ ok: true, paper: paperState });
});

app.post("/api/live/manual-override-position", async (req, res) => {
  const tradeId = String(req.body?.id || "");
  const trade = activeSystemTrades().find((row) => row.id === tradeId);
  if (!trade) {
    await refreshLiveAccountFromKalshi().catch(() => {});
    publishPaper();
    res.json({ ok: true, alreadyDetached: true, message: "Position is no longer tracked by the app.", paper: paperState });
    return;
  }
  detachTrackedTradeForManualControl(trade);
  publishPaper();
  await persistLatestResults().catch(() => {});
  res.json({ ok: true, paper: paperState });
});

app.post("/api/live/continue-arb-attempts", async (req, res) => {
  const tradeId = String(req.body?.id || "");
  const trade = activeBitcoinCrossStrikeArbTrades().find((row) => row.id === tradeId);
  if (!trade) {
    res.statusCode = 404;
    res.json({ ok: false, error: "BTC ARB leg not found." });
    return;
  }
  if (isCompletedBitcoinArbHold(trade)) {
    res.statusCode = 409;
    res.json({ ok: false, error: "BTC ARB is already paired and locked to expiration." });
    return;
  }
  if (paperState.btcArbInProgress) {
    res.json({ ok: true, message: "BTC ARB retry loop is already running.", paper: paperState });
    return;
  }
  continueBitcoinArbAttemptsFromTrade(trade.id).catch((error) => {
    safetyHalt(`BTC ARB continue attempts error: ${kalshiErrorDetail(error) || error.message}`);
  });
  publishPaper();
  res.json({ ok: true, message: "BTC ARB continue attempts started.", paper: paperState });
});

app.post("/api/settings/lanes", (req, res) => {
  const enableBitcoin = false;
  const enableBitcoinArb = false;
  const enableOtherMarkets = false;
  const enableSportsArb = false;
  const enableSpArb = false;
  const enableGoldScanning = false;
  const enableCrudeOilScanning = false;
  const enableWeatherScanning = req.body?.enableWeatherScanning === true;
  if (activeScan?.settings) {
    activeScan.settings.enableBitcoin = enableBitcoin;
    activeScan.settings.enableBitcoinArb = enableBitcoinArb;
    activeScan.settings.enableOtherMarkets = enableOtherMarkets;
    activeScan.settings.enableSportsArb = enableSportsArb;
    activeScan.settings.enableSpArb = enableSpArb;
    activeScan.settings.enableGoldScanning = enableGoldScanning;
    activeScan.settings.enableCrudeOilScanning = enableCrudeOilScanning;
    activeScan.settings.enableWeatherScanning = enableWeatherScanning;
    if (!enableSportsArb) {
      activeScan.sportsArbEventKey = "";
      activeScan.sportsArbWatch = null;
      latestSnapshot.sportsArbWatch = null;
      latestSnapshot.sportsArbCandidates = [];
    }
    if (!enableBitcoinArb) {
      activeScan.bitcoinArbWatch = null;
      latestSnapshot.bitcoinArbWatch = null;
    }
    if (!enableSpArb) {
      activeScan.spArbWatch = null;
      latestSnapshot.spArbWatch = null;
    }
    if (paperState.enabled && !paperState.windingDown) {
      activeScan.settings.bookScanOnly = false;
      activeScan.settings.continuous = true;
      activeScan.settings.maxTradeDollars = Number(paperState.settings?.maxTradeDollars ?? activeScan.settings.maxTradeDollars ?? DEFAULT_SETTINGS.maxTradeDollars);
      activeScan.settings.maxOpenDollars = Number(paperState.settings?.maxOpenDollars ?? activeScan.settings.maxOpenDollars ?? DEFAULT_SETTINGS.maxOpenDollars);
    }
  }
  paperState.settings = {
    ...(paperState.settings || {}),
    enableBitcoin,
    enableBitcoinArb,
    enableOtherMarkets,
    enableSportsArb,
    enableSpArb,
    enableGoldScanning,
    enableCrudeOilScanning,
    enableWeatherScanning
  };
  latestSnapshot.settings = {
    ...(latestSnapshot.settings || {}),
    enableBitcoin,
    enableBitcoinArb,
    enableOtherMarkets,
    enableSportsArb,
    enableSpArb,
    enableGoldScanning,
    enableCrudeOilScanning,
    enableWeatherScanning
  };
  logAudit("info", `Lane settings updated: Weather Scanning ${enableWeatherScanning ? "ON" : "OFF"}.`);
  publishPaper();
  if (paperState.enabled && !paperState.windingDown && !paperState.safetyHalted && (enableBitcoinArb || enableSportsArb || enableSpArb || enableGoldScanning || enableCrudeOilScanning || enableWeatherScanning) && !activeScan?.running) {
    const settings = normalizeSettings({
      ...(paperState.settings || {}),
      enableBitcoin,
      enableBitcoinArb,
      enableOtherMarkets,
      enableSportsArb,
      enableSpArb,
      enableGoldScanning,
      enableCrudeOilScanning,
      enableWeatherScanning,
      bookScanOnly: false,
      continuous: true,
      contracts: PAPER_MAX_CONTRACTS,
      maxTradeDollars: Number(paperState.settings?.maxTradeDollars ?? DEFAULT_SETTINGS.maxTradeDollars),
      maxOpenDollars: Number(paperState.settings?.maxOpenDollars ?? DEFAULT_SETTINGS.maxOpenDollars)
    });
    secondaryScanIndex = 0;
    activeScan = createScanController(settings);
    runScan(activeScan).catch((error) => {
      publish("error", { message: error.message, stack: error.stack });
      logAudit("fatal", `Scan stopped by fatal error: ${error.message}`);
      endScan();
    });
    logAudit("info", "Lane switch started the scanner.");
  }
  res.json({
    ok: true,
    settings: {
      ...(activeScan?.settings || paperState.settings || {}),
      enableBitcoin,
      enableBitcoinArb,
      enableOtherMarkets,
      enableSportsArb,
      enableSpArb,
      enableGoldScanning,
      enableCrudeOilScanning,
      enableWeatherScanning
    },
    paper: paperState
  });
});

app.post("/api/scan/start", async (req, res) => {
  if (activeScan?.running) {
    res.json({ ok: true, message: "Scan already running" });
    return;
  }
  const settings = normalizeSettings(req.body || {});
  for (const asset of selectedRecordingAssets(settings)) {
    if (asset.noSpot) continue;
    if (!assetSpotSource(asset).url) {
      warnKalshiImpliedSpotFallback(asset);
      continue;
    }
    try {
      const spot = await assetSpotPriceForRecording(asset);
      if (!Number.isFinite(spot?.price)) {
        warnMissingSpotRecord(asset);
        res.statusCode = 400;
        res.json({ ok: false, error: `${asset.label} scanner blocked: actual ${asset.label} spot price is not connected, so no strike rows will be recorded.` });
        return;
      }
    } catch (error) {
      warnMissingSpotRecord(asset);
      res.statusCode = 400;
      res.json({ ok: false, error: `${asset.label} scanner blocked: ${error.message}` });
      return;
    }
  }
  activeScan = createScanController(settings);
  if (settings.bookScanOnly) logAudit("info", "Read-only scan mode active: scanning orderbooks and recording rows only.");
  runScan(activeScan).catch((error) => {
    publish("error", { message: error.message, stack: error.stack });
    logAudit("fatal", `Scan stopped by fatal error: ${error.message}`);
    endScan();
  });
  res.json({ ok: true, settings });
});

app.post("/api/scan/stop", (_req, res) => {
  if (activeScan) {
    activeScan.stopRequested = true;
    activeScan.running = false;
    activeScan.abortController.abort();
    latestSnapshot.running = false;
    latestSnapshot.stoppedAt = new Date().toISOString();
    if (latestSnapshot.settings) latestSnapshot.settings.bookScanOnly = false;
    stopBtcFastLoop();
    logAudit("warn", "Stop requested by user; finishing active requests and halting loop.");
    publish("done", latestSnapshot);
    activeScan = null;
  }
  res.json({ ok: true });
});

app.post("/api/paper/start", async (req, res) => {
  res.statusCode = 400;
  res.json({ ok: false, error: "Live trading is disabled in Prediction Weather. This app only scans weather contracts." });
  return;
  const requestedSettings = normalizeSettings(req.body || {});
  if (!requestedSettings.enableBitcoinArb && !requestedSettings.enableSportsArb && !requestedSettings.enableSpArb) {
    res.statusCode = 400;
    res.json({ ok: false, error: "Error: no live trading type on. Turn on Bitcoin Arb, Sports Arb, or S&P Arb before starting." });
    return;
  }
  if (requestedSettings.maxTradeDollars <= 0) {
    res.statusCode = 400;
    res.json({ ok: false, error: "Cannot trade: choose a Max $ per trade before starting." });
    return;
  }
  if (!liveConfig.configured) {
    res.statusCode = 400;
    res.json({ ok: false, error: "Kalshi credentials are not configured. Run the credential setup first." });
    return;
  }
  if (!liveConfig.liveTradingEnabled) {
    res.statusCode = 400;
    res.json({ ok: false, error: "Live trading is not enabled in the Kalshi environment. Dry-run mode is disabled in BOT DESTROYER." });
    return;
  }
  if (paperState.safetyHalted) {
    res.statusCode = 409;
    res.json({ ok: false, error: `Safety halt is active: ${paperState.safetyHaltReason || "unknown reason"}. Use Reset only after checking Kalshi open positions/orders.` });
    return;
  }
  if (requestedSettings.enableSportsArb && hasAnyUnhedgedSportsArbEvent()) {
    res.statusCode = 409;
    res.json({ ok: false, error: "Sports Arb blocked: an existing arb is imbalanced or not a true same-side hedge. Manually review Kalshi positions before restarting Sports Arb." });
    return;
  }
  await refreshLiveAccountFromKalshi().catch((error) => paperLog(`Balance refresh failed: ${error.message}`));
  startLiveTruthLoop();
  startPortfolioReconcileLoop();
  paperState.enabled = true;
  paperState.windingDown = false;
  paperState.pendingReservedDollars = 0;
  paperState.startedAt = new Date().toISOString();
  paperState.stoppedAt = null;
  paperState.settings = {
    startingCash: paperState.startingCash,
      maxContracts: PAPER_MAX_CONTRACTS,
      maxTradeDollars: requestedSettings.maxTradeDollars,
      maxOpenDollars: requestedSettings.maxOpenDollars,
      enableBitcoin: false,
      enableBitcoinArb: requestedSettings.enableBitcoinArb,
      enableOtherMarkets: false,
      enableSportsArb: requestedSettings.enableSportsArb,
      enableSpArb: requestedSettings.enableSpArb,
      oneTradeAtATime: false,
      monitorEverySeconds: PAPER_MONITOR_MS / 1000
    };
  paperLog(`Live trader armed for REAL ORDERS, max $${paperState.settings.maxTradeDollars.toFixed(2)} per trade, max $${paperState.settings.maxOpenDollars.toFixed(2)} open system exposure.`);
  publishPaper();
  if (activeScan?.running) {
    activeScan.settings.enableBitcoin = false;
    activeScan.settings.enableBitcoinArb = requestedSettings.enableBitcoinArb;
    activeScan.settings.enableOtherMarkets = false;
    activeScan.settings.enableSportsArb = requestedSettings.enableSportsArb;
    activeScan.settings.enableSpArb = requestedSettings.enableSpArb;
    activeScan.settings.bookScanOnly = false;
    activeScan.settings.maxTradeDollars = requestedSettings.maxTradeDollars;
    activeScan.settings.maxOpenDollars = requestedSettings.maxOpenDollars;
    activeScan.settings.continuous = true;
    latestSnapshot.settings = { ...(latestSnapshot.settings || {}), ...activeScan.settings };
    logAudit("info", "Live trader attached to the already-running scanner; open positions were left untouched.");
    res.json({ ok: true, paper: paperState, settings: activeScan.settings });
    return;
  }
  secondaryScanIndex = 0;
  const settings = normalizeSettings({
    ...(req.body || {}),
    continuous: true,
    contracts: PAPER_MAX_CONTRACTS,
    maxTradeDollars: Number((req.body || {}).maxTradeDollars ?? DEFAULT_SETTINGS.maxTradeDollars),
    maxOpenDollars: Number((req.body || {}).maxOpenDollars ?? DEFAULT_SETTINGS.maxOpenDollars)
  });
  activeScan = createScanController(settings);
  runScan(activeScan).catch((error) => {
    publish("error", { message: error.message, stack: error.stack });
    logAudit("fatal", `Scan stopped by fatal error: ${error.message}`);
    endScan();
  });
  res.json({ ok: true, paper: paperState });
});

app.post("/api/paper/stop", async (_req, res) => {
  paperState.enabled = false;
  paperState.windingDown = true;
  paperState.stoppedAt = new Date().toISOString();
  paperLog("Wind down requested. No new positions will be opened; completed arb holds remain manual-only.");
  publishPaper();
  res.json({ ok: true, paper: paperState });
});

app.post("/api/paper/reset", async (_req, res) => {
  const realOpenTrades = activeSystemTrades().filter((trade) => !trade.dryRun);
  if (liveConfig.liveTradingEnabled && realOpenTrades.length) {
    for (const trade of realOpenTrades) {
      const livePosition = await getLiveTickerPosition(trade.ticker).catch(() => null);
      if (livePosition && !livePosition.raw?.unavailable && Math.abs(Number(livePosition.position || 0)) < 1) {
        await closeTrackedTradeWithoutOrder(
          trade,
          trade.currentBidCents || trade.entryPriceCents,
          "FLAT_RECONCILED",
          "Reset reconciled this app-tracked ticker as flat on Kalshi"
        );
      }
    }
    const stillOpenTrades = activeSystemTrades().filter((trade) => !trade.dryRun);
    if (stillOpenTrades.length) {
      res.statusCode = 409;
      res.json({ ok: false, error: "Cannot reset while real tracked positions are open. Wind down or emergency stop first." });
      return;
    }
  }
  if (activeScan?.running) {
    activeScan.abortController.abort();
    activeScan.stopRequested = true;
    activeScan.running = false;
    activeScan = null;
  }
  secondaryScanIndex = 0;
  if (paperMonitorTimer) {
    clearInterval(paperMonitorTimer);
    paperMonitorTimer = null;
  }
  if (portfolioReconcileTimer) {
    clearInterval(portfolioReconcileTimer);
    portfolioReconcileTimer = null;
  }
  const preservedShadowLog = Array.isArray(paperState.shadowLog) ? paperState.shadowLog : [];
  const preservedShadow = paperState.shadow && typeof paperState.shadow === "object" ? {
    bestCandidate: paperState.shadow.bestCandidate || null,
    candidateSince: paperState.shadow.candidateSince || null,
    lastCandidateKey: paperState.shadow.lastCandidateKey || "",
    lastLoggedAt: Number(paperState.shadow.lastLoggedAt || 0),
    lastIdleWarningAt: Number(paperState.shadow.lastIdleWarningAt || 0),
    account: normalizeShadowPaperAccount(paperState.shadow.account)
  } : createPaperState().shadow;
  paperState = createPaperState();
  paperState.shadowLog = preservedShadowLog;
  paperState.shadow = preservedShadow;
  paperState.pendingReservedDollars = 0;
  await refreshLiveAccountFromKalshi().catch(() => {});
  latestSnapshot = {
    running: false,
    results: [],
    audit: [],
    gameScanLog: [],
    sportsArbCandidates: [],
    sportsArbWatch: null,
    bitcoinArbWatch: null,
    paper: paperState,
    counters: emptyCounters(),
    settings: DEFAULT_SETTINGS,
    btcTechnicalBias: null,
    polymarketWeatherMatches: [],
    webullWeatherMatches: [],
    fanduelWeatherMatches: [],
    draftKingsWeatherMatches: [],
    weatherBeaconReadings: weatherBeaconCache.rows || [],
    weatherBeaconFetchedAt: weatherBeaconCache.fetchedAt ? new Date(weatherBeaconCache.fetchedAt).toISOString() : null,
    weatherBeaconNextRefreshAt: weatherBeaconCache.nextRefreshAt ? new Date(weatherBeaconCache.nextRefreshAt).toISOString() : null,
    baseUrl: null,
    startedAt: null,
    stoppedAt: new Date().toISOString(),
    now: {
      phase: "idle",
      current: 0,
      total: 0,
      event: "Reset",
      market: "Waiting to start",
      ticker: "-",
      step: "Session reset",
      message: "Session reset."
    }
  };
  publishPaper();
  publish("snapshot", latestSnapshot);
  await persistLatestResults().catch(() => {});
  res.json({ ok: true, paper: paperState });
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const client = { id: cryptoRandomId(), res };
  activeClients.add(client);
  sendEvent(client.res, "snapshot", latestSnapshot);
  req.on("close", () => activeClients.delete(client));
});

app.get("/api/download/:type", async (req, res) => {
  const type = req.params.type;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  if (type === "json") {
    const body = JSON.stringify(latestSnapshot.results, null, 2);
    await fs.writeFile(path.join(RESULTS_DIR, `kalshi-scan-${timestamp}.json`), body);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="kalshi-scan-${timestamp}.json"`);
    res.send(body);
    return;
  }
  if (type === "csv") {
    const body = resultsToCsv(latestSnapshot.results);
    await fs.writeFile(path.join(RESULTS_DIR, `kalshi-scan-${timestamp}.csv`), body);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="kalshi-scan-${timestamp}.csv"`);
    res.send(body);
    return;
  }
  if (type === "audit") {
    const body = latestSnapshot.audit.map((row) => `[${row.time}] ${row.level.toUpperCase()} ${row.message}`).join("\n");
    await fs.writeFile(path.join(RESULTS_DIR, `kalshi-audit-${timestamp}.txt`), body);
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="kalshi-audit-${timestamp}.txt"`);
    res.send(body);
    return;
  }
  if (type === "audit-csv") {
    const body = auditToCsv(latestSnapshot.audit);
    await fs.writeFile(path.join(RESULTS_DIR, `kalshi-audit-${timestamp}.csv`), body);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="kalshi-audit-${timestamp}.csv"`);
    res.send(body);
    return;
  }
  if (type === "scanned-txt") {
    const body = scannedContractsText(latestSnapshot.gameScanLog || []);
    await fs.writeFile(path.join(RESULTS_DIR, `kalshi-scanned-contracts-${timestamp}.txt`), body);
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="kalshi-scanned-contracts-${timestamp}.txt"`);
    res.send(body);
    return;
  }
  if (type === "scanned-csv") {
    const body = scannedContractsCsv(latestSnapshot.gameScanLog || []);
    await fs.writeFile(path.join(RESULTS_DIR, `kalshi-scanned-contracts-${timestamp}.csv`), body);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="kalshi-scanned-contracts-${timestamp}.csv"`);
    res.send(body);
    return;
  }
  if (type === "trades") {
    const body = systemTradesText(paperState.trades || []);
    await fs.writeFile(path.join(RESULTS_DIR, `kalshi-system-trades-${timestamp}.txt`), body);
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="kalshi-system-trades-${timestamp}.txt"`);
    res.send(body);
    return;
  }
  if (type === "trades-csv") {
    const body = systemTradesCsv(paperState.trades || []);
    await fs.writeFile(path.join(RESULTS_DIR, `kalshi-system-trades-${timestamp}.csv`), body);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="kalshi-system-trades-${timestamp}.csv"`);
    res.send(body);
    return;
  }
  res.status(404).json({ error: "Unknown download type" });
});

const activeClients = new Set();

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function publish(event, data) {
  for (const client of activeClients) {
    try {
      sendEvent(client.res, event, data);
    } catch {
      activeClients.delete(client);
    }
  }
}

function emptyCounters() {
  return {
    marketsDiscovered: 0,
    marketsScanned: 0,
    orderbooksFetched: 0,
    candlesFetched: 0,
    candidatesTested: 0,
    evPositiveFound: 0,
    apiFailures: 0,
    insufficientData: 0
  };
}

function createPaperState() {
  return {
    enabled: false,
    windingDown: false,
    mode: "live",
    configured: liveConfig?.configured || false,
    liveTradingEnabled: liveConfig?.liveTradingEnabled || false,
    startingCash: PAPER_STARTING_CASH,
    cash: PAPER_STARTING_CASH,
    realizedPnl: 0,
    unrealizedPnl: 0,
    botRealizedPnl: 0,
    botUnrealizedPnl: 0,
    botTotalPnl: 0,
    openPositionValue: 0,
    botOpenPositionValue: 0,
    liveSystemPositionValue: 0,
    equity: PAPER_STARTING_CASH,
    totalPnl: 0,
    activeTrade: null,
    entryInProgress: false,
    entryInProgressKey: null,
    sportsArbInProgress: false,
    btcArbInProgress: false,
    sportsArbRecovery: null,
    executionState: "IDLE",
    executionSignal: null,
    executionStartedAt: null,
    executionUpdatedAt: null,
    executionCooldownUntil: 0,
    pendingReservedDollars: 0,
    exposureCooldowns: {},
    btcDirectionLatch: {
      eventKey: "",
      side: null,
      direction: "flat",
      since: null,
      lastUpdatedAt: 0
    },
    safetyHalted: false,
    safetyHaltReason: "",
    consecutiveStopLosses: 0,
    lossBrakeLastAnalysis: "",
    trades: [],
    log: [],
    shadowLog: [],
    shadow: {
      bestCandidate: null,
      candidateSince: null,
      lastCandidateKey: "",
      lastLoggedAt: 0,
      lastIdleWarningAt: 0,
      account: createShadowPaperAccount()
    },
    startedAt: null,
    stoppedAt: null,
    settings: {
      startingCash: PAPER_STARTING_CASH,
      maxContracts: PAPER_MAX_CONTRACTS,
      maxTradeDollars: DEFAULT_SETTINGS.maxTradeDollars,
      maxOpenDollars: DEFAULT_SETTINGS.maxOpenDollars,
      enableBitcoin: false,
      enableBitcoinArb: false,
      enableOtherMarkets: false,
      enableSportsArb: false,
      enableSpArb: false,
      enableGoldScanning: false,
      enableCrudeOilScanning: false,
      enableWeatherScanning: true,
      oneTradeAtATime: false,
      monitorEverySeconds: PAPER_MONITOR_MS / 1000
    }
  };
}

async function loadLiveConfig() {
  for (const envPath of LOCAL_ENV_PATHS) {
    try {
      const raw = await fs.readFile(envPath, "utf8");
      const env = parseEnv(raw);
      const privateKeyPath = env.KALSHI_PRIVATE_KEY_PATH || "";
      const polymarketEnv = await loadOptionalEnv(POLYMARKET_CLOB_ENV_PATH);
      return {
        configured: Boolean(env.KALSHI_API_KEY_ID && privateKeyPath && existsSync(privateKeyPath)),
        envPath,
        apiKeyId: env.KALSHI_API_KEY_ID || "",
        privateKeyPath,
        privateKeyPem: privateKeyPath && existsSync(privateKeyPath) ? await fs.readFile(privateKeyPath, "utf8") : "",
        envName: env.KALSHI_ENV || "prod",
        baseUrl: env.KALSHI_BASE_URL || "https://external-api.kalshi.com/trade-api/v2",
        liveTradingEnabled: String(env.LIVE_TRADING_ENABLED || "false").toLowerCase() === "true",
        maxDollarsAtRisk: Number(env.LIVE_MAX_DOLLARS_AT_RISK || LIVE_DEFAULT_MAX_DOLLARS_AT_RISK),
        btcPriceUrl: env.KALSHI_BTC_SPOT_URL || env.BTC_SPOT_URL || env.BTC_PRICE_URL || "",
        btcPriceApiKey: env.BTC_PRICE_API_KEY || "",
        btcPriceIndex: env.BTC_PRICE_INDEX || "KALSHI_BTC_SPOT",
        spotSources: {
          bitcoin: {
            url: env.KALSHI_BTC_SPOT_URL || env.BTC_SPOT_URL || env.BTC_PRICE_URL || "",
            apiKey: env.BTC_PRICE_API_KEY || "",
            index: env.BTC_PRICE_INDEX || "KALSHI_BTC_SPOT"
          },
          sp: {
            url: env.KALSHI_SP_SPOT_URL || env.SP_SPOT_URL || "",
            apiKey: env.SP_PRICE_API_KEY || "",
            index: env.SP_PRICE_INDEX || "KALSHI_SPOT_SP"
          },
          gold: {
            url: env.KALSHI_GOLD_SPOT_URL || env.GOLD_SPOT_URL || "",
            apiKey: env.GOLD_PRICE_API_KEY || "",
            index: env.GOLD_PRICE_INDEX || "KALSHI_SPOT_GOLD"
          },
          crude: {
            url: env.KALSHI_CRUDE_SPOT_URL || env.CRUDE_SPOT_URL || env.OIL_SPOT_URL || "",
            apiKey: env.CRUDE_PRICE_API_KEY || env.OIL_PRICE_API_KEY || "",
            index: env.CRUDE_PRICE_INDEX || env.OIL_PRICE_INDEX || "KALSHI_SPOT_CRUDE"
          }
        },
        assetSeries: {
          sp: env.KALSHI_SP_HOURLY_SERIES || SP_HOURLY_SERIES,
          gold: env.KALSHI_GOLD_HOURLY_SERIES || "KXGOLD",
          crude: env.KALSHI_CRUDE_HOURLY_SERIES || env.KALSHI_OIL_HOURLY_SERIES || "KXOIL",
          weather: splitEnvList(env.KALSHI_WEATHER_DAILY_SERIES || env.KALSHI_WEATHER_SERIES || "")
        },
        webull: {
          eventMarketListUrl: env.WEBULL_EVENT_MARKET_LIST_URL || "",
          token: env.WEBULL_OPENAPI_TOKEN || env.WEBULL_ACCESS_TOKEN || ""
        },
        fanduel: {
          marketListUrl: env.FANDUEL_PREDICTS_MARKET_LIST_URL || env.FANDUEL_MARKET_LIST_URL || "",
          apiKey: env.FANDUEL_PREDICTS_API_KEY || env.FANDUEL_API_KEY || ""
        },
        draftKings: {
          marketListUrl: env.DRAFTKINGS_PREDICTIONS_MARKET_LIST_URL || env.DRAFTKINGS_MARKET_LIST_URL || env.DK_PREDICTIONS_MARKET_LIST_URL || env.DK_MARKET_LIST_URL || "",
          apiKey: env.DRAFTKINGS_PREDICTIONS_API_KEY || env.DRAFTKINGS_API_KEY || env.DK_PREDICTIONS_API_KEY || env.DK_API_KEY || ""
        },
        polymarket: {
          usApiHost: polymarketEnv.POLYMARKET_US_API_HOST || env.POLYMARKET_US_API_HOST || POLYMARKET_US_API_BASE_URL,
          gatewayHost: polymarketEnv.POLYMARKET_US_GATEWAY_HOST || env.POLYMARKET_US_GATEWAY_HOST || POLYMARKET_US_GATEWAY_BASE_URL,
          chainId: Number(polymarketEnv.POLYMARKET_CHAIN_ID || env.POLYMARKET_CHAIN_ID || 137),
          secretKey: polymarketEnv.POLYMARKET_SECRET_KEY || polymarketEnv.POLYMARKET_PRIVATE_KEY || env.POLYMARKET_SECRET_KEY || env.POLYMARKET_PRIVATE_KEY || "",
          privateKey: polymarketEnv.POLYMARKET_PRIVATE_KEY || env.POLYMARKET_PRIVATE_KEY || "",
          apiKey: polymarketEnv.POLYMARKET_ACCESS_KEY || polymarketEnv.POLYMARKET_API_KEY || polymarketEnv.POLYMARKET_API || env.POLYMARKET_ACCESS_KEY || env.POLYMARKET_API_KEY || env.POLYMARKET_API || "",
          apiSecret: polymarketEnv.POLYMARKET_API_SECRET || env.POLYMARKET_API_SECRET || "",
          apiPassphrase: polymarketEnv.POLYMARKET_API_PASSPHRASE || env.POLYMARKET_API_PASSPHRASE || "",
          funderAddress: polymarketEnv.POLYMARKET_FUNDER_ADDRESS || env.POLYMARKET_FUNDER_ADDRESS || "",
          signatureType: Number(polymarketEnv.POLYMARKET_SIGNATURE_TYPE || env.POLYMARKET_SIGNATURE_TYPE || 0)
        }
      };
    } catch {}
  }
  return {
    configured: false,
    envPath: LOCAL_ENV_PATHS[0],
    apiKeyId: "",
    privateKeyPath: "",
    privateKeyPem: "",
    envName: "prod",
    baseUrl: "https://external-api.kalshi.com/trade-api/v2",
    liveTradingEnabled: false,
    maxDollarsAtRisk: LIVE_DEFAULT_MAX_DOLLARS_AT_RISK,
    btcPriceUrl: "",
    btcPriceApiKey: "",
    btcPriceIndex: "KALSHI_BTC_SPOT",
    spotSources: {
      bitcoin: { url: "", apiKey: "", index: "KALSHI_BTC_SPOT" },
      sp: { url: "", apiKey: "", index: "KALSHI_SPOT_SP" },
      gold: { url: "", apiKey: "", index: "KALSHI_SPOT_GOLD" },
      crude: { url: "", apiKey: "", index: "KALSHI_SPOT_CRUDE" }
    },
    assetSeries: {
      sp: SP_HOURLY_SERIES,
      gold: "KXGOLD",
      crude: "KXOIL",
      weather: []
    },
    webull: { eventMarketListUrl: "", token: "" },
    fanduel: { marketListUrl: "", apiKey: "" },
    draftKings: { marketListUrl: "", apiKey: "" },
    polymarket: {
      usApiHost: POLYMARKET_US_API_BASE_URL,
      gatewayHost: POLYMARKET_US_GATEWAY_BASE_URL,
      chainId: 137,
      secretKey: "",
      privateKey: "",
      apiKey: "",
      apiSecret: "",
      apiPassphrase: "",
      funderAddress: "",
      signatureType: 0
    }
  };
}

async function loadOptionalEnv(envPath) {
  try {
    const raw = await fs.readFile(envPath, "utf8");
    return parseEnv(raw);
  } catch {
    return {};
  }
}

function splitEnvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
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

async function loadPersistedPaperState() {
  try {
    const raw = await fs.readFile(path.join(RESULTS_DIR, "latest-live-trades.json"), "utf8");
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return createPaperState();
    const trades = (Array.isArray(saved.trades) ? saved.trades : []).map((trade) => {
      if (!LIVE_HIDE_TARGET_ORDERS || !trade || typeof trade !== "object" || !["SUBMITTING", "OPEN"].includes(trade.status)) return trade;
      return {
        ...trade,
        targetHidden: true,
        targetPending: false,
        targetError: null
      };
    });
    const botRealizedPnl = round4(trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0));
    const persistedMaxTradeDollars = DEFAULT_SETTINGS.maxTradeDollars;
    const persistedMaxOpenDollars = DEFAULT_SETTINGS.maxOpenDollars;
    return {
      ...createPaperState(),
      ...saved,
      startingCash: 0,
      cash: 0,
      equity: 0,
      openPositionValue: 0,
      botOpenPositionValue: 0,
      liveSystemPositionValue: 0,
      unrealizedPnl: 0,
      realizedPnl: botRealizedPnl,
      totalPnl: botRealizedPnl,
      botRealizedPnl,
      botUnrealizedPnl: 0,
      botTotalPnl: botRealizedPnl,
      settings: {
        ...createPaperState().settings,
        ...(saved.settings || {}),
        maxContracts: Math.min(Number(saved.settings?.maxContracts || PAPER_MAX_CONTRACTS), PAPER_MAX_CONTRACTS),
        maxTradeDollars: persistedMaxTradeDollars,
        maxOpenDollars: persistedMaxOpenDollars
      },
      trades,
      log: Array.isArray(saved.log) ? saved.log : [],
      shadowLog: Array.isArray(saved.shadowLog) ? saved.shadowLog : [],
      shadow: saved.shadow && typeof saved.shadow === "object" ? {
        bestCandidate: saved.shadow.bestCandidate || null,
        candidateSince: saved.shadow.candidateSince || null,
        lastCandidateKey: saved.shadow.lastCandidateKey || "",
        lastLoggedAt: Number(saved.shadow.lastLoggedAt || 0),
        lastIdleWarningAt: Number(saved.shadow.lastIdleWarningAt || 0),
        account: normalizeShadowPaperAccount(saved.shadow.account)
      } : createPaperState().shadow,
      activeTrade: saved.activeTrade || trades.find((trade) => trade.status === "OPEN" || trade.status === "SUBMITTING") || null,
      entryInProgress: false,
      entryInProgressKey: null,
      sportsArbInProgress: false,
      btcArbInProgress: false,
      sportsArbRecovery: null,
      executionState: "IDLE",
      executionSignal: null,
      executionStartedAt: null,
      executionUpdatedAt: null,
      executionCooldownUntil: 0,
      pendingReservedDollars: 0,
      btcDirectionLatch: saved.btcDirectionLatch && typeof saved.btcDirectionLatch === "object" ? {
        eventKey: saved.btcDirectionLatch.eventKey || "",
        side: saved.btcDirectionLatch.side || null,
        direction: saved.btcDirectionLatch.direction || "flat",
        since: saved.btcDirectionLatch.since || null,
        lastUpdatedAt: Number(saved.btcDirectionLatch.lastUpdatedAt || 0)
      } : createPaperState().btcDirectionLatch,
      exposureCooldowns: saved.exposureCooldowns && typeof saved.exposureCooldowns === "object" ? saved.exposureCooldowns : {},
      safetyHalted: Boolean(saved.safetyHalted),
      safetyHaltReason: saved.safetyHaltReason || "",
      consecutiveStopLosses: Number(saved.consecutiveStopLosses || 0),
      lossBrakeLastAnalysis: saved.lossBrakeLastAnalysis || ""
    };
  } catch {
    return createPaperState();
  }
}

let paperState = latestSnapshot.paper;
if (!activeSystemTrades().length) {
  paperState.enabled = false;
  paperState.windingDown = false;
  paperState.safetyHalted = false;
  paperState.safetyHaltReason = "";
  paperState.settings.maxTradeDollars = DEFAULT_SETTINGS.maxTradeDollars;
  paperState.settings.maxOpenDollars = DEFAULT_SETTINGS.maxOpenDollars;
  paperState.settings.enableBitcoin = false;
  paperState.settings.enableBitcoinArb = false;
  paperState.settings.enableOtherMarkets = false;
  paperState.settings.enableSportsArb = false;
  paperState.settings.enableSpArb = false;
  paperState.stoppedAt = paperState.stoppedAt || new Date().toISOString();
  latestSnapshot.paper = paperState;
}
let tradeExecutorRunning = false;
let paperMonitorTimer = null;
let btcFastLoopTimer = null;

function createScanController(settings) {
  latestSnapshot = {
    running: true,
    results: [],
    audit: [],
    gameScanLog: [],
    sportsArbCandidates: [],
    sportsArbWatch: null,
    paper: paperState,
    counters: emptyCounters(),
    settings,
    btcTechnicalBias: null,
    baseUrl: null,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    now: null
  };
  publish("snapshot", latestSnapshot);
  return {
    running: true,
    stopRequested: false,
    abortController: new AbortController(),
    settings,
    results: [],
    audit: latestSnapshot.audit,
    gameScanLog: latestSnapshot.gameScanLog,
    counters: latestSnapshot.counters,
    baseUrl: null,
    tennisPriceHistory: new Map(),
    btcTechnicalBias: cachedBtcTechnicalBias,
    calendarCursor: "",
    calendarPage: 1,
    lastBitcoinInterleaveAt: 0,
    lastTennisInterleaveAt: 0,
    bestSportsChopCandidate: null,
    bestSportsChopPromotedAt: 0,
    sportsPairArbBook: new Map(),
    sportsPairArbLastLogged: new Map(),
    sportsArbEventKey: "",
    sportsArbWatch: null,
    bitcoinArbWatch: null,
    otherBookWatch: null
  };
}

function endScan() {
  if (!activeScan) return;
  activeScan.running = false;
  latestSnapshot.running = false;
  latestSnapshot.stoppedAt = new Date().toISOString();
  publish("done", latestSnapshot);
  activeScan = null;
}

function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS, ...raw };
  settings.accountValue = clampNumber(settings.accountValue, 1, 1_000_000, DEFAULT_SETTINGS.accountValue);
  settings.contracts = clampInt(settings.contracts, 1, 1000, DEFAULT_SETTINGS.contracts);
  settings.minNetProfitPct = clampNumber(settings.minNetProfitPct, 1, 100, 10);
  settings.minDisplayEvPct = clampNumber(settings.minDisplayEvPct, 0, 100, DEFAULT_SETTINGS.minDisplayEvPct);
  settings.maxTradeDollars = clampNumber(settings.maxTradeDollars, 0, USER_MAX_TRADE_DOLLARS_LIMIT, DEFAULT_SETTINGS.maxTradeDollars);
  settings.maxOpenDollars = clampNumber(settings.maxOpenDollars, 0, USER_MAX_OPEN_DOLLARS_LIMIT, DEFAULT_SETTINGS.maxOpenDollars);
  settings.minBuyPriceCents = Math.max(55, clampNumber(settings.minBuyPriceCents, 0, 99, DEFAULT_SETTINGS.minBuyPriceCents));
  settings.minTargetProfitDollars = clampNumber(settings.minTargetProfitDollars, 0, 1000, DEFAULT_SETTINGS.minTargetProfitDollars);
  settings.feeCushionCents = clampNumber(settings.feeCushionCents, 0, 20, 3);
  settings.skipComboMarkets = true;
  settings.enableBitcoin = false;
  settings.enableBitcoinArb = false;
  settings.enableOtherMarkets = false;
  settings.enableSportsArb = false;
  settings.enableSpArb = false;
  settings.enableGoldScanning = false;
  settings.enableCrudeOilScanning = false;
  settings.enableWeatherScanning = raw.enableWeatherScanning === true;
  settings.bookScanOnly = false;
  settings.orderbookConcurrency = clampInt(settings.orderbookConcurrency, 1, 5, DEFAULT_SETTINGS.orderbookConcurrency);
  settings.candleConcurrency = clampInt(settings.candleConcurrency, 1, 5, DEFAULT_SETTINGS.candleConcurrency);
  settings.maxResults = clampInt(settings.maxResults, 10, 100, 100);
  settings.continuous = raw.continuous !== false;
  return settings;
}

async function runScan(scan) {
  logAudit("info", "Connecting to Kalshi market data API");
  const baseUrl = await probeBaseUrl(scan);
  scan.baseUrl = baseUrl;
  latestSnapshot.baseUrl = baseUrl;
  logAudit("info", `Using Kalshi API base: ${baseUrl}`);

  do {
    await runOnePass(scan, baseUrl);
    if (!scan.settings.continuous || scan.stopRequested || scan.abortController.signal.aborted) break;
    const waitMs = 60_000;
    const waitSeconds = Math.round(waitMs / 1000);
    if (Date.now() - Number(scan.lastContinuousWaitLogAt || 0) > 55_000) {
      logAudit("info", `Continuous mode is on; waiting ${waitSeconds} seconds before the next priority pass.`);
      scan.lastContinuousWaitLogAt = Date.now();
    }
    await sleep(waitMs, scan.abortController.signal).catch(() => {});
  } while (!scan.stopRequested && !scan.abortController.signal.aborted);

  logAudit("info", "Scan stopped.");
  endScan();
}

function startBtcFastLoop(scan, baseUrl) {
  stopBtcFastLoop();
  btcFastLoopTimer = setInterval(() => {
    if (scan.settings.enableBitcoinArb === false) return;
    if (!scan.running || scan.stopRequested || scan.abortController.signal.aborted) {
      stopBtcFastLoop();
      return;
    }
    if (bitcoinImmediateScanInProgress) return;
    bitcoinImmediateScanInProgress = true;
    Promise.resolve()
      .then(async () => {
        await scanBitcoinLane(scan, baseUrl, "BTC fast loop", BTC_INTERLEAVE_MARKET_LIMIT, { freshTickers: true, quiet: true });
      })
      .catch((error) => logAudit("warn", `BTC fast loop skipped: ${error.message}`))
      .finally(() => {
        bitcoinImmediateScanInProgress = false;
      });
  }, BTC_INTERLEAVE_MS);
}

function stopBtcFastLoop() {
  if (btcFastLoopTimer) clearInterval(btcFastLoopTimer);
  btcFastLoopTimer = null;
}

async function probeBaseUrl(scan) {
  if (liveConfig.configured && liveConfig.baseUrl) {
    return liveConfig.baseUrl;
  }
  let lastError = null;
  for (const baseUrl of BASE_URLS) {
    try {
      const url = `${baseUrl}/markets?status=open&limit=1`;
      const data = await fetchJson(url, { signal: scan.abortController.signal, endpointLabel: "/markets probe" });
      if (Array.isArray(data.markets)) return baseUrl;
      lastError = new Error("Probe returned no markets array");
    } catch (error) {
      lastError = error;
      logApiFailure("/markets probe", error, 0, "continued to fallback base URL");
    }
  }
  throw lastError || new Error("No Kalshi market data API base URL responded.");
}

async function runOnePass(scan, baseUrl) {
  if (liveConfig.configured) {
    await refreshLiveAccountFromKalshi().catch((error) => paperLog(`Balance refresh before scan failed: ${error.message}`));
    scan.settings.accountValue = liveSizingAccountDollars();
  }
  scan.counters.marketsDiscovered = 0;
  scan.counters.marketsScanned = 0;
  scan.scannedTickers = new Set();
  if (scan.settings.enableWeatherScanning) {
    await scanWeatherDailyLane(scan, baseUrl, "lane Weather Scanning");
  } else {
    logAudit("info", "Weather Scanning is OFF.");
  }
  secondaryScanIndex += 1;
  await persistLatestResults();
}

async function fetchAndScanLiveSeriesFallback(scan, baseUrl, marketLimit = LIVE_SERIES_FALLBACK_MARKET_LIMIT) {
  if (scan.settings.enableSportsArb !== true || scan.stopRequested || scan.abortController.signal.aborted) return;
  const seriesList = await dynamicGameSeriesForPass(baseUrl).catch((error) => {
    logAudit("warn", `Sports arb live-series fallback unavailable: ${error.message}`);
    return [];
  });
  const selectedSeries = [...new Set([
    ...SPORTS_ARB_LIVE_SERIES,
    ...seriesList.filter((ticker) => /^KXMLB/i.test(ticker) && !isBitcoinSeries(ticker))
  ])].slice(0, LIVE_SERIES_FALLBACK_MAX_SERIES);
  if (!selectedSeries.length) {
    logAudit("info", "Sports arb live-series fallback found no MLB game series to scan.");
    return;
  }
  const liveMarkets = [];
  const now = Date.now();
  for (const seriesTicker of selectedSeries) {
    if (scan.stopRequested || scan.abortController.signal.aborted || liveMarkets.length >= marketLimit) break;
    const url = new URL(`${baseUrl}/events`);
    url.searchParams.set("status", "open");
    url.searchParams.set("with_nested_markets", "true");
    url.searchParams.set("series_ticker", seriesTicker);
    url.searchParams.set("limit", "100");
    try {
      const data = await fetchWithRetry(url.toString(), {
        signal: scan.abortController.signal,
        endpointLabel: `/events ${seriesTicker} live arb fallback`,
        maxRetries: 0,
        paced: true
      });
      const markets = (data.events || []).flatMap((event) => {
        return (event.markets || [])
          .map((market) => normalizeMarket(market, event))
          .map((market) => ({
            ...market,
            liveFallbackConfirmed: true,
            liveMilestoneStatus: market.liveMilestoneStatus || "live_series_fallback",
            liveMilestoneTitle: market.liveMilestoneTitle || event.title || "",
            liveMilestoneType: market.liveMilestoneType || seriesTicker,
            liveMilestoneStartDate: market.liveMilestoneStartDate || market.occurrence_datetime || event.start_date || ""
          }))
          .filter((market) => isLiveSeriesFallbackMarket(market, now));
      });
      liveMarkets.push(...markets);
    } catch (error) {
      scan.counters.apiFailures += 1;
      logApiFailure(`/events ${seriesTicker} live arb fallback`, error, error.retryCount || 0, "continued live-series fallback scan");
    }
  }
  const uniqueMarkets = dedupeMarkets(liveMarkets)
    .sort((a, b) => liveMarketScore(b) - liveMarketScore(a))
    .slice(0, marketLimit);
  scan.counters.marketsDiscovered += uniqueMarkets.length;
  latestSnapshot.counters = scan.counters;
  publish("counters", scan.counters);
  if (!uniqueMarkets.length) {
    logAudit("info", `Sports arb live-series fallback scanned ${selectedSeries.length} series, but found 0 live/recent active winner markets.`);
    return;
  }
  logAudit("info", `Sports arb live-series fallback scanning ${uniqueMarkets.length} live/recent MLB winner contracts from ${selectedSeries.length} series.`);
  await scanMarkets(scan, baseUrl, uniqueMarkets, Math.max(0, scan.counters.marketsDiscovered - uniqueMarkets.length));
}

function isLiveSeriesFallbackMarket(market, now = Date.now()) {
  if (!isActiveWindowMarket(market) || !isGameWinnerMarket(market)) return false;
  const bucket = allowedCalendarBucket(market);
  if (!isMlbMarket(market)) return false;
  if (market.status && !/\b(active|open)\b/i.test(String(market.status))) return false;
  const start = Date.parse(market.liveMilestoneStartDate || market.occurrence_datetime || market.expected_expiration_time || "");
  if (!Number.isFinite(start)) return false;
  if (start > now + 10 * 60_000) return false;
  const maxAgeHours = LIVE_SERIES_FALLBACK_MAX_EVENT_AGE_HOURS;
  if (now - start > maxAgeHours * 3_600_000) return false;
  return validCents(market.yes_ask) || validCents(market.no_ask) || validCents(market.yes_bid) || validCents(market.no_bid);
}

async function scanBitcoinLane(scan, baseUrl, label = "Bitcoin", marketLimit = BTC_INTERLEAVE_MARKET_LIMIT, options = {}) {
  if (scan.settings.enableBitcoinArb === false) {
    recordBtcStatusScan([], "Bitcoin Arb lane is OFF in the app controls.");
    if (!options.quiet) logAudit("info", "Bitcoin Scanning is OFF.");
    return;
  }
  if (scan.stopRequested || scan.abortController.signal.aborted) return;
  if (isBitcoinHourlyBlackoutNow()) {
    logBitcoinHourlyBlackoutPause(scan, options);
    scan.lastBitcoinInterleaveAt = Date.now();
    return;
  }
  await fetchAndScanBitcoinHourly(scan, baseUrl, label, marketLimit, options);
  scan.lastBitcoinInterleaveAt = Date.now();
}

async function scanSpLane(scan, baseUrl, label = "S&P hourly") {
  if (scan.settings.enableSpArb !== true) {
    updateSpArbWatch(null);
    return;
  }
  if (scan.stopRequested || scan.abortController.signal.aborted) return;
  if (!isSpHourlyWindowNow()) {
    logAudit("info", "S&P Arb lane blocked: outside regular S&P hourly window.");
    updateSpArbWatch({
      phase: "BLOCKED",
      eventLabel: "S&P Hourly",
      reason: "Outside S&P hourly window. Finance hourlies are monitored during regular market hours."
    });
    return;
  }
  try {
    const url = new URL(`${baseUrl}/events`);
    url.searchParams.set("series_ticker", SP_HOURLY_SERIES);
    url.searchParams.set("status", "open");
    url.searchParams.set("with_nested_markets", "true");
    url.searchParams.set("limit", "200");
    logAudit("info", "Scanning S&P hourly finance contracts from KXINXU nested hourly events.");
    const data = await fetchWithRetry(url.toString(), {
      signal: scan.abortController.signal,
      endpointLabel: "/events KXINXU hourly"
    });
    const markets = (data.events || []).flatMap((event) => {
      return (event.markets || [])
        .map((market) => normalizeMarket(market, event))
        .filter(isSpHourlyMarket);
    });
    const eventMarkets = latestSpHourlyEventGroup(markets);
    scan.counters.marketsDiscovered += eventMarkets.length;
    latestSnapshot.counters = scan.counters;
    publish("counters", scan.counters);
    if (!eventMarkets.length) {
      logAudit("info", `S&P lane found no current hourly contract. KXINXU open events returned ${markets.length} S&P-like candidates.`);
      updateSpArbWatch({
        phase: "WAIT",
        eventLabel: "S&P Hourly",
        reason: `No active S&P hourly market found in KXINXU. Checked ${markets.length} S&P-like open event markets.`,
        checkedCount: markets.length,
        closest: spHourlyClosestNoAnchor(markets),
        spReferencePrice: inferSpReferenceStrike(markets)
      });
      return;
    }
    const enrichedEventMarkets = [];
    for (const market of eventMarkets) {
      const orderbook = await fetchAuthOrderbook(market.ticker).catch(() => null);
      enrichedEventMarkets.push(orderbook ? enrichMarketWithBook(market, orderbook) : market);
    }
    const chosen = bestSpHourlyStrike(enrichedEventMarkets);
    const closest = spHourlyClosestNoAnchor(enrichedEventMarkets);
    const eventLabel = spHourlyEventLabel(eventMarkets[0]);
    logAudit("info", `S&P Arb lane scanning ${enrichedEventMarkets.length} ${eventLabel} strikes; nearest ${chosen?.ticker || "none"}.`);
    updateSpArbWatch({
      phase: "MONITORING",
      seriesTicker: SP_HOURLY_SERIES,
      eventTicker: eventMarkets[0]?.event_ticker || "",
      eventLabel,
      expiresAt: decisionIso(eventMarkets[0]),
      reason: "Finance S&P hourly monitor only; live execution is not enabled yet.",
      strikeCount: enrichedEventMarkets.length,
      spReferencePrice: inferSpReferenceStrike(enrichedEventMarkets),
      closest,
      current: chosen ? {
        ticker: chosen.ticker,
        strikeLabel: chosen.yes_sub_title || chosen.subtitle || chosen.ticker,
        yesAsk: chosen.yes_ask,
        yesBid: chosen.yes_bid,
        noAsk: chosen.no_ask,
        noBid: chosen.no_bid
      } : null
    });
    await persistAssetHourlySample(SCAN_ASSETS.sp, enrichedEventMarkets);
    recordSpStatusScan(chosen || eventMarkets[0], eventMarkets.length, label);
  } catch (error) {
    scan.counters.apiFailures += 1;
    updateSpArbWatch({
      phase: "BLOCKED",
      eventLabel: "S&P Hourly",
      reason: `S&P hourly scan failed: ${error.message}`
    });
    logApiFailure("/events KXINXU hourly", error, error.retryCount || 0, "continued without S&P hourly scan");
  }
}

async function scanAssetHourlyLane(scan, baseUrl, asset, label = "") {
  if (!asset || scan.settings[asset.settingsKey] !== true) return;
  if (scan.stopRequested || scan.abortController.signal.aborted) return;
  try {
    const url = new URL(`${baseUrl}/markets`);
    url.searchParams.set("series_ticker", asset.series);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", "1000");
    logAudit("info", `Scanning ${asset.label} hourly finance contracts from ${asset.series}.`);
    const data = await fetchJson(url.toString(), {
      signal: scan.abortController.signal,
      endpointLabel: `/markets ${asset.series} hourly`
    });
    const markets = (data.markets || [])
      .map(normalizeMarket)
      .filter((market) => isAssetHourlyMarket(asset, market));
    const eventMarkets = latestAssetHourlyEventGroup(markets);
    scan.counters.marketsDiscovered += eventMarkets.length;
    latestSnapshot.counters = scan.counters;
    publish("counters", scan.counters);
    if (!eventMarkets.length) {
      logAudit("info", `${asset.label} Scanning found no current hourly contract in ${asset.series}; checked ${markets.length} hourly-like candidates.`);
      return;
    }
    const enrichedEventMarkets = [];
    for (const market of eventMarkets) {
      const orderbook = await fetchAuthOrderbook(market.ticker).catch(() => null);
      enrichedEventMarkets.push(orderbook ? enrichMarketWithBook(market, orderbook) : market);
    }
    const recording = await persistAssetHourlySample(asset, enrichedEventMarkets);
    const chosen = bestAssetHourlyStrike(enrichedEventMarkets);
    logAudit("info", `${asset.label} Scanning copied ${recording?.contractRows || 0} active ${asset.label} hourly strikes${chosen?.ticker ? `; nearest ${chosen.ticker}` : ""}.`);
    recordAssetStatusScan(asset, chosen || eventMarkets[0], recording?.contractRows || 0, label || `${asset.label} Scanning`);
  } catch (error) {
    scan.counters.apiFailures += 1;
    logApiFailure(`/markets ${asset.series} hourly`, error, error.retryCount || 0, `continued without ${asset.label} hourly scan`);
  }
}

async function scanWeatherDailyLane(scan, baseUrl, label = "lane Weather Scanning") {
  const asset = SCAN_ASSETS.weather;
  if (scan.settings[asset.settingsKey] !== true) return;
  if (scan.stopRequested || scan.abortController.signal.aborted) return;
  const now = Date.now();
  const inPrimaryWindow = isWeatherScanWindow();
  const intervalMs = inPrimaryWindow ? WEATHER_DAY_SCAN_INTERVAL_MS : WEATHER_NIGHT_SCAN_INTERVAL_MS;
  const lastScanAt = Number(lastWeatherDailyScanAt || 0);
  if (lastScanAt && now - lastScanAt < intervalMs) return;
  if (!inPrimaryWindow && now - Number(scan.lastWeatherWindowAuditAt || 0) > 55_000) {
    logAudit("info", "Weather Scanning overnight mode: one authenticated weather pull per hour outside 8:00 AM-8:00 PM Eastern Time.");
    scan.lastWeatherWindowAuditAt = now;
  }
  lastWeatherDailyScanAt = now;
  try {
    const seriesList = await weatherDailySeriesForScan(baseUrl, scan.abortController.signal);
    if (!seriesList.length) {
      logAudit("warn", "Weather Scanning found no daily weather series from the authenticated Kalshi API.");
      return;
    }
    let copiedRows = 0;
    let checkedMarkets = 0;
    let statusMarket = null;
    for (const seriesTicker of seriesList.slice(0, WEATHER_SERIES_PER_PASS)) {
      if (scan.stopRequested || scan.abortController.signal.aborted) break;
      const url = new URL(`${baseUrl}/markets`);
      url.searchParams.set("series_ticker", seriesTicker);
      url.searchParams.set("status", "open");
      url.searchParams.set("limit", "1000");
      logAudit("info", `Scanning Weather daily contracts from ${seriesTicker}.`);
      const data = await fetchJson(url.toString(), {
        signal: scan.abortController.signal,
        endpointLabel: `/markets ${seriesTicker} weather daily`
      });
      const markets = (data.markets || [])
        .map(normalizeMarket)
        .filter((market) => isWeatherDailyMarket(market));
      const eventMarkets = latestWeatherDailyEventGroup(markets);
      checkedMarkets += eventMarkets.length;
      if (!eventMarkets.length) continue;
      const enrichedEventMarkets = [];
      for (const market of eventMarkets) {
        const orderbook = await fetchAuthOrderbook(market.ticker).catch(() => null);
        enrichedEventMarkets.push(orderbook ? enrichMarketWithBook(market, orderbook) : market);
      }
      const recording = await persistWeatherDailySample(enrichedEventMarkets);
      copiedRows += recording?.contractRows || 0;
      const matchSummary = await matchKalshiWeatherWithPolymarket(enrichedEventMarkets, seriesTicker, scan.abortController.signal);
      if (matchSummary?.matchCount) {
        logAudit("info", `Polymarket weather matched ${matchSummary.matchCount} rows for ${seriesTicker}; ${matchSummary.comparableCount} comparable Polymarket rows checked.`);
      } else if (matchSummary) {
        logAudit("info", `Polymarket weather found no exact match for ${seriesTicker}; ${matchSummary.comparableCount} comparable rows checked.`);
      }
      const webullMatchSummary = await matchKalshiWeatherWithWebull(enrichedEventMarkets, seriesTicker, scan.abortController.signal);
      if (webullMatchSummary?.matchCount) {
        logAudit("info", `Webull weather matched ${webullMatchSummary.matchCount} rows for ${seriesTicker}; ${webullMatchSummary.comparableCount} comparable Webull rows checked.`);
      } else if (webullMatchSummary?.configured) {
        logAudit("info", `Webull weather found no exact match for ${seriesTicker}; ${webullMatchSummary.comparableCount} comparable rows checked.`);
      }
      const fanduelMatchSummary = await matchKalshiWeatherWithFanduel(enrichedEventMarkets, seriesTicker, scan.abortController.signal);
      if (fanduelMatchSummary?.matchCount) {
        logAudit("info", `FanDuel weather matched ${fanduelMatchSummary.matchCount} rows for ${seriesTicker}; ${fanduelMatchSummary.comparableCount} comparable FanDuel rows checked.`);
      } else if (fanduelMatchSummary?.configured) {
        logAudit("info", `FanDuel weather found no exact match for ${seriesTicker}; ${fanduelMatchSummary.comparableCount} comparable rows checked.`);
      }
      const draftKingsMatchSummary = await matchKalshiWeatherWithDraftKings(enrichedEventMarkets, seriesTicker, scan.abortController.signal);
      if (draftKingsMatchSummary?.matchCount) {
        logAudit("info", `DraftKings weather matched ${draftKingsMatchSummary.matchCount} rows for ${seriesTicker}; ${draftKingsMatchSummary.comparableCount} comparable DraftKings rows checked.`);
      } else if (draftKingsMatchSummary?.configured) {
        logAudit("info", `DraftKings weather found no exact match for ${seriesTicker}; ${draftKingsMatchSummary.comparableCount} comparable rows checked.`);
      }
      statusMarket ||= bestWeatherDailyStrike(enrichedEventMarkets) || eventMarkets[0];
    }
    scan.counters.marketsDiscovered += checkedMarkets;
    latestSnapshot.counters = scan.counters;
    publish("counters", scan.counters);
    logAudit("info", `Weather Scanning copied ${copiedRows} active daily weather contract rows from ${Math.min(seriesList.length, WEATHER_SERIES_PER_PASS)} weather series.`);
    recordAssetStatusScan(asset, statusMarket || {}, copiedRows, label);
  } catch (error) {
    scan.counters.apiFailures += 1;
    logApiFailure("/markets weather daily", error, error.retryCount || 0, "continued without Weather daily scan");
  }
}

async function matchKalshiWeatherWithPolymarket(markets = [], sourceSeries = "", signal = null) {
  const polymarketRows = await polymarketWeatherMarkets(signal).catch((error) => {
    logAudit("warn", `Polymarket weather API unavailable: ${error.message}`);
    return [];
  });
  return matchKalshiWeatherWithExternalSource({
    markets,
    sourceSeries,
    sourceKey: "polymarket",
    displayName: "Polymarket",
    snapshotKey: "polymarketWeatherMatches",
    folderSlug: "polymarket",
    sourceRows: polymarketRows
  });
}

async function matchKalshiWeatherWithWebull(markets = [], sourceSeries = "", signal = null) {
  const webullRows = await webullWeatherMarkets(signal).catch((error) => {
    const now = Date.now();
    if (now - lastWebullUnavailableLogAt > 30 * 60_000) {
      lastWebullUnavailableLogAt = now;
      logAudit("warn", `Webull weather API unavailable: ${error.message}`);
    }
    return { configured: false, markets: [] };
  });
  if (!webullRows.configured) {
    const now = Date.now();
    if (now - lastWebullUnavailableLogAt > 30 * 60_000) {
      lastWebullUnavailableLogAt = now;
      logAudit("warn", "Webull weather matching skipped: no public no-key Webull weather API was found; set WEBULL_EVENT_MARKET_LIST_URL and WEBULL_OPENAPI_TOKEN to use approved Webull OpenAPI access.");
    }
    return { configured: false, matchCount: 0, comparableCount: 0 };
  }
  return matchKalshiWeatherWithExternalSource({
    markets,
    sourceSeries,
    sourceKey: "webull",
    displayName: "Webull",
    snapshotKey: "webullWeatherMatches",
    folderSlug: "webull",
    sourceRows: webullRows.markets,
    configured: true
  });
}

async function matchKalshiWeatherWithFanduel(markets = [], sourceSeries = "", signal = null) {
  const fanduelRows = await fanduelWeatherMarkets(signal).catch((error) => {
    const now = Date.now();
    if (now - lastFanduelUnavailableLogAt > 30 * 60_000) {
      lastFanduelUnavailableLogAt = now;
      logAudit("warn", `FanDuel weather API unavailable: ${error.message}`);
    }
    return { configured: false, markets: [] };
  });
  if (!fanduelRows.configured) {
    const now = Date.now();
    if (now - lastFanduelUnavailableLogAt > 30 * 60_000) {
      lastFanduelUnavailableLogAt = now;
      logAudit("warn", "FanDuel weather matching skipped: no official public FanDuel Predicts weather API was found; set FANDUEL_PREDICTS_MARKET_LIST_URL only if you have an approved FanDuel feed.");
    }
    return { configured: false, matchCount: 0, comparableCount: 0 };
  }
  return matchKalshiWeatherWithExternalSource({
    markets,
    sourceSeries,
    sourceKey: "fanduel",
    displayName: "FanDuel",
    snapshotKey: "fanduelWeatherMatches",
    folderSlug: "fanduel",
    sourceRows: fanduelRows.markets,
    configured: true
  });
}

async function matchKalshiWeatherWithDraftKings(markets = [], sourceSeries = "", signal = null) {
  const draftKingsRows = await draftKingsWeatherMarkets(signal).catch((error) => {
    const now = Date.now();
    if (now - lastDraftKingsUnavailableLogAt > 30 * 60_000) {
      lastDraftKingsUnavailableLogAt = now;
      logAudit("warn", `DraftKings weather API unavailable: ${error.message}`);
    }
    return { configured: false, markets: [] };
  });
  if (!draftKingsRows.configured) {
    const now = Date.now();
    if (now - lastDraftKingsUnavailableLogAt > 30 * 60_000) {
      lastDraftKingsUnavailableLogAt = now;
      logAudit("warn", "DraftKings weather matching skipped: no official public DraftKings Predictions weather API was found; set DRAFTKINGS_PREDICTIONS_MARKET_LIST_URL only if you have an approved DraftKings feed.");
    }
    return { configured: false, matchCount: 0, comparableCount: 0 };
  }
  return matchKalshiWeatherWithExternalSource({
    markets,
    sourceSeries,
    sourceKey: "draftKings",
    displayName: "DraftKings",
    snapshotKey: "draftKingsWeatherMatches",
    folderSlug: "draftkings",
    sourceRows: draftKingsRows.markets,
    configured: true
  });
}

async function matchKalshiWeatherWithExternalSource({
  markets = [],
  sourceSeries = "",
  sourceKey = "",
  displayName = "",
  snapshotKey = "",
  folderSlug = "",
  sourceRows = [],
  configured = true
} = {}) {
  const kalshiRows = activeWeatherDailyStrikeRows(markets, new Date());
  if (!kalshiRows.length) return null;
  if (!configured) return { configured: false, matchCount: 0, comparableCount: 0 };
  const comparable = sourceRows.filter((row) => row.city && row.date && row.band).sort(weatherExternalRowSort);
  const matches = [];
  for (const kalshi of kalshiRows) {
    const kalshiCity = weatherCityFromTicker(kalshi.ticker);
    const kalshiDate = easternDate(new Date(kalshi.contract_end_time || Date.now()));
    const kalshiBand = weatherBandFromLabel(kalshi.yes_label) || weatherBandFromTicker(kalshi.ticker);
    if (!kalshiCity || !kalshiDate || !kalshiBand) continue;
    const match = comparable.find((external) => {
      return sameWeatherCity(external.city, kalshiCity)
        && external.date === kalshiDate
        && sameWeatherBand(external.band, kalshiBand);
    });
    if (!match) continue;
    matches.push(weatherMatchRow({
      sourceKey,
      displayName,
      sourceSeries,
      kalshi,
      kalshiCity,
      kalshiDate,
      kalshiBand,
      external: match
    }));
  }
  matches.sort(weatherMatchSort);
  if (matches.length) {
    latestSnapshot[snapshotKey] = [...matches, ...(latestSnapshot[snapshotKey] || [])]
      .sort(weatherMatchSort)
      .slice(0, 80);
    await persistWeatherExternalMatches({ sourceKey, displayName, folderSlug, matches });
  }
  return { configured: true, matchCount: matches.length, comparableCount: comparable.length };
}

function weatherMatchRow({ sourceKey, displayName, sourceSeries, kalshi, kalshiCity, kalshiDate, kalshiBand, external }) {
  const sourceSymbol = external.symbol || external.ticker || external.slug || external.id || "";
  const sourceQuestion = external.question || "";
  const sourceBestBid = decimalProbabilityText(external.bestBid);
  const sourceBestAsk = decimalProbabilityText(external.bestAsk);
  const sourceYes = sourceBestAsk || decimalProbabilityText(external.yesPrice);
  const row = {
    timestamp: new Date().toISOString(),
    city: kalshiCity,
    date: kalshiDate,
    label: kalshi.yes_label || formatWeatherBand(kalshiBand),
    bandType: kalshiBand?.type || "",
    bandLow: Number.isFinite(Number(kalshiBand?.low)) ? Number(kalshiBand.low) : null,
    bandHigh: Number.isFinite(Number(kalshiBand?.high)) ? Number(kalshiBand.high) : null,
    kalshiTicker: kalshi.ticker,
    kalshiYes: centsText(kalshi.yes_ask),
    sourceName: displayName,
    sourceKey,
    sourceSymbol,
    sourceQuestion,
    sourceSlug: external.slug || "",
    sourceYes,
    sourceBestBid,
    sourceBestAsk,
    sourceSeries
  };
  if (sourceKey === "polymarket") {
    row.polymarketQuestion = sourceQuestion;
    row.polymarketSlug = row.sourceSlug;
    row.polymarketYes = sourceYes;
    row.polymarketBestBid = sourceBestBid;
    row.polymarketBestAsk = sourceBestAsk;
  } else if (sourceKey === "webull") {
    row.webullSymbol = sourceSymbol;
    row.webullQuestion = sourceQuestion;
    row.webullYes = sourceYes;
    row.webullBestBid = sourceBestBid;
    row.webullBestAsk = sourceBestAsk;
  } else if (sourceKey === "fanduel") {
    row.fanduelSymbol = sourceSymbol;
    row.fanduelQuestion = sourceQuestion;
    row.fanduelYes = sourceYes;
    row.fanduelBestBid = sourceBestBid;
    row.fanduelBestAsk = sourceBestAsk;
  } else if (sourceKey === "draftKings") {
    row.draftKingsSymbol = sourceSymbol;
    row.draftKingsQuestion = sourceQuestion;
    row.draftKingsYes = sourceYes;
    row.draftKingsBestBid = sourceBestBid;
    row.draftKingsBestAsk = sourceBestAsk;
  }
  return row;
}

function weatherExternalRowSort(a, b) {
  return weatherCitySortValue(a.city).localeCompare(weatherCitySortValue(b.city))
    || String(a.date || "").localeCompare(String(b.date || ""))
    || weatherBandSortValue(a.band) - weatherBandSortValue(b.band)
    || String(a.question || "").localeCompare(String(b.question || ""));
}

function weatherMatchSort(a, b) {
  return weatherCitySortValue(a.city).localeCompare(weatherCitySortValue(b.city))
    || String(a.date || "").localeCompare(String(b.date || ""))
    || weatherBandSortValue(a) - weatherBandSortValue(b)
    || String(a.kalshiTicker || "").localeCompare(String(b.kalshiTicker || ""));
}

function weatherCitySortValue(city = "") {
  return String(city || "").trim().toLowerCase();
}

function weatherBandSortValue(value = {}) {
  if (value.band && typeof value.band === "object") return weatherBandSortValue(value.band);
  const type = value.type || value.bandType || "";
  if (type === "below") return Number.isFinite(Number(value.high ?? value.bandHigh)) ? Number(value.high ?? value.bandHigh) - 0.1 : -Infinity;
  if (type === "range") return Number.isFinite(Number(value.low ?? value.bandLow)) ? Number(value.low ?? value.bandLow) : 0;
  if (type === "above") return Number.isFinite(Number(value.low ?? value.bandLow)) ? Number(value.low ?? value.bandLow) + 0.1 : Infinity;
  return 0;
}

async function persistWeatherExternalMatches({ sourceKey, displayName, folderSlug, matches = [] }) {
  const date = easternDate(new Date());
  const dir = path.join(RECORDS_DIR, SCAN_ASSETS.weather.recordingFolder, `kalshi ${folderSlug} match log`, date);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `weather-kalshi-${folderSlug}-matches-${date}.txt`);
  const sorted = [...matches].sort(weatherMatchSort);
  const lines = [
    `# WEATHER CROSS-MARKET MATCHES - ${displayName.toUpperCase()} - ${new Date().toISOString()}`,
    "# MATCH RULE: same city + same contract date + same stated temperature band",
    "# ROW FORMAT: TIMESTAMP - CITY - CONTRACT DATE - BAND - KALSHI TICKER - KALSHI YES - SOURCE SYMBOL - SOURCE YES - SOURCE BID - SOURCE ASK - SOURCE QUESTION",
    ""
  ];
  let currentCity = "";
  for (const row of sorted) {
    if (row.city !== currentCity) {
      currentCity = row.city;
      lines.push(`## ${currentCity}`);
    }
    lines.push(weatherExternalMatchLine(row));
  }
  lines.push("");
  await fs.appendFile(file, `${lines.join("\n")}\n`, "utf8");
  await persistWeatherAlignedMatchIndex({ sourceKey, displayName, matches: sorted, date });
}

function weatherExternalMatchLine(row) {
  return [
    row.timestamp,
    row.city,
    row.date,
    row.label,
    `KALSHI ${row.kalshiTicker}`,
    `KALSHI YES ${row.kalshiYes}`,
    `${row.sourceName.toUpperCase()} ${row.sourceSymbol || "-"}`,
    `${row.sourceName.toUpperCase()} YES ${row.sourceYes}`,
    `BID ${row.sourceBestBid}`,
    `ASK ${row.sourceBestAsk}`,
    row.sourceQuestion || "-"
  ].join(" - ");
}

async function persistWeatherAlignedMatchIndex({ sourceKey, displayName, matches = [], date }) {
  const dir = path.join(RECORDS_DIR, SCAN_ASSETS.weather.recordingFolder, "aligned city match log", date);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `weather-aligned-city-matches-${date}.txt`);
  const lines = [
    `# WEATHER ALIGNED CITY MATCHES - ${displayName.toUpperCase()} - ${new Date().toISOString()}`,
    "# Cities are alphabetical. Only cities shared by Kalshi and this source appear here.",
    ""
  ];
  let currentCity = "";
  for (const row of matches) {
    if (row.city !== currentCity) {
      currentCity = row.city;
      lines.push(`## ${currentCity}`);
    }
    lines.push(`${row.timestamp} - ${row.city} - ${row.date} - ${row.label} - SOURCE ${sourceKey} - KALSHI ${row.kalshiTicker} YES ${row.kalshiYes} - ${displayName.toUpperCase()} ${row.sourceSymbol || "-"} YES ${row.sourceYes} BID ${row.sourceBestBid} ASK ${row.sourceBestAsk}`);
  }
  lines.push("");
  await fs.appendFile(file, `${lines.join("\n")}\n`, "utf8");
}

async function polymarketWeatherMarkets(signal = null) {
  const now = Date.now();
  if (cachedPolymarketWeatherMarkets.fetchedAt && now - cachedPolymarketWeatherMarkets.fetchedAt < POLYMARKET_WEATHER_CACHE_MS) {
    return cachedPolymarketWeatherMarkets.markets;
  }
  const queries = ["temperature", "weather"];
  const events = [];
  for (const query of queries) {
    const usData = await fetchPolymarketUsGatewayJson(`/v1/search?query=${encodeURIComponent(query)}&limit=50`, { signal });
    if (Array.isArray(usData.events)) events.push(...usData.events.map((event) => ({ ...event, sourcePlatform: "polymarket-us" })));
  }
  const markets = [];
  const seen = new Set();
  for (const event of events) {
    for (const market of event.markets || []) {
      const normalized = normalizePolymarketUsWeatherMarket(market, event);
      if (!normalized || seen.has(normalized.id || normalized.slug)) continue;
      seen.add(normalized.id || normalized.slug);
      markets.push(normalized);
    }
  }
  cachedPolymarketWeatherMarkets = { fetchedAt: now, markets };
  logAudit("info", `Loaded ${markets.length} active Polymarket weather rows for Kalshi matching.`);
  return markets;
}

async function fetchPolymarketUsGatewayJson(pathname, options = {}) {
  const config = liveConfig.polymarket || {};
  const base = String(config.gatewayHost || POLYMARKET_US_GATEWAY_BASE_URL).replace(/\/+$/, "");
  const pathWithQuery = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(pathWithQuery, `${base}/`);
  if (url.hostname !== "gateway.polymarket.us") throw new Error(`Blocked non-Polymarket US gateway request: ${url.href}`);
  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      accept: "application/json",
      "user-agent": "Prediction Weather local scanner"
    }
  });
  if (!response.ok) {
    const error = new Error(`Polymarket US gateway ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchPolymarketUsJson(pathname, options = {}) {
  const config = liveConfig.polymarket || {};
  const base = String(config.usApiHost || POLYMARKET_US_API_BASE_URL).replace(/\/+$/, "");
  const pathWithQuery = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(pathWithQuery, `${base}/`);
  if (url.hostname !== "api.polymarket.us") throw new Error(`Blocked non-Polymarket US API request: ${url.href}`);
  const method = String(options.method || "GET").toUpperCase();
  const headers = polymarketUsAuthHeaders(method, `${url.pathname}${url.search}`, config);
  const response = await fetch(url, {
    method,
    signal: options.signal,
    headers: {
      ...headers,
      accept: "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const error = new Error(`Polymarket US API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function polymarketUsAuthHeaders(method, pathWithQuery, config = {}) {
  const accessKey = String(config.apiKey || "").trim();
  const secretKey = String(config.secretKey || config.privateKey || "").trim();
  if (!accessKey || !secretKey) throw new Error("Polymarket API key and secret key are required for authenticated Polymarket US requests.");
  const timestamp = String(Date.now());
  const message = `${timestamp}${String(method || "GET").toUpperCase()}${pathWithQuery}`;
  const key = ed25519PrivateKeyFromPolymarketSecret(secretKey);
  const signature = cryptoSign(null, Buffer.from(message), key).toString("base64");
  return {
    "X-PM-Access-Key": accessKey,
    "X-PM-Timestamp": timestamp,
    "X-PM-Signature": signature,
    "Content-Type": "application/json"
  };
}

function ed25519PrivateKeyFromPolymarketSecret(secret) {
  const raw = decodePolymarketSecret(secret);
  if (raw.length < 32) throw new Error("Polymarket secret key is too short for official Ed25519 signing.");
  const seed = raw.subarray(0, 32);
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return cryptoCreatePrivateKey({
    key: Buffer.concat([pkcs8Prefix, seed]),
    format: "der",
    type: "pkcs8"
  });
}

function decodePolymarketSecret(secret) {
  const value = String(secret || "").trim();
  if (/^0x[0-9a-fA-F]{64,}$/.test(value)) return Buffer.from(value.slice(2), "hex");
  if (/^[0-9a-fA-F]{64,}$/.test(value)) return Buffer.from(value, "hex");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

async function webullWeatherMarkets(signal = null) {
  const config = liveConfig.webull || {};
  const url = String(config.eventMarketListUrl || "").trim();
  const token = String(config.token || "").trim();
  if (!url || !token) {
    return webullWeatherMarketsFromSdk(signal);
  }
  const now = Date.now();
  if (cachedWebullWeatherMarkets.fetchedAt && now - cachedWebullWeatherMarkets.fetchedAt < WEBULL_WEATHER_CACHE_MS) {
    return { configured: true, markets: cachedWebullWeatherMarkets.markets };
  }
  const data = await fetchWebullJson(url, { signal, token });
  const rows = collectObjects(data)
    .map(normalizeWebullWeatherMarket)
    .filter(Boolean);
  const seen = new Set();
  const markets = rows.filter((row) => {
    const key = row.id || row.symbol || row.ticker || row.question;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  cachedWebullWeatherMarkets = { fetchedAt: now, markets };
  logAudit("info", `Loaded ${markets.length} active Webull weather rows for Kalshi matching.`);
  return { configured: true, markets };
}

async function webullWeatherMarketsFromSdk(signal = null) {
  if (!existsSync(WEBULL_OPENAPI_ENV_PATH) || !existsSync(WEBULL_WEATHER_ROWS_SCRIPT)) {
    return { configured: false, markets: [] };
  }
  const pythonPath = existsSync(WEBULL_PYTHON_PATH) ? WEBULL_PYTHON_PATH : "python3";
  const now = Date.now();
  if (cachedWebullWeatherMarkets.fetchedAt && now - cachedWebullWeatherMarkets.fetchedAt < WEBULL_WEATHER_CACHE_MS) {
    return { configured: true, markets: cachedWebullWeatherMarkets.markets };
  }
  const data = await runJsonProcess(pythonPath, [WEBULL_WEATHER_ROWS_SCRIPT], {
    signal,
    timeoutMs: 45_000
  });
  const rows = Array.isArray(data?.markets) ? data.markets : [];
  const markets = rows
    .map(normalizeWebullWeatherMarket)
    .filter(Boolean);
  cachedWebullWeatherMarkets = { fetchedAt: now, markets };
  logAudit("info", `Loaded ${markets.length} active Webull weather rows from Webull OpenAPI SDK for Kalshi matching.`);
  return { configured: true, markets };
}

function runJsonProcess(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: __dirname,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${path.basename(command)} timed out`));
    }, options.timeoutMs || 30_000);
    const abort = () => {
      child.kill("SIGTERM");
      reject(new Error(`${path.basename(command)} aborted`));
    };
    if (options.signal) {
      if (options.signal.aborted) abort();
      options.signal.addEventListener("abort", abort, { once: true });
    }
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener("abort", abort);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${path.basename(command)} exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Could not parse ${path.basename(command)} JSON: ${error.message}`));
      }
    });
  });
}

async function fetchWebullJson(url, options = {}) {
  const parsed = new URL(url);
  const allowedHosts = new Set([
    "us-openapi.webullbroker.com",
    "us-openapi-alb.uat.webullbroker.com",
    "api.webull.com"
  ]);
  if (!allowedHosts.has(parsed.hostname)) throw new Error(`Blocked non-Webull API request: ${url}`);
  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${options.token}`
    }
  });
  if (!response.ok) {
    const error = new Error(`Webull API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fanduelWeatherMarkets(signal = null) {
  const config = liveConfig.fanduel || {};
  const url = String(config.marketListUrl || "").trim();
  if (!url) return { configured: false, markets: [] };
  const now = Date.now();
  if (cachedFanduelWeatherMarkets.fetchedAt && now - cachedFanduelWeatherMarkets.fetchedAt < FANDUEL_WEATHER_CACHE_MS) {
    return { configured: true, markets: cachedFanduelWeatherMarkets.markets };
  }
  const data = await fetchFanduelJson(url, { signal, apiKey: config.apiKey });
  const rows = collectObjects(data)
    .map(normalizeFanduelWeatherMarket)
    .filter(Boolean);
  const seen = new Set();
  const markets = rows.filter((row) => {
    const key = row.id || row.symbol || row.ticker || row.question;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  cachedFanduelWeatherMarkets = { fetchedAt: now, markets };
  logAudit("info", `Loaded ${markets.length} active FanDuel weather rows for Kalshi matching.`);
  return { configured: true, markets };
}

async function fetchFanduelJson(url, options = {}) {
  const parsed = new URL(url);
  const allowedHosts = new Set([
    "api.fanduel.com",
    "www.fanduel.com",
    "fanduel.com"
  ]);
  if (!allowedHosts.has(parsed.hostname)) throw new Error(`Blocked non-FanDuel API request: ${url}`);
  const headers = { accept: "application/json" };
  const apiKey = String(options.apiKey || "").trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(url, { signal: options.signal, headers });
  if (!response.ok) {
    const error = new Error(`FanDuel API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function draftKingsWeatherMarkets(signal = null) {
  const config = liveConfig.draftKings || {};
  const url = String(config.marketListUrl || "").trim();
  if (!url) return { configured: false, markets: [] };
  const now = Date.now();
  if (cachedDraftKingsWeatherMarkets.fetchedAt && now - cachedDraftKingsWeatherMarkets.fetchedAt < DRAFTKINGS_WEATHER_CACHE_MS) {
    return { configured: true, markets: cachedDraftKingsWeatherMarkets.markets };
  }
  const data = await fetchDraftKingsJson(url, { signal, apiKey: config.apiKey });
  const rows = collectObjects(data)
    .map(normalizeDraftKingsWeatherMarket)
    .filter(Boolean);
  const seen = new Set();
  const markets = rows.filter((row) => {
    const key = row.id || row.symbol || row.ticker || row.question;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  cachedDraftKingsWeatherMarkets = { fetchedAt: now, markets };
  logAudit("info", `Loaded ${markets.length} active DraftKings weather rows for Kalshi matching.`);
  return { configured: true, markets };
}

async function fetchDraftKingsJson(url, options = {}) {
  const parsed = new URL(url);
  const allowedHosts = new Set([
    "api.draftkings.com",
    "sportsbook.draftkings.com",
    "www.draftkings.com",
    "draftkings.com"
  ]);
  if (!allowedHosts.has(parsed.hostname)) throw new Error(`Blocked non-DraftKings API request: ${url}`);
  const headers = { accept: "application/json" };
  const apiKey = String(options.apiKey || "").trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(url, { signal: options.signal, headers });
  if (!response.ok) {
    const error = new Error(`DraftKings API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function collectObjects(value, out = []) {
  if (!value || out.length > 5000) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out);
    return out;
  }
  if (typeof value === "object") {
    out.push(value);
    for (const item of Object.values(value)) collectObjects(item, out);
  }
  return out;
}

function normalizeWebullWeatherMarket(row = {}) {
  const question = String(row.question || row.title || row.name || row.marketName || row.eventName || row.instrumentName || row.symbolName || "");
  const symbol = String(row.symbol || row.ticker || row.instrumentId || row.instrumentCode || row.contractId || row.id || "");
  const text = `${question} ${symbol} ${row.description || ""} ${row.subTitle || ""}`;
  if (!/\b(weather|temperature|high temp|high temperature|low temp|low temperature|kxhigh|kxlow)\b/i.test(text)) return null;
  if (/\b(space weather|geomagnetic|solar radiation|radio blackout|hurricane|named storm)\b/i.test(text)) return null;
  const city = weatherCityFromText(text);
  const date = webullWeatherDate(row);
  const band = weatherBandFromLabel(row.groupItemTitle || row.outcomeName || row.yesLabel || question || text) || weatherBandFromTicker(symbol);
  const yesPrice = firstFiniteNumber(row.yesPrice, row.yesAsk, row.lastPrice, row.price, row.probability, row.markPrice);
  const bestBid = firstFiniteNumber(row.bestBid, row.bid, row.bidPrice, row.yesBid);
  const bestAsk = firstFiniteNumber(row.bestAsk, row.ask, row.askPrice, row.yesAsk);
  return {
    id: String(row.id || row.instrumentId || row.contractId || symbol || ""),
    symbol,
    ticker: String(row.ticker || ""),
    question,
    city,
    date,
    band,
    yesPrice: normalizeProbability(yesPrice),
    bestBid: normalizeProbability(bestBid),
    bestAsk: normalizeProbability(bestAsk),
    raw: row
  };
}

function normalizeFanduelWeatherMarket(row = {}) {
  const question = String(row.question || row.title || row.name || row.marketName || row.eventName || row.instrumentName || row.runnerName || "");
  const symbol = String(row.symbol || row.ticker || row.marketId || row.selectionId || row.contractId || row.id || "");
  const text = `${question} ${symbol} ${row.description || ""} ${row.subTitle || ""} ${row.competitionName || ""}`;
  if (!/\b(weather|temperature|high temp|high temperature|low temp|low temperature|kxhigh|kxlow)\b/i.test(text)) return null;
  if (/\b(space weather|geomagnetic|solar radiation|radio blackout|hurricane|named storm)\b/i.test(text)) return null;
  const city = weatherCityFromText(text);
  const date = fanduelWeatherDate(row);
  const band = weatherBandFromLabel(row.groupItemTitle || row.outcomeName || row.runnerName || row.yesLabel || question || text) || weatherBandFromTicker(symbol);
  const yesPrice = firstFiniteNumber(row.yesPrice, row.yesAsk, row.lastPrice, row.price, row.probability, row.markPrice);
  const bestBid = firstFiniteNumber(row.bestBid, row.bid, row.bidPrice, row.yesBid);
  const bestAsk = firstFiniteNumber(row.bestAsk, row.ask, row.askPrice, row.yesAsk);
  return {
    id: String(row.id || row.marketId || row.selectionId || row.contractId || symbol || ""),
    symbol,
    ticker: String(row.ticker || ""),
    question,
    city,
    date,
    band,
    yesPrice: normalizeProbability(yesPrice),
    bestBid: normalizeProbability(bestBid),
    bestAsk: normalizeProbability(bestAsk),
    raw: row
  };
}

function normalizeDraftKingsWeatherMarket(row = {}) {
  const question = String(row.question || row.title || row.name || row.marketName || row.eventName || row.instrumentName || row.label || row.outcomeName || "");
  const symbol = String(row.symbol || row.ticker || row.marketId || row.selectionId || row.contractId || row.id || "");
  const text = `${question} ${symbol} ${row.description || ""} ${row.subTitle || ""} ${row.categoryName || ""}`;
  if (!/\b(weather|temperature|high temp|high temperature|low temp|low temperature|kxhigh|kxlow)\b/i.test(text)) return null;
  if (/\b(space weather|geomagnetic|solar radiation|radio blackout|hurricane|named storm)\b/i.test(text)) return null;
  const city = weatherCityFromText(text);
  const date = draftKingsWeatherDate(row);
  const band = weatherBandFromLabel(row.groupItemTitle || row.outcomeName || row.label || row.yesLabel || question || text) || weatherBandFromTicker(symbol);
  const yesPrice = firstFiniteNumber(row.yesPrice, row.yesAsk, row.lastPrice, row.price, row.probability, row.markPrice);
  const bestBid = firstFiniteNumber(row.bestBid, row.bid, row.bidPrice, row.yesBid);
  const bestAsk = firstFiniteNumber(row.bestAsk, row.ask, row.askPrice, row.yesAsk);
  return {
    id: String(row.id || row.marketId || row.selectionId || row.contractId || symbol || ""),
    symbol,
    ticker: String(row.ticker || ""),
    question,
    city,
    date,
    band,
    yesPrice: normalizeProbability(yesPrice),
    bestBid: normalizeProbability(bestBid),
    bestAsk: normalizeProbability(bestAsk),
    raw: row
  };
}

function normalizePolymarketUsWeatherMarket(market = {}, event = {}) {
  if (market.active === false || market.closed === true || market.archived === true) return null;
  const question = String(market.question || event.title || market.title || "");
  const slug = String(market.slug || "");
  const text = `${event.title || ""} ${question} ${market.description || ""} ${slug}`;
  if (!/\b(weather|temperature|temp|highest temperature|climatological|nws|kxhigh)\b/i.test(text)) return null;
  if (/\b(space weather|geomagnetic|solar radiation|radio blackout|hurricane|named storm)\b/i.test(text)) return null;
  const yesSide = (market.marketSides || []).find((side) => side.long === true || /^yes$/i.test(String(side.description || ""))) || {};
  const city = weatherCityFromText(text);
  const date = polymarketUsWeatherDate(market, event);
  const band = weatherBandFromPolymarketUsSlug(slug) || weatherBandFromLabel(market.description || question || text);
  const yesPrice = firstFiniteNumber(yesSide.price, yesSide.lastPrice, market.lastTradePrice);
  const bestAsk = firstFiniteNumber(yesSide.quote?.value, yesSide.bestAsk, yesSide.ask, yesSide.price);
  const bestBid = firstFiniteNumber(yesSide.bestBid, yesSide.bid, yesSide.price);
  return {
    id: String(market.id || slug || ""),
    slug,
    symbol: slug,
    question,
    city,
    date,
    band,
    yesPrice: normalizeProbability(yesPrice),
    bestBid: normalizeProbability(bestBid),
    bestAsk: normalizeProbability(bestAsk),
    raw: market
  };
}

function draftKingsWeatherDate(row = {}) {
  const source = row.endDateIso || row.endTime || row.expireTime || row.expirationTime || row.settlementTime || row.marketTime || row.startDate || row.date || "";
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? easternDate(new Date(parsed)) : "";
}

function fanduelWeatherDate(row = {}) {
  const source = row.endDateIso || row.endTime || row.expireTime || row.expirationTime || row.settlementTime || row.marketTime || row.date || "";
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? easternDate(new Date(parsed)) : "";
}

function webullWeatherDate(row = {}) {
  const direct = String(row.date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const symbolDate = dateFromKalshiLikeSymbol(row.symbol || row.ticker || row.eventSymbol || row.event_symbol || "");
  if (symbolDate) return symbolDate;
  const source = row.endDateIso || row.endTime || row.expireTime || row.expirationTime || row.settlementTime || row.date || "";
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? easternDate(new Date(parsed)) : "";
}

function dateFromKalshiLikeSymbol(text = "") {
  const match = String(text || "").toUpperCase().match(/-(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{1,2})(?:-|$)/);
  if (!match) return "";
  const months = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12
  };
  const year = 2000 + Number(match[1]);
  const month = months[match[2]];
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !month || !Number.isFinite(day)) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeProbability(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number > 1 ? number / 100 : number;
}

function normalizePolymarketWeatherMarket(market = {}, event = {}) {
  if (market.active === false || market.closed === true || market.acceptingOrders === false) return null;
  const text = `${event.title || ""} ${market.question || ""} ${market.groupItemTitle || ""} ${market.description || ""}`;
  if (!/\b(weather|temperature|high temp|high temperature|low temp|low temperature)\b/i.test(text)) return null;
  if (/\b(space weather|geomagnetic|solar radiation|radio blackout|hurricane|named storm)\b/i.test(text)) return null;
  const city = weatherCityFromText(text);
  const date = polymarketWeatherDate(market, event);
  const band = weatherBandFromLabel(market.groupItemTitle || market.question || text);
  const outcomes = parseJsonishArray(market.outcomes);
  const prices = parseJsonishArray(market.outcomePrices).map(Number);
  const yesIndex = outcomes.findIndex((outcome) => /^yes$/i.test(String(outcome || "")));
  const yesPrice = prices[yesIndex >= 0 ? yesIndex : 0];
  return {
    id: String(market.id || ""),
    slug: market.slug || event.slug || "",
    question: market.question || event.title || "",
    city,
    date,
    band,
    yesPrice: Number.isFinite(yesPrice) ? yesPrice : null,
    bestBid: Number.isFinite(Number(market.bestBid)) ? Number(market.bestBid) : null,
    bestAsk: Number.isFinite(Number(market.bestAsk)) ? Number(market.bestAsk) : null,
    raw: market
  };
}

function polymarketWeatherDate(market = {}, event = {}) {
  const source = market.endDateIso || event.endDateIso || market.endDate || event.endDate || "";
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? easternDate(new Date(parsed)) : "";
}

function polymarketUsWeatherDate(market = {}, event = {}) {
  const slugDate = String(market.slug || event.slug || "").match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (slugDate) return `${slugDate[1]}-${slugDate[2]}-${slugDate[3]}`;
  const source = market.gameStartTime || event.startTime || event.startDate || market.startDate || market.endDate || event.endDate || "";
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? easternDate(new Date(parsed)) : "";
}

function weatherCityFromText(text = "") {
  const value = String(text || "");
  const cities = [
    ["New York", /\b(new york|nyc|kxhighny)\b/i],
    ["Chicago", /\b(chicago|kxhighchi)\b/i],
    ["Miami", /\b(miami|kxhighmia)\b/i],
    ["Los Angeles", /\b(los angeles|la\b|lax|kxhighlax)\b/i],
    ["Denver", /\b(denver|kxhighden)\b/i],
    ["Austin", /\b(austin|kxhighaus)\b/i],
    ["Philadelphia", /\b(philadelphia|philly|kxhighphil)\b/i],
    ["Boston", /\b(boston|kxhighbos)\b/i],
    ["Seattle", /\b(seattle|kxhighsea)\b/i],
    ["San Francisco", /\b(san francisco|sf\b|kxhighsf)\b/i],
    ["Houston", /\b(houston|kxhighhou)\b/i],
    ["Dallas", /\b(dallas|kxhighdal)\b/i],
    ["Atlanta", /\b(atlanta|kxhighatl)\b/i],
    ["Washington DC", /\b(washington dc|washington,? d\.?c\.?|kxhighdc)\b/i],
    ["Las Vegas", /\b(las vegas|vegas|kxhighlas)\b/i],
    ["Phoenix", /\b(phoenix|kxhighphx)\b/i],
    ["Minneapolis", /\b(minneapolis|kxhighmin)\b/i]
  ];
  return cities.find(([_city, pattern]) => pattern.test(value))?.[0] || "";
}

function weatherBandFromTicker(ticker = "") {
  const match = String(ticker || "").toUpperCase().match(/-([BT])(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return null;
  if (match[1] === "T") return { type: "below", high: value - 1 };
  const low = Math.ceil(value);
  return { type: "range", low, high: low + 1 };
}

function weatherBandFromPolymarketUsSlug(slug = "") {
  const value = String(slug || "").toLowerCase();
  const below = value.match(/(?:^|-)lt(\d+)f(?:-|$)/);
  if (below) return { type: "below", high: Number(below[1]) - 1 };
  const above = value.match(/(?:^|-)gt(?:e)?(\d+)f(?:-|$)/) || value.match(/(?:^|-)gte(\d+)f(?:-|$)/);
  if (above && !/lt\d+f/.test(value)) return { type: "above", low: Number(above[1]) };
  const range = value.match(/(?:^|-)gte(\d+)lt(\d+)f(?:-|$)/);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    return { type: "range", low, high };
  }
  return null;
}

function weatherBandFromLabel(label = "") {
  const text = String(label || "").replace(/°/g, "").replace(/\s+/g, " ").trim();
  const range = text.match(/(\d{1,3})\s*(?:-|to|through)\s*(\d{1,3})/i);
  if (range) return { type: "range", low: Number(range[1]), high: Number(range[2]) };
  const below = text.match(/(\d{1,3})\s*(?:or\s*)?(?:below|lower|under|less)/i) || text.match(/(?:below|under|less than)\s*(\d{1,3})/i);
  if (below) return { type: "below", high: Number(below[1]) };
  const above = text.match(/(\d{1,3})\s*(?:or\s*)?(?:above|higher|over|more)/i) || text.match(/(?:above|over|more than)\s*(\d{1,3})/i);
  if (above) return { type: "above", low: Number(above[1]) };
  return null;
}

function sameWeatherCity(a = "", b = "") {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function sameWeatherBand(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "range") return Number(a.low) === Number(b.low) && Number(a.high) === Number(b.high);
  if (a.type === "below") return Number(a.high) === Number(b.high);
  if (a.type === "above") return Number(a.low) === Number(b.low);
  return false;
}

function formatWeatherBand(band) {
  if (!band) return "";
  if (band.type === "range") return `${band.low}-${band.high}`;
  if (band.type === "below") return `${band.high} or below`;
  if (band.type === "above") return `${band.low} or above`;
  return "";
}

function decimalProbabilityText(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}c` : "-";
}

function parseJsonishArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchAndScanBitcoinHourly(scan, baseUrl, label = "Bitcoin", marketLimit = BTC_INTERLEAVE_MARKET_LIMIT, options = {}) {
  publishProgress({ phase: "markets", message: "Fetching current BTC hourly" });
  if (!options.quiet) logAudit("info", "Fetching current BTC hourly event.");
  const url = new URL(`${baseUrl}/events`);
  url.searchParams.set("status", "open");
  url.searchParams.set("with_nested_markets", "true");
  url.searchParams.set("series_ticker", "KXBTCD");
  url.searchParams.set("limit", "200");
  try {
    const data = await fetchWithRetry(url.toString(), {
      signal: scan.abortController.signal,
      endpointLabel: "/events KXBTCD hourly"
    });
    const markets = (data.events || []).flatMap((event) => {
      return (event.markets || [])
        .map((market) => normalizeMarket(market, event))
        .filter((market) => isBitcoinHourlyEntryWindowMarket(market))
        .filter(isCryptoMarket)
        .filter((market) => isBitcoinHourlyContract(`${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase(), market))
        .filter(bitcoinAboveContract)
        .filter(validBitcoinHourlyStrike);
    });
    if (!markets.length) {
      const rawEvents = data.events || [];
      const nestedCount = rawEvents.reduce((sum, event) => sum + ((event.markets || []).length), 0);
      const reason = nestedCount
        ? "No BTC hourly markets are inside the live entry window after filtering."
        : "Kalshi returned no nested BTC hourly markets.";
      recordBtcStatusScan([], reason);
      if (!options.quiet) logAudit("info", `BTC hourly selector found no current tradable markets (${rawEvents.length} events, ${nestedCount} nested markets before filters).`);
      return;
    }
    latestSnapshot.btcReferencePrice = null;
    const selected = selectCurrentBitcoinHourlyMarkets(markets, marketLimit);
    scan.counters.marketsDiscovered += selected.length;
    latestSnapshot.counters = scan.counters;
    publish("counters", scan.counters);
    if (!selected.length) {
      if (!options.quiet) logAudit("info", "BTC hourly selector found no current near-the-money contracts.");
      return;
    }
    const anchor = inferBitcoinCurrentStrike(selected);
    if (!options.quiet) {
      const tickers = selected.map((market) => `${formatStrikeLabel(bitcoinStrike(market))}:${market.ticker}`).join(", ");
      const source = `using ${liveConfig.configured ? "authenticated " : ""}Kalshi API market snapshots`;
      logAudit("info", `Scanning ${selected.length} ${label} near-the-money BTC hourly contracts${Number.isFinite(anchor) ? ` around $${anchor.toLocaleString()}` : ""} ${source}: ${tickers}`);
    }
    const recordingMarkets = [];
    for (const market of selected) {
      const orderbook = await fetchAuthOrderbook(market.ticker).catch(() => null);
      recordingMarkets.push(orderbook ? enrichMarketWithBook(market, orderbook) : market);
    }
    await persistBitcoinHourlySample(recordingMarkets);
    await scanMarkets(scan, baseUrl, selected, 0);
    await scanBitcoinCrossStrikeArb(scan, markets).catch((error) => {
      logAudit("warn", `BTC cross-strike arb scan skipped: ${error.message}`);
    });
  } catch (error) {
    if (scan.stopRequested || scan.abortController.signal.aborted || error.name === "AbortError") {
      logAudit("info", "BTC hourly selector stopped by user.");
      return;
    }
    scan.counters.apiFailures += 1;
    logApiFailure("/events KXBTCD hourly", error, error.retryCount || 0, "continued without BTC hourly scan");
  }
}

async function scanBitcoinStartupFirst(scan, baseUrl) {
  logAudit("info", "Startup priority: Bitcoin first.");
  for (let attempt = 1; attempt <= BTC_STARTUP_BOOTSTRAP_ATTEMPTS; attempt += 1) {
    if (scan.stopRequested || scan.abortController.signal.aborted) break;
    await scanBitcoinLane(scan, baseUrl, `startup Bitcoin ${attempt}`, BTC_INTERLEAVE_MARKET_LIMIT);
    if (hasActiveBitcoinTrade()) {
      logAudit("info", "Startup Bitcoin pass found an already tracked BTC position.");
      return;
    }
    if (attempt < BTC_STARTUP_BOOTSTRAP_ATTEMPTS) {
      await sleep(BTC_STARTUP_BOOTSTRAP_GAP_MS, scan.abortController.signal).catch(() => {});
    }
  }
  logAudit("info", "Startup Bitcoin pass finished; recording current BTC hourly rows.");
}

function requestImmediateBitcoinScan(reason = "Bitcoin recheck") {
  if (!activeScan?.running || !latestSnapshot.baseUrl || bitcoinImmediateScanInProgress) return;
  const scan = activeScan;
  bitcoinImmediateScanInProgress = true;
  setTimeout(async () => {
    try {
      if (!scan.running || scan.stopRequested || scan.abortController.signal.aborted) return;
      await scanBitcoinLane(scan, latestSnapshot.baseUrl, reason, BTC_INTERLEAVE_MARKET_LIMIT);
    } catch (error) {
      logAudit("warn", `${reason} skipped: ${error.message}`);
    } finally {
      bitcoinImmediateScanInProgress = false;
    }
  }, 0);
}

async function scanTennisLane(scan, baseUrl, label = "tennis", marketLimit = TENNIS_INTERLEAVE_MARKET_LIMIT) {
  if (scan.stopRequested || scan.abortController.signal.aborted) return;
  await fetchAndScanTargetSeries(scan, baseUrl, TENNIS_SERIES, label, marketLimit, { winnerOnly: true });
  scan.lastTennisInterleaveAt = Date.now();
}

async function fetchAndScanTargetSeries(scan, baseUrl, seriesList = PRIORITY_SERIES, label = "target", marketLimit = 80, options = {}) {
  const allLiveMarkets = [];
  for (const seriesTicker of seriesList) {
    if (scan.stopRequested || scan.abortController.signal.aborted) break;
    let cursor = "";
    let page = 1;
    do {
      publishProgress({ phase: "markets", message: `Fetching ${seriesTicker} page ${page}` });
      if (!options.quiet) logAudit("info", `Fetching ${seriesTicker} page ${page}`);
      const url = new URL(`${baseUrl}/events`);
      url.searchParams.set("status", "open");
      url.searchParams.set("with_nested_markets", "true");
      url.searchParams.set("series_ticker", seriesTicker);
      url.searchParams.set("limit", "200");
      if (cursor) url.searchParams.set("cursor", cursor);
      try {
        const data = await fetchWithRetry(url.toString(), {
          signal: scan.abortController.signal,
          endpointLabel: `/events ${seriesTicker}`
        });
        const events = data.events || [];
        const seriesMarkets = events.flatMap((event) => {
          const normalized = (event.markets || []).map((market) => normalizeMarket(market, event));
          const active = normalized.filter(isActiveWindowMarket);
          if (isBitcoinSeries(seriesTicker)) return filterBitcoinActionZone(active.filter(isCryptoMarket));
          if (options.cryptoOnly) return active.filter(isCryptoMarket);
          if (isSoccerSeries(seriesTicker)) return active.filter(isSoccerWinnerMarket);
          if (options.winnerOnly) return active.filter(isGameWinnerMarket);
          return isBitcoinSeries(seriesTicker) ? filterBitcoinActionZone(active) : active;
        });
        const rawMarkets = events.reduce((sum, event) => sum + (event.markets?.length || 0), 0);
        const pageMarkets = seriesMarkets.sort((a, b) => liveMarketScore(b) - liveMarketScore(a));
        const skipped = rawMarkets - pageMarkets.length;
        scan.counters.marketsDiscovered += pageMarkets.length;
        latestSnapshot.counters = scan.counters;
        publish("counters", scan.counters);
        if (!options.quiet) logAudit("info", `${seriesTicker}: found ${pageMarkets.length.toLocaleString()} markets deciding within 24h on page ${page}.`);
        if (skipped && !options.quiet) logAudit("info", `${seriesTicker}: skipped ${skipped.toLocaleString()} markets outside the 24h/action-zone window.`);
        allLiveMarkets.push(...pageMarkets);
        cursor = data.cursor || "";
        if (!cursor || events.length === 0 || page >= TARGET_SERIES_EVENT_PAGES_PER_PASS) break;
        page += 1;
        await sleep(1000, scan.abortController.signal).catch(() => {});
      } catch (error) {
        if (scan.stopRequested || scan.abortController.signal.aborted || error.name === "AbortError") {
          logAudit("info", `${seriesTicker} pagination stopped by user.`);
          break;
        }
        scan.counters.apiFailures += 1;
        logApiFailure(`/events ${seriesTicker}`, error, error.retryCount || 0, "continued to next target series");
        break;
      }
    } while (!scan.stopRequested && !scan.abortController.signal.aborted);
    if (!options.noSeriesDelay) await sleep(1200, scan.abortController.signal).catch(() => {});
  }
  const sortedLiveMarkets = allLiveMarkets.sort((a, b) => liveMarketScore(b) - liveMarketScore(a)).slice(0, marketLimit);
  if (sortedLiveMarkets.length && !scan.stopRequested && !scan.abortController.signal.aborted) {
    if (!options.quiet) logAudit("info", `Scanning ${sortedLiveMarkets.length.toLocaleString()} ${label} live/action-zone markets.`);
    await scanMarkets(scan, baseUrl, sortedLiveMarkets, 0);
  }
}

async function fetchAndScanLiveMilestoneEvents(scan, baseUrl, eventLimit = LIVE_MILESTONE_EVENT_LIMIT) {
  if (scan.settings.enableOtherMarkets !== true && scan.settings.enableSportsArb !== true) return;
  const eventTickers = await getLiveMilestoneEventTickers(baseUrl).catch((error) => {
    logAudit("warn", `Live MLB milestone lane unavailable: ${error.message}`);
    return [];
  });
  if (!eventTickers.length || scan.stopRequested || scan.abortController.signal.aborted) {
    if (!eventTickers.length) logAudit("info", "No currently-live MLB milestone events available after live-status filters.");
    return;
  }
  const selected = eventTickers.slice(0, eventLimit);
  logAudit("info", `Live MLB arb lane scanning ${selected.length} currently-live milestone events first.`);
  let scannedEvents = 0;
  let activeWinnerMarkets = 0;
  for (const eventTicker of selected) {
    if (scan.stopRequested || scan.abortController.signal.aborted) break;
    const milestoneMeta = cachedLiveMilestoneEvents.detailsByTicker?.[eventTicker] || null;
    try {
      const data = await fetchWithRetry(`${baseUrl}/events/${encodeURIComponent(eventTicker)}`, {
        signal: scan.abortController.signal,
        endpointLabel: `/events/${eventTicker}`,
        maxRetries: 0,
        paced: true
      });
      const event = data.event || {};
      const eventMarkets = (data.markets || [])
        .map((market) => normalizeMarket(market, event))
        .map((market) => ({
          ...market,
          liveMilestoneConfirmed: true,
          liveMilestoneEventTicker: eventTicker,
          liveMilestoneDetails: milestoneMeta?.details || null,
          liveMilestoneStatus: milestoneMeta?.status || "",
          liveMilestoneTitle: milestoneMeta?.title || "",
          liveMilestoneType: milestoneMeta?.type || "",
          liveMilestoneStartDate: milestoneMeta?.start_date || ""
        }))
        .filter((market) => isLiveSeriesFallbackMarket(market, Date.now()));
      const uniqueMarkets = dedupeMarkets(eventMarkets).sort((a, b) => liveMarketScore(b) - liveMarketScore(a)).slice(0, SECONDARY_MARKET_LIMIT);
      activeWinnerMarkets += uniqueMarkets.length;
      scan.counters.marketsDiscovered += uniqueMarkets.length;
      latestSnapshot.counters = scan.counters;
      publish("counters", scan.counters);
      if (uniqueMarkets.length) {
        await scanMarkets(scan, baseUrl, uniqueMarkets, scan.counters.marketsDiscovered - uniqueMarkets.length);
      }
      scannedEvents += 1;
    } catch (error) {
      scan.counters.apiFailures += 1;
      logApiFailure(`/events/${eventTicker}`, error, error.retryCount || 0, "continued live milestone scan");
    }
  }
  if (!activeWinnerMarkets && scannedEvents) {
    logAudit("info", `Live MLB milestone pass found ${scannedEvents} event(s), but 0 active winner contracts after market status/safety filters.`);
  }
}

async function fetchAndScanPotentialLiveMilestoneEvents(scan, baseUrl, eventLimit = POTENTIAL_LIVE_MILESTONE_EVENT_LIMIT) {
  if (scan.settings.enableSportsArb !== true || scan.stopRequested || scan.abortController.signal.aborted) return;
  const entries = await getPotentialLiveMilestoneEventEntries(baseUrl).catch((error) => {
    logAudit("warn", `Potential live MLB milestone lane unavailable: ${error.message}`);
    return [];
  });
  const selected = entries.slice(0, eventLimit);
  if (!selected.length) {
    logAudit("info", "Potential live MLB milestone pass found 0 candidates.");
    return;
  }
  logAudit("info", `Potential live MLB milestone pass checking ${selected.length} candidate event(s).`);
  let activeWinnerMarkets = 0;
  let scannedEvents = 0;
  for (const entry of selected) {
    if (scan.stopRequested || scan.abortController.signal.aborted) break;
    const eventTicker = entry.ticker;
    if (!eventTicker) continue;
    try {
      const data = await fetchWithRetry(`${baseUrl}/events/${encodeURIComponent(eventTicker)}`, {
        signal: scan.abortController.signal,
        endpointLabel: `/events/${eventTicker} potential live`,
        maxRetries: 0,
        paced: true
      });
      const event = data.event || {};
      const eventMarkets = (data.markets || [])
        .map((market) => normalizeMarket(market, event))
        .map((market) => ({
          ...market,
          liveFallbackConfirmed: true,
          liveMilestoneEventTicker: eventTicker,
          liveMilestoneDetails: entry.details || null,
          liveMilestoneStatus: entry.status || "",
          liveMilestoneTitle: entry.title || event.title || "",
          liveMilestoneType: entry.type || "",
          liveMilestoneStartDate: entry.start_date || market.occurrence_datetime || event.start_date || ""
        }))
        .filter((market) => isLiveSeriesFallbackMarket(market, Date.now()));
      const uniqueMarkets = dedupeMarkets(eventMarkets).sort((a, b) => liveMarketScore(b) - liveMarketScore(a)).slice(0, SECONDARY_MARKET_LIMIT);
      activeWinnerMarkets += uniqueMarkets.length;
      scan.counters.marketsDiscovered += uniqueMarkets.length;
      latestSnapshot.counters = scan.counters;
      publish("counters", scan.counters);
      if (uniqueMarkets.length) {
        await scanMarkets(scan, baseUrl, uniqueMarkets, Math.max(0, scan.counters.marketsDiscovered - uniqueMarkets.length));
      }
      scannedEvents += 1;
    } catch (error) {
      scan.counters.apiFailures += 1;
      logApiFailure(`/events/${eventTicker} potential live`, error, error.retryCount || 0, "continued potential live milestone scan");
    }
  }
  if (!activeWinnerMarkets && scannedEvents) {
    logAudit("info", `Potential live sports milestone pass checked ${scannedEvents} event(s), but 0 active winner contracts passed live/recent filters.`);
  }
}

async function fetchAndScanEvents(scan, baseUrl, marketLimit = SECONDARY_MARKET_LIMIT) {
  let cursor = scan.calendarCursor || "";
  let page = scan.calendarPage || 1;
  let pagesFetched = 0;
  while (!scan.stopRequested && !scan.abortController.signal.aborted && pagesFetched < CALENDAR_EVENT_PAGES_PER_PASS) {
    publishProgress({ phase: "markets", message: `Fetching non-combo events page ${page}` });
    logAudit("info", `Fetching non-combo events page ${page}`);
    const url = new URL(`${baseUrl}/events`);
    url.searchParams.set("status", "open");
    url.searchParams.set("with_nested_markets", "true");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    try {
      const data = await fetchWithRetry(url.toString(), {
        signal: scan.abortController.signal,
        endpointLabel: "/events"
      });
      const events = data.events || [];
      const nextCursor = data.cursor || "";
      pagesFetched += 1;
      scan.calendarCursor = nextCursor;
      scan.calendarPage = nextCursor ? page + 1 : 1;
      const inScopeEvents = events.filter(isAllowedEvent);
      const skippedEvents = events.length - inScopeEvents.length;
      const pageMarkets = inScopeEvents.flatMap((event) => {
        const normalized = (event.markets || [])
          .map((market) => normalizeMarket(market, event))
          .filter((market) => isActiveWindowMarket(market) && isAllowedMarket(market));
        if (isBitcoinEvent(event)) return filterBitcoinActionZone(normalized);
        if (allowedCalendarBucket(event) === "soccer") return normalized.filter(isSoccerWinnerMarket);
        return normalized;
      }).sort((a, b) => calendarMarketScore(a) - calendarMarketScore(b)).slice(0, marketLimit);
      const allScopeMarketsCount = inScopeEvents.reduce((sum, event) => sum + (event.markets?.length || 0), 0);
      const skippedLongWindow = allScopeMarketsCount - pageMarkets.length;
      scan.counters.marketsDiscovered += pageMarkets.length;
      latestSnapshot.counters = scan.counters;
      publish("counters", scan.counters);
      logAudit("info", `Found ${scan.counters.marketsDiscovered.toLocaleString()} in-scope live sports/Bitcoin/weather markets so far`);
      if (skippedEvents) {
        logAudit("info", `Skipped ${skippedEvents.toLocaleString()} non-sports/non-Bitcoin/weather events on page ${page} before detail scanning.`);
      }
      if (skippedLongWindow) {
        logAudit("info", `Skipped ${skippedLongWindow.toLocaleString()} long-window sports/BTC/weather markets on page ${page}.`);
      }
      if (pageMarkets.length) {
        logAudit("info", `Scoring ${pageMarkets.length.toLocaleString()} single-line markets from events page ${page}.`);
        await scanMarkets(scan, baseUrl, pageMarkets, scan.counters.marketsDiscovered - pageMarkets.length);
        break;
      }
      cursor = nextCursor;
      if (!cursor || events.length === 0) {
        scan.calendarCursor = "";
        scan.calendarPage = 1;
        break;
      }
      page += 1;
      await sleep(1000, scan.abortController.signal).catch(() => {});
    } catch (error) {
      if (scan.stopRequested || scan.abortController.signal.aborted || error.name === "AbortError") {
        logAudit("info", "Event pagination stopped by user.");
        break;
      }
      scan.counters.apiFailures += 1;
      logApiFailure("/events", error, error.retryCount || 0, "stopped event pagination");
      break;
    }
  }
  if (pagesFetched >= CALENDAR_EVENT_PAGES_PER_PASS && cursor) {
    logAudit("info", `Calendar lane paused after ${CALENDAR_EVENT_PAGES_PER_PASS} event pages; priority scans keep the API budget.`);
  }
}

function isActiveWindowMarket(market) {
  const decisionTs = decisionTimestamp(market);
  if (!Number.isFinite(decisionTs)) return false;
  const hours = (decisionTs - Date.now()) / 3_600_000;
  return hours >= MIN_TIME_LEFT_MINUTES / 60 && hours <= MAX_SPORTS_CLOSE_HOURS;
}

function isBitcoinHourlyEntryWindowMarket(market) {
  const decisionTs = decisionTimestamp(market);
  if (!Number.isFinite(decisionTs)) return false;
  const minutesLeft = (decisionTs - Date.now()) / 60_000;
  return minutesLeft > 0 && minutesLeft <= 70;
}

function activeSecondarySeriesGroups(now = new Date()) {
  const month = now.getMonth() + 1;
  const groups = [];
  if (month >= 3 && month <= 11) groups.push(SECONDARY_SERIES_GROUPS.find((group) => group.name === "baseball"));
  if (month >= 10 || month <= 6) groups.push(SECONDARY_SERIES_GROUPS.find((group) => group.name === "basketball"));
  if (month >= 10 || month <= 6) groups.push(SECONDARY_SERIES_GROUPS.find((group) => group.name === "hockey"));
  if (month >= 8 || month <= 2) groups.push(SECONDARY_SERIES_GROUPS.find((group) => group.name === "football"));
  groups.push(SECONDARY_SERIES_GROUPS.find((group) => group.name === "calendar-other"));
  return groups.filter(Boolean);
}

async function dynamicGameSeriesForPass(baseUrl) {
  const allSeries = await getDynamicGameSeries(baseUrl);
  if (!allSeries.length) return [];
  const offset = (secondaryScanIndex * DYNAMIC_GAME_SERIES_PER_PASS) % allSeries.length;
  const rotated = [...allSeries.slice(offset), ...allSeries.slice(0, offset)];
  const selected = rotated.slice(0, DYNAMIC_GAME_SERIES_PER_PASS);
  logAudit("info", `Dynamic sports lane checking ${selected.length} game-winner series: ${selected.join(", ")}.`);
  return selected;
}

async function getLiveMilestoneEventTickers(baseUrl) {
  const now = Date.now();
  if (cachedLiveMilestoneEvents.tickers.length && now - cachedLiveMilestoneEvents.fetchedAt < LIVE_MILESTONE_CACHE_MS) {
    return cachedLiveMilestoneEvents.tickers;
  }
  const url = new URL(`${baseUrl}/milestones`);
  url.searchParams.set("limit", "500");
  url.searchParams.set("category", "Sports");
  url.searchParams.set("minimum_start_date", new Date(now - 8 * 3_600_000).toISOString());
  const data = await fetchWithRetry(url.toString(), { endpointLabel: "/milestones live sports", maxRetries: 1 });
  const tickers = [];
  const detailsByTicker = {};
  for (const milestone of data.milestones || []) {
    if (!isLiveSportsMilestone(milestone, now)) continue;
    if (!isMlbMilestone(milestone)) continue;
    const meta = {
      details: milestone.details || {},
      status: String(milestone.details?.status || milestone.details?.widget_status || ""),
      title: milestone.title || "",
      type: milestone.type || "",
      start_date: milestone.start_date || "",
      notification_message: milestone.notification_message || "",
      source_ids: milestone.source_ids || {}
    };
    for (const ticker of [...(milestone.primary_event_tickers || []), ...(milestone.related_event_tickers || [])]) {
      if (isLikelyMlbGameEventTicker(ticker)) {
        tickers.push(ticker);
        detailsByTicker[ticker] = meta;
      }
    }
  }
  cachedLiveMilestoneEvents = { fetchedAt: now, tickers: [...new Set(tickers)], detailsByTicker };
  logAudit("info", `Found ${cachedLiveMilestoneEvents.tickers.length} currently-live sports game events from Kalshi milestones.`);
  return cachedLiveMilestoneEvents.tickers;
}

async function getPotentialLiveMilestoneEventEntries(baseUrl) {
  const now = Date.now();
  const url = new URL(`${baseUrl}/milestones`);
  url.searchParams.set("limit", "500");
  url.searchParams.set("category", "Sports");
  url.searchParams.set("minimum_start_date", new Date(now - 8 * 3_600_000).toISOString());
  const data = await fetchWithRetry(url.toString(), { endpointLabel: "/milestones potential live sports", maxRetries: 1 });
  const entries = [];
  const seen = new Set();
  for (const milestone of data.milestones || []) {
    if (!isPotentialLiveSportsMilestone(milestone, now)) continue;
    if (!isMlbMilestone(milestone)) continue;
    const meta = {
      details: milestone.details || {},
      status: String(milestone.details?.status || milestone.details?.widget_status || ""),
      title: milestone.title || "",
      type: milestone.type || "",
      start_date: milestone.start_date || ""
    };
    for (const ticker of [...(milestone.primary_event_tickers || []), ...(milestone.related_event_tickers || [])]) {
      if (!isLikelyMlbGameEventTicker(ticker)) continue;
      const key = String(ticker).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ ticker, ...meta });
    }
  }
  return entries;
}

function isPotentialLiveSportsMilestone(milestone, now = Date.now()) {
  if (String(milestone.category || "").toLowerCase() !== "sports") return false;
  const type = String(milestone.type || "").toLowerCase();
  if (!type.includes("baseball")) return false;
  const start = Date.parse(milestone.start_date || "");
  if (!Number.isFinite(start) || start > now + 10 * 60_000) return false;
  const maxAgeHours = type.includes("baseball") ? LIVE_SERIES_FALLBACK_MAX_EVENT_AGE_HOURS : 3;
  if (now - start > maxAgeHours * 3_600_000) return false;
  const status = String(milestone.details?.status || milestone.details?.widget_status || "").toLowerCase();
  if (/\b(closed|finished|final|full-time|full time|ft|complete|ended|cancelled|canceled|postponed|not_started|co)\b/.test(status)) return false;
  return true;
}

function isMlbMilestone(milestone) {
  const type = String(milestone?.type || "").toLowerCase();
  const title = String(milestone?.title || "");
  const tickers = [
    ...(milestone?.primary_event_tickers || []),
    ...(milestone?.related_event_tickers || [])
  ].join(" ");
  return type.includes("baseball") && /\bKXMLB/i.test(`${tickers} ${title}`);
}

function isLiveSportsMilestone(milestone, now = Date.now()) {
  if (String(milestone.category || "").toLowerCase() !== "sports") return false;
  const start = Date.parse(milestone.start_date || "");
  if (!Number.isFinite(start) || start > now + 10 * 60_000) return false;
  const status = String(milestone.details?.status || milestone.details?.widget_status || "").toLowerCase();
  if (/\b(closed|finished|final|full-time|full time|ft|complete|ended|cancelled|canceled|postponed|not_started)\b/.test(status)) return false;
  const type = String(milestone.type || "").toLowerCase();
  if (type.includes("tennis")) {
    return /\b(live|in_progress|in progress)\b/.test(status);
  }
  if (/\b(live|in_progress|in progress|halftime|half-time|period|quarter|inning|paused|p)\b/.test(status)) return true;
  const estimatedHours = type.includes("baseball") ? 4.5 : type.includes("cricket") ? 5 : type.includes("tennis") ? 3 : 2.75;
  return now - start <= estimatedHours * 3_600_000;
}

function isLikelyGameEventTicker(ticker) {
  const text = String(ticker || "").toUpperCase();
  if (!text || /(SPREAD|TOTAL|FOUR|SIX|TEAMTOTAL|PROP|PARLAY|1H|2H|1Q|2Q|3Q|4Q|SETWINNER|EXACTMATCH|GS?TOTAL|GSPREAD)/.test(text)) return false;
  return /(GAME|MATCH|ATP-|WTA-|ITF)/.test(text);
}

function isLikelyMlbGameEventTicker(ticker) {
  return /^KXMLBGAME/i.test(String(ticker || "")) && isLikelyGameEventTicker(ticker);
}

async function getDynamicGameSeries(baseUrl) {
  const now = Date.now();
  if (cachedDynamicGameSeries.series.length && now - cachedDynamicGameSeries.fetchedAt < DYNAMIC_SERIES_CACHE_MS) {
    return cachedDynamicGameSeries.series;
  }
  const sportsGameTerms = await getSportsGameFilterTerms(baseUrl).catch((error) => {
    logAudit("warn", `Sports filter map unavailable: ${error.message}. Falling back to series-name discovery.`);
    return [];
  });
  const url = new URL(`${baseUrl}/series`);
  const data = await fetchWithRetry(url.toString(), { endpointLabel: "/series sports game discovery", maxRetries: 1 });
  const series = (data.series || [])
    .filter((row) => isDynamicSportsGameSeries(row, sportsGameTerms))
    .map((row) => row.ticker || row.series_ticker)
    .filter(Boolean);
  const unique = [...new Set([...PRIORITY_SERIES, ...series])]
    .filter((ticker) => !isBitcoinSeries(ticker))
    .sort(dynamicSeriesSort);
  cachedDynamicGameSeries = { fetchedAt: now, series: unique };
  logAudit("info", `Discovered ${unique.length} sports game-winner series for rotating moneyline scans.`);
  return unique;
}

async function getSportsGameFilterTerms(baseUrl) {
  const now = Date.now();
  if (cachedSportsGameFilters.terms.length && now - cachedSportsGameFilters.fetchedAt < SPORTS_FILTER_CACHE_MS) {
    return cachedSportsGameFilters.terms;
  }
  const data = await fetchWithRetry(`${baseUrl}/search/filters_by_sport`, { endpointLabel: "/search/filters_by_sport", maxRetries: 1 });
  const filters = data.filters_by_sports || {};
  const excludedSports = new Set(["Golf", "Motorsport"]);
  const terms = [];
  for (const [sport, details] of Object.entries(filters)) {
    if (sport === "All sports" || excludedSports.has(sport)) continue;
    for (const [competition, config] of Object.entries(details.competitions || {})) {
      const scopes = (config.scopes || []).map((scope) => String(scope).toLowerCase());
      if (scopes.includes("games")) terms.push(String(competition).toLowerCase());
    }
  }
  cachedSportsGameFilters = { fetchedAt: now, terms: [...new Set(terms)].filter((term) => term.length >= 3) };
  logAudit("info", `Loaded ${cachedSportsGameFilters.terms.length} Kalshi sports competitions with Games scope.`);
  return cachedSportsGameFilters.terms;
}

async function weatherDailySeriesForScan(baseUrl, signal = null) {
  const configured = Array.isArray(SCAN_ASSETS.weather.series) ? SCAN_ASSETS.weather.series : [];
  if (configured.length) return configured;
  const officialCitySeries = WEATHER_BEACON_STATIONS
    .map((row) => String(row.series || "").toUpperCase())
    .filter(Boolean);
  const now = Date.now();
  if (cachedWeatherSeries.series.length && now - cachedWeatherSeries.fetchedAt < WEATHER_SERIES_CACHE_MS) {
    return cachedWeatherSeries.series;
  }
  const data = await fetchWithRetry(`${baseUrl}/series`, {
    signal,
    endpointLabel: "/series weather discovery",
    maxRetries: 1
  });
  const series = (data.series || [])
    .filter(isWeatherDailySeries)
    .map((row) => String(row.ticker || row.series_ticker || "").toUpperCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  cachedWeatherSeries = { fetchedAt: now, series: dedupeWeatherSeriesAliases([...officialCitySeries, ...series]) };
  logAudit("info", `Discovered ${cachedWeatherSeries.series.length} weather daily series for recording.`);
  return cachedWeatherSeries.series;
}

function dedupeWeatherSeriesAliases(series = []) {
  const unique = [...new Set(series)];
  const hasKxAlias = new Set(unique.filter((ticker) => ticker.startsWith("KX")).map((ticker) => ticker.slice(2)));
  return unique.filter((ticker) => ticker.startsWith("KX") || !hasKxAlias.has(ticker));
}

function isWeatherDailySeries(series = {}) {
  const category = String(series.category || "").toLowerCase();
  const ticker = String(series.ticker || series.series_ticker || "").toUpperCase();
  const title = String(series.title || "").toLowerCase();
  const text = `${ticker} ${title}`;
  if (!category.includes("weather") && !category.includes("climate") && !/^KX(HIGH|LOW|RAIN|SNOW|TEMP)/i.test(ticker)) return false;
  if (!/\b(temp|temperature|high|low|rain|snow|precip|weather)\b/i.test(text)) return false;
  return !/\b(hourly|minute|weekly|monthly|season|hurricane|named storm)\b/i.test(text);
}

function isDynamicSportsGameSeries(series, sportsGameTerms = []) {
  if (String(series.category || "").toLowerCase() !== "sports") return false;
  const ticker = String(series.ticker || series.series_ticker || "").toUpperCase();
  const title = String(series.title || "").toLowerCase();
  const text = `${ticker} ${title}`;
  if (!/\b(game|match)\b/.test(title)) return false;
  if (/\b(spread|total|prop|player|points|rebounds|assists|strikeouts|home runs?|shots|cards|corners|touchdown|quarter|half|1q|2q|3q|4q|1h|2h|same game parlay|pre pack|delete|test)\b/.test(text)) return false;
  if (/\b(golf|pga|nascar|f1|draft|champion|winner region|season|award|coach|transfer|join|leave|futures?)\b/.test(text)) return false;
  const matchedOfficialCompetition = sportsGameTerms.some((term) => title.includes(term));
  return matchedOfficialCompetition
    || /\b(soccer|basketball|baseball|football|hockey|tennis|cricket|rugby|afl|league|liga|serie|cup|mls|nwsl|nbl|bsl|kbl|lnb|ipl|uefa|ucla|champions league)\b/.test(text)
    || /^KX.*(GAME|MATCH)$/i.test(ticker);
}

function dynamicSeriesSort(a, b) {
  return dynamicSeriesPriority(a) - dynamicSeriesPriority(b) || a.localeCompare(b);
}

function dynamicSeriesPriority(ticker) {
  if (/MLB|BASEBALL/i.test(ticker)) return 0;
  if (/KX(BTC|BTCD)/i.test(ticker)) return 1;
  if (/KX(ITF|ATP|WTA)/i.test(ticker)) return 2;
  if (/SOCC|MLS|NWSL|UCL|UEL|LIGA|SERIE|BRASILEIRO|EREDIVISIE|SUPERCUP|NLGAME|CHNSLGAME|SWISSLEAGUE/i.test(ticker)) return 1;
  if (/NBA|WNBA|KBL|BSL|LNB|NBL|BASKET/i.test(ticker)) return 2;
  if (/MLB|NPB|KBO|BASEBALL/i.test(ticker)) return 3;
  return 4;
}

function isAllowedEvent(event) {
  return allowedCalendarBucket(event) != null;
}

function isAllowedMarket(market) {
  return allowedCalendarBucket(market) != null;
}

function allowedCalendarBucket(event) {
  const category = String(event.category || "").toLowerCase();
  const text = `${event.title || ""} ${event.sub_title || ""} ${event.event_ticker || ""} ${event.series_ticker || ""} ${JSON.stringify(event.product_metadata || {})}`.toLowerCase();
  if (isBlockedCalendarText(text)) return null;
  if (/\b(bitcoin|btc|kxbtc)\b/.test(text)) return "crypto";
  if (isWeatherEvent(event)) return "daily-temperature";
  if (category !== "sports") return null;
  if (/\b(tennis|atp|wta|itf|kxitf(?:w)?match|kxatp|kxwta)\b/.test(text)) return "tennis";
  if (/\b(soccer|mls|epl|premier league|uefa|fifa|la liga|bundesliga|serie a|brasileiro|liga mx|kxmlsgame|kxsocc\w*)\b/.test(text)) return "soccer";
  if (/\b(baseball|mlb|npb|kbo|yankees|red sox|dodgers|mets|cubs|giants|blue jays|mariners|padres|phillies|orioles|astros|braves|kxmlb\w*)\b/.test(text)) return "baseball";
  if (/\b(basketball|nba|wnba|ncaamb|ncaawb|kxnba\w*|kxwnba\w*|kxmarmad\w*|kxwmarmad\w*|kxncaamb\w*|kxncaawb\w*)\b/.test(text)) return "basketball";
  if (/\b(aussie rules|afl)\b/.test(text)) return "afl";
  if (/\b(cricket|ipl|test match|odi|t20)\b/.test(text)) return "cricket";
  if (/\b(football|nfl|ncaaf|college football|cfl)\b/.test(text) || /^kxnfl|^kxncaaf|^kxsb/.test(text)) return "football";
  if (/\b(hockey|nhl|stanley cup)\b/.test(text) || /^kxnhl|^kxstanley/.test(text)) return "hockey";
  if (/\b(rugby|nrl|super league|six nations)\b/.test(text)) return "rugby";
  if (/\b(lacrosse|college lacrosse)\b/.test(text)) return "college-lacrosse";
  return "sports-other";
}

function isBlockedCalendarText(text) {
  return /\b(golf|pga|liv golf|ryder cup|masters|top 5|top 10|top 20)\b/.test(text) || /\bkxpga/.test(text);
}

function calendarMarketScore(market) {
  const bucket = allowedCalendarBucket(market) || "sports-other";
  const bucketIndex = CALENDAR_BUCKET_ORDER.indexOf(bucket);
  return (bucketIndex < 0 ? 999 : bucketIndex) * 100000 - liveMarketScore(market);
}

function isBitcoinEvent(event) {
  const text = `${event.category || ""} ${event.title || ""} ${event.sub_title || ""} ${event.event_ticker || ""} ${event.series_ticker || ""}`.toLowerCase();
  return /\b(bitcoin|btc|kxbtc)\b/.test(text);
}

function isWeatherEvent(event) {
  if (!isWeatherScanWindow()) return false;
  const category = String(event.category || "").toLowerCase();
  if (!category.includes("weather") && !category.includes("climate")) return false;
  const text = `${event.title || ""} ${event.sub_title || ""} ${event.event_ticker || ""} ${event.series_ticker || ""}`.toLowerCase();
  return /\b(temp|temperature|daily temperature|high temperature|low temperature)\b/.test(text);
}

function isWeatherDailyMarket(market = {}) {
  const category = String(market.category || "").toLowerCase();
  const ticker = String(`${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`).toUpperCase();
  const text = `${market.title || ""} ${market.subtitle || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""} ${market.event_ticker || ""} ${market.series_ticker || ""}`.toLowerCase();
  if (!category.includes("weather") && !category.includes("climate") && !/\bKX(HIGH|LOW|RAIN|SNOW|TEMP)/i.test(ticker)) return false;
  if (/\b(hourly|minute|weekly|monthly|season|hurricane|named storm)\b/i.test(text)) return false;
  if (!/\b(temp|temperature|high|low|rain|snow|precip|weather)\b/i.test(text)) return false;
  return Number.isFinite(assetStrike(SCAN_ASSETS.weather, market));
}

function latestWeatherDailyEventGroup(markets = []) {
  const now = Date.now();
  const future = markets.filter((market) => {
    const close = Date.parse(decisionIso(market) || market.close_time || "");
    return Number.isFinite(close) && close > now;
  });
  const source = future.length ? future : markets;
  if (!source.length) return [];
  const eventTicker = source
    .slice()
    .sort((a, b) => Date.parse(decisionIso(a) || a.close_time || 0) - Date.parse(decisionIso(b) || b.close_time || 0))[0]?.event_ticker;
  return source.filter((market) => market.event_ticker === eventTicker);
}

function bestWeatherDailyStrike(markets = []) {
  return markets
    .filter((market) => validCents(market.yes_ask) || validCents(market.yes_bid))
    .sort((a, b) => spNearMoneyDistance(a) - spNearMoneyDistance(b))[0] || markets[0] || null;
}

function isWeatherScanWindow() {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false
  }).format(new Date()));
  return hour >= 8 && hour < 20;
}

function weatherBeaconIntervalMs() {
  return isWeatherScanWindow() ? WEATHER_BEACON_DAY_SCAN_INTERVAL_MS : WEATHER_BEACON_NIGHT_SCAN_INTERVAL_MS;
}

async function latestWeatherBeaconReadings({ force = false } = {}) {
  const now = Date.now();
  const intervalMs = weatherBeaconIntervalMs();
  const stillFresh = weatherBeaconCache.rows.length && now < weatherBeaconCache.nextRefreshAt;
  if (!force && stillFresh) {
    return weatherBeaconDashboardPayload();
  }
  const rows = await Promise.all(WEATHER_BEACON_STATIONS.map((station) => readWeatherBeacon(station)));
  weatherBeaconCache = {
    rows: rows.sort((a, b) => a.city.localeCompare(b.city)),
    fetchedAt: now,
    nextRefreshAt: now + intervalMs,
    intervalMs,
    lastError: rows.some((row) => row.status === "ok") ? "" : "No weather.gov station readings succeeded."
  };
  latestSnapshot.weatherBeaconReadings = weatherBeaconCache.rows;
  latestSnapshot.weatherBeaconFetchedAt = new Date(weatherBeaconCache.fetchedAt).toISOString();
  latestSnapshot.weatherBeaconNextRefreshAt = new Date(weatherBeaconCache.nextRefreshAt).toISOString();
  await persistOfficialWeatherBeaconReadings(weatherBeaconCache.rows).catch((error) => {
    logAudit("warn", `Official weather source recording failed: ${error.message}`);
  });
  return weatherBeaconDashboardPayload();
}

function weatherBeaconDashboardPayload() {
  return {
    rows: weatherBeaconCache.rows || [],
    fetchedAt: weatherBeaconCache.fetchedAt ? new Date(weatherBeaconCache.fetchedAt).toISOString() : null,
    nextRefreshAt: weatherBeaconCache.nextRefreshAt ? new Date(weatherBeaconCache.nextRefreshAt).toISOString() : null,
    intervalMs: weatherBeaconCache.intervalMs || weatherBeaconIntervalMs(),
    scanWindow: isWeatherScanWindow() ? "day" : "night",
    source: "weather.gov station observations",
    lastError: weatherBeaconCache.lastError || ""
  };
}

async function readWeatherBeacon(station) {
  const url = `https://api.weather.gov/stations/${encodeURIComponent(station.stationId)}/observations/latest`;
  const fetchedAt = new Date().toISOString();
  try {
    const data = await fetchWeatherGovJson(url, { timeoutMs: 9000 });
    const properties = data?.properties || {};
    const coords = Array.isArray(data?.geometry?.coordinates) ? data.geometry.coordinates : [];
    const temperatureC = numericObservationValue(properties.temperature);
    const heatIndexC = numericObservationValue(properties.heatIndex);
    const dewpointC = numericObservationValue(properties.dewpoint);
    return {
      ...station,
      status: "ok",
      sourceUrl: url,
      observedAt: properties.timestamp || null,
      fetchedAt,
      stationName: properties.station ? station.stationId : station.stationId,
      latitude: Number.isFinite(Number(coords[1])) ? Number(coords[1]) : null,
      longitude: Number.isFinite(Number(coords[0])) ? Number(coords[0]) : null,
      temperatureF: celsiusToFahrenheit(temperatureC),
      temperatureC,
      heatIndexF: celsiusToFahrenheit(heatIndexC),
      dewpointF: celsiusToFahrenheit(dewpointC),
      humidityPct: roundNullable(numericObservationValue(properties.relativeHumidity), 1),
      windMph: metersPerSecondToMph(numericObservationValue(properties.windSpeed)),
      windDirectionDeg: roundNullable(numericObservationValue(properties.windDirection), 0),
      description: properties.textDescription || "",
      rawMessage: properties.rawMessage || "",
      error: ""
    };
  } catch (error) {
    return {
      ...station,
      status: "error",
      sourceUrl: url,
      observedAt: null,
      fetchedAt,
      stationName: station.stationId,
      latitude: null,
      longitude: null,
      temperatureF: null,
      temperatureC: null,
      heatIndexF: null,
      dewpointF: null,
      humidityPct: null,
      windMph: null,
      windDirectionDeg: null,
      description: "",
      rawMessage: "",
      error: error.message || "weather.gov station read failed"
    };
  }
}

async function persistOfficialWeatherBeaconReadings(rows = []) {
  if (!rows.length) return;
  const recordDate = easternDate(new Date());
  await Promise.all(rows.map((row) => persistOfficialWeatherBeaconLine(row, recordDate)));
}

async function persistOfficialWeatherBeaconLine(row, recordDate) {
  const citySlug = fileSlug(row.city || row.stationId || "weather");
  const dir = path.join(RECORDS_DIR, SCAN_ASSETS.weather.recordingFolder, WEATHER_BEACON_RECORDING_FOLDER, citySlug, recordDate);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${citySlug}-official-weather-source-${recordDate}.txt`);
  const line = officialWeatherBeaconLine(row);
  if (!existsSync(file)) {
    const header = [
      `# OFFICIAL WEATHER SOURCE LOG - ${row.city || row.stationId || "Weather"} - ${recordDate}`,
      "# SOURCE: weather.gov station observations endpoint",
      "# ROW FORMAT: FETCHED TIMESTAMP - CITY - STATION - STATUS - OBSERVED TIMESTAMP - TEMP F - TEMP C - CONDITIONS - HUMIDITY - WIND MPH - WIND DIR - LAT/LON - CONFIDENCE - SOURCE URL - NOTE/ERROR",
      ""
    ].join("\n");
    await fs.writeFile(file, header, "utf8");
  }
  await fs.appendFile(file, `${line}\n`, "utf8");
}

function officialWeatherBeaconLine(row = {}) {
  const latLon = Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
    ? `${Number(row.latitude).toFixed(5)},${Number(row.longitude).toFixed(5)}`
    : "-";
  const details = row.status === "ok"
    ? (row.note || "-")
    : (row.error || "station read failed");
  return [
    row.fetchedAt || new Date().toISOString(),
    row.city || "-",
    row.stationId || "-",
    row.status || "unknown",
    row.observedAt || "-",
    formatWeatherNumber(row.temperatureF),
    formatWeatherNumber(row.temperatureC),
    row.description || "-",
    formatWeatherNumber(row.humidityPct),
    formatWeatherNumber(row.windMph),
    formatWeatherNumber(row.windDirectionDeg, 0),
    latLon,
    row.confidence || "candidate",
    row.sourceUrl || "-",
    details
  ].join(" - ");
}

function formatWeatherNumber(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
}

function fileSlug(value = "") {
  return String(value || "weather")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "weather";
}

async function fetchWeatherGovJson(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: WEATHER_GOV_HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`weather.gov ${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function numericObservationValue(reading) {
  if (!reading || reading.value == null || reading.value === "") return null;
  const value = Number(reading?.value);
  return Number.isFinite(value) ? value : null;
}

function celsiusToFahrenheit(value) {
  return value == null ? null : roundNullable((value * 9 / 5) + 32, 1);
}

function metersPerSecondToMph(value) {
  return value == null ? null : roundNullable(value * 2.2369362921, 1);
}

function roundNullable(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function isBitcoinSeries(seriesTicker) {
  return seriesTicker === "KXBTC" || seriesTicker === "KXBTCD";
}

function isSpFinanceSeries(seriesTicker) {
  return String(seriesTicker || "").toUpperCase() === SP_HOURLY_SERIES;
}

function isSpHourlyMarket(market) {
  const seriesText = `${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase();
  if (!isSpFinanceSeries(market.series_ticker) && !seriesText.includes(SP_HOURLY_SERIES)) return false;
  const text = `${market.event_ticker || ""} ${market.ticker || ""} ${market.title || ""}`.toUpperCase();
  return /H\d{4}(?:$|[^A-Z0-9])/.test(text) && /\bS&P\b|S\u0026P|S&P 500|S AND P/i.test(market.title || text);
}

function isSpHourlyWindowNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  if (["Sat", "Sun"].includes(weekday)) return false;
  return hour >= 10 && hour < 16;
}

function latestSpHourlyEventGroup(markets = []) {
  const now = Date.now();
  const active = markets.filter((market) => {
    const open = Date.parse(market.open_time || "");
    const close = Date.parse(decisionIso(market) || market.close_time || "");
    return Number.isFinite(close) && close > now && (!Number.isFinite(open) || open <= now + 60_000);
  });
  const source = active.length ? active : markets.filter((market) => {
    const close = Date.parse(decisionIso(market) || market.close_time || "");
    return Number.isFinite(close) && close > now;
  });
  if (!source.length) return [];
  const eventTicker = source
    .slice()
    .sort((a, b) => Date.parse(decisionIso(a) || a.close_time || 0) - Date.parse(decisionIso(b) || b.close_time || 0))[0]?.event_ticker;
  return source.filter((market) => market.event_ticker === eventTicker);
}

function bestSpHourlyStrike(markets = []) {
  return markets
    .filter((market) => validCents(market.yes_ask) || validCents(market.no_ask) || validCents(market.yes_bid) || validCents(market.no_bid))
    .sort((a, b) => spNearMoneyDistance(a) - spNearMoneyDistance(b))[0] || markets[0] || null;
}

function spNearMoneyDistance(market) {
  const prices = [market.yes_ask, market.yes_bid, market.no_ask, market.no_bid].filter(validCents);
  if (!prices.length) return 999;
  return Math.min(...prices.map((price) => Math.abs(price - 50)));
}

function spStrike(market = {}) {
  const tickerMatch = String(market.ticker || "").match(/-T(\d+(?:\.\d+)?)/i);
  if (tickerMatch) return Number(tickerMatch[1]);
  const text = `${market.subtitle || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""}`.replace(/,/g, "");
  const labelMatch = text.match(/(\d{3,5}(?:\.\d+)?)/);
  return labelMatch ? Number(labelMatch[1]) : NaN;
}

function formatSpStrikeLabel(market = {}) {
  const strike = spStrike(market);
  if (Number.isFinite(strike)) return `${Math.round(strike).toLocaleString()} or above`;
  return market.yes_sub_title || market.subtitle || market.ticker || "S&P strike";
}

function spMarketProbability(market = {}) {
  const yesAsk = Number(market.yes_ask);
  const yesBid = Number(market.yes_bid);
  if (validCents(yesAsk) && validCents(yesBid)) return (yesAsk + yesBid) / 2;
  if (validCents(yesAsk)) return yesAsk;
  if (validCents(yesBid)) return yesBid;
  const lastPrice = Number(market.last_price);
  if (validCents(lastPrice)) return lastPrice;
  return NaN;
}

function inferSpReferenceStrike(markets = []) {
  const candidate = markets
    .filter((market) => Number.isFinite(spStrike(market)) && Number.isFinite(spMarketProbability(market)))
    .sort((a, b) => Math.abs(spMarketProbability(a) - 50) - Math.abs(spMarketProbability(b) - 50))[0];
  return candidate ? spStrike(candidate) : null;
}

function spArbLegSummary(market = {}, side = "NO") {
  return {
    ticker: market.ticker || "",
    strike: spStrike(market),
    strikeLabel: formatSpStrikeLabel(market),
    yesAsk: validCents(Number(market.yes_ask)) ? Number(market.yes_ask) : null,
    yesBid: validCents(Number(market.yes_bid)) ? Number(market.yes_bid) : null,
    noAsk: validCents(Number(market.no_ask)) ? Number(market.no_ask) : null,
    noBid: validCents(Number(market.no_bid)) ? Number(market.no_bid) : null,
    side
  };
}

function spHourlyClosestNoAnchor(markets = []) {
  const sorted = markets
    .filter((market) => Number.isFinite(spStrike(market)))
    .sort((a, b) => spStrike(a) - spStrike(b));
  let best = null;
  for (let index = 1; index < sorted.length; index += 1) {
    const lower = sorted[index - 1];
    const upper = sorted[index];
    const anchorNoAsk = Number(upper.no_ask);
    const lowerYesAsk = Number(lower.yes_ask);
    const anchorDistance = validCents(anchorNoAsk) ? Math.abs(anchorNoAsk - 40) : 999;
    const combo = validCents(anchorNoAsk) && validCents(lowerYesAsk) ? anchorNoAsk + lowerYesAsk : null;
    const score = anchorDistance + (validCents(lowerYesAsk) ? Math.abs(lowerYesAsk - 40) * 0.25 : 200);
    const candidate = {
      anchor: spArbLegSummary(upper, "NO"),
      lower: spArbLegSummary(lower, "YES"),
      combinedNowCents: combo,
      anchorDistance,
      score
    };
    if (!best || candidate.score < best.score) best = candidate;
  }
  return best;
}

function spHourlyEventLabel(market = {}) {
  const decision = Date.parse(decisionIso(market) || market.close_time || "");
  const hour = Number.isFinite(decision) ? new Date(decision).toLocaleTimeString([], { hour: "numeric" }) : "";
  return hour ? `S&P hourly ${hour}` : "S&P hourly";
}

function isSoccerSeries(seriesTicker) {
  return /^KXMLSGAME$/i.test(seriesTicker || "") || /^KXSOCC/i.test(seriesTicker || "");
}

function isSoccerWinnerMarket(market) {
  const text = `${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""} ${market.title || ""} ${market.subtitle || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""}`.toLowerCase();
  if (/\b(tie|draw)\b/.test(`${market.ticker || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""}`.toLowerCase())) return false;
  if (/\b(champion|cup champion|conference champion|top \d+|transfer|join|leave|halftime show|futures?)\b/.test(text)) return false;
  return /\b(winner|win|moneyline| vs | v\. | versus)\b/.test(text) || /^kxmlsgame/i.test(market.series_ticker || market.ticker || "");
}

function isGameWinnerMarket(market) {
  if (isSoccerSeries(market.series_ticker)) return isSoccerWinnerMarket(market);
  const text = `${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""} ${market.title || ""} ${market.subtitle || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""}`.toLowerCase();
  if (/\b(spread|total|over\/under|over under|points|rebounds|assists|strikeouts|home runs?|shots|cards|corners|touchdown|quarter|half|1q|2q|3q|4q|1h|2h|same game parlay|parlay)\b/.test(text)) return false;
  if (/\b(tie|draw)\b/.test(`${market.ticker || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""}`.toLowerCase())) return false;
  return /\b(winner|win|moneyline| vs | v\. | versus)\b/.test(text) || /^KX.*(GAME|MATCH)/i.test(market.series_ticker || market.ticker || "");
}

function dedupeMarkets(markets) {
  const seen = new Set();
  const out = [];
  for (const market of markets) {
    if (!market?.ticker || seen.has(market.ticker)) continue;
    seen.add(market.ticker);
    out.push(market);
  }
  return out;
}

function liveMarketScore(market) {
  const decisionTs = decisionTimestamp(market);
  const now = Date.now();
  const hoursToDecision = Number.isFinite(decisionTs) ? (decisionTs - now) / 3_600_000 : 999;
  const liveWindow = hoursToDecision <= 1 && hoursToDecision >= -4 ? 1000 : 0;
  const soonWindow = hoursToDecision > 1 && hoursToDecision <= 6 ? 500 - hoursToDecision * 20 : 0;
  const recentAction = Math.log10((market.volume_24h || 0) + 1) * 35 + Math.log10((market.open_interest || 0) + 1) * 12;
  const spread = Math.min(
    Number.isFinite(market.yes_ask) && Number.isFinite(market.yes_bid) ? Math.max(0, market.yes_ask - market.yes_bid) : 20,
    Number.isFinite(market.no_ask) && Number.isFinite(market.no_bid) ? Math.max(0, market.no_ask - market.no_bid) : 20
  );
  const spreadPenalty = spread * 8;
  return liveWindow + soonWindow + recentAction - spreadPenalty;
}

function filterBitcoinActionZone(markets) {
  const hourly = markets
    .filter((market) => isBitcoinHourlyContract(`${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase(), market))
    .filter(bitcoinAboveContract)
    .filter((market) => validBitcoinStrike(market))
    .filter(hasBitcoinLiveSignal);
  if (!hourly.length) return [];

  const activeEvent = latestBitcoinEventGroup(hourly);
  const currentStrike = inferBitcoinCurrentStrike(activeEvent);
  if (!Number.isFinite(currentStrike)) {
    const tradable = activeEvent
      .filter(isBitcoinTradableBand)
      .sort((a, b) => bitcoinActionScore(b) - bitcoinActionScore(a));
    return (tradable.length ? tradable : activeEvent.sort((a, b) => bitcoinActionScore(b) - bitcoinActionScore(a))).slice(0, 5);
  }

  const nearStrike = activeEvent
    .filter((market) => Math.abs(bitcoinStrike(market) - currentStrike) <= 250)
    .sort((a, b) => bitcoinActionZoneRank(a, currentStrike) - bitcoinActionZoneRank(b, currentStrike));
  const tradableNearStrike = nearStrike.filter(isBitcoinTradableBand);
  return (tradableNearStrike.length ? tradableNearStrike : nearStrike).slice(0, 5);
}

function selectCurrentBitcoinHourlyMarkets(markets, limit = BTC_INTERLEAVE_MARKET_LIMIT) {
  const currentEvent = latestBitcoinEventGroupByTime(markets);
  if (!currentEvent.length) return [];
  const ladder = bitcoinCenteredStrikeLadder(currentEvent, Math.max(5, limit));
  if (ladder.length) return dedupeMarkets(ladder);
  const sorted = currentEvent
    .filter(validBitcoinStrike)
    .filter((market) => validCents(btcYesAskForSelection(market)))
    .sort((a, b) => {
      const aYesAsk = btcYesAskForSelection(a);
      const bYesAsk = btcYesAskForSelection(b);
      const priceDistance = Math.abs(aYesAsk - 50) - Math.abs(bYesAsk - 50);
      if (priceDistance !== 0) return priceDistance;
      return Math.abs(bitcoinMarketProbability(a) - 50) - Math.abs(bitcoinMarketProbability(b) - 50);
    });
  return dedupeMarkets(sorted.slice(0, Math.max(1, Math.min(3, limit))));
}

function bitcoinCenteredStrikeLadder(markets, count = 5) {
  const sorted = dedupeMarkets(markets)
    .filter(validBitcoinStrike)
    .filter((market) => isUsefulStrikeAsk(dollarsDecimal(market.yes_ask_dollars ?? market.yes_ask)) || isUsefulStrikeAsk(dollarsDecimal(market.no_ask_dollars ?? market.no_ask)))
    .sort((a, b) => bitcoinStrike(a) - bitcoinStrike(b));
  if (!sorted.length) return [];
  const anchor = inferBitcoinCurrentStrike(sorted);
  if (!Number.isFinite(anchor)) return sorted.slice(0, count);
  const targets = centeredStrikeTargets(anchor, BTC_HOURLY_STRIKE_STEP_DOLLARS, count);
  const byStrike = new Map(sorted.map((market) => [bitcoinStrike(market), market]));
  return targets.map((strike) => byStrike.get(strike)).filter(Boolean);
}

function nearestIndex(rows, scoreFn) {
  let bestIndex = -1;
  let bestScore = Infinity;
  rows.forEach((row, index) => {
    const score = Number(scoreFn(row));
    if (Number.isFinite(score) && score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function btcYesAskForSelection(market) {
  if (validCents(market.yes_ask)) return market.yes_ask;
  if (validCents(market.no_bid)) return 100 - market.no_bid;
  return null;
}

function btcDirectionalEntryCandidates(markets, bias) {
  if (!["buy", "sell"].includes(bias)) return [];
  return markets
    .filter(validBitcoinStrike)
    .filter((market) => {
      const entry = btcEntryForBias(market, bias);
      if (!validCents(entry)) return false;
      if (isBitcoinLateLockBand(market, entry)) return true;
      const minutesLeft = minutesToDecision(market);
      const maxEntry = Number.isFinite(minutesLeft) && minutesLeft <= BTC_TECHNICAL_HIGH_ENTRY_MINUTES_LEFT
        ? BTC_TECHNICAL_LATE_MAX_ENTRY_CENTS
        : BTC_TECHNICAL_EARLY_MAX_ENTRY_CENTS;
      return entry >= BTC_MIN_ENTRY_CENTS && entry <= maxEntry;
    });
}

function btcDirectionalCandidateRank(market, bias) {
  const entry = btcEntryForBias(market, bias);
  const targetEntry = isBitcoinLateLockBand(market, entry) ? 92 : 55;
  const entryPenalty = validCents(entry) ? Math.abs(entry - targetEntry) * 100 : 10_000;
  const spread = btcSpreadForBias(market, bias);
  const spreadPenalty = Number.isFinite(spread) ? spread * 25 : 500;
  const volumeBonus = Math.log10(Number(market.volume_24h || market.volume || 0) + 1) * 15;
  return entryPenalty + spreadPenalty - volumeBonus;
}

function btcEntryForBias(market, bias) {
  const yesAsk = validCents(market.yes_ask) ? market.yes_ask : (validCents(market.no_bid) ? 100 - market.no_bid : null);
  const noAsk = validCents(market.no_ask) ? market.no_ask : (validCents(market.yes_bid) ? 100 - market.yes_bid : null);
  if (bias === "buy") return yesAsk;
  if (bias === "sell") return noAsk;
  return null;
}

function btcSpreadForBias(market, bias) {
  if (bias === "buy" && validCents(market.yes_ask) && validCents(market.yes_bid)) return Math.max(0, market.yes_ask - market.yes_bid);
  if (bias === "sell" && validCents(market.no_ask) && validCents(market.no_bid)) return Math.max(0, market.no_ask - market.no_bid);
  return null;
}

function latestBitcoinEventGroupByTime(markets) {
  const groups = new Map();
  for (const market of markets) {
    const key = market.event_ticker || market.series_ticker || "BTC";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(market);
  }
  const now = Date.now();
  return [...groups.values()]
    .filter((group) => {
      const ts = Math.min(...group.map(decisionTimestamp).filter(Number.isFinite));
      const minutes = Number.isFinite(ts) ? (ts - now) / 60_000 : NaN;
      return Number.isFinite(minutes) && minutes > 0 && minutes <= 70;
    })
    .sort((a, b) => {
      const aTs = Math.min(...a.map(decisionTimestamp).filter(Number.isFinite));
      const bTs = Math.min(...b.map(decisionTimestamp).filter(Number.isFinite));
      return aTs - bTs;
    })[0] || [];
}

function formatStrikeLabel(value) {
  return Number.isFinite(value) ? `$${Math.round(value).toLocaleString()}` : "-";
}

function bitcoinActionScore(market) {
  const yesAsk = market.yes_ask || 0;
  const yesBid = market.yes_bid || 0;
  const last = market.last_price || 0;
  const vol = Math.log10((market.volume_24h || 0) + 1);
  return yesBid * 2 + last + vol * 4 - Math.abs(50 - yesAsk) * 0.05;
}

function bitcoinActionZoneRank(market, currentStrike) {
  const strikeDistance = Math.abs(bitcoinStrike(market) - currentStrike);
  const activeEntry = bitcoinPreferredEntryCents(market);
  const pricePenalty = Number.isFinite(activeEntry) ? Math.abs(activeEntry - 55) : 60;
  const minutesLeft = minutesToDecision(market);
  const earlyHigh = !Number.isFinite(minutesLeft) || minutesLeft > BTC_TECHNICAL_HIGH_ENTRY_MINUTES_LEFT;
  const staleHighPenalty = Number.isFinite(activeEntry) && activeEntry > BTC_TECHNICAL_EARLY_MAX_ENTRY_CENTS
    ? (activeEntry - BTC_TECHNICAL_EARLY_MAX_ENTRY_CENTS) * (earlyHigh ? 200 : 8)
    : 0;
  return strikeDistance * 4 + pricePenalty * 10 + staleHighPenalty - bitcoinActionScore(market) * 0.02;
}

function bitcoinPreferredEntryCents(market) {
  const yesAsk = validCents(market.yes_ask) ? market.yes_ask : (validCents(market.no_bid) ? 100 - market.no_bid : null);
  const noAsk = validCents(market.no_ask) ? market.no_ask : (validCents(market.yes_bid) ? 100 - market.yes_bid : null);
  const candidates = [yesAsk, noAsk].filter(validCents);
  return candidates.length ? candidates.sort((a, b) => Math.abs(a - 55) - Math.abs(b - 55))[0] : null;
}

function latestBitcoinEventGroup(markets) {
  const groups = new Map();
  for (const market of markets) {
    const key = market.event_ticker || market.series_ticker || "BTC";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(market);
  }
  return [...groups.values()]
    .sort((a, b) => bitcoinEventGroupScore(b) - bitcoinEventGroupScore(a))[0] || [];
}

function bitcoinEventGroupScore(group) {
  const decisionTs = Math.min(...group.map(decisionTimestamp).filter(Number.isFinite));
  const minutesToClose = Number.isFinite(decisionTs) ? Math.max(0, (decisionTs - Date.now()) / 60_000) : 999;
  const liveBandCount = group.filter(isBitcoinTradableBand).length;
  const volume = group.reduce((sum, market) => sum + Number(market.volume_24h || market.volume || 0), 0);
  return liveBandCount * 1000 + Math.log10(volume + 1) * 100 - minutesToClose;
}

function inferBitcoinCurrentStrike(markets) {
  const ranked = markets
    .filter(validBitcoinStrike)
    .filter((market) => {
      const probability = bitcoinMarketProbability(market);
      return Number.isFinite(probability) && probability > 0 && probability < 100;
    })
    .sort((a, b) => Math.abs(bitcoinMarketProbability(a) - 50) - Math.abs(bitcoinMarketProbability(b) - 50));
  if (ranked.length) return bitcoinStrike(ranked[0]);
  const byVolume = markets
    .filter((market) => Number(market.volume_24h || market.volume || 0) > 0)
    .sort((a, b) => Number(b.volume_24h || b.volume || 0) - Number(a.volume_24h || a.volume || 0));
  return byVolume.length ? bitcoinStrike(byVolume[0]) : NaN;
}

function isBitcoinTradableBand(market) {
  const entry = bitcoinPreferredEntryCents(market);
  if (!validCents(entry)) return false;
  if (isBitcoinLateLockBand(market, entry)) return true;
  const minutesLeft = minutesToDecision(market);
  const maxEntry = Number.isFinite(minutesLeft) && minutesLeft <= BTC_TECHNICAL_HIGH_ENTRY_MINUTES_LEFT
    ? BTC_TECHNICAL_LATE_MAX_ENTRY_CENTS
    : BTC_TECHNICAL_EARLY_MAX_ENTRY_CENTS;
  return entry >= BTC_RESEARCH_MIN_ENTRY_CENTS && entry <= maxEntry;
}

function isBitcoinLateLockBand(market, preferredEntry = null) {
  if (!isLateLockBitcoinMarket(market)) return false;
  const entry = validCents(preferredEntry) ? preferredEntry : bitcoinPreferredEntryCents(market);
  return entry >= BTC_LATE_LOCK_ENTRY_MIN_CENTS && entry <= BTC_LATE_LOCK_MAX_ENTRY_CENTS;
}

function bitcoinMarketProbability(market) {
  if (validCents(market.yes_ask) && validCents(market.yes_bid)) return (market.yes_ask + market.yes_bid) / 2;
  if (validCents(market.last_price)) return market.last_price;
  if (validCents(market.yes_ask)) return market.yes_ask;
  if (validCents(market.yes_bid)) return market.yes_bid;
  return 0;
}

function hasBitcoinLiveSignal(market) {
  return (market.yes_bid || 0) >= 1
    || (market.no_bid || 0) >= 1
    || (market.last_price || 0) >= 1
    || (market.volume_24h || market.volume || 0) > 0
    || (market.open_interest || 0) > 0;
}

function validBitcoinStrike(market) {
  return Number.isFinite(bitcoinStrike(market));
}

function validBitcoinHourlyStrike(market) {
  const strike = bitcoinStrike(market);
  return Number.isFinite(strike) && Math.abs(strike % BTC_HOURLY_STRIKE_STEP_DOLLARS) < 0.01;
}

function bitcoinStrike(market) {
  const text = `${market.ticker || ""} ${market.title || ""} ${market.market || ""} ${market.marketTitle || ""}`.replace(/,/g, "");
  const rangeMatch = text.match(/-B(\d+(?:\.\d+)?)/i);
  if (rangeMatch) return Number(rangeMatch[1]);
  const thresholdMatch = text.match(/-T(\d+(?:\.\d+)?)/i);
  if (thresholdMatch) return Math.round(Number(thresholdMatch[1]) + 0.01);
  const titleMatch = text.match(/\$?\s*(\d{2,6}(?:\.\d+)?)\s*(?:or above|to)/i);
  if (titleMatch) return Number(titleMatch[1]);
  return NaN;
}

async function fetchAndScanMarkets(scan, baseUrl) {
  let cursor = "";
  let page = 1;
  while (!scan.stopRequested && !scan.abortController.signal.aborted) {
    publishProgress({ phase: "markets", message: `Fetching markets page ${page}` });
    logAudit("info", `Fetching markets page ${page}`);
    const url = new URL(`${baseUrl}/markets`);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    try {
      const data = await fetchWithRetry(url.toString(), {
        signal: scan.abortController.signal,
        endpointLabel: "/markets"
      });
      const pageMarkets = (data.markets || []).map(normalizeMarket);
      scan.counters.marketsDiscovered += pageMarkets.length;
      latestSnapshot.counters = scan.counters;
      publish("counters", scan.counters);
      logAudit("info", `Found ${scan.counters.marketsDiscovered.toLocaleString()} markets so far`);
      if (pageMarkets.length) {
        const scannableMarkets = scan.settings.skipComboMarkets ? pageMarkets.filter((market) => !market.isComboMarket) : pageMarkets;
        const skippedCombos = pageMarkets.length - scannableMarkets.length;
        if (skippedCombos) {
          scan.counters.marketsScanned += skippedCombos;
          logAudit("info", `Skipped ${skippedCombos.toLocaleString()} combo/multi-leg markets on page ${page}; scanning ${scannableMarkets.length.toLocaleString()} single-market rows.`);
          publish("counters", scan.counters);
        }
        if (scannableMarkets.length) {
          logAudit("info", `Scoring markets page ${page} now so results can stream immediately.`);
          await scanMarkets(scan, baseUrl, scannableMarkets, scan.counters.marketsDiscovered - pageMarkets.length);
        }
      }
      cursor = data.cursor || "";
      if (!cursor || pageMarkets.length === 0) break;
      page += 1;
      await sleep(1000, scan.abortController.signal).catch(() => {});
    } catch (error) {
      if (scan.stopRequested || scan.abortController.signal.aborted || error.name === "AbortError") {
        logAudit("info", "Market pagination stopped by user.");
        break;
      }
      scan.counters.apiFailures += 1;
      logApiFailure("/markets", error, error.retryCount || 0, "stopped market pagination");
      break;
    }
  }
}

async function scanMarkets(scan, baseUrl, markets, offset = 0) {
  let index = 0;
  const workers = Array.from({ length: scan.settings.orderbookConcurrency }, async () => {
    while (!scan.stopRequested && !scan.abortController.signal.aborted) {
      const market = markets[index++];
      const currentIndex = offset + index;
      if (!market) return;
      await scoreMarket(scan, baseUrl, market, currentIndex, scan.counters.marketsDiscovered || markets.length);
    }
  });
  await Promise.all(workers);
}

async function scoreMarket(scan, baseUrl, market, position, total) {
  if (!isCryptoMarket(market) && scan.scannedTickers?.has(market.ticker)) return;
  if (!isCryptoMarket(market)) scan.scannedTickers?.add(market.ticker);
  if (scan.settings.skipComboMarkets && market.isComboMarket) {
    scan.counters.marketsScanned += 1;
    publish("counters", scan.counters);
    return;
  }

  publishProgress({
    phase: "market",
    current: position,
    total,
    event: market.subtitle || market.event_ticker || market.series_ticker,
    market: market.title,
    ticker: market.ticker,
    step: "Pulling orderbook..."
  });
  let orderbook = null;
  let candles = null;
  const notes = [];
  try {
    orderbook = await fetchOrderbook(scan, baseUrl, market.ticker);
    scan.counters.orderbooksFetched += 1;
  } catch (error) {
    scan.counters.apiFailures += 1;
    notes.push(`orderbook unavailable: ${error.message}`);
    logApiFailure(`/markets/${market.ticker}/orderbook`, error, error.retryCount || 0, "continued with market snapshot prices");
  }

  const skipCandles = isCryptoMarket(market) && !isBtcTechnicalMicroCandidate(market);
  if (skipCandles) {
    notes.push("BTC fast lane: candle pull skipped for 1-second orderbook scraping.");
  } else {
    publishProgress({ phase: "market", current: position, total, event: market.subtitle, market: market.title, ticker: market.ticker, step: "Pulling candles..." });
    try {
      candles = await fetchCandles(scan, baseUrl, market);
      scan.counters.candlesFetched += 1;
    } catch (error) {
      scan.counters.apiFailures += 1;
      notes.push(`candles unavailable: ${error.message}`);
      logApiFailure(`/markets/candlesticks ${market.ticker}`, error, error.retryCount || 0, "continued with reduced confidence");
    }
  }

  const enriched = enrichMarketWithBook(market, orderbook);
  updateBtcBookMemory(enriched);
  const candleSeries = extractSeries(candles);
  const scoredSides = [];
  for (const side of sidesToScoreForMarket(market, scan)) {
    publishProgress({ phase: "market", current: position, total, event: market.subtitle, market: market.title, ticker: market.ticker, step: `Testing ${side} side...` });
    scan.counters.candidatesTested += 1;
    const scored = scoreSide(enriched, side, candleSeries, scan.settings, notes, scan);
    if (!scored) {
      scan.counters.insufficientData += 1;
      continue;
    }
    scoredSides.push(scored);
  }
  const sportsArbMovementOk = scoredSides.some((scored) => sportsLeaderEligibility(scored).ok);
  if (sportsArbMovementOk) {
    enriched.sportsArbMovementConfirmed = true;
    enriched.sportsArbMovementScore = Math.max(
      0,
      ...scoredSides
        .filter((scored) => sportsLeaderEligibility(scored).ok)
        .map((scored) => sportsBestChopRank(scored))
        .filter(Number.isFinite)
    );
  }
  if (sportsArbEnabled(scan) && sportsArbMovementOk) {
    maybeLockSportsArbFromMarket(scan, enriched, scoredSides);
    observeSportsPairArb(scan, enriched);
  } else if (sportsArbEnabled(scan) && sportsArbEligibility(enriched).ok) {
    maybeLogSportsArbReject(scan, enriched, "recent EV/volatility gate failed; flat market not eligible for arb lock");
  }
  recordGameScan(scan, enriched, scoredSides, notes);
  for (const scored of scoredSides) {
    shadowObserveScoredResult(scored, scan);
    considerBestSportsChopCandidate(scan, scored);
    const scoreLaneEnabled = false;
    if (scored.qualifies) {
      scan.counters.evPositiveFound += 1;
      if (!scoreLaneEnabled) continue;
      addResult(scan, scored);
      logAudit("hit", `Legacy signal display found ${scored.recommendation} ${market.ticker}: EV ${formatPct(scored.evRoiPct)} at target ${scored.sellTargetCents}c.`);
    } else if (scoreLaneEnabled && scored.evRoiPct >= scan.settings.minDisplayEvPct) {
      addResult(scan, scored);
    }
  }
  scan.counters.marketsScanned += 1;
  latestSnapshot.counters = scan.counters;
  publish("counters", scan.counters);
  maybePromoteBestSportsChopCandidate(scan);
}

function sidesToScoreForMarket(market, scan) {
  if (isBtcTechnicalMicroCandidate(market)) {
    return ["YES", "NO"];
  }
  return ["YES", "NO"];
}

function addResult(scan, result) {
  scan.results.push({ ...result, isCurrentlyConfirmed: true, missedPasses: 0, firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
  scan.results.sort(compareDisplayResults);
  latestSnapshot.results = dedupeResultsForDisplay(scan.results)
    .filter((row) => row.qualifies || row.evRoiPct >= scan.settings.minDisplayEvPct)
    .slice(0, scan.settings.maxResults);
  markPaperTradeFromResult(result);
  queueTradeSignal(result);
  publish("result", result);
  publish("results", latestSnapshot.results);
}

function addManualResult(result, options = {}) {
  const now = new Date().toISOString();
  const stamped = { ...result, isCurrentlyConfirmed: true, missedPasses: 0, firstSeenAt: now, lastSeenAt: now };
  latestSnapshot.results = dedupeResultsForDisplay([stamped, ...(latestSnapshot.results || [])]).slice(0, DEFAULT_SETTINGS.maxResults);
  markPaperTradeFromResult(stamped);
  if (options.queue !== false) queueTradeSignal(stamped);
  publish("result", stamped);
  publish("results", latestSnapshot.results);
  return stamped;
}

async function executeManualResultNow(result) {
  if (!paperState.enabled || paperState.windingDown || paperState.safetyHalted) {
    return { ok: false, error: "Manual scrape blocked: live trader is not armed." };
  }
  normalizeExecutionState();
  if (paperState.executionState && !["IDLE", "SCANNING"].includes(paperState.executionState)) {
    return { ok: false, error: `Manual scrape blocked: executor is ${paperState.executionState}.` };
  }
  const exposureKey = liveExposureKey(result);
  clearExpiredExposureCooldowns();
  if (hasLiveExposure(exposureKey) || exposureCooldownRemaining(exposureKey) > 0) {
    return { ok: false, error: "Manual scrape blocked: this exposure is already open or cooling down." };
  }
  paperState.executionSignal = {
    queuedAt: new Date().toISOString(),
    ticker: result.ticker,
    side: result.side,
    exposureKey,
    entryPriceCents: result.currentBuyPriceCents,
    targetPriceCents: result.sellTargetCents,
    targetLimitPriceCents: executableTargetLimitCents(result),
    strategyType: result.strategyType,
    manual: true
  };
  paperState.executionState = "SIGNAL_QUEUED";
  paperState.executionUpdatedAt = new Date().toISOString();
  publishPaper();
  await runTradeExecutor(result);
  const trade = activeSystemTrades().find((row) => row.ticker === result.ticker && row.side === result.side);
  if (!trade) {
    return { ok: false, error: `Manual scrape signal was evaluated but no tracked trade opened for ${result.ticker}. Check Trade History/Audit for the execution refusal.` };
  }
  return { ok: true, trade };
}

function armManualScrapeTrading(settings) {
  if (Number(settings.maxTradeDollars || 0) <= 0) {
    return { ok: false, status: 400, error: "Cannot scrape: choose a Max $ per trade first." };
  }
  if (!liveConfig.configured) {
    return { ok: false, status: 400, error: "Cannot scrape: Kalshi credentials are not configured." };
  }
  if (paperState.safetyHalted) {
    return { ok: false, status: 409, error: `Cannot scrape: safety halt is active (${paperState.safetyHaltReason || "manual/account verification required"}).` };
  }
  paperState.enabled = true;
  paperState.windingDown = false;
  paperState.startedAt = paperState.startedAt || new Date().toISOString();
  paperState.stoppedAt = null;
  paperState.settings = {
    startingCash: paperState.startingCash,
    maxContracts: PAPER_MAX_CONTRACTS,
    maxTradeDollars: settings.maxTradeDollars,
    maxOpenDollars: settings.maxOpenDollars,
    enableBitcoin: settings.enableBitcoin,
    enableOtherMarkets: settings.enableOtherMarkets,
    oneTradeAtATime: false,
    monitorEverySeconds: PAPER_MONITOR_MS / 1000
  };
  publishPaper();
  return { ok: true };
}

async function buildManualBtcScrapeSignal(settings) {
  normalizeExecutionState();
  if (paperState.executionState && !["IDLE", "SCANNING"].includes(paperState.executionState)) {
    return { qualifies: false, reasonSummary: `Manual BTC scrape blocked: executor is ${paperState.executionState}.` };
  }
  if (hasLiveExposure("BTC_ACTIVE") || exposureCooldownRemaining("BTC_ACTIVE") > 0) {
    return { qualifies: false, reasonSummary: "Manual BTC scrape blocked: BTC exposure already open or cooling down." };
  }
  const data = await kalshiAuthFetch("/markets?series_ticker=KXBTCD&status=open&limit=1000");
  const markets = (data.markets || []).map(normalizeMarket);
  const currentEvent = latestBitcoinEventGroupByTime(markets).filter(bitcoinAboveContract).filter(validBitcoinStrike);
  if (!currentEvent.length) return { qualifies: false, reasonSummary: "Manual BTC scrape blocked: no current-hour BTC above-threshold markets found." };
  const anchor = inferBitcoinCurrentStrike(currentEvent);
  const candidates = currentEvent
    .filter((market) => !Number.isFinite(anchor) || Math.abs(bitcoinStrike(market) - anchor) <= 300)
    .sort((a, b) => {
      const aDistance = Number.isFinite(anchor) ? Math.abs(bitcoinStrike(a) - anchor) : 0;
      const bDistance = Number.isFinite(anchor) ? Math.abs(bitcoinStrike(b) - anchor) : 0;
      if (aDistance !== bDistance) return aDistance - bDistance;
      return Math.abs(bitcoinMarketProbability(a) - 50) - Math.abs(bitcoinMarketProbability(b) - 50);
    })
    .slice(0, 5);
  let best = null;
  const manualScan = createScanController({ ...settings, continuous: false });
  manualScan.btcManualScrape = true;
  manualScan.btcTechnicalBias = null;
  for (const market of candidates) {
    const orderbook = await fetchAuthOrderbook(market.ticker).catch(() => null);
    const enriched = enrichMarketWithBook(market, orderbook);
    const candles = await fetchAuthCandles(market).catch(() => []);
    const candleSeries = recentSeries(extractSeries(candles), 10 * 60 * 1000);
    const direction = chooseManualBtcDirection(enriched, candleSeries);
    const sides = direction.side ? [direction.side] : ["YES", "NO"];
    for (const side of sides) {
      const scored = scoreSide(enriched, side, candleSeries, settings, [`manual scrape ${direction.reason}`], manualScan);
      const result = buildForcedManualScrapeResult(enriched, side, settings, direction, {
        strategyType: "BTC_MANUAL_BOOK_SCRAPE",
        targetDistance: BTC_DESTROYER_TARGET_DISTANCE_CENTS,
        stopDistance: BTC_DESTROYER_STOP_DISTANCE_CENTS,
        base: scored
      });
      if (!result?.qualifies) continue;
      const rank = manualBtcRank(result, direction);
      if (!best || rank > best.rank) best = { rank, result };
    }
    recordGameScan(enriched, sides.map((side) => scoreSide(enriched, side, candleSeries, settings, [`manual scrape ${direction.reason}`], manualScan)).filter(Boolean), [`manual scrape ${direction.reason}`]);
  }
  if (!best) return { qualifies: false, reasonSummary: "Manual BTC scrape found no side with a safe executable target under current caps." };
  const result = {
    ...best.result,
    qualifies: true,
    strategyType: "BTC_MANUAL_BOOK_SCRAPE",
    evRoiPct: null,
    evPerContract: null,
    reasonSummary: `Manual scrape: ${best.result.reasonSummary}`
  };
  logAudit("hit", `Manual BTC scrape selected ${result.recommendation} ${result.ticker}: ${result.currentBuyPriceCents}c -> ${result.sellTargetCents}c.`);
  return result;
}

async function fetchAuthOrderbook(ticker) {
  const data = await kalshiAuthFetch(`/markets/${encodeURIComponent(ticker)}/orderbook?depth=${ORDERBOOK_DEPTH}`);
  return data.orderbook_fp || data.orderbook || data;
}

async function fetchAuthMarketQuote(ticker) {
  const data = await kalshiAuthFetch(`/markets/${encodeURIComponent(ticker)}`);
  const market = normalizeMarket(data.market || data);
  const orderbook = await fetchAuthOrderbook(ticker).catch(() => null);
  return orderbook ? enrichMarketWithBook(market, orderbook) : market;
}

async function fetchAuthCandles(market) {
  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - 10 * 60;
  const pathname = `/series/${encodeURIComponent(market.series_ticker || "KXBTCD")}/markets/${encodeURIComponent(market.ticker)}/candlesticks?period_interval=1&start_ts=${startTs}&end_ts=${endTs}`;
  const data = await kalshiAuthFetch(pathname);
  return data.candlesticks || data.market?.candlesticks || [];
}

function recentSeries(series, windowMs) {
  const cutoff = Date.now() - windowMs;
  return (series || []).filter((row) => {
    const ts = Number(row.ts || 0);
    if (!Number.isFinite(ts) || ts <= 0) return true;
    return (ts > 10_000_000_000 ? ts : ts * 1000) >= cutoff;
  });
}

function chooseManualBtcDirection(market, candleSeries) {
  const shove = btcBookShoveSignal(market);
  if (shove.side) return { side: shove.side, reason: shove.reason };
  const yesPrices = sidePriceSeries(candleSeries, "YES", market);
  const noPrices = sidePriceSeries(candleSeries, "NO", market);
  const yesMomentum = priceMomentum(yesPrices);
  const noMomentum = priceMomentum(noPrices);
  const yesDepth = Number(market.orderbook?.yesDepthAtEntry || 0);
  const noDepth = Number(market.orderbook?.noDepthAtEntry || 0);
  const yesSpread = Number(market.orderbook?.yesSpread || 9);
  const noSpread = Number(market.orderbook?.noSpread || 9);
  const yesScore = yesMomentum * 8 + Math.log10(yesDepth + 1) * 2 - yesSpread;
  const noScore = noMomentum * 8 + Math.log10(noDepth + 1) * 2 - noSpread;
  if (Math.abs(yesScore - noScore) < 1) return { side: null, reason: `book/candle pressure mixed YES ${round2(yesScore)} vs NO ${round2(noScore)}` };
  return {
    side: yesScore > noScore ? "YES" : "NO",
    reason: `book/candle pressure picked ${yesScore > noScore ? "YES" : "NO"}: YES ${round2(yesScore)} vs NO ${round2(noScore)}`
  };
}

function priceMomentum(prices) {
  const clean = (prices || []).filter(validCents);
  if (clean.length < 2) return 0;
  const recent = clean.slice(-10);
  return recent[recent.length - 1] - recent[0];
}

function promoteManualBtcScored(scored, market, side, settings, direction) {
  const entry = scored.currentBuyPriceCents;
  if (!validCents(entry)) return null;
  const maxEntry = minutesToDecision(market) <= BTC_TECHNICAL_HIGH_ENTRY_MINUTES_LEFT ? BTC_TECHNICAL_LATE_MAX_ENTRY_CENTS : BTC_TECHNICAL_EARLY_MAX_ENTRY_CENTS;
  if (entry < BTC_MIN_ENTRY_CENTS || entry > maxEntry) return null;
  const entryCost = entry / 100 + feePerContract(entry, KALSHI_STANDARD_FEE_RATE, settings.contracts);
  const targetPlan = chooseBtcMicroScalpTarget({ entry, entryCost, feeRate: KALSHI_STANDARD_FEE_RATE, settings, spreadCents: scored.spreadCents });
  if (!targetPlan) return null;
  const stopDistance = btcTechnicalStopDistanceCents(entry, targetPlan.executableTarget, minutesToDecision(market), scored.spreadCents);
  const stopPrice = Math.max(1, Math.round(entry - stopDistance));
  const sizing = computeRecommendedContracts({
    accountValue: settings.accountValue,
    minTargetProfitDollars: Math.min(settings.minTargetProfitDollars, BTC_MICRO_MIN_TARGET_PROFIT_DOLLARS),
    entryCents: entry,
    targetCents: targetPlan.executableTarget,
    stopCents: stopPrice,
    feeRate: KALSHI_STANDARD_FEE_RATE,
    maxContracts: LIVE_MAX_CONTRACTS
  });
  if (sizing.contracts < 1) return null;
  return {
    ...scored,
    qualifies: true,
    strategyType: "BTC_MANUAL_BOOK_SCRAPE",
    sellTargetCents: targetPlan.target,
    targetLimitPriceCents: targetPlan.executableTarget,
    priceBand: btcPriceBand(entry, stopPrice, targetPlan.target, targetPlan.executableTarget),
    stopPriceCents: stopPrice,
    stopDistanceCents: stopDistance,
    recommendedContracts: sizing.contracts,
    minContractsForProfit: sizing.minContractsForProfit,
    maxContractsByRisk: sizing.maxContractsByRisk,
    maxContractsAffordable: sizing.maxContractsAffordable,
    targetProfitDollars: sizing.targetProfitDollars,
    stopLossDollars: sizing.stopLossDollars,
    profitIfHit: targetPlan.profitIfHit,
    lossIfMissed: Math.max(0, entryCost - (stopPrice / 100 - feePerContract(stopPrice, KALSHI_STANDARD_FEE_RATE, settings.contracts))),
    reasonSummary: `manual scrape ${direction.reason}; entry ${entry}c, stop ${stopPrice}c, target ${targetPlan.executableTarget}c (${btcPriceBandText(entry, stopPrice, targetPlan.target)}).`
  };
}

function buildForcedManualScrapeResult(market, side, settings, direction, options = {}) {
  const isYes = side === "YES";
  const book = market.orderbook || {};
  const entry = round2(isYes ? market.yes_ask : market.no_ask);
  if (!validCents(entry) || entry >= 99) return null;
  const spread = isYes ? book.yesSpread : book.noSpread;
  const targetDistance = Math.max(1, Math.round(Number(options.targetDistance || scheduledScrapeDistanceCents(entry))));
  const target = clamp(Math.round(entry) + targetDistance, 1, 99);
  if (target <= entry) return null;
  const stopDistance = Math.max(1, Math.round(Number(options.stopDistance || MIN_SCRAPE_STOP_DISTANCE_CENTS)));
  const stopPrice = clamp(Math.round(entry) - stopDistance, 1, 99);
  const feeRate = KALSHI_STANDARD_FEE_RATE;
  const buyFee = feePerContract(entry, feeRate, settings.contracts);
  const entryCost = entry / 100 + buyFee;
  const sellFee = feePerContract(target, feeRate, settings.contracts);
  const sellProceeds = target / 100 - sellFee;
  const profitIfHit = sellProceeds - entryCost;
  const stopFee = feePerContract(stopPrice, feeRate, settings.contracts);
  const stopProceeds = stopPrice / 100 - stopFee;
  const lossIfMissed = Math.max(0, entryCost - stopProceeds);
  const sizing = computeRecommendedContracts({
    accountValue: settings.accountValue,
    minTargetProfitDollars: 0,
    entryCents: entry,
    targetCents: target,
    stopCents: stopPrice,
    feeRate,
    maxContracts: LIVE_MAX_CONTRACTS
  });
  const base = options.base || {};
  const strategyType = options.strategyType || (isCryptoMarket(market) ? "BTC_MANUAL_BOOK_SCRAPE" : "SPORTS_MANUAL_BOOK_SCRAPE");
  return {
    ...base,
    recommendation: `BUY ${side}`,
    side,
    marketTitle: market.title,
    subtitle: market.subtitle,
    ticker: market.ticker,
    event_ticker: market.event_ticker,
    series_ticker: market.series_ticker,
    category: market.category,
    status: market.status,
    close_time: market.close_time,
    expiration_time: market.expiration_time,
    expected_expiration_time: market.expected_expiration_time,
    decision_time: decisionIso(market),
    minutesLeft: round2(minutesToDecision(market)),
    occurrence_datetime: market.occurrence_datetime,
    selectionLabel: market.yes_sub_title || market.no_sub_title || market.subtitle,
    url: market.url,
    currentBuyPriceCents: entry,
    currentBidCents: round2(isYes ? market.yes_bid : market.no_bid),
    askPriceCents: round2(isYes ? market.yes_ask : market.no_ask),
    sellTargetCents: target,
    targetLimitPriceCents: target,
    priceBand: isBtcExecutionStrategy(strategyType) ? btcPriceBand(entry, stopPrice, target, target) : null,
    stopPriceCents: stopPrice,
    stopDistanceCents: Math.max(0, Math.round(entry - stopPrice)),
    recommendedContracts: sizing.contracts || LIVE_MAX_CONTRACTS,
    minContractsForProfit: sizing.minContractsForProfit,
    maxContractsByRisk: sizing.maxContractsByRisk,
    maxContractsAffordable: sizing.maxContractsAffordable,
    targetProfitDollars: sizing.targetProfitDollars,
    stopLossDollars: sizing.stopLossDollars,
    profitIfHit: round4(profitIfHit),
    lossIfMissed: round4(lossIfMissed),
    netProfitPct: entryCost > 0 ? round2((profitIfHit / entryCost) * 100) : 0,
    evPerContract: null,
    evRoiPct: null,
    strategyType,
    chopScore: Number(base.chopScore || 0),
    rangeCents: Number(base.rangeCents || 0),
    recentAmplitudeCents: Number(base.recentAmplitudeCents || 0),
    spreadCents: spread == null ? null : round2(spread),
    volume: market.volume,
    volume_24h: market.volume_24h,
    open_interest: market.open_interest,
    liquidity: market.liquidity,
    depthAtEntry: isYes ? book.yesDepthAtEntry : book.noDepthAtEntry,
    nearbyDepth: book.nearbyDepth,
    bookWallSummary: book.wallSummary || null,
    bookLadderSignal: base.bookLadderSignal || null,
    qualifies: true,
    reasonSummary: `manual scrape override: BUY ${side} now from Scrape button; ${direction?.reason || "user forced scrape"}; entry ${entry}c, target ${target}c, stop ${stopPrice}c.`
  };
}

function manualBtcRank(result, direction) {
  return Number(result.currentBuyPriceCents || 0)
    + Number(result.depthAtEntry || 0) * 0.001
    - Number(result.spreadCents || 5) * 10
    + (direction.side === result.side ? 25 : 0);
}

function isBtcExecutionStrategy(strategyType) {
  return ["BTC_TECHNICAL_FALLBACK", "BTC_EV_SWING", "LATE_LOCK_SCRAPE", "BTC_MANUAL_BOOK_SCRAPE"].includes(String(strategyType || ""));
}

function isSportsExecutionStrategy(strategyType) {
  return ["SPORTS_MICRO_SCALP", "SPORTS_BEST_CHOP_SCALP", "SPORTS_MANUAL_BOOK_SCRAPE"].includes(String(strategyType || ""));
}

async function buildManualOtherScrapeSignal(settings, requestedTicker = "") {
  normalizeExecutionState();
  if (paperState.executionState && !["IDLE", "SCANNING"].includes(paperState.executionState)) {
    return { qualifies: false, reasonSummary: `Manual game scrape blocked: executor is ${paperState.executionState}.` };
  }
  const ticker = requestedTicker || bestManualOtherTickerFromScanLog();
  if (!ticker) return { qualifies: false, reasonSummary: "Manual game scrape blocked: no live game has been scanned yet." };
  const marketData = await kalshiAuthFetch(`/markets/${encodeURIComponent(ticker)}`);
  const market = normalizeMarket(marketData.market || marketData);
  if (isCryptoMarket(market)) return { qualifies: false, reasonSummary: "Manual game scrape blocked: selected ticker is Bitcoin, not Other." };
  const orderbook = await fetchAuthOrderbook(market.ticker).catch(() => null);
  const enriched = enrichMarketWithBook(market, orderbook);
  const candles = await fetchAuthCandles(enriched).catch(() => []);
  const candleSeries = recentSeries(extractSeries(candles), 10 * 60 * 1000);
  const manualScan = createScanController({ ...settings, continuous: false, enableOtherMarkets: true });
  const direction = chooseManualOtherDirection(enriched, candleSeries);
  const sides = direction.side ? [direction.side] : ["YES", "NO"];
  const scored = sides.map((side) => scoreSide(enriched, side, candleSeries, settings, [`manual game scrape ${direction.reason}`], manualScan)).filter(Boolean);
  recordGameScan(enriched, scored, [`manual game scrape ${direction.reason}`]);
  const candidate = scored
    .map((row) => buildForcedManualScrapeResult(enriched, row.side, settings, direction, {
      strategyType: "SPORTS_MANUAL_BOOK_SCRAPE",
      targetDistance: scheduledScrapeDistanceCents(row.currentBuyPriceCents),
      stopDistance: MIN_SCRAPE_STOP_DISTANCE_CENTS,
      base: row
    }))
    .filter(Boolean)
    .sort((a, b) => manualOtherRank(b, direction) - manualOtherRank(a, direction))[0];
  if (!candidate) return { qualifies: false, reasonSummary: `Manual game scrape found no executable side for ${ticker}.` };
  const exposureKey = liveExposureKey(candidate);
  if (hasLiveExposure(exposureKey) || exposureCooldownRemaining(exposureKey) > 0) {
    return { qualifies: false, reasonSummary: "Manual game scrape blocked: this game/exposure is already open or cooling down." };
  }
  const result = {
    ...candidate,
    qualifies: true,
    strategyType: "SPORTS_MANUAL_BOOK_SCRAPE",
    evRoiPct: null,
    evPerContract: null,
    reasonSummary: `Manual game scrape: ${candidate.reasonSummary}`
  };
  logAudit("hit", `Manual game scrape selected ${result.recommendation} ${result.ticker}: ${result.currentBuyPriceCents}c -> ${result.sellTargetCents}c.`);
  return result;
}

function bestManualOtherTickerFromScanLog() {
  const rows = (latestSnapshot.gameScanLog || []).filter((row) => !isBitcoinSeries(row.series_ticker) && !/^KXBTC/i.test(String(row.ticker || "")));
  return rows
    .map((row) => ({ row, score: Math.max(0, ...(row.sides || []).filter((side) => sportsLeaderEligibility(scanSummaryToSportsResult(row, side)).ok).map((side) => Number(side.volatility ?? side.touch ?? side.netProfit ?? 0)).filter(Number.isFinite)) }))
    .filter((item) => item.row.ticker && item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.row?.ticker || "";
}

function scanSummaryToSportsResult(row, side) {
  return {
    ticker: row?.ticker,
    series_ticker: row?.series_ticker,
    spreadCents: side?.spread,
    rangeCents: side?.range,
    recentAmplitudeCents: side?.recentAmplitude,
    directionChanges: side?.turns,
    recentDirectionChanges: side?.recentTurns,
    recentSampleCount: side?.recentSamples,
    volume: side?.volume,
    volume_24h: side?.volume_24h,
    open_interest: side?.openInterest,
    liquidity: side?.liquidity,
    tennisPauseWarning: /tennis/i.test(String(side?.reason || "")) && /safety|pause|final/i.test(String(side?.reason || "")),
    sportsLatePhaseWarning: /late-game|final|9th|overtime/i.test(String(side?.reason || "")),
    category: "",
    marketTitle: row?.market
  };
}

function chooseManualOtherDirection(market, candleSeries) {
  const yesPrices = sidePriceSeries(candleSeries, "YES", market);
  const noPrices = sidePriceSeries(candleSeries, "NO", market);
  const yesChop = computeChop(yesPrices);
  const noChop = computeChop(noPrices);
  const yesScore = manualOtherSideScore(market, "YES", yesPrices, yesChop);
  const noScore = manualOtherSideScore(market, "NO", noPrices, noChop);
  if (Math.abs(yesScore - noScore) < 1.5) return { side: null, reason: `book/candle pressure mixed YES ${round2(yesScore)} vs NO ${round2(noScore)}` };
  return {
    side: yesScore > noScore ? "YES" : "NO",
    reason: `book/candle pressure picked ${yesScore > noScore ? "YES" : "NO"}: YES ${round2(yesScore)} vs NO ${round2(noScore)}`
  };
}

function manualOtherSideScore(market, side, prices, chop) {
  const entry = side === "YES" ? market.yes_ask : market.no_ask;
  const spread = side === "YES" ? market.orderbook?.yesSpread : market.orderbook?.noSpread;
  const depth = side === "YES" ? market.orderbook?.yesDepthAtEntry : market.orderbook?.noDepthAtEntry;
  const momentum = priceMomentum(prices);
  const pricePenalty = validCents(entry) ? Math.abs(entry - 72) * 0.35 : 40;
  return Number(chop?.score || 0) * 80
    + Number(chop?.recentAmplitude || 0) * 4
    + Math.abs(momentum) * 3
    + Math.log10(Number(depth || 0) + 1) * 3
    - Number(spread || 5) * 8
    - pricePenalty;
}

function promoteManualOtherScored(scored, market, settings, direction) {
  const entry = scored.currentBuyPriceCents;
  if (!validCents(entry) || entry < SIDE_ENTRY_MIN_CENTS || entry > SIDE_ENTRY_MAX_CENTS) return null;
  const eligibility = sportsLeaderEligibility(scored);
  if (!eligibility.ok) return null;
  const target = Math.min(98, Math.round(entry) + SPORTS_MICRO_MIN_TARGET_DISTANCE_CENTS);
  const stopDistance = sportsMicroStopDistanceCents(target - Math.round(entry));
  const stopPrice = Math.max(1, Math.round(entry - Math.max(stopDistance, 5)));
  const sizing = computeRecommendedContracts({
    accountValue: settings.accountValue,
    minTargetProfitDollars: Math.min(settings.minTargetProfitDollars, SPORTS_MICRO_MIN_TARGET_PROFIT_DOLLARS),
    entryCents: entry,
    targetCents: target,
    stopCents: stopPrice,
    feeRate: KALSHI_STANDARD_FEE_RATE,
    maxContracts: LIVE_MAX_CONTRACTS
  });
  if (sizing.contracts < 1) return null;
  return {
    ...scored,
    qualifies: true,
    sellTargetCents: target,
    targetLimitPriceCents: target,
    stopPriceCents: stopPrice,
    stopDistanceCents: Math.round(entry - stopPrice),
    recommendedContracts: sizing.contracts,
    minContractsForProfit: sizing.minContractsForProfit,
    maxContractsByRisk: sizing.maxContractsByRisk,
    maxContractsAffordable: sizing.maxContractsAffordable,
    targetProfitDollars: sizing.targetProfitDollars,
    stopLossDollars: sizing.stopLossDollars,
    strategyType: "SPORTS_MANUAL_BOOK_SCRAPE",
    reasonSummary: `manual game scrape ${direction.reason}; entry ${entry}c, target ${target}c, stop ${stopPrice}c.`
  };
}

function manualOtherRank(result, direction) {
  return Number(result.recentAmplitudeCents || 0) * 8
    + Number(result.chopScore || 0) * 100
    + Number(result.depthAtEntry || 0) * 0.001
    - Number(result.spreadCents || 5) * 12
    + (direction.side === result.side ? 20 : 0);
}

function sportsLeaderEligibility(result) {
  if (!result || isCryptoResult(result)) return { ok: false, reason: "not a sports result" };
  if (result.tennisPauseWarning || result.sportsLatePhaseWarning) return { ok: false, reason: "sport safety warning" };
  const spread = Number(result.spreadCents ?? 99);
  if (Number.isFinite(spread) && spread > MAX_EXECUTION_SPREAD_CENTS) {
    return { ok: false, reason: `spread ${round2(spread)}c exceeds ${MAX_EXECUTION_SPREAD_CENTS}c` };
  }
  const range = Number(result.rangeCents || 0);
  const recent = Number(result.recentAmplitudeCents || 0);
  const turns = Number(result.recentDirectionChanges ?? result.directionChanges ?? 0);
  const samples = Number(result.recentSampleCount || 0);
  const movementOk = samples >= SPORTS_ARB_MIN_RECENT_SAMPLES
    && recent >= SPORTS_ARB_MIN_RECENT_RANGE_CENTS
    && turns >= SPORTS_LEADER_MIN_DIRECTION_CHANGES;
  if (!movementOk) {
    return { ok: false, reason: `not enough recent live movement: ${samples} samples, range ${round2(range)}c, recent ${round2(recent)}c, recent turns ${turns}` };
  }
  const marketSize = Math.max(
    Number(result.volume_24h || 0),
    Number(result.volume || 0),
    Number(result.liquidity || 0),
    Number(result.open_interest || 0)
  );
  if (!Number.isFinite(marketSize) || marketSize < SPORTS_LEADER_MIN_VOLUME_DOLLARS) {
    return { ok: false, reason: `too little market activity: ${Math.round(Number(marketSize || 0)).toLocaleString()} < ${SPORTS_LEADER_MIN_VOLUME_DOLLARS.toLocaleString()}` };
  }
  return { ok: true, reason: "real movement and activity confirmed" };
}

function considerBestSportsChopCandidate(scan, scored) {
  if (!scored || scored.qualifies || scored.strategyType !== "SPORTS_BEST_CHOP_WATCH") return;
  const sportsSignalActive = scan.settings.enableOtherMarkets === true || sportsArbEnabled(scan);
  if (!sportsSignalActive || isCryptoResult(scored)) return;
  if (!sportsLeaderEligibility(scored).ok) return;
  if (!validCents(scored.currentBuyPriceCents) || !validCents(scored.sellTargetCents)) return;
  if ((scored.recommendedContracts || 0) < 1 || (scored.targetProfitDollars || 0) <= 0) return;
  const score = sportsBestChopRank(scored);
  if (!scan.bestSportsChopCandidate || score > scan.bestSportsChopCandidate.score) {
    scan.bestSportsChopCandidate = { score, result: scored };
  }
}

function sportsBestChopRank(result) {
  const chop = Number(result.chopScore || 0) * 100;
  const range = Number(result.rangeCents || 0) * 7;
  const turns = Number(result.directionChanges || 0) * 4;
  const recent = Number(result.recentTouchRate || 0) * 40;
  const spreadPenalty = Number(result.spreadCents || 0) * 10;
  const pricePenalty = Math.abs(Number(result.currentBuyPriceCents || 72) - 72) * 0.5;
  return chop + range + turns + recent - spreadPenalty - pricePenalty;
}

function sportsLockScanReady(scan) {
  const discovered = Number(scan?.counters?.marketsDiscovered || 0);
  const scanned = Number(scan?.counters?.marketsScanned || 0);
  const needed = Math.min(SPORTS_BEST_CHOP_MIN_SCANNED_MARKETS, Math.max(1, discovered || SPORTS_BEST_CHOP_MIN_SCANNED_MARKETS));
  return scanned >= needed;
}

function maybePromoteBestSportsChopCandidate(scan) {
  const sportsLaneActive = scan.settings.enableOtherMarkets === true;
  const arbLaneActive = sportsArbEnabled(scan);
  if ((!sportsLaneActive && !arbLaneActive) || !sportsLockScanReady(scan)) return;
  maybeLockBestSportsBookWatch(scan);
  if (!sportsLaneActive) return;
  if (scan.settings.bookScanOnly) return;
  if (!paperState.enabled || paperState.windingDown || paperState.safetyHalted) return;
  normalizeExecutionState();
  if (paperState.executionState && !["IDLE", "SCANNING"].includes(paperState.executionState)) return;
  const candidate = scan.bestSportsChopCandidate?.result;
  if (!candidate) return;
  const exposureKey = liveExposureKey(candidate);
  if (hasLiveExposure(exposureKey) || exposureCooldownRemaining(exposureKey) > 0) return;
  if (Date.now() - Number(scan.bestSportsChopPromotedAt || 0) < 60_000) return;
  const promoted = {
    ...candidate,
    qualifies: true,
    strategyType: "SPORTS_BEST_CHOP_SCALP",
    evRoiPct: null,
    evPerContract: 0,
    reasonSummary: `Best live sports chop after ${scan.counters.marketsScanned.toLocaleString()} markets: ${candidate.reasonSummary}`
  };
  scan.bestSportsChopPromotedAt = Date.now();
  scan.bestSportsChopCandidate = null;
  scan.counters.evPositiveFound += 1;
  logAudit("hit", `Best sports chop scalp selected ${promoted.recommendation} ${promoted.ticker}: ${promoted.currentBuyPriceCents}c -> ${promoted.sellTargetCents}c after ${scan.counters.marketsScanned.toLocaleString()} markets.`);
  addResult(scan, promoted);
}

function maybeLockBestSportsBookWatch(scan) {
  const sportsLaneActive = scan.settings.enableOtherMarkets === true;
  const arbLaneActive = sportsArbEnabled(scan);
  if ((!sportsLaneActive && !arbLaneActive) || !sportsLockScanReady(scan)) return;
  if (scan.otherBookWatch?.lockedByUser) return;
  const candidate = sportsLaneActive
    ? (scan.bestSportsArbPairCandidate?.result || scan.bestSportsChopCandidate?.result || scan.bestSportsArbVolatileCandidate?.result)
    : scan.bestSportsArbPairCandidate?.result;
  if (!candidate?.ticker) return;
  const score = sportsLaneActive
    ? (scan.bestSportsArbPairCandidate?.score || scan.bestSportsChopCandidate?.score || scan.bestSportsArbVolatileCandidate?.score || 0)
    : (scan.bestSportsArbPairCandidate?.score || 0);
  maybeMirrorSportsChopLockToArb(scan, candidate, score);
  if (!sportsLaneActive) return;
  if (scan.otherBookWatch?.ticker === candidate.ticker) return;
  const eventKey = sportsPairArbKey(candidate);
  scan.otherBookWatch = {
    ticker: candidate.ticker,
    eventKey,
    lockedByUser: false,
    lockedAt: Date.now(),
    lastCheckedAt: 0,
    lastAbnormalAt: 0,
    score
  };
  logAudit("info", `Other book scan locked top live-vol game after ${scan.counters.marketsScanned.toLocaleString()} markets: ${candidate.ticker}.`);
}

function maybeMirrorSportsChopLockToArb(scan, candidate, score = 0) {
  if (!scan || !sportsArbEnabled(scan) || !candidate?.ticker) return;
  const eventKey = sportsPairArbKey(candidate);
  if (!eventKey || sportsArbRecoveryOwnsDifferentEvent(eventKey) || hasUnhedgedSportsArbEvent(eventKey)) return;
  const current = scan.sportsArbWatch || null;
  const now = Date.now();
  const currentEvent = String(current?.eventKey || "").toUpperCase();
  const currentLockedAt = Date.parse(current?.lockedAt || "");
  const currentFresh = Number.isFinite(currentLockedAt) && now - currentLockedAt < SPORTS_PAIR_ARB_LOCK_MS;
  const candidateScore = round2(Number(score || 0));
  if (currentFresh && currentEvent && currentEvent !== String(eventKey).toUpperCase()) return;
  if (currentFresh && currentEvent === String(eventKey).toUpperCase() && current?.phase !== "VOLATILE_SCAN_LOCKED") return;
  const pairLegs = Array.isArray(candidate.arbPairLegs) ? candidate.arbPairLegs : [];
  const locked = {
    lockedAt: currentEvent === String(eventKey).toUpperCase() && current?.lockedAt ? current.lockedAt : new Date(now).toISOString(),
    expiresAt: new Date(now + SPORTS_PAIR_ARB_LOCK_MS).toISOString(),
    phase: "VOLATILE_SCAN_LOCKED",
    status: "volatile game locked; waiting for paired ask window",
    score: candidateScore,
    eventKey,
    ticker: candidate.ticker,
    eventTitle: candidate.subtitle || candidate.marketTitle || eventKey,
    combinedAskCents: null,
    edgeCents: null,
    minAskSize: 0,
    legs: pairLegs.length === 2 ? pairLegs.map((leg) => ({
      ticker: leg.ticker,
      side: leg.side,
      label: leg.selectionLabel || leg.label || leg.marketTitle || leg.subtitle || "",
      ask: leg.ask,
      bid: leg.bid,
      spread: leg.spread,
      askSize: leg.askSize || 0
    })) : [
      {
        ticker: candidate.ticker,
        side: candidate.side,
        label: candidate.selectionLabel || candidate.marketTitle || candidate.subtitle || "",
        ask: candidate.currentBuyPriceCents,
        bid: candidate.currentBidCents,
        spread: candidate.spreadCents,
        askSize: candidate.depthAtEntry || candidate.askSize || 0
      }
    ]
  };
  scan.sportsArbEventKey = eventKey;
  scan.sportsArbWatch = locked;
  latestSnapshot.sportsArbWatch = locked;
  publish("sportsArbWatch", locked);
  evaluateSportsPairArbBook(scan, eventKey);
}

async function scanOtherBookWatchTarget(scan, baseUrl) {
  const sportsLaneActive = scan.settings.enableOtherMarkets === true;
  if (!sportsLaneActive || !scan.otherBookWatch?.ticker || !baseUrl) return;
  const watch = scan.otherBookWatch;
  const now = Date.now();
  if (now - Number(watch.lastCheckedAt || 0) < 500) return;
  watch.lastCheckedAt = now;
  const marketData = await kalshiAuthFetch(`/markets/${encodeURIComponent(watch.ticker)}`);
  const market = normalizeMarket(marketData.market || marketData);
  if (isCryptoMarket(market)) return;
  const orderbook = await fetchAuthOrderbook(market.ticker).catch(() => null);
  const enriched = enrichMarketWithBook(market, orderbook);
  const candles = await fetchAuthCandles(enriched).catch(() => []);
  const candleSeries = recentSeries(extractSeries(candles), 10 * 60 * 1000);
  const direction = chooseManualOtherDirection(enriched, candleSeries);
  const sides = (direction.side ? [direction.side] : ["YES", "NO"])
    .map((side) => scoreSide(enriched, side, candleSeries, scan.settings, [`book watch ${direction.reason}`], scan))
    .filter(Boolean)
    .map((row) => row.qualifies ? row : promoteManualOtherScored(row, enriched, scan.settings, direction))
    .filter(Boolean);
  recordGameScan(scan, enriched, sides, [`book watch locked ${watch.lockedByUser ? "by user" : "top volatility"}`]);
  const wall = enriched.orderbook?.wallSummary || null;
  const abnormal = Boolean(wall?.side || Number(wall?.buyYesPressure || 0) >= BTC_DESTROYER_WALL_MIN_CONTRACTS || Number(wall?.buyNoPressure || 0) >= BTC_DESTROYER_WALL_MIN_CONTRACTS);
  if (abnormal) watch.lastAbnormalAt = now;
  const idleSince = Number(watch.lastAbnormalAt || watch.lockedAt || now);
  if (!watch.lockedByUser && now - idleSince > SPORTS_BOOK_WATCH_MAX_IDLE_MS) {
    logAudit("info", `Other book scan released ${watch.ticker}: no abnormal wall for ${Math.round(SPORTS_BOOK_WATCH_MAX_IDLE_MS / 60000)} minutes.`);
    scan.otherBookWatch = null;
  }
}

function queueTradeSignal(result) {
  if (activeScan?.settings?.bookScanOnly) return;
  const technicalBtcTrade = isBtcExecutionStrategy(result?.strategyType);
  const bestSportsChopTrade = isSportsExecutionStrategy(result?.strategyType);
  if (!result?.qualifies || (!technicalBtcTrade && !bestSportsChopTrade && result.evPerContract <= 0)) return;
  if (bestSportsChopTrade) {
    paperLog(`Legacy sports scrape signal ignored: ${result.ticker}. Sports is arbitrage-only now.`);
    return;
  }
  if (technicalBtcTrade) {
    paperLog(`Legacy Bitcoin scrape signal ignored: ${result.ticker}. Use Bitcoin Arb for cross-strike execution.`);
    return;
  }
  if (!paperState.enabled || paperState.windingDown || paperState.safetyHalted) return;
  normalizeExecutionState();
  const exposureKey = liveExposureKey(result);
  clearExpiredExposureCooldowns();
  const state = paperState.executionState;
  const activeOpenState = state === "POSITION_OPEN" && !paperState.settings?.oneTradeAtATime;
  if (state && !["IDLE", "SCANNING"].includes(state) && !activeOpenState) {
    paperLog(`Signal held ${result.ticker}: executor is ${state}. Scanner will keep watching; no direct order call.`);
    return;
  }
  if (hasLiveExposure(exposureKey) || exposureCooldownRemaining(exposureKey) > 0) return;
  paperState.executionSignal = {
    queuedAt: new Date().toISOString(),
    ticker: result.ticker,
    side: result.side,
    exposureKey,
    entryPriceCents: result.currentBuyPriceCents,
    targetPriceCents: result.sellTargetCents,
    targetLimitPriceCents: executableTargetLimitCents(result),
    strategyType: result.strategyType
  };
  paperState.executionState = "SIGNAL_QUEUED";
  paperState.executionUpdatedAt = new Date().toISOString();
  publishPaper();
  runTradeExecutor(result).catch((error) => {
    paperLog(`Trade executor error: ${error.message}`);
    paperState.executionState = activeExecutorBlockingTrades().length ? "POSITION_OPEN" : "IDLE";
    paperState.executionUpdatedAt = new Date().toISOString();
    publishPaper();
  });
}

function normalizeExecutionState() {
  if (paperState.executionState === "POSITION_OPEN" && !activeExecutorBlockingTrades().length) {
    paperState.executionState = paperState.enabled && activeScan?.running ? "SCANNING" : "IDLE";
    paperState.executionUpdatedAt = new Date().toISOString();
  }
  if (paperState.executionState === "COOLDOWN" && Date.now() >= Number(paperState.executionCooldownUntil || 0)) {
    paperState.executionState = "IDLE";
    paperState.executionCooldownUntil = 0;
    paperState.executionUpdatedAt = new Date().toISOString();
  }
}

async function runTradeExecutor(result) {
  if (tradeExecutorRunning) return;
  tradeExecutorRunning = true;
  paperState.executionState = "ENTRY_PRECHECK";
  paperState.executionStartedAt = new Date().toISOString();
  paperState.executionUpdatedAt = paperState.executionStartedAt;
  publishPaper();
  try {
    await executeQueuedTradeSignal(result);
  } finally {
    tradeExecutorRunning = false;
    paperState.executionSignal = null;
    paperState.executionState = activeExecutorBlockingTrades().length ? "POSITION_OPEN" : "IDLE";
    paperState.executionUpdatedAt = new Date().toISOString();
    publishPaper();
  }
}

function recordGameScan(scanOrMarket, marketOrScoredSides, scoredSidesOrNotes = [], maybeNotes = []) {
  const hasScan = scanOrMarket && !Array.isArray(marketOrScoredSides) && marketOrScoredSides && typeof marketOrScoredSides === "object";
  const scan = hasScan ? scanOrMarket : null;
  const market = hasScan ? marketOrScoredSides : scanOrMarket;
  const scoredSides = hasScan ? scoredSidesOrNotes : marketOrScoredSides;
  const notes = hasScan ? maybeNotes : scoredSidesOrNotes;
  const row = {
    time: new Date().toISOString(),
    event: market.subtitle || market.event_ticker || market.series_ticker || "",
    market: market.title || "",
    ticker: market.ticker || "",
    series_ticker: market.series_ticker || "",
    close_time: market.close_time,
    decision_time: decisionIso(market),
    btcTechnicalBias: null,
    bookWallSummary: market.orderbook?.wallSummary || null,
    sides: scoredSides.length ? scoredSides.map(scannedSideSummary) : [{
      side: "NA",
      decision: "insufficient",
      reason: notes.length ? notes.join("; ") : "No scoreable YES/NO side returned."
    }]
  };
  latestSnapshot.gameScanLog.unshift(row);
  latestSnapshot.gameScanLog = latestSnapshot.gameScanLog.slice(0, 400);
  publish("gameScan", row);
}

function maybeLockSportsArbFromMarket(scan, market, scoredSides = []) {
  if (!scan || !sportsArbEnabled(scan) || !market) return;
  const eligibility = sportsArbEligibility(market);
  if (!eligibility.ok) {
    maybeLogSportsArbReject(scan, market, eligibility.reason, eligibility);
    return;
  }
  const movementScores = (Array.isArray(scoredSides) ? scoredSides : [])
    .filter((scored) => sportsLeaderEligibility(scored).ok)
    .map((scored) => sportsBestChopRank(scored))
    .filter(Number.isFinite);
  if (!movementScores.length) {
    maybeLogSportsArbReject(scan, market, "recent EV/volatility gate failed; no moving side qualified", eligibility);
    return;
  }
  const score = Math.max(...movementScores);
  if (score <= 0) {
    maybeLogSportsArbReject(scan, market, "recent EV/volatility score <= 0", { ...eligibility, score });
    return;
  }
  const yesAsk = validCents(market.yes_ask) ? Number(market.yes_ask) : null;
  const yesBid = validCents(market.yes_bid) ? Number(market.yes_bid) : null;
  const candidate = {
    ticker: market.ticker,
    event_ticker: market.event_ticker,
    series_ticker: market.series_ticker,
    subtitle: market.subtitle || market.event_ticker || "",
    marketTitle: market.title || "",
    selectionLabel: market.yes_sub_title || selectionLabelFromTicker(market) || market.title || "",
    side: "YES",
    currentBuyPriceCents: yesAsk,
    currentBidCents: yesBid,
    spreadCents: yesAsk != null && yesBid != null ? Math.max(0, yesAsk - yesBid) : null,
    depthAtEntry: arbAskSizeForSide(market, "YES"),
    askSize: arbAskSizeForSide(market, "YES"),
    activityScore: eligibility.activity,
    arbVolatilityLock: true
  };
  if (!scan.bestSportsArbVolatileCandidate || score > scan.bestSportsArbVolatileCandidate.score) {
    scan.bestSportsArbVolatileCandidate = { score, result: candidate };
  }
}

function sportsArbRawMarketScore(market) {
  const book = market.orderbook || {};
  const activity = sportsArbActivityScore(market);
  const wall = book.wallSummary || {};
  const nearbyDepth = Number(book.nearbyDepth || 0);
  const visibleBook = Number(wall.visibleBookTotal || 0);
  const pressure = Math.max(
    Number(wall.yesLowBuyTotal || 0),
    Number(wall.yesHighSellTotal || 0),
    Number(wall.noLowBuyTotal || 0),
    Number(wall.noHighSellTotal || 0),
    nearbyDepth
  );
  const ask = validCents(market.yes_ask) ? Number(market.yes_ask) : null;
  const askCenterBonus = ask == null ? 0 : Math.max(0, 50 - Math.abs(ask - 50));
  return Math.log10(activity + 1) * 20
    + Math.log10(pressure + visibleBook + 1) * 18
    + askCenterBonus;
}

function sportsArbEnabled(scan = null) {
  if (scan?.settings) {
    return scan.settings.enableSportsArb === true && paperState?.settings?.enableSportsArb === true;
  }
  return paperState?.settings?.enableSportsArb === true;
}

function sportsArbExecutionEnabled(scan = null) {
  return sportsArbEnabled(scan || activeScan) && paperState.enabled && !paperState.windingDown && !paperState.safetyHalted;
}

function observeSportsPairArb(scan, market) {
  if (!scan?.sportsPairArbBook || !sportsArbEnabled(scan) || !market || isCryptoMarket(market) || isWeatherEvent(market)) return;
  if (!sportsArbEligibility(market).ok) return;
  if (market.sportsArbMovementConfirmed !== true || Number(market.sportsArbMovementScore || 0) <= 0) {
    maybeLogSportsArbReject(scan, market, "recent EV/volatility gate failed before arb book observation");
    return;
  }
  const eventKey = sportsPairArbKey(market);
  if (!eventKey) return;
  const existing = scan.sportsPairArbBook.get(eventKey) || [];
  const current = sportsPairArbMarketSnapshot(market);
  if (!current?.legs?.length) return;
  const next = [current, ...existing.filter((row) => row.ticker !== current.ticker)].slice(0, 12);
  scan.sportsPairArbBook.set(eventKey, next);
  considerSportsArbPairLockCandidate(scan, eventKey, next);
  const lockedEventKey = String(scan.sportsArbEventKey || scan.sportsArbWatch?.eventKey || "").toUpperCase();
  if (!lockedEventKey || eventKey !== lockedEventKey) return;
  evaluateSportsPairArbBook(scan, eventKey);
}

function bestSportsPairFromRows(rows = []) {
  if (rows.length < 2) return;
  let bestObservedPair = null;
  for (let i = 0; i < rows.length; i += 1) {
    const left = rows[i];
    if (!left?.ticker) continue;
    for (let j = i + 1; j < rows.length; j += 1) {
      const right = rows[j];
      if (!right || right.ticker === left.ticker) continue;
      if (!sportsPairLabelsLookOpposed(left, right)) continue;
      for (const leg of left.legs || []) {
        for (const otherLeg of right.legs || []) {
          if (!otherLeg) continue;
          if (!sportsPairArbLegsCoverOppositeOutcomes(leg, otherLeg)) continue;
          const combinedAsk = leg.ask + otherLeg.ask;
          const feeCents = (feePerContract(leg.ask, KALSHI_STANDARD_FEE_RATE, 1) + feePerContract(otherLeg.ask, KALSHI_STANDARD_FEE_RATE, 1)) * 100;
          const edgeCents = 100 - combinedAsk - feeCents;
          if (!bestObservedPair || combinedAsk < bestObservedPair.combinedAsk) {
            bestObservedPair = { leg, otherLeg, combinedAsk, edgeCents };
          }
        }
      }
    }
  }
  return bestObservedPair;
}

function considerSportsArbPairLockCandidate(scan, eventKey, rows = []) {
  if (!scan || !sportsArbEnabled(scan)) return;
  const bestObservedPair = bestSportsPairFromRows(rows);
  if (!bestObservedPair) return;
  const { leg, otherLeg, combinedAsk, edgeCents } = bestObservedPair;
  const score = sportsArbCandidateScore(leg, otherLeg, combinedAsk, edgeCents);
  const candidate = {
    ticker: leg.ticker,
    event_ticker: eventKey,
    series_ticker: leg.series_ticker || otherLeg.series_ticker || "",
    subtitle: leg.subtitle || otherLeg.subtitle || eventKey,
    marketTitle: leg.title || otherLeg.title || "",
    selectionLabel: leg.selectionLabel || leg.label || "",
    side: leg.side,
    currentBuyPriceCents: leg.ask,
    currentBidCents: leg.bid,
    spreadCents: leg.spread,
    depthAtEntry: leg.askSize,
    askSize: leg.askSize,
    activityScore: Math.max(Number(leg.activityScore || 0), Number(otherLeg.activityScore || 0)),
    arbVolatilityLock: true,
    arbPairLegs: [leg, otherLeg],
    combinedAskCents: round2(combinedAsk),
    edgeCents: round2(edgeCents)
  };
  if (!scan.bestSportsArbPairCandidate || score > scan.bestSportsArbPairCandidate.score) {
    scan.bestSportsArbPairCandidate = { score, result: candidate };
  }
}

function evaluateSportsPairArbBook(scan, eventKey) {
  const rows = scan?.sportsPairArbBook?.get(eventKey) || [];
  const bestObservedPair = bestSportsPairFromRows(rows);
  if (bestObservedPair) {
    if (bestObservedPair.combinedAsk <= SPORTS_PAIR_ARB_MAX_COMBINED_ASK_CENTS && bestObservedPair.edgeCents >= SPORTS_PAIR_ARB_MIN_EDGE_CENTS) {
      recordSportsPairArbCandidate(scan, eventKey, bestObservedPair.leg, bestObservedPair.otherLeg, bestObservedPair.combinedAsk, bestObservedPair.edgeCents);
    }
    updateSportsArbObservedPair(scan, eventKey, bestObservedPair);
  }
}

function sportsPairArbMarketSnapshot(market) {
  const selectionLabel = market.yes_sub_title || selectionLabelFromTicker(market) || market.subtitle || market.title || "";
  const base = {
    ticker: market.ticker,
    title: market.title || "",
    subtitle: market.subtitle || "",
    selectionLabel,
    bucket: allowedCalendarBucket(market),
    activityScore: sportsArbActivityScore(market),
    close_time: market.close_time,
    decision_time: decisionIso(market),
    event_ticker: market.event_ticker,
    series_ticker: market.series_ticker
  };
  const legs = ["YES"].map((side) => sportsPairArbLegFromMarket(market, side, base)).filter(Boolean);
  return { ...base, legs };
}

function sportsPairArbLegFromMarket(market, side, base) {
  const ask = side === "YES" ? Number(market.yes_ask) : Number(market.no_ask);
  const bid = side === "YES" ? Number(market.yes_bid) : Number(market.no_bid);
  if (!validCents(ask)) return null;
  if (ask < SPORTS_PAIR_ARB_MIN_LEG_ASK_CENTS || ask > SPORTS_PAIR_ARB_MAX_LEG_ASK_CENTS) return null;
  const askSize = arbAskSizeForSide(market, side);
  if (askSize < SPORTS_PAIR_ARB_MIN_SIDE_SIZE) return null;
  const spread = validCents(bid) ? Math.max(0, ask - bid) : null;
  return {
    ...base,
    side,
    ask,
    bid,
    spread,
    askSize,
    selectionLabel: base.selectionLabel
  };
}

function isSportsArbEligibleMarket(market) {
  return sportsArbEligibility(market).ok;
}

function sportsArbEligibility(market) {
  const bucket = allowedCalendarBucket(market);
  if (!isMlbMarket(market)) return { ok: false, reason: `Sports Arb is MLB-only; bucket ${bucket || "none"}`, bucket };
  if (market?.liveMilestoneConfirmed !== true && market?.liveFallbackConfirmed !== true) return { ok: false, reason: "not confirmed live game", bucket };
  if (isBlockedSportsArbMarket(market)) return { ok: false, reason: "blocked sports arb market", bucket };
  if (!isSportsScalpMarket(market)) return { ok: false, reason: "not sports scalp market", bucket };
  const latePhase = detectLateSportsPhase(market);
  if (latePhase.warning) return { ok: false, reason: latePhase.reason || "late sports phase", bucket };
  const traded = sportsArbTradedDollars(market);
  if (traded < SPORTS_ARB_MIN_TRADED_DOLLARS) return { ok: false, reason: `traded volume ${Math.round(traded).toLocaleString()} below ${SPORTS_ARB_MIN_TRADED_DOLLARS.toLocaleString()}`, bucket, traded };
  const activity = sportsArbActivityScore(market);
  if (activity < SPORTS_ARB_MIN_ACTIVITY) return { ok: false, reason: `activity ${round2(activity)} below ${SPORTS_ARB_MIN_ACTIVITY}`, bucket, activity };
  return { ok: true, reason: "eligible", bucket, activity };
}

function isMlbMarket(market) {
  if (allowedCalendarBucket(market) !== "baseball") return false;
  return /^KXMLB/i.test(`${market?.series_ticker || ""} ${market?.event_ticker || ""} ${market?.ticker || ""}`);
}

function detectSportsArbTennisSafety(market) {
  if (!isTennisMarket(market)) return { warning: false, reason: "" };
  const stageSafety = detectTennisStageSafety(market);
  if (stageSafety.warning) return stageSafety;
  const status = String(market.liveMilestoneStatus || market.liveMilestoneDetails?.status || market.liveMilestoneDetails?.widget_status || "").toLowerCase();
  if (market.liveFallbackConfirmed !== true && !/\b(live|in_progress|in progress)\b/.test(status)) {
    return { warning: true, reason: `tennis arb safety: milestone status ${status || "unknown"} is not explicitly live` };
  }
  const start = Date.parse(market.liveMilestoneStartDate || market.occurrence_datetime || "");
  if (Number.isFinite(start)) {
    const elapsedMinutes = (Date.now() - start) / 60_000;
    if (elapsedMinutes > 90) {
      return { warning: true, reason: `tennis arb safety: match elapsed ${Math.round(elapsedMinutes)}m; possible final-set/third-column state` };
    }
  }
  return { warning: false, reason: "" };
}

function maybeLogSportsArbReject(scan, market, reason, details = {}) {
  if (!scan?.settings?.enableSportsArb) return;
  const now = Date.now();
  if (now - Number(scan.lastSportsArbRejectLogAt || 0) < 15_000) return;
  scan.lastSportsArbRejectLogAt = now;
  const activity = details.activity != null ? ` activity ${round2(details.activity)}` : "";
  const bucket = details.bucket ? ` bucket ${details.bucket}` : "";
  const score = details.score != null ? ` score ${round2(details.score)}` : "";
  logAudit("arb", `Sports arb skipped ${market?.ticker || "market"}:${bucket}${activity}${score}; ${reason}.`);
}

function isBlockedSportsArbMarket(market) {
  const text = `${market.title || ""} ${market.subtitle || ""} ${market.ticker || ""} ${market.event_ticker || ""}`.toLowerCase();
  return /\b(ahl|minor league|exhibition|friendly|simulated|esports|outright|series|season|championship|draw)\b/.test(text);
}

function looksLikeTwoWaySoccerMarket(market) {
  const text = `${market.title || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""}`.toLowerCase();
  return /\b(win|winner)\b/.test(text) && !/\bdraw\b/.test(text);
}

function sportsArbActivityScore(market) {
  const wall = market.orderbook?.wallSummary || {};
  return Math.max(
    Number(market.volume_24h || 0),
    Number(market.volume || 0),
    Number(market.open_interest || 0),
    Number(market.liquidity || 0),
    Number(market.orderbook?.nearbyDepth || 0),
    Number(wall.visibleBookTotal || 0),
    Number(wall.yesLowBuyTotal || 0),
    Number(wall.yesHighSellTotal || 0),
    Number(wall.noLowBuyTotal || 0),
    Number(wall.noHighSellTotal || 0)
  );
}

function sportsArbTradedDollars(market) {
  return Math.max(
    Number(market.volume_24h || 0),
    Number(market.volume || 0)
  );
}

function arbAskSizeForSide(market, side) {
  const ask = side === "NO" ? Number(market.no_ask) : Number(market.yes_ask);
  if (!validCents(ask)) return 0;
  const oppositeBidForAsk = 100 - ask;
  const levels = side === "NO" ? (market.orderbook?.yesLevels || []) : (market.orderbook?.noLevels || []);
  const level = levels
    .filter((row) => Number(row.quantity || 0) > 0)
    .sort((a, b) => Math.abs(Number(a.price || 0) - oppositeBidForAsk) - Math.abs(Number(b.price || 0) - oppositeBidForAsk))[0];
  if (!level || Math.abs(Number(level.price || 0) - oppositeBidForAsk) > 0.51) return 0;
  return Number(level?.quantity || 0);
}

function sportsPairArbKey(market) {
  return String(market.event_ticker || market.subtitle || market.series_ticker || "").trim().toUpperCase();
}

function sportsPairLabelsLookOpposed(a, b) {
  const left = normalizeSelectionName(a.selectionLabel || a.title || "");
  const right = normalizeSelectionName(b.selectionLabel || b.title || "");
  if (!left || !right || left === right) return false;
  return true;
}

function sportsPairArbLegsCoverOppositeOutcomes(a, b) {
  if (!a || !b) return false;
  const leftSide = String(a.side || "").toUpperCase();
  const rightSide = String(b.side || "").toUpperCase();
  if (leftSide !== "YES" || rightSide !== "YES") return false;
  const leftTicker = String(a.ticker || "").toUpperCase();
  const rightTicker = String(b.ticker || "").toUpperCase();
  if (!leftTicker || !rightTicker || leftTicker === rightTicker) return false;
  const leftEvent = String(a.event_ticker || "").toUpperCase();
  const rightEvent = String(b.event_ticker || "").toUpperCase();
  if (leftEvent && rightEvent && leftEvent !== rightEvent) return false;
  if (leftEvent && (!leftTicker.startsWith(`${leftEvent}-`) || !rightTicker.startsWith(`${leftEvent}-`))) return false;
  return true;
}

function selectionLabelFromTicker(market) {
  const ticker = String(market?.ticker || "");
  const eventTicker = String(market?.event_ticker || "");
  if (!ticker || !eventTicker || !ticker.toUpperCase().startsWith(`${eventTicker.toUpperCase()}-`)) return "";
  return ticker.slice(eventTicker.length + 1).trim();
}

function normalizeSelectionName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(will|win|winner|vs|versus|match|game|the|team)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function recordSportsPairArbCandidate(scan, eventKey, a, b, combinedAsk, edgeCents) {
  if (!sportsPairArbLegsCoverOppositeOutcomes(a, b)) {
    setSportsArbWatchStatus(eventKey, "LOCKED_BLOCKED", "blocked: mixed-side pair is duplicate exposure, not arb");
    return;
  }
  const tickers = [a.ticker, b.ticker].sort().join("|");
  const key = `${eventKey}:${a.side}:${tickers}`;
  const now = Date.now();
  if (sportsArbRecoveryOwnsDifferentEvent(eventKey)) return;
  if (sportsArbCandidateConflictsWithHeldEvent(eventKey, [a, b])) return;
  if (hasActiveSportsArbEvent(eventKey)) {
    setSportsArbWatchStatus(eventKey, "LOCKED_RECOVERY", hasUnhedgedSportsArbEvent(eventKey)
      ? "locked: existing arb has mismatched or missing legs; no fresh entry"
      : "locked: this game already has a held arb; no duplicate entry");
    return;
  }
  if (hasUnhedgedSportsArbEvent(eventKey)) {
    const throttleKey = `${eventKey}:active`;
    if (now - Number(scan.sportsPairArbLastLogged?.get(throttleKey) || 0) >= SPORTS_PAIR_ARB_LOG_COOLDOWN_MS) {
      scan.sportsPairArbLastLogged?.set(throttleKey, now);
      logAudit("arb", `Sports arb watch held on ${eventKey}: one arb leg is still unhedged, so no fresh arb entry was submitted.`);
    }
    return;
  }
  const currentWatch = scan.sportsArbWatch || {};
  const currentEvent = String(currentWatch.eventKey || "").toUpperCase();
  const nextEvent = String(eventKey || "").toUpperCase();
  const currentLockedAt = Date.parse(currentWatch.lockedAt || "");
  if (currentEvent && currentEvent !== nextEvent && Number.isFinite(currentLockedAt) && now - currentLockedAt < SPORTS_ARB_VOLATILE_LOCK_MS) {
    return;
  }
  const locked = chooseSportsArbLock(scan, a, b, combinedAsk, edgeCents);
  scan.sportsArbEventKey = eventKey;
  scan.sportsArbWatch = locked;
  latestSnapshot.sportsArbWatch = locked;
  const submitKey = `${key}:submit`;
  if (now - Number(scan.sportsPairArbLastLogged?.get(submitKey) || 0) < SPORTS_PAIR_ARB_SUBMIT_COOLDOWN_MS) return;
  scan.sportsPairArbLastLogged?.set(submitKey, now);
  const candidate = {
    time: new Date().toISOString(),
    eventKey,
    eventTitle: a.subtitle || b.subtitle || eventKey,
    mode: "IOC_PAIR",
    reason: "Sports paired-arb found from paired asks only; submitting paired IOC orders when live arb is enabled.",
    combinedAskCents: round2(combinedAsk),
    estimatedEdgeCents: round2(edgeCents),
    legs: [
      { ticker: a.ticker, side: a.side, label: a.selectionLabel, eventTitle: a.subtitle || eventKey, ask: a.ask, bid: a.bid, spread: a.spread, askSize: a.askSize, decision_time: a.decision_time, close_time: a.close_time },
      { ticker: b.ticker, side: b.side, label: b.selectionLabel, eventTitle: b.subtitle || eventKey, ask: b.ask, bid: b.bid, spread: b.spread, askSize: b.askSize, decision_time: b.decision_time, close_time: b.close_time }
    ]
  };
  latestSnapshot.sportsArbCandidates = [candidate, ...(latestSnapshot.sportsArbCandidates || [])].slice(0, 50);
  if (now - Number(scan.sportsPairArbLastLogged?.get(key) || 0) >= SPORTS_PAIR_ARB_LOG_COOLDOWN_MS) {
    scan.sportsPairArbLastLogged?.set(key, now);
    logAudit("arb", `Sports paired-arb ${a.side} ${a.ticker} + ${b.ticker}: asks ${a.ask}c + ${b.ask}c = ${round2(combinedAsk)}c; estimated edge ${round2(edgeCents)}c after fees.`);
  }
  publish("sportsArb", candidate);
  publish("sportsArbWatch", locked);
  maybeExecuteSportsArbCandidate(candidate).catch((error) => {
    paperLog(`Sports arb executor error: ${kalshiErrorDetail(error) || error.message}`);
  });
}

function hasActiveSportsArbEvent(eventKey) {
  return sportsArbOpenLegs(eventKey).length > 0;
}

function activeSportsArbEventKeys() {
  const keys = new Set();
  for (const trade of activeSystemTrades()) {
    if (trade.strategyType !== "SPORTS_PAIR_ARB_HOLD") continue;
    const eventKey = String(trade.event_ticker || trade.exposureKey || "")
      .replace(/^SPORTS_ARB:/i, "")
      .trim()
      .toUpperCase();
    if (eventKey) keys.add(eventKey);
  }
  return keys;
}

function hasAnyUnhedgedSportsArbEvent() {
  for (const eventKey of activeSportsArbEventKeys()) {
    if (hasUnhedgedSportsArbEvent(eventKey)) return true;
  }
  return false;
}

function hasUnhedgedSportsArbEvent(eventKey) {
  const legs = sportsArbOpenLegs(eventKey);
  if (!legs.length) return false;
  if (legs.some((trade) => trade.status === "SUBMITTING" || trade.executionStatus === "SUBMITTING")) return true;
  const sides = new Set(legs.map((leg) => String(leg.side || "").toUpperCase()).filter(Boolean));
  if (sides.size !== 1) return true;
  const byTicker = new Map();
  for (const leg of legs) {
    const ticker = String(leg.ticker || "").toUpperCase();
    if (!ticker) continue;
    byTicker.set(ticker, (byTicker.get(ticker) || 0) + Number(leg.contracts || 0));
  }
  if (byTicker.size < 2) return true;
  const counts = [...byTicker.values()].filter((count) => count > 0);
  if (counts.length < 2) return true;
  return Math.min(...counts) !== Math.max(...counts);
}

function liveTruthPositionContracts(ticker) {
  const key = String(ticker || "").toUpperCase();
  if (!key) return 0;
  const livePosition = liveTruth.positionsByTicker?.get(key);
  const count = Math.abs(Number(livePosition?.position || 0));
  return Number.isFinite(count) ? Math.floor(count) : 0;
}

function sportsArbRecoveryOwnsDifferentEvent(eventKey) {
  const recoveryKey = String(paperState.sportsArbRecovery?.eventKey || "").trim().toUpperCase();
  if (!recoveryKey) return false;
  return recoveryKey !== String(eventKey || "").trim().toUpperCase();
}

function sportsArbOpenLegs(eventKey) {
  const key = String(eventKey || "").trim().toUpperCase();
  if (!key) return [];
  return (paperState.trades || []).filter((trade) => {
    if (!["SUBMITTING", "OPEN"].includes(trade.status)) return false;
    if (trade.strategyType !== "SPORTS_PAIR_ARB_HOLD") return false;
    return String(trade.exposureKey || "").toUpperCase() === `SPORTS_ARB:${key}`
      || String(trade.event_ticker || "").toUpperCase() === key
      || String(trade.subtitle || "").toUpperCase() === key
      || String(trade.ticker || "").toUpperCase().startsWith(`${key}-`);
  });
}

function clearSportsArbLock(eventKey) {
  const key = String(eventKey || "").trim().toUpperCase();
  if (activeScan?.sportsArbEventKey && String(activeScan.sportsArbEventKey).toUpperCase() === key) activeScan.sportsArbEventKey = "";
  if (activeScan?.sportsArbWatch && String(activeScan.sportsArbWatch.eventKey || "").toUpperCase() === key) activeScan.sportsArbWatch = null;
  if (latestSnapshot.sportsArbWatch && String(latestSnapshot.sportsArbWatch.eventKey || "").toUpperCase() === key) latestSnapshot.sportsArbWatch = null;
  publish("sportsArbWatch", latestSnapshot.sportsArbWatch || null);
}

function setSportsArbWatchStatus(eventKey, phase, status, extra = {}) {
  const key = String(eventKey || "").trim().toUpperCase();
  if (!key || !activeScan?.sportsArbWatch) return;
  const watchEvent = String(activeScan.sportsArbWatch.eventKey || "").trim().toUpperCase();
  if (watchEvent !== key) return;
  activeScan.sportsArbWatch = {
    ...activeScan.sportsArbWatch,
    ...extra,
    phase,
    status,
    lastExecutionStatusAt: new Date().toISOString()
  };
  latestSnapshot.sportsArbWatch = activeScan.sportsArbWatch;
  publish("sportsArbWatch", activeScan.sportsArbWatch);
}

function updateSportsArbObservedPair(scan, eventKey, observed) {
  if (sportsArbRecoveryOwnsDifferentEvent(eventKey)) return;
  const current = scan.sportsArbWatch || {};
  const { leg: a, otherLeg: b, combinedAsk, edgeCents } = observed;
  if (sportsArbCandidateConflictsWithHeldEvent(eventKey, [a, b])) return;
  if (!sportsLockScanReady(scan)) return;
  const now = Date.now();
  const currentEvent = String(current.eventKey || "").toUpperCase();
  const nextEvent = String(eventKey || "").toUpperCase();
  const currentLockedAt = Date.parse(current.lockedAt || "");
  const currentActive = currentEvent && Number.isFinite(currentLockedAt) && now - currentLockedAt < SPORTS_ARB_VOLATILE_LOCK_MS;
  if (currentActive && currentEvent !== nextEvent) return;
  if (current.phase === "ASK_FLOW_LOCKED" && Number(current.edgeCents || -999) >= SPORTS_PAIR_ARB_MIN_EDGE_CENTS && currentEvent === nextEvent) {
    recordSportsPairArbProbeCandidate(scan, eventKey, a, b, combinedAsk, edgeCents);
    return;
  }
  const lockedAt = currentEvent === nextEvent && current.lockedAt ? current.lockedAt : new Date(now).toISOString();
  const locked = {
    lockedAt,
    expiresAt: new Date((Date.parse(lockedAt) || now) + SPORTS_ARB_VOLATILE_LOCK_MS).toISOString(),
    phase: combinedAsk <= SPORTS_PAIR_ARB_PROBE_EXECUTE_COMBINED_CENTS ? "LOCKED_EXECUTION_WINDOW" : "LOCKED_AWAITING_ASKS",
    status: combinedAsk <= SPORTS_PAIR_ARB_PROBE_EXECUTE_COMBINED_CENTS
      ? `locked: asks ${round2(combinedAsk)}c, executing anchor-first arb process`
      : `locked: asks ${round2(combinedAsk)}c; waiting for <=${SPORTS_PAIR_ARB_PROBE_EXECUTE_COMBINED_CENTS}c`,
    score: currentEvent === nextEvent && current.score ? current.score : round2(sportsArbCandidateScore(a, b, combinedAsk, edgeCents)),
    eventKey,
    combinedAskCents: round2(combinedAsk),
    edgeCents: round2(edgeCents),
    minAskSize: Math.min(Number(a.askSize || 0), Number(b.askSize || 0)),
    legs: [
      { ticker: a.ticker, side: a.side, label: a.selectionLabel, ask: a.ask, bid: a.bid, spread: a.spread, askSize: a.askSize },
      { ticker: b.ticker, side: b.side, label: b.selectionLabel, ask: b.ask, bid: b.bid, spread: b.spread, askSize: b.askSize }
    ]
  };
  scan.sportsArbWatch = locked;
  latestSnapshot.sportsArbWatch = locked;
  publish("sportsArbWatch", locked);
  recordSportsPairArbProbeCandidate(scan, eventKey, a, b, combinedAsk, edgeCents);
}

function recordSportsPairArbProbeCandidate(scan, eventKey, a, b, combinedAsk, edgeCents) {
  if (!scan?.settings?.enableSportsArb) return;
  if (!sportsLockScanReady(scan)) {
    setSportsArbWatchStatus(eventKey, "LOCKED_AWAITING_SCAN", `locked: scanning live board first (${scan.counters.marketsScanned}/${Math.min(SPORTS_BEST_CHOP_MIN_SCANNED_MARKETS, Math.max(1, scan.counters.marketsDiscovered || SPORTS_BEST_CHOP_MIN_SCANNED_MARKETS))})`);
    return;
  }
  if (!sportsPairArbLegsCoverOppositeOutcomes(a, b)) {
    setSportsArbWatchStatus(eventKey, "LOCKED_BLOCKED", "blocked: mixed-side pair is duplicate exposure, not arb");
    return;
  }
  if (sportsArbRecoveryOwnsDifferentEvent(eventKey)) {
    setSportsArbWatchStatus(eventKey, "LOCKED_BLOCKED", "blocked: another arb hedge is already in recovery");
    return;
  }
  if (sportsArbCandidateConflictsWithHeldEvent(eventKey, [a, b])) {
    setSportsArbWatchStatus(eventKey, "LOCKED_BLOCKED", "blocked: same game already has an opposite-direction arb held");
    return;
  }
  if (hasUnhedgedSportsArbEvent(eventKey)) {
    setSportsArbWatchStatus(eventKey, "LOCKED_RECOVERY", "locked: one leg is already filled; retrying the missing hedge");
    return;
  }
  if (combinedAsk > SPORTS_PAIR_ARB_PROBE_MAX_OBSERVED_COMBINED_CENTS) {
    setSportsArbWatchStatus(eventKey, "LOCKED_AWAITING_ASKS", `locked: asks ${round2(combinedAsk)}c; too wide for arb process`);
    return;
  }
  if (combinedAsk > SPORTS_PAIR_ARB_PROBE_EXECUTE_COMBINED_CENTS) {
    setSportsArbWatchStatus(eventKey, "LOCKED_AWAITING_ASKS", `locked: asks ${round2(combinedAsk)}c; entering when <=${SPORTS_PAIR_ARB_PROBE_EXECUTE_COMBINED_CENTS}c`);
    return;
  }
  if (paperState.sportsArbInProgress || paperState.entryInProgress) {
    setSportsArbWatchStatus(eventKey, "LOCKED_QUEUED", "locked: execution rail is busy with another order");
    return;
  }
  if (paperState.executionState && !["IDLE", "SCANNING"].includes(paperState.executionState)) {
    setSportsArbWatchStatus(eventKey, "LOCKED_QUEUED", `locked: execution state ${paperState.executionState}`);
    return;
  }
  const now = Date.now();
  const key = `${eventKey}:probe:${[a.ticker, b.ticker].sort().join("|")}`;
  const submitKey = `${key}:submit`;
  if (now - Number(scan.sportsPairArbLastLogged?.get(submitKey) || 0) < SPORTS_PAIR_ARB_SUBMIT_COOLDOWN_MS) {
    setSportsArbWatchStatus(eventKey, "LOCKED_QUEUED", "locked: submit cooldown under 1s");
    return;
  }
  const [anchor, hedge] = Number(a.ask) >= Number(b.ask) ? [a, b] : [b, a];
  const anchorPrice = clamp(Math.round(Number(anchor.ask)), 1, 99);
  const hedgePrice = clamp(SPORTS_PAIR_ARB_PROBE_TARGET_COMBINED_CENTS - anchorPrice, 1, 99);
  const orderTotal = anchorPrice + hedgePrice;
  const feeCents = [
    feePerContract(anchorPrice, KALSHI_STANDARD_FEE_RATE, 1),
    feePerContract(hedgePrice, KALSHI_STANDARD_FEE_RATE, 1)
  ].reduce((sum, fee) => sum + fee * 100, 0);
  const estimatedEdge = round2(100 - orderTotal - feeCents);
  scan.sportsPairArbLastLogged?.set(submitKey, now);
  const candidate = {
    time: new Date().toISOString(),
    eventKey,
    eventTitle: anchor.subtitle || hedge.subtitle || eventKey,
    mode: "IOC_PAIR",
    probe: true,
    reason: "Sports arb probe: anchor the higher-probability live leg, then keep retrying the hedge leg at the arb-safe price.",
    observedCombinedAskCents: round2(combinedAsk),
    combinedAskCents: orderTotal,
    estimatedEdgeCents: estimatedEdge,
    legs: [
      { ticker: anchor.ticker, side: anchor.side, label: anchor.selectionLabel, eventTitle: anchor.subtitle || eventKey, ask: anchor.ask, bid: anchor.bid, spread: anchor.spread, askSize: anchor.askSize, limitPrice: anchorPrice, decision_time: anchor.decision_time, close_time: anchor.close_time },
      { ticker: hedge.ticker, side: hedge.side, label: hedge.selectionLabel, eventTitle: hedge.subtitle || eventKey, ask: hedge.ask, bid: hedge.bid, spread: hedge.spread, askSize: hedge.askSize, limitPrice: hedgePrice, decision_time: hedge.decision_time, close_time: hedge.close_time }
    ]
  };
  latestSnapshot.sportsArbCandidates = [candidate, ...(latestSnapshot.sportsArbCandidates || [])].slice(0, 50);
  if (now - Number(scan.sportsPairArbLastLogged?.get(key) || 0) >= SPORTS_PAIR_ARB_LOG_COOLDOWN_MS) {
    scan.sportsPairArbLastLogged?.set(key, now);
    logAudit("arb", `Sports arb probe ${eventKey}: observed asks ${anchor.ask}c + ${hedge.ask}c = ${round2(combinedAsk)}c; anchoring higher-probability ${anchor.ticker} @ ${anchorPrice}c and retrying hedge ${hedge.ticker} @ ${hedgePrice}c.`);
  }
  publish("sportsArb", candidate);
  maybeExecuteSportsArbCandidate(candidate).catch((error) => {
    paperLog(`Sports arb probe executor error: ${kalshiErrorDetail(error) || error.message}`);
  });
}

function chooseSportsArbLock(scan, a, b, combinedAsk, edgeCents) {
  const current = scan.sportsArbWatch;
  const now = Date.now();
  const score = sportsArbCandidateScore(a, b, combinedAsk, edgeCents);
  if (current?.lockedAt && now - Date.parse(current.lockedAt) < SPORTS_PAIR_ARB_LOCK_MS && Number(current.score || 0) >= score) {
    return current;
  }
  return {
    lockedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SPORTS_PAIR_ARB_LOCK_MS).toISOString(),
    phase: "ASK_FLOW_LOCKED",
    status: "watching paired asks",
    score: round2(score),
    eventKey: sportsPairArbKey(a),
    combinedAskCents: round2(combinedAsk),
    edgeCents: round2(edgeCents),
    minAskSize: Math.min(Number(a.askSize || 0), Number(b.askSize || 0)),
    legs: [
      { ticker: a.ticker, side: a.side, label: a.selectionLabel, ask: a.ask, bid: a.bid, spread: a.spread, askSize: a.askSize },
      { ticker: b.ticker, side: b.side, label: b.selectionLabel, ask: b.ask, bid: b.bid, spread: b.spread, askSize: b.askSize }
    ]
  };
}

function sportsArbCandidateScore(a, b, combinedAsk, edgeCents) {
  const sizeScore = Math.log10(Math.min(Number(a.askSize || 0), Number(b.askSize || 0)) + 1) * 20;
  const activityScore = Math.log10(Math.max(Number(a.activityScore || 0), Number(b.activityScore || 0)) + 1) * 8;
  const baseballBonus = a.bucket === "baseball" || b.bucket === "baseball" ? 250 : 0;
  return baseballBonus + edgeCents * 30 + sizeScore + activityScore - Math.max(0, combinedAsk - 92) * 4;
}

async function maybeExecuteSportsArbCandidate(candidate) {
  if (!candidate || candidate.mode !== "IOC_PAIR") return;
  if (!sportsArbExecutionEnabled(activeScan)) {
    markSportsArbWatchExecutionStatus(candidate, "blocked: Sports Arb lane is OFF or live engine is stopped");
    return;
  }
  normalizeExecutionState();
  if (paperState.sportsArbInProgress || paperState.entryInProgress) {
    markSportsArbWatchExecutionStatus(candidate, "queued: another order is in progress");
    return;
  }
  if (paperState.executionState && !["IDLE", "SCANNING"].includes(paperState.executionState)) {
    markSportsArbWatchExecutionStatus(candidate, `queued: execution state ${paperState.executionState}`);
    return;
  }
  const legs = orderSportsArbExecutionLegs(Array.isArray(candidate.legs) ? candidate.legs.filter((leg) => leg?.ticker && validCents(leg.ask)) : []);
  if (legs.length !== 2) {
    markSportsArbWatchExecutionStatus(candidate, "blocked: arb candidate does not have exactly two legs");
    return;
  }
  if (!sportsPairArbLegsCoverOppositeOutcomes(legs[0], legs[1])) {
    markSportsArbWatchExecutionStatus(candidate, "blocked: mixed-side pair is duplicate exposure, not arb");
    safetyHalt(`Blocked non-arb sports pair before order submission: ${legs[0]?.side} ${legs[0]?.ticker} + ${legs[1]?.side} ${legs[1]?.ticker}.`);
    return;
  }
  const exposureKey = `SPORTS_ARB:${candidate.eventKey || legs.map((leg) => leg.ticker).sort().join("|")}`;
  if (hasAnyUnhedgedSportsArbEvent()) {
    markSportsArbWatchExecutionStatus(candidate, "blocked: existing arb imbalance needs manual review before any new arb");
    return;
  }
  const activeEvents = activeSportsArbEventKeys();
  if (!activeEvents.has(String(candidate.eventKey || "").trim().toUpperCase()) && activeEvents.size >= SPORTS_PAIR_ARB_MAX_ACTIVE_EVENTS) {
    markSportsArbWatchExecutionStatus(candidate, "blocked: one sports arb event is already active");
    return;
  }
  if (sportsArbCandidateConflictsWithHeldEvent(candidate.eventKey, legs)) {
    markSportsArbWatchExecutionStatus(candidate, "blocked: same game already holds the opposite arb direction");
    return;
  }
  if (hasUnhedgedSportsArbEvent(candidate.eventKey)) {
    markSportsArbWatchExecutionStatus(candidate, "locked: existing one-leg arb is being hedged");
    return;
  }
  if (hasLiveExposure(exposureKey) && hasUnhedgedSportsArbEvent(candidate.eventKey)) {
    markSportsArbWatchExecutionStatus(candidate, "locked: existing live exposure is awaiting hedge");
    return;
  }
  const cooldownMs = exposureCooldownRemaining(exposureKey);
  if (cooldownMs > 0) {
    markSportsArbWatchExecutionStatus(candidate, `queued: exposure cooldown ${Math.ceil(cooldownMs / 1000)}s`);
    return;
  }
  if (!liveConfig.configured || !liveConfig.liveTradingEnabled) {
    markSportsArbWatchExecutionStatus(candidate, "blocked: Kalshi live trading is not configured/enabled");
    paperLog("Sports arb ready, but Kalshi live trading is not configured/enabled.");
    return;
  }
  await refreshLiveAccountFromKalshi().catch((error) => paperLog(`Sports arb balance refresh failed: ${error.message}`));
  const orderPrices = legs.map((leg) => sportsArbLegOrderPrice(leg));
  const combinedAsk = orderPrices.reduce((sum, price) => sum + price, 0);
  const feePerPair = orderPrices.reduce((sum, price) => sum + feePerContract(price, KALSHI_STANDARD_FEE_RATE, 1), 0);
  const pairCost = combinedAsk / 100 + feePerPair;
  const manualLegBudget = clampNumber(paperState.settings?.maxTradeDollars, 0, USER_MAX_TRADE_DOLLARS_LIMIT, DEFAULT_SETTINGS.maxTradeDollars);
  const liveCash = Math.max(0, Number(paperState.cash || 0));
  if (manualLegBudget <= 0) {
    paperLog(`Sports arb skipped ${candidate.eventKey || ""}: max $ per trade is 0, so no live arb order was sent.`);
    return;
  }
  const maxPairsByTradeBudget = Math.min(...orderPrices.map((price) => Math.floor(manualLegBudget / Math.max(0.01, price / 100 + feePerContract(price, KALSHI_STANDARD_FEE_RATE, 1)))));
  const maxPairsByOpenBudget = Math.floor(remainingLiveSystemExposureBudget() / Math.max(0.01, pairCost));
  const maxPairsByCash = Math.floor(liveCash / Math.max(0.01, pairCost));
  const maxPairsByBook = Math.min(...legs.map((leg) => Math.max(1, Math.floor(Number(leg.askSize || 1)))));
  const intendedContracts = Math.max(0, Math.min(PAPER_MAX_CONTRACTS, maxPairsByTradeBudget, maxPairsByBook, maxPairsByCash, maxPairsByOpenBudget));
  if (intendedContracts < 1) {
    markSportsArbWatchExecutionStatus(candidate, `blocked: $${round2(manualLegBudget)} per leg cannot buy one contract at ${orderPrices.map((price) => `${price}c`).join(" + ")}`);
    paperLog(`Sports arb skipped ${candidate.eventKey || ""}: $${round2(manualLegBudget)} per leg cannot buy one contract at prices ${orderPrices.map((price) => `${price}c`).join(" + ")}.`);
    return;
  }
  const contracts = intendedContracts;
  if (contracts < 1) {
    paperLog(`Sports arb skipped ${candidate.eventKey || ""}: pair cost $${pairCost.toFixed(2)} does not fit $${round2(liveEntryBudgetDollars())}/leg or open-position budget.`);
    return;
  }
  const reserved = round4(pairCost * contracts);
  if (!reserveLiveExposure(reserved, "sports arb pair")) {
    markSportsArbWatchExecutionStatus(candidate, `blocked: live exposure reservation failed for $${reserved}`);
    return;
  }
  markSportsArbWatchExecutionStatus(candidate, `executing ${contracts} pair(s): anchor first, hedge retry after fill`);
  paperState.sportsArbInProgress = true;
  paperState.executionState = "ARB_PAIR_SUBMITTING";
  paperState.executionUpdatedAt = new Date().toISOString();
  publishPaper();
  const trades = legs.map((leg) => createSportsArbTrade(candidate, leg, contracts, exposureKey));
  paperState.trades.unshift(trades[0]);
  syncActiveTradePointer();
  publishPaper();
  try {
    for (let index = 0; index < trades.length; index += 1) {
      const trade = trades[index];
      const leg = legs[index];
      const stage = index === 0 ? "anchor" : "hedge";
      if (stage === "hedge" && trades[0]?.status !== "OPEN") {
        safetyHalt(`Sports arb hedge blocked for ${candidate.eventKey || "candidate"} because anchor leg is not confirmed OPEN.`);
        return;
      }
      if (!paperState.trades.some((row) => row.id === trade.id)) {
        paperState.trades.unshift(trade);
        syncActiveTradePointer();
        publishPaper();
      }
      let attempt = 0;
      const initialRetryPrice = sportsArbRetryOrderPrice(leg, stage, trades, candidate);
      paperState.sportsArbRecovery = {
        eventKey: candidate.eventKey,
        startedAt: paperState.sportsArbRecovery?.startedAt || new Date().toISOString(),
        stage,
        anchor: trades[0]?.ticker,
        hedge: trades[1]?.ticker,
        filled: trades.filter((row) => row.status === "OPEN").map((row) => row.ticker),
        missing: [trade.ticker],
        retryPriceCents: initialRetryPrice,
        contracts,
        retrySide: trade.side,
        retrySelection: trade.selectionLabel || trade.ticker
      };
      paperLog(`Sports arb ${stage} retry on ${candidate.eventKey}: ${trade.side} ${trade.ticker} ${contracts} @ ${initialRetryPrice}c.`);
      while (trade.status !== "OPEN" && sportsArbExecutionEnabled(activeScan) && !paperState.sportsArbRecovery?.manualOverride) {
        if (sportsArbRecoveryExpired(candidate, trades)) {
          safetyHalt(`Sports arb ${stage} recovery expired for ${candidate.eventKey || "candidate"} near event close. Missing: ${trade.ticker}.`);
          return;
        }
        attempt += 1;
        const retryPrice = sportsArbRetryOrderPrice(leg, stage, trades, candidate);
        paperState.sportsArbRecovery = {
          ...(paperState.sportsArbRecovery || {}),
          eventKey: candidate.eventKey,
          attempts: attempt,
          lastAttemptAt: new Date().toISOString(),
          stage,
          anchor: trades[0]?.ticker,
          hedge: trades[1]?.ticker,
          filled: trades.filter((row) => row.status === "OPEN").map((row) => row.ticker),
          missing: [trade.ticker],
          retryPriceCents: retryPrice,
          contracts,
          retrySide: trade.side,
          retrySelection: trade.selectionLabel || trade.ticker
        };
        publishPaper();
        await refreshLiveTruth().catch((error) => {
          paperLog(`Sports arb ${stage} live-position precheck failed for ${trade.ticker}: ${error.message}.`);
        });
        const liveQuote = await fetchAuthMarketQuote(trade.ticker).catch((error) => {
          paperLog(`Sports arb ${stage} executable quote check failed for ${trade.ticker}: ${error.message}.`);
          return null;
        });
        const executableAsk = liveQuote
          ? (trade.side === "NO" ? liveQuote.no_ask : liveQuote.yes_ask)
          : null;
        const executableBid = liveQuote
          ? (trade.side === "NO" ? liveQuote.no_bid : liveQuote.yes_bid)
          : null;
        paperState.sportsArbRecovery = {
          ...(paperState.sportsArbRecovery || {}),
          currentExecutableAskCents: validCents(executableAsk) ? round2(executableAsk) : null,
          currentExecutableBidCents: validCents(executableBid) ? round2(executableBid) : null,
          quoteCheckedAt: new Date().toISOString()
        };
        publishPaper();
        const liveContracts = liveTruthPositionContracts(trade.ticker);
        if (liveContracts > contracts) {
          safetyHalt(`Sports arb ${stage} live position ${liveContracts} exceeds intended ${contracts} on ${trade.ticker}. Manual review required.`);
          return;
        }
        const missingContracts = Math.max(0, contracts - liveContracts);
        if (missingContracts <= 0) {
          applySportsArbFillToTrade(trade, {
            status: "filled",
            filledContracts: contracts,
            fillPriceCents: retryPrice,
            reason: "live position already matches intended arb size"
          });
          break;
        }
        const order = await submitSportsArbLegOrder(leg, missingContracts, retryPrice);
        const orderId = order.order?.order_id || order.order_id;
        trade.entryOrderId = orderId || trade.entryOrderId;
        trade.entryClientOrderId = order.order?.client_order_id || order.client_order_id || trade.entryClientOrderId;
        const fill = await verifyIocOrderFillOrUnfilled(trade.ticker, orderId, missingContracts);
        if (fill?.filledContracts > missingContracts) {
          safetyHalt(`Sports arb ${stage} fill count ${fill.filledContracts} exceeds missing ${missingContracts} on ${trade.ticker}. Manual review required.`);
          return;
        }
        if (fill?.filledContracts > 0) {
          fill.filledContracts = Math.min(contracts, liveContracts + fill.filledContracts);
        }
        applySportsArbFillToTrade(trade, fill);
        if (fill?.status === "uncertain") {
          safetyHalt(`Sports arb ${stage} confirmation uncertain for ${trade.ticker}. Manual review required.`);
          return;
        }
        if (trade.status !== "OPEN") await sleep(SPORTS_PAIR_ARB_RETRY_MS);
      }
      if (trade.status !== "OPEN") {
        paperState.sportsArbRecovery = {
          ...(paperState.sportsArbRecovery || {}),
          manualOverride: true,
          stoppedBecauseLaneOff: !sportsArbExecutionEnabled(activeScan),
          lastAttemptAt: new Date().toISOString()
        };
        paperLog(`Sports arb ${stage} retry paused for ${trade.ticker}: Sports Arb lane is OFF or trading is halted.`);
        return;
      }
    }
    for (const trade of trades) {
      trade.status = "OPEN";
      trade.executionStatus = "ARB_HELD_TO_EXPIRATION";
    }
    paperState.sportsArbRecovery = null;
    paperState.executionState = "SCANNING";
    clearSportsArbLock(candidate.eventKey);
    paperLog(`Sports arb filled and held to expiration: ${trades.map((trade) => trade.ticker).join(" + ")} at combined ${round2(combinedAsk)}c for ${contracts} contract pair(s).`);
  } catch (error) {
    safetyHalt(`Sports arb execution error: ${kalshiErrorDetail(error) || error.message}`);
  } finally {
    releaseLiveExposureReservation(reserved);
    paperState.sportsArbInProgress = false;
    updatePaperAccount();
    publishPaper();
  }
}

function markSportsArbWatchExecutionStatus(candidate, status) {
  const eventKey = String(candidate?.eventKey || "").toUpperCase();
  if (!eventKey || !activeScan?.sportsArbWatch) return;
  const watchEvent = String(activeScan.sportsArbWatch.eventKey || "").toUpperCase();
  if (watchEvent !== eventKey) return;
  const executing = /^executing/i.test(String(status || ""));
  activeScan.sportsArbWatch = {
    ...activeScan.sportsArbWatch,
    phase: executing ? "EXECUTING" : "LOCKED_BLOCKED",
    status,
    lastExecutionStatusAt: new Date().toISOString()
  };
  latestSnapshot.sportsArbWatch = activeScan.sportsArbWatch;
  publish("sportsArbWatch", activeScan.sportsArbWatch);
}

function orderSportsArbExecutionLegs(legs = []) {
  return legs
    .filter(Boolean)
    .slice()
    .sort((a, b) => {
      const priceDiff = sportsArbLegOrderPrice(b) - sportsArbLegOrderPrice(a);
      if (priceDiff) return priceDiff;
      return String(a.ticker || "").localeCompare(String(b.ticker || ""));
    });
}

function sportsArbCandidateConflictsWithHeldEvent(eventKey, legs = []) {
  const key = String(eventKey || "").trim().toUpperCase();
  if (!key || !Array.isArray(legs) || !legs.length) return false;
  const heldSides = sportsArbRequiredSidesForEvent(key);
  if (!heldSides.size) return false;
  for (const leg of legs) {
    const ticker = String(leg?.ticker || "").trim().toUpperCase();
    const side = String(leg?.side || "").trim().toUpperCase();
    const heldSide = heldSides.get(ticker);
    if (heldSide && side && heldSide !== side) {
      logAudit("arb", `Sports arb skipped ${key}: ${ticker} is direction-locked as ${heldSide}; refusing opposite ${side} leg that could unwind the arb.`);
      return true;
    }
  }
  return false;
}

function sportsArbRequiredSidesForEvent(eventKey) {
  const key = String(eventKey || "").trim().toUpperCase();
  const active = new Map();
  const historical = [];
  for (const trade of paperState.trades || []) {
    if (trade.strategyType !== "SPORTS_PAIR_ARB_HOLD") continue;
    if (["ENTRY_NOT_FILLED", "ENTRY_UNCONFIRMED", "FAILED"].includes(trade.status)) continue;
    if (trade.entryConfirmationStatus && trade.entryConfirmationStatus !== "filled") continue;
    const tradeEvent = String(trade.event_ticker || "").trim().toUpperCase();
    const exposureEvent = String(trade.exposureKey || "").replace(/^SPORTS_ARB:/i, "").trim().toUpperCase();
    if (tradeEvent !== key && exposureEvent !== key) continue;
    const ticker = String(trade.ticker || "").trim().toUpperCase();
    const side = String(trade.side || "").trim().toUpperCase();
    if (!ticker || !side) continue;
    if (["OPEN", "SUBMITTING", "MANUAL_OVERRIDE"].includes(trade.status)) {
      active.set(ticker, side);
      continue;
    }
    historical.push({
      ticker,
      side,
      exposureKey: String(trade.exposureKey || "").trim(),
      ts: Date.parse(trade.openedConfirmedAt || trade.openedAt || trade.closedAt || "") || 0
    });
  }
  if (active.size) return active;
  if (!historical.length) return active;
  const newestExposure = historical
    .slice()
    .sort((a, b) => b.ts - a.ts)[0]?.exposureKey;
  if (!newestExposure) return active;
  const required = new Map();
  for (const row of historical.filter((row) => row.exposureKey === newestExposure)) {
    required.set(row.ticker, row.side);
  }
  return required;
}

function createSportsArbTrade(candidate, leg, contracts, exposureKey) {
  const entry = sportsArbLegOrderPrice(leg);
  const entryFee = feePerContract(entry, KALSHI_STANDARD_FEE_RATE, contracts);
  const side = leg.side === "NO" ? "NO" : "YES";
  return {
    id: cryptoRandomId(),
    status: "SUBMITTING",
    openedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    exposureKey,
    contracts,
    side,
    recommendation: `BUY ${side}`,
    ticker: leg.ticker,
    event_ticker: candidate.eventKey || "",
    series_ticker: "",
    category: "Sports",
    marketTitle: [leg.label, leg.eventTitle || candidate.eventTitle].filter(Boolean).join(" - ") || candidate.eventKey || leg.ticker,
    subtitle: leg.eventTitle || candidate.eventTitle || candidate.eventKey || "",
    selectionLabel: leg.label || "",
    strategyType: "SPORTS_PAIR_ARB_HOLD",
    entryPriceCents: entry,
    targetPriceCents: null,
    targetLimitPriceCents: null,
    softStopPriceCents: null,
    hardStopPriceCents: null,
    entryFeePerContract: entryFee,
    exitFeePerContract: 0,
    entryCost: round4(contracts * (entry / 100 + entryFee)),
    expectedTargetProceeds: round4(contracts),
    currentBidCents: null,
    currentAskCents: entry,
    openValue: 0,
    unrealizedPnl: 0,
    targetHidden: true,
    arbHoldToExpiration: true,
    arbCombinedTargetCents: Number(candidate.combinedAskCents),
    arbObservedCombinedAskCents: Number(candidate.observedCombinedAskCents ?? candidate.combinedAskCents),
    checks: []
  };
}

function sportsArbRetryOrderPrice(leg, stage, trades = [], candidate = {}) {
  const basePrice = sportsArbLegOrderPrice(leg);
  if (stage !== "hedge") return basePrice;
  const anchor = trades[0];
  if (!anchor || anchor.status !== "OPEN" || !validCents(anchor.entryPriceCents)) return basePrice;
  const targetCombined = clamp(Math.round(Number(candidate.arbCombinedTargetCents || candidate.combinedAskCents || 95)), 1, 99);
  const hedgeCap = clamp(targetCombined - Math.round(Number(anchor.entryPriceCents || 0)), 1, 99);
  return Math.min(basePrice, hedgeCap);
}

async function submitSportsArbLegOrder(leg, contracts, limitPriceCents = null) {
  if (String(leg?.side || "").toUpperCase() !== "YES") {
    throw new Error(`Sports arb blocked invalid ${leg?.side || "unknown"} leg for ${leg?.ticker || "unknown ticker"}; arb entries are YES+YES only.`);
  }
  const price = validCents(limitPriceCents) ? clamp(Math.round(Number(limitPriceCents)), 1, 99) : sportsArbLegOrderPrice(leg);
  const side = leg.side === "NO" ? "no" : "yes";
  const order = {
    ticker: leg.ticker,
    action: "buy",
    side,
    count: contracts,
    type: "limit",
    client_order_id: `sports_arb_${cryptoRandomId()}`,
    time_in_force: "immediate_or_cancel",
    cancel_order_on_pause: true
  };
  if (side === "no") order.no_price = price;
  else order.yes_price = price;
  return placeKalshiOrder(order);
}

function sportsArbLegOrderPrice(leg) {
  return clamp(Math.round(Number(leg?.limitPrice ?? leg?.targetPrice ?? leg?.ask)), 1, 99);
}

function applySportsArbFillToTrade(trade, fill) {
  trade.entryConfirmationStatus = fill?.status || "unknown";
  trade.entryConfirmationReason = fill?.reason || "";
  const filled = Math.max(0, Math.floor(Number(fill?.filledContracts || 0)));
  if (filled > 0) {
    if (filled < trade.contracts) resizeTradeContracts(trade, filled);
    if (validCents(fill.fillPriceCents)) {
      trade.entryPriceCents = fill.fillPriceCents;
      trade.currentAskCents = fill.fillPriceCents;
      trade.entryCost = round4(trade.contracts * (fill.fillPriceCents / 100 + feePerContract(fill.fillPriceCents, KALSHI_STANDARD_FEE_RATE, trade.contracts)));
    }
    trade.status = "OPEN";
    trade.openedConfirmedAt = new Date().toISOString();
    trade.failureReason = null;
    return;
  }
  if (fill?.status === "uncertain") {
    trade.status = "ENTRY_UNCONFIRMED";
    trade.failureReason = fill.reason || "IOC confirmation uncertain";
  } else {
    trade.status = "ENTRY_NOT_FILLED";
    trade.closedAt = new Date().toISOString();
    trade.failureReason = fill?.reason || "IOC did not fill";
  }
}

function applyBitcoinArbFillToTrade(trade, fill) {
  trade.entryConfirmationStatus = fill?.status || "unknown";
  trade.entryConfirmationReason = fill?.reason || "";
  const filled = Math.max(0, Math.floor(Number(fill?.filledContracts || 0)));
  if (filled > 0) {
    if (filled < trade.contracts) resizeTradeContracts(trade, filled);
    if (validCents(fill.fillPriceCents)) {
      trade.entryPriceCents = fill.fillPriceCents;
      trade.currentAskCents = fill.fillPriceCents;
      trade.entryCost = round4(trade.contracts * (fill.fillPriceCents / 100 + feePerContract(fill.fillPriceCents, KALSHI_STANDARD_FEE_RATE, trade.contracts)));
    }
    trade.status = "OPEN";
    trade.openedConfirmedAt = new Date().toISOString();
    trade.failureReason = null;
    return;
  }
  if (fill?.status === "uncertain") {
    trade.status = "ENTRY_UNCONFIRMED";
    trade.failureReason = fill.reason || "IOC confirmation uncertain";
  } else {
    trade.status = "ENTRY_NOT_FILLED";
    trade.closedAt = new Date().toISOString();
    trade.failureReason = fill?.reason || "IOC did not fill";
  }
}

function sportsArbRecoveryExpired(candidate, trades = []) {
  const times = [
    candidate?.decision_time,
    candidate?.close_time,
    candidate?.expected_expiration_time,
    ...(trades || []).flatMap((trade) => [trade.decision_time, trade.close_time, trade.expected_expiration_time])
  ];
  const closeTs = times
    .map((value) => Date.parse(value || ""))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0];
  if (!Number.isFinite(closeTs)) return false;
  return Date.now() >= closeTs + 60_000;
}

function bitcoinArbEnabled(scan = null) {
  const source = scan || activeScan;
  return source?.settings?.enableBitcoinArb === true && paperState?.settings?.enableBitcoinArb === true;
}

function bitcoinArbExecutionEnabled(scan = null) {
  return bitcoinArbEnabled(scan || activeScan) && paperState.enabled && !paperState.windingDown && !paperState.safetyHalted;
}

async function scanBitcoinCrossStrikeArb(scan, markets = []) {
  if (!scan?.settings?.enableBitcoinArb) {
    publish("bitcoinArbWatch", null);
    latestSnapshot.bitcoinArbWatch = null;
    return;
  }
  if (paperState.btcArbInProgress || activeBitcoinCrossStrikeArbTrades().length) {
    return;
  }
  const currentEvent = latestBitcoinEventGroupByTime(markets)
    .filter(bitcoinAboveContract)
    .filter(validBitcoinStrike);
  if (!currentEvent.length) {
    updateBitcoinArbWatch({ phase: "WAIT", reason: "No current-hour BTC above contracts found." });
    return;
  }
  const minutesLeft = minutesToDecision(currentEvent[0]);
  if (!Number.isFinite(minutesLeft) || minutesLeft <= BTC_CROSS_STRIKE_ARB_MIN_MINUTES_LEFT) {
    updateBitcoinArbWatch({
      phase: "BLOCKED",
      reason: `No fresh BTC anchor after the first half hour. Existing anchors may keep retrying the ARB leg, but new anchor buys stop once ${BTC_CROSS_STRIKE_ARB_MIN_MINUTES_LEFT} minutes or less remain.`,
      expiresAt: decisionIso(currentEvent[0])
    });
    return;
  }
  const anchor = inferBitcoinCurrentStrike(currentEvent);
  const sorted = [...currentEvent]
    .filter((market) => !Number.isFinite(anchor) || Math.abs(bitcoinStrike(market) - anchor) <= 400)
    .sort((a, b) => bitcoinStrike(a) - bitcoinStrike(b))
    .slice(0, 8);
  const enriched = [];
  for (const market of sorted) {
    const orderbook = await fetchAuthOrderbook(market.ticker).catch(() => null);
    enriched.push(orderbook ? enrichMarketWithBook(market, orderbook) : market);
  }
  const candidate = bestBitcoinCrossStrikeArbCandidate(enriched, minutesLeft);
  if (!candidate) {
    const pairSummary = bitcoinCrossStrikePairSummary(enriched);
    const nearestPair = bitcoinCrossStrikeNearestPair(enriched, anchor);
    updateBitcoinArbWatch({
      phase: "WATCHING",
      reason: `No eligible BTC anchor yet. Need higher-strike NO ${BTC_CROSS_STRIKE_ARB_MIN_FIRST_LEG_CENTS}-${BTC_CROSS_STRIKE_ARB_MAX_FIRST_LEG_CENTS}c, then lower-strike YES IOC at ${BTC_CROSS_STRIKE_ARB_HEDGE_TARGET_CENTS}c.${pairSummary ? ` ${pairSummary}` : ""}`,
      expiresAt: decisionIso(currentEvent[0]),
      btcReferencePrice: Number.isFinite(anchor) ? anchor : null,
      nearestPair
    });
    return;
  }
  updateBitcoinArbWatch(candidate);
  if (bitcoinArbExecutionEnabled(scan)) {
    await maybeExecuteBitcoinCrossStrikeArb(candidate);
  }
}

function bestBitcoinCrossStrikeArbCandidate(markets, minutesLeft) {
  const pairs = [];
  for (let i = 0; i < markets.length; i += 1) {
    for (let j = i + 1; j < markets.length; j += 1) {
      const lower = markets[i];
      const higher = markets[j];
      const lowerStrike = bitcoinStrike(lower);
      const higherStrike = bitcoinStrike(higher);
      if (!Number.isFinite(lowerStrike) || !Number.isFinite(higherStrike) || lowerStrike >= higherStrike) continue;
      if (Math.abs((higherStrike - lowerStrike) - BTC_CROSS_STRIKE_ARB_STRIKE_STEP_DOLLARS) > 0.01) continue;
      const higherNoAsk = Number(higher.no_ask);
      const lowerYesAsk = Number(lower.yes_ask);
      if (!validCents(higherNoAsk) || !validCents(lowerYesAsk)) continue;
      if (higherNoAsk < BTC_CROSS_STRIKE_ARB_MIN_FIRST_LEG_CENTS || higherNoAsk > BTC_CROSS_STRIKE_ARB_MAX_FIRST_LEG_CENTS) continue;
      const hedgeTarget = bitcoinCrossStrikeHedgeTargetCents(higherNoAsk);
      if (!validCents(hedgeTarget)) continue;
      const distance = Math.max(0, lowerYesAsk - hedgeTarget);
      const liveEdge = BTC_CROSS_STRIKE_ARB_MAX_COMBINED_CENTS - (higherNoAsk + lowerYesAsk);
      const combinedNow = higherNoAsk + lowerYesAsk;
      pairs.push({
        phase: "LOCKED",
        mode: "BTC_CROSS_STRIKE_ARB",
        reason: `Higher-strike NO anchor at ${BTC_CROSS_STRIKE_ARB_MAX_FIRST_LEG_CENTS}c or better, then the $${BTC_CROSS_STRIKE_ARB_STRIKE_STEP_DOLLARS} lower-strike YES IOC retries at ${BTC_CROSS_STRIKE_ARB_HEDGE_TARGET_CENTS}c. Live asks ${round2(combinedNow)}c; target ${BTC_CROSS_STRIKE_ARB_MAX_COMBINED_CENTS}c.`,
        eventKey: `${higher.event_ticker || higher.series_ticker || "KXBTCD"}:${decisionIso(higher) || higher.ticker}`,
        expiresAt: decisionIso(higher) || decisionIso(lower),
        minutesLeft: round2(minutesLeft),
        combinedNowCents: round2(combinedNow),
        combinedTargetCents: BTC_CROSS_STRIKE_ARB_MAX_COMBINED_CENTS,
        hedgeTargetCents: hedgeTarget,
        legGapCents: round2(BTC_CROSS_STRIKE_ARB_MAX_FIRST_LEG_CENTS - hedgeTarget),
        score: round2(Math.max(0, liveEdge) * 10 + Math.max(0, 20 - distance) + Math.max(0, higherNoAsk - BTC_CROSS_STRIKE_ARB_MIN_FIRST_LEG_CENTS)),
        higher: btcArbLegSummary(higher, "NO"),
        lower: btcArbLegSummary(lower, "YES")
      });
    }
  }
  return pairs.sort((a, b) => b.score - a.score)[0] || null;
}

function bitcoinCrossStrikePairSummary(markets = []) {
  const pairs = [];
  const sorted = [...markets].sort((a, b) => bitcoinStrike(a) - bitcoinStrike(b));
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lower = sorted[i];
    const higher = sorted[i + 1];
    const lowerStrike = bitcoinStrike(lower);
    const higherStrike = bitcoinStrike(higher);
    if (!Number.isFinite(lowerStrike) || !Number.isFinite(higherStrike)) continue;
    if (Math.abs((higherStrike - lowerStrike) - BTC_CROSS_STRIKE_ARB_STRIKE_STEP_DOLLARS) > 0.01) continue;
    const higherNoAsk = validCents(higher.no_ask) ? Number(higher.no_ask) : null;
    const lowerYesAsk = validCents(lower.yes_ask) ? Number(lower.yes_ask) : null;
    pairs.push(`${formatStrikeLabel(lowerStrike)}/${formatStrikeLabel(higherStrike)}: higher NO ${validCents(higherNoAsk) ? `${round2(higherNoAsk)}c` : "-"}, lower YES ${validCents(lowerYesAsk) ? `${round2(lowerYesAsk)}c` : "-"}`);
  }
  return pairs.slice(0, 3).join(" | ");
}

function bitcoinCrossStrikeNearestPair(markets = [], anchor = NaN) {
  const sorted = [...markets]
    .filter(validBitcoinStrike)
    .sort((a, b) => bitcoinStrike(a) - bitcoinStrike(b));
  const pairs = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lower = sorted[i];
    const higher = sorted[i + 1];
    const lowerStrike = bitcoinStrike(lower);
    const higherStrike = bitcoinStrike(higher);
    if (!Number.isFinite(lowerStrike) || !Number.isFinite(higherStrike)) continue;
    if (Math.abs((higherStrike - lowerStrike) - BTC_CROSS_STRIKE_ARB_STRIKE_STEP_DOLLARS) > 0.01) continue;
    const lowerYesAsk = validCents(lower.yes_ask) ? Number(lower.yes_ask) : null;
    const higherNoAsk = validCents(higher.no_ask) ? Number(higher.no_ask) : null;
    const midpoint = (lowerStrike + higherStrike) / 2;
    const anchorDistance = Number.isFinite(anchor) ? Math.abs(midpoint - anchor) : Math.abs((higherNoAsk || 50) - 40) + Math.abs((lowerYesAsk || 50) - 40);
    pairs.push({
      anchorDistance,
      lower: btcArbLegSummary(lower, "YES"),
      higher: btcArbLegSummary(higher, "NO"),
      combinedNowCents: validCents(lowerYesAsk) && validCents(higherNoAsk) ? round2(lowerYesAsk + higherNoAsk) : null,
      hedgeTargetCents: BTC_CROSS_STRIKE_ARB_HEDGE_TARGET_CENTS,
      combinedTargetCents: BTC_CROSS_STRIKE_ARB_MAX_COMBINED_CENTS
    });
  }
  return pairs.sort((a, b) => a.anchorDistance - b.anchorDistance)[0] || null;
}

function bitcoinCrossStrikeHedgeTargetCents(anchorPriceCents) {
  const anchor = Number(anchorPriceCents);
  if (!validCents(anchor)) return null;
  return BTC_CROSS_STRIKE_ARB_HEDGE_TARGET_CENTS;
}

function bitcoinCrossStrikeRetryTargetCents(anchorPriceCents, expiresAt) {
  const baseTarget = bitcoinCrossStrikeHedgeTargetCents(anchorPriceCents);
  if (!validCents(baseTarget)) return null;
  const expiry = Date.parse(expiresAt || "");
  const minutesLeft = Number.isFinite(expiry) ? (expiry - Date.now()) / 60_000 : Infinity;
  if (!Number.isFinite(minutesLeft) || minutesLeft > 10) return baseTarget;
  const breakEvenTarget = clamp(Math.ceil(100 - Number(anchorPriceCents)), baseTarget, 95);
  if (minutesLeft > 5) return breakEvenTarget;
  const finalFiveStep = Math.max(1, 6 - Math.ceil(Math.max(0, minutesLeft)));
  return clamp(breakEvenTarget + finalFiveStep * 5, breakEvenTarget, 95);
}

function btcArbLegSummary(market, side) {
  return {
    ticker: market.ticker,
    side,
    strike: bitcoinStrike(market),
    strikeLabel: formatStrikeLabel(bitcoinStrike(market)),
    marketTitle: market.title || market.subtitle || market.ticker,
    eventTitle: market.subtitle || market.event_ticker || "",
    yesAsk: validCents(market.yes_ask) ? Number(market.yes_ask) : null,
    noAsk: validCents(market.no_ask) ? Number(market.no_ask) : null,
    yesBid: validCents(market.yes_bid) ? Number(market.yes_bid) : null,
    noBid: validCents(market.no_bid) ? Number(market.no_bid) : null,
    ask: side === "NO" ? Number(market.no_ask) : Number(market.yes_ask),
    bid: side === "NO" ? Number(market.no_bid) : Number(market.yes_bid),
    close_time: market.close_time,
    decision_time: decisionIso(market)
  };
}

function updateBitcoinArbWatch(next) {
  const watch = next ? { ...next, updatedAt: new Date().toISOString() } : null;
  if (activeScan) activeScan.bitcoinArbWatch = watch;
  latestSnapshot.bitcoinArbWatch = watch;
  publish("bitcoinArbWatch", watch);
}

function updateSpArbWatch(next) {
  const watch = next ? { ...next, updatedAt: new Date().toISOString() } : null;
  if (activeScan) activeScan.spArbWatch = watch;
  latestSnapshot.spArbWatch = watch;
  publish("spArbWatch", watch);
}

let lastSpStatusScanAt = 0;
function recordSpStatusScan(market, strikeCount, label = "S&P hourly") {
  const now = Date.now();
  if (now - lastSpStatusScanAt < 5_000) return;
  lastSpStatusScanAt = now;
  const row = {
    time: new Date().toISOString(),
    event: market?.subtitle || market?.event_ticker || "S&P hourly",
    market: market?.title || "S&P hourly reader",
    ticker: market?.ticker || market?.event_ticker || SP_HOURLY_SERIES,
    series_ticker: SP_HOURLY_SERIES,
    close_time: market?.close_time || decisionIso(market),
    decision_time: decisionIso(market),
    sides: [{
      side: "SP",
      decision: "monitor",
      entry: validCents(market?.yes_ask) ? market.yes_ask : null,
      target: null,
      ev: null,
      netProfit: null,
      volatility: null,
      touch: null,
      strategyType: "SP_HOURLY_MONITOR",
      reason: `${label}: ${strikeCount || 0} S&P hourly strikes visible; execution not enabled yet.`
    }]
  };
  latestSnapshot.gameScanLog.unshift(row);
  latestSnapshot.gameScanLog = latestSnapshot.gameScanLog.slice(0, 400);
  publish("gameScan", row);
}

function activeBitcoinCrossStrikeArbTrades() {
  return (paperState.trades || []).filter((trade) => {
    if (trade?.strategyType !== "BTC_CROSS_STRIKE_ARB_HOLD") return false;
    if (isCompletedBitcoinArbHold(trade)) return false;
    return ["OPEN", "SUBMITTING", "ENTRY_UNCONFIRMED", "ENTRY_NOT_FILLED"].includes(String(trade?.status || "").toUpperCase())
      || /ANCHOR|HEDGE|RETRY|SUBMITTING/.test(String(trade?.executionStatus || "").toUpperCase());
  });
}

function untrackedLiveBitcoinHourlyPositions() {
  return (paperState.livePortfolioPositions || []).filter((position) => {
    const ticker = String(position?.ticker || "").toUpperCase();
    if (!/^KXBTC/.test(ticker)) return false;
    if (position?.systemTracked) return false;
    const contracts = Math.abs(Number(position?.position || 0));
    const exposure = Number(position?.exposureDollars || 0);
    return contracts >= 1 || exposure > 0;
  });
}

async function maybeExecuteBitcoinCrossStrikeArb(candidate) {
  if (!candidate || candidate.mode !== "BTC_CROSS_STRIKE_ARB") return;
  if (paperState.entryInProgress || paperState.sportsArbInProgress || paperState.btcArbInProgress) return;
  const minutesLeft = Number(candidate.minutesLeft);
  if (!Number.isFinite(minutesLeft) || minutesLeft <= BTC_CROSS_STRIKE_ARB_MIN_MINUTES_LEFT) {
    updateBitcoinArbWatch({
      ...candidate,
      phase: "BLOCKED",
      reason: `BTC anchor submit blocked after first-half window: ${Number.isFinite(minutesLeft) ? `${round2(minutesLeft)} minutes` : "unknown time"} left. Existing anchors can continue ARB-leg retries only.`
    });
    return;
  }
  const untrackedBtcPositions = untrackedLiveBitcoinHourlyPositions();
  if (untrackedBtcPositions.length > 0) {
    const first = untrackedBtcPositions[0];
    updateBitcoinArbWatch({
      ...candidate,
      phase: "BLOCKED",
      reason: `BTC arb blocked: untracked live BTC position exists (${first.subtitle || first.ticker}). Manual override/reconcile before opening another anchor.`
    });
    return;
  }
  const exposureKey = `BTC_CROSS_ARB:${candidate.eventKey}:${candidate.higher?.ticker}:${candidate.lower?.ticker}`;
  if (hasActiveTradeExposure(exposureKey)) return;
  const firstPrice = Math.round(Number(candidate.higher?.noAsk));
  const plannedHedgePrice = Math.round(Number(candidate.hedgeTargetCents));
  if (!validCents(firstPrice) || !validCents(plannedHedgePrice)) return;
  const maxTrade = clampNumber(paperState.settings?.maxTradeDollars, 0, USER_MAX_TRADE_DOLLARS_LIMIT, 0);
  if (maxTrade <= 0) return;
  const firstFee = feePerContract(firstPrice, KALSHI_STANDARD_FEE_RATE, 1);
  const hedgeFee = feePerContract(plannedHedgePrice, KALSHI_STANDARD_FEE_RATE, 1);
  const contractsByLegBudget = Math.floor(maxTrade / Math.max(0.01, firstPrice / 100 + firstFee));
  const pairCost = firstPrice / 100 + firstFee + plannedHedgePrice / 100 + hedgeFee;
  const contractsByOpenBudget = Math.floor(remainingLiveSystemExposureBudget() / Math.max(0.01, pairCost));
  const contractsByCash = Math.floor(Math.max(0, Number(paperState.cash || 0)) / Math.max(0.01, pairCost));
  const contracts = Math.max(0, Math.min(PAPER_MAX_CONTRACTS, contractsByLegBudget, contractsByOpenBudget, contractsByCash));
  if (contracts < 1) {
    updateBitcoinArbWatch({ ...candidate, phase: "BLOCKED", reason: "BTC arb blocked: max dollars/cash cannot cover both legs." });
    return;
  }
  const reserved = round4(pairCost * contracts);
  if (!reserveLiveExposure(reserved, "btc cross-strike arb")) return;
  paperState.btcArbInProgress = true;
  paperState.executionState = "BTC_ARB_SUBMITTING";
  updateBitcoinArbWatch({ ...candidate, phase: "EXECUTING", reason: `Buying higher-strike NO first: ${contracts} @ ${firstPrice}c.` });
  publishPaper();
  const trades = [
    createBitcoinArbTrade(candidate, candidate.higher, contracts, exposureKey, firstPrice, "anchor"),
    createBitcoinArbTrade(candidate, candidate.lower, contracts, exposureKey, plannedHedgePrice, "hedge")
  ];
  paperState.trades.unshift(trades[0]);
  try {
    const anchorFill = await submitAndConfirmBtcArbLeg(candidate.higher, contracts, firstPrice);
    applyBitcoinArbFillToTrade(trades[0], anchorFill);
    if (trades[0].status !== "OPEN") return;
    trades[0].executionStatus = "ANCHOR_FILLED";
    const anchorFillPrice = validCents(trades[0].entryPriceCents) ? Number(trades[0].entryPriceCents) : firstPrice;
    const initialHedgePrice = bitcoinCrossStrikeRetryTargetCents(anchorFillPrice, candidate.expiresAt);
    if (!validCents(initialHedgePrice)) {
      safetyHalt(`BTC cross-strike hedge target invalid after anchor fill at ${round2(anchorFillPrice)}c.`);
      return;
    }
    trades[1].entryPriceCents = initialHedgePrice;
    trades[1].currentBuyPriceCents = initialHedgePrice;
    trades[1].entryFeePerContract = feePerContract(initialHedgePrice, KALSHI_STANDARD_FEE_RATE, contracts);
    trades[1].entryCost = round4(contracts * (initialHedgePrice / 100 + trades[1].entryFeePerContract));
    paperState.trades.unshift(trades[1]);
    let attempts = 0;
    while (trades[1].status !== "OPEN" && bitcoinArbExecutionEnabled(activeScan)) {
      attempts += 1;
      const retryPrice = bitcoinCrossStrikeRetryTargetCents(anchorFillPrice, candidate.expiresAt) || initialHedgePrice;
      const salvageMode = retryPrice > BTC_CROSS_STRIKE_ARB_HEDGE_TARGET_CENTS;
      const liveLower = await fetchAuthMarketQuote(candidate.lower.ticker).catch(() => null);
      const liveAnchor = await fetchAuthMarketQuote(candidate.higher.ticker).catch(() => null);
      const liveLowerYesAsk = liveLower && validCents(liveLower.yes_ask) ? Number(liveLower.yes_ask) : candidate.lower.yesAsk;
      const liveAnchorNoAsk = liveAnchor && validCents(liveAnchor.no_ask) ? Number(liveAnchor.no_ask) : null;
      const liveAnchorNoBid = liveAnchor && validCents(liveAnchor.no_bid) ? Number(liveAnchor.no_bid) : null;
      trades[0].retryAttempts = attempts;
      trades[0].currentExecutableAskCents = liveAnchorNoAsk;
      trades[0].currentExecutableBidCents = liveAnchorNoBid;
      trades[1].status = "SUBMITTING";
      trades[1].executionStatus = "HEDGE_RETRY";
      trades[1].closedAt = null;
      trades[1].retryAttempts = attempts;
      trades[1].retryPriceCents = retryPrice;
      trades[1].entryPriceCents = retryPrice;
      trades[1].currentBuyPriceCents = retryPrice;
      trades[1].currentExecutableAskCents = liveLowerYesAsk;
      trades[1].failureReason = `${salvageMode ? "Salvage" : "Retrying"} lower-strike YES at ${retryPrice}c; live ask ${validCents(liveLowerYesAsk) ? `${round2(liveLowerYesAsk)}c` : "-"}.`;
      updateBitcoinArbWatch({
        ...candidate,
        phase: "HEDGE_RETRY",
        higher: { ...candidate.higher, noAsk: liveAnchorNoAsk ?? anchorFillPrice, noBid: liveAnchorNoBid, ask: liveAnchorNoAsk ?? anchorFillPrice, bid: liveAnchorNoBid, fillPriceCents: anchorFillPrice },
        lower: { ...candidate.lower, yesAsk: liveLowerYesAsk, ask: liveLowerYesAsk },
        combinedNowCents: validCents(liveLowerYesAsk) ? round2(anchorFillPrice + liveLowerYesAsk) : candidate.combinedNowCents,
        hedgeTargetCents: retryPrice,
        recovery: {
          stage: "hedge",
          attempts,
          anchorFillPriceCents: anchorFillPrice,
          retryPriceCents: retryPrice,
          liveHedgeAskCents: liveLowerYesAsk,
          liveAnchorNoAskCents: liveAnchorNoAsk,
          liveAnchorNoBidCents: liveAnchorNoBid,
          salvageMode
        },
        reason: `Anchor filled at ${round2(anchorFillPrice)}c. ${salvageMode ? "Salvage mode" : "Retrying"} lower-strike YES at ${retryPrice}c until the cross-strike arb is paired.`
      });
      publishPaper();
      const fill = await submitAndConfirmBtcArbLeg(candidate.lower, contracts, retryPrice);
      applyBitcoinArbFillToTrade(trades[1], fill);
      if (fill?.status === "uncertain") {
        safetyHalt(`BTC cross-strike hedge confirmation uncertain for ${candidate.lower.ticker}. Manual review required.`);
        return;
      }
      if (trades[1].status !== "OPEN") {
        trades[1].status = "SUBMITTING";
        trades[1].executionStatus = "HEDGE_RETRY";
        trades[1].closedAt = null;
        trades[1].failureReason = fill?.reason || trades[1].failureReason || "IOC did not fill; retrying hedge.";
        trades[1].retryAttempts = attempts;
        publishPaper();
      }
      if (trades[1].status !== "OPEN") await sleep(BTC_CROSS_STRIKE_ARB_RETRY_MS);
    }
    if (trades.every((trade) => trade.status === "OPEN")) {
      for (const trade of trades) trade.executionStatus = "ARB_HELD_TO_EXPIRATION";
      updateBitcoinArbWatch({ ...candidate, phase: "PAIRED", reason: "BTC cross-strike arb paired; held to expiration." });
      paperLog(`BTC cross-strike arb paired: BUY NO ${candidate.higher.ticker} + BUY YES ${candidate.lower.ticker}, ${contracts} contract(s), target combo ${BTC_CROSS_STRIKE_ARB_MAX_COMBINED_CENTS}c.`);
    }
  } catch (error) {
    safetyHalt(`BTC cross-strike arb error: ${kalshiErrorDetail(error) || error.message}`);
  } finally {
    releaseLiveExposureReservation(reserved);
    paperState.btcArbInProgress = false;
    updatePaperAccount();
    publishPaper();
  }
}

function createBitcoinArbTrade(candidate, leg, contracts, exposureKey, entryPriceCents, role) {
  const side = String(leg.side || "YES").toUpperCase();
  const now = new Date().toISOString();
  return {
    id: cryptoRandomId(),
    ticker: leg.ticker,
    event_ticker: candidate.eventKey,
    series_ticker: "KXBTCD",
    marketTitle: `${leg.strikeLabel || leg.ticker} ${side}`,
    subtitle: "BTC cross-strike arb",
    recommendation: `BUY ${side}`,
    side,
    status: "SUBMITTING",
    executionStatus: role === "anchor" ? "ANCHOR_SUBMITTING" : "HEDGE_RETRY",
    contracts,
    entryPriceCents,
    currentBuyPriceCents: entryPriceCents,
    targetPriceCents: null,
    softStopPriceCents: null,
    hardStopPriceCents: null,
    targetLimitPriceCents: null,
    strategyType: "BTC_CROSS_STRIKE_ARB_HOLD",
    btcArbRole: role,
    arbCombinedTargetCents: BTC_CROSS_STRIKE_ARB_MAX_COMBINED_CENTS,
    arbHoldToExpiration: true,
    targetHidden: true,
    exposureKey,
    openedAt: now,
    decision_time: leg.decision_time || candidate.expiresAt,
    close_time: leg.close_time || candidate.expiresAt,
    entryFeePerContract: feePerContract(entryPriceCents, KALSHI_STANDARD_FEE_RATE, contracts),
    entryCost: round4(contracts * (entryPriceCents / 100 + feePerContract(entryPriceCents, KALSHI_STANDARD_FEE_RATE, contracts))),
    reasonSummary: role === "anchor" ? "BTC cross-strike anchor: higher-strike NO first." : "BTC cross-strike hedge: lower-strike YES retry."
  };
}

async function submitAndConfirmBtcArbLeg(leg, contracts, limitPriceCents) {
  const side = String(leg.side || "YES").toLowerCase();
  const order = {
    ticker: leg.ticker,
    action: "buy",
    side,
    count: contracts,
    type: "limit",
    client_order_id: `btc_xarb_${cryptoRandomId()}`,
    time_in_force: "immediate_or_cancel",
    cancel_order_on_pause: true
  };
  order[side === "no" ? "no_price" : "yes_price"] = clamp(Math.round(Number(limitPriceCents)), 1, 99);
  const placed = await placeKalshiOrder(order);
  const orderId = placed.order?.order_id || placed.order_id;
  return verifyIocOrderFillOrUnfilled(leg.ticker, orderId, contracts);
}

function bitcoinArbManualRetryEnabled() {
  return paperState.enabled
    && paperState?.settings?.enableBitcoinArb === true
    && !paperState.windingDown
    && !paperState.safetyHalted;
}

async function continueBitcoinArbAttemptsFromTrade(tradeId) {
  const all = activeBitcoinCrossStrikeArbTrades();
  const selected = all.find((trade) => trade.id === tradeId);
  if (!selected || selected.strategyType !== "BTC_CROSS_STRIKE_ARB_HOLD") return;
  const exposureKey = selected.exposureKey;
  const group = all.filter((trade) => trade.exposureKey === exposureKey);
  const anchor = group.find((trade) => String(trade.btcArbRole || "").toLowerCase() === "anchor");
  const arbLeg = group.find((trade) => String(trade.btcArbRole || "").toLowerCase() === "hedge") || selected;
  if (!anchor || anchor.status !== "OPEN" || !arbLeg || arbLeg.status === "OPEN") return;
  if (paperState.btcArbInProgress) return;
  const contracts = Math.max(1, Math.floor(Number(arbLeg.contracts || anchor.contracts || 0)));
  const anchorPrice = validCents(anchor.entryPriceCents) ? Number(anchor.entryPriceCents) : null;
  const fallbackRetryPrice = validCents(arbLeg.retryPriceCents) ? Number(arbLeg.retryPriceCents)
    : validCents(arbLeg.entryPriceCents) ? Number(arbLeg.entryPriceCents)
      : BTC_CROSS_STRIKE_ARB_HEDGE_TARGET_CENTS;
  const retryPrice = bitcoinCrossStrikeRetryTargetCents(anchorPrice, anchor.decision_time || anchor.close_time || arbLeg.decision_time || arbLeg.close_time) || fallbackRetryPrice;
  if (!validCents(retryPrice) || contracts < 1) return;
  const candidate = btcArbCandidateFromTrades(anchor, arbLeg, retryPrice, anchorPrice);
  paperState.btcArbInProgress = true;
  paperState.executionState = "BTC_ARB_RETRY";
  let attempts = Math.max(Number(anchor.retryAttempts || 0), Number(arbLeg.retryAttempts || 0), 0);
  try {
    while (arbLeg.status !== "OPEN" && bitcoinArbManualRetryEnabled()) {
      attempts += 1;
      const dynamicRetryPrice = bitcoinCrossStrikeRetryTargetCents(anchorPrice, candidate.expiresAt) || retryPrice;
      const salvageMode = dynamicRetryPrice > BTC_CROSS_STRIKE_ARB_HEDGE_TARGET_CENTS;
      const liveLeg = await fetchAuthMarketQuote(arbLeg.ticker).catch(() => null);
      const liveAnchor = await fetchAuthMarketQuote(anchor.ticker).catch(() => null);
      const liveAsk = liveLeg && validCents(liveLeg.yes_ask) ? Number(liveLeg.yes_ask) : arbLeg.currentExecutableAskCents;
      const liveAnchorNoAsk = liveAnchor && validCents(liveAnchor.no_ask) ? Number(liveAnchor.no_ask) : null;
      const liveAnchorNoBid = liveAnchor && validCents(liveAnchor.no_bid) ? Number(liveAnchor.no_bid) : null;
      anchor.retryAttempts = attempts;
      anchor.currentExecutableAskCents = liveAnchorNoAsk;
      anchor.currentExecutableBidCents = liveAnchorNoBid;
      arbLeg.status = "SUBMITTING";
      arbLeg.executionStatus = "HEDGE_RETRY";
      arbLeg.retryAttempts = attempts;
      arbLeg.retryPriceCents = dynamicRetryPrice;
      arbLeg.entryPriceCents = dynamicRetryPrice;
      arbLeg.currentBuyPriceCents = dynamicRetryPrice;
      arbLeg.currentExecutableAskCents = liveAsk;
      arbLeg.closedAt = null;
      arbLeg.failureReason = `Continue attempts: ${salvageMode ? "salvage " : ""}lower-strike YES IOC at ${dynamicRetryPrice}c; live ask ${validCents(liveAsk) ? `${round2(liveAsk)}c` : "-"}.`;
      updateBitcoinArbWatch({
        ...candidate,
        phase: "HEDGE_RETRY",
        higher: { ...candidate.higher, noAsk: liveAnchorNoAsk ?? anchorPrice, noBid: liveAnchorNoBid, ask: liveAnchorNoAsk ?? anchorPrice, bid: liveAnchorNoBid, fillPriceCents: anchorPrice },
        lower: { ...candidate.lower, yesAsk: liveAsk, ask: liveAsk },
        combinedNowCents: validCents(anchorPrice) && validCents(liveAsk) ? round2(anchorPrice + liveAsk) : candidate.combinedNowCents,
        hedgeTargetCents: dynamicRetryPrice,
        recovery: {
          stage: "continue",
          attempts,
          anchorFillPriceCents: anchorPrice,
          retryPriceCents: dynamicRetryPrice,
          liveHedgeAskCents: liveAsk,
          liveAnchorNoAskCents: liveAnchorNoAsk,
          liveAnchorNoBidCents: liveAnchorNoBid,
          salvageMode
        },
        reason: `Continue attempts running: ${salvageMode ? "salvage " : ""}retrying lower-strike YES at ${dynamicRetryPrice}c until paired.`
      });
      publishPaper();
      const fill = await submitAndConfirmBtcArbLeg({ ticker: arbLeg.ticker, side: arbLeg.side || "YES" }, contracts, dynamicRetryPrice);
      applyBitcoinArbFillToTrade(arbLeg, fill);
      if (fill?.status === "uncertain") {
        safetyHalt(`BTC cross-strike ARB leg confirmation uncertain for ${arbLeg.ticker}. Manual review required.`);
        return;
      }
      if (arbLeg.status === "OPEN") {
        anchor.executionStatus = "ARB_HELD_TO_EXPIRATION";
        arbLeg.executionStatus = "ARB_HELD_TO_EXPIRATION";
        updateBitcoinArbWatch({ ...candidate, phase: "PAIRED", reason: "BTC cross-strike arb paired by Continue Attempts; held to expiration." });
        paperLog(`BTC cross-strike continue attempts paired: ${anchor.ticker} + ${arbLeg.ticker}, ${contracts} contract(s).`);
        break;
      }
      arbLeg.status = "SUBMITTING";
      arbLeg.executionStatus = "HEDGE_RETRY";
      arbLeg.closedAt = null;
      arbLeg.retryAttempts = attempts;
      arbLeg.failureReason = fill?.reason || arbLeg.failureReason || "IOC did not fill; continuing attempts.";
      publishPaper();
      await sleep(BTC_CROSS_STRIKE_ARB_RETRY_MS);
    }
  } finally {
    paperState.btcArbInProgress = false;
    updatePaperAccount();
    publishPaper();
  }
}

function btcArbCandidateFromTrades(anchor, arbLeg, retryPrice, anchorPrice) {
  return {
    phase: "HEDGE_RETRY",
    mode: "BTC_CROSS_STRIKE_ARB",
    reason: "Manual continue attempts for existing BTC ARB anchor.",
    eventKey: anchor.event_ticker || anchor.series_ticker || anchor.exposureKey || "KXBTCD",
    expiresAt: anchor.decision_time || anchor.close_time || arbLeg.decision_time || arbLeg.close_time,
    combinedTargetCents: BTC_CROSS_STRIKE_ARB_MAX_COMBINED_CENTS,
    hedgeTargetCents: retryPrice,
    higher: {
      ticker: anchor.ticker,
      side: anchor.side || "NO",
      strikeLabel: anchor.marketTitle || anchor.ticker,
      noAsk: anchorPrice,
      ask: anchorPrice,
      fillPriceCents: anchorPrice
    },
    lower: {
      ticker: arbLeg.ticker,
      side: arbLeg.side || "YES",
      strikeLabel: arbLeg.marketTitle || arbLeg.ticker,
      yesAsk: arbLeg.currentExecutableAskCents,
      ask: arbLeg.currentExecutableAskCents
    }
  };
}

function recordBtcStatusScan(markets, reason) {
  const now = Date.now();
  if (now - lastBtcStatusScanAt < 5_000) return;
  lastBtcStatusScanAt = now;
  const currentEvent = latestBitcoinEventGroupByTime(markets || []);
  const sample = currentEvent[0] || (markets || [])[0] || {};
  const fallbackDecision = nextTopOfHourIso();
  const decision = decisionIso(sample) || fallbackDecision;
  const row = {
    time: new Date().toISOString(),
    event: sample.subtitle || sample.event_ticker || "Bitcoin",
    market: sample.title || "Bitcoin price reader",
    ticker: sample.ticker || sample.event_ticker || "KXBTCD",
    series_ticker: sample.series_ticker || "KXBTCD",
    close_time: sample.close_time || decision,
    decision_time: decision,
    btcTechnicalBias: null,
    bookWallSummary: sample.orderbook?.wallSummary || null,
    sides: [{
      side: "BTC",
      decision: "blocked",
      entry: null,
      target: null,
      ev: null,
      netProfit: null,
      volatility: null,
      touch: null,
      strategyType: "BTC_STATUS",
      reason
    }]
  };
  latestSnapshot.gameScanLog.unshift(row);
  latestSnapshot.gameScanLog = latestSnapshot.gameScanLog.slice(0, 400);
  publish("gameScan", row);
}

function logBitcoinHourlyBlackoutPause(scan, options = {}) {
  if (options.quiet) return;
  const now = Date.now();
  if (now - Number(scan?.lastBitcoinBlackoutAuditAt || 0) < 55_000) return;
  if (scan) scan.lastBitcoinBlackoutAuditAt = now;
  logAudit("warn", bitcoinHourlyBlackoutMessage());
}

function recordAssetStatusScan(asset, market = {}, count = 0, label = "") {
  const strike = assetStrike(asset, market);
  const row = {
    id: randomUUID(),
    ticker: market?.ticker || market?.event_ticker || asset?.series || "",
    title: label || `${asset.label} Scanning`,
    event: Number.isFinite(strike) ? `${asset.shortLabel} ${formatSpotDollars(strike)} or above` : `${asset.label} hourly`,
    series: asset?.series || "",
    category: "finance",
    market_type: asset?.marketType || "hourly",
    exchangeStatus: "scanned",
    volume: Number(market?.volume || 0),
    open_interest: Number(market?.open_interest || 0),
    close_time: decisionIso(market) || market?.close_time || "",
    decision_time: decisionIso(market) || market?.close_time || "",
    sides: [{
      side: asset.shortLabel,
      decision: "candidate",
      entry: Number(market?.yes_ask) || null,
      target: null,
      ev: null,
      netProfit: null,
      volatility: null,
      touch: null,
      strategyType: "SCAN_RECORDING",
      reason: asset?.noSpot
        ? `${asset.label} daily scan copied ${count} contract rows into its contract log.`
        : `${asset.label} hourly scan copied ${count} contract rows into its strike log and spot log.`
    }]
  };
  latestSnapshot.gameScanLog.unshift(row);
  latestSnapshot.gameScanLog = latestSnapshot.gameScanLog.slice(0, 400);
  publish("gameScan", row);
}

function bitcoinHourlyBlackoutMessage() {
  return "4:00 PM Eastern Time Bitcoin hourly pause: no 5:00 PM hourly contract exists. Scanning and recording are paused until 5:00 PM Eastern Time, then resume for the 6:00 PM hourly.";
}

const lastMissingSpotRecordWarningAt = new Map();
const spotPriceCache = new Map();

async function bitcoinSpotPriceForRecording(signal = null) {
  return assetSpotPriceForRecording(SCAN_ASSETS.bitcoin, signal);
}

async function assetSpotPriceForRecording(asset, signal = null) {
  const cached = spotPriceCache.get(asset.key);
  if (cached && Date.now() - cached.at < 1_500 && Number.isFinite(cached.price)) return cached;
  const source = assetSpotSource(asset);
  const url = String(source.url || "").trim();
  if (!url) return null;
  const parsed = new URL(url);
  if (!/(\.|^)kalshi\.com$/i.test(parsed.hostname)) {
    throw new Error(`${asset.label} spot URL must be an approved Kalshi endpoint.`);
  }
  const headers = { accept: "application/json" };
  if (source.apiKey) headers.authorization = `Bearer ${source.apiKey}`;
  const response = await fetch(url, { headers, signal });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { value: extractSpotPriceFromText(text, asset) };
  }
  if (!response.ok) throw new Error(`${asset.label} price source failed: ${response.status}`);
  const price = extractSpotPrice(data, source.index || asset.spotIndex, asset);
  if (!Number.isFinite(price)) throw new Error(`Kalshi ${asset.label} spot source did not return a usable ${asset.label} price.`);
  const cachedValue = {
    price,
    roundedPrice: Math.round(price),
    source: `Kalshi public ${asset.label} spot`,
    at: Date.now()
  };
  spotPriceCache.set(asset.key, cachedValue);
  return cachedValue;
}

function assetSpotSource(asset) {
  return liveConfig.spotSources?.[asset.key] || {
    url: asset.key === "bitcoin" ? liveConfig.btcPriceUrl : "",
    apiKey: asset.key === "bitcoin" ? liveConfig.btcPriceApiKey : "",
    index: asset.key === "bitcoin" ? liveConfig.btcPriceIndex : asset.spotIndex
  };
}

function warnMissingBtcSpotRecord() {
  warnMissingSpotRecord(SCAN_ASSETS.bitcoin);
}

function warnMissingSpotRecord(asset) {
  const now = Date.now();
  const last = Number(lastMissingSpotRecordWarningAt.get(asset.key) || 0);
  if (now - last < 60_000) return;
  lastMissingSpotRecordWarningAt.set(asset.key, now);
  logAudit("warn", `${asset.label} recording blocked: actual ${asset.label} spot price is not connected, so strike rows were not saved.`);
}

function warnKalshiImpliedSpotFallback(asset) {
  const now = Date.now();
  const key = `${asset.key}:implied`;
  const last = Number(lastMissingSpotRecordWarningAt.get(key) || 0);
  if (now - last < 60_000) return;
  lastMissingSpotRecordWarningAt.set(key, now);
  logAudit("warn", `${asset.label} spot URL is not configured. Recording will use a Kalshi-only implied spot proxy from the hourly strike ladder.`);
}

async function persistBitcoinHourlySample(markets = []) {
  if (isBitcoinHourlyBlackoutNow()) return;
  return persistAssetHourlySample(SCAN_ASSETS.bitcoin, markets);
}

async function persistAssetHourlySample(asset, markets = []) {
  if (asset.key === "bitcoin" && isBitcoinHourlyBlackoutNow()) return;
  const spot = await assetSpotPriceForRecording(asset) || kalshiImpliedSpotForRecording(asset, markets);
  if (!Number.isFinite(spot?.price)) {
    warnMissingSpotRecord(asset);
    return;
  }
  const timestamp = new Date();
  const rows = activeAssetHourlyStrikeRows(asset, markets, timestamp, spot);
  const contractEndTime = decisionIso(markets[0] || {}) || markets[0]?.close_time || "";
  const decision = Date.parse(rows[0]?.contract_end_time || contractEndTime);
  if (!Number.isFinite(decision)) return;
  const hour = easternHour(new Date(decision));
  if (asset.key === "bitcoin" && hour === "17") return;
  const date = easternDate(new Date(decision));
  await persistAssetSpotLine(asset, spot, timestamp, date, hour);
  if (rows.length) await persistAssetContractLines(asset, rows, date, hour);
  return { contractRows: rows.length, spotWritten: true };
}

async function persistWeatherDailySample(markets = []) {
  const timestamp = new Date();
  const rows = activeWeatherDailyStrikeRows(markets, timestamp);
  const contractEndTime = decisionIso(markets[0] || {}) || markets[0]?.close_time || "";
  const decision = Date.parse(rows[0]?.contract_end_time || contractEndTime);
  if (!Number.isFinite(decision)) return;
  const date = easternDate(new Date(decision));
  if (rows.length) await persistAssetDailyContractLines(SCAN_ASSETS.weather, rows, date);
  return { contractRows: rows.length, spotWritten: false };
}

async function persistBitcoinSpotLine(btcSpot, timestamp, date, hour) {
  await persistAssetSpotLine(SCAN_ASSETS.bitcoin, btcSpot, timestamp, date, hour);
}

async function persistAssetSpotLine(asset, spot, timestamp, date, hour) {
  const dir = path.join(assetRecordingPath(asset, "spot"), date);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${asset.fileSlug}-spot-${hour}00-et.txt`);
  const source = spot?.source ? ` - SOURCE ${spot.source}` : "";
  const line = `${asset.shortLabel} SPOT PRICE - $${formatSpotDollars(spot.price)}${source} - ${timestamp.toISOString()}\n`;
  await fs.appendFile(file, line, "utf8");
}

async function persistBitcoinContractLines(rows, date, hour) {
  await persistAssetContractLines(SCAN_ASSETS.bitcoin, rows, date, hour);
}

async function persistAssetContractLines(asset, rows, date, hour) {
  const dir = path.join(assetRecordingPath(asset, "strike"), date);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${asset.fileSlug}-hourly-${hour}00-et.txt`);
  const body = rows.map((row) => {
    const expiry = formatContractExpiry(row.contract_end_time);
    const strike = formatAssetStrikeText(asset, row.strike);
    return `${asset.contractLabel} (${expiry}) - ${strike} - YES ABOVE ${centsText(row.yes_ask)} - ${row.timestamp}`;
  }).join("\n");
  if (body) await fs.appendFile(file, `${body}\n`, "utf8");
}

function formatAssetStrikeText(asset, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const formatted = formatSpotDollars(number);
  return asset?.key === "weather" ? formatted : `$${formatted}`;
}

async function persistAssetDailyContractLines(asset, rows, date) {
  const dir = path.join(assetRecordingPath(asset, "strike"), date);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${asset.fileSlug}-daily-${date}.txt`);
  const body = rows.map((row) => {
    const expiry = formatContractExpiry(row.contract_end_time);
    const strike = formatAssetStrikeText(asset, row.strike);
    const contract = asset.noSpot && row.ticker ? `${asset.contractLabel} ${row.ticker}` : asset.contractLabel;
    if (asset.key === "weather") {
      return `${contract} (${expiry}) - ${row.yes_label || strike} - YES ${centsText(row.yes_ask)} - ${row.timestamp}`;
    }
    return `${contract} (${expiry}) - ${strike} - YES ABOVE ${centsText(row.yes_ask)} - ${row.timestamp}`;
  }).join("\n");
  if (body) await fs.appendFile(file, `${body}\n`, "utf8");
}

function activeBitcoinHourlyStrikeRows(markets, timestamp = new Date(), btcSpot = null) {
  return activeAssetHourlyStrikeRows(SCAN_ASSETS.bitcoin, markets, timestamp, btcSpot);
}

function activeWeatherDailyStrikeRows(markets, timestamp = new Date()) {
  const contractEndTime = decisionIso(markets[0] || {}) || markets[0]?.close_time || "";
  return (markets || [])
    .filter((market) => isWeatherDailyMarket(market))
    .map((market) => ({
      timestamp: timestamp.toISOString(),
      contract_end_time: decisionIso(market) || market.close_time || contractEndTime,
      event_ticker: market.event_ticker || "",
      ticker: market.ticker || "",
      strike: assetStrike(SCAN_ASSETS.weather, market),
      yes_label: weatherYesLabel(market),
      yes_ask: dollarsDecimal(market.yes_ask_dollars ?? market.yes_ask),
      yes_bid: dollarsDecimal(market.yes_bid_dollars ?? market.yes_bid)
    }))
    .filter((row) => Number.isFinite(Number(row.strike)))
    .filter((row) => isUsefulStrikeAsk(row.yes_ask))
    .sort((a, b) => a.strike - b.strike);
}

function kalshiImpliedSpotForRecording(asset, markets = []) {
  const price = inferKalshiImpliedSpot(asset, markets);
  if (!Number.isFinite(price)) return null;
  return {
    price,
    roundedPrice: Math.round(price),
    source: "Kalshi implied proxy from hourly strike ladder",
    at: Date.now()
  };
}

function inferKalshiImpliedSpot(asset, markets = []) {
  const points = (markets || [])
    .map((market) => ({
      strike: assetStrike(asset, market),
      probability: marketYesProbabilityCents(market)
    }))
    .filter((point) => Number.isFinite(point.strike) && Number.isFinite(point.probability))
    .sort((a, b) => a.strike - b.strike);
  if (!points.length) return NaN;
  let below = null;
  let above = null;
  for (const point of points) {
    if (point.probability >= 50) below = point;
    if (point.probability <= 50 && !above) above = point;
  }
  if (below && above && below !== above && below.probability !== above.probability) {
    const distance = (50 - below.probability) / (above.probability - below.probability);
    return below.strike + (above.strike - below.strike) * distance;
  }
  const closest = points.slice().sort((a, b) => Math.abs(a.probability - 50) - Math.abs(b.probability - 50))[0];
  return closest?.strike ?? NaN;
}

function marketYesProbabilityCents(market = {}) {
  const yesBid = Number(market.yes_bid);
  const yesAsk = Number(market.yes_ask);
  const noBid = Number(market.no_bid);
  const noAsk = Number(market.no_ask);
  const lastPrice = Number(market.last_price);
  if (validCents(yesBid) && validCents(yesAsk)) return (yesBid + yesAsk) / 2;
  if (validCents(yesAsk) && validCents(noAsk)) return (yesAsk + (100 - noAsk)) / 2;
  if (validCents(yesBid) && validCents(noBid)) return (yesBid + (100 - noBid)) / 2;
  if (validCents(yesAsk)) return yesAsk;
  if (validCents(yesBid)) return yesBid;
  if (validCents(noAsk)) return 100 - noAsk;
  if (validCents(noBid)) return 100 - noBid;
  if (validCents(lastPrice)) return lastPrice;
  return NaN;
}

async function latestAssetRecordingPreview(asset) {
  const spotFile = asset.noSpot ? "" : await latestFileInTree(assetRecordingPath(asset, "spot"));
  const strikeFile = await latestFileInTree(assetRecordingPath(asset, "strike"));
  const spotLines = spotFile ? await tailTextLines(spotFile, 24) : [];
  const strikeLines = strikeFile ? await tailTextLines(strikeFile, asset.noSpot ? 260 : 60) : [];
  return {
    asset: asset.key,
    spotFile,
    strikeFile,
    spotRows: spotLines.map(parseSpotRecordingLine).filter(Boolean).slice(-12).reverse(),
    strikeRows: latestUniqueStrikeSnapshot(strikeLines.map(parseContractRecordingLine).filter(Boolean), asset)
  };
}

function latestUniqueStrikeSnapshot(rows, asset) {
  if (!rows.length) return [];
  if (asset?.key === "weather") {
    const byTicker = new Map();
    for (const row of rows.slice(-240)) {
      const key = row.ticker || `${row.contract}:${row.strike}`;
      byTicker.set(key, row);
    }
    return [...byTicker.values()]
      .sort((a, b) => (a.city || a.ticker || "").localeCompare(b.city || b.ticker || "") || a.strike - b.strike);
  }
  const latestTimestamp = rows[rows.length - 1]?.timestamp || "";
  const latestRows = rows.filter((row) => row.timestamp === latestTimestamp);
  const source = latestRows.length ? latestRows : rows.slice(-20);
  const byStrike = new Map();
  for (const row of source) {
    if (!Number.isFinite(row.strike)) continue;
    byStrike.set(row.strike, row);
  }
  const sorted = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  if (sorted.length <= 5) return sorted;
  const spot = inferSpotFromStrikeRows(sorted);
  if (!Number.isFinite(spot)) return sorted.slice(0, 5);
  const step = asset?.key === "bitcoin" ? BTC_HOURLY_STRIKE_STEP_DOLLARS : inferStrikeStepFromRows(sorted, asset?.strikeStep || 1);
  const targets = centeredStrikeTargets(spot, step, 5);
  const byTarget = new Map(sorted.map((row) => [row.strike, row]));
  return targets.map((strike) => byTarget.get(strike)).filter(Boolean);
}

function centeredStrikeTargets(anchor, step, count = 5) {
  const safeStep = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 1;
  const center = Math.round(Number(anchor) / safeStep) * safeStep;
  const half = Math.floor(count / 2);
  return Array.from({ length: count }, (_unused, index) => center + (index - half) * safeStep);
}

function inferStrikeStepFromRows(rows, fallback = 1) {
  const strikes = [...new Set((rows || []).map((row) => Number(row.strike)).filter(Number.isFinite))].sort((a, b) => a - b);
  const gaps = [];
  for (let index = 1; index < strikes.length; index += 1) {
    const gap = Math.abs(strikes[index] - strikes[index - 1]);
    if (gap > 0) gaps.push(gap);
  }
  if (!gaps.length) return fallback;
  gaps.sort((a, b) => a - b);
  return gaps[0] || fallback;
}

function inferSpotFromStrikeRows(rows) {
  let below = null;
  let above = null;
  for (const row of rows) {
    const probability = Number(String(row.yesAsk || "").replace(/c/i, ""));
    if (!Number.isFinite(probability)) continue;
    if (probability >= 50) below = { strike: row.strike, probability };
    if (probability <= 50 && !above) above = { strike: row.strike, probability };
  }
  if (below && above && below !== above && below.probability !== above.probability) {
    const distance = (50 - below.probability) / (above.probability - below.probability);
    return below.strike + (above.strike - below.strike) * distance;
  }
  return rows.slice().sort((a, b) => {
    const aProb = Number(String(a.yesAsk || "").replace(/c/i, ""));
    const bProb = Number(String(b.yesAsk || "").replace(/c/i, ""));
    return Math.abs(aProb - 50) - Math.abs(bProb - 50);
  })[0]?.strike;
}

async function latestFileInTree(root) {
  const files = await filesInTree(root).catch(() => []);
  if (!files.length) return "";
  const stats = await Promise.all(files.map(async (file) => {
    const stat = await fs.stat(file).catch(() => null);
    return stat?.isFile() ? { file, mtimeMs: stat.mtimeMs } : null;
  }));
  return stats.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file || "";
}

async function filesInTree(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesInTree(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function tailTextLines(file, limit = 20) {
  const raw = await fs.readFile(file, "utf8").catch(() => "");
  return raw.split(/\r?\n/).filter(Boolean).slice(-limit);
}

function parseSpotRecordingLine(line) {
  const match = String(line || "").match(/^(.+?) SPOT PRICE - \$([0-9,.]+)(?: - SOURCE (.*?))? - (.+)$/);
  if (!match) return null;
  return {
    asset: match[1],
    price: Number(match[2].replace(/,/g, "")),
    priceText: `$${match[2]}`,
    source: match[3] || "",
    timestamp: match[4],
    raw: line
  };
}

function parseContractRecordingLine(line) {
  const weatherMatch = String(line || "").match(/^(.+?) \((.*?)\) - (.+?) - YES (?!ABOVE\b)(.+?) - (\d{4}-\d{2}-\d{2}T.+)$/);
  if (weatherMatch && /^WEATHER DAILY\b/i.test(weatherMatch[1])) {
    const ticker = extractTickerFromContractLabel(weatherMatch[1]);
    const strike = weatherStrikeValueFromTicker(ticker) ?? Number(String(weatherMatch[3]).replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0]);
    return {
      contract: weatherMatch[1],
      ticker,
      city: weatherCityFromTicker(ticker),
      expiry: weatherMatch[2],
      strike,
      strikeText: weatherStrikeLabelFromTicker(ticker) || weatherMatch[3].trim(),
      yesLabel: weatherMatch[3].trim(),
      yesAsk: weatherMatch[4].trim(),
      noAsk: "",
      timestamp: weatherMatch[5],
      raw: line
    };
  }
  const oldMatch = String(line || "").match(/^(.+?) \((.*?)\) - (\$?)([0-9,.]+) - YES ABOVE ([^|]+?) \| NO ABOVE (.+?) - (\d{4}-\d{2}-\d{2}T.+)$/);
  if (oldMatch) {
    const prefix = oldMatch[3] || "";
    const ticker = extractTickerFromContractLabel(oldMatch[1]);
    return {
      contract: oldMatch[1],
      ticker,
      city: weatherCityFromTicker(ticker),
      expiry: oldMatch[2],
      strike: Number(oldMatch[4].replace(/,/g, "")),
      strikeText: weatherStrikeLabelFromTicker(ticker) || `${prefix}${oldMatch[4]}`,
      yesLabel: "",
      yesAsk: oldMatch[5].trim(),
      noAsk: oldMatch[6].trim(),
      timestamp: oldMatch[7],
      raw: line
    };
  }
  const yesOnlyMatch = String(line || "").match(/^(.+?) \((.*?)\) - (\$?)([0-9,.]+) - YES ABOVE ([^|]+?) - (\d{4}-\d{2}-\d{2}T.+)$/);
  if (!yesOnlyMatch) return null;
  const prefix = yesOnlyMatch[3] || "";
  const ticker = extractTickerFromContractLabel(yesOnlyMatch[1]);
  return {
    contract: yesOnlyMatch[1],
    ticker,
    city: weatherCityFromTicker(ticker),
    expiry: yesOnlyMatch[2],
    strike: Number(yesOnlyMatch[4].replace(/,/g, "")),
    strikeText: weatherStrikeLabelFromTicker(ticker) || `${prefix}${yesOnlyMatch[4]}`,
    yesLabel: "",
    yesAsk: yesOnlyMatch[5].trim(),
    noAsk: "",
    timestamp: yesOnlyMatch[6],
    raw: line
  };
}

function extractTickerFromContractLabel(label = "") {
  return String(label || "").match(/\bKX[A-Z0-9.-]+\b/i)?.[0]?.toUpperCase() || "";
}

function weatherCityFromTicker(ticker = "") {
  const text = String(ticker || "").toUpperCase();
  const map = [
    ["TATL", "Atlanta"],
    ["TBOS", "Boston"],
    ["TDAL", "Dallas"],
    ["TDC", "Washington DC"],
    ["THOU", "Houston"],
    ["TLV", "Las Vegas"],
    ["TMIN", "Minneapolis"],
    ["TNOLA", "New Orleans"],
    ["TOKC", "Oklahoma City"],
    ["TPHX", "Phoenix"],
    ["TSATX", "San Antonio"],
    ["TSEA", "Seattle"],
    ["TSFO", "San Francisco"],
    ["NY", "New York"],
    ["CHI", "Chicago"],
    ["MIA", "Miami"],
    ["LAX", "Los Angeles"],
    ["DEN", "Denver"],
    ["AUS", "Austin"],
    ["PHIL", "Philadelphia"],
    ["BOS", "Boston"],
    ["SEA", "Seattle"],
    ["SF", "San Francisco"],
    ["HOU", "Houston"],
    ["DAL", "Dallas"],
    ["ATL", "Atlanta"],
    ["DC", "Washington DC"],
    ["LV", "Las Vegas"],
    ["LAS", "Las Vegas"],
    ["PHX", "Phoenix"],
    ["MSP", "Minneapolis"],
    ["MIN", "Minneapolis"],
    ["MSY", "New Orleans"],
    ["OKC", "Oklahoma City"],
    ["SAT", "San Antonio"]
  ];
  for (const [code, city] of map) {
    if (new RegExp(`(?:HIGH|LOW|RAIN|SNOW)${code}\\b`).test(text)) return city;
  }
  return "";
}

function weatherStrikeLabelFromTicker(ticker = "") {
  const match = String(ticker || "").toUpperCase().match(/-([BT]\d+(?:\.\d+)?)$/);
  return match?.[1] || "";
}

function weatherStrikeValueFromTicker(ticker = "") {
  const match = String(ticker || "").toUpperCase().match(/-[BT](\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function weatherYesLabel(market = {}) {
  const explicit = cleanWeatherLabel(market.yes_sub_title || market.yes_title || market.yes_label);
  if (explicit) return explicit;
  const tickerLabel = weatherStrikeLabelFromTicker(market.ticker);
  return tickerLabel || "YES";
}

function cleanWeatherLabel(value = "") {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\?$/, "")
    .trim();
  if (!text || /^yes$/i.test(text)) return "";
  return text;
}

function activeAssetHourlyStrikeRows(asset, markets, timestamp = new Date(), spot = null) {
  const spotPrice = Number(spot?.price);
  if (!Number.isFinite(spotPrice)) return [];
  const contractEndTime = decisionIso(markets[0] || {}) || markets[0]?.close_time || "";
  const strikeStep = inferAssetStrikeStep(asset, markets);
  return (markets || [])
    .filter((market) => asset.key === "bitcoin" ? isBitcoinHourlyRecordRow(market) : isAssetHourlyMarket(asset, market))
    .map((market) => ({
      timestamp: timestamp.toISOString(),
      contract_end_time: decisionIso(market) || market.close_time || contractEndTime,
      event_ticker: market.event_ticker || "",
      spot_price: Math.round(spotPrice),
      spot_price_source: spot.source || `${asset.label} spot`,
      ticker: market.ticker || "",
      strike: assetStrike(asset, market),
      yes_ask: dollarsDecimal(market.yes_ask_dollars ?? market.yes_ask),
      no_ask: dollarsDecimal(market.no_ask_dollars ?? market.no_ask),
      yes_bid: dollarsDecimal(market.yes_bid_dollars ?? market.yes_bid),
      no_bid: dollarsDecimal(market.no_bid_dollars ?? market.no_bid)
    }))
    .filter((row) => Number.isFinite(Number(row.strike)))
    .filter((row) => Math.abs(Number(row.strike) - spotPrice) <= strikeStep * 8)
    .filter((row) => isUsefulStrikeAsk(row.yes_ask))
    .sort((a, b) => a.strike - b.strike);
}

function assetRecordingPath(asset, type) {
  return path.join(RECORDS_DIR, asset.recordingFolder, type === "spot" ? asset.spotFolder : asset.strikeFolder);
}

function selectedRecordingAssets(settings = {}) {
  return [SCAN_ASSETS.weather].filter((asset) => settings[asset.settingsKey] === true);
}

function isAssetHourlyMarket(asset, market = {}) {
  if (!asset) return false;
  if (asset.key === "bitcoin") {
    return isBitcoinHourlyEntryWindowMarket(market)
      && isCryptoMarket(market)
      && isBitcoinHourlyContract(`${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase(), market)
      && bitcoinAboveContract(market)
      && validBitcoinHourlyStrike(market);
  }
  if (asset.key === "sp") return isSpHourlyMarket(market);
  const series = String(market.series_ticker || market.event_ticker || market.ticker || "").toUpperCase();
  if (!series.includes(String(asset.series || "").toUpperCase())) return false;
  const text = `${market.event_ticker || ""} ${market.ticker || ""} ${market.title || ""} ${market.subtitle || ""}`.toUpperCase();
  return /\bH\d{4}\b|HOURLY|HOUR/i.test(text) && Number.isFinite(assetStrike(asset, market));
}

function latestAssetHourlyEventGroup(markets = []) {
  return latestSpHourlyEventGroup(markets);
}

function bestAssetHourlyStrike(markets = []) {
  return bestSpHourlyStrike(markets);
}

function assetStrike(asset, market = {}) {
  if (asset?.key === "bitcoin") return bitcoinStrike(market);
  if (asset?.key === "sp") return spStrike(market);
  if (asset?.key === "weather") {
    const weatherTickerMatch = String(market.ticker || "").toUpperCase().match(/-[BT](\d+(?:\.\d+)?)$/);
    if (weatherTickerMatch) return Number(weatherTickerMatch[1]);
  }
  const tickerMatch = String(market.ticker || "").replace(/,/g, "").match(/-T(\d+(?:\.\d+)?)/i);
  if (tickerMatch) return Number(tickerMatch[1]);
  const text = `${market.subtitle || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""} ${market.title || ""}`.replace(/,/g, "");
  const labelMatch = text.match(/\$?\s*(\d+(?:\.\d+)?)/);
  return labelMatch ? Number(labelMatch[1]) : NaN;
}

function inferAssetStrikeStep(asset, markets = []) {
  if (asset?.key === "bitcoin") return BTC_HOURLY_STRIKE_STEP_DOLLARS;
  const strikes = [...new Set((markets || []).map((market) => assetStrike(asset, market)).filter(Number.isFinite))]
    .sort((a, b) => a - b);
  const gaps = [];
  for (let index = 1; index < strikes.length; index += 1) {
    const gap = Math.abs(strikes[index] - strikes[index - 1]);
    if (gap > 0) gaps.push(gap);
  }
  if (!gaps.length) return asset?.strikeStep || 1;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || asset?.strikeStep || 1;
}

function formatSpotDollars(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 1000) return Math.round(number).toLocaleString();
  return number.toLocaleString("en-US", { maximumFractionDigits: 2 });
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
  return extractSpotPrice(data, index, SCAN_ASSETS.bitcoin);
}

function extractSpotPrice(data, index = "", asset = null) {
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
  return extractSpotPriceFromText(JSON.stringify(data), asset);
}

function extractBtcPriceFromText(text) {
  return extractSpotPriceFromText(text, SCAN_ASSETS.bitcoin);
}

function extractSpotPriceFromText(text, asset = null) {
  if (asset?.key !== "bitcoin") {
    const generic = String(text || "").match(/\$?\s*(\d{1,5}(?:,\d{3})*(?:\.\d+)?)/);
    if (!generic) return null;
    const value = Number(generic[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }
  const match = String(text || "").match(/\$?\s*(\d{2,3},\d{3}(?:\.\d+)?|\d{5,6}(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function isActiveAsk(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0.02 && number <= 0.98;
}

function isUsefulStrikeAsk(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0.01 && number < 0.99;
}

function dollarsDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const decimal = number > 1 ? number / 100 : number;
  return decimal.toFixed(2);
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

function isBitcoinHourlyRecordRow(row) {
  const text = `${row.series_ticker || ""} ${row.event || ""} ${row.ticker || ""}`.toUpperCase();
  if (!text.includes("KXBTCD")) return false;
  if (!isBitcoinHourlyContract(text, row)) return false;
  return validBitcoinHourlyStrike(row);
}

function nextTopOfHourIso() {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(date.getUTCHours() + 1);
  return date.toISOString();
}

function scannedSideSummary(scored) {
  const btcScrape = scored.strategyType === "BTC_TECHNICAL_FALLBACK";
  return {
    side: scored.side,
    decision: scored.qualifies ? "candidate" : "blocked",
    entry: scored.currentBuyPriceCents,
    target: scored.sellTargetCents || scored.minTargetFor10PctCents || null,
    ev: btcScrape ? null : scored.evRoiPct,
    netProfit: scored.netProfitPct,
    volatility: btcScrape || scored.chopScore == null ? null : round2(scored.chopScore * 100),
    touch: btcScrape || scored.adjustedTouchProbability == null ? null : round2(scored.adjustedTouchProbability * 100),
    range: round2(scored.rangeCents),
    recentAmplitude: round2(scored.recentAmplitudeCents),
    turns: scored.directionChanges,
    recentTurns: scored.recentDirectionChanges,
    recentSamples: scored.recentSampleCount,
    spread: round2(scored.spreadCents),
    volume: scored.volume,
    volume_24h: scored.volume_24h,
    openInterest: scored.open_interest,
    liquidity: scored.liquidity,
    strategyType: scored.strategyType,
    bookWallSummary: scored.bookWallSummary || null,
    reason: scanBlockReason(scored)
  };
}

function scanBlockReason(scored) {
  if (scored.qualifies) return scored.strategyType === "BTC_TECHNICAL_FALLBACK" ? "ready" : "qualifies";
  if (scored.reasonSummary) return scored.reasonSummary;
  if (scored.strategyType === "BTC_TECHNICAL_FALLBACK" || isCryptoResult(scored)) return "blocked by Bitcoin scraper gate";
  if (scored.tennisPauseWarning) return "blocked by tennis pause/stale-match safety";
  if (scored.sportsLatePhaseWarning) return scored.sportsLatePhaseReason || "blocked by late-game sports safety";
  if (scored.bitcoinTrendWarning) return "blocked by BTC trend safety";
  if (scored.stabilityWarning) return "recent price action has stabilized";
  return "blocked by EV/profit/volatility filters";
}

function markPaperTradeFromResult(result) {
  const trade = activeSystemTrades().find((row) => result && row.ticker === result.ticker && row.side === result.side);
  if (!trade) return;
  if (validCents(result.currentBidCents)) {
    trade.currentBidCents = round2(result.currentBidCents);
    trade.lastCheckedAt = new Date().toISOString();
    trade.lastMarkSource = "scan";
    if (trade.currentBidCents > trade.softStopPriceCents) {
      trade.softStopConfirmations = 0;
    }
    updatePaperAccount();
    publishPaper();
  }
}

function btcEntryBandGate(result, entryCents) {
  if (!isCryptoResult(result)) return { ok: true };
  if (!validCents(entryCents)) return { ok: false, reason: "invalid BTC entry price." };
  if (isLateLockBitcoinMarket(result)) {
    const minLate = BTC_LATE_LOCK_ENTRY_MIN_CENTS;
    const maxLate = BTC_LATE_LOCK_MAX_ENTRY_CENTS;
    if (entryCents >= minLate && entryCents <= maxLate) return { ok: true };
    return {
      ok: false,
      reason: `BTC late-lock entry ${round2(entryCents)}c outside ${minLate}-${maxLate}c final-window band.`
    };
  }
  if (entryCents >= BTC_RESEARCH_MIN_ENTRY_CENTS && entryCents <= BTC_RESEARCH_MAX_NORMAL_ENTRY_CENTS) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `BTC normal scalp entry ${round2(entryCents)}c outside ${BTC_RESEARCH_MIN_ENTRY_CENTS}-${BTC_RESEARCH_MAX_NORMAL_ENTRY_CENTS}c chop band.`
  };
}

async function executeQueuedTradeSignal(result) {
  const technicalBtcTrade = isBtcExecutionStrategy(result?.strategyType);
  const bestSportsChopTrade = isSportsExecutionStrategy(result?.strategyType);
  if (!result.qualifies || (!technicalBtcTrade && !bestSportsChopTrade && result.evPerContract <= 0)) return;
  if (bestSportsChopTrade) {
    paperLog(`Skipped ${result.ticker}: legacy sports scrape execution is disabled.`);
    return;
  }
  if (technicalBtcTrade) {
    paperLog(`Skipped ${result.ticker}: legacy Bitcoin scrape execution is disabled. Use Bitcoin Arb for cross-strike execution.`);
    return;
  }
  if (paperState.safetyHalted) {
    paperLog(`Skipped ${result.ticker}: SAFETY HALT active - ${paperState.safetyHaltReason || "manual/account reconciliation required"}.`);
    return;
  }
  if (!paperState.enabled) {
    paperLog(`Signal only ${result.ticker}: trader is not started.`);
    return;
  }
  if (paperState.windingDown) {
    paperLog(`Skipped ${result.ticker}: trader is winding down.`);
    return;
  }
  if (paperState.entryInProgress) {
    paperLog(`Skipped ${result.ticker}: another entry is already being submitted.`);
    return;
  }
  const exposureKey = liveExposureKey(result);
  clearExpiredExposureCooldowns();
  if (hasLiveExposure(exposureKey)) {
    paperLog(`Skipped ${result.ticker}: already have live exposure for ${exposureKey}.`);
    return;
  }
  if (liveConfig.liveTradingEnabled) {
    const existingPosition = await getLiveTickerPosition(result.ticker).catch((error) => {
      paperLog(`Skipped live entry for ${result.ticker}: position check failed before entry (${error.message}).`);
      return { position: 0, raw: { unavailable: true, reason: error.message } };
    });
    if (existingPosition?.raw?.unavailable) {
      paperLog(`Skipped ${result.ticker}: live position status is unavailable, so the app will not risk a duplicate or opposite-side entry.`);
      return;
    }
    const existingExposure = Number(existingPosition?.exposureDollars || 0);
    const existingRestingOrders = Number(existingPosition?.restingOrdersCount || existingPosition?.raw?.resting_orders_count || 0);
    if (existingPosition && (Math.abs(existingPosition.position) > 0 || existingExposure > 0 || existingRestingOrders > 0)) {
      paperLog(`Skipped ${result.ticker}: live Kalshi position/order already exists on this exact ticker (${existingPosition.position || 0} contracts, $${round2(existingExposure)} exposure, ${existingRestingOrders} resting orders). Blocking duplicate/opposite-side entry.`);
      return;
    }
  }
  const cooldown = exposureCooldownRemaining(exposureKey);
  if (cooldown > 0) {
    paperLog(`Skipped ${result.ticker}: ${exposureKey} is cooling down for ${Math.ceil(cooldown / 1000)}s after the last exit.`);
    return;
  }
  paperState.entryInProgress = true;
  paperState.entryInProgressKey = exposureKey;
  paperState.executionState = "ENTRY_SUBMITTING";
  paperState.executionUpdatedAt = new Date().toISOString();
  publishPaper();
  let reservedEntryCost = 0;
  let reservationHeld = false;
  try {
    if (!liveConfig.configured) {
      paperLog("Skipped live entry: Kalshi credentials are not configured.");
      return;
    }
    paperLog(result.strategyType === "BTC_TECHNICAL_FALLBACK"
      ? `BTC scrape entry attempt ${result.recommendation} ${result.ticker}: ${result.currentBuyPriceCents}c -> ${result.sellTargetCents}c.`
      : `Entry attempt ${result.recommendation} ${result.ticker}: ${result.currentBuyPriceCents}c -> ${result.sellTargetCents}c, EV ${formatPct(result.evRoiPct)}.`);
    if (liveConfig.liveTradingEnabled) {
      await refreshLiveAccountFromKalshi().catch((error) => paperLog(`Balance refresh before entry failed: ${error.message}`));
    } else if (!paperState.cash || paperState.cash <= 0) {
      await refreshLiveAccountFromKalshi().catch((error) => paperLog(`Dry-run balance refresh failed; using last known cash: ${error.message}`));
    }
    if (hasActiveTradeExposure(exposureKey)) {
      paperLog(`Skipped ${result.ticker}: already have an active tracked trade for ${exposureKey}.`);
      return;
    }
    if (liveConfig.liveTradingEnabled && await blocksLiveSystemExposure(result, 0)) {
      return;
    }
    const quotedEntry = result.currentBuyPriceCents;
    if (!validCents(quotedEntry)) return;
    const entry = liveEntryLimitPriceCents(result, quotedEntry);
    if (!validCents(entry)) return;
    const btcBand = btcEntryBandGate(result, entry);
    if (!btcBand.ok) {
      paperLog(`Skipped ${result.ticker}: ${btcBand.reason}`);
      return;
    }
    if (entry !== Math.round(Number(quotedEntry))) {
      paperLog(`BTC IOC entry cushion for ${result.ticker}: quote ${round2(quotedEntry)}c, live limit ${entry}c.`);
    }
    const pricedResult = entry === quotedEntry ? result : { ...result, currentBuyPriceCents: entry };
    const stops = computePaperStops(entry, result.sellTargetCents, result.stopPriceCents);
    const contracts = choosePaperContracts(pricedResult, stops);
    if (contracts < 1) {
      if (liveEntryBudgetDollars() <= 0) {
        paperLog(`Skipped ${result.ticker}: max dollars per trade is $0. Set Max $ per trade before starting if you want live entries.`);
      } else if (remainingLiveSystemExposureBudget() <= 0) {
        paperLog(`Skipped ${result.ticker}: max open system positions is full at $${liveSystemExposureCapDollars().toFixed(2)}.`);
      } else {
        paperLog(`Skipped ${result.ticker}: size would exceed cash/risk caps for cash $${paperState.cash.toFixed(2)} and account $${paperState.equity.toFixed(2)}.`);
      }
      return;
    }
    const buyFee = feePerContract(entry, KALSHI_STANDARD_FEE_RATE, contracts);
    const entryCost = contracts * (entry / 100 + buyFee);
    const maxEntryBudget = liveEntryBudgetDollars();
    if (liveConfig.liveTradingEnabled && await blocksLiveSystemExposure(result, entryCost)) {
      return;
    }
    if (entryCost > maxEntryBudget) {
      paperLog(`Skipped ${result.ticker}: entry $${entryCost.toFixed(2)} exceeds live budget $${maxEntryBudget.toFixed(2)}.`);
      return;
    }
    if (entryCost > paperState.cash) {
      paperLog(`Skipped ${result.ticker}: cash $${paperState.cash.toFixed(2)} cannot cover $${entryCost.toFixed(2)} entry.`);
      return;
    }
  const targetLimitPriceCents = executableTargetLimitCents(result);
  const targetFee = feePerContract(targetLimitPriceCents, KALSHI_STANDARD_FEE_RATE, contracts);
  if (!reserveLiveExposure(entryCost, result.ticker)) {
    return;
  }
  reservedEntryCost = entryCost;
  reservationHeld = true;
  const trade = {
    id: cryptoRandomId(),
    status: "SUBMITTING",
    openedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    exposureKey,
    contracts,
    side: result.side,
    recommendation: result.recommendation,
    ticker: result.ticker,
    event_ticker: result.event_ticker,
    series_ticker: result.series_ticker,
    category: result.category,
    marketTitle: result.marketTitle,
    subtitle: result.subtitle,
    selectionLabel: result.selectionLabel,
    close_time: result.close_time,
    expiration_time: result.expiration_time,
    expected_expiration_time: result.expected_expiration_time,
    occurrence_datetime: result.occurrence_datetime,
    bitcoinContractType: result.bitcoinContractType,
    strategyType: result.strategyType,
    lastBookLadderSignal: result.bookLadderSignal || null,
    url: result.url,
    entryPriceCents: entry,
    targetPriceCents: result.sellTargetCents,
    targetLimitPriceCents,
    priceBand: result.priceBand || null,
    softStopPriceCents: stops.softStopPriceCents,
    hardStopPriceCents: stops.hardStopPriceCents,
    originalSoftStopPriceCents: stops.softStopPriceCents,
    originalHardStopPriceCents: stops.hardStopPriceCents,
    profitLockArmed: false,
    entryFeePerContract: buyFee,
    exitFeePerContract: targetFee,
    entryCost: round4(entryCost),
    reservedEntryCost: round4(entryCost),
    expectedTargetProceeds: round4(contracts * (targetLimitPriceCents / 100 - targetFee)),
    evRoiPct: result.evRoiPct,
    netProfitPct: result.netProfitPct,
    recentTouchRate: result.recentTouchRate,
    currentBidCents: result.currentBidCents,
    openValue: 0,
    unrealizedPnl: 0,
    softStopConfirmations: 0,
    maxRiskDollars: round4(Math.max(0.5, paperState.equity * PAPER_MAX_RISK_FRACTION)),
    plannedStopLoss: round4(entryCost - paperExitProceeds({ contracts }, stops.hardStopPriceCents)),
    lastMarkSource: "entry",
    checks: []
  };
  rememberBtcSideLatch(result, { direction: result.bitcoinTrendDirection });
  paperState.trades.unshift(trade);
  if (isCryptoResult(result)) setExposureCooldown(exposureKey);
  syncActiveTradePointer();
  publishPaper();
  const entryExecution = await submitLiveEntryUntilFilled(trade, result, contracts, entry);
  const buyOrder = entryExecution.buyOrder || {};
  releaseLiveExposureReservation(reservedEntryCost);
  reservationHeld = false;
  paperState.executionState = "ENTRY_VERIFYING";
  paperState.executionUpdatedAt = new Date().toISOString();
  publishPaper();
  trade.entryOrderId = buyOrder.order?.order_id || buyOrder.order_id || trade.entryOrderId;
  trade.entryClientOrderId = buyOrder.order?.client_order_id || buyOrder.client_order_id || trade.entryClientOrderId;
  trade.dryRun = Boolean(buyOrder.dryRun);
  let filledContracts = entryExecution.filledContracts;
  if (entryExecution.uncertain) {
    trade.status = "ENTRY_UNCONFIRMED";
    trade.closedAt = new Date().toISOString();
    trade.failureReason = trade.entryConfirmationReason || "IOC entry confirmation uncertain.";
    syncActiveTradePointer();
    publishPaper();
    return;
  }
  if (liveConfig.liveTradingEnabled && filledContracts <= 0 && buyOrder) {
    filledContracts = await verifyLiveEntryFill(trade, buyOrder, contracts);
  }
  if (liveConfig.liveTradingEnabled && filledContracts <= 0) {
    filledContracts = await reconcileLiveEntryPosition(trade, contracts);
  }
  if (liveConfig.liveTradingEnabled && filledContracts <= 0) {
    trade.status = "ENTRY_NOT_FILLED";
    trade.closedAt = new Date().toISOString();
    trade.failureReason = `Entry IOC did not fill after ${entryExecution.attempts || 1} attempts.`;
    paperLog(`LIVE BUY ${trade.side} ${trade.ticker}: entry IOC did not fill after ${entryExecution.attempts || 1} attempts; no target order needed.`);
    syncActiveTradePointer();
    publishPaper();
    return;
  }
  if (filledContracts > 0 && filledContracts < contracts) {
    resizeTradeContracts(trade, filledContracts);
    paperLog(`LIVE BUY ${trade.side} ${trade.ticker}: partial entry fill ${filledContracts}/${contracts}; target will arm for filled size only.`);
  }
  if (LIVE_HIDE_TARGET_ORDERS) {
    trade.targetHidden = true;
    trade.targetPending = false;
    trade.targetOrderId = null;
    trade.targetClientOrderId = null;
    paperLog(`Target for ${trade.ticker} is hidden from Kalshi; app will send an IOC exit only after ${trade.targetPriceCents}c is touched.`);
  } else {
    paperState.executionState = "TARGET_ARMING";
    paperState.executionUpdatedAt = new Date().toISOString();
    publishPaper();
    const targetOrder = await armLiveTargetOrder(trade, { attempts: LIVE_TARGET_ARM_RETRIES, delayMs: LIVE_TARGET_ARM_RETRY_MS });
    if (!targetOrder && liveConfig.liveTradingEnabled) {
      safetyHalt(`Target sell failed to arm after live entry on ${trade.ticker}. Trading stopped for manual verification.`);
      paperLog(`Target sell could not be armed for ${trade.ticker}; fail-closed exit is being sent now.`);
      await emergencyCloseTrade(trade, "TARGET_ARM_FAILED", "target sell could not be armed after entry");
      updatePaperAccount();
      publishPaper();
      return;
    }
  }
  if (!liveConfig.liveTradingEnabled) paperState.cash = round4(paperState.cash - entryCost);
  trade.status = "OPEN";
  paperState.executionState = "POSITION_OPEN";
  paperState.executionUpdatedAt = new Date().toISOString();
  const targetNote = trade.targetLimitPriceCents !== trade.targetPriceCents
    ? `strategy target ${trade.targetPriceCents}c, executable limit ${trade.targetLimitPriceCents}c`
    : `target sell ${trade.targetPriceCents}c`;
    paperLog(`${liveConfig.liveTradingEnabled ? "LIVE" : "DRY-RUN"} BUY ${trade.side} ${trade.ticker}: ${contracts} @ ${entry}c IOC entry; ${targetNote} ${LIVE_HIDE_TARGET_ORDERS ? "hidden/internal - no resting target order" : "submitted"}; actual size ${contracts} contract${contracts === 1 ? "" : "s"} after cash/risk caps; confirmed stop ${trade.softStopPriceCents}c x${PAPER_SOFT_STOP_CONFIRMATIONS}, hard stop ${trade.hardStopPriceCents}c.`);
  updatePaperAccount();
  startPaperMonitor();
  publishPaper();
  } catch (error) {
    const active = activeSystemTrades().find((row) => row.exposureKey === exposureKey);
    if (active?.exposureKey === exposureKey && active.status === "SUBMITTING") {
      active.status = "ENTRY_FAILED";
      active.closedAt = new Date().toISOString();
      active.failureReason = error.message;
      if (liveConfig.liveTradingEnabled && active.entryOrderId) {
        safetyHalt(`Live entry threw after order submission on ${active.ticker}: ${error.message}`);
      }
      syncActiveTradePointer();
    }
    throw error;
  } finally {
    if (reservationHeld) releaseLiveExposureReservation(reservedEntryCost);
    paperState.entryInProgress = false;
    paperState.entryInProgressKey = null;
  }
}

function liveExposureKey(result) {
  if (isMatchupWinnerResult(result)) {
    return `MATCHUP:${result.event_ticker || normalizeMatchupText(result.subtitle || result.marketTitle || result.ticker)}`;
  }
  if (isCryptoResult(result)) {
    return btcHourlyExposureKey(result);
  }
  return `MARKET:${result.ticker}`;
}

function btcHourlyExposureKey(result) {
  if (isCryptoResult(result)) return "BTC_ACTIVE";
  const eventKey = result.decision_time
    || result.occurrence_datetime
    || result.expected_expiration_time
    || result.close_time
    || result.event_ticker
    || result.ticker;
  if (isBitcoinHourlyContract(`${result.ticker || ""} ${result.event_ticker || ""} ${result.series_ticker || ""} ${result.marketTitle || ""}`, result)) {
    return `BTC_HOURLY:${eventKey}`;
  }
  return `BTC:${eventKey}`;
}

function isMatchupWinnerResult(result) {
  const text = `${result.category || ""} ${result.series_ticker || ""} ${result.event_ticker || ""} ${result.marketTitle || ""} ${result.subtitle || ""}`.toLowerCase();
  if (!text.includes("sports")) return false;
  if (isCryptoResult(result)) return false;
  if (/\b(will .+ win| vs | v\. | versus |match winner|moneyline)\b/.test(text)) return true;
  return /^kx(itfwmatch|atpmatch|wtamatch|mlbgame|mlsgame|nbagame|wnbagame|nflgame|nhlgame)/i.test(`${result.series_ticker || ""}${result.ticker || ""}`);
}

function isCryptoResult(result) {
  return /\b(crypto|bitcoin|btc|kxbtc)\b/i.test(`${result.category || ""} ${result.series_ticker || ""} ${result.event_ticker || ""} ${result.ticker || ""} ${result.marketTitle || ""}`);
}

function normalizeMatchupText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasLiveExposure(exposureKey) {
  if (!exposureKey) return false;
  if (paperState.entryInProgressKey === exposureKey) return true;
  return hasActiveTradeExposure(exposureKey);
}

function hasActiveTradeExposure(exposureKey) {
  if (!exposureKey) return false;
  return (paperState.trades || []).some((trade) => {
    if (!["SUBMITTING", "OPEN"].includes(trade.status)) return false;
    return trade.exposureKey === exposureKey || canonicalTradeExposureKey(trade) === exposureKey;
  });
}

function activeSystemTrades() {
  return (paperState.trades || []).filter((trade) => ["SUBMITTING", "OPEN"].includes(trade.status));
}

function activeExecutorBlockingTrades() {
  return activeSystemTrades().filter((trade) => !isCompletedSportsArbHold(trade) && !isCompletedBitcoinArbHold(trade));
}

function isCompletedSportsArbHold(trade) {
  return trade?.strategyType === "SPORTS_PAIR_ARB_HOLD"
    && trade.status === "OPEN"
    && trade.executionStatus === "ARB_HELD_TO_EXPIRATION";
}

function isCompletedBitcoinArbHold(trade) {
  return trade?.strategyType === "BTC_CROSS_STRIKE_ARB_HOLD"
    && trade.status === "OPEN"
    && trade.executionStatus === "ARB_HELD_TO_EXPIRATION";
}

function isCompletedArbHold(trade) {
  return isCompletedSportsArbHold(trade) || isCompletedBitcoinArbHold(trade);
}

function tradeDecisionTimeMs(trade) {
  const raw = trade?.decision_time || trade?.close_time || trade?.expected_expiration_time || trade?.expiration_time;
  const ms = Date.parse(raw || "");
  return Number.isFinite(ms) ? ms : null;
}

function tradeIsPastDecision(trade, graceMs = 45_000) {
  const decisionMs = tradeDecisionTimeMs(trade);
  return Number.isFinite(decisionMs) && Date.now() >= decisionMs + graceMs;
}

function canonicalTradeExposureKey(trade) {
  if (!trade || !isCryptoResult(trade)) return trade?.exposureKey || "";
  return btcHourlyExposureKey({
    ticker: trade.ticker,
    event_ticker: trade.event_ticker,
    series_ticker: trade.series_ticker,
    marketTitle: trade.marketTitle,
    occurrence_datetime: trade.occurrence_datetime,
    decision_time: trade.decision_time,
    expected_expiration_time: trade.expected_expiration_time,
    close_time: trade.close_time,
    category: trade.category
  });
}

function hasActiveBitcoinTrade() {
  return activeSystemTrades().some((trade) => {
    if (isCompletedBitcoinArbHold(trade)) return false;
    const series = String(trade.series_ticker || "");
    const ticker = String(trade.ticker || "");
    return trade.exposureKey === "BTC_ACTIVE" || /^BTC_HOURLY:/.test(String(trade.exposureKey || "")) || trade.exposureKey === "BTC_TECHNICAL_MICRO_SCALP" || isBitcoinSeries(series) || /^KXBTC/i.test(ticker);
  });
}

function safetyHalt(reason) {
  paperState.enabled = false;
  paperState.windingDown = true;
  paperState.safetyHalted = true;
  paperState.safetyHaltReason = reason;
  paperState.stoppedAt = new Date().toISOString();
  if (activeScan?.running) {
    activeScan.abortController.abort();
    activeScan.stopRequested = true;
  }
  paperLog(`SAFETY HALT: ${reason}`);
  logAudit("fatal", `SAFETY HALT: ${reason}`);
  publishPaper();
}

function isBitcoinExposureKey(exposureKey) {
  const key = String(exposureKey || "");
  return key === "BTC_ACTIVE" || key === "BTC_TECHNICAL_MICRO_SCALP" || key.startsWith("BTC_HOURLY:") || key.startsWith("BTC:");
}

function syncActiveTradePointer() {
  paperState.activeTrade = activeExecutorBlockingTrades()[0] || null;
}

async function submitLiveBuyOrder(result, contracts, entryCents) {
  const side = result.side.toLowerCase();
  const limitPrice = liveEntryLimitPriceCents(result, entryCents);
  const order = {
    ticker: result.ticker,
    action: "buy",
    side,
    count: contracts,
    type: "limit",
    client_order_id: `live_entry_${cryptoRandomId()}`,
    time_in_force: "immediate_or_cancel",
    cancel_order_on_pause: true
  };
  order[side === "yes" ? "yes_price" : "no_price"] = limitPrice;
  return placeKalshiOrder(order);
}

function liveEntryLimitPriceCents(result, entryCents) {
  if (!validCents(Number(entryCents))) return null;
  const entry = clamp(Math.round(Number(entryCents)), 1, 99);
  return entry;
}

function extractFilledContracts(response, requestedContracts) {
  const order = response?.order || response || {};
  const direct = orderFieldNumber(order, ["fill_count", "fill_count_fp", "filled_count", "filled_count_fp", "filled_quantity", "matched_count"]);
  if (Number.isFinite(direct)) return Math.max(0, Math.floor(direct));
  const status = String(order.status || order.state || "").toLowerCase();
  if (/\b(canceled|cancelled|rejected|expired)\b/.test(status)) return 0;
  if (response?.dryRun) return Math.max(0, Math.floor(Number(requestedContracts || 0)));
  return 0;
}

function orderFieldNumber(order, keys) {
  for (const key of keys) {
    if (order?.[key] == null || order[key] === "") continue;
    const value = Number(order[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

async function verifyLiveEntryFill(trade, buyOrder, requestedContracts) {
  const orderId = buyOrder?.order?.order_id || buyOrder?.order_id || trade.entryOrderId;
  if (!orderId) return 0;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await sleep(300);
    try {
      const checked = await getKalshiOrder(orderId);
      const filled = extractFilledContracts(checked, requestedContracts);
      if (filled > 0) {
        paperLog(`Entry fill verified from Kalshi order for ${trade.ticker}: ${filled}/${requestedContracts} contracts filled.`);
        return filled;
      }
    } catch (error) {
      paperLog(`Entry fill order check ${attempt}/8 failed for ${trade.ticker}: ${error.message}.`);
    }
    const reconciled = await reconcileLiveEntryPosition(trade, requestedContracts, { haltOnError: false }).catch(() => 0);
    if (reconciled > 0) {
      paperLog(`Entry fill verified from Kalshi position for ${trade.ticker}: ${reconciled}/${requestedContracts} contracts live.`);
      return reconciled;
    }
  }
  return 0;
}

async function reconcileLiveEntryPosition(trade, requestedContracts, { haltOnError = true } = {}) {
  await refreshLiveTruth().catch(() => {});
  const reconciled = await getLiveTickerPosition(trade.ticker).catch((error) => {
    if (haltOnError) safetyHalt(`Position reconciliation failed after entry for ${trade.ticker}: ${error.message}`);
    return null;
  });
  if (reconciled && Math.abs(reconciled.position) > 0) {
    const filled = Math.min(requestedContracts, Math.abs(Math.floor(reconciled.position)));
    paperLog(`Entry fill reconciled from live position for ${trade.ticker}: ${filled}/${requestedContracts} contracts.`);
    return filled;
  }
  const cachedOrders = liveTruth.ordersByTicker.get(String(trade.ticker || "").toUpperCase()) || [];
  if (cachedOrders.length) {
    trade.entryOpenOrderCount = cachedOrders.length;
    return 0;
  }
  return 0;
}

async function submitLiveEntryUntilFilled(trade, result, contracts, entryCents) {
  if (!liveConfig.liveTradingEnabled) {
    const buyOrder = await submitLiveBuyOrder(result, contracts, entryCents);
    return { buyOrder, filledContracts: contracts, attempts: 1 };
  }
  const attempts = isBtcExecutionStrategy(result?.strategyType) || isSportsExecutionStrategy(result?.strategyType)
    ? LIVE_ENTRY_IOC_RETRIES
    : 1;
  let lastOrder = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    paperState.executionState = attempt > 1 ? "ENTRY_RETRYING" : "ENTRY_SUBMITTING";
    paperState.executionUpdatedAt = new Date().toISOString();
    if (attempt > 1) {
      paperLog(`Entry IOC retry ${attempt}/${attempts} for ${trade.ticker}: ${contracts} @ ${entryCents}c.`);
    }
    publishPaper();
    const buyOrder = await submitLiveBuyOrder(result, contracts, entryCents);
    lastOrder = buyOrder;
    trade.entryOrderId = buyOrder.order?.order_id || buyOrder.order_id || trade.entryOrderId;
    trade.entryClientOrderId = buyOrder.order?.client_order_id || buyOrder.client_order_id || trade.entryClientOrderId;
    trade.entryAttempts = attempt;
    trade.dryRun = Boolean(buyOrder.dryRun);
    const orderId = buyOrder.order?.order_id || buyOrder.order_id || trade.entryOrderId;
    const verification = await verifyIocOrderFillOrUnfilled(trade.ticker, orderId, contracts);
    let filledContracts = verification.filledContracts || 0;
    trade.entryConfirmationStatus = verification.status;
    trade.entryConfirmationReason = verification.reason || "";
    if (filledContracts > 0) {
      paperLog(`Entry IOC confirmed filled for ${trade.ticker}: ${filledContracts}/${contracts} contracts.`);
      return { buyOrder, filledContracts, attempts: attempt };
    }
    if (verification.status === "uncertain") {
      trade.entryConfirmationUncertain = true;
      safetyHalt(`Entry confirmation uncertain for ${trade.ticker}: ${verification.reason || "Kalshi did not confirm filled or unfilled within the confirmation window"}. No further entries will be submitted.`);
      return { buyOrder, filledContracts: 0, attempts: attempt, uncertain: true };
    }
    if (attempt < attempts) await sleep(LIVE_ENTRY_IOC_RETRY_MS);
  }
  return { buyOrder: lastOrder, filledContracts: 0, attempts };
}

async function verifyIocOrderFillOrUnfilled(ticker, orderId, requestedContracts, { timeoutMs = ENTRY_CONFIRMATION_MAX_MS } = {}) {
  if (!liveConfig.liveTradingEnabled) {
    return { status: "filled", filledContracts: Math.max(0, Math.floor(Number(requestedContracts || 0))), reason: "live trading disabled" };
  }
  const start = Date.now();
  let lastStatus = "";
  let lastRemaining = null;
  let lastError = "";
  while (Date.now() - start <= timeoutMs) {
    await sleep(300);
    try {
      const checked = orderId ? await getKalshiOrder(orderId) : null;
      if (checked) {
        const filled = extractFilledContracts(checked, requestedContracts);
        if (filled > 0) return { status: "filled", filledContracts: filled, fillPriceCents: extractFillPriceCents(checked), reason: "order fill count" };
        const order = checked.order || checked || {};
        lastStatus = orderStatusText(order);
        lastRemaining = orderFieldNumber(order, ["remaining_count", "remaining_count_fp", "unfilled_count", "count"]);
        if (orderIsTerminalUnfilled(order)) {
          return { status: "unfilled", filledContracts: 0, reason: `terminal order status ${lastStatus || "unknown"}` };
        }
      }
    } catch (error) {
      lastError = kalshiErrorDetail(error) || error.message;
    }
    const livePosition = await getLiveTickerPosition(ticker).catch(() => null);
    if (livePosition && Math.abs(Number(livePosition.position || 0)) > 0) {
      const filled = Math.min(Math.max(1, Math.floor(Number(requestedContracts || 1))), Math.abs(Math.floor(Number(livePosition.position || 0))));
      return { status: "filled", filledContracts: filled, reason: "position reconciliation" };
    }
  }
  const reason = [
    lastStatus ? `last order status ${lastStatus}` : "",
    Number.isFinite(lastRemaining) ? `remaining ${lastRemaining}` : "",
    lastError ? `last error ${lastError}` : ""
  ].filter(Boolean).join("; ") || "no filled/unfilled confirmation";
  return { status: "uncertain", filledContracts: 0, reason };
}

function orderStatusText(order) {
  return String(order?.status || order?.state || order?.order_status || "").toLowerCase();
}

function extractFillPriceCents(response) {
  const order = response?.order || response || {};
  const value = orderFieldNumber(order, [
    "avg_fill_price",
    "average_fill_price",
    "average_price",
    "fill_price",
    "filled_avg_price",
    "executed_price",
    "price"
  ]);
  if (!Number.isFinite(value)) return null;
  return value <= 1 ? clamp(round2(value * 100), 1, 99) : clamp(round2(value), 1, 99);
}

function orderIsTerminalUnfilled(order) {
  const filled = extractFilledContracts(order, order?.count || 0);
  if (filled > 0) return false;
  const status = orderStatusText(order);
  if (/\b(rejected|expired|failed)\b/.test(status)) return true;
  if (/\b(canceled|cancelled)\b/.test(status)) return true;
  const remaining = orderFieldNumber(order, ["remaining_count", "remaining_count_fp"]);
  const count = orderFieldNumber(order, ["count", "count_fp", "requested_count"]);
  if (/\b(executed|filled|closed)\b/.test(status) && Number(remaining) >= Number(count || 0)) return true;
  return false;
}

function resizeTradeContracts(trade, contracts) {
  const nextContracts = Math.max(1, Math.floor(Number(contracts || 0)));
  trade.contracts = nextContracts;
  trade.entryCost = round4(nextContracts * (trade.entryPriceCents / 100 + trade.entryFeePerContract));
  const targetLimit = executableTradeTargetLimitCents(trade);
  trade.exitFeePerContract = feePerContract(targetLimit, KALSHI_STANDARD_FEE_RATE, nextContracts);
  trade.expectedTargetProceeds = round4(nextContracts * (targetLimit / 100 - trade.exitFeePerContract));
  trade.plannedStopLoss = round4(trade.entryCost - paperExitProceeds({ contracts: nextContracts }, trade.hardStopPriceCents));
}

function executableTargetLimitCents(result) {
  const explicit = Number(result?.targetLimitPriceCents ?? result?.sellTargetLimitCents);
  if (Number.isFinite(explicit)) return clamp(Math.round(explicit), 1, 99);
  const target = Number(result?.sellTargetCents);
  if (!Number.isFinite(target)) return target;
  if (isBtcExecutionStrategy(result?.strategyType)) {
    return clamp(Math.round(target), 1, 99);
  }
  return clamp(Math.round(target), 1, 99);
}

function executableTradeTargetLimitCents(trade) {
  const stored = Number(trade?.targetLimitPriceCents);
  if (Number.isFinite(stored)) return clamp(Math.round(stored), 1, 99);
  const target = Number(trade?.targetPriceCents);
  if (!Number.isFinite(target)) return target;
  if (isBtcExecutionStrategy(trade?.strategyType)) {
    return clamp(Math.round(target), 1, 99);
  }
  return clamp(Math.round(target), 1, 99);
}

async function submitLiveTargetOrder(trade) {
  if (LIVE_HIDE_TARGET_ORDERS) {
    throw new Error("Hidden-target mode is enabled; resting target orders are disabled.");
  }
  return placeKalshiEventExitOrder(trade, executableTradeTargetLimitCents(trade), {
    clientPrefix: "live_target",
    timeInForce: "good_till_canceled"
  });
}

async function armLiveTargetOrder(trade, { attempts = 1, delayMs = 0 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const targetOrder = await submitLiveTargetOrder(trade);
      trade.targetOrderId = targetOrder.order?.order_id || targetOrder.order_id;
      trade.targetClientOrderId = targetOrder.order?.client_order_id || targetOrder.client_order_id;
      trade.targetPending = false;
      trade.targetError = null;
      if (attempt > 1) {
        paperLog(`Target sell armed for ${trade.ticker} after ${attempt} attempts at ${executableTradeTargetLimitCents(trade)}c.`);
      }
      return targetOrder;
    } catch (error) {
      lastError = error;
      trade.targetPending = true;
      trade.targetError = kalshiErrorDetail(error);
      if (attempt < attempts && delayMs > 0) await sleep(delayMs);
    }
  }
  paperLog(`Target sell not accepted yet for ${trade.ticker}: ${kalshiErrorDetail(lastError) || "unknown error"}. Fast arming failed; monitor will keep retrying.`);
  return null;
}

async function submitLiveStopOrder(trade, exitPriceCents) {
  if (trade.targetOrderId && !trade.targetCancelledAt) {
    const canceledTargetOrderId = trade.targetOrderId;
    try {
      await cancelKalshiOrder(trade.targetOrderId);
      paperLog(`Canceled target order ${trade.targetOrderId} before stop exit.`);
    } catch (error) {
      const detail = kalshiErrorDetail(error) || error.message;
      const alreadyDone = /not found|404|already|cancel/i.test(detail);
      if (!alreadyDone) throw error;
      paperLog(`Target order ${trade.targetOrderId} was already gone before stop exit: ${detail}`);
    }
    trade.targetCancelledAt = new Date().toISOString();
    trade.cancelledTargetOrderId = canceledTargetOrderId;
    trade.targetOrderId = null;
    trade.targetClientOrderId = null;
  }
  const response = await placeKalshiEventExitOrder(trade, exitPriceCents, {
    clientPrefix: "live_stop",
    timeInForce: "immediate_or_cancel"
  });
  trade.stopOrderId = response.order?.order_id || response.order_id;
  trade.stopClientOrderId = response.order?.client_order_id || response.client_order_id;
  return response;
}

async function placeKalshiEventExitOrder(trade, exitPriceCents, { clientPrefix, timeInForce }) {
  const priceCents = clamp(Math.round(Number(exitPriceCents)), 1, 99);
  const entrySide = String(trade.side || "").toLowerCase();
  const immediateOrCancel = String(timeInForce || "").toLowerCase() === "immediate_or_cancel";
  const order = {
    ticker: trade.ticker,
    action: "sell",
    side: entrySide,
    client_order_id: `${clientPrefix}_${cryptoRandomId()}`,
    count: Math.max(1, Math.floor(Number(trade.contracts || 0))),
    type: "limit",
    time_in_force: timeInForce,
    cancel_order_on_pause: true
  };
  if (immediateOrCancel) order.reduce_only = true;
  order[entrySide === "yes" ? "yes_price" : "no_price"] = priceCents;
  return placeKalshiOrder(order);
}

function kalshiErrorDetail(error) {
  if (!error) return "";
  const status = error.status ? `status ${error.status}: ` : "";
  const body = error.body ? ` ${JSON.stringify(error.body).slice(0, 500)}` : "";
  return `${status}${error.message || "Kalshi request failed"}${body}`;
}

async function emergencyCloseTrade(trade, reason, note) {
  if (isCompletedSportsArbHold(trade)) {
    paperLog(`Skipped emergency close for locked sports-arb leg ${trade.ticker}; completed arbitrages are manual-only.`);
    return;
  }
  const mark = await refreshPaperTradeMark(trade, { allowNetwork: true }).catch(() => trade.currentBidCents || trade.entryPriceCents);
  const emergencyPrice = 1;
  const response = await submitLiveStopOrder(trade, emergencyPrice);
  trade.emergencyOrderSent = true;
  if (!response) throw new Error(`Emergency exit order did not return an order for ${trade.ticker}`);
  await closePaperTrade(trade, mark, reason, `${note}; immediate-or-cancel reduce-only exit sent at ${emergencyPrice}c`);
}

function choosePaperContracts(result, stops) {
  const requested = Number.isFinite(Number(result.recommendedContracts)) && Number(result.recommendedContracts) > 0
    ? Math.floor(Number(result.recommendedContracts))
    : PAPER_MAX_CONTRACTS;
  const maxRisk = liveStopRiskBudgetDollars();
  const maxEntryBudget = Math.min(liveEntryBudgetDollars(), remainingLiveSystemExposureBudget());
  let best = 0;
  const cappedRequested = Math.max(1, Math.min(PAPER_MAX_CONTRACTS, requested));
  for (let contracts = 1; contracts <= cappedRequested; contracts += 1) {
    const entryCost = liveEntryCostDollars(result.currentBuyPriceCents, contracts);
    const plannedLoss = liveStopLossDollars(result.currentBuyPriceCents, stops.hardStopPriceCents, contracts);
    if (entryCost <= paperState.cash && entryCost <= maxEntryBudget && plannedLoss <= maxRisk) best = contracts;
  }
  if (best < cappedRequested) {
    paperLog(`Sized ${result.ticker} down from ${cappedRequested} to ${best} contracts; cash cap $${maxEntryBudget.toFixed(2)}, stop-risk cap $${maxRisk.toFixed(2)}.`);
  }
  return best;
}

function remainingLiveSystemExposureBudget() {
  const cap = liveSystemExposureCapDollars();
  const reserved = Math.max(0, Number(paperState.pendingReservedDollars || 0));
  if (!liveConfig.liveTradingEnabled) return round4(Math.max(0, cap - reserved));
  const rawUsed = Math.max(0, Number(paperState.liveSystemPositionValue ?? paperState.botOpenPositionValue ?? 0));
  const used = adjustedOpenExposureForBudget(rawUsed);
  return round4(Math.max(0, cap - used - reserved));
}

function adjustedOpenExposureForBudget(rawUsed) {
  const openTrades = activeSystemTrades();
  const arbGroups = new Map();
  for (const trade of openTrades) {
    if (trade.strategyType !== "SPORTS_PAIR_ARB_HOLD") continue;
    const key = String(trade.exposureKey || "").trim();
    if (!key) continue;
    const group = arbGroups.get(key) || [];
    group.push(trade);
    arbGroups.set(key, group);
  }
  let hedgedValue = 0;
  for (const group of arbGroups.values()) {
    if (group.length < 2) continue;
    const completedSportsPairArb = group.every((trade) => {
      return trade.status === "OPEN"
        && trade.strategyType === "SPORTS_PAIR_ARB_HOLD"
        && trade.arbHoldToExpiration === true
        && trade.executionStatus === "ARB_HELD_TO_EXPIRATION"
        && (!trade.entryConfirmationStatus || trade.entryConfirmationStatus === "filled");
    });
    if (completedSportsPairArb) {
      hedgedValue += group.reduce((sum, trade) => {
        const liveValue = Math.abs(Number(trade.liveMarketExposureDollars || 0));
        return sum + (liveValue > 0 ? liveValue : Number(trade.openValue || trade.entryCost || 0));
      }, 0);
      continue;
    }
    const yesCount = group.filter((trade) => trade.side === "YES").reduce((sum, trade) => sum + Number(trade.contracts || 0), 0);
    const noCount = group.filter((trade) => trade.side === "NO").reduce((sum, trade) => sum + Number(trade.contracts || 0), 0);
    const allNoTwoOutcome = yesCount <= 0 && noCount > 0 && group.length >= 2;
    const hedgedContracts = allNoTwoOutcome ? noCount : Math.min(yesCount, noCount);
    if (hedgedContracts <= 0) continue;
    const groupCost = group.reduce((sum, trade) => sum + Number(trade.entryCost || 0), 0);
    const groupContracts = group.reduce((sum, trade) => sum + Number(trade.contracts || 0), 0);
    if (groupContracts <= 0) continue;
    hedgedValue += groupCost * Math.min(1, hedgedContracts / groupContracts);
  }
  return round4(Math.max(0, Number(rawUsed || 0) - hedgedValue));
}

function reserveLiveExposure(amount, label = "entry") {
  const value = round4(Math.max(0, Number(amount || 0)));
  if (value <= 0) return false;
  const remaining = remainingLiveSystemExposureBudget();
  if (value > remaining + 0.0001) {
    paperLog(`Skipped ${label}: reserving $${value.toFixed(2)} would exceed max open exposure; $${remaining.toFixed(2)} remains.`);
    return false;
  }
  paperState.pendingReservedDollars = round4(Math.max(0, Number(paperState.pendingReservedDollars || 0)) + value);
  return true;
}

function releaseLiveExposureReservation(amount) {
  const value = round4(Math.max(0, Number(amount || 0)));
  paperState.pendingReservedDollars = round4(Math.max(0, Number(paperState.pendingReservedDollars || 0)) - value);
}

function accountPositionFallbackBlocksEntry(result) {
  if (!liveConfig.liveTradingEnabled) return false;
  const cap = liveSystemExposureCapDollars();
  const accountPositionValue = Math.max(0, Number(paperState.openPositionValue || 0));
  const canTrustSystemExposure = !paperState.positionsEndpointUnavailable && !paperState.reconciliationError;
  if (canTrustSystemExposure || accountPositionValue < cap) return false;
  paperLog(`Skipped ${result.ticker}: account already has $${accountPositionValue.toFixed(2)} in open positions and live system-position reconciliation is unavailable; blocking new entries under the $${cap.toFixed(2)} hard cap.`);
  return true;
}

async function blocksLiveSystemExposure(result, projectedEntryCost = 0) {
  if (!liveConfig.liveTradingEnabled) return false;
  await reconcileLiveSystemPositions().catch((error) => {
    if (error.status === 404) {
      paperState.reconciliationError = "Live positions list endpoint returned 404; continuing with per-ticker exposure checks.";
      paperLog(paperState.reconciliationError);
      return;
    }
    safetyHalt(`Live exposure reconciliation failed before entry: ${kalshiErrorDetail(error) || error.message}`);
  });
  if (paperState.safetyHalted) return true;
  if (accountPositionFallbackBlocksEntry(result)) return true;
  const liveSystemExposure = Number(paperState.liveSystemPositionValue ?? paperState.botOpenPositionValue ?? 0);
  if (isCryptoResult(result) && (liveSystemExposure > 0.01 || hasActiveBitcoinTrade())) {
    paperLog(`Skipped ${result.ticker}: BTC/system exposure already active ($${liveSystemExposure.toFixed(2)}).`);
    return true;
  }
  const cap = liveSystemExposureCapDollars();
  const projected = liveSystemExposure + Math.max(0, Number(projectedEntryCost || 0));
  if (projected > cap) {
    paperLog(`Skipped ${result.ticker}: projected system exposure $${projected.toFixed(2)} exceeds $${cap.toFixed(2)} active cap.`);
    return true;
  }
  return false;
}

function liveSystemExposureCapDollars() {
  return clampNumber(paperState.settings?.maxOpenDollars, 0, USER_MAX_OPEN_DOLLARS_LIMIT, DEFAULT_SETTINGS.maxOpenDollars);
}

function liveEntryBudgetDollars() {
  const cash = Math.max(0, Number(paperState.cash || 0));
  const equity = liveSizingAccountDollars();
  const manualCap = clampNumber(paperState.settings?.maxTradeDollars, 0, USER_MAX_TRADE_DOLLARS_LIMIT, DEFAULT_SETTINGS.maxTradeDollars);
  const cashCap = cash * LIVE_MAX_ENTRY_CASH_FRACTION;
  const equityCap = equity * LIVE_MAX_ENTRY_EQUITY_FRACTION;
  return round4(Math.max(0, Math.min(cash, cashCap, equityCap, manualCap)));
}

function exposureCooldownRemaining(exposureKey) {
  if (isBitcoinExposureKey(exposureKey)) return 0;
  const until = Number(paperState.exposureCooldowns?.[exposureKey] || 0);
  return Math.max(0, until - Date.now());
}

function setExposureCooldown(exposureKey) {
  if (!exposureKey) return;
  if (isBitcoinExposureKey(exposureKey)) return;
  if (!paperState.exposureCooldowns || typeof paperState.exposureCooldowns !== "object") paperState.exposureCooldowns = {};
  paperState.exposureCooldowns[exposureKey] = Date.now() + LIVE_REENTRY_COOLDOWN_MS;
}

function clearExpiredExposureCooldowns() {
  if (!paperState.exposureCooldowns || typeof paperState.exposureCooldowns !== "object") {
    paperState.exposureCooldowns = {};
    return;
  }
  const now = Date.now();
  for (const [key, until] of Object.entries(paperState.exposureCooldowns)) {
    if (Number(until) <= now) delete paperState.exposureCooldowns[key];
  }
}

function liveStopRiskBudgetDollars() {
  const equity = liveSizingAccountDollars();
  return round4(Math.max(0.5, Math.min(LIVE_DEFAULT_MAX_DOLLARS_AT_RISK, equity * LIVE_MAX_RISK_FRACTION)));
}

function liveSizingAccountDollars() {
  const liveEquity = Math.max(0, Number(paperState.equity || paperState.cash || DEFAULT_SETTINGS.accountValue));
  return round4(Math.max(1, Math.min(LIVE_SIZING_ACCOUNT_CAP_DOLLARS, liveEquity)));
}

function liveEntryCostDollars(entryCents, contracts) {
  const buyFee = feePerContract(entryCents, KALSHI_STANDARD_FEE_RATE, contracts);
  return round4(contracts * (entryCents / 100 + buyFee));
}

function liveStopLossDollars(entryCents, stopCents, contracts) {
  const entryCost = liveEntryCostDollars(entryCents, contracts);
  const stopProceeds = paperExitProceeds({ contracts }, stopCents);
  return round4(Math.max(0, entryCost - stopProceeds));
}

function shouldForceExitBitcoinHourly(trade) {
  if (trade.strategyType === "LATE_LOCK_SCRAPE") return false;
  if (!isCryptoResult(trade) || !isBitcoinHourlyContract(`${trade.ticker || ""} ${trade.event_ticker || ""} ${trade.series_ticker || ""} ${trade.marketTitle || ""}`, trade)) return false;
  const minutesLeft = minutesToDecision(trade);
  return Number.isFinite(minutesLeft) && minutesLeft <= BTC_HOURLY_FORCE_EXIT_MINUTES;
}

function shouldExitBitcoinBlackout(trade) {
  return isCryptoResult(trade)
    && isBitcoinHourlyContract(`${trade.ticker || ""} ${trade.event_ticker || ""} ${trade.series_ticker || ""} ${trade.marketTitle || ""}`, trade)
    && isBitcoinHourlyBlackoutNow();
}

function shouldExitStaleTennisTrade(trade) {
  if (!isTennisMarket({
    category: trade.category,
    series_ticker: trade.series_ticker,
    event_ticker: trade.event_ticker,
    ticker: trade.ticker,
    title: trade.marketTitle,
    subtitle: trade.subtitle
  })) return false;
  const checks = (trade.checks || []).filter((row) => validCents(row.bid));
  if (checks.length < 3) return false;
  const latestTime = Date.parse(checks[0].time || "");
  if (!Number.isFinite(latestTime)) return false;
  const older = checks.find((row) => {
    const ts = Date.parse(row.time || "");
    return Number.isFinite(ts) && latestTime - ts >= TENNIS_PAUSE_WINDOW_MS;
  });
  if (!older) return false;
  const windowChecks = checks.filter((row) => {
    const ts = Date.parse(row.time || "");
    return Number.isFinite(ts) && latestTime - ts <= TENNIS_OBS_PAUSE_WINDOW_MS;
  });
  if (windowChecks.length < 3) return false;
  const range = Math.max(...windowChecks.map((row) => row.bid)) - Math.min(...windowChecks.map((row) => row.bid));
  return range <= TENNIS_PAUSE_MAX_RANGE_CENTS;
}

function computePaperStops(entryPriceCents, targetPriceCents, scannerStopPriceCents) {
  const swing = Math.max(1, targetPriceCents - entryPriceCents);
  if (validCents(scannerStopPriceCents)) {
    const hardStopPriceCents = Math.max(1, Math.min(entryPriceCents - MIN_SCRAPE_STOP_DISTANCE_CENTS, Math.round(scannerStopPriceCents)));
    const softStopPriceCents = Math.max(
      hardStopPriceCents + 1,
      Math.min(entryPriceCents - 1, Math.round(hardStopPriceCents + Math.max(2, swing * 0.35)))
    );
    return { softStopPriceCents, hardStopPriceCents };
  }
  const softDistance = Math.max(MIN_SCRAPE_STOP_DISTANCE_CENTS, Math.round(swing * 0.6));
  const softStopPriceCents = Math.max(1, Math.min(entryPriceCents - 1, Math.round(entryPriceCents - softDistance)));
  const hardDistance = Math.max(MIN_SCRAPE_STOP_DISTANCE_CENTS + 2, Math.round(swing * 1.2));
  const hardStopPriceCents = Math.max(1, Math.min(softStopPriceCents - 1, Math.round(entryPriceCents - hardDistance)));
  return { softStopPriceCents, hardStopPriceCents };
}

function startPaperMonitor() {
  if (paperMonitorTimer) return;
  paperMonitorTimer = setInterval(() => {
    monitorPaperTrades().catch((error) => {
      paperLog(`Paper monitor error: ${error.message}`);
      publishPaper();
    });
  }, PAPER_MONITOR_MS);
}

async function monitorPaperTrades(source = "timer") {
  if (!latestSnapshot.baseUrl) return;
  for (const trade of activeSystemTrades()) {
    await monitorPaperTrade(trade, source);
  }
}

async function monitorPaperTrade(trade, source = "timer") {
  if (!trade || !latestSnapshot.baseUrl || !["SUBMITTING", "OPEN"].includes(trade.status)) return;
  if (trade.strategyType === "BTC_CROSS_STRIKE_ARB_HOLD") {
    const bid = await refreshPaperTradeMark(trade, { allowNetwork: true }).catch(() => trade.currentBidCents || trade.entryPriceCents);
    trade.currentBidCents = validCents(bid) ? round2(bid) : trade.currentBidCents;
    trade.lastCheckedAt = new Date().toISOString();
    trade.lastMarkSource = "btc-cross-arb-hold";
    updatePaperAccount();
    publishPaper();
    return;
  }
  if (trade.strategyType === "SPORTS_PAIR_ARB_HOLD") {
    const bid = await refreshPaperTradeMark(trade, { allowNetwork: true }).catch(() => trade.currentBidCents || trade.entryPriceCents);
    trade.currentBidCents = validCents(bid) ? round2(bid) : trade.currentBidCents;
    trade.lastCheckedAt = new Date().toISOString();
    trade.lastMarkSource = "arb-hold";
    updatePaperAccount();
    publishPaper();
    return;
  }
  if (liveConfig.liveTradingEnabled && trade.entryOrderId) {
    const livePosition = await getLiveTickerPosition(trade.ticker).catch(() => null);
    const liveCount = Math.abs(Number(livePosition?.position || 0));
    const hasRestingOrders = Number(livePosition?.restingOrdersCount || livePosition?.raw?.resting_orders_count || 0) > 0;
    const hasExposure = Number(livePosition?.exposureDollars || 0) > 0;
    if (livePosition && !livePosition.raw?.unavailable && liveCount < 1 && !hasRestingOrders && !hasExposure) {
      await closeTrackedTradeWithoutOrder(trade, trade.currentBidCents || trade.softStopPriceCents || trade.entryPriceCents, "FLAT_RECONCILED", "Kalshi reports no live position for this app-tracked ticker");
      publishPaper();
      return;
    }
  }
  const bid = await refreshPaperTradeMark(trade, { allowNetwork: true });
  if (shouldExitBitcoinBlackout(trade)) {
    await closePaperTrade(trade, bid, "BTC_BLACKOUT_EXIT", "BTC hourly blackout exit: 4-5 PM ET daily-contract gap");
    publishPaper();
    return;
  }
  if (shouldForceExitBitcoinHourly(trade)) {
    await closePaperTrade(trade, bid, "BTC_TIME_EXIT", `BTC hourly safety exit: inside final ${BTC_HOURLY_FORCE_EXIT_MINUTES} minutes`);
    publishPaper();
    return;
  }
  if (shouldExitStaleTennisTrade(trade)) {
    await closePaperTrade(trade, bid, "TENNIS_STALE_EXIT", "tennis safety exit: active trade stopped moving across repeated checks");
    publishPaper();
    return;
  }
  if (await shouldExitActiveBtcTrendFlip(trade)) {
    await closePaperTrade(trade, bid, "BTC_TREND_EXIT", trade.btcTrendExitReason || "BTC internal trend exit");
    publishPaper();
    return;
  }
  if (shouldExitActiveBtcLadderCollapse(trade, bid)) {
    if (!LIVE_AUTO_LADDER_EXITS_ENABLED) {
      noteObservedExitOnly(trade, "BTC ladder collapse", trade.bookLadderExitReason || "BTC book ladder collapse observed");
      publishPaper();
      return;
    }
    await closePaperTrade(trade, bid, "BTC_BOOK_LADDER_EXIT", trade.bookLadderExitReason || "BTC book ladder collapse exit");
    publishPaper();
    return;
  }
  if (trade.targetPending && !trade.targetOrderId && !trade.targetHidden) {
    try {
      const targetOrder = await submitLiveTargetOrder(trade);
      trade.targetOrderId = targetOrder.order?.order_id || targetOrder.order_id;
      trade.targetClientOrderId = targetOrder.order?.client_order_id || targetOrder.client_order_id;
      trade.targetPending = false;
      paperLog(`Target sell order submitted for ${trade.ticker}: ${trade.contracts} @ ${executableTradeTargetLimitCents(trade)}c.`);
    } catch (error) {
      paperLog(`Target sell retry failed for ${trade.ticker}: ${error.message}`);
    }
  }
  if (trade.stopExitError && bid > trade.softStopPriceCents && !trade.targetOrderId && !trade.targetPending && !trade.targetHidden) {
    trade.stopExitError = null;
    trade.stopExitReason = "";
    trade.targetCancelledAt = null;
    trade.targetPending = true;
    paperLog(`Stop condition cleared for ${trade.ticker}; bid recovered to ${round2(bid)}c, re-arming target ${executableTradeTargetLimitCents(trade)}c.`);
  }
  if ((bid >= trade.targetPriceCents || trade.lastTargetTouched) && trade.targetOrderId) {
    const targetFilled = await targetOrderFilledOrFlat(trade).catch((error) => {
      paperLog(`Target fill check failed for ${trade.ticker}: ${kalshiErrorDetail(error) || error.message}`);
      return false;
    });
    if (targetFilled) {
      const targetLimit = executableTradeTargetLimitCents(trade);
      await closePaperTrade(trade, targetLimit, "TARGET", `target ${trade.targetPriceCents}c filled/flat on Kalshi via executable limit ${targetLimit}c`);
    } else {
      paperLog(`Target touched for ${trade.ticker}, but Kalshi has not confirmed the target fill yet; keeping trade open.`);
    }
  } else if ((bid >= trade.targetPriceCents || trade.lastTargetTouched) && !trade.targetOrderId && trade.targetHidden) {
    const targetLimit = executableTradeTargetLimitCents(trade);
    await closePaperTrade(trade, targetLimit, "TARGET", `hidden internal target ${trade.targetPriceCents}c touched; IOC reduce-only exit sent at ${targetLimit}c`);
  } else if ((bid >= trade.targetPriceCents || trade.lastTargetTouched) && !trade.targetOrderId) {
    try {
      const targetOrder = await submitLiveTargetOrder(trade);
      trade.targetOrderId = targetOrder.order?.order_id || targetOrder.order_id;
      trade.targetClientOrderId = targetOrder.order?.client_order_id || targetOrder.client_order_id;
      trade.targetPending = false;
      paperLog(`Target touched but no target order existed; submitted target sell for ${trade.ticker} at ${executableTradeTargetLimitCents(trade)}c.`);
    } catch (error) {
      paperLog(`Target touched but exit order failed for ${trade.ticker}: ${error.message}`);
    }
  } else if (trade.profitLockArmed && bid <= trade.profitLockPriceCents) {
    await closePaperTrade(trade, bid, "PROFIT_LOCK", `profit lock ${trade.profitLockPriceCents}c protected after reaching ${round2(trade.bestBidCents)}c`);
  } else if (shouldExitPaperStop(trade, bid)) {
    if (!LIVE_AUTO_STOP_EXITS_ENABLED) {
      noteObservedExitOnly(trade, "stop", stopExitNote(trade, bid));
      publishPaper();
      return;
    }
    await closePaperTrade(trade, bid, "CONFIRMED_STOP", stopExitNote(trade, bid));
  } else {
    const softStopNote = trade.softStopConfirmations ? `; soft stop warning ${trade.softStopConfirmations}/${PAPER_SOFT_STOP_CONFIRMATIONS}` : "";
    const lockNote = trade.profitLockArmed ? `; profit lock ${trade.profitLockPriceCents}c armed` : "";
    paperLog(`Checked ${trade.ticker} (${source}): bid ${round2(bid)}c; target ${trade.targetPriceCents}c; stop ${trade.softStopPriceCents}c/${trade.hardStopPriceCents}c${softStopNote}${lockNote}.`);
  }
  publishPaper();
}

async function targetOrderFilledOrFlat(trade) {
  if (!liveConfig.liveTradingEnabled) return true;
  if (trade.targetOrderId) {
    try {
      const checked = await getKalshiOrder(trade.targetOrderId);
      const filled = extractFilledContracts(checked, trade.contracts);
      const order = checked?.order || checked || {};
      const remaining = orderFieldNumber(order, ["remaining_count", "remaining_count_fp", "remaining_quantity"]);
      const status = String(order.status || order.state || "").toLowerCase();
      trade.targetOrderStatus = status || trade.targetOrderStatus;
      trade.targetFilledContracts = filled;
      if (filled >= Math.max(1, Math.floor(Number(trade.contracts || 0)))) return true;
      if (Number.isFinite(remaining)) trade.targetRemainingContracts = Math.max(0, Math.floor(remaining));
    } catch (error) {
      if (error.status !== 404) throw error;
      trade.targetOrderStatus = "not_found_check_position";
    }
  }
  const livePosition = await getLiveTickerPosition(trade.ticker);
  if (livePosition?.raw?.unavailable) return false;
  applyLivePositionToTrade(trade, livePosition);
  return Math.abs(Number(livePosition.position || 0)) < 1;
}

async function exitOrderFilledOrFlat(trade, orderId, label) {
  if (!liveConfig.liveTradingEnabled) return true;
  if (orderId) {
    try {
      const checked = await getKalshiOrder(orderId);
      const filled = extractFilledContracts(checked, trade.contracts);
      const order = checked?.order || checked || {};
      const remaining = orderFieldNumber(order, ["remaining_count", "remaining_count_fp", "remaining_quantity"]);
      const status = String(order.status || order.state || "").toLowerCase();
      trade[`${label}OrderStatus`] = status || trade[`${label}OrderStatus`];
      trade[`${label}FilledContracts`] = filled;
      if (filled >= Math.max(1, Math.floor(Number(trade.contracts || 0)))) return true;
      if (Number.isFinite(remaining)) trade[`${label}RemainingContracts`] = Math.max(0, Math.floor(remaining));
    } catch (error) {
      if (error.status !== 404) throw error;
      trade[`${label}OrderStatus`] = "not_found_check_position";
    }
  }
  const livePosition = await getLiveTickerPosition(trade.ticker);
  if (livePosition?.raw?.unavailable) return false;
  applyLivePositionToTrade(trade, livePosition);
  return Math.abs(Number(livePosition.position || 0)) < 1;
}

function shouldExitPaperStop(trade, bid) {
  if (!validCents(bid)) return false;
  if (isActiveBtcTechnicalTrade(trade)) {
    const hardTouched = bid <= trade.hardStopPriceCents;
    const softTouched = bid <= trade.softStopPriceCents;
    const spread = Number(trade.currentSpreadCents);
    const spreadReliable = Number.isFinite(spread) && spread <= BTC_RESEARCH_MAX_SPREAD_CENTS;
    if (softTouched && !hardTouched && !spreadReliable) {
      trade.stopExitReason = `soft stop ignored while spread ${Number.isFinite(spread) ? round2(spread) : "-"}c is wider than ${BTC_RESEARCH_MAX_SPREAD_CENTS}c`;
      return false;
    }
    const stopTouched = hardTouched || softTouched;
    if (stopTouched) {
      trade.softStopConfirmations = (trade.softStopConfirmations || 0) + 1;
    } else if (bid >= btcStopRecoveryPriceCents(trade)) {
      trade.softStopConfirmations = 0;
    }
    if ((trade.softStopConfirmations || 0) >= PAPER_SOFT_STOP_CONFIRMATIONS) {
      trade.stopExitReason = hardTouched
        ? `confirmed BTC hard stop after ${PAPER_SOFT_STOP_CONFIRMATIONS} book checks`
        : `confirmed BTC soft stop after ${PAPER_SOFT_STOP_CONFIRMATIONS} book checks`;
      return true;
    }
    return false;
  }
  if (bid <= trade.hardStopPriceCents) {
    trade.stopExitReason = "hard stop";
    return true;
  }
  if (bid <= trade.softStopPriceCents || trade.lastSoftStopTouched) {
    trade.softStopConfirmations = (trade.softStopConfirmations || 0) + 1;
  } else {
    trade.softStopConfirmations = 0;
  }
  if ((trade.softStopConfirmations || 0) >= PAPER_SOFT_STOP_CONFIRMATIONS) {
    trade.stopExitReason = "confirmed soft stop";
    return true;
  }
  return false;
}

function shouldExitActiveBtcLadderCollapse(trade, bid) {
  if (!validCents(bid) || !isActiveBtcTechnicalTrade(trade)) return false;
  const ladder = trade.lastBookLadderSignal;
  if (!ladder?.exitNow) return false;
  const nearStop = bid <= Math.max(Number(trade.softStopPriceCents || 0), Number(trade.entryPriceCents || 0) - 6);
  const strongResistance = Number(ladder.resistanceAbove || 0) >= BTC_LADDER_HEAVY_CONTRACTS
    || Number(ladder.immediateResistance || 0) >= Math.max(BTC_LADDER_THIN_CONTRACTS, Number(ladder.immediateSupport || 0) * BTC_LADDER_COLLAPSE_RATIO);
  if (!nearStop && !strongResistance) return false;
  trade.bookLadderExitReason = `BTC ladder collapse: ${ladder.reason}; bid ${round2(bid)}c.`;
  return true;
}

function noteObservedExitOnly(trade, label, reason) {
  const now = Date.now();
  if (now - Number(trade.lastObservedExitOnlyLogAtMs || 0) < 10_000) return;
  trade.lastObservedExitOnlyLogAtMs = now;
  trade.observedExitOnlyReason = reason;
  paperLog(`OBSERVE ONLY: ${label} on ${trade.ticker}; no live sell sent. ${reason}`);
}

function stopExitNote(trade, bid) {
  if (trade.stopExitReason === "confirmed hard stop") return `hard stop ${trade.hardStopPriceCents}c confirmed ${trade.softStopConfirmations}/${PAPER_SOFT_STOP_CONFIRMATIONS} at ${round2(bid)}c`;
  if (trade.stopExitReason === "hard stop") return `hard stop ${trade.hardStopPriceCents}c hit at ${round2(bid)}c`;
  return `soft stop ${trade.softStopPriceCents}c confirmed ${trade.softStopConfirmations}/${PAPER_SOFT_STOP_CONFIRMATIONS} at ${round2(bid)}c`;
}

function isActiveBtcTechnicalTrade(trade) {
  return isCryptoMarket(trade) && isBtcExecutionStrategy(trade.strategyType);
}

function btcStopRecoveryPriceCents(trade) {
  const entry = Number(trade.entryPriceCents || 0);
  const stop = Number(trade.softStopPriceCents || 0);
  if (!Number.isFinite(entry) || !Number.isFinite(stop)) return entry || 99;
  return Math.max(stop + 2, Math.round(stop + Math.max(2, (entry - stop) * 0.35)));
}

async function shouldExitActiveBtcTrendFlip(trade) {
  return false;
}

async function refreshPaperTradeMark(trade, { allowNetwork = true } = {}) {
  const market = {
    ticker: trade.ticker,
    event_ticker: trade.event_ticker,
    series_ticker: trade.series_ticker,
    title: trade.marketTitle,
    subtitle: trade.subtitle,
    category: trade.category,
    yes_bid: null,
    yes_ask: null,
    no_bid: null,
    no_ask: null,
    volume: 0,
    open_interest: 0,
    liquidity: 0
  };
  let bid = trade.currentBidCents;
  let recentRanges = [];
  if (allowNetwork && latestSnapshot.baseUrl) {
    const orderbook = await fetchWithRetry(`${latestSnapshot.baseUrl}/markets/${encodeURIComponent(trade.ticker)}/orderbook?depth=${ORDERBOOK_DEPTH}`, { endpointLabel: `/paper/${trade.ticker}/orderbook`, paced: true, maxRetries: 0 });
    const enriched = enrichMarketWithBook(market, orderbook.orderbook_fp || orderbook.orderbook || orderbook);
    const wallMemory = updateBtcBookMemory(enriched);
    if (wallMemory) {
      trade.lastBookWallMemory = wallMemory;
      trade.lastBookWallSummary = enriched.orderbook?.wallSummary || null;
    }
    const candles = await fetchCandlesForPaper(latestSnapshot.baseUrl, trade).catch(() => []);
    const series = extractSeries(candles);
    const ranges = sideRangeSeries(series, trade.side);
    recentRanges = ranges.slice(-2).filter((row) => validCents(row.high) && validCents(row.low));
    const currentBid = trade.side === "YES" ? enriched.yes_bid : enriched.no_bid;
    const currentAsk = trade.side === "YES" ? enriched.yes_ask : enriched.no_ask;
    const currentSpread = trade.side === "YES" ? enriched.orderbook?.yesSpread : enriched.orderbook?.noSpread;
    bid = validCents(currentBid) ? currentBid : bid;
    trade.currentAskCents = validCents(currentAsk) ? round2(currentAsk) : trade.currentAskCents;
    trade.currentSpreadCents = Number.isFinite(Number(currentSpread)) ? round2(Number(currentSpread)) : trade.currentSpreadCents;
    if (isActiveBtcTechnicalTrade(trade)) {
      trade.lastBookLadderSignal = computeBookLadderSignal(
        enriched.orderbook,
        trade.side,
        bid || trade.currentBidCents || trade.entryPriceCents,
        trade.targetPriceCents
      );
    }
  }
  if (!validCents(bid)) bid = trade.entryPriceCents;
  const btcTrade = isCryptoResult(trade);
  const candleTouchedTarget = recentRanges.some((row) => row.high >= trade.targetPriceCents);
  const candleTouchedSoftStop = !btcTrade && recentRanges.some((row) => row.low <= trade.softStopPriceCents);
  trade.lastCheckedAt = new Date().toISOString();
  trade.currentBidCents = round2(bid);
  updateProfitLock(trade, bid);
  trade.lastTargetTouched = Boolean(candleTouchedTarget || bid >= trade.targetPriceCents);
  trade.lastSoftStopTouched = Boolean(candleTouchedSoftStop || bid <= trade.softStopPriceCents);
  trade.lastHardStopTouched = Boolean(bid <= trade.hardStopPriceCents);
  trade.lastMarkSource = allowNetwork && latestSnapshot.baseUrl ? "orderbook" : "last-known";
  trade.checks.unshift({
    time: trade.lastCheckedAt,
    bid: round2(bid),
    targetTouched: trade.lastTargetTouched,
    softStopTouched: trade.lastSoftStopTouched,
    hardStopTouched: trade.lastHardStopTouched,
    softStopConfirmations: trade.softStopConfirmations || 0
  });
  trade.checks = trade.checks.slice(0, 20);
  updatePaperAccount();
  return round2(bid);
}

function updateProfitLock(trade, bid) {
  if (isBtcExecutionStrategy(trade?.strategyType)) return;
  if (!validCents(bid)) return;
  trade.bestBidCents = Math.max(trade.bestBidCents || trade.entryPriceCents || bid, bid);
  const progressNeeded = trade.entryPriceCents + (trade.targetPriceCents - trade.entryPriceCents) * PAPER_PROFIT_LOCK_PROGRESS;
  if (!trade.profitLockArmed && trade.bestBidCents >= progressNeeded) {
    trade.profitLockArmed = true;
    trade.profitLockPriceCents = Math.max(
      trade.entryPriceCents + 1,
      Math.round(trade.entryPriceCents + (trade.targetPriceCents - trade.entryPriceCents) * 0.25)
    );
    paperLog(`Profit lock armed for ${trade.ticker}: best bid ${round2(trade.bestBidCents)}c, lock ${trade.profitLockPriceCents}c.`);
  }
}

async function fetchCandlesForPaper(baseUrl, trade) {
  const cached = getCachedCandles(trade.ticker);
  if (cached) return cached;
  if (Date.now() < candleCooldownUntil) return [];
  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - 60 * 60;
  const url = new URL(`${baseUrl}/series/${encodeURIComponent(trade.series_ticker || "UNKNOWN")}/markets/${encodeURIComponent(trade.ticker)}/candlesticks`);
  url.searchParams.set("period_interval", "1");
  url.searchParams.set("start_ts", String(startTs));
  url.searchParams.set("end_ts", String(endTs));
  try {
    const data = await fetchWithRetry(url.toString(), { endpointLabel: "/paper/candlesticks", paced: true, maxRetries: 0 });
    const candles = data.candlesticks || data.market?.candlesticks || [];
    setCachedCandles(trade.ticker, candles);
    return candles;
  } catch (error) {
    if (error.status === 429) noteCandleCooldown();
    return [];
  }
}

async function closePaperTrade(trade, exitPriceCents, reason, note) {
  if (!trade) return;
  if (!["SUBMITTING", "OPEN"].includes(trade.status) || trade.closing) return;
  if (isCompletedSportsArbHold(trade)) {
    paperLog(`Blocked automated close for locked sports-arb leg ${trade.ticker}; completed arbitrages are held to expiration unless manually overridden.`);
    return;
  }
  if (liveConfig.liveTradingEnabled && reason !== "TARGET" && !trade.emergencyOrderSent) {
    const now = Date.now();
    const nextRetry = Number(trade.nextStopRetryAtMs || 0);
    if (nextRetry > now) {
      if (!trade.lastStopRetryHoldLogAtMs || now - trade.lastStopRetryHoldLogAtMs > 10000) {
        const waitSeconds = Math.max(1, Math.ceil((nextRetry - now) / 1000));
        paperLog(`Stop exit already attempted for ${trade.ticker}; waiting ${waitSeconds}s before another live sell attempt.`);
        trade.lastStopRetryHoldLogAtMs = now;
      }
      return;
    }
  }
  trade.closing = true;
  paperState.executionState = reason === "TARGET" ? "EXIT_VERIFYING" : "EXIT_SUBMITTING";
  paperState.executionUpdatedAt = new Date().toISOString();
  publishPaper();
  try {
    if ((reason !== "TARGET" || trade.targetHidden) && !trade.emergencyOrderSent) {
      const stopResponse = await submitLiveStopOrder(trade, exitPriceCents);
      if (liveConfig.liveTradingEnabled && !stopResponse) {
        throw new Error(`${reason === "TARGET" ? "target" : "stop"} exit order did not return an order`);
      }
      const stopFilled = await exitOrderFilledOrFlat(trade, trade.stopOrderId, "stop");
      if (!stopFilled) {
        throw new Error(`${reason === "TARGET" ? "target" : "stop"} exit order ${trade.stopOrderId || "(missing id)"} submitted but Kalshi did not confirm a fill/flat position`);
      }
    }
  } catch (error) {
    trade.closing = false;
    trade.status = "OPEN";
    paperState.executionState = "POSITION_OPEN";
    paperState.executionUpdatedAt = new Date().toISOString();
    trade.stopExitError = kalshiErrorDetail(error) || error.message;
    if (liveConfig.liveTradingEnabled && reason !== "TARGET") {
      trade.nextStopRetryAtMs = Date.now() + 5000;
    }
    paperLog(`Stop exit order failed for ${trade.ticker}: ${trade.stopExitError}. Keeping trade OPEN for retry/manual action.`);
    publishPaper();
    return;
  }
  trade.nextStopRetryAtMs = null;
  const exitFee = feePerContract(exitPriceCents, KALSHI_STANDARD_FEE_RATE, trade.contracts);
  const proceeds = Math.max(0, trade.contracts * (exitPriceCents / 100 - exitFee));
  const pnl = proceeds - trade.entryCost;
  trade.status = reason;
  trade.closedAt = new Date().toISOString();
  trade.exitPriceCents = exitPriceCents;
  trade.exitFeePerContract = exitFee;
  trade.exitProceeds = round4(proceeds);
  trade.pnl = round4(pnl);
  trade.openValue = 0;
  trade.unrealizedPnl = 0;
  const btcTrade = isCryptoResult(trade) || isBitcoinExposureKey(trade.exposureKey);
  if (!btcTrade) setExposureCooldown(trade.exposureKey);
  if (!liveConfig.liveTradingEnabled) paperState.cash = round4(paperState.cash + proceeds);
  syncActiveTradePointer();
  if (liveConfig.liveTradingEnabled) await refreshLiveAccountFromKalshi().catch(() => {});
  updatePaperAccount();
  paperState.executionState = btcTrade ? "IDLE" : "COOLDOWN";
  paperState.executionCooldownUntil = btcTrade ? 0 : Date.now() + LIVE_REENTRY_COOLDOWN_MS;
  paperState.executionUpdatedAt = new Date().toISOString();
  paperLog(`${liveConfig.liveTradingEnabled ? "LIVE" : "DRY-RUN"} SELL ${trade.side} ${trade.ticker}: ${trade.contracts} @ ${exitPriceCents}c; ${note}; est P/L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`);
  applyConsecutiveStopLossBrake(trade, reason, pnl);
  if (btcTrade) {
    if (!paperState.safetyHalted) {
      logAudit("info", `BTC ${reason.toLowerCase()} close; immediately scanning for the next scrape.`);
      requestImmediateBitcoinScan("post-close Bitcoin");
    }
  }
}

function applyConsecutiveStopLossBrake(trade, reason, pnl) {
  const stopLike = /STOP|TIME_EXIT|BLACKOUT_EXIT|BOOK_LADDER_EXIT|TREND_EXIT|STALE_EXIT/i.test(String(reason || ""));
  const losingStop = stopLike && Number(pnl) < 0;
  if (!losingStop) {
    if (Number(pnl) >= 0 || /TARGET/i.test(String(reason || ""))) {
      paperState.consecutiveStopLosses = 0;
    }
    return;
  }
  paperState.consecutiveStopLosses = Number(paperState.consecutiveStopLosses || 0) + 1;
  const analysis = lossBrakeAnalysis();
  paperState.lossBrakeLastAnalysis = analysis;
  paperLog(`Loss brake count ${paperState.consecutiveStopLosses}/${CONSECUTIVE_STOP_LOSS_BRAKE_LIMIT}: ${trade.ticker} ${reason}, est P/L ${Number(pnl) >= 0 ? "+" : ""}$${Number(pnl).toFixed(2)}. ${analysis}`);
  if (paperState.consecutiveStopLosses >= CONSECUTIVE_STOP_LOSS_BRAKE_LIMIT) {
    safetyHalt(`Emergency brake initiated after ${CONSECUTIVE_STOP_LOSS_BRAKE_LIMIT} consecutive losing stop exits. ${analysis}`);
  }
}

function lossBrakeAnalysis() {
  const losses = (paperState.trades || [])
    .filter((trade) => Number(trade.pnl) < 0 && /STOP|TIME_EXIT|BLACKOUT_EXIT|BOOK_LADDER_EXIT|TREND_EXIT|STALE_EXIT/i.test(String(trade.status || "")))
    .slice(0, CONSECUTIVE_STOP_LOSS_BRAKE_LIMIT);
  const btcCount = losses.filter((trade) => isCryptoResult(trade) || isBitcoinExposureKey(trade.exposureKey)).length;
  const avgLoss = losses.length ? losses.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0) / losses.length : 0;
  const reasons = [...new Set(losses.map((trade) => trade.status).filter(Boolean))].join(", ") || "unknown exits";
  const latest = losses[0] || {};
  const ladder = latest.lastBookLadderSignal?.reason || "";
  const wall = latest.lastBookWallMemory?.latest?.summary || latest.lastBookWallSummary?.summary || "";
  const marketMix = btcCount === losses.length ? "all BTC" : `${btcCount} BTC / ${losses.length - btcCount} other`;
  return `Recent loss cluster: ${losses.length} trades (${marketMix}), avg ${avgLoss.toFixed(2)}, reasons ${reasons}.${ladder ? ` Latest ladder: ${ladder}.` : ""}${wall ? ` Latest wall: ${wall.slice(0, 180)}.` : ""}`;
}

async function closeTrackedTradeWithoutOrder(trade, exitPriceCents, reason, note) {
  if (!trade || !["SUBMITTING", "OPEN"].includes(trade.status)) return;
  if (isCompletedSportsArbHold(trade)) {
    paperLog(`Skipped flat reconciliation for locked sports-arb leg ${trade.ticker}; Kalshi portfolio lag cannot auto-close a completed arb.`);
    return;
  }
  const btcTrade = isCryptoResult(trade) || isBitcoinExposureKey(trade.exposureKey);
  const exit = validCents(exitPriceCents) ? exitPriceCents : trade.currentBidCents || trade.entryPriceCents;
  const exitFee = feePerContract(exit, KALSHI_STANDARD_FEE_RATE, trade.contracts);
  const proceeds = Math.max(0, trade.contracts * (exit / 100 - exitFee));
  const pnl = proceeds - trade.entryCost;
  trade.status = reason;
  trade.closedAt = new Date().toISOString();
  trade.exitPriceCents = exit;
  trade.exitFeePerContract = exitFee;
  trade.exitProceeds = round4(proceeds);
  trade.pnl = round4(pnl);
  trade.openValue = 0;
  trade.unrealizedPnl = 0;
  if (!btcTrade) {
    setExposureCooldown(trade.exposureKey);
  }
  syncActiveTradePointer();
  updatePaperAccount();
  paperLog(`${liveConfig.liveTradingEnabled ? "LIVE" : "DRY-RUN"} FLAT ${trade.side} ${trade.ticker}: ${trade.contracts} @ ${exit}c; ${note}; est P/L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`);
  if (btcTrade) {
    paperState.executionState = "IDLE";
    paperState.executionCooldownUntil = 0;
    paperState.executionUpdatedAt = new Date().toISOString();
    if (!paperState.safetyHalted && activeScan?.running && Number(paperState.settings?.maxTradeDollars || 0) > 0) {
      logAudit("info", `BTC flat reconciliation; immediately scanning for the next scrape.`);
      requestImmediateBitcoinScan("post-flat Bitcoin");
    }
  }
}

async function closeExpiredArbHoldFromPortfolio(trade, positionsByTicker, portfolioRow = null) {
  if (!trade || !isCompletedArbHold(trade) || !tradeIsPastDecision(trade)) return false;
  const ticker = String(trade.ticker || "").toUpperCase();
  const livePosition = positionsByTicker?.get(ticker);
  const liveCount = Math.abs(Number(livePosition?.position || 0));
  const hasRestingOrders = Number(livePosition?.restingOrdersCount || 0) > 0;
  const hasExposure = Number(livePosition?.exposureDollars || 0) > 0;
  const portfolioClosed = /\b(closed|expired|settled|final)\b/i.test(String(portfolioRow?.marketStatus || ""));
  if (!portfolioClosed && (liveCount >= 1 || hasRestingOrders || hasExposure || livePosition?.raw?.unavailable)) return false;
  const detail = await getPortfolioMarketSummary(ticker).catch(() => null);
  const settlement = settlementPriceForSide(detail, trade.side) ?? settlementFromClosedMark(trade);
  const exit = validCents(settlement)
    ? settlement
    : (validCents(trade.currentBidCents) ? trade.currentBidCents : (validCents(trade.entryPriceCents) ? trade.entryPriceCents : 0));
  const exitFee = feePerContract(exit, KALSHI_STANDARD_FEE_RATE, trade.contracts);
  const proceeds = Math.max(0, Number(trade.contracts || 0) * (exit / 100 - exitFee));
  const pnl = proceeds - Number(trade.entryCost || 0);
  trade.status = "EXPIRED_RECONCILED";
  trade.executionStatus = "ARB_EXPIRED_RECONCILED";
  trade.closedAt = new Date().toISOString();
  trade.exitPriceCents = round2(exit);
  trade.exitFeePerContract = round4(exitFee);
  trade.exitProceeds = round4(proceeds);
  trade.pnl = round4(pnl);
  trade.openValue = 0;
  trade.unrealizedPnl = 0;
  trade.expiredByPortfolioReconcile = true;
  trade.portfolioReconciledAt = new Date().toISOString();
  trade.settlementSource = validCents(settlement) ? "market-settlement" : "last-known-mark";
  paperLog(`Expired arb reconciled ${trade.side} ${trade.ticker}: ${trade.contracts} @ ${round2(exit)}c settlement; P/L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`);
  return true;
}

function settlementPriceForSide(market, side) {
  if (!market || !side) return null;
  const yesSettlement = orderFieldNumber(market, [
    "yes_settlement_price",
    "yes_settlement_value",
    "settlement_price",
    "settlement_value",
    "result_price",
    "payout"
  ]);
  if (Number.isFinite(yesSettlement)) {
    const yes = yesSettlement <= 1 ? round2(yesSettlement * 100) : round2(yesSettlement);
    return String(side).toUpperCase() === "YES" ? clamp(yes, 0, 100) : clamp(100 - yes, 0, 100);
  }
  const result = String(market.result || market.winning_outcome || market.settlement_result || market.outcome || "").toUpperCase();
  if (result === "YES") return String(side).toUpperCase() === "YES" ? 100 : 0;
  if (result === "NO") return String(side).toUpperCase() === "NO" ? 100 : 0;
  const status = String(market.status || market.market_status || "").toLowerCase();
  if (/\b(final|settled|closed|expired)\b/.test(status)) {
    const yesBid = Number(market.yes_bid);
    const noBid = Number(market.no_bid);
    if (yesBid >= 99 || noBid <= 1) return String(side).toUpperCase() === "YES" ? 100 : 0;
    if (noBid >= 99 || yesBid <= 1) return String(side).toUpperCase() === "NO" ? 100 : 0;
  }
  return null;
}

function settlementFromClosedMark(trade) {
  const mark = Number(trade?.currentBidCents);
  if (!validCents(mark)) return null;
  if (mark >= 50) return 100;
  if (mark <= 50) return 0;
  return null;
}

function detachTrackedTradeForManualControl(trade) {
  if (!trade || !["SUBMITTING", "OPEN"].includes(trade.status)) return;
  trade.status = "MANUAL_OVERRIDE";
  trade.executionStatus = "MANUAL_OVERRIDE";
  trade.manualOverride = true;
  trade.closedAt = new Date().toISOString();
  trade.openValue = 0;
  trade.unrealizedPnl = 0;
  trade.pnl = null;
  trade.exitPriceCents = null;
  trade.exitProceeds = null;
  trade.exitFeePerContract = null;
  trade.manualOverrideNote = "User is managing this Kalshi position manually; app detached without sending an order.";
  syncActiveTradePointer();
  updatePaperAccount();
  paperState.executionState = activeExecutorBlockingTrades().length ? "POSITION_OPEN" : "IDLE";
  paperLog(`MANUAL OVERRIDE ${trade.side} ${trade.ticker}: app detached ${trade.contracts} contracts without placing or canceling any Kalshi order.`);
}

function updatePaperAccount() {
  const openTrades = activeSystemTrades();
  let openValueTotal = 0;
  let unrealizedTotal = 0;
  for (const trade of openTrades) {
    if (!validCents(trade.currentBidCents)) continue;
    const openValue = paperExitProceeds(trade, trade.currentBidCents);
    trade.openValue = round4(openValue);
    trade.unrealizedPnl = round4(openValue - trade.entryCost);
    openValueTotal += openValue;
    unrealizedTotal += openValue - trade.entryCost;
  }
  paperState.botOpenPositionValue = liveConfig.liveTradingEnabled && openTrades.length && Number.isFinite(Number(paperState.liveSystemPositionValue))
    ? round4(Number(paperState.liveSystemPositionValue))
    : round4(openValueTotal);
  if (liveConfig.liveTradingEnabled && Number.isFinite(Number(paperState.openPositionValue))) {
    paperState.botOpenPositionValue = round4(Math.min(
      Math.max(0, Number(paperState.botOpenPositionValue || 0)),
      Math.max(0, Number(paperState.openPositionValue || 0))
    ));
  }
  paperState.unrealizedPnl = round4(unrealizedTotal);
  paperState.botRealizedPnl = round4((paperState.trades || []).reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0));
  paperState.realizedPnl = paperState.botRealizedPnl;
  paperState.botUnrealizedPnl = round4(paperState.unrealizedPnl || 0);
  paperState.botTotalPnl = round4(paperState.botRealizedPnl + paperState.botUnrealizedPnl);
  paperState.totalPnl = paperState.botTotalPnl;
  syncActiveTradePointer();
}

function paperExitProceeds(trade, exitPriceCents) {
  const exitFee = feePerContract(exitPriceCents, KALSHI_STANDARD_FEE_RATE, trade.contracts);
  return Math.max(0, trade.contracts * (exitPriceCents / 100 - exitFee));
}

function publishPaper() {
  updatePaperAccount();
  ensureShadowPaperAccount();
  latestSnapshot.paper = paperState;
  publish("paper", paperState);
}

function paperLog(message) {
  paperState.log.unshift({ time: new Date().toISOString(), message });
  paperState.log = paperState.log.slice(0, 300);
  logAudit("info", message);
}

function createShadowPaperAccount() {
  return {
    startingCash: SHADOW_PAPER_STARTING_CASH,
    cash: SHADOW_PAPER_STARTING_CASH,
    realizedPnl: 0,
    unrealizedPnl: 0,
    equity: SHADOW_PAPER_STARTING_CASH,
    openPosition: null,
    trades: [],
    lastUpdatedAt: null
  };
}

function normalizeShadowPaperAccount(raw) {
  const base = createShadowPaperAccount();
  if (!raw || typeof raw !== "object") return base;
  const account = {
    ...base,
    startingCash: Number.isFinite(Number(raw.startingCash)) ? Number(raw.startingCash) : base.startingCash,
    cash: Number.isFinite(Number(raw.cash)) ? Number(raw.cash) : base.cash,
    realizedPnl: Number.isFinite(Number(raw.realizedPnl)) ? Number(raw.realizedPnl) : 0,
    unrealizedPnl: Number.isFinite(Number(raw.unrealizedPnl)) ? Number(raw.unrealizedPnl) : 0,
    equity: Number.isFinite(Number(raw.equity)) ? Number(raw.equity) : base.equity,
    openPosition: raw.openPosition && typeof raw.openPosition === "object" ? raw.openPosition : null,
    trades: Array.isArray(raw.trades) ? raw.trades.slice(0, 100) : [],
    lastUpdatedAt: raw.lastUpdatedAt || null
  };
  return updateShadowPaperAccount(account);
}

function ensureShadowPaperAccount() {
  if (!paperState.shadow || typeof paperState.shadow !== "object") paperState.shadow = createPaperState().shadow;
  paperState.shadow.account = normalizeShadowPaperAccount(paperState.shadow.account);
  return paperState.shadow.account;
}

function updateShadowPaperAccount(account = ensureShadowPaperAccount(), markCents = null) {
  const open = account.openPosition;
  if (open && validCents(markCents)) {
    open.currentBidCents = round2(markCents);
  }
  if (open && validCents(open.currentBidCents)) {
    const exitFee = feePerContract(open.currentBidCents, KALSHI_STANDARD_FEE_RATE, open.contracts);
    open.openValue = round4(Math.max(0, open.contracts * (open.currentBidCents / 100 - exitFee)));
    open.unrealizedPnl = round4(open.openValue - Number(open.entryCost || 0));
    account.unrealizedPnl = open.unrealizedPnl;
  } else {
    account.unrealizedPnl = 0;
  }
  account.cash = round4(Math.max(0, Number(account.cash || 0)));
  account.realizedPnl = round4(Number(account.realizedPnl || 0));
  account.equity = round4(account.cash + Number(account.openPosition?.openValue || 0));
  account.lastUpdatedAt = new Date().toISOString();
  return account;
}

function shadowPaperSnapshot() {
  return {
    log: paperState.shadowLog || [],
    account: ensureShadowPaperAccount()
  };
}

let shadowPaperPersistTimer = null;
function persistShadowPaperSoon() {
  if (shadowPaperPersistTimer) clearTimeout(shadowPaperPersistTimer);
  shadowPaperPersistTimer = setTimeout(() => {
    shadowPaperPersistTimer = null;
    persistLatestResults().catch(() => {});
  }, 750);
}

function publishShadowPaper() {
  publish("shadow", shadowPaperSnapshot());
  persistShadowPaperSoon();
}

function shadowPaperLog(message, level = "info", data = {}) {
  if (!paperState.shadowLog) paperState.shadowLog = [];
  paperState.shadowLog.unshift({ time: new Date().toISOString(), level, message, ...data });
  paperState.shadowLog = paperState.shadowLog.slice(0, 300);
  publishShadowPaper();
}

function shadowObserveScoredResult(result, scan = null) {
  const candidate = shadowPaperCandidate(result, scan);
  if (!candidate) return;
  if (!paperState.shadow || typeof paperState.shadow !== "object") paperState.shadow = createPaperState().shadow;
  ensureShadowPaperAccount();
  shadowPaperMarkCandidate(candidate);
  const now = Date.now();
  const key = `${candidate.ticker}:${candidate.side}:${candidate.entry}:${candidate.target}`;
  const changed = paperState.shadow.lastCandidateKey !== key;
  if (changed) {
    paperState.shadow.lastCandidateKey = key;
    paperState.shadow.candidateSince = new Date().toISOString();
  }
  paperState.shadow.bestCandidate = candidate;
  if (changed || now - Number(paperState.shadow.lastLoggedAt || 0) >= SHADOW_PAPER_LOG_GAP_MS) {
    paperState.shadow.lastLoggedAt = now;
    shadowPaperLog(
      `Shadow paper would ${candidate.action} ${candidate.ticker}: ${candidate.entry}c -> ${candidate.target}c, stop ${candidate.stop}c, EV ${candidate.ev}, touch ${candidate.touch}. ${candidate.reason}`,
      "candidate",
      { ticker: candidate.ticker, side: candidate.side, strategyType: candidate.strategyType }
    );
  }
  const liveArmed = Boolean(paperState.enabled && !paperState.windingDown && !paperState.safetyHalted);
  const activeTrades = activeSystemTrades();
  const maxTradeReady = Number(paperState.settings?.maxTradeDollars || 0) > 0;
  const since = Date.parse(paperState.shadow.candidateSince || "");
  if (liveArmed && maxTradeReady && !activeTrades.length && Number.isFinite(since) && now - since >= SHADOW_PAPER_IDLE_WARNING_MS) {
    if (now - Number(paperState.shadow.lastIdleWarningAt || 0) >= SHADOW_PAPER_IDLE_WARNING_MS) {
      paperState.shadow.lastIdleWarningAt = now;
      shadowPaperLog(
        `Shadow divergence: old paper logic has seen ${candidate.ticker} for ${Math.round((now - since) / 1000)}s, but live has no tracked active trade. Check execution gates, fill verification, and lane settings.`,
        "warn",
        { ticker: candidate.ticker, side: candidate.side, strategyType: candidate.strategyType }
      );
    }
  }
}

function shadowPaperMarkCandidate(candidate) {
  const account = ensureShadowPaperAccount();
  const open = account.openPosition;
  if (open) {
    const sameTrade = open.ticker === candidate.ticker && open.side === candidate.side;
    if (sameTrade) {
      const mark = validCents(candidate.currentBid) ? candidate.currentBid : candidate.entry;
      updateShadowPaperAccount(account, mark);
      if (validCents(mark) && mark >= Number(open.targetPriceCents || 101)) {
        shadowPaperClosePosition(account, mark, "TARGET");
      } else if (validCents(mark) && mark <= Number(open.stopPriceCents || 0)) {
        shadowPaperClosePosition(account, mark, "STOP");
      } else {
        publishShadowPaper();
      }
    } else {
      publishShadowPaper();
    }
    return;
  }
  shadowPaperOpenPosition(account, candidate);
}

function shadowPaperOpenPosition(account, candidate) {
  if (!validCents(candidate.entry)) return;
  const entryFee = feePerContract(candidate.entry, KALSHI_STANDARD_FEE_RATE, 1);
  const perContractCost = candidate.entry / 100 + entryFee;
  const budget = Math.min(SHADOW_PAPER_MAX_TRADE_DOLLARS, Number(account.cash || 0));
  const contracts = Math.floor(budget / Math.max(0.01, perContractCost));
  if (contracts < 1) {
    updateShadowPaperAccount(account);
    publishShadowPaper();
    return;
  }
  const entryCost = round4(contracts * perContractCost);
  account.cash = round4(Number(account.cash || 0) - entryCost);
  account.openPosition = {
    id: `shadow-${Date.now()}`,
    openedAt: new Date().toISOString(),
    action: candidate.action,
    side: candidate.side,
    ticker: candidate.ticker,
    marketTitle: candidate.marketTitle,
    strategyType: candidate.strategyType,
    contracts,
    entryPriceCents: candidate.entry,
    currentBidCents: validCents(candidate.currentBid) ? candidate.currentBid : candidate.entry,
    targetPriceCents: candidate.target,
    stopPriceCents: candidate.stop,
    entryFeePerContract: round4(entryFee),
    entryCost,
    reason: candidate.reason
  };
  updateShadowPaperAccount(account);
  shadowPaperLog(
    `Shadow paper OPEN ${contracts} ${candidate.action} ${candidate.ticker} at ${candidate.entry}c; target ${candidate.target}c, stop ${candidate.stop}c.`,
    "open",
    { ticker: candidate.ticker, side: candidate.side, contracts, entry: candidate.entry }
  );
}

function shadowPaperClosePosition(account, exitPriceCents, reason) {
  const open = account.openPosition;
  if (!open || !validCents(exitPriceCents)) return;
  const exitFee = feePerContract(exitPriceCents, KALSHI_STANDARD_FEE_RATE, open.contracts);
  const proceeds = round4(Math.max(0, open.contracts * (exitPriceCents / 100 - exitFee)));
  const pnl = round4(proceeds - Number(open.entryCost || 0));
  account.cash = round4(Number(account.cash || 0) + proceeds);
  account.realizedPnl = round4(Number(account.realizedPnl || 0) + pnl);
  const closed = {
    ...open,
    closedAt: new Date().toISOString(),
    exitPriceCents: round2(exitPriceCents),
    exitFeePerContract: round4(exitFee),
    proceeds,
    pnl,
    closeReason: reason
  };
  account.trades = [closed, ...(account.trades || [])].slice(0, 100);
  account.openPosition = null;
  updateShadowPaperAccount(account);
  shadowPaperLog(
    `Shadow paper ${reason} ${closed.ticker}: ${closed.contracts} contracts ${closed.entryPriceCents}c -> ${closed.exitPriceCents}c, P/L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`,
    pnl >= 0 ? "win" : "loss",
    { ticker: closed.ticker, side: closed.side, pnl }
  );
}

function shadowPaperCandidate(result, scan = null) {
  if (!result || typeof result !== "object") return null;
  const strategy = String(result.strategyType || "");
  const paperLikeStrategy = ["BTC_TECHNICAL_FALLBACK", "BTC_EV_SWING", "SIDEWAYS_VOLATILITY", "SPORTS_MICRO_SCALP", "LATE_LOCK_SCRAPE"].includes(strategy);
  const watchStrategy = strategy === "SPORTS_BEST_CHOP_WATCH";
  const entry = Number(result.currentBuyPriceCents);
  const target = Number(result.sellTargetCents || result.minTargetFor10PctCents);
  const stop = Number(result.stopPriceCents);
  const bidFallback = entry - Math.max(1, Number(result.spreadCents || 1));
  const currentBid = Number(result.currentBidCents ?? result.currentSellPriceCents ?? result.bidPriceCents ?? bidFallback);
  if (!validCents(entry) || !validCents(target) || !validCents(stop)) return null;
  const positiveEv = Number(result.evRoiPct || 0) >= Number(scan?.settings?.minDisplayEvPct ?? DEFAULT_SETTINGS.minDisplayEvPct);
  const enoughTouch = Number(result.adjustedTouchProbability || 0) >= 0.35 || Boolean(result.targetTouchedRecently);
  const sideways = Number(result.chopScore || 0) >= 0.35 || Number(result.rangeCents || 0) >= 3;
  if (!result.qualifies && !(paperLikeStrategy && positiveEv && enoughTouch && sideways) && !watchStrategy) return null;
  return {
    action: result.recommendation || `BUY ${result.side || ""}`,
    side: result.side,
    ticker: result.ticker,
    marketTitle: result.marketTitle,
    entry: round2(entry),
    currentBid: validCents(currentBid) ? round2(currentBid) : round2(entry),
    target: round2(target),
    stop: round2(stop),
    ev: result.evRoiPct == null ? "-" : formatPct(result.evRoiPct),
    touch: result.adjustedTouchProbability == null ? "-" : formatPct(Number(result.adjustedTouchProbability) * 100),
    strategyType: strategy || "UNKNOWN",
    reason: result.reasonSummary || "old paper candidate"
  };
}

function systemTradesText(trades) {
  if (!trades.length) return "No system trades recorded yet.\n";
  return trades.map((trade, index) => {
    const opened = trade.openedAt ? new Date(trade.openedAt).toLocaleString() : "-";
    const closed = trade.closedAt ? new Date(trade.closedAt).toLocaleString() : "-";
    const status = trade.status || "-";
    const pnl = trade.pnl == null ? "-" : `${trade.pnl >= 0 ? "+" : ""}$${Number(trade.pnl).toFixed(2)}`;
    const openPnl = trade.unrealizedPnl == null ? "-" : `${trade.unrealizedPnl >= 0 ? "+" : ""}$${Number(trade.unrealizedPnl).toFixed(2)}`;
    return [
      `#${index + 1} ${status}`,
      `Opened: ${opened}`,
      `Closed: ${closed}`,
      `Trade: ${trade.recommendation || `BUY ${trade.side || ""}`} ${trade.ticker || ""}`,
      `Market: ${trade.subtitle || trade.marketTitle || ""}`,
      `Contracts: ${trade.contracts || 0}`,
      `Entry: ${trade.entryPriceCents ?? "-"}c`,
      `Target: ${trade.targetPriceCents ?? "-"}c`,
      `Stop: ${trade.softStopPriceCents ?? "-"}c / hard ${trade.hardStopPriceCents ?? "-"}c`,
      `Current bid: ${trade.currentBidCents ?? "-"}c`,
      `Open value: $${Number(trade.openValue || 0).toFixed(2)}`,
      `Open P/L: ${openPnl}`,
      `Final P/L: ${pnl}`,
      `Reason: ${trade.failureReason || trade.reasonSummary || ""}`
    ].join("\n");
  }).join("\n\n");
}

function systemTradesCsv(trades) {
  const columns = ["openedAt", "closedAt", "status", "recommendation", "ticker", "market", "contracts", "entryPriceCents", "targetPriceCents", "softStopPriceCents", "currentBidCents", "openValue", "unrealizedPnl", "pnl"];
  const rows = [columns.join(",")];
  for (const trade of trades) {
    const row = {
      ...trade,
      market: trade.subtitle || trade.marketTitle || ""
    };
    rows.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  return rows.join("\n");
}

function scannedContractsText(rows) {
  if (!rows.length) return "No scanned contracts recorded yet.\n";
  return rows.map((row, index) => {
    const sides = (row.sides || []).map((side) => {
      return `  ${side.side || "-"}: ${side.entry ?? "-"}c -> ${side.target ?? "-"}c | EV ${side.ev ?? "-"} | ${side.reason || ""}`;
    }).join("\n");
    return [
      `#${index + 1} ${row.event || row.market || row.ticker || ""}`,
      `Time: ${row.time || ""}`,
      `Market: ${row.market || ""}`,
      `Ticker: ${row.ticker || ""}`,
      `Decision time: ${row.decision_time || ""}`,
      sides
    ].join("\n");
  }).join("\n\n");
}

function scannedContractsCsv(rows) {
  const columns = ["time", "event", "market", "ticker", "side", "decision", "entry", "target", "ev", "netProfit", "volatility", "touch", "reason"];
  const out = [columns.join(",")];
  for (const row of rows) {
    for (const side of row.sides || []) {
      out.push(columns.map((column) => {
        if (column in side) return csvCell(side[column]);
        return csvCell(row[column]);
      }).join(","));
    }
  }
  return out.join("\n");
}

function auditToCsv(rows) {
  const columns = ["time", "level", "message"];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
}

function dedupeResultsForDisplay(results) {
  const bestByEvent = new Map();
  for (const result of results) {
    const key = displayDedupeKey(result);
    const existing = bestByEvent.get(key);
    if (!existing || (result.evRoiPct || -999) > (existing.evRoiPct || -999)) {
      bestByEvent.set(key, result);
    }
  }
  return [...bestByEvent.values()].sort(compareDisplayResults);
}

function compareDisplayResults(a, b) {
  const activeA = (a.missedPasses || 0) === 0 ? 1 : 0;
  const activeB = (b.missedPasses || 0) === 0 ? 1 : 0;
  if (activeA !== activeB) return activeB - activeA;
  if (activeA && activeB) return (b.evRoiPct || -999) - (a.evRoiPct || -999);
  return Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0);
}

function displayDedupeKey(result) {
  const text = `${result.category || ""} ${result.series_ticker || ""} ${result.ticker || ""}`.toLowerCase();
  if (text.includes("crypto") || text.includes("kxbtc")) {
    return `BTC:${result.occurrence_datetime || result.expected_expiration_time || result.close_time || result.event_ticker || result.ticker}`;
  }
  return result.event_ticker || result.ticker;
}

async function fetchOrderbook(scan, baseUrl, ticker) {
  const url = `${baseUrl}/markets/${encodeURIComponent(ticker)}/orderbook?depth=${ORDERBOOK_DEPTH}`;
  try {
    const data = await fetchWithRetry(url, { signal: scan.abortController.signal, endpointLabel: `/markets/${ticker}/orderbook`, paced: true, maxRetries: 0 });
    return data.orderbook_fp || data.orderbook || data;
  } catch (error) {
    if (error.status === 429) noteDetailedCooldown();
    throw error;
  }
}

async function fetchCandles(scan, baseUrl, market) {
  const cached = getCachedCandles(market.ticker);
  if (cached) return cached;
  if (Date.now() < candleCooldownUntil) return [];
  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - 60 * 60;
  const singleUrl = new URL(`${baseUrl}/series/${encodeURIComponent(market.series_ticker || "UNKNOWN")}/markets/${encodeURIComponent(market.ticker)}/candlesticks`);
  singleUrl.searchParams.set("period_interval", "1");
  singleUrl.searchParams.set("start_ts", String(startTs));
  singleUrl.searchParams.set("end_ts", String(endTs));
  try {
    const single = await fetchWithRetry(singleUrl.toString(), { signal: scan.abortController.signal, endpointLabel: "/series/{series}/markets/{ticker}/candlesticks", paced: true, maxRetries: 0 });
    const candles = single.candlesticks || single.market?.candlesticks || [];
    setCachedCandles(market.ticker, candles);
    return candles;
  } catch (error) {
    if (error.status === 429) noteCandleCooldown();
    throw error;
  }
}

async function fetchWithRetry(url, options = {}) {
  let retryCount = 0;
  let lastError;
  const maxRetries = options.maxRetries ?? 3;
  for (; retryCount <= maxRetries; retryCount += 1) {
    try {
      if (options.paced) await paceDetailedRequest(options.signal);
      return await fetchJson(url, options);
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError") throw error;
      if (error.status === 429 && options.paced) noteDetailedCooldown();
      if (![429, 500, 502, 503, 504].includes(error.status) || retryCount === maxRetries) break;
      logApiFailure(options.endpointLabel || url, error, retryCount, "retrying");
      await sleep((1200 * 2 ** retryCount) + Math.floor(Math.random() * 500), options.signal);
    }
  }
  lastError.retryCount = retryCount;
  throw lastError;
}

function getCachedCandles(ticker) {
  const cached = candleCache.get(ticker);
  if (!cached) return null;
  if (Date.now() - cached.at > CANDLE_CACHE_MS) {
    candleCache.delete(ticker);
    return null;
  }
  return cached.candles;
}

function setCachedCandles(ticker, candles) {
  candleCache.set(ticker, { at: Date.now(), candles });
  if (candleCache.size > 600) {
    const oldest = [...candleCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
    for (const [key] of oldest) candleCache.delete(key);
  }
}

function noteCandleCooldown() {
  candleCooldownUntil = Date.now() + CANDLE_RATE_LIMIT_COOLDOWN_MS;
  if (Date.now() - lastCandleCooldownLogAt > 30_000) {
    lastCandleCooldownLogAt = Date.now();
    logAudit("warn", `Kalshi candle endpoint rate-limited. Cooling candle pulls for ${Math.round(CANDLE_RATE_LIMIT_COOLDOWN_MS / 1000)}s while orderbook scans continue.`);
  }
}

async function paceDetailedRequest(signal) {
  const cooldownWait = Math.max(0, detailedCooldownUntil - Date.now());
  if (cooldownWait) await sleep(cooldownWait, signal);
  const minGapMs = DETAILED_REQUEST_MIN_GAP_MS;
  const now = Date.now();
  const waitMs = Math.max(0, lastDetailedRequestAt + minGapMs - now);
  if (waitMs) await sleep(waitMs, signal);
  lastDetailedRequestAt = Date.now();
}

function noteDetailedCooldown() {
  detailedCooldownUntil = Date.now() + DETAIL_RATE_LIMIT_COOLDOWN_MS;
  if (Date.now() - lastDetailedCooldownLogAt > 30_000) {
    lastDetailedCooldownLogAt = Date.now();
    logAudit("warn", `Kalshi detailed market endpoint rate-limited. Pausing orderbook/candle detail pulls for ${Math.round(DETAIL_RATE_LIMIT_COOLDOWN_MS / 1000)}s.`);
  }
}

async function fetchJson(url, options = {}) {
  if (isKalshiTradeApiUrl(url)) {
    const { baseUrl, pathname } = splitKalshiTradeApiUrl(url);
    if (!liveConfig.configured) {
      throw new Error("Kalshi API credentials are required. Public Kalshi API reads are disabled in this scanner.");
    }
    return kalshiAuthFetch(pathname, { baseUrl, signal: options.signal });
  }
  throw new Error(`Blocked non-Kalshi remote API request: ${url}`);
}

function isKalshiTradeApiUrl(url) {
  try {
    const parsed = new URL(url);
    return /\.kalshi\.com$/i.test(parsed.hostname) && parsed.pathname.includes("/trade-api/v2");
  } catch {
    return false;
  }
}

function splitKalshiTradeApiUrl(url) {
  const parsed = new URL(url);
  const marker = "/trade-api/v2";
  const index = parsed.pathname.indexOf(marker);
  if (index < 0) throw new Error(`Not a Kalshi Trade API URL: ${url}`);
  const baseUrl = `${parsed.origin}${parsed.pathname.slice(0, index + marker.length)}`;
  const apiPath = parsed.pathname.slice(index + marker.length) || "/";
  return { baseUrl, pathname: `${apiPath}${parsed.search}` };
}

async function kalshiAuthFetch(pathname, { method = "GET", body = null, baseUrl = liveConfig.baseUrl, signal = null } = {}) {
  if (!liveConfig.configured) throw new Error("Kalshi credentials are not configured.");
  const methodUpper = method.toUpperCase();
  const timestamp = String(Date.now());
  const basePath = new URL(baseUrl).pathname.replace(/\/$/, "");
  const signPath = `${basePath}${pathname.split("?")[0]}`;
  const message = `${timestamp}${methodUpper}${signPath}`;
  const signature = cryptoSign("sha256", Buffer.from(message), {
    key: liveConfig.privateKeyPem,
    padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
    saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST
  }).toString("base64");
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: methodUpper,
    signal,
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "KALSHI-ACCESS-KEY": liveConfig.apiKeyId,
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
      "KALSHI-ACCESS-SIGNATURE": signature
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 1000) };
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || response.statusText || "Kalshi authenticated request failed");
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

async function getLiveBalance() {
  const data = await kalshiAuthFetch("/portfolio/balance");
  return { ok: true, ...data };
}

async function getLiveTickerPosition(ticker) {
  if (!liveConfig.configured || !ticker) return { position: 0, raw: null };
  const wantedTicker = String(ticker).toUpperCase();
  const cached = liveTruth.positionsByTicker.get(wantedTicker);
  if (cached && Date.now() - liveTruth.lastRefreshAt < 1_500) return cached;
  const fetchRows = async (countFilter) => {
    const params = new URLSearchParams();
    params.set("ticker", ticker);
    if (countFilter) params.set("count_filter", countFilter);
    params.set("limit", "100");
    const pathname = `/portfolio/positions?${params.toString()}`;
    const data = await kalshiAuthFetchWithPortfolioFallback(pathname);
    return Array.isArray(data.market_positions) ? data.market_positions : [];
  };
  let positions;
  try {
    positions = await fetchRows("position");
    const filteredRow = positions.find((position) => String(position.ticker || "").toUpperCase() === wantedTicker);
    if (!filteredRow || !livePositionRowHasExposure(filteredRow)) {
      const broadRows = await fetchRows("");
      const broadRow = broadRows.find((position) => String(position.ticker || "").toUpperCase() === wantedTicker);
      if (broadRow) positions = [broadRow];
    }
  } catch (error) {
    if (error.status === 404) {
      return { position: 0, raw: { unavailable: true, reason: "positions endpoint not found" } };
    }
    throw error;
  }
  paperState.positionsEndpointUnavailable = false;
  const row = positions.find((position) => String(position.ticker || "").toUpperCase() === wantedTicker);
  if (!row) {
    const cachedOrders = liveTruth.ordersByTicker.get(wantedTicker) || [];
    return { position: 0, exposureDollars: 0, restingOrdersCount: cachedOrders.length, raw: cachedOrders.length ? { cached_open_orders: cachedOrders } : null };
  }
  const value = Number(row.position_fp ?? row.position ?? row.count ?? 0);
  return {
    position: Number.isFinite(value) ? value : 0,
    exposureDollars: dollarsFromAny(row.market_exposure_dollars),
    restingOrdersCount: Number(row.resting_orders_count || 0),
    raw: row
  };
}

function startLiveTruthLoop() {
  if (liveTruthTimer || !liveConfig.liveTradingEnabled) return;
  liveTruthTimer = setInterval(() => {
    refreshLiveTruth().catch((error) => {
      liveTruth.lastError = kalshiErrorDetail(error) || error.message;
    });
  }, 1_000);
  refreshLiveTruth().catch((error) => {
    liveTruth.lastError = kalshiErrorDetail(error) || error.message;
  });
}

function startPortfolioReconcileLoop() {
  if (portfolioReconcileTimer || !liveConfig.liveTradingEnabled) return;
  portfolioReconcileTimer = setInterval(() => {
    refreshLiveAccountFromKalshi()
      .then(() => publishPaper())
      .catch((error) => {
        paperState.reconciliationError = kalshiErrorDetail(error) || error.message;
      });
  }, LIVE_PORTFOLIO_RECONCILE_MS);
}

async function refreshLiveTruth() {
  if (!liveConfig.liveTradingEnabled) return;
  const [positions, orders] = await Promise.all([
    getLivePositions({ countFilter: "", limit: 1000 }).catch((error) => {
      liveTruth.lastError = kalshiErrorDetail(error) || error.message;
      return [];
    }),
    getLiveOrders({ status: "open", limit: 1000 }).catch(() => [])
  ]);
  const positionsByTicker = new Map();
  for (const row of positions) {
    const ticker = String(row.ticker || row.market_ticker || "").toUpperCase();
    if (!ticker || !livePositionRowHasExposure(row)) continue;
    const value = Number(row.position_fp ?? row.position ?? row.count ?? 0);
    positionsByTicker.set(ticker, {
      position: Number.isFinite(value) ? value : 0,
      exposureDollars: dollarsFromAny(row.market_exposure_dollars),
      restingOrdersCount: Number(row.resting_orders_count || 0),
      raw: row
    });
  }
  const ordersByTicker = new Map();
  for (const order of orders) {
    const ticker = String(order.ticker || order.market_ticker || "").toUpperCase();
    if (!ticker) continue;
    if (!ordersByTicker.has(ticker)) ordersByTicker.set(ticker, []);
    ordersByTicker.get(ticker).push(order);
  }
  liveTruth.positionsByTicker = positionsByTicker;
  liveTruth.ordersByTicker = ordersByTicker;
  liveTruth.lastRefreshAt = Date.now();
  liveTruth.lastError = "";
  paperState.liveTruthLastRefreshAt = new Date(liveTruth.lastRefreshAt).toISOString();
  paperState.liveTruthOpenOrderTickers = ordersByTicker.size;
}

async function getLiveOrders({ status = "open", limit = 1000 } = {}) {
  if (!liveConfig.configured) return [];
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("limit", String(limit));
  const paths = [
    `/portfolio/orders?${params.toString()}`,
    `/portfolio/events/orders?${params.toString()}`
  ];
  for (const pathname of paths) {
    try {
      const data = await kalshiAuthFetch(pathname);
      return Array.isArray(data.orders) ? data.orders : Array.isArray(data.event_orders) ? data.event_orders : [];
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  return [];
}

async function getLivePositions({ countFilter = "position", limit = 1000 } = {}) {
  if (!liveConfig.configured) return [];
  const positions = [];
  let cursor = "";
  do {
    const params = new URLSearchParams();
    if (countFilter) params.set("count_filter", countFilter);
    params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    let data;
    try {
      data = await kalshiAuthFetchWithPortfolioFallback(`/portfolio/positions?${params.toString()}`);
    } catch (error) {
      if (error.status === 404) {
        paperState.positionsEndpointUnavailable = true;
        return [];
      }
      throw error;
    }
    paperState.positionsEndpointUnavailable = false;
    positions.push(...(Array.isArray(data.market_positions) ? data.market_positions : []));
    cursor = data.cursor || "";
  } while (cursor);
  return positions;
}

async function kalshiAuthFetchWithPortfolioFallback(pathname, options = {}) {
  try {
    return await kalshiAuthFetch(pathname, options);
  } catch (error) {
    const fallbackBaseUrl = "https://external-api.kalshi.com/trade-api/v2";
    if (error.status !== 404 || liveConfig.baseUrl === fallbackBaseUrl) throw error;
    return await kalshiAuthFetch(pathname, { ...options, baseUrl: fallbackBaseUrl });
  }
}

function dollarsFromAny(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function livePositionRowHasExposure(row) {
  if (!row) return false;
  const position = Math.abs(Number(row.position_fp ?? row.position ?? row.count ?? 0));
  const exposure = Math.abs(dollarsFromAny(row.market_exposure_dollars));
  const restingOrders = Math.abs(Number(row.resting_orders_count || 0));
  return position >= 1 || exposure > 0 || restingOrders > 0;
}

function applyLivePositionToTrade(trade, livePosition) {
  if (!trade || !livePosition) return;
  const position = Number(livePosition.position || 0);
  trade.livePositionContracts = Number.isFinite(position) ? position : 0;
  trade.liveMarketExposureDollars = round4(Number(livePosition.exposureDollars || 0));
  const portfolioEntry = portfolioAverageEntryCents(livePosition.raw);
  if (validCents(portfolioEntry)) {
    applyPortfolioEntryPriceToTrade(trade, portfolioEntry, "portfolio-position");
  }
  if (Math.abs(trade.livePositionContracts) > 0) {
    trade.openValue = trade.liveMarketExposureDollars || trade.openValue || 0;
  }
}

function portfolioAverageEntryCents(row) {
  if (!row || typeof row !== "object") return null;
  const value = orderFieldNumber(row, [
    "average_price",
    "avg_price",
    "avg_entry_price",
    "average_entry_price",
    "entry_price",
    "price",
    "yes_avg_price",
    "no_avg_price",
    "yes_price",
    "no_price"
  ]);
  if (!Number.isFinite(value)) return null;
  return value <= 1 ? clamp(round2(value * 100), 1, 99) : clamp(round2(value), 1, 99);
}

function applyPortfolioEntryPriceToTrade(trade, entryPriceCents, source = "portfolio") {
  if (!trade || !validCents(entryPriceCents)) return false;
  const next = round2(entryPriceCents);
  const prev = validCents(trade.entryPriceCents) ? round2(trade.entryPriceCents) : null;
  trade.portfolioEntryPriceCents = next;
  trade.portfolioEntrySource = source;
  trade.portfolioEntryCheckedAt = new Date().toISOString();
  if (prev === next) return false;
  trade.entryPriceCents = next;
  trade.currentBuyPriceCents = next;
  trade.entryFeePerContract = feePerContract(next, KALSHI_STANDARD_FEE_RATE, trade.contracts);
  trade.entryCost = round4(Number(trade.contracts || 0) * (next / 100 + trade.entryFeePerContract));
  trade.reconciledEntryPriceFromPortfolio = true;
  trade.reconciliationNote = `Entry corrected from ${prev == null ? "-" : `${prev}c`} to ${next}c by ${source}.`;
  return true;
}

function reconcileSportsArbActiveRows(positionsByTicker, portfolioRows = []) {
  const portfolioByTicker = new Map((portfolioRows || []).map((row) => [String(row.ticker || "").toUpperCase(), row]));
  const arbRows = activeSystemTrades().filter((trade) => trade.strategyType === "SPORTS_PAIR_ARB_HOLD");
  const byTicker = new Map();
  for (const trade of arbRows) {
    const ticker = String(trade.ticker || "").toUpperCase();
    if (!ticker) continue;
    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    byTicker.get(ticker).push(trade);
  }

  const keepers = [];
  for (const [ticker, rows] of byTicker.entries()) {
    const livePosition = positionsByTicker.get(ticker);
    const liveCount = Math.abs(Number(livePosition?.position || 0));
    const sorted = [...rows].sort((a, b) => {
      const aTime = Date.parse(a.openedConfirmedAt || a.openedAt || a.lastCheckedAt || "") || 0;
      const bTime = Date.parse(b.openedConfirmedAt || b.openedAt || b.lastCheckedAt || "") || 0;
      return bTime - aTime;
    });
    const keeper = sorted[0];
    const portfolio = portfolioByTicker.get(ticker);

    for (const duplicate of sorted.slice(1)) {
      duplicate.status = "DUPLICATE_RECONCILED";
      duplicate.executionStatus = "DUPLICATE_RECONCILED";
      duplicate.closedAt = duplicate.closedAt || new Date().toISOString();
      duplicate.failureReason = `Consolidated into live Kalshi ticker position ${ticker}; duplicate app row removed from active arb accounting.`;
      duplicate.openValue = 0;
      duplicate.unrealizedPnl = 0;
    }

    if (!keeper) continue;
    if (portfolio?.marketTitle) {
      keeper.marketTitle = portfolio.marketTitle;
      keeper.subtitle = portfolio.marketTitle;
    }
    if (portfolio?.subtitle) keeper.selectionLabel = portfolio.subtitle;

    if (liveCount >= 1 && livePosition) {
      applyLivePositionToTrade(keeper, livePosition);
      keeper.contracts = liveCount;
      keeper.status = "OPEN";
      keeper.entryConfirmationStatus = "filled";
      keeper.reconciliationWarning = null;
      keepers.push(keeper);
    } else {
      keeper.status = "FLAT_RECONCILED";
      keeper.executionStatus = "FLAT_RECONCILED";
      keeper.closedAt = keeper.closedAt || new Date().toISOString();
      keeper.failureReason = "Kalshi portfolio reconciliation reports no live arb leg for this ticker.";
      keeper.openValue = 0;
      keeper.unrealizedPnl = 0;
    }
  }

  const byExposure = new Map();
  for (const trade of keepers) {
    const key = String(trade.exposureKey || "").trim();
    if (!key) continue;
    if (!byExposure.has(key)) byExposure.set(key, []);
    byExposure.get(key).push(trade);
  }

  paperState.sportsArbPositionWarnings = [];
  for (const [exposureKey, legs] of byExposure.entries()) {
    const counts = legs.map((leg) => Math.abs(Number(leg.livePositionContracts || leg.contracts || 0))).filter((count) => count >= 1);
    const uniqueTickers = new Set(legs.map((leg) => String(leg.ticker || "").toUpperCase()).filter(Boolean));
    const sides = new Set(legs.map((leg) => String(leg.side || "").toUpperCase()).filter(Boolean));
    if (sides.size !== 1) {
      const warning = `${exposureKey}: mixed YES/NO legs are duplicate exposure, not a valid two-outcome arb. Manual review required.`;
      paperState.sportsArbPositionWarnings.push(warning);
      for (const leg of legs) {
        leg.executionStatus = "NOT_ARB_REVIEW";
        leg.reconciliationWarning = warning;
      }
      continue;
    }
    if (uniqueTickers.size < 2 || counts.length < 2) {
      const warning = `${exposureKey}: only ${uniqueTickers.size} live arb leg found; hedge is incomplete.`;
      paperState.sportsArbPositionWarnings.push(warning);
      for (const leg of legs) {
        leg.executionStatus = "HEDGE_IMBALANCE";
        leg.reconciliationWarning = warning;
      }
      continue;
    }
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    if (minCount !== maxCount) {
      const warning = `${exposureKey}: live arb legs are unbalanced (${counts.join(" / ")} contracts); ${maxCount - minCount} contract(s) need hedge attention.`;
      paperState.sportsArbPositionWarnings.push(warning);
      for (const leg of legs) {
        leg.executionStatus = "HEDGE_IMBALANCE";
        leg.reconciliationWarning = warning;
        leg.hedgedContracts = minCount;
        leg.unhedgedContracts = Math.max(0, Math.abs(Number(leg.livePositionContracts || leg.contracts || 0)) - minCount);
      }
    } else {
      for (const leg of legs) {
        leg.executionStatus = "ARB_HELD_TO_EXPIRATION";
        leg.hedgedContracts = minCount;
        leg.unhedgedContracts = 0;
        leg.reconciliationWarning = null;
      }
    }
  }
}

async function reconcileLiveSystemPositions() {
  if (!liveConfig.liveTradingEnabled) return;
  const filteredPositions = await getLivePositions({ countFilter: "position" });
  const broadPositions = await getLivePositions({ countFilter: "", limit: 1000 }).catch((error) => {
    paperState.reconciliationError = kalshiErrorDetail(error) || error.message;
    return [];
  });
  const mergedPositions = new Map();
  for (const row of [...broadPositions, ...filteredPositions]) {
    const ticker = String(row.ticker || "").toUpperCase();
    if (!ticker || !livePositionRowHasExposure(row)) continue;
    mergedPositions.set(ticker, row);
  }
  const positions = [...mergedPositions.values()];
  const activeTrades = activeSystemTrades();
  const systemTickers = new Set(activeTrades.map((trade) => String(trade.ticker || "").toUpperCase()).filter(Boolean));
  const positionsByTicker = new Map();
  for (const row of positions) {
    const ticker = String(row.ticker || "").toUpperCase();
    if (!ticker) continue;
    const position = Number(row.position_fp ?? row.position ?? row.count ?? 0);
    const exposure = dollarsFromAny(row.market_exposure_dollars);
    positionsByTicker.set(ticker, {
      position: Number.isFinite(position) ? position : 0,
      exposureDollars: exposure,
      restingOrdersCount: Number(row.resting_orders_count || 0),
      raw: row
    });
  }
  const portfolioRows = await Promise.all([...positionsByTicker.entries()]
    .filter(([, livePosition]) => Math.abs(Number(livePosition.position || 0)) >= 1 || livePosition.exposureDollars > 0 || Number(livePosition.restingOrdersCount || 0) > 0)
    .map(async ([ticker, livePosition]) => {
      const detail = await getPortfolioMarketSummary(ticker).catch(() => null);
      return {
        ticker,
        position: livePosition.position,
        exposureDollars: round4(livePosition.exposureDollars || 0),
        restingOrdersCount: Number(livePosition.restingOrdersCount || 0),
        systemTracked: systemTickers.has(ticker),
        marketTitle: detail?.title || ticker,
        subtitle: detail?.subtitle || detail?.yes_sub_title || detail?.no_sub_title || "Kalshi portfolio position",
        marketStatus: detail?.status || "",
        expected_expiration_time: detail?.expected_expiration_time || null,
        close_time: detail?.close_time || null
      };
    }));
  paperState.livePortfolioPositions = portfolioRows;
  reconcileSportsArbActiveRows(positionsByTicker, portfolioRows);
  await reconcileExpiredArbHoldsFromPortfolio(positionsByTicker, portfolioRows);

  let systemExposure = 0;
  const untracked = [];
  const reconciledActiveTrades = activeSystemTrades();
  for (const activeTrade of reconciledActiveTrades) {
    if (activeTrade.strategyType === "SPORTS_PAIR_ARB_HOLD" || activeTrade.strategyType === "BTC_CROSS_STRIKE_ARB_HOLD") continue;
    const ticker = String(activeTrade.ticker || "").toUpperCase();
    const livePosition = positionsByTicker.get(ticker);
    const liveCount = Math.abs(Number(livePosition?.position || 0));
    const hasRestingOrders = Number(livePosition?.restingOrdersCount || 0) > 0;
    const hasExposure = Number(livePosition?.exposureDollars || 0) > 0;
    if (!ticker || liveCount >= 1 || hasRestingOrders || hasExposure || livePosition?.raw?.unavailable) continue;
    const openedMs = Date.parse(activeTrade.openedAt || activeTrade.lastCheckedAt || "");
    if (Number.isFinite(openedMs) && Date.now() - openedMs < LIVE_POSITION_RECONCILE_GRACE_MS) continue;
    await closeTrackedTradeWithoutOrder(
      activeTrade,
      activeTrade.currentBidCents || activeTrade.targetLimitPriceCents || activeTrade.entryPriceCents,
      "FLAT_RECONCILED",
      "Kalshi portfolio reconciliation reports no live position for this app-tracked ticker"
    );
  }
  for (const [ticker, livePosition] of positionsByTicker.entries()) {
    if (Math.abs(livePosition.position) < 1) continue;
    const activeTrade = reconciledActiveTrades.find((trade) => String(trade.ticker || "").toUpperCase() === ticker);
    if (activeTrade) {
      const trackedContracts = Math.max(0, Number(activeTrade.contracts || 0));
      const liveContracts = Math.abs(Number(livePosition.position || 0));
      const trackedRatio = liveContracts > 0 && trackedContracts > 0 ? Math.min(1, trackedContracts / liveContracts) : 0;
      systemExposure += livePosition.exposureDollars * trackedRatio;
      applyLivePositionToTrade(activeTrade, livePosition);
      if (Math.abs(livePosition.position) > Number(activeTrade.contracts || 0)) {
        activeTrade.reconciliationWarning = `Kalshi reports ${livePosition.position} contracts on this ticker; app is only managing its tracked ${activeTrade.contracts}.`;
      }
    } else if (systemTickers.has(ticker)) {
      const lastTrade = historicalSystemTrades.find((trade) => String(trade.ticker || "").toUpperCase() === ticker);
      untracked.push(`${ticker} ${livePosition.position} contracts / $${round2(livePosition.exposureDollars)} still live on Kalshi; last app status ${lastTrade?.status || "unknown"}`);
    } else {
      untracked.push(`${ticker} ${livePosition.position} contracts / $${round2(livePosition.exposureDollars)}`);
    }
  }
  paperState.liveSystemPositionValue = round4(systemExposure);
  paperState.botOpenPositionValue = round4(systemExposure);
  paperState.reconciliationWarnings = untracked;
}

async function reconcileExpiredArbHoldsFromPortfolio(positionsByTicker, portfolioRows = []) {
  const portfolioByTicker = new Map((portfolioRows || []).map((row) => [String(row.ticker || "").toUpperCase(), row]));
  let changed = false;
  for (const trade of activeSystemTrades()) {
    if (!isCompletedArbHold(trade)) continue;
    if (await closeExpiredArbHoldFromPortfolio(trade, positionsByTicker, portfolioByTicker.get(String(trade.ticker || "").toUpperCase()))) changed = true;
  }
  if (changed) updatePaperAccount();
}

async function getPortfolioMarketSummary(ticker) {
  const key = String(ticker || "").toUpperCase();
  if (!key) return null;
  const cached = portfolioMarketDetailCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < 60_000) return cached.market;
  const data = await kalshiAuthFetch(`/markets/${encodeURIComponent(key)}`);
  const market = normalizeMarket(data.market || data);
  portfolioMarketDetailCache.set(key, { fetchedAt: Date.now(), market });
  return market;
}

async function refreshLiveAccountFromKalshi() {
  const balance = await getLiveBalance();
  const cashCents = Number(balance.balance ?? balance.cash_balance ?? balance.available_balance ?? 0);
  const positionValueCents = Number(balance.portfolio_value ?? balance.member_balance ?? 0);
  const cash = round4(Number.isFinite(Number(balance.balance_dollars)) ? Number(balance.balance_dollars) : cashCents / 100);
  const openPositionValue = round4(Math.max(0, positionValueCents / 100));
  const equity = round4(cash + openPositionValue);
  paperState.cash = cash;
  paperState.openPositionValue = openPositionValue;
  paperState.equity = equity || cash;
  await reconcileLiveSystemPositions().catch((error) => {
    paperState.reconciliationError = kalshiErrorDetail(error) || error.message;
  });
  updatePaperAccount();
  paperState.configured = liveConfig.configured;
  paperState.liveTradingEnabled = liveConfig.liveTradingEnabled;
  paperState.lastBalanceAt = new Date().toISOString();
  return balance;
}

async function placeKalshiOrder(order) {
  if (!liveConfig.liveTradingEnabled) {
    throw new Error("Live trading is disabled; BOT DESTROYER no longer creates dry-run orders.");
  }
  return kalshiAuthFetch("/portfolio/orders", { method: "POST", body: order });
}

async function placeKalshiEventOrder(order) {
  if (!liveConfig.liveTradingEnabled) {
    throw new Error("Live trading is disabled; BOT DESTROYER no longer creates dry-run orders.");
  }
  return kalshiAuthFetch("/portfolio/events/orders", { method: "POST", body: order });
}

async function cancelKalshiOrder(orderId) {
  if (!orderId) return null;
  if (!liveConfig.liveTradingEnabled || String(orderId).startsWith("dry_")) {
    return { dryRun: true, order_id: orderId };
  }
  try {
    return await kalshiAuthFetch(`/portfolio/events/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
  } catch (eventError) {
    try {
      return await kalshiAuthFetch(`/portfolio/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
    } catch (legacyError) {
      legacyError.message = `${legacyError.message}; event cancel also failed: ${eventError.message}`;
      throw legacyError;
    }
  }
}

async function getKalshiOrder(orderId) {
  if (!orderId) return null;
  if (!liveConfig.liveTradingEnabled || String(orderId).startsWith("dry_")) {
    return { order: { order_id: orderId, status: "dry_run", remaining_count: 0, fill_count: 0 } };
  }
  return kalshiAuthFetch(`/portfolio/orders/${encodeURIComponent(orderId)}`);
}

function normalizeMarket(m, event = {}) {
  const ticker = m.ticker || m.market_ticker || "";
  return {
    ticker,
    event_ticker: m.event_ticker || event.event_ticker || "",
    series_ticker: m.series_ticker || event.series_ticker || "",
    title: m.title || m.market_title || ticker,
    subtitle: m.subtitle || m.event_title || event.title || event.sub_title || "",
    category: m.category || event.category || "",
    status: m.status || "",
    open_time: m.open_time || m.open_ts || event.open_time || null,
    yes_sub_title: m.yes_sub_title || "",
    no_sub_title: m.no_sub_title || "",
    close_time: m.close_time || m.close_ts || null,
    expiration_time: m.expiration_time || m.expiration_ts || null,
    expected_expiration_time: m.expected_expiration_time || null,
    occurrence_datetime: m.occurrence_datetime || null,
    yes_bid: centsFromAny(m.yes_bid ?? m.yes_bid_cents ?? m.yes_bid_dollars),
    yes_ask: centsFromAny(m.yes_ask ?? m.yes_ask_cents ?? m.yes_ask_dollars),
    no_bid: centsFromAny(m.no_bid ?? m.no_bid_cents ?? m.no_bid_dollars),
    no_ask: centsFromAny(m.no_ask ?? m.no_ask_cents ?? m.no_ask_dollars),
    last_price: centsFromAny(m.last_price ?? m.last_price_cents ?? m.last_price_dollars),
    volume: numberFromAny(m.volume ?? m.volume_fp),
    volume_24h: numberFromAny(m.volume_24h ?? m.volume_24h_fp),
    open_interest: numberFromAny(m.open_interest ?? m.open_interest_fp),
    liquidity: numberFromAny(m.liquidity ?? m.liquidity_fp ?? m.liquidity_dollars),
    url: null,
    isComboMarket: Boolean(m.mve_collection_ticker || m.mve_selected_legs?.length || (m.title || "").split(",").length >= 3)
  };
}

function enrichMarketWithBook(market, book) {
  const yesLevels = parseLevels(book?.yes_dollars || book?.yes || []);
  const noLevels = parseLevels(book?.no_dollars || book?.no || []);
  const bestYesBid = bestBid(yesLevels) ?? market.yes_bid;
  const bestNoBid = bestBid(noLevels) ?? market.no_bid;
  const yesAsk = bestNoBid != null ? 100 - bestNoBid : market.yes_ask;
  const noAsk = bestYesBid != null ? 100 - bestYesBid : market.no_ask;
  return {
    ...market,
    yes_bid: bestYesBid,
    no_bid: bestNoBid,
    yes_ask: yesAsk,
    no_ask: noAsk,
    orderbook: {
      yesLevels,
      noLevels,
      yesSpread: bestYesBid != null && yesAsk != null ? Math.max(0, yesAsk - bestYesBid) : null,
      noSpread: bestNoBid != null && noAsk != null ? Math.max(0, noAsk - bestNoBid) : null,
      yesDepthAtEntry: depthNear(noLevels, bestNoBid),
      noDepthAtEntry: depthNear(yesLevels, bestYesBid),
      nearbyDepth: sumDepth(yesLevels) + sumDepth(noLevels),
      wallSummary: summarizeBtcOrderbookWalls(yesLevels, noLevels, { yesBid: bestYesBid, yesAsk, noBid: bestNoBid, noAsk })
    }
  };
}

function summarizeBtcOrderbookWalls(yesLevels, noLevels, prices = {}) {
  const yesLowBuy = biggestLevelInBand(yesLevels, 1, 5);
  const noLowBuy = biggestLevelInBand(noLevels, 1, 15);
  const yesLowBuyStack = stackLevelsInBand(yesLevels, 1, 5, "desc");
  const noLowBuyStack = stackLevelsInBand(noLevels, 1, 15, "desc");
  const yesSellLevels = inferredSellLevelsFromOppositeBuy(noLevels);
  const noSellLevels = inferredSellLevelsFromOppositeBuy(yesLevels);
  const yesHighSellStack = sellStackFromOppositeBuy(noLevels, 1, 15);
  const noHighSellStack = sellStackFromOppositeBuy(yesLevels, 1, 5);
  const yesHighSell = noLowBuy.price != null ? { price: 100 - noLowBuy.price, quantity: noLowBuy.quantity } : null;
  const noHighSell = yesLowBuy.price != null ? { price: 100 - yesLowBuy.price, quantity: yesLowBuy.quantity } : null;
  const yesLowBuyTotal = sumLevelsInBand(yesLevels, 1, 5);
  const noLowBuyTotal = sumLevelsInBand(noLevels, 1, 15);
  const yesHighSellTotal = noLowBuyTotal;
  const noHighSellTotal = yesLowBuyTotal;
  const visibleBookTotal = sumDepth(yesLevels) + sumDepth(noLevels);
  const yesLowBuyStackTotal = sumStackQuantity(yesLowBuyStack);
  const yesHighSellStackTotal = sumStackQuantity(yesHighSellStack);
  const yesLowBuyPct = pctOf(yesLowBuyTotal, visibleBookTotal);
  const yesHighSellPct = pctOf(yesHighSellTotal, visibleBookTotal);
  const yesLowBuyPeakPct = pctOf(yesLowBuy.quantity, visibleBookTotal);
  const yesHighSellPeakPct = pctOf(yesHighSell?.quantity, visibleBookTotal);
  const yesLowBuyStackPct = pctOf(yesLowBuyStackTotal, visibleBookTotal);
  const yesHighSellStackPct = pctOf(yesHighSellStackTotal, visibleBookTotal);
  const buyNoPressure = Math.max(Number(yesLowBuy.quantity || 0), yesLowBuyTotal);
  const buyYesPressure = Math.max(Number(noLowBuy.quantity || 0), noLowBuyTotal);
  const ratio = Math.max(buyNoPressure, buyYesPressure) / Math.max(1, Math.min(buyNoPressure || 1, buyYesPressure || 1));
  const goldPressurePct = Math.max(yesHighSellPct, yesHighSellStackPct, yesHighSellPeakPct);
  const trashPressurePct = Math.max(yesLowBuyPct, yesLowBuyStackPct, yesLowBuyPeakPct);
  const pressureGapPct = round2(Math.abs(goldPressurePct - trashPressurePct));
  const farSide = Math.max(buyNoPressure, buyYesPressure) >= BTC_DESTROYER_WALL_MIN_CONTRACTS
    && ratio >= BTC_DESTROYER_WALL_RATIO
    && pressureGapPct >= BTC_DESTROYER_READ_GAP_PCT
    && Math.max(goldPressurePct, trashPressurePct) >= BTC_DESTROYER_READ_MIN_PCT
    ? (goldPressurePct > trashPressurePct ? "YES" : "NO")
    : null;
  const nearSpread = summarizeNearSpreadPressure(yesLevels, noLevels, yesSellLevels, noSellLevels, prices);
  const side = nearSpread.side && farSide === nearSpread.side ? nearSpread.side : null;
  const summary = [
    yesLowBuy.price != null ? `YES trash buy wall ${formatWallLevel(yesLowBuy)}` : "",
    noLowBuy.price != null ? `NO buy wall ${formatWallLevel(noLowBuy)}` : "",
    yesHighSell?.price != null ? `YES gold sell wall ${formatWallLevel(yesHighSell)}` : "",
    noHighSell?.price != null ? `NO sell wall ${formatWallLevel(noHighSell)}` : "",
    yesLowBuyTotal > 0 ? `YES trash floor 1-5c x ${Math.round(yesLowBuyTotal).toLocaleString()}` : "",
    noLowBuyTotal > 0 ? `NO buy floor 1-15c x ${Math.round(noLowBuyTotal).toLocaleString()}` : "",
    yesHighSellTotal > 0 ? `YES gold cliff 85-99c x ${Math.round(yesHighSellTotal).toLocaleString()}` : "",
    noHighSellTotal > 0 ? `NO sell ledge 90-99c x ${Math.round(noHighSellTotal).toLocaleString()}` : "",
    formatStackSignature("YES buy stack", yesLowBuyStack),
    formatStackSignature("YES sell stack", yesHighSellStack),
    formatStackSignature("NO buy stack", noLowBuyStack),
    formatStackSignature("NO sell stack", noHighSellStack)
  ].filter(Boolean).join(" | ");
  return {
    yesLowBuy,
    noLowBuy,
    yesHighSell,
    noHighSell,
    yesLowBuyStack,
    noLowBuyStack,
    yesHighSellStack,
    noHighSellStack,
    yesLowBuyTotal,
    noLowBuyTotal,
    yesHighSellTotal,
    noHighSellTotal,
    visibleBookTotal,
    yesLowBuyStackTotal,
    yesHighSellStackTotal,
    yesLowBuyPct,
    yesHighSellPct,
    yesLowBuyPeakPct,
    yesHighSellPeakPct,
    yesLowBuyStackPct,
    yesHighSellStackPct,
    goldPressurePct,
    trashPressurePct,
    pressureGapPct,
    farSide,
    nearSpread,
    buyYesPressure,
    buyNoPressure,
    side,
    ratio: round2(ratio),
    summary
  };
}

function summarizeNearSpreadPressure(yesLevels, noLevels, yesSellLevels, noSellLevels, prices = {}) {
  const yesBid = Number(prices.yesBid);
  const yesAsk = Number(prices.yesAsk);
  const noBid = Number(prices.noBid);
  const noAsk = Number(prices.noAsk);
  const yesSupport = validCents(yesBid)
    ? sumLevelsInBand(yesLevels, Math.max(1, yesBid - BTC_DESTROYER_NEAR_WINDOW_CENTS), yesBid)
    : 0;
  const yesResistance = validCents(yesAsk)
    ? sumLevelsInBand(yesSellLevels, yesAsk, Math.min(99, yesAsk + BTC_DESTROYER_NEAR_WINDOW_CENTS))
    : 0;
  const noSupport = validCents(noBid)
    ? sumLevelsInBand(noLevels, Math.max(1, noBid - BTC_DESTROYER_NEAR_WINDOW_CENTS), noBid)
    : 0;
  const noResistance = validCents(noAsk)
    ? sumLevelsInBand(noSellLevels, noAsk, Math.min(99, noAsk + BTC_DESTROYER_NEAR_WINDOW_CENTS))
    : 0;
  const yesRate = yesSupport / Math.max(1, yesResistance);
  const noRate = noSupport / Math.max(1, noResistance);
  const maxSupport = Math.max(yesSupport, noSupport);
  const minRate = Math.max(1, Math.min(yesRate || 1, noRate || 1));
  const ratio = Math.max(yesRate, noRate) / minRate;
  const totalNear = yesSupport + yesResistance + noSupport + noResistance;
  const yesPressurePct = pctOf(yesSupport, totalNear);
  const noPressurePct = pctOf(noSupport, totalNear);
  const side = maxSupport >= BTC_DESTROYER_NEAR_MIN_CONTRACTS && ratio >= BTC_DESTROYER_NEAR_RATIO
    ? (yesRate > noRate ? "YES" : "NO")
    : null;
  return {
    side,
    yesBid: validCents(yesBid) ? yesBid : null,
    yesAsk: validCents(yesAsk) ? yesAsk : null,
    noBid: validCents(noBid) ? noBid : null,
    noAsk: validCents(noAsk) ? noAsk : null,
    yesSupport: round2(yesSupport),
    yesResistance: round2(yesResistance),
    noSupport: round2(noSupport),
    noResistance: round2(noResistance),
    yesRate: round2(yesRate),
    noRate: round2(noRate),
    yesPressurePct,
    noPressurePct,
    ratio: round2(ratio),
    summary: `near YES ${Math.round(yesSupport).toLocaleString()} bid / ${Math.round(yesResistance).toLocaleString()} ask; near NO ${Math.round(noSupport).toLocaleString()} bid / ${Math.round(noResistance).toLocaleString()} ask`
  };
}

function btcBookShoveSignal(market) {
  if (!isCryptoMarket(market)) return { side: null, reason: "" };
  const wall = market.orderbook?.wallSummary || summarizeBtcOrderbookWalls(market.orderbook?.yesLevels || [], market.orderbook?.noLevels || []);
  const memory = market.orderbook?.wallMemory || btcConfirmedBookMemory(market.ticker);
  if (!memory.side) {
    const farText = wall.farSide ? `far ${wall.farSide}` : "far wait";
    const nearText = wall.nearSpread?.side ? `near ${wall.nearSpread.side}` : "near wait";
    const liveSide = wall.side ? `latest ${wall.side}, waiting ${BTC_DESTROYER_CONFIRM_SAMPLES}x confirmation` : `no confirmed shove (${farText}, ${nearText})`;
    return { side: null, reason: `book shove waiting: ${liveSide}; ${wall.summary || "no abnormal wall"}` };
  }
  return {
    side: memory.side,
    reason: `book shove confirmed BUY ${memory.side}: ${wall.nearSpread?.summary || "near spread confirmed"}; far ${wall.farSide || "-"} confirmed; ${memory.confirmations}x/${BTC_DESTROYER_CONFIRM_SAMPLES} samples; gold ${round2(wall.goldPressurePct)}% vs trash ${round2(wall.trashPressurePct)}%, gap ${round2(wall.pressureGapPct)}%`
  };
}

function btcResearchScalpSignal(market, side, entry, spreadCents) {
  const unavailable = (reason) => ({ ok: false, reason });
  if (!isBtcTechnicalMicroCandidate(market)) return unavailable("not current BTC hourly above contract");
  const minutesLeft = minutesToDecision(market);
  if (!Number.isFinite(minutesLeft)) return unavailable("cannot determine minutes left");
  if (minutesLeft <= BTC_HOURLY_FORCE_EXIT_MINUTES) return unavailable(`inside final ${BTC_HOURLY_FORCE_EXIT_MINUTES}m no-entry window`);
  const spread = Number(spreadCents);
  if (!Number.isFinite(spread) || spread > BTC_RESEARCH_MAX_SPREAD_CENTS) {
    return unavailable(`spread ${round2(spread)}c exceeds ${BTC_RESEARCH_MAX_SPREAD_CENTS}c`);
  }
  if (!validCents(entry)) return unavailable("no executable entry price");

  const lateWindow = minutesLeft <= BTC_RESEARCH_LATE_MINUTES;
  if (lateWindow && entry >= BTC_RESEARCH_LATE_ENTRY_CENTS && entry <= BTC_LATE_LOCK_MAX_ENTRY_CENTS) {
    return {
      ok: true,
      mode: "late-window",
      targetDistance: BTC_RESEARCH_LATE_TARGET_CENTS,
      stopPrice: BTC_RESEARCH_LATE_STOP_CENTS,
      reason: `late-window ${round2(entry)}c+ high-probability BTC farmer; ${round2(minutesLeft)}m left`
    };
  }
  if (entry < BTC_RESEARCH_MIN_ENTRY_CENTS || entry > BTC_RESEARCH_MAX_NORMAL_ENTRY_CENTS) {
    return unavailable(`entry ${round2(entry)}c outside ${BTC_RESEARCH_MIN_ENTRY_CENTS}-${BTC_RESEARCH_MAX_NORMAL_ENTRY_CENTS}c normal scalp band`);
  }

  const book = market.orderbook || {};
  const wall = book.wallSummary || summarizeBtcOrderbookWalls(book.yesLevels || [], book.noLevels || []);
  const wallSide = wall?.farSide || wall?.side || null;
  const wallStrength = Math.max(Number(wall?.goldPressurePct || 0), Number(wall?.trashPressurePct || 0));
  const wallGap = Number(wall?.pressureGapPct || 0);
  if (wallSide && wallSide !== side) {
    return unavailable(`book wall points BUY ${wallSide}, not ${side}`);
  }
  if (wallSide === side && wallStrength >= BTC_DESTROYER_READ_MIN_PCT && wallGap >= BTC_DESTROYER_READ_GAP_PCT) {
    return {
      ok: true,
      mode: "book-wall",
      targetDistance: BTC_RESEARCH_NORMAL_TARGET_CENTS,
      stopPrice: Math.max(1, Math.round(entry - BTC_RESEARCH_STOP_CENTS)),
      reason: `dominant book wall BUY ${side}: ${round2(wallStrength)}% pressure, ${round2(wallGap)}% gap; ${wall.nearSpread?.summary || wall.summary || "wall read"}`
    };
  }

  return {
    ok: true,
    mode: "normal-band-scalp",
    targetDistance: BTC_RESEARCH_NORMAL_TARGET_CENTS,
    stopPrice: Math.max(1, Math.round(entry - BTC_RESEARCH_STOP_CENTS)),
    reason: `normal-band BTC scalp BUY ${side}: entry ${round2(entry)}c, spread ${round2(spread)}c; no opposing dominant wall`
  };
}

function updateBtcBookMemory(market) {
  if (!isBtcTechnicalMicroCandidate(market)) return null;
  const wall = market.orderbook?.wallSummary || null;
  if (!wall) return null;
  const now = Date.now();
  const key = market.ticker;
  const existing = btcBookMemory.get(key) || { samples: [], lastSampleAt: 0 };
  if (now - Number(existing.lastSampleAt || 0) < BTC_DESTROYER_BOOK_SAMPLE_MS) {
    const memory = btcConfirmedBookMemory(key);
    wall.flash = memory.flash;
    market.orderbook.wallMemory = memory;
    return memory;
  }
  existing.lastSampleAt = now;
  existing.samples.unshift({
    at: now,
    side: wall.side,
    yesLowBuy: wall.yesLowBuy,
    noLowBuy: wall.noLowBuy,
    yesHighSell: wall.yesHighSell,
    yesLowBuyTotal: wall.yesLowBuyTotal,
    yesHighSellTotal: wall.yesHighSellTotal,
    yesLowBuyPct: wall.yesLowBuyPct,
    yesHighSellPct: wall.yesHighSellPct,
    yesLowBuyStackTotal: wall.yesLowBuyStackTotal,
    yesHighSellStackTotal: wall.yesHighSellStackTotal,
    yesLowBuyStackPct: wall.yesLowBuyStackPct,
    yesHighSellStackPct: wall.yesHighSellStackPct,
    goldPressurePct: wall.goldPressurePct,
    trashPressurePct: wall.trashPressurePct,
    pressureGapPct: wall.pressureGapPct,
    farSide: wall.farSide,
    nearSpread: wall.nearSpread,
    yesBid: market.yes_bid,
    yesAsk: market.yes_ask,
    noBid: market.no_bid,
    noAsk: market.no_ask,
    yesMid: validCents(market.yes_bid) && validCents(market.yes_ask) ? (market.yes_bid + market.yes_ask) / 2 : null,
    noMid: validCents(market.no_bid) && validCents(market.no_ask) ? (market.no_bid + market.no_ask) / 2 : null,
    buyYesPressure: wall.buyYesPressure,
    buyNoPressure: wall.buyNoPressure,
    ratio: wall.ratio,
    summary: wall.summary
  });
  existing.samples = existing.samples.slice(0, 12);
  btcBookMemory.set(key, existing);
  const memory = btcConfirmedBookMemory(key);
  wall.flash = memory.flash;
  market.orderbook.wallMemory = memory;
  return memory;
}

function btcConfirmedBookMemory(ticker) {
  const entry = btcBookMemory.get(ticker);
  const flashWindowMs = 5_000;
  const samples = (entry?.samples || []).filter((sample) => Date.now() - Number(sample.at || 0) <= flashWindowMs);
  const recent = samples.slice(0, BTC_DESTROYER_CONFIRM_SAMPLES);
  const side = recent.length >= BTC_DESTROYER_CONFIRM_SAMPLES && recent.every((sample) => sample.side && sample.side === recent[0].side)
    ? recent[0].side
    : null;
  const flash = summarizeBtcWallFlash(samples, flashWindowMs);
  return {
    side,
    confirmations: side ? recent.length : 0,
    flash,
    samples: samples.slice(0, 6),
    latest: samples[0] || null
  };
}

function summarizeBtcWallFlash(samples, windowMs) {
  const peakGold = maxSampleBy(samples, "yesHighSellTotal");
  const peakTrash = maxSampleBy(samples, "yesLowBuyTotal");
  return {
    windowMs,
    samples: samples.length,
    peakGoldPullTotal: Number(peakGold?.yesHighSellTotal || 0),
    peakGoldPullPct: Number(peakGold?.yesHighSellPct || 0),
    peakTrashPullTotal: Number(peakTrash?.yesLowBuyTotal || 0),
    peakTrashPullPct: Number(peakTrash?.yesLowBuyPct || 0),
    peakGoldWallTotal: Math.max(...samples.map((sample) => Number(sample?.yesHighSellStackTotal || 0)), 0),
    peakGoldWallPct: Math.max(...samples.map((sample) => Number(sample?.yesHighSellStackPct || 0)), 0),
    peakTrashWallTotal: Math.max(...samples.map((sample) => Number(sample?.yesLowBuyStackTotal || 0)), 0),
    peakTrashWallPct: Math.max(...samples.map((sample) => Number(sample?.yesLowBuyStackPct || 0)), 0)
  };
}

function maxSampleBy(samples, key) {
  return (samples || []).reduce((best, sample) => Number(sample?.[key] || 0) > Number(best?.[key] || 0) ? sample : best, null);
}

function btcWallStillSupportsTrade(trade, wallMemory) {
  if (!isActiveBtcTechnicalTrade(trade)) return true;
  const side = wallMemory?.side || "";
  if (!side) return false;
  return side === trade.side;
}

function btcWallOpposesTrade(trade, wallMemory) {
  if (!isActiveBtcTechnicalTrade(trade)) return false;
  const side = wallMemory?.side || "";
  return Boolean(side && side !== trade.side);
}

function computeBookLadderSignal(orderbook, side, entryCents, targetCents = null) {
  const buyLevels = side === "YES" ? orderbook?.yesLevels || [] : orderbook?.noLevels || [];
  const oppositeLevels = side === "YES" ? orderbook?.noLevels || [] : orderbook?.yesLevels || [];
  const sellLevels = inferredSellLevelsFromOppositeBuy(oppositeLevels);
  const entry = clamp(Math.round(Number(entryCents || 0)), 1, 99);
  const target = validCents(targetCents) ? clamp(Math.round(Number(targetCents)), 1, 99) : clamp(entry + BTC_DESTROYER_TARGET_DISTANCE_CENTS, 1, 99);
  const supportBelow = sumLevelsInBand(buyLevels, entry - BTC_LADDER_WINDOW_CENTS, entry - 1);
  const resistanceAbove = sumLevelsInBand(sellLevels, entry + 1, entry + BTC_LADDER_WINDOW_CENTS);
  const immediateSupport = sumLevelsInBand(buyLevels, entry - 2, entry);
  const immediateResistance = sumLevelsInBand(sellLevels, entry, entry + 2);
  const targetResistance = sumLevelsInBand(sellLevels, Math.max(entry + 1, target - BTC_LADDER_TARGET_WINDOW_CENTS), target + BTC_LADDER_TARGET_WINDOW_CENTS);
  const total = sumDepth(buyLevels) + sumDepth(sellLevels);
  const supportPct = pctOf(supportBelow, total);
  const resistancePct = pctOf(resistanceAbove, total);
  const targetResistancePct = pctOf(targetResistance, total);
  const nearRatio = resistanceAbove / Math.max(1, supportBelow);
  const immediateRatio = immediateResistance / Math.max(1, immediateSupport);
  const supportThin = supportBelow <= BTC_LADDER_THIN_CONTRACTS;
  const severeOverhead = resistanceAbove >= BTC_LADDER_HEAVY_CONTRACTS || resistanceAbove >= supportBelow * BTC_LADDER_COLLAPSE_RATIO;
  const immediateCollapse = immediateResistance >= Math.max(BTC_LADDER_THIN_CONTRACTS, immediateSupport * BTC_LADDER_COLLAPSE_RATIO);
  const entryOk = !(supportThin && severeOverhead) && immediateRatio < BTC_LADDER_COLLAPSE_RATIO;
  const exitNow = (supportThin && severeOverhead) || immediateCollapse;
  const reason = entryOk
    ? `book ladder ok: support ${Math.round(supportBelow).toLocaleString()} (${formatPct(supportPct)}) below vs resistance ${Math.round(resistanceAbove).toLocaleString()} (${formatPct(resistancePct)}) above`
    : `book ladder blocked: thin support ${Math.round(supportBelow).toLocaleString()} below vs resistance ${Math.round(resistanceAbove).toLocaleString()} above`;
  return {
    side,
    entry,
    target,
    supportBelow,
    resistanceAbove,
    immediateSupport,
    immediateResistance,
    targetResistance,
    supportPct,
    resistancePct,
    targetResistancePct,
    nearRatio: round2(nearRatio),
    immediateRatio: round2(immediateRatio),
    entryOk,
    exitNow,
    reason,
    supportLevels: stackLevelsInBand(buyLevels, entry - BTC_LADDER_WINDOW_CENTS, entry - 1, "desc", 5),
    resistanceLevels: stackLevelsInBand(sellLevels, entry + 1, entry + BTC_LADDER_WINDOW_CENTS, "asc", 5)
  };
}

function inferredSellLevelsFromOppositeBuy(levels) {
  return (levels || [])
    .filter((level) => validCents(level.price) && Number(level.quantity || 0) > 0)
    .map((level) => ({ price: round2(100 - level.price), quantity: Number(level.quantity || 0), orders: level.orders }))
    .filter((level) => validCents(level.price))
    .sort((a, b) => a.price - b.price);
}

function biggestLevelInBand(levels, minPrice, maxPrice) {
  return (levels || [])
    .filter((level) => level.price >= minPrice && level.price <= maxPrice)
    .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))[0] || { price: null, quantity: 0 };
}

function sumLevelsInBand(levels, minPrice, maxPrice) {
  return (levels || [])
    .filter((level) => level.price >= minPrice && level.price <= maxPrice)
    .reduce((sum, level) => sum + Number(level.quantity || 0), 0);
}

function pctOf(part, total) {
  const denom = Number(total || 0);
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  return round2((Number(part || 0) / denom) * 100);
}

function sumStackQuantity(stack) {
  return (stack || []).reduce((sum, level) => sum + Number(level.quantity || 0), 0);
}

function stackLevelsInBand(levels, minPrice, maxPrice, direction = "asc", limit = 6) {
  return (levels || [])
    .filter((level) => level.price >= minPrice && level.price <= maxPrice && Number(level.quantity || 0) > 0)
    .sort((a, b) => direction === "desc" ? b.price - a.price : a.price - b.price)
    .slice(0, limit)
    .map((level) => ({ price: round2(level.price), quantity: round2(Number(level.quantity || 0)) }));
}

function sellStackFromOppositeBuy(levels, minPrice, maxPrice, limit = 6) {
  return stackLevelsInBand(levels, minPrice, maxPrice, "asc", limit)
    .map((level) => ({ price: round2(100 - level.price), quantity: level.quantity }))
    .sort((a, b) => b.price - a.price);
}

function formatStackSignature(label, stack) {
  if (!Array.isArray(stack) || !stack.length) return "";
  const meaningful = stack.filter((level) => Number(level.quantity || 0) >= BTC_DESTROYER_WALL_MIN_CONTRACTS);
  if (!meaningful.length) return "";
  const signature = meaningful.slice(0, 4).map((level) => `${round2(level.price)}c ${Math.round(level.quantity).toLocaleString()}`).join(" / ");
  return `${label} ${signature}`;
}

function formatWallLevel(level) {
  if (!level || level.price == null) return "-";
  return `${round2(level.price)}c x ${Math.round(Number(level.quantity || 0)).toLocaleString()}`;
}

function scoreSide(market, side, candleSeries, settings, notes, scan = null) {
  const isYes = side === "YES";
  const ask = isYes ? market.yes_ask : market.no_ask;
  const bid = isYes ? market.yes_bid : market.no_bid;
  const btcEvSwingCandidate = isBtcTechnicalMicroCandidate(market);
  const btcTechnicalCandidate = false;
  const entry = ask;
  const spread = isYes ? market.orderbook.yesSpread : market.orderbook.noSpread;
  if (!validCents(entry) || entry >= 99) return null;
  const minutesLeft = minutesToDecision(market);
  const matchupWinnerMarket = isMatchupWinnerMarket(market);
  if (validCents(ask) && validCents(bid) && spread > MAX_EXECUTION_SPREAD_CENTS) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      currentBidCents: round2(bid),
      askPriceCents: round2(ask),
      minTargetFor10PctCents: null,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: `Skipped by spread safety: BUY ${side} bid ${round2(bid)}c / ask ${round2(ask)}c is a ${round2(spread)}c spread. Max allowed is ${MAX_EXECUTION_SPREAD_CENTS}c.`
    };
  }
  if (isCryptoMarket(market) && isBitcoinHourlyContract(`${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase(), market) && !bitcoinAboveContract(market)) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      minTargetFor10PctCents: null,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: "BTC scraper blocked: range contract skipped. BOT DESTROYER only trades directional 'or above' BTC hourlies."
    };
  }
  const displayedEntry = validCents(ask) ? Math.max(entry, ask) : entry;
  if (!isCryptoMarket(market) && !btcTechnicalCandidate && !detectLateSportsPhase(market).warning && displayedEntry >= LATE_LOCK_ENTRY_MIN_CENTS) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      minTargetFor10PctCents: null,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: `Skipped by sports 90c rule: BUY ${side} ask ${round2(entry)}c / bid ${round2(bid)}c is only allowed in an approved late-game window.`
    };
  }
  if (!btcTechnicalCandidate && !btcEvSwingCandidate && entry < SIDE_ENTRY_MIN_CENTS) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      minTargetFor10PctCents: null,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: `Skipped by minimum buy-price rule: BUY ${side} at ${round2(entry)}c is below ${SIDE_ENTRY_MIN_CENTS}c.`
    };
  }

  const sidePrices = sidePriceSeries(candleSeries, side, market);
  const chop = computeChop(sidePrices);
  const tennisPause = detectTennisPause(market, candleSeries, side, scan);
  const sportsLatePhase = detectLateSportsPhase(market);
  const bitcoinTrend = detectBitcoinTrend(market, candleSeries, side, scan);
  const btcLatch = btcSideLatchDecision(market, side, bitcoinTrend);
  if (!btcLatch.ok) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      currentBidCents: round2(bid),
      askPriceCents: round2(ask),
      minTargetFor10PctCents: null,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: btcLatch.reason
    };
  }
  const dataConfidence = computeDataConfidence(sidePrices, market, notes);
  const liquidityAdjustment = computeLiquidityAdjustment(market);
  const spreadAdjustment = computeSpreadAdjustment(spread);
  const timeAdjustment = computeTimeAdjustment(market);
  const chopAdjustment = 0.75 + chop.score * 0.25;
  const feeRate = KALSHI_STANDARD_FEE_RATE;
  const buyFee = feePerContract(entry, feeRate, settings.contracts);
  const cushion = 0;
  const entryCost = entry / 100 + buyFee + cushion;
  const btcTechnicalFallback = computeBtcTechnicalFallback({
    market,
    side,
    entry,
    entryCost,
    settings,
    feeRate,
    bitcoinTrend,
    technical: null,
    candleSeries,
    dataConfidence,
    liquidityAdjustment,
    spreadAdjustment,
    spreadCents: spread,
    timeAdjustment,
    tennisPause,
    sportsLatePhase
  });
  const lateLockScalp = computeLateLockScalp({
    market,
    side,
    entry,
    entryCost,
    settings,
    feeRate,
    tennisPause,
    sportsLatePhase,
    bitcoinTrend
  });
  if (lateLockScalp.qualifies) {
    return makeScoredResult({
      market,
      side,
      entry,
      currentBid: bid,
      spread,
      settings,
      minutesLeft,
      chop,
      touch: null,
      tennisPause,
      sportsLatePhase,
      bitcoinTrend,
      dataConfidence,
      liquidityAdjustment,
      spreadAdjustment,
      timeAdjustment,
      finalSizing: lateLockScalp.sizing,
      finalTarget: lateLockScalp.target,
      finalProfitIfHit: lateLockScalp.profitIfHit,
      finalNetProfitPct: lateLockScalp.netProfitPct,
      finalStopPrice: lateLockScalp.stopPrice,
      finalStopDistance: lateLockScalp.stopDistance,
      finalLossIfMissed: lateLockScalp.lossIfMissed,
      finalAdjustedTouch: lateLockScalp.touchProbability,
      finalEvPerContract: lateLockScalp.evPerContract,
      finalEvRoiPct: lateLockScalp.evRoiPct,
      totalProfitIfHit: lateLockScalp.sizing.targetProfitDollars,
      totalLossIfStopped: lateLockScalp.sizing.stopLossDollars,
      totalEvDollars: lateLockScalp.evPerContract * lateLockScalp.sizing.contracts,
      finalQualifies: true,
      finalReasonSummary: lateLockScalp.reason,
      bookLadderSignal: lateLockScalp.bookLadderSignal || null,
      strategyType: "LATE_LOCK_SCRAPE"
    });
  }
  if (btcTechnicalCandidate) {
    const blankSizing = {
      contracts: 0,
      minContractsForProfit: null,
      maxContractsByRisk: 0,
      maxContractsAffordable: 0,
      riskFraction: 0,
      targetProfitDollars: 0,
      stopLossDollars: 0,
      reason: btcTechnicalFallback.reason || "BTC scraper blocked."
    };
    const btcSizing = btcTechnicalFallback.sizing || blankSizing;
    return makeScoredResult({
      market,
      side,
      entry,
      currentBid: bid,
      spread,
      settings,
      minutesLeft,
      chop,
      touch: null,
      tennisPause,
      sportsLatePhase,
      bitcoinTrend,
      dataConfidence,
      liquidityAdjustment,
      spreadAdjustment,
      timeAdjustment,
      finalSizing: btcSizing,
      finalTarget: btcTechnicalFallback.target || null,
      finalProfitIfHit: btcTechnicalFallback.profitIfHit || 0,
      finalNetProfitPct: btcTechnicalFallback.netProfitPct || 0,
      finalStopPrice: btcTechnicalFallback.stopPrice || null,
      finalStopDistance: btcTechnicalFallback.stopDistance || 0,
      finalLossIfMissed: btcTechnicalFallback.lossIfMissed || 0,
      finalAdjustedTouch: null,
      finalEvPerContract: null,
      finalEvRoiPct: null,
      totalProfitIfHit: btcSizing.targetProfitDollars || 0,
      totalLossIfStopped: btcSizing.stopLossDollars || 0,
      totalEvDollars: null,
      finalQualifies: Boolean(btcTechnicalFallback.qualifies),
      finalReasonSummary: btcTechnicalFallback.reason || "BTC scraper blocked.",
      bookLadderSignal: btcTechnicalFallback.bookLadderSignal || null,
      strategyType: "BTC_TECHNICAL_FALLBACK"
    });
  }
  if (Number.isFinite(minutesLeft) && minutesLeft < MIN_TIME_LEFT_MINUTES) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      minTargetFor10PctCents: null,
      minutesLeft: round2(minutesLeft),
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: `Skipped because only ${round2(minutesLeft)} minutes remain; minimum is ${MIN_TIME_LEFT_MINUTES} minutes.`
    };
  }
  const sideBand = btcEvSwingCandidate
    ? { min: BTC_EV_SWING_MIN_ENTRY_CENTS, max: BTC_EV_SWING_MAX_ENTRY_CENTS }
    : entryBandForSide(side, matchupWinnerMarket);
  if (!btcTechnicalCandidate && (entry < sideBand.min || entry > sideBand.max)) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      minTargetFor10PctCents: null,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: `${btcEvSwingCandidate ? "BTC EV swing waiting" : "Skipped by live side-band rule"}: BUY ${side} entry ${round2(entry)}c must be ${sideBand.min}c-${sideBand.max}c.`
    };
  }

  if (btcTechnicalFallback.qualifies) {
    return makeScoredResult({
      market,
      side,
      entry,
      currentBid: bid,
      spread,
      settings,
      minutesLeft,
      chop,
      touch: null,
      tennisPause,
      sportsLatePhase,
      bitcoinTrend,
      dataConfidence,
      liquidityAdjustment,
      spreadAdjustment,
      timeAdjustment,
      finalSizing: btcTechnicalFallback.sizing,
      finalTarget: btcTechnicalFallback.target,
      finalProfitIfHit: btcTechnicalFallback.profitIfHit,
      finalNetProfitPct: btcTechnicalFallback.netProfitPct,
      finalStopPrice: btcTechnicalFallback.stopPrice,
      finalStopDistance: btcTechnicalFallback.stopDistance,
      finalLossIfMissed: btcTechnicalFallback.lossIfMissed,
      finalAdjustedTouch: null,
      finalEvPerContract: null,
      finalEvRoiPct: null,
      totalProfitIfHit: btcTechnicalFallback.sizing.targetProfitDollars,
      totalLossIfStopped: btcTechnicalFallback.sizing.stopLossDollars,
      totalEvDollars: null,
      finalQualifies: true,
      finalReasonSummary: btcTechnicalFallback.reason,
      strategyType: "BTC_TECHNICAL_FALLBACK"
    });
  }
  if (btcTechnicalCandidate && btcTechnicalFallback.reason) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      minTargetFor10PctCents: null,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: btcTechnicalFallback.reason
    };
  }

  let minTargetForNet = null;
  const maxTarget = Math.min(MAX_TOUCH_TARGET_CENTS, Math.floor(entry + MAX_TOUCH_DISTANCE_CENTS));
  for (let target = Math.floor(entry) + 1; target <= maxTarget; target += 1) {
    const sellFee = feePerContract(target, feeRate, settings.contracts);
    const sellProceeds = target / 100 - sellFee - cushion;
    const profitIfHit = sellProceeds - entryCost;
    const netProfitPct = (profitIfHit / entryCost) * 100;
    if (netProfitPct >= settings.minNetProfitPct) {
      minTargetForNet = target;
      break;
    }
  }
  if (minTargetForNet == null) {
    const sportsMicroScalp = computeSportsMicroScalp({
      market,
      side,
      entry,
      entryCost,
      settings,
      feeRate,
      candleSeries,
      chop,
      dataConfidence,
      liquidityAdjustment,
      spreadAdjustment,
      timeAdjustment,
      tennisPause,
      sportsLatePhase,
      bitcoinTrend
    });
    if (sportsMicroScalp.qualifies) {
      return makeScoredResult({
        market,
        side,
        entry,
        currentBid: bid,
        spread,
        settings,
        minutesLeft,
        chop,
        touch: sportsMicroScalp.touch,
        tennisPause,
        sportsLatePhase,
        bitcoinTrend,
        dataConfidence,
        liquidityAdjustment,
        spreadAdjustment,
        timeAdjustment,
        finalSizing: sportsMicroScalp.sizing,
        finalTarget: sportsMicroScalp.target,
        finalProfitIfHit: sportsMicroScalp.profitIfHit,
        finalNetProfitPct: sportsMicroScalp.netProfitPct,
        finalStopPrice: sportsMicroScalp.stopPrice,
        finalStopDistance: sportsMicroScalp.stopDistance,
        finalLossIfMissed: sportsMicroScalp.lossIfMissed,
        finalAdjustedTouch: sportsMicroScalp.adjustedTouch,
        finalEvPerContract: sportsMicroScalp.evPerContract,
        finalEvRoiPct: sportsMicroScalp.evRoiPct,
        totalProfitIfHit: sportsMicroScalp.sizing.targetProfitDollars,
        totalLossIfStopped: sportsMicroScalp.sizing.stopLossDollars,
        totalEvDollars: sportsMicroScalp.evPerContract * sportsMicroScalp.sizing.contracts,
        finalQualifies: true,
        finalReasonSummary: sportsMicroScalp.reason,
        strategyType: "SPORTS_MICRO_SCALP"
      });
    }
    const bestEffortSportsScalp = computeSportsBestEffortScalp({
      market,
      side,
      entry,
      entryCost,
      settings,
      feeRate,
      candleSeries,
      chop,
      dataConfidence,
      liquidityAdjustment,
      spreadAdjustment,
      timeAdjustment,
      tennisPause,
      sportsLatePhase,
      bitcoinTrend
    });
    if (bestEffortSportsScalp.eligible) {
      return makeScoredResult({
        market,
        side,
        entry,
        currentBid: bid,
        spread,
        settings,
        minutesLeft,
        chop,
        touch: bestEffortSportsScalp.touch,
        tennisPause,
        sportsLatePhase,
        bitcoinTrend,
        dataConfidence,
        liquidityAdjustment,
        spreadAdjustment,
        timeAdjustment,
        finalSizing: bestEffortSportsScalp.sizing,
        finalTarget: bestEffortSportsScalp.target,
        finalProfitIfHit: bestEffortSportsScalp.profitIfHit,
        finalNetProfitPct: bestEffortSportsScalp.netProfitPct,
        finalStopPrice: bestEffortSportsScalp.stopPrice,
        finalStopDistance: bestEffortSportsScalp.stopDistance,
        finalLossIfMissed: bestEffortSportsScalp.lossIfMissed,
        finalAdjustedTouch: bestEffortSportsScalp.adjustedTouch,
        finalEvPerContract: bestEffortSportsScalp.evPerContract,
        finalEvRoiPct: bestEffortSportsScalp.evRoiPct,
        totalProfitIfHit: bestEffortSportsScalp.sizing.targetProfitDollars,
        totalLossIfStopped: bestEffortSportsScalp.sizing.stopLossDollars,
        totalEvDollars: bestEffortSportsScalp.evPerContract * bestEffortSportsScalp.sizing.contracts,
        finalQualifies: false,
        finalReasonSummary: bestEffortSportsScalp.reason,
        strategyType: "SPORTS_BEST_CHOP_WATCH"
      });
    }
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      minTargetFor10PctCents: null,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: `No scalp target within ${MAX_TOUCH_DISTANCE_CENTS}c and below ${MAX_TOUCH_TARGET_CENTS}c clears the 10% net profit requirement after fees.`
    };
  }
  const baseTarget = btcEvSwingCandidate
    ? Math.max(minTargetForNet, Math.round(entry) + BTC_EV_SWING_TARGET_DISTANCE_CENTS)
    : minTargetForNet;
  const dynamicPlan = volatilityAdjustedPlan({
    entry,
    baseTarget,
    spreadCents: spread,
    candleSeries,
    side,
    minTargetDistance: btcEvSwingCandidate ? BTC_EV_SWING_TARGET_DISTANCE_CENTS : Math.max(1, minTargetForNet - Math.round(entry)),
    maxTarget: MAX_TOUCH_TARGET_CENTS
  });
  if (!dynamicPlan) {
    return {
      recommendation: `BUY ${side}`,
      side,
      marketTitle: market.title,
      ticker: market.ticker,
      currentBuyPriceCents: round2(entry),
      minTargetFor10PctCents: minTargetForNet,
      evRoiPct: -999,
      qualifies: false,
      reasonSummary: "Volatility plan unavailable: recent executable bid range is not coherent enough for a target/stop pair."
    };
  }
  const target = dynamicPlan.target;
  const finalEvTarget = target;
  const sellFee = feePerContract(target, feeRate, settings.contracts);
  const sellProceeds = target / 100 - sellFee - cushion;
  const profitIfHit = sellProceeds - entryCost;
  const netProfitPct = (profitIfHit / entryCost) * 100;
  const stopDistance = dynamicPlan.stopDistance;
  const stopPrice = dynamicPlan.stopPrice;
  const stopSellFee = feePerContract(stopPrice, feeRate, settings.contracts);
  const stopProceeds = stopPrice / 100 - stopSellFee - cushion;
  const lossIfMissed = Math.max(0, entryCost - stopProceeds);
  const touch = computeScalpTouch(candleSeries, side, entry, target, stopPrice, chop);
  const priceRatioTouch = clamp((entry / target), 0, 0.99);
  const rawTouch = touch.rawTouchProbability ?? priceRatioTouch;
  const adjustedTouch = clamp(rawTouch * chopAdjustment * liquidityAdjustment * spreadAdjustment * timeAdjustment * dataConfidence, 0, 0.99);
  const evPerContract = adjustedTouch * profitIfHit - (1 - adjustedTouch) * lossIfMissed;
  const evRoiPct = (evPerContract / entryCost) * 100;
  const sizing = computeRecommendedContracts({
    accountValue: settings.accountValue,
    minTargetProfitDollars: settings.minTargetProfitDollars,
    entryCents: entry,
    targetCents: target,
    stopCents: stopPrice,
    feeRate,
    maxContracts: LIVE_MAX_CONTRACTS
  });
  const sizingQualified = sizing.contracts > 0 && sizing.targetProfitDollars >= settings.minTargetProfitDollars;
  const sportsScalpMarket = isSportsScalpMarket(market);
  const normalQualifies = !sportsScalpMarket && !isCryptoMarket(market) && sizingQualified && evRoiPct >= settings.minDisplayEvPct && netProfitPct >= settings.minNetProfitPct && hasSidewaysEvidence(chop) && touch.hasTouchEvidence && !touch.stabilityWarning && !tennisPause.warning && !sportsLatePhase.warning && !bitcoinTrend.warning;
  const sportsMicroScalp = computeSportsMicroScalp({
    market,
    side,
    entry,
    entryCost,
    settings,
    feeRate,
    candleSeries,
    chop,
    dataConfidence,
    liquidityAdjustment,
    spreadAdjustment,
    timeAdjustment,
    tennisPause,
    sportsLatePhase,
    bitcoinTrend
  });
  const preferBtcMicro = btcTechnicalFallback.qualifies;
  const preferSportsMicro = !preferBtcMicro && sportsMicroScalp.qualifies;
  const finalSizing = preferBtcMicro ? btcTechnicalFallback.sizing : preferSportsMicro ? sportsMicroScalp.sizing : sizing;
  const finalTarget = preferBtcMicro ? btcTechnicalFallback.target : preferSportsMicro ? sportsMicroScalp.target : finalEvTarget;
  const finalProfitIfHit = preferBtcMicro ? btcTechnicalFallback.profitIfHit : preferSportsMicro ? sportsMicroScalp.profitIfHit : profitIfHit;
  const finalNetProfitPct = preferBtcMicro ? btcTechnicalFallback.netProfitPct : preferSportsMicro ? sportsMicroScalp.netProfitPct : netProfitPct;
  const finalStopPrice = preferBtcMicro ? btcTechnicalFallback.stopPrice : preferSportsMicro ? sportsMicroScalp.stopPrice : stopPrice;
  const finalStopDistance = preferBtcMicro ? btcTechnicalFallback.stopDistance : preferSportsMicro ? sportsMicroScalp.stopDistance : stopDistance;
  const finalLossIfMissed = preferBtcMicro ? btcTechnicalFallback.lossIfMissed : preferSportsMicro ? sportsMicroScalp.lossIfMissed : lossIfMissed;
  const finalAdjustedTouch = preferBtcMicro ? null : preferSportsMicro ? sportsMicroScalp.adjustedTouch : adjustedTouch;
  const finalEvPerContract = preferBtcMicro ? null : preferSportsMicro ? sportsMicroScalp.evPerContract : evPerContract;
  const finalEvRoiPct = preferBtcMicro ? null : preferSportsMicro ? sportsMicroScalp.evRoiPct : evRoiPct;
  const totalProfitIfHit = finalSizing.targetProfitDollars;
  const totalLossIfStopped = finalSizing.stopLossDollars;
  const totalEvDollars = preferBtcMicro ? null : finalEvPerContract * finalSizing.contracts;
  const btcEvSwingQualifies = btcEvSwingCandidate
    && sizingQualified
    && evRoiPct >= settings.minDisplayEvPct
    && netProfitPct >= settings.minNetProfitPct
    && profitLossRatioOk({ profitIfHit, lossIfMissed })
    && hasSidewaysEvidence(chop)
    && touch.hasTouchEvidence
    && !touch.stabilityWarning;
  const finalQualifies = btcTechnicalFallback.qualifies || sportsMicroScalp.qualifies || normalQualifies || btcEvSwingQualifies;
  const finalReasonSummary = preferBtcMicro
    ? btcTechnicalFallback.reason
    : preferSportsMicro
      ? sportsMicroScalp.reason
    : btcEvSwingCandidate
      ? `BTC EV swing: ${makeReasonSummary(chop, adjustedTouch, evPerContract, notes, touch, tennisPause, { warning: false }, sportsLatePhase)}`
      : makeReasonSummary(chop, adjustedTouch, evPerContract, notes, touch, tennisPause, bitcoinTrend, sportsLatePhase);
  return {
    recommendation: `BUY ${side}`,
    side,
    marketTitle: market.title,
    subtitle: market.subtitle,
    ticker: market.ticker,
    event_ticker: market.event_ticker,
    series_ticker: market.series_ticker,
    category: market.category,
    status: market.status,
    close_time: market.close_time,
    expiration_time: market.expiration_time,
    expected_expiration_time: market.expected_expiration_time,
    decision_time: decisionIso(market),
    minutesLeft: round2(minutesLeft),
    occurrence_datetime: market.occurrence_datetime,
    selectionLabel: market.yes_sub_title || market.no_sub_title || market.subtitle,
    url: market.url,
    currentBuyPriceCents: round2(entry),
    estimatedAllInBuyCents: round2(entryCost * 100),
    currentBidCents: round2(bid),
    sellTargetCents: finalTarget,
    minTargetFor10PctCents: target,
    netProfitPct: round2(finalNetProfitPct),
    rawTouchProbability: round4(rawTouch),
    priceRatioTouchProbability: round4(priceRatioTouch),
    adjustedTouchProbability: round4(finalAdjustedTouch),
    recentTouchRate: round4(touch.recentTouchRate),
    hourlyTouchRate: round4(touch.hourlyTouchRate),
    targetTouchedRecently: touch.targetTouchedRecently,
    minutesSinceTargetTouch: touch.minutesSinceTargetTouch,
    amplitudeCoverage: round4(touch.amplitudeCoverage),
    recentStabilityScore: round4(touch.recentStabilityScore),
    recentRangeCents: round2(touch.recentRange),
    stabilityWarning: touch.stabilityWarning,
    tennisPauseWarning: tennisPause.warning,
    tennisPauseRangeCents: round2(tennisPause.range),
    tennisPauseSamples: tennisPause.samples,
    sportsLatePhaseWarning: sportsLatePhase.warning,
    sportsLatePhaseReason: sportsLatePhase.reason,
    bitcoinTrendWarning: bitcoinTrend.warning,
    bitcoinTrendDirection: bitcoinTrend.direction,
    bitcoinTrendDriftCents: round2(bitcoinTrend.drift),
    btcTechnicalBias: bitcoinTrend.technicalBias,
    btcTechnicalSummary: bitcoinTrend.technicalSummary,
    bitcoinContractType: bitcoinContractType(market),
    chopAdjustment: round4(chopAdjustment),
    liquidityAdjustment: round4(liquidityAdjustment),
    spreadAdjustment: round4(spreadAdjustment),
    timeAdjustment: round4(timeAdjustment),
    dataConfidence: round4(dataConfidence),
    stopPriceCents: finalStopPrice,
    stopDistanceCents: finalStopDistance,
    recommendedContracts: finalSizing.contracts,
    minContractsForProfit: finalSizing.minContractsForProfit,
    maxContractsByRisk: finalSizing.maxContractsByRisk,
    maxContractsAffordable: finalSizing.maxContractsAffordable,
    accountRiskPct: round2(finalSizing.riskFraction * 100),
    targetProfitDollars: round4(totalProfitIfHit),
    stopLossDollars: round4(totalLossIfStopped),
    totalEvDollars: round4(totalEvDollars),
    sizingReason: finalSizing.reason,
    profitIfHit: round4(finalProfitIfHit),
    lossIfMissed: round4(finalLossIfMissed),
    evPerContract: round4(finalEvPerContract),
    evRoiPct: round2(finalEvRoiPct),
    strategyType: preferBtcMicro ? "BTC_TECHNICAL_FALLBACK" : preferSportsMicro ? "SPORTS_MICRO_SCALP" : btcEvSwingCandidate ? "BTC_EV_SWING" : "SIDEWAYS_VOLATILITY",
    chopScore: round4(chop.score),
    rangeCents: round2(chop.range),
    driftCents: round2(chop.drift),
    directionChanges: chop.directionChanges,
    recentDirectionChanges: chop.recentDirectionChanges,
    recentSampleCount: chop.recentSampleCount,
    meanCrossings: chop.meanCrossings,
    recentAmplitudeCents: round2(chop.recentAmplitude),
    spreadCents: spread == null ? null : round2(spread),
    volume: market.volume,
    volume_24h: market.volume_24h,
    open_interest: market.open_interest,
    liquidity: market.liquidity,
    depthAtEntry: isYes ? market.orderbook.yesDepthAtEntry : market.orderbook.noDepthAtEntry,
    nearbyDepth: market.orderbook.nearbyDepth,
    qualifies: finalQualifies,
    reasonSummary: finalReasonSummary
  };
}

function makeScoredResult({
  market,
  side,
  entry,
  currentBid,
  spread,
  minutesLeft,
  chop,
  touch,
  tennisPause,
  sportsLatePhase,
  bitcoinTrend,
  dataConfidence,
  liquidityAdjustment,
  spreadAdjustment,
  timeAdjustment,
  finalSizing,
  finalTarget,
  finalProfitIfHit,
  finalNetProfitPct,
  finalStopPrice,
  finalStopDistance,
  finalLossIfMissed,
  finalAdjustedTouch,
  finalEvPerContract,
  finalEvRoiPct,
  totalProfitIfHit,
  totalLossIfStopped,
  totalEvDollars,
  finalQualifies,
  finalReasonSummary,
  bookLadderSignal = null,
  strategyType
}) {
  const isYes = side === "YES";
  const book = market.orderbook || {};
  const safeTouch = touch || {};
  const chopAdjustment = 0.75 + (chop?.score || 0) * 0.25;
  const entryCost = totalBuyCost(entry, KALSHI_STANDARD_FEE_RATE, DEFAULT_SETTINGS.contracts) / DEFAULT_SETTINGS.contracts;
  return {
    recommendation: `BUY ${side}`,
    side,
    marketTitle: market.title,
    subtitle: market.subtitle,
    ticker: market.ticker,
    event_ticker: market.event_ticker,
    series_ticker: market.series_ticker,
    category: market.category,
    status: market.status,
    close_time: market.close_time,
    expiration_time: market.expiration_time,
    expected_expiration_time: market.expected_expiration_time,
    decision_time: decisionIso(market),
    minutesLeft: round2(minutesLeft),
    occurrence_datetime: market.occurrence_datetime,
    selectionLabel: market.yes_sub_title || market.no_sub_title || market.subtitle,
    url: market.url,
    currentBuyPriceCents: round2(entry),
    estimatedAllInBuyCents: round2(entryCost * 100),
    currentBidCents: round2(currentBid),
    sellTargetCents: finalTarget,
    targetLimitPriceCents: isBtcExecutionStrategy(strategyType)
      ? clamp(Math.round(finalTarget), 1, 99)
      : finalTarget,
    priceBand: isBtcExecutionStrategy(strategyType)
      ? btcPriceBand(entry, finalStopPrice, finalTarget, finalTarget)
      : null,
    minTargetFor10PctCents: null,
    netProfitPct: round2(finalNetProfitPct),
    rawTouchProbability: round4(finalAdjustedTouch),
    priceRatioTouchProbability: round4(finalAdjustedTouch),
    adjustedTouchProbability: round4(finalAdjustedTouch),
    recentTouchRate: round4(safeTouch.recentTouchRate ?? 0),
    hourlyTouchRate: round4(safeTouch.hourlyTouchRate ?? 0),
    targetTouchedRecently: Boolean(safeTouch.targetTouchedRecently),
    minutesSinceTargetTouch: safeTouch.minutesSinceTargetTouch ?? null,
    amplitudeCoverage: round4(safeTouch.amplitudeCoverage ?? 0),
    recentStabilityScore: round4(safeTouch.recentStabilityScore ?? 0),
    recentRangeCents: round2(safeTouch.recentRange ?? 0),
    stabilityWarning: Boolean(safeTouch.stabilityWarning),
    tennisPauseWarning: tennisPause.warning,
    tennisPauseRangeCents: round2(tennisPause.range),
    tennisPauseSamples: tennisPause.samples,
    sportsLatePhaseWarning: sportsLatePhase.warning,
    sportsLatePhaseReason: sportsLatePhase.reason,
    bitcoinTrendWarning: bitcoinTrend.warning,
    bitcoinTrendDirection: bitcoinTrend.direction,
    bitcoinTrendDriftCents: round2(bitcoinTrend.drift),
    btcTechnicalBias: bitcoinTrend.technicalBias,
    btcTechnicalSummary: bitcoinTrend.technicalSummary,
    bitcoinContractType: bitcoinContractType(market),
    chopAdjustment: round4(chopAdjustment),
    liquidityAdjustment: round4(liquidityAdjustment),
    spreadAdjustment: round4(spreadAdjustment),
    timeAdjustment: round4(timeAdjustment),
    dataConfidence: round4(dataConfidence),
    stopPriceCents: finalStopPrice,
    stopDistanceCents: finalStopDistance,
    recommendedContracts: finalSizing.contracts,
    minContractsForProfit: finalSizing.minContractsForProfit,
    maxContractsByRisk: finalSizing.maxContractsByRisk,
    maxContractsAffordable: finalSizing.maxContractsAffordable,
    accountRiskPct: round2(finalSizing.riskFraction * 100),
    targetProfitDollars: round4(totalProfitIfHit),
    stopLossDollars: round4(totalLossIfStopped),
    totalEvDollars: round4(totalEvDollars),
    sizingReason: finalSizing.reason,
    profitIfHit: round4(finalProfitIfHit),
    lossIfMissed: round4(finalLossIfMissed),
    evPerContract: round4(finalEvPerContract),
    evRoiPct: round2(finalEvRoiPct),
    strategyType,
    chopScore: round4(chop.score),
    rangeCents: round2(chop.range),
    driftCents: round2(chop.drift),
    directionChanges: chop.directionChanges,
    meanCrossings: chop.meanCrossings,
    recentAmplitudeCents: round2(chop.recentAmplitude),
    spreadCents: spread == null ? null : round2(spread),
    volume: market.volume,
    volume_24h: market.volume_24h,
    open_interest: market.open_interest,
    liquidity: market.liquidity,
    depthAtEntry: isYes ? book.yesDepthAtEntry : book.noDepthAtEntry,
    nearbyDepth: book.nearbyDepth,
    bookWallSummary: book.wallSummary || null,
    bookLadderSignal,
    qualifies: finalQualifies,
    reasonSummary: finalReasonSummary
  };
}

function computeRecommendedContracts({ accountValue, minTargetProfitDollars, entryCents, targetCents, stopCents, feeRate, maxContracts }) {
  const riskFraction = riskFractionForAccount(accountValue);
  const maxRiskDollars = Math.max(0.5, accountValue * riskFraction);
  const cappedMax = Math.max(1, Math.min(maxContracts, Math.floor(accountValue / Math.max(entryCents / 100, 0.01))));
  let minContractsForProfit = null;
  let maxContractsByRisk = 0;
  let maxContractsAffordable = 0;
  let recommended = 0;
  let selectedProfit = 0;
  let selectedLoss = 0;
  for (let contracts = 1; contracts <= cappedMax; contracts += 1) {
    const entryCost = totalBuyCost(entryCents, feeRate, contracts);
    const targetProceeds = totalSellProceeds(targetCents, feeRate, contracts);
    const stopProceeds = totalSellProceeds(stopCents, feeRate, contracts);
    const profit = targetProceeds - entryCost;
    const loss = Math.max(0, entryCost - stopProceeds);
    if (entryCost <= accountValue) maxContractsAffordable = contracts;
    if (loss <= maxRiskDollars) maxContractsByRisk = contracts;
    if (profit >= minTargetProfitDollars && minContractsForProfit == null) minContractsForProfit = contracts;
    if (entryCost <= accountValue && loss <= maxRiskDollars && profit >= minTargetProfitDollars) {
      recommended = contracts;
      selectedProfit = profit;
      selectedLoss = loss;
    }
  }
  const reason = recommended
    ? `Buy ${recommended} contracts: clears $${minTargetProfitDollars.toFixed(2)} target profit and risks about ${round2(riskFraction * 100)}% of account at stop.`
    : `Skipped sizing: cannot clear $${minTargetProfitDollars.toFixed(2)} target profit within account/risk limits.`;
  return {
    contracts: recommended,
    minContractsForProfit,
    maxContractsByRisk,
    maxContractsAffordable,
    riskFraction,
    targetProfitDollars: round4(selectedProfit),
    stopLossDollars: round4(selectedLoss),
    reason
  };
}

function computeBtcTechnicalFallback({
  market,
  side,
  entry,
  entryCost,
  settings,
  feeRate,
  bitcoinTrend,
  technical,
  candleSeries,
  dataConfidence,
  liquidityAdjustment,
  spreadAdjustment,
  spreadCents,
  timeAdjustment,
  tennisPause,
  sportsLatePhase
}) {
  const unavailable = (reason) => ({ qualifies: false, reason });
  if (isBitcoinHourlyBlackoutNow()) return unavailable("BTC scraper blocked: 4-5 PM ET hourly blackout.");
  if (!isCryptoMarket(market) || !bitcoinAboveContract(market)) return unavailable("BTC scraper blocked: not an eligible Bitcoin above-threshold hourly contract.");
  if (!isBitcoinHourlyContract(`${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase(), market)) return unavailable("BTC scraper blocked: not current hourly BTC.");
  if (tennisPause?.warning || sportsLatePhase?.warning) return unavailable(`BTC scraper blocked: ${sportsLatePhase?.reason || tennisPause?.reason || "safety warning"}.`);
  const minutesLeft = minutesToDecision(market);
  if (!Number.isFinite(minutesLeft)) return unavailable("BTC scraper blocked: cannot determine minutes left.");
  const signal = btcResearchScalpSignal(market, side, entry, spreadCents);
  if (!signal.ok) return unavailable(`BTC scraper waiting: ${signal.reason}`);
  const target = Math.min(BTC_MICRO_MAX_TARGET_CENTS, Math.round(entry + signal.targetDistance));
  const executableTarget = target;
  const sellFee = feePerContract(executableTarget, feeRate, settings.contracts);
  const sellProceeds = executableTarget / 100 - sellFee;
  const profitIfHit = sellProceeds - entryCost;
  if (profitIfHit <= 0) return unavailable(`BTC scraper blocked: ${signal.reason}; target ${target}c does not clear fees at current sizing.`);
  const netProfitPct = (profitIfHit / entryCost) * 100;
  const bookLadder = computeBookLadderSignal(market.orderbook, side, entry, executableTarget);
  const stopPrice = validCents(signal.stopPrice) ? signal.stopPrice : Math.max(1, Math.round(entry - BTC_RESEARCH_STOP_CENTS));
  const stopDistance = Math.max(1, Math.round(entry - stopPrice));
  const stopFee = feePerContract(stopPrice, feeRate, settings.contracts);
  const stopProceeds = stopPrice / 100 - stopFee;
  const lossIfMissed = Math.max(0, entryCost - stopProceeds);
  const sizing = computeRecommendedContracts({
    accountValue: settings.accountValue,
    minTargetProfitDollars: Math.min(settings.minTargetProfitDollars, BTC_MICRO_MIN_TARGET_PROFIT_DOLLARS),
    entryCents: entry,
    targetCents: executableTarget,
    stopCents: stopPrice,
    feeRate,
    maxContracts: LIVE_MAX_CONTRACTS
  });
  const sizingQualified = sizing.contracts > 0 && sizing.targetProfitDollars > 0;
  const qualifies = sizingQualified;
  return {
    qualifies,
    target,
    executableTarget,
    targetLimitPriceCents: executableTarget,
    priceBand: btcPriceBand(entry, stopPrice, target, executableTarget),
    profitIfHit,
    netProfitPct,
    stopPrice,
    stopDistance,
    lossIfMissed,
    touchProbability: null,
    evPerContract: null,
    evRoiPct: null,
    sizing,
    bookLadderSignal: bookLadder,
    reason: `BTC ${signal.mode} scalp: ${signal.reason}; ladder observed only: ${bookLadder.reason}; entry ${round2(entry)}c, stop ${stopPrice}c, target sell ${executableTarget}c (${btcPriceBandText(entry, stopPrice, target)}).`
  };
}

function btcExecutionSpreadCushion(spreadCents) {
  const spread = Number(spreadCents);
  if (!Number.isFinite(spread) || spread <= 0) return BTC_EXECUTION_SPREAD_CUSHION_CENTS;
  return clamp(Math.ceil(spread), 1, BTC_EXECUTION_SPREAD_CUSHION_CENTS);
}

function btcPriceBand(center, stop, target, executableTarget = null) {
  const entryCenter = Math.round(Number(center));
  const stopCenter = Math.round(Number(stop));
  const targetCenter = Math.round(Number(target));
  return {
    entry: adjacentBand(entryCenter),
    stop: adjacentBand(stopCenter),
    target: adjacentBand(targetCenter),
    executableTarget: Number.isFinite(Number(executableTarget)) ? Math.round(Number(executableTarget)) : targetCenter
  };
}

function adjacentBand(center) {
  const value = Math.round(Number(center));
  return [clamp(value - 1, 1, 99), clamp(value, 1, 99), clamp(value + 1, 1, 99)];
}

function btcPriceBandText(entry, stop, target) {
  const band = btcPriceBand(entry, stop, target);
  return `entry ${band.entry.join("-")}, stop ${band.stop.join("-")}, target ${band.target.join("-")}`;
}

function btcTechnicalStopDistanceCents(entry, target, minutesLeft, spreadCents = null) {
  if (
    Number.isFinite(Number(minutesLeft))
    && Number(minutesLeft) <= BTC_TECHNICAL_HIGH_ENTRY_MINUTES_LEFT
    && Number(entry) >= BTC_TECHNICAL_LATE_RELAXED_STOP_ENTRY_CENTS
  ) {
    return Math.max(3, Math.round(Number(entry) - BTC_TECHNICAL_LATE_RELAXED_STOP_CENTS));
  }
  const targetDistance = Math.max(1, Math.round(Number(target) - Number(entry)));
  const rawSpread = Number(spreadCents);
  const spread = Number.isFinite(rawSpread) ? Math.max(0, Math.ceil(rawSpread)) : BTC_EXECUTION_SPREAD_CUSHION_CENTS;
  const spreadBuffer = spread >= 3 ? spread - 2 : 0;
  return Math.max(MIN_SCRAPE_STOP_DISTANCE_CENTS, targetDistance + 14 + spreadBuffer);
}

function chooseBtcMicroScalpTarget({ entry, entryCost, feeRate, settings, spreadCents = null }) {
  const target = Math.min(BTC_MICRO_MAX_TARGET_CENTS, Math.round(entry) + BTC_DESTROYER_TARGET_DISTANCE_CENTS);
  const executableTarget = target;
  if (target <= entry) return null;
  const sellFee = feePerContract(executableTarget, feeRate, settings.contracts);
  const sellProceeds = executableTarget / 100 - sellFee;
  const profitIfHit = sellProceeds - entryCost;
  if (profitIfHit <= 0) return null;
  return {
    target,
    executableTarget,
    sellProceeds,
    profitIfHit,
    netProfitPct: (profitIfHit / entryCost) * 100
  };
}

function computeSportsMicroScalp({
  market,
  side,
  entry,
  entryCost,
  settings,
  feeRate,
  candleSeries,
  chop,
  dataConfidence,
  liquidityAdjustment,
  spreadAdjustment,
  timeAdjustment,
  tennisPause,
  sportsLatePhase,
  bitcoinTrend
}) {
  const unavailable = { qualifies: false };
  if (!isSportsScalpMarket(market)) return unavailable;
  if (!hasSidewaysEvidence(chop)) return unavailable;
  if (tennisPause?.warning || sportsLatePhase?.warning || bitcoinTrend?.warning) return unavailable;
  const distance = scheduledScrapeDistanceCents(entry);
  const plannedTarget = Math.min(LATE_LOCK_TARGET_MAX_CENTS, Math.round(entry) + distance);
  const dynamicPlan = volatilityAdjustedPlan({
    entry,
    baseTarget: plannedTarget,
    spreadCents: market.orderbook?.[side === "YES" ? "yesSpread" : "noSpread"],
    candleSeries,
    side,
    minTargetDistance: distance,
    maxTarget: LATE_LOCK_TARGET_MAX_CENTS
  });
  if (!dynamicPlan) return unavailable;
  const target = dynamicPlan.target;
  if (target <= entry) return unavailable;
  const sellFee = feePerContract(target, feeRate, settings.contracts);
  const sellProceeds = target / 100 - sellFee;
  const profitIfHit = sellProceeds - entryCost;
  if (profitIfHit <= 0) return unavailable;
  const stopDistance = dynamicPlan.stopDistance;
  const stopPrice = dynamicPlan.stopPrice;
  const stopSellFee = feePerContract(stopPrice, feeRate, settings.contracts);
  const stopProceeds = stopPrice / 100 - stopSellFee;
  const lossIfMissed = Math.max(0, entryCost - stopProceeds);
  const touch = computeScalpTouch(candleSeries, side, entry, target, stopPrice, chop);
  if (!touch.hasTouchEvidence || touch.stabilityWarning) return unavailable;
  const priceRatioTouch = clamp(entry / target, 0, 0.99);
  const rawTouch = touch.rawTouchProbability ?? priceRatioTouch;
  const chopAdjustment = 0.75 + chop.score * 0.25;
  const adjustedTouch = clamp(rawTouch * chopAdjustment * liquidityAdjustment * spreadAdjustment * timeAdjustment * dataConfidence, 0, 0.99);
  const evPerContract = adjustedTouch * profitIfHit - (1 - adjustedTouch) * lossIfMissed;
  const evRoiPct = (evPerContract / entryCost) * 100;
  if (!profitLossRatioOk({ profitIfHit, lossIfMissed })) return unavailable;
  const sizing = computeRecommendedContracts({
    accountValue: settings.accountValue,
    minTargetProfitDollars: Math.min(settings.minTargetProfitDollars, SPORTS_MICRO_MIN_TARGET_PROFIT_DOLLARS),
    entryCents: entry,
    targetCents: target,
    stopCents: stopPrice,
    feeRate,
    maxContracts: LIVE_MAX_CONTRACTS
  });
  const qualifies = sizing.contracts > 0
    && sizing.targetProfitDollars >= SPORTS_MICRO_MIN_TARGET_PROFIT_DOLLARS
    && evRoiPct >= settings.minDisplayEvPct;
  if (!qualifies) return unavailable;
  return {
    qualifies: true,
    target,
    profitIfHit,
    netProfitPct: (profitIfHit / entryCost) * 100,
    stopPrice,
    stopDistance,
    lossIfMissed,
    adjustedTouch,
    evPerContract,
    evRoiPct,
    sizing,
    touch,
    reason: `Sports micro-scalp: sideways volatility qualified, dynamic ${target - Math.round(entry)}c target ${target}c / ${stopDistance}c stop ${stopPrice}c; recent range ${round2(dynamicPlan.stats.recentRange)}c, EV ${formatPct(evRoiPct)}.`
  };
}

function computeSportsBestEffortScalp({
  market,
  side,
  entry,
  entryCost,
  settings,
  feeRate,
  candleSeries,
  chop,
  dataConfidence,
  liquidityAdjustment,
  spreadAdjustment,
  timeAdjustment,
  tennisPause,
  sportsLatePhase,
  bitcoinTrend
}) {
  const unavailable = { eligible: false };
  if (!isSportsScalpMarket(market)) return unavailable;
  if (!hasSidewaysEvidence(chop)) return unavailable;
  if (tennisPause?.warning || sportsLatePhase?.warning || bitcoinTrend?.warning) return unavailable;
  const distance = scheduledScrapeDistanceCents(entry);
  const plannedTarget = Math.min(LATE_LOCK_TARGET_MAX_CENTS, Math.round(entry) + distance);
  const dynamicPlan = volatilityAdjustedPlan({
    entry,
    baseTarget: plannedTarget,
    spreadCents: market.orderbook?.[side === "YES" ? "yesSpread" : "noSpread"],
    candleSeries,
    side,
    minTargetDistance: distance,
    maxTarget: LATE_LOCK_TARGET_MAX_CENTS
  });
  if (!dynamicPlan) return unavailable;
  const target = dynamicPlan.target;
  if (target <= entry) return unavailable;
  const sellFee = feePerContract(target, feeRate, settings.contracts);
  const sellProceeds = target / 100 - sellFee;
  const profitIfHit = sellProceeds - entryCost;
  if (profitIfHit <= 0) return unavailable;
  const stopDistance = dynamicPlan.stopDistance;
  const stopPrice = dynamicPlan.stopPrice;
  const stopSellFee = feePerContract(stopPrice, feeRate, settings.contracts);
  const stopProceeds = stopPrice / 100 - stopSellFee;
  const lossIfMissed = Math.max(0, entryCost - stopProceeds);
  const touch = computeScalpTouch(candleSeries, side, entry, target, stopPrice, chop);
  if (touch.stabilityWarning) return unavailable;
  const rawTouch = touch.rawTouchProbability ?? clamp(entry / target, 0, 0.99);
  const chopAdjustment = 0.75 + chop.score * 0.25;
  const adjustedTouch = clamp(rawTouch * chopAdjustment * liquidityAdjustment * spreadAdjustment * timeAdjustment * dataConfidence, 0, 0.99);
  const evPerContract = adjustedTouch * profitIfHit - (1 - adjustedTouch) * lossIfMissed;
  const evRoiPct = (evPerContract / entryCost) * 100;
  if (!profitLossRatioOk({ profitIfHit, lossIfMissed })) return unavailable;
  const sizing = computeRecommendedContracts({
    accountValue: settings.accountValue,
    minTargetProfitDollars: 0.01,
    entryCents: entry,
    targetCents: target,
    stopCents: stopPrice,
    feeRate,
    maxContracts: LIVE_MAX_CONTRACTS
  });
  if (sizing.contracts < 1 || sizing.targetProfitDollars <= 0) return unavailable;
  return {
    eligible: true,
    target,
    profitIfHit,
    netProfitPct: (profitIfHit / entryCost) * 100,
    stopPrice,
    stopDistance,
    lossIfMissed,
    adjustedTouch,
    evPerContract,
    evRoiPct,
    sizing,
    touch,
    reason: `Watchlist sports chop: ${round2(chop.score * 100)}% chop, ${round2(chop.range)}c range, ${chop.directionChanges} turns; fallback can promote after ${SPORTS_BEST_CHOP_MIN_SCANNED_MARKETS} live markets.`
  };
}

function computeLateLockScalp({
  market,
  side,
  entry,
  entryCost,
  settings,
  feeRate,
  tennisPause,
  sportsLatePhase,
  bitcoinTrend
}) {
  const unavailable = { qualifies: false };
  if (tennisPause?.warning || isTennisMarket(market)) return unavailable;
  const eligibleBtc = isLateLockBitcoinMarket(market);
  const eligibleMlb = !isCryptoMarket(market) && isLateLockMlbMarket(market, sportsLatePhase);
  if (!eligibleBtc && !eligibleMlb) return unavailable;
  const minEntry = eligibleBtc ? BTC_LATE_LOCK_ENTRY_MIN_CENTS : LATE_LOCK_ENTRY_MIN_CENTS;
  const maxEntry = eligibleBtc ? BTC_LATE_LOCK_MAX_ENTRY_CENTS : LATE_LOCK_TARGET_MAX_CENTS - 1;
  if (entry < minEntry || entry > maxEntry) return unavailable;
  if (eligibleBtc && bitcoinTrend?.warning) return unavailable;
  const bookShove = eligibleBtc ? btcBookShoveSignal(market) : { side: null, reason: "" };
  if (eligibleBtc && entry < LATE_LOCK_ENTRY_MIN_CENTS && bookShove.side !== side) return unavailable;
  const stopPrice = LATE_LOCK_STOP_CENTS;
  const stopFee = feePerContract(stopPrice, feeRate, settings.contracts);
  const stopProceeds = stopPrice / 100 - stopFee;
  const lossIfMissed = Math.max(0, entryCost - stopProceeds);
  const distance = scheduledScrapeDistanceCents(entry);
  const target = Math.min(LATE_LOCK_TARGET_MAX_CENTS, Math.round(entry) + distance);
  if (target <= entry) return unavailable;
    const bookLadder = computeBookLadderSignal(market.orderbook, side, entry, target);
    const sellFee = feePerContract(target, feeRate, settings.contracts);
    const sellProceeds = target / 100 - sellFee;
    const profitIfHit = sellProceeds - entryCost;
    if (profitIfHit <= 0) return unavailable;
    const sizing = computeRecommendedContracts({
      accountValue: settings.accountValue,
      minTargetProfitDollars: Math.min(settings.minTargetProfitDollars, LATE_LOCK_MIN_TARGET_PROFIT_DOLLARS),
      entryCents: entry,
      targetCents: target,
      stopCents: stopPrice,
      feeRate,
      maxContracts: LIVE_MAX_CONTRACTS
    });
    if (sizing.contracts < 1 || sizing.targetProfitDollars < LATE_LOCK_MIN_TARGET_PROFIT_DOLLARS) return unavailable;
    const touchProbability = lateLockTouchProbability(entry, eligibleBtc);
    const evPerContract = touchProbability * profitIfHit - (1 - touchProbability) * lossIfMissed;
    const evRoiPct = (evPerContract / entryCost) * 100;
    return {
      qualifies: true,
      target,
      profitIfHit,
      netProfitPct: (profitIfHit / entryCost) * 100,
      stopPrice,
      stopDistance: Math.max(0, Math.round(entry - stopPrice)),
      lossIfMissed,
      touchProbability,
      evPerContract,
      evRoiPct,
      sizing,
      bookLadderSignal: bookLadder,
      reason: `Late-lock scrape: ${eligibleBtc ? `BTC final 10-minute window ${entry >= LATE_LOCK_ENTRY_MIN_CENTS ? "90c+ hold-grade entry" : `80-89c book-confirmed ${bookShove.side}`}` : "MLB late-game window"}, ladder observed only: ${bookLadder.reason}; entry ${round2(entry)}c, ${target - Math.round(entry)}c scheduled target ${target}c, thesis stop ${stopPrice}c.`
    };
}

function isLateLockBitcoinMarket(market) {
  if (isBitcoinHourlyBlackoutNow()) return false;
  if (!isCryptoMarket(market) || !bitcoinAboveContract(market)) return false;
  if (!isBitcoinHourlyContract(`${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""} ${market.title || ""}`, market)) return false;
  const minutesLeft = minutesToDecision(market);
  return Number.isFinite(minutesLeft) && minutesLeft > 0 && minutesLeft <= BTC_HOURLY_FORCE_EXIT_MINUTES;
}

function isLateLockMlbMarket(market, sportsLatePhase) {
  if (allowedCalendarBucket(market) !== "baseball") return false;
  if (!/^KXMLB/i.test(`${market.series_ticker || ""} ${market.ticker || ""}`)) return false;
  return Boolean(sportsLatePhase?.warning);
}

function lateLockTouchProbability(entry, btc) {
  const base = btc ? 0.995 : 0.992;
  const priceBonus = clamp((entry - LATE_LOCK_ENTRY_MIN_CENTS) / 1000, 0, 0.006);
  return clamp(base + priceBonus, 0, 0.999);
}

function scheduledScrapeDistanceCents(entry) {
  if (entry >= 95) return 1;
  if (entry >= 90) return 2;
  if (entry >= 75) return 3;
  return 4;
}

function sportsMicroStopDistanceCents(targetDistance) {
  return Math.max(MIN_SCRAPE_STOP_DISTANCE_CENTS, Math.round(targetDistance * 1.5));
}

function isSportsScalpMarket(market) {
  if (isCryptoMarket(market) || isWeatherEvent(market)) return false;
  const category = String(market.category || "").toLowerCase();
  return category === "sports" || Boolean(allowedCalendarBucket(market));
}

function entryBandForSide(side, matchupWinnerMarket = false) {
  return { min: SIDE_ENTRY_MIN_CENTS, max: SIDE_ENTRY_MAX_CENTS };
}

function recentTradeStats(series, side, entryCents, targetCents = null) {
  const ranges = sideRangeSeries(series, side).filter((row) => validCents(row.high) && validCents(row.low));
  const recent = ranges.slice(-TRADE_RECENT_WINDOW_CANDLES);
  const near = ranges.slice(-TRADE_NEAR_WINDOW_CANDLES);
  const active = near.length ? near : recent;
  const rangeValues = active.map((row) => Math.max(0, row.high - row.low));
  const avgRange = rangeValues.length ? rangeValues.reduce((sum, value) => sum + value, 0) / rangeValues.length : 0;
  const high = active.length ? Math.max(...active.map((row) => row.high)) : null;
  const low = active.length ? Math.min(...active.map((row) => row.low)) : null;
  const recentRange = validCents(high) && validCents(low) ? high - low : 0;
  const target = validCents(targetCents) ? Number(targetCents) : null;
  const entry = Number(entryCents);
  const entryTouches = validCents(entry) ? active.filter((row) => row.low <= entry && row.high >= entry).length : 0;
  const targetTouches = validCents(target) ? active.filter((row) => row.high >= target).length : 0;
  return {
    samples: active.length,
    recentRange,
    recentAmplitude: avgRange,
    entryTouches,
    targetTouches,
    entryTouchRate: active.length ? entryTouches / active.length : 0,
    targetTouchRate: active.length ? targetTouches / active.length : 0
  };
}

function volatilityAdjustedPlan({ entry, baseTarget, spreadCents, candleSeries, side, minTargetDistance = 3, maxTarget = VOL_TARGET_MAX_CENTS }) {
  if (!validCents(entry)) return null;
  const stats = recentTradeStats(candleSeries, side, entry, baseTarget);
  const spread = Math.max(0, Number(spreadCents || 0));
  const rangeBuffer = Math.max(
    spread * 2,
    Number(stats.recentAmplitude || 0) * 1.5,
    Number(stats.recentRange || 0) * 0.25
  );
  const stopDistance = clamp(Math.round(rangeBuffer || VOL_STOP_MIN_CENTS), VOL_STOP_MIN_CENTS, VOL_STOP_MAX_CENTS);
  const targetDistance = Math.max(
    Math.round(Number(baseTarget || 0) - Number(entry)),
    Math.round(minTargetDistance),
    Math.ceil(stopDistance * 0.75),
    Math.ceil(Number(stats.recentAmplitude || 0) * 2)
  );
  const target = clamp(Math.round(Number(entry) + targetDistance), 1, maxTarget);
  const stopPrice = clamp(Math.round(Number(entry) - stopDistance), 1, 99);
  if (target <= entry || stopPrice >= entry) return null;
  return { target, stopPrice, stopDistance, targetDistance: target - Math.round(entry), stats };
}

function profitLossRatioOk({ profitIfHit, lossIfMissed }) {
  const profit = Number(profitIfHit || 0);
  const loss = Number(lossIfMissed || 0);
  if (profit <= 0) return false;
  if (loss <= 0) return true;
  return profit >= loss * MIN_PROFIT_TO_LOSS_RATIO;
}

function isMatchupWinnerMarket(market) {
  return isMatchupWinnerResult({
    category: market.category,
    series_ticker: market.series_ticker,
    event_ticker: market.event_ticker,
    marketTitle: market.title,
    subtitle: market.subtitle,
    ticker: market.ticker
  });
}

function riskFractionForAccount(accountValue) {
  if (accountValue <= 25) return 0.15;
  if (accountValue <= 50) return 0.12;
  if (accountValue <= 200) return 0.1;
  if (accountValue <= 1000) return 0.07;
  return 0.05;
}

function totalBuyCost(priceCents, feeRate, contracts) {
  return contracts * (priceCents / 100 + feePerContract(priceCents, feeRate, contracts));
}

function totalSellProceeds(priceCents, feeRate, contracts) {
  return contracts * (priceCents / 100 - feePerContract(priceCents, feeRate, contracts));
}

function hasSidewaysEvidence(chop) {
  return chop.range >= 2 && (chop.directionChanges >= 1 || chop.meanCrossings >= 1);
}

function detectTennisPause(market, series, side, scan = null) {
  if (!isTennisMarket(market)) return { warning: false, range: null, samples: 0 };
  const stageSafety = detectTennisStageSafety(market);
  if (stageSafety.warning) return stageSafety;
  const observed = observeTennisPrice(scan, market, side);
  const ranges = sideRangeSeries(series, side)
    .map((row, index) => ({ ...row, ts: series?.[index]?.ts ?? null }))
    .filter((row) => validCents(row.high) && validCents(row.low));
  if (!ranges.length) {
    if (observed.samples >= 2) return observed;
    return { warning: true, range: 0, samples: observed.samples, reason: "tennis safety: candles unavailable, cannot verify match is moving" };
  }
  const latestTs = Math.max(...ranges.map((row) => Number(row.ts) || 0));
  const recent = latestTs
    ? ranges.filter((row) => (latestTs - (Number(row.ts) || latestTs)) * 1000 <= TENNIS_PAUSE_WINDOW_MS)
    : ranges.slice(-2);
  const sample = recent.length ? recent : ranges.slice(-2);
  const high = Math.max(...sample.map((row) => row.high));
  const low = Math.min(...sample.map((row) => row.low));
  const range = high - low;
  const candleWarning = sample.length >= 1 && range <= TENNIS_PAUSE_MAX_RANGE_CENTS;
  const warning = candleWarning || observed.warning;
  return {
    warning,
    range: observed.samples >= 2 ? Math.min(range, observed.range) : range,
    samples: Math.max(sample.length, observed.samples),
    reason: observed.warning
      ? observed.reason
      : candleWarning ? `tennis safety: no meaningful price movement in about ${Math.round(TENNIS_PAUSE_WINDOW_MS / 1000)}s` : ""
  };
}

function detectTennisStageSafety(market) {
  const text = `${market.title || ""} ${market.subtitle || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""} ${market.ticker || ""} ${market.event_ticker || ""} ${market.liveMilestoneTitle || ""} ${JSON.stringify(market.liveMilestoneDetails || {})}`.toLowerCase();
  if (/\b(bye|walkover|retired|retirement|withdrawn|suspended|postponed|delayed|paused)\b/.test(text)) {
    return { warning: true, range: 0, samples: 0, reason: "tennis safety: match appears paused/bye/withdrawal-related" };
  }
  if (/\b(3rd|third|set\s*3|3\s*set|final set|deciding set|match tiebreak|tie-break|tiebreak)\b/.test(text)) {
    return { warning: true, range: 0, samples: 0, reason: "tennis safety: avoiding late/final-set tennis markets" };
  }
  const setSafety = detectTennisScoreboardThirdColumn(market);
  if (setSafety.warning) return { warning: true, range: 0, samples: 0, reason: setSafety.reason };
  return { warning: false, range: null, samples: 0 };
}

function detectTennisScoreboardThirdColumn(market) {
  const details = market.liveMilestoneDetails || {};
  const candidates = [
    details,
    market.product_metadata || {},
    market.score || null,
    market.scores || null,
    market.scoreboard || null,
    market.game_state || null
  ].filter(Boolean);
  for (const candidate of candidates) {
    const found = inspectTennisStageNode(candidate);
    if (found) return { warning: true, reason: found };
  }
  return { warning: false, reason: "" };
}

function inspectTennisStageNode(node, keyPath = "") {
  if (node == null) return "";
  if (Array.isArray(node)) {
    const scoreLikePath = /\b(score|scores|set|sets|period|periods|columns|games)\b/i.test(keyPath);
    const nonEmpty = node.filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
    if (scoreLikePath && nonEmpty.length >= 3) return "tennis safety: scoreboard has a third set/column";
    for (let index = 0; index < node.length; index += 1) {
      const found = inspectTennisStageNode(node[index], `${keyPath}.${index}`);
      if (found) return found;
    }
    return "";
  }
  if (typeof node !== "object") return "";
  for (const [key, value] of Object.entries(node)) {
    const lowerKey = String(key).toLowerCase();
    const path = keyPath ? `${keyPath}.${lowerKey}` : lowerKey;
    if (/\b(current_?set|set_?number|period|current_?period|match_?period|score_?column|column)\b/.test(lowerKey)) {
      const number = Number(value);
      if (Number.isFinite(number) && number >= 3) return "tennis safety: scoreboard is in third/final tennis column";
      if (/\b(3|third|3rd|final|deciding)\b/i.test(String(value))) return "tennis safety: scoreboard is in third/final tennis column";
    }
    const found = inspectTennisStageNode(value, path);
    if (found) return found;
  }
  return "";
}

function observeTennisPrice(scan, market, side) {
  if (!scan?.tennisPriceHistory) return { warning: false, range: null, samples: 0 };
  const bid = side === "YES" ? market.yes_bid : market.no_bid;
  if (!validCents(bid)) return { warning: false, range: null, samples: 0 };
  const key = `${market.ticker}|${side}`;
  const now = Date.now();
  const history = (scan.tennisPriceHistory.get(key) || []).filter((row) => now - row.time <= TENNIS_OBS_PAUSE_WINDOW_MS);
  history.push({ time: now, price: bid });
  scan.tennisPriceHistory.set(key, history);
  if (history.length < 2) return { warning: false, range: 0, samples: history.length };
  const spanMs = history[history.length - 1].time - history[0].time;
  const range = Math.max(...history.map((row) => row.price)) - Math.min(...history.map((row) => row.price));
  const warning = spanMs >= TENNIS_PAUSE_WINDOW_MS && range <= TENNIS_PAUSE_MAX_RANGE_CENTS;
  return {
    warning,
    range,
    samples: history.length,
    reason: warning ? `tennis safety: live bid stayed flat for ${Math.round(spanMs / 1000)}s` : ""
  };
}

function isTennisMarket(market) {
  const text = `${market.category || ""} ${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""} ${market.title || ""} ${market.subtitle || ""}`.toLowerCase();
  return /\b(tennis|atp|wta|itf)\b/.test(text) || /^kxitfwmatch|^kxatp|^kxwta/.test(text);
}

function detectLateSportsPhase(market) {
  if (isCryptoMarket(market) || isWeatherEvent(market)) return { warning: false, reason: "" };
  const bucket = allowedCalendarBucket(market);
  if (!bucket || bucket === "crypto" || bucket === "daily-temperature") return { warning: false, reason: "" };
  const text = sportsPhaseText(market);
  if (!text) return { warning: false, reason: "" };
  if (isTennisMarket(market)) return detectTennisStageSafety(market);

  const clock = parseGameClockMinutes(text);
  const finalMarker = /\b(final|overtime|ot|extra time|sudden death|shootout)\b/.test(text);
  let warning = false;
  let reason = "";

  if (bucket === "baseball") {
    warning = /\b(9th|ninth|10th|11th|12th|13th|14th|15th|extras?|extra innings?|top 9|bot(?:tom)? 9|bottom 9|t9|b9)\b/.test(text);
    reason = "sports safety: avoiding baseball in the 9th inning or later";
  } else if (bucket === "basketball") {
    const fourth = /\b(4th|fourth|q4|4q|final quarter|overtime|ot)\b/.test(text);
    warning = /\b(overtime|ot)\b/.test(text) || (fourth && lateClock(clock, 5));
    reason = "sports safety: avoiding basketball in the final 5 minutes/overtime";
  } else if (bucket === "hockey") {
    const third = /\b(3rd|third|p3|3p|third period|overtime|ot|shootout)\b/.test(text);
    warning = /\b(overtime|ot|shootout)\b/.test(text) || (third && lateClock(clock, 5));
    reason = "sports safety: avoiding hockey in the final 5 minutes/overtime";
  } else if (bucket === "football") {
    const fourth = /\b(4th|fourth|q4|4q|fourth quarter|overtime|ot)\b/.test(text);
    warning = /\b(overtime|ot)\b/.test(text) || (fourth && lateClock(clock, 5));
    reason = "sports safety: avoiding football in the final 5 minutes/overtime";
  } else if (bucket === "cricket") {
    warning = /\b(death overs?|final overs?|last overs?|final over|last over|19th over|20th over|49th over|50th over|innings break|super over)\b/.test(text) || finalMarker;
    reason = "sports safety: avoiding cricket death/final-over markets";
  } else if (["afl", "rugby", "college-lacrosse", "sports-other"].includes(bucket)) {
    const lateFinalPeriod = /\b(4th|fourth|q4|4q|final quarter|2nd half|second half|final period|overtime|ot|extra time)\b/.test(text);
    warning = /\b(overtime|ot|extra time)\b/.test(text) || (lateFinalPeriod && lateClock(clock, 5));
    reason = "sports safety: avoiding final 5 minutes/overtime sports markets";
  }

  return warning ? { warning: true, reason } : { warning: false, reason: "" };
}

function sportsPhaseText(market) {
  return `${market.category || ""} ${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""} ${market.title || ""} ${market.subtitle || ""} ${market.yes_sub_title || ""} ${market.no_sub_title || ""} ${JSON.stringify(market.product_metadata || {})}`.toLowerCase();
}

function parseGameClockMinutes(text) {
  const match = text.match(/\b(\d{1,2}):([0-5]\d)\b/);
  if (!match) return NaN;
  return Number(match[1]) + Number(match[2]) / 60;
}

function lateClock(clock, minutes) {
  return Number.isFinite(clock) && clock <= minutes;
}

function detectBitcoinTrend(market, series, side, scan = null) {
  if (!isCryptoMarket(market)) return { warning: false, direction: "flat", drift: 0, technicalBias: null, technicalSummary: "" };
  const prices = series.map((c) => c.price?.close).filter(validCents);
  let drift = 0;
  let kalshiDirection = "unknown";
  if (prices.length >= 4) {
    const sample = prices.slice(-20);
    const first = sample[0];
    const last = sample[sample.length - 1];
    drift = last - first;
    const range = Math.max(...sample) - Math.min(...sample);
    const meaningful = Math.abs(drift) >= 2 && Math.abs(drift) >= Math.max(1, range * 0.35);
    kalshiDirection = meaningful ? (drift > 0 ? "up" : "down") : "flat";
  }
  const technicalBias = "disabled";
  const direction = kalshiDirection;
  const aboveContract = bitcoinAboveContract(market);
  const warning = aboveContract && ((direction === "up" && side === "NO") || (direction === "down" && side === "YES"));
  const reasonSource = `Kalshi trend ${kalshiDirection}`;
  return {
    warning,
    direction,
    drift,
    technicalBias,
    technicalSummary: "",
    reason: warning ? `bitcoin trend safety: ${reasonSource}, blocking BUY ${side} against the chart trend` : ""
  };
}

function btcTrendPreferredSide(bitcoinTrend) {
  if (bitcoinTrend?.direction === "up") return "YES";
  if (bitcoinTrend?.direction === "down") return "NO";
  return null;
}

function btcLatchKey(market) {
  return `${market.event_ticker || market.series_ticker || "BTC"}:${decisionIso(market) || market.ticker || ""}`;
}

function btcSideLatchDecision(market, side, bitcoinTrend) {
  if (!isCryptoMarket(market) || !bitcoinAboveContract(market)) return { ok: true, reason: "" };
  const key = btcLatchKey(market);
  const preferred = btcTrendPreferredSide(bitcoinTrend);
  const latch = paperState.btcDirectionLatch || {};
  if (latch.eventKey && latch.eventKey !== key) {
    paperState.btcDirectionLatch = createPaperState().btcDirectionLatch;
  }
  const activeLatch = paperState.btcDirectionLatch || {};
  if (activeLatch.eventKey === key && activeLatch.side && activeLatch.side !== side) {
    return { ok: false, reason: `BTC side latch: current hour is locked to ${activeLatch.side}; blocking BUY ${side}.` };
  }
  if (preferred && preferred !== side) {
    return { ok: false, reason: `BTC trend latch: ${bitcoinTrend.direction} trend prefers BUY ${preferred}; blocking BUY ${side}.` };
  }
  return { ok: true, reason: "" };
}

function rememberBtcSideLatch(result, bitcoinTrend = null) {
  if (!result || !isCryptoResult(result) || !result.side) return;
  const eventKey = `${result.event_ticker || result.series_ticker || "BTC"}:${result.decision_time || result.expected_expiration_time || result.ticker || ""}`;
  paperState.btcDirectionLatch = {
    eventKey,
    side: result.side,
    direction: bitcoinTrend?.direction || result.bitcoinTrendDirection || "flat",
    since: new Date().toISOString(),
    lastUpdatedAt: Date.now()
  };
}

function bitcoinAboveContract(market) {
  const text = `${market.title || ""} ${market.subtitle || ""} ${market.yes_sub_title || ""}`.toLowerCase();
  const ticker = `${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase();
  return ticker.includes("KXBTCD") && (/\b(above|or above|greater than|higher than)\b/.test(text) || /-T\d/.test(ticker));
}

function isBtcTechnicalMicroCandidate(market) {
  if (isBitcoinHourlyBlackoutNow()) return false;
  if (!isCryptoMarket(market) || !bitcoinAboveContract(market)) return false;
  return isBitcoinHourlyContract(`${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase(), market);
}

function isBitcoinHourlyBlackoutNow(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false
  }).format(now));
  return hour >= BTC_HOURLY_BLACKOUT_START_ET && hour < BTC_HOURLY_BLACKOUT_END_ET;
}

function bitcoinContractType(market) {
  if (!isCryptoMarket(market)) return "";
  const text = `${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""}`.toUpperCase();
  if (isBitcoinHourlyContract(text, market)) return "BTC 1 hour";
  if (text.includes("KXBTCD")) return "BTC daily";
  if (text.includes("KXBTC")) return "BTC 1 hour";
  return "BTC";
}

function isBitcoinHourlyContract(text, market = {}) {
  const close = Date.parse(market.close_time || "");
  const decision = Date.parse(market.decision_time || market.expected_expiration_time || "");
  if (Number.isFinite(close) && Number.isFinite(decision)) {
    const minutesToDecision = (decision - Date.now()) / 60_000;
    return Math.abs(decision - close) <= 10 * 60 * 1000 && minutesToDecision > -10 && minutesToDecision <= 70;
  }
  const tickerText = `${text || ""} ${market.ticker || ""} ${market.event_ticker || ""}`.toUpperCase();
  if (/KXBTCD-\d{2}[A-Z]{3}\d{4}-T\d/i.test(tickerText)) return true;
  return false;
}

function computeScalpTouch(series, side, entry, target, stopPrice, chop) {
  const ranges = sideRangeSeries(series, side).filter((row) => validCents(row.high) && validCents(row.low));
  const recent = ranges.slice(-TRADE_NEAR_WINDOW_CANDLES);
  const sample = recent.length >= MIN_TOUCH_SAMPLE_CANDLES ? recent : ranges.slice(-TRADE_RECENT_WINDOW_CANDLES);
  const distance = Math.max(1, target - entry);
  const recentHigh = sample.length ? Math.max(...sample.map((row) => row.high)) : chop.high;
  const recentLow = sample.length ? Math.min(...sample.map((row) => row.low)) : chop.low;
  const recentRange = validCents(recentHigh) && validCents(recentLow) ? recentHigh - recentLow : chop.recentAmplitude;
  const touchCount = sample.filter((row) => row.high >= target).length;
  const hourlyTouchCount = ranges.slice(-TRADE_RECENT_WINDOW_CANDLES).filter((row) => row.high >= target).length;
  const stopCount = sample.filter((row) => row.low <= stopPrice).length;
  const recentTouchRate = sample.length ? touchCount / sample.length : 0;
  const hourlyTouchRate = ranges.length ? hourlyTouchCount / Math.min(ranges.length, TRADE_RECENT_WINDOW_CANDLES) : 0;
  const lastTouchIndex = ranges.map((row) => row.high >= target).lastIndexOf(true);
  const minutesSinceTargetTouch = lastTouchIndex >= 0 ? ranges.length - 1 - lastTouchIndex : null;
  const targetTouchedRecently = minutesSinceTargetTouch != null && minutesSinceTargetTouch <= 20;
  const amplitudeCoverage = clamp((recentRange || 0) / distance, 0, 2.5);
  const recentStabilityScore = clamp((recentRange || 0) / Math.max(distance, 1), 0, 1);
  const stabilityWarning = sample.length >= MIN_TOUCH_SAMPLE_CANDLES && recentTouchRate < 0.2 && recentStabilityScore < 0.7;
  const stopPressure = sample.length ? stopCount / sample.length : 0;
  const reversalBoost = clamp((chop.directionChanges + chop.meanCrossings) / 12, 0, 1);
  const recentTouchScore = clamp(recentTouchRate * 1.9, 0, 1);
  const hourlyTouchScore = clamp(hourlyTouchRate * 1.25, 0, 1);
  const amplitudeScore = clamp(amplitudeCoverage / 1.2, 0, 1);
  const recencyScore = targetTouchedRecently ? clamp(1 - (minutesSinceTargetTouch || 0) / 24, 0.25, 1) : 0;
  const rawTouchProbability = clamp(
    0.18 +
      0.28 * recentTouchScore +
      0.18 * hourlyTouchScore +
      0.24 * amplitudeScore +
      0.12 * reversalBoost +
      0.12 * recencyScore -
      0.18 * stopPressure,
    0.05,
    0.97
  );
  return {
    rawTouchProbability,
    recentTouchRate,
    hourlyTouchRate,
    targetTouchedRecently,
    minutesSinceTargetTouch,
    amplitudeCoverage,
    recentStabilityScore,
    recentRange,
    stabilityWarning,
    hasTouchEvidence: Boolean(sample.length >= 3 && (recentTouchRate >= 0.2 || amplitudeCoverage >= 0.9))
  };
}

function computeChop(prices) {
  const clean = prices.filter(validCents);
  if (clean.length < 2) {
    return { score: 0.25, first: null, last: null, high: null, low: null, range: 0, drift: 0, directionChanges: 0, meanCrossings: 0, recentAmplitude: 0 };
  }
  const first = clean[0];
  const last = clean[clean.length - 1];
  const high = Math.max(...clean);
  const low = Math.min(...clean);
  const range = high - low;
  const drift = Math.abs(last - first);
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  let directionChanges = 0;
  let meanCrossings = 0;
  let lastDir = 0;
  for (let i = 1; i < clean.length; i += 1) {
    const delta = clean[i] - clean[i - 1];
    const dir = Math.sign(delta);
    if (dir && lastDir && dir !== lastDir) directionChanges += 1;
    if (dir) lastDir = dir;
    if ((clean[i - 1] - mean) * (clean[i] - mean) < 0) meanCrossings += 1;
  }
  const recent = clean.slice(-15);
  const recentAmplitude = recent.length ? Math.max(...recent) - Math.min(...recent) : 0;
  let recentDirectionChanges = 0;
  let recentLastDir = 0;
  for (let i = 1; i < recent.length; i += 1) {
    const dir = Math.sign(recent[i] - recent[i - 1]);
    if (dir && recentLastDir && dir !== recentLastDir) recentDirectionChanges += 1;
    if (dir) recentLastDir = dir;
  }
  const chopRatio = range / Math.max(drift, 1);
  const rangeScore = clamp(range / 8, 0, 1);
  const reversalScore = clamp((directionChanges + meanCrossings) / 8, 0, 1);
  const driftPenalty = clamp(drift / Math.max(range, 1), 0, 1);
  const stalePenalty = range < 1 ? 0.45 : 1;
  const score = clamp((0.42 * rangeScore + 0.43 * reversalScore + 0.15 * clamp(chopRatio / 4, 0, 1)) * (1 - driftPenalty * 0.45) * stalePenalty, 0.05, 1);
  return { score, first, last, high, low, range, drift, directionChanges, meanCrossings, recentAmplitude, recentDirectionChanges, recentSampleCount: recent.length };
}

function extractSeries(candles) {
  if (!Array.isArray(candles)) return [];
  return candles.map((c) => ({
    ts: c.end_period_ts ?? c.period_ts ?? c.start_period_ts ?? null,
    yes_bid: candlePoint(c.yes_bid),
    yes_ask: candlePoint(c.yes_ask),
    no_bid: candlePoint(c.no_bid),
    no_ask: candlePoint(c.no_ask),
    price: candlePoint(c.price ?? {
      close: c.close ?? c.close_dollars,
      high: c.high ?? c.high_dollars,
      low: c.low ?? c.low_dollars,
      open: c.open ?? c.open_dollars
    })
  }));
}

function sidePriceSeries(series, side, market) {
  if (!series?.length) {
    const fallback = side === "YES"
      ? market.yes_bid || market.yes_ask || market.last_price
      : market.no_bid || market.no_ask || (market.last_price != null ? 100 - market.last_price : null);
    return validCents(fallback) ? [fallback] : [];
  }
  return series.map((c) => {
    if (side === "YES") return c.yes_bid?.close ?? c.yes_ask?.close ?? c.price?.close;
    return c.no_bid?.close ?? c.no_ask?.close ?? (c.price?.close != null ? 100 - c.price.close : null);
  }).filter(validCents);
}

function sideRangeSeries(series, side) {
  if (!series?.length) return [];
  return series.map((c) => {
    if (side === "YES") {
      const sellable = c.yes_bid ?? c.price ?? c.yes_ask;
      return { high: sellable?.high ?? sellable?.close, low: sellable?.low ?? sellable?.close };
    }
    const sellable = c.no_bid ?? c.no_ask;
    if (sellable) return { high: sellable.high ?? sellable.close, low: sellable.low ?? sellable.close };
    if (c.price) return { high: 100 - (c.price.low ?? c.price.close), low: 100 - (c.price.high ?? c.price.close) };
    return { high: null, low: null };
  });
}

function candlePoint(obj) {
  if (obj == null) return null;
  if (typeof obj !== "object") {
    const close = centsFromAny(obj);
    return { open: close, high: close, low: close, close };
  }
  const open = centsFromAny(obj.open_dollars ?? obj.open ?? obj.open_cents);
  const close = centsFromAny(obj.close_dollars ?? obj.close ?? obj.close_cents ?? obj.high_dollars ?? obj.open_dollars);
  const high = centsFromAny(obj.high_dollars ?? obj.high ?? obj.high_cents ?? close ?? open);
  const low = centsFromAny(obj.low_dollars ?? obj.low ?? obj.low_cents ?? close ?? open);
  return { open, high, low, close };
}

function candleClose(obj) {
  if (obj == null) return null;
  if (typeof obj !== "object") return centsFromAny(obj);
  return centsFromAny(obj.close_dollars ?? obj.close ?? obj.close_cents ?? obj.high_dollars ?? obj.open_dollars);
}

function computeDataConfidence(prices, market, notes) {
  let confidence = prices.length >= 10 ? 1 : prices.length >= 2 ? 0.72 : 0.45;
  if (notes.some((n) => n.includes("candles unavailable"))) confidence *= 0.72;
  if (!market.orderbook?.nearbyDepth) confidence *= 0.82;
  return clamp(confidence, 0.25, 1);
}

function computeLiquidityAdjustment(market) {
  const volume = Math.max(0, market.volume || 0);
  const oi = Math.max(0, market.open_interest || 0);
  const depth = Math.max(0, market.orderbook?.nearbyDepth || 0);
  const raw = 0.45 + Math.min(0.25, Math.log10(volume + 1) / 12) + Math.min(0.15, Math.log10(oi + 1) / 14) + Math.min(0.15, Math.log10(depth + 1) / 10);
  return clamp(raw, 0.45, 1);
}

function computeSpreadAdjustment(spread) {
  if (spread == null) return 0.72;
  return clamp(1 - spread / 60, 0.72, 1);
}

function computeTimeAdjustment(market) {
  const decisionTs = decisionTimestamp(market);
  if (!Number.isFinite(decisionTs)) return 0.85;
  const hours = (decisionTs - Date.now()) / 3_600_000;
  if (hours <= 0) return 0.35;
  if (hours < MIN_TIME_LEFT_MINUTES / 60) return 0.05;
  if (hours < 20 / 60) return 0.65;
  if (hours < 1) return 1;
  if (hours < 6) return 0.96;
  if (hours < 72) return 1;
  return 0.88;
}

function decisionTimestamp(market) {
  const crypto = isCryptoMarket(market);
  if (crypto && isBitcoinHourlyContract(`${market.ticker || ""} ${market.event_ticker || ""} ${market.series_ticker || ""} ${market.title || ""} ${market.marketTitle || ""}`, market)) {
    const hourlyTs = bitcoinHourlyDecisionTimestamp(market);
    if (Number.isFinite(hourlyTs)) return hourlyTs;
  }
  const ordered = crypto
    ? [market.close_time, market.occurrence_datetime, market.expected_expiration_time, market.expiration_time]
    : [market.occurrence_datetime, market.expected_expiration_time, market.close_time, market.expiration_time];
  for (const value of ordered) {
    const ts = Date.parse(value || "");
    if (Number.isFinite(ts)) return ts;
  }
  return NaN;
}

function bitcoinHourlyDecisionTimestamp(market) {
  const ordered = [market.occurrence_datetime, market.expected_expiration_time, market.close_time, market.expiration_time];
  for (const value of ordered) {
    const ts = Date.parse(value || "");
    if (!Number.isFinite(ts)) continue;
    const date = new Date(ts);
    const minute = date.getUTCMinutes();
    const second = date.getUTCSeconds();
    if (minute > 0 && minute <= 5) {
      date.setUTCMinutes(0, 0, 0);
      return date.getTime();
    }
    if (minute === 0 && second === 0) return ts;
    return ts;
  }
  return NaN;
}

function decisionIso(market) {
  const ts = decisionTimestamp(market);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function minutesToDecision(market) {
  const ts = decisionTimestamp(market);
  return Number.isFinite(ts) ? (ts - Date.now()) / 60000 : null;
}

function isCryptoMarket(market) {
  const text = `${market.category || ""} ${market.series_ticker || ""} ${market.event_ticker || ""} ${market.ticker || ""} ${market.title || ""}`.toLowerCase();
  return /\b(crypto|bitcoin|btc|kxbtc)\b/.test(text);
}

function feePerContract(priceCents, rate, contracts) {
  const price = priceCents / 100;
  const raw = rate * contracts * price * (1 - price);
  return Math.ceil(raw * 100) / 100 / contracts;
}

function parseLevels(levels) {
  return levels.map((level) => {
    if (Array.isArray(level)) return { price: centsFromAny(level[0]), quantity: numberFromAny(level[1]), orders: numberFromAny(level[2]) };
    return { price: centsFromAny(level.price ?? level.price_dollars), quantity: numberFromAny(level.quantity ?? level.count ?? level.count_fp), orders: numberFromAny(level.orders) };
  }).filter((level) => validCents(level.price));
}

function bestBid(levels) {
  if (!levels.length) return null;
  return Math.max(...levels.map((l) => l.price));
}

function depthNear(levels, best) {
  if (best == null) return 0;
  return levels.filter((l) => Math.abs(l.price - best) <= 2).reduce((sum, l) => sum + (l.quantity || 0), 0);
}

function sumDepth(levels) {
  return levels.reduce((sum, level) => sum + (level.quantity || 0), 0);
}

function centsFromAny(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num > 0 && num <= 1) return num * 100;
  return num;
}

function numberFromAny(value) {
  if (value == null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function validCents(value) {
  return Number.isFinite(value) && value > 0 && value < 100;
}

function makeReasonSummary(chop, adjustedTouch, ev, notes, touch = {}, tennisPause = null, bitcoinTrend = null, sportsLatePhase = null) {
  const parts = [
    `sideways score ${formatPct(chop.score * 100)}`,
    `recent target touches ${formatPct((touch.recentTouchRate || 0) * 100)}`,
    `range covers target ${formatPct((touch.amplitudeCoverage || 0) * 100)}`,
    touch.stabilityWarning ? "recent price action has stabilized" : `recent stability ${formatPct((touch.recentStabilityScore || 0) * 100)}`,
    `${chop.directionChanges} direction changes`,
    `adjusted touch ${formatPct(adjustedTouch * 100)}`,
    `EV ${ev >= 0 ? "+" : ""}$${ev.toFixed(4)}`
  ];
  if (tennisPause?.warning) parts.push(tennisPause.reason || "tennis safety pause warning");
  if (sportsLatePhase?.warning) parts.push(sportsLatePhase.reason || "sports late-game safety warning");
  if (bitcoinTrend?.warning) parts.push(bitcoinTrend.reason || "bitcoin trend safety warning");
  if (notes.length) parts.push(notes.join("; "));
  return parts.join(" | ");
}

function logAudit(level, message) {
  if (level === "debug") return;
  const row = { time: new Date().toISOString(), level, message };
  latestSnapshot.audit.push(row);
  if (latestSnapshot.audit.length > 2000) latestSnapshot.audit.shift();
  publish("audit", row);
}

function logApiFailure(endpoint, error, retryCount, outcome) {
  const status = error.status ? `status ${error.status}` : "no status";
  const message = `${endpoint} failed (${status}): ${error.message}; retry ${retryCount}; ${outcome}.`;
  logAudit(outcome === "retrying" ? "warn" : "error", message);
}

function publishProgress(now) {
  latestSnapshot.now = { ...latestSnapshot.now, ...now };
  publish("progress", latestSnapshot.now);
}

async function persistLatestResults() {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  await fs.writeFile(path.join(RESULTS_DIR, "latest-results.json"), JSON.stringify(latestSnapshot.results, null, 2));
  await fs.writeFile(path.join(RESULTS_DIR, "latest-live-trades.json"), JSON.stringify(paperState, null, 2));
  await fs.writeFile(path.join(RESULTS_DIR, "latest-audit.txt"), latestSnapshot.audit.map((row) => `[${row.time}] ${row.level.toUpperCase()} ${row.message}`).join("\n"));
}

function resultsToCsv(results) {
  const columns = ["recommendation", "ticker", "marketTitle", "currentBuyPriceCents", "sellTargetCents", "minTargetFor10PctCents", "netProfitPct", "rawTouchProbability", "adjustedTouchProbability", "stopPriceCents", "profitIfHit", "lossIfMissed", "evPerContract", "evRoiPct", "chopScore", "rangeCents", "driftCents", "directionChanges", "spreadCents", "volume", "open_interest", "liquidity", "dataConfidence", "url", "reasonSummary"];
  const rows = [columns.join(",")];
  for (const result of results) {
    rows.push(columns.map((column) => csvCell(result[column])).join(","));
  }
  return rows.join("\n");
}

function csvCell(value) {
  const str = value == null ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? clamp(num, min, max) : fallback;
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function round4(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

function formatPct(value) {
  return `${Number(value).toFixed(2)}%`;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2);
}

app.listen(PORT, async () => {
  console.log(`Kalshi Scanner running at http://localhost:${PORT}`);
  if (process.env.OPEN_BROWSER === "1") openBrowser(`http://localhost:${PORT}`);
});

function openBrowser(url) {
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    ];
    for (const chromePath of candidates) {
      if (existsSync(chromePath)) {
        spawn(chromePath, [url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
        return;
      }
    }
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function createApp() {
  try {
    const mod = await import("express");
    return { app: mod.default(), expressCompat: mod.default };
  } catch {
    console.warn("Express is not installed; using the built-in fallback server. Run npm install to use Express.");
    return createFallbackApp();
  }
}

function createFallbackApp() {
  const routes = [];
  const middlewares = [];
  const app = {
    use(fn) {
      middlewares.push(fn);
    },
    get(pathname, handler) {
      routes.push({ method: "GET", pathname, handler });
    },
    post(pathname, handler) {
      routes.push({ method: "POST", pathname, handler });
    },
    listen(port, callback) {
      const server = http.createServer(async (req, res) => {
        enhanceResponse(res);
        req.path = new URL(req.url, `http://${req.headers.host}`).pathname;
        req.params = {};
        for (const middleware of middlewares) {
          const handled = await runMiddleware(middleware, req, res);
          if (handled) return;
        }
        const route = matchRoute(routes, req.method, req.path, req);
        if (!route) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        route.handler(req, res);
      });
      return server.listen(port, callback);
    }
  };
  return {
    app,
    expressCompat: {
      json: () => jsonMiddleware,
      static: (root) => staticMiddleware(root)
    }
  };
}

function enhanceResponse(res) {
  res.setHeader = res.setHeader.bind(res);
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  res.send = (body) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "text/plain");
    res.end(body);
  };
  res.flushHeaders = res.flushHeaders?.bind(res);
}

async function runMiddleware(middleware, req, res) {
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return !nextCalled || res.writableEnded;
}

async function jsonMiddleware(req, _res, next) {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    next();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    req.body = text ? JSON.parse(text) : {};
  } catch {
    req.body = {};
  }
  next();
}

function staticMiddleware(root) {
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    const safePath = requestPath === "/" ? "/index.html" : requestPath;
    const filePath = path.resolve(root, `.${safePath}`);
    if (!filePath.startsWith(path.resolve(root))) {
      next();
      return;
    }
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        next();
        return;
      }
      res.setHeader("Content-Type", contentType(filePath));
      res.end(await fs.readFile(filePath));
    } catch {
      next();
    }
  };
}

function matchRoute(routes, method, pathname, req) {
  for (const route of routes) {
    if (route.method !== method) continue;
    if (route.pathname === pathname) return route;
    const routeParts = route.pathname.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);
    if (routeParts.length !== pathParts.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < routeParts.length; i += 1) {
      if (routeParts[i].startsWith(":")) {
        params[routeParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (routeParts[i] !== pathParts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      req.params = params;
      return route;
    }
  }
  return null;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}
