import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync, createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3010);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const APP_ROOT = path.resolve(__dirname, "..");
const POLYMARKET_HISTORY_SCRIPT = path.join(APP_ROOT, "research", "polymarket_weather_snapshots_90d.mjs");
const POLYMARKET_HISTORY_SUMMARY = path.join(APP_ROOT, "results", "weather-polymarket-history", "latest-summary.json");
const KALSHI_HISTORY_ROOT = path.join(APP_ROOT, "results", "weather-kalshi-history");
const KALSHI_READING_UPDATE_SCRIPT = "/Users/dan/Documents/AGENT NATION/weather_kalshi_update_readings.mjs";
const KALSHI_READING_DATASETS = [
  ["New York", "10 Reading", "nyc-10-reading/nyc-kalshi-weather-10-reading-history.csv"],
  ["Miami", "10 Reading", "miami-10-reading/miami-kalshi-weather-10-reading-history.csv"],
  ["Chicago", "10 Reading", "chicago-10-reading/chicago-kalshi-weather-10-reading-history.csv"],
  ["Los Angeles", "10 Reading", "los-angeles-10-reading/los-angeles-kalshi-weather-10-reading-history.csv"],
  ["San Francisco", "10 Reading", "san-francisco-10-reading/san-francisco-kalshi-weather-10-reading-history.csv"]
];
const NWS_HEADERS = {
  accept: "application/geo+json, application/json",
  "user-agent": "Agent Nation NWS weather scoreboard; local research app"
};

const STATIONS = [
  station("Atlanta", "KXHIGHATL", "KATL", "Hartsfield-Jackson Atlanta International Airport", "FFC", "ATL"),
  station("Austin", "KXHIGHAUS", "KAUS", "Austin-Bergstrom International Airport", "EWX", "AUS", "in-progress"),
  station("Boston", "KXHIGHBOS", "KBOS", "Boston Logan International Airport", "BOX", "BOS"),
  station("Chicago", "KXHIGHCHI", "KMDW", "Chicago Midway Airport", "LOT", "MDW", "pending", "Chicago is Midway for this map, not O'Hare. Verify exact climate-report sensor before betting."),
  station("Dallas", "KXHIGHDAL", "KDFW", "Dallas/Fort Worth International Airport", "FWD", "DFW"),
  station("Denver", "KXHIGHDEN", "KDEN", "Denver International Airport", "BOU", "DEN"),
  station("Houston", "KXHIGHHOU", "KHOU", "Houston Hobby Airport", "HGX", "HOU", "pending", "Verify Houston series aliases and whether all settle to Hobby CLI."),
  station("Las Vegas", "KXHIGHLV", "KLAS", "Harry Reid / Las Vegas Airport", "VEF", "LAS"),
  station("Los Angeles", "KXHIGHLAX", "KLAX", "Los Angeles International Airport", "LOX", "LAX", "pending", "Do not assume generic Los Angeles. This map follows the LAX CLI until contract text says otherwise."),
  station("Miami", "KXHIGHMIA", "KMIA", "Miami International Airport", "MFL", "MIA"),
  station("Minneapolis", "KXHIGHMSP", "KMSP", "Minneapolis-St. Paul International Airport", "MPX", "MSP"),
  station("New Orleans", "KXHIGHMSY", "KMSY", "New Orleans International Airport", "LIX", "MSY"),
  station("New York", "KXHIGHNY", "KNYC", "Central Park Observatory", "OKX", "NYC", "strong-candidate", "Kalshi rules have historically pointed to Central Park; final coordinate/source record still needs confirmation."),
  station("Oklahoma City", "KXHIGHOKC", "KOKC", "Will Rogers World Airport", "OUN", "OKC"),
  station("Philadelphia", "KXHIGHPHIL", "KPHL", "Philadelphia International Airport", "PHI", "PHL"),
  station("Phoenix", "KXHIGHPHX", "KPHX", "Phoenix Sky Harbor International Airport", "PSR", "PHX"),
  station("San Antonio", "KXHIGHSAT", "KSAT", "San Antonio International Airport", "EWX", "SAT"),
  station("San Francisco", "KXHIGHTSFO", "KSFO", "San Francisco International Airport", "MTR", "SFO"),
  station("Seattle", "KXHIGHSEA", "KSEA", "Seattle-Tacoma International Airport", "SEW", "SEA"),
  station("Washington DC", "KXHIGHDC", "KDCA", "Reagan National Airport", "LWX", "DCA")
].sort((a, b) => a.city.localeCompare(b.city));

function station(city, series, stationId, stationName, nwsSite, cliIssuedBy, auditStatus = "pending", auditNote = "Candidate station from Kalshi/NWS CLI map. Needs city-level settlement-source confirmation before betting.") {
  return {
    city,
    series,
    stationId,
    stationName,
    auditStatus,
    auditNote,
    contractSourceType: "NWS CLI climate summary",
    contractSourceUrl: `https://forecast.weather.gov/product.php?site=${nwsSite}&product=CLI&issuedby=${cliIssuedBy}`,
    liveFeedRole: "observation mirror, not settlement proof"
  };
}

let currentCache = { rows: [], fetchedAt: 0, nextRefreshAt: 0, lastError: "" };
let forecastHighCache = new Map();
let historyRun = null;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/current") return sendJson(res, await currentReadings(url.searchParams.get("force") === "1"));
    if (url.pathname === "/api/history/latest") return sendJson(res, await latestWeatherDataSummary());
    if (url.pathname === "/api/history/run") return sendJson(res, await runWeatherDataUpdate());
    if (url.pathname === "/api/history/create") return sendJson(res, await runWeatherDataUpdate());
    if (url.pathname === "/api/history/backup") return sendJson(res, await backupWeatherDatasets());
    if (url.pathname === "/api/history/status") return sendJson(res, historyRun || { running: false });
    if (url.pathname === "/api/ev/latest") return sendJson(res, await latestWeatherEv());
    if (url.pathname === "/api/orders/preview") return sendJson(res, await weatherOrderPreview(url.searchParams));
    return serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, { ok: false, error: error.message || "server error" }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`NWS Weather Feed app running at http://localhost:${PORT}`);
});

async function currentReadings(force = false) {
  const now = Date.now();
  if (!force && currentCache.rows.length && now < currentCache.nextRefreshAt) {
    return { ok: true, ...currentCache };
  }
  const rows = await mapLimit(STATIONS, 5, readLatestObservation);
  currentCache = {
    rows: rows.sort((a, b) => a.city.localeCompare(b.city)),
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: now + 60_000,
    lastError: rows.some((row) => row.status === "ok") ? "" : "No NWS station reads succeeded."
  };
  return { ok: true, ...currentCache };
}

async function readLatestObservation(station) {
  const sourceUrl = `https://api.weather.gov/stations/${encodeURIComponent(station.stationId)}/observations/latest`;
  try {
    const [data, forecastHigh] = await Promise.all([
      fetchJson(sourceUrl),
      officialForecastHigh(station).catch((error) => ({ error: error.message || "forecast high unavailable" }))
    ]);
    return observationRow(station, data?.properties || {}, data?.geometry, sourceUrl, forecastHigh);
  } catch (error) {
    return errorRow(station, sourceUrl, error);
  }
}

async function runPolymarketHistory(days) {
  const boundedDays = clamp(Math.round(days || 90), 1, 120);
  if (historyRun?.running) return historyRun;

  historyRun = {
    running: true,
    startedAt: new Date().toISOString(),
    days: boundedDays,
    completedStations: 0,
    totalStations: 5,
    status: "updating Polymarket 5-market CSV"
  };

  const child = spawn(process.execPath, [POLYMARKET_HISTORY_SCRIPT], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      DAYS: String(boundedDays),
      MAX_EVENTS: "1000",
      MAX_PAGES: "220"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
    const match = String(chunk).match(/\[(\d+)\/(\d+)\]/);
    if (match) {
      historyRun.completedStations = Number(match[1]);
      historyRun.totalStations = Number(match[2]);
      historyRun.status = "updating Polymarket 5-market CSV";
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.on("close", async (code) => {
    if (code === 0) {
      const latest = await latestPolymarketSummary().catch(() => ({}));
      historyRun = {
        ...(historyRun || {}),
        running: false,
        finishedAt: new Date().toISOString(),
        status: "complete",
        events: latest.events || 0,
        rows: latest.rows || 0,
        selectedRows: latest.selectedRows || 0,
        csvPath: latest.csvPath || "",
        jsonPath: latest.jsonPath || ""
      };
      return;
    }
    historyRun = {
      ...(historyRun || {}),
      running: false,
      finishedAt: new Date().toISOString(),
      status: "failed",
      error: (stderr || stdout || `Polymarket updater exited ${code}`).slice(-1200)
    };
  });

  return historyRun;
}

async function runWeatherDataUpdate() {
  if (historyRun?.running) return historyRun;
  historyRun = {
    running: true,
    startedAt: new Date().toISOString(),
    completedStations: 0,
    totalStations: 5,
    status: "updating weather readings"
  };

  const child = spawn(process.execPath, [KALSHI_READING_UPDATE_SCRIPT], {
    cwd: path.dirname(KALSHI_READING_UPDATE_SCRIPT),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk);
    stderr += text;
    const doneMatches = stderr.match(/Done /g) || [];
    if (historyRun?.running) {
      historyRun.completedStations = Math.min(doneMatches.length, historyRun.totalStations || 5);
      const updating = text.match(/Updating ([^\n]+)/);
      if (updating) historyRun.status = updating[0];
    }
  });
  child.on("close", async (code) => {
    if (code === 0) {
      const latest = await latestWeatherDataSummary().catch(() => ({}));
      historyRun = {
        ...(historyRun || {}),
        running: false,
        finishedAt: new Date().toISOString(),
        status: "complete",
        lastDateRecorded: latest.lastDateRecorded || "",
        datasets: latest.datasets || 0,
        snapshots: latest.snapshots || 0,
        updaterOutput: stdout.slice(-1200)
      };
      return;
    }
    historyRun = {
      ...(historyRun || {}),
      running: false,
      finishedAt: new Date().toISOString(),
      status: "failed",
      error: (stderr || stdout || `Weather data updater exited ${code}`).slice(-1200)
    };
  });

  return historyRun;
}


async function backupWeatherDatasets() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(KALSHI_HISTORY_ROOT, `manual-backup-${stamp}`);
  await fs.mkdir(backupDir, { recursive: true });
  const copied = [];
  for (const [city, reading, relPath] of KALSHI_READING_DATASETS) {
    const srcCsv = path.join(KALSHI_HISTORY_ROOT, relPath);
    const srcDir = path.dirname(srcCsv);
    const destDir = path.join(backupDir, path.basename(srcDir));
    await fs.mkdir(destDir, { recursive: true });
    for (const file of await fs.readdir(srcDir)) {
      if (!file.endsWith(".csv") && !file.endsWith(".json")) continue;
      await fs.copyFile(path.join(srcDir, file), path.join(destDir, file));
      copied.push({ city, reading, file: path.join(destDir, file) });
    }
  }
  return { ok: true, backupDir, copied: copied.length };
}

async function runWeatherDataCheck() {
  const latest = await latestWeatherDataSummary();
  historyRun = {
    running: false,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "data checked",
    lastDateRecorded: latest.lastDateRecorded || "",
    datasets: latest.datasets || 0,
    snapshots: latest.snapshots || 0
  };
  return historyRun;
}

async function latestWeatherDataSummary() {
  const datasetRows = [];
  const errors = [];
  let latestDate = "";
  let snapshots = 0;
  for (const [city, reading, relPath] of KALSHI_READING_DATASETS) {
    const csvPath = path.join(KALSHI_HISTORY_ROOT, relPath);
    try {
      const rows = parseCsvRows(await fs.readFile(csvPath, "utf8"));
      const dates = new Set(rows.map((row) => row.date).filter(Boolean));
      const maxDate = [...dates].sort().at(-1) || "";
      if (maxDate > latestDate) latestDate = maxDate;
      snapshots += rows.length;
      datasetRows.push({
        city,
        reading,
        csvPath,
        completeDays: dates.size,
        snapshots: rows.length,
        lastDateRecorded: maxDate
      });
    } catch (error) {
      errors.push({ city, reading, csvPath, error: error.message });
    }
  }
  return {
    ok: true,
    available: datasetRows.length > 0,
    datasets: datasetRows.length,
    expectedDatasets: KALSHI_READING_DATASETS.length,
    completeReadings: datasetRows.reduce((sum, row) => sum + row.completeDays, 0),
    snapshots,
    lastDateRecorded: latestDate,
    rows: datasetRows,
    errors: errors.length,
    errorRows: errors
  };
}

function parseCsvRows(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

async function loadReadingRows() {
  const out = [];
  const errors = [];
  for (const [city, reading, relPath] of KALSHI_READING_DATASETS) {
    const csvPath = path.join(KALSHI_HISTORY_ROOT, relPath);
    try {
      const rows = parseCsvRows(await fs.readFile(csvPath, "utf8"));
      out.push(...rows.map((row) => ({ ...row, city: row.city || city, reading: row.reading || reading, csvPath })));
    } catch (error) {
      errors.push({ city, reading, csvPath, error: error.message });
    }
  }
  return { rows: out, errors };
}

async function latestWeatherEv() {
  const { rows, errors } = await loadReadingRows();
  const activeReadings = [...new Set(rows.map((row) => row.reading).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const time = activeReadings.map((reading) => ({
    label: reading,
    buckets: summarizeEvRows(rows.filter((row) => row.reading === reading), reading)
  }));
  const location = [...new Set(rows.map((row) => row.city).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((city) => ({
      city,
      readings: activeReadings.map((reading) => ({
        label: reading,
        buckets: summarizeEvRows(rows.filter((row) => row.city === city && row.reading === reading), `${city} ${reading}`)
      }))
    }));
  const general = averageLocationBuckets(location);
  const overlap = locationOverlaps(location);
  const todayContracts = todayTargetContracts(rows, { general, time, location });
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    snapshots: rows.length,
    errors: errors.length,
    errorRows: errors,
    general,
    time,
    location,
    overlap,
    todayContracts
  };
}


function averageLocationBuckets(location = []) {
  const groups = new Map();
  for (const city of location) {
    for (const reading of city.readings || []) {
      for (const bucket of reading.buckets || []) {
        const current = groups.get(bucket.bucket) || {
          label: "General",
          bucket: bucket.bucket,
          contracts: 0,
          yesWins: 0,
          yesRateSum: 0,
          yesEvSum: 0,
          locations: 0
        };
        current.contracts += Number(bucket.contracts) || 0;
        current.yesWins += Number(bucket.yesWins) || 0;
        current.yesRateSum += Number(bucket.yesRatePct) || 0;
        current.yesEvSum += Number(bucket.yesEvPct) || 0;
        current.locations += 1;
        groups.set(bucket.bucket, current);
      }
    }
  }
  return [...groups.values()]
    .sort((a, b) => {
      if (a.bucket === "51c+") return 1;
      if (b.bucket === "51c+") return -1;
      return a.bucket.localeCompare(b.bucket);
    })
    .map((row) => ({
      label: row.label,
      bucket: row.bucket,
      contracts: row.contracts,
      yesWins: row.yesWins,
      locations: row.locations,
      yesRatePct: round(row.yesRateSum / row.locations, 2),
      yesEvPct: round(row.yesEvSum / row.locations, 2)
    }));
}

function locationOverlaps(location = []) {
  const groups = new Map();
  for (const city of location) {
    for (const reading of city.readings || []) {
      for (const bucket of reading.buckets || []) {
        const key = `${reading.label}|${bucket.bucket}`;
        const current = groups.get(key) || { reading: reading.label, bucket: bucket.bucket, rows: [] };
        current.rows.push({ city: city.city, yesEvPct: bucket.yesEvPct, contracts: bucket.contracts, yesRatePct: bucket.yesRatePct });
        groups.set(key, current);
      }
    }
  }
  return [...groups.values()]
    .map((group) => {
      const positive = group.rows.filter((row) => Number(row.yesEvPct) >= 5);
      const negative = group.rows.filter((row) => Number(row.yesEvPct) <= -5);
      const alignedRows = positive.length >= 2 ? positive : negative.length >= 2 ? negative : [];
      const stance = positive.length >= 2 ? "positive" : negative.length >= 2 ? "negative" : "none";
      return {
        ...group,
        rows: alignedRows,
        stance,
        line: `${alignedRows.map((row) => row.city).join(" + ")} ${group.reading} ${group.bucket}`
      };
    })
    .filter((group) => group.rows.length >= 2 && group.stance !== "none")
    .sort((a, b) => a.reading.localeCompare(b.reading) || a.bucket.localeCompare(b.bucket));
}

async function weatherOrderPreview(searchParams) {
  const venue = searchParams.get("venue") || "";
  const scope = searchParams.get("scope") || "general";
  const ev = await latestWeatherEv();
  const rows = flattenEvScope(ev, scope);
  const candidates = rows.filter((row) => {
    if (venue === "kalshi-short") return Number(row.yesEvPct) <= -5;
    return Number(row.yesEvPct) >= 5;
  });
  return {
    ok: true,
    armed: false,
    venue,
    scope,
    candidates,
    message: "Order controls are staged only. No external order was placed."
  };
}

function flattenEvScope(ev, scope) {
  if (scope === "time") {
    return ev.time.flatMap((group) => group.buckets.map((bucket) => ({ ...bucket, group: group.label })));
  }
  if (scope === "location") {
    return ev.location.flatMap((city) => city.readings.flatMap((reading) => (
      reading.buckets.map((bucket) => ({ ...bucket, city: city.city, group: reading.label }))
    )));
  }
  return ev.general.map((bucket) => ({ ...bucket, group: "General" }));
}

function summarizeEvRows(rows, label) {
  const bins = new Map();
  for (const row of rows) {
    const cents = Math.round(Number(row.yes_bid) * 100);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const bucket = cents >= 51 ? "51c+" : row.bid_bin_10c || bidBucketFromCents(cents);
    const current = bins.get(bucket) || { label, bucket, contracts: 0, yesWins: 0, bidSum: 0 };
    current.contracts += 1;
    current.bidSum += Number(row.yes_bid);
    if (row.result === "yes") current.yesWins += 1;
    bins.set(bucket, current);
  }
  return [...bins.values()]
    .filter((row) => row.contracts >= 20)
    .sort((a, b) => {
      if (a.bucket === "51c+") return 1;
      if (b.bucket === "51c+") return -1;
      return a.bucket.localeCompare(b.bucket);
    })
    .map((row) => {
      const yesRate = row.yesWins / row.contracts;
      const expected = row.bucket === "51c+"
        ? row.bidSum / row.contracts
        : (Number(row.bucket.slice(0, 2)) + Number(row.bucket.slice(3, 5))) / 2 / 100;
      return {
        label: row.label,
        bucket: row.bucket,
        contracts: row.contracts,
        yesWins: row.yesWins,
        yesRatePct: round(yesRate * 100, 2),
        yesEvPct: round((yesRate - expected) * 100, 2)
      };
    });
}

function todayTargetContracts(rows = [], ev = {}) {
  const latestByCity = new Map();
  for (const row of rows) {
    if (!row.city || !row.date) continue;
    const current = latestByCity.get(row.city);
    if (!current || row.date > current) latestByCity.set(row.city, row.date);
  }

  const qualifierMap = new Map();
  const addQualifier = (scope, city, reading, bucket) => {
    const evPct = Number(bucket?.yesEvPct);
    if (!bucket?.bucket || !Number.isFinite(evPct) || Math.abs(evPct) < 5) return;
    const key = `${city || "*"}|${reading || "*"}|${bucket.bucket}`;
    const item = {
      scope,
      city,
      reading,
      bucket: bucket.bucket,
      stance: evPct >= 5 ? "positive" : "negative",
      yesEvPct: bucket.yesEvPct,
      maxSpreadCents: round(Math.max(0, Math.abs(evPct) - 5), 2)
    };
    if (!qualifierMap.has(key)) qualifierMap.set(key, []);
    qualifierMap.get(key).push(item);
  };

  for (const city of ev.location || []) {
    for (const reading of city.readings || []) {
      for (const bucket of reading.buckets || []) addQualifier("Location", city.city, reading.label, bucket);
    }
  }

  const chooseQualifier = (row, bucket) => {
    const candidates = qualifierMap.get(`${row.city}|${row.reading}|${bucket}`) || [];
    return candidates.sort((a, b) => Math.abs(Number(b.yesEvPct)) - Math.abs(Number(a.yesEvPct)))[0] || null;
  };

  const contracts = rows
    .filter((row) => row.date === latestByCity.get(row.city))
    .map((row) => {
      const cents = Math.round(Number(row.yes_bid) * 100);
      if (!Number.isFinite(cents) || cents <= 0) return null;
      const bucket = cents >= 51 ? "51c+" : row.bid_bin_10c || bidBucketFromCents(cents);
      const match = chooseQualifier(row, bucket);
      const sortCostCents = cents;
      return {
        ...(match || {}),
        scope: match?.scope || "Location",
        city: row.city,
        reading: row.reading,
        date: row.date,
        contract: row.contract || row.ticker || "",
        bucket,
        stance: match?.stance || "neutral",
        yesEvPct: match?.yesEvPct ?? "",
        maxSpreadCents: match?.maxSpreadCents ?? "",
        bidCents: cents,
        sortCostCents,
        result: row.result || "pending",
        finalTemp: row.expiration_value || "",
        snapshotTs: Number(row.snapshot_ts) || 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.sortCostCents) - Number(a.sortCostCents) || a.city.localeCompare(b.city) || String(a.contract).localeCompare(String(b.contract)));
  const dates = [...new Set([...latestByCity.entries()].map(([city, date]) => `${city}:${date}`))].sort();
  return { date: dates.map((item) => item.split(":")[1]).sort().at(-1) || "", dates, contracts };
}

function scopeRank(scope) {
  if (scope === "Location") return 3;
  if (scope === "Time") return 2;
  return 1;
}

function contractExample(row, cents) {
  return {
    date: row.date || "",
    city: row.city || "",
    contract: row.contract || row.ticker || "",
    bidCents: cents,
    result: row.result || "pending",
    finalTemp: row.expiration_value || "",
    snapshotTs: Number(row.snapshot_ts) || 0
  };
}

function compactExamples(examples = []) {
  return examples
    .filter((item) => item && item.contract)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.snapshotTs) - Number(a.snapshotTs))
    .slice(0, 3);
}

function bidBucketFromCents(cents) {
  const start = Math.floor((cents - 1) / 10) * 10 + 1;
  const end = start + 9;
  return `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

async function latestPolymarketSummary() {
  if (!existsSync(POLYMARKET_HISTORY_SUMMARY)) return { ok: true, available: false, message: "No Polymarket CSV update built yet." };
  const data = JSON.parse(await fs.readFile(POLYMARKET_HISTORY_SUMMARY, "utf8"));
  return { ok: true, available: true, ...data };
}

async function buildHistoryDataset(days) {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const stationDays = [];
  const errors = [];

  for (const station of STATIONS) {
    historyRun.status = `reading ${station.city}`;
    try {
      const observations = await historicalObservations(station, start, end);
      stationDays.push(...dailyScoresForStation(station, observations, start, end));
    } catch (error) {
      errors.push({ city: station.city, stationId: station.stationId, error: error.message });
    }
    historyRun.completedStations += 1;
  }

  const dataset = scoreTrackMeet(stationDays, days, errors);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(HISTORY_DIR, `nws-weather-trackmeet-${days}d-${stamp}.json`);
  const csvPath = path.join(HISTORY_DIR, `nws-weather-trackmeet-${days}d-${stamp}.csv`);
  const latestPath = path.join(HISTORY_DIR, "latest.json");
  await fs.writeFile(jsonPath, JSON.stringify(dataset, null, 2), "utf8");
  await fs.writeFile(csvPath, toCsv(dataset.rows), "utf8");
  await fs.writeFile(latestPath, JSON.stringify({ ...dataset, jsonPath, csvPath }, null, 2), "utf8");

  historyRun = {
    running: false,
    startedAt: historyRun.startedAt,
    finishedAt: new Date().toISOString(),
    days,
    completedStations: STATIONS.length,
    totalStations: STATIONS.length,
    status: "complete",
    rows: dataset.rows.length,
    dates: dataset.dates.length,
    jsonPath,
    csvPath,
    errors: errors.length
  };
}

async function historicalObservations(station, start, end) {
  const rows = [];
  let nextUrl = `https://api.weather.gov/stations/${encodeURIComponent(station.stationId)}/observations?start=${start.toISOString()}&end=${end.toISOString()}&limit=500`;
  let pages = 0;
  while (nextUrl && pages < 8) {
    const data = await fetchJson(nextUrl);
    for (const feature of data.features || []) rows.push(feature.properties || {});
    nextUrl = data.pagination?.next || "";
    pages += 1;
  }
  return rows;
}

function dailyScoresForStation(station, observations, start, end) {
  const byDate = new Map();
  for (const obs of observations || []) {
    const observedAt = obs.timestamp || obs.validTime || "";
    const observedMs = Date.parse(observedAt);
    if (!Number.isFinite(observedMs) || observedMs < start.getTime() || observedMs > end.getTime()) continue;
    const date = easternDate(observedAt);
    const tempF = cToF(readingValue(obs.temperature));
    if (!date || !Number.isFinite(tempF)) continue;
    const current = byDate.get(date) || { temps: [], descriptions: new Map() };
    current.temps.push(tempF);
    const description = obs.textDescription || "";
    if (description) current.descriptions.set(description, (current.descriptions.get(description) || 0) + 1);
    byDate.set(date, current);
  }

  return [...byDate.entries()].map(([date, data]) => ({
    date,
    city: station.city,
    stationId: station.stationId,
    series: station.series,
    highF: round(Math.max(...data.temps), 1),
    lowF: round(Math.min(...data.temps), 1),
    avgF: round(data.temps.reduce((sum, value) => sum + value, 0) / data.temps.length, 1),
    observations: data.temps.length,
    dominantCondition: dominant(data.descriptions)
  }));
}

function scoreTrackMeet(rows, days, errors) {
  const byDate = groupBy(rows, (row) => row.date);
  const scored = [];
  for (const [date, dateRows] of byDate.entries()) {
    const ranked = [...dateRows].sort((a, b) => b.highF - a.highF || a.city.localeCompare(b.city));
    ranked.forEach((row, index) => {
      scored.push({
        ...row,
        dailyRank: index + 1,
        points: ranked.length - index,
        fieldSize: ranked.length
      });
    });
  }
  const leaderboard = [...groupBy(scored, (row) => row.city).entries()].map(([city, cityRows]) => ({
    city,
    stationId: cityRows[0]?.stationId || "",
    series: cityRows[0]?.series || "",
    points: cityRows.reduce((sum, row) => sum + row.points, 0),
    wins: cityRows.filter((row) => row.dailyRank === 1).length,
    avgHighF: round(cityRows.reduce((sum, row) => sum + row.highF, 0) / cityRows.length, 1),
    days: cityRows.length
  })).sort((a, b) => b.points - a.points || b.wins - a.wins || b.avgHighF - a.avgHighF);

  return {
    generatedAt: new Date().toISOString(),
    source: "weather.gov station observations",
    sourceCaution: "Observation-derived history only. Do not treat as contract settlement data until each city source is confirmed against the contract's NWS CLI climate summary.",
    days,
    stations: STATIONS,
    dates: [...byDate.keys()].sort(),
    leaderboard,
    rows: scored.sort((a, b) => b.date.localeCompare(a.date) || a.dailyRank - b.dailyRank),
    errors
  };
}

async function latestHistorySummary() {
  const latestPath = path.join(HISTORY_DIR, "latest.json");
  if (!existsSync(latestPath)) return { ok: true, available: false, message: "No historical dataset built yet." };
  const data = JSON.parse(await fs.readFile(latestPath, "utf8"));
  return { ok: true, available: true, ...data };
}

async function officialForecastHigh(station) {
  const stationUrl = `https://api.weather.gov/stations/${encodeURIComponent(station.stationId)}`;
  const stationData = await fetchJson(stationUrl);
  const coords = stationData?.geometry?.coordinates;
  const timeZone = stationData?.properties?.timeZone || "America/New_York";
  const cacheKey = `${station.stationId}:${stationDateKey(new Date(), timeZone)}`;
  const cached = forecastHighCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!Array.isArray(coords) || !Number.isFinite(Number(coords[0])) || !Number.isFinite(Number(coords[1]))) {
    throw new Error("NWS station coordinates unavailable");
  }

  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  const pointData = await fetchJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  const gridUrl = pointData?.properties?.forecastGridData;
  if (!gridUrl) throw new Error("NWS forecast grid unavailable");

  const gridData = await fetchJson(gridUrl);
  const maxTemperature = gridData?.properties?.maxTemperature;
  const values = Array.isArray(maxTemperature?.values) ? maxTemperature.values : [];
  const targetDate = stationDateKey(new Date(), timeZone);
  const match = values.find((entry) => {
    const start = String(entry?.validTime || "").split("/")[0];
    return start && stationDateKey(new Date(start), timeZone) === targetDate;
  }) || values[0];
  if (!match || !Number.isFinite(Number(match.value))) throw new Error("NWS maxTemperature missing");

  const uom = String(maxTemperature?.uom || "");
  const forecastHighF = uom.includes("degF") ? round(Number(match.value), 1) : cToF(Number(match.value));
  const value = {
    forecastHighF,
    forecastHighAt: new Date().toISOString(),
    forecastHighValidTime: match.validTime || "",
    forecastHighSource: "NWS forecastGridData maxTemperature",
    forecastHighUrl: gridUrl,
    forecastHighError: ""
  };
  forecastHighCache.set(cacheKey, { value, expiresAt: Date.now() + 30 * 60_000 });
  return value;
}

function observationRow(station, properties, geometry, sourceUrl, forecastHigh = {}) {
  const coords = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
  return {
    ...station,
    status: "ok",
    sourceUrl,
    observedAt: properties.timestamp || null,
    fetchedAt: new Date().toISOString(),
    latitude: Number.isFinite(Number(coords[1])) ? Number(coords[1]) : null,
    longitude: Number.isFinite(Number(coords[0])) ? Number(coords[0]) : null,
    temperatureF: cToF(readingValue(properties.temperature)),
    heatIndexF: cToF(readingValue(properties.heatIndex)),
    dewpointF: cToF(readingValue(properties.dewpoint)),
    humidityPct: round(readingValue(properties.relativeHumidity), 1),
    windMph: round(readingValue(properties.windSpeed) * 2.236936, 1),
    windDirectionDeg: round(readingValue(properties.windDirection), 0),
    description: properties.textDescription || "",
    rawMessage: properties.rawMessage || "",
    forecastHighF: forecastHigh.forecastHighF ?? null,
    forecastHighAt: forecastHigh.forecastHighAt || null,
    forecastHighValidTime: forecastHigh.forecastHighValidTime || "",
    forecastHighSource: forecastHigh.forecastHighSource || "",
    forecastHighUrl: forecastHigh.forecastHighUrl || "",
    forecastHighError: forecastHigh.error || forecastHigh.forecastHighError || "",
    error: ""
  };
}

function errorRow(station, sourceUrl, error) {
  return {
    ...station,
    status: "error",
    sourceUrl,
    observedAt: null,
    fetchedAt: new Date().toISOString(),
    temperatureF: null,
    heatIndexF: null,
    dewpointF: null,
    humidityPct: null,
    windMph: null,
    windDirectionDeg: null,
    description: "",
    rawMessage: "",
    forecastHighF: null,
    forecastHighAt: null,
    forecastHighValidTime: "",
    forecastHighSource: "",
    forecastHighUrl: "",
    forecastHighError: "",
    error: error.message || "NWS read failed"
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { headers: NWS_HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`weather.gov ${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function serveStatic(urlPath, res) {
  const clean = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const file = path.normalize(path.join(PUBLIC_DIR, clean));
  if (!file.startsWith(PUBLIC_DIR) || !existsSync(file)) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const type = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
  res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
  createReadStream(file).pipe(res);
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function mapLimit(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
  }
  return results;
}

function readingValue(reading) {
  const value = Number(reading?.value);
  return Number.isFinite(value) ? value : null;
}

function cToF(value) {
  return value == null ? null : round((value * 9 / 5) + 32, 1);
}

function stationDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function easternDate(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(parsed));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function dominant(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, places = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** places;
  return Math.round(number * factor) / factor;
}

function toCsv(rows) {
  const columns = ["date", "dailyRank", "points", "city", "stationId", "series", "highF", "lowF", "avgF", "observations", "dominantCondition"];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csv(row[column])).join(","))].join("\n") + "\n";
}

function csv(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
