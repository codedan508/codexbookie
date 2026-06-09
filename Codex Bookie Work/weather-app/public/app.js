const state = {
  results: [],
  audit: [],
  gameScanLog: [],
  sportsArbCandidates: [],
  sportsArbWatch: null,
  spArbWatch: null,
  bitcoinArbWatch: null,
  btcTechnicalBias: null,
  recordingPreview: { spotRows: [], strikeRows: [] },
  recordingPreviews: {},
  polymarketWeatherMatches: [],
  webullWeatherMatches: [],
  fanduelWeatherMatches: [],
  draftKingsWeatherMatches: [],
  weatherBeaconReadings: [],
  weatherBeaconMeta: {},
  counters: {},
  paper: {},
  running: false,
  settings: {}
};

const laneSettings = {
  enableBitcoinArb: false,
  enableSportsArb: false,
  enableSpArb: false,
  enableGoldScanning: false,
  enableCrudeOilScanning: false,
  enableWeatherScanning: true
};
let laneSettingsLocked = false;
const OTHER_LEADER_HOLD_MS = 30_000;
const OTHER_LEADER_MIN_RANGE_CENTS = 6;
const OTHER_LEADER_MIN_RECENT_AMPLITUDE_CENTS = 3;
const OTHER_LEADER_MIN_DIRECTION_CHANGES = 1;
const OTHER_LEADER_MIN_ACTIVITY = 1000;
const OTHER_LEADER_MAX_SPREAD_CENTS = 3;
let heldOtherLeader = null;
let heldOtherLeaderAt = 0;

const els = {
  startBtn: document.querySelector("#startBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  auditLog: document.querySelector("#auditLog"),
  gameScanLog: document.querySelector("#gameScanLog"),
  bitcoinScanLog: document.querySelector("#bitcoinScanLog"),
  sportsArbLog: document.querySelector("#sportsArbLog"),
  spArbLog: document.querySelector("#spArbLog"),
  currentScanSummary: document.querySelector("#currentScanSummary"),
  auditTab: document.querySelector("#auditTab"),
  gamesTab: document.querySelector("#gamesTab"),
  shadowTab: document.querySelector("#shadowTab"),
  tradeHistoryTab: document.querySelector("#tradeHistoryTab"),
  tradeHistoryLog: document.querySelector("#tradeHistoryLog"),
  shadowLog: document.querySelector("#shadowLog"),
  downloadCsv: document.querySelector("#downloadCsv"),
  downloadTxt: document.querySelector("#downloadTxt"),
  results: document.querySelector("#results"),
  showAll: document.querySelector("#showAll"),
  maxTradeDollars: document.querySelector("#maxTradeDollars"),
  maxOpenDollars: document.querySelector("#maxOpenDollars"),
  weatherLaneBtn: document.querySelector("#weatherLaneBtn"),
  weatherBeaconPanel: document.querySelector("#weatherBeaconPanel"),
  weatherBeaconGrid: document.querySelector("#weatherBeaconGrid"),
  weatherBeaconSchedule: document.querySelector("#weatherBeaconSchedule")
};

els.emergencyStopAllBtn = document.querySelector("#emergencyStopAllBtn");
els.paperResetBtn = document.querySelector("#paperResetBtn");
els.paperEquity = document.querySelector("#paperEquity");
els.paperCash = document.querySelector("#paperCash");
els.paperOpenValue = document.querySelector("#paperOpenValue");
els.botOpenValue = document.querySelector("#botOpenValue");
els.paperPnl = document.querySelector("#paperPnl");
els.paperUnrealized = document.querySelector("#paperUnrealized");
els.paperStatus = document.querySelector("#paperStatus");
els.paperActive = document.querySelector("#paperActive");
els.paperLog = document.querySelector("#paperLog");

els.startBtn.addEventListener("click", startSystem);
els.stopBtn.addEventListener("click", stopSystem);
if (els.emergencyStopAllBtn) els.emergencyStopAllBtn.addEventListener("click", emergencyStopAll);
if (els.paperResetBtn) els.paperResetBtn.addEventListener("click", resetPaper);
if (els.paperActive) els.paperActive.addEventListener("click", emergencyStopPosition);
els.results.addEventListener("click", emergencyStopPosition);
if (els.showAll) els.showAll.addEventListener("change", renderResults);
if (els.weatherLaneBtn) els.weatherLaneBtn.addEventListener("click", () => setLane("enableWeatherScanning", els.weatherLaneBtn.getAttribute("aria-pressed") !== "true"));
if (els.auditTab) els.auditTab.addEventListener("click", () => setAuditPanel("audit"));
if (els.gamesTab) els.gamesTab.addEventListener("click", () => setAuditPanel("games"));
if (els.tradeHistoryTab) els.tradeHistoryTab.addEventListener("click", () => setAuditPanel("trades"));
if (els.shadowTab) els.shadowTab.addEventListener("click", () => setAuditPanel("shadow"));

connectEvents();
loadInitialState();
refreshLiveStatus();
refreshWeatherBeaconDashboard();
setInterval(refreshLiveStatus, 8000);
setInterval(refreshRecordingPreview, 3000);
setInterval(refreshWeatherBeaconDashboard, 60_000);

async function startSystem() {
  if (!laneSettings.enableWeatherScanning) {
    const message = "Turn on Weather Scanning before starting.";
    setStatus(message);
    window.alert(message);
    return;
  }
  setStatus("Starting scanner...");
  await startScan();
}

async function stopSystem() {
  setStatus("Stopping scanner...");
  await stopScan();
}

async function startScan() {
  setStatus("Connecting to Kalshi market data...");
  const response = await fetch("/api/scan/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      maxTradeDollars: 0,
      maxOpenDollars: 0,
      enableBitcoin: false,
      enableBitcoinArb: false,
      enableOtherMarkets: false,
      enableSportsArb: false,
      enableSpArb: false,
      enableGoldScanning: false,
      enableCrudeOilScanning: false,
      enableWeatherScanning: true,
      bookScanOnly: true,
      continuous: true
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || "Scanner could not start.";
    setStatus(message);
    window.alert(message);
  }
}

async function stopScan() {
  setStatus("Stop requested...");
  await fetch("/api/scan/stop", { method: "POST" });
}

async function startPaper() {
  setStatus("Starting live trader...");
  const response = await fetch("/api/paper/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      maxTradeDollars: maxTradeDollarsValue(),
      maxOpenDollars: maxOpenDollarsValue(),
      enableBitcoin: false,
      enableBitcoinArb: false,
      enableOtherMarkets: false,
      enableSportsArb: false,
      enableSpArb: false,
      enableGoldScanning: false,
      enableCrudeOilScanning: false,
      enableWeatherScanning: true,
      bookScanOnly: false,
      continuous: true
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || "Could not start live trader.";
    setStatus(message);
    window.alert(message);
  }
}

async function stopPaper() {
  setStatus("Winding down: no new positions...");
  await fetch("/api/live/wind-down", { method: "POST" });
}

async function resetPaper() {
  await fetch("/api/paper/reset", { method: "POST" });
}

async function emergencyStopAll() {
  if (!confirm("Emergency stop all tracked positions now?")) return;
  setStatus("Emergency stop requested...");
  await fetch("/api/live/emergency-stop-all", { method: "POST" });
}

async function emergencyStopPosition(event) {
  const continueButton = event.target.closest("[data-continue-arb-position]");
  if (continueButton) {
    setStatus("Continue attempts requested: retrying ARB leg IOC only...");
    const response = await fetch("/api/live/continue-arb-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: continueButton.dataset.continueArbPosition })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error || "Continue attempts failed.";
      setStatus(message);
      window.alert(message);
      await loadInitialState().catch(() => {});
      return;
    }
    state.paper = payload.paper || state.paper;
    renderPaper();
    setStatus(payload.message || "Continue attempts started.");
    return;
  }
  const overrideButton = event.target.closest("[data-manual-override-position]");
  if (overrideButton) {
    if (!confirm("Detach this trade from the app and manage it manually? No Kalshi order will be sent.")) return;
    setStatus("Manual override requested: detaching app tracking only...");
    const response = await fetch("/api/live/manual-override-position", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: overrideButton.dataset.manualOverridePosition })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error || "Manual override failed.";
      setStatus(message);
      window.alert(message);
      await loadInitialState().catch(() => {});
      return;
    }
    state.paper = payload.paper || state.paper;
    renderPaper();
    if (payload.alreadyDetached) {
      await loadInitialState().catch(() => {});
      setStatus(payload.message || "Position already detached from app tracking.");
    } else {
      setStatus("Manual override active. App will no longer manage that position.");
    }
    return;
  }
  const button = event.target.closest("[data-emergency-position]");
  if (!button) return;
  if (!confirm("Emergency stop this position now?")) return;
  setStatus("Emergency stop requested for active position...");
  await fetch("/api/live/emergency-stop-position", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: button.dataset.emergencyPosition })
  });
}

async function refreshLiveStatus() {
  try {
    const data = await fetch("/api/live/status").then((res) => res.json());
    if (data?.ok && data.balance?.ok) {
      const cash = Number(data.balance.balance_dollars ?? ((data.balance.balance ?? 0) / 100));
      const openPositions = Number((data.balance.portfolio_value ?? 0) / 100);
      const accountValue = cash + openPositions;
      state.paper.cash = cash;
      state.paper.openPositionValue = openPositions;
      state.paper.equity = accountValue;
      state.paper.botOpenPositionValue = Number(data.paper?.botOpenPositionValue ?? state.paper.botOpenPositionValue ?? 0);
      state.paper.liveTradingEnabled = data.liveTradingEnabled;
      renderPaper();
    }
  } catch {}
}

async function loadInitialState() {
  const res = await fetch("/api/state");
  const snapshot = await res.json();
  applySnapshot(snapshot);
  await refreshRecordingPreview();
}

async function refreshRecordingPreview() {
  try {
    const payload = await fetch("/api/recording/latest").then((res) => res.json());
    if (payload?.ok) {
      state.recordingPreviews = payload.previews || {};
      state.recordingPreview = state.recordingPreviews.weather || { spotRows: [], strikeRows: [] };
      state.polymarketWeatherMatches = payload.polymarketWeatherMatches || [];
      state.webullWeatherMatches = payload.webullWeatherMatches || [];
      state.fanduelWeatherMatches = payload.fanduelWeatherMatches || [];
      state.draftKingsWeatherMatches = payload.draftKingsWeatherMatches || [];
      renderScannerSummary();
      renderResults();
    }
  } catch {}
}

async function refreshWeatherBeaconDashboard() {
  try {
    const payload = await fetch("/api/weather/beacons/latest").then((res) => res.json());
    if (payload?.ok) {
      state.weatherBeaconReadings = payload.rows || [];
      state.weatherBeaconMeta = {
        fetchedAt: payload.fetchedAt || null,
        nextRefreshAt: payload.nextRefreshAt || null,
        intervalMs: payload.intervalMs || 0,
        scanWindow: payload.scanWindow || "",
        source: payload.source || "",
        lastError: payload.lastError || ""
      };
      renderWeatherBeaconDashboard();
    }
  } catch {
    renderWeatherBeaconDashboard("Weather beacon feed is not connected right now.");
  }
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("snapshot", (event) => applySnapshot(JSON.parse(event.data)));
  source.addEventListener("progress", (event) => renderProgress(JSON.parse(event.data)));
  source.addEventListener("audit", (event) => {
    state.audit.push(JSON.parse(event.data));
    if (state.audit.length > 300) state.audit.shift();
    renderAudit();
  });
  source.addEventListener("gameScan", (event) => {
    state.gameScanLog.unshift(JSON.parse(event.data));
    state.gameScanLog = state.gameScanLog.slice(0, 400);
    renderGameScanLog();
  });
  source.addEventListener("counters", (event) => {
    state.counters = JSON.parse(event.data);
    renderCounters();
  });
  source.addEventListener("results", (event) => {
    state.results = JSON.parse(event.data);
    renderResults();
  });
  source.addEventListener("sportsArb", (event) => {
    state.sportsArbCandidates.unshift(JSON.parse(event.data));
    state.sportsArbCandidates = state.sportsArbCandidates.slice(0, 50);
    renderGameScanLog();
  });
  source.addEventListener("sportsArbWatch", (event) => {
    state.sportsArbWatch = JSON.parse(event.data);
    renderGameScanLog();
  });
  source.addEventListener("spArbWatch", (event) => {
    state.spArbWatch = JSON.parse(event.data);
    renderGameScanLog();
  });
  source.addEventListener("bitcoinArbWatch", (event) => {
    state.bitcoinArbWatch = JSON.parse(event.data);
    renderGameScanLog();
  });
  source.addEventListener("paper", (event) => {
    state.paper = JSON.parse(event.data);
    renderPaper();
    renderShadowLog();
    renderGameScanLog();
  });
  source.addEventListener("shadow", (event) => {
    const payload = JSON.parse(event.data);
    if (Array.isArray(payload)) {
      state.paper = { ...(state.paper || {}), shadowLog: payload };
    } else {
      state.paper = {
        ...(state.paper || {}),
        shadowLog: payload.log || [],
        shadow: {
          ...((state.paper && state.paper.shadow) || {}),
          account: payload.account || null
        }
      };
    }
    renderShadowLog();
  });
  source.addEventListener("btcTechnicalBias", (event) => {
    state.btcTechnicalBias = JSON.parse(event.data);
    renderGameScanLog();
  });
  source.addEventListener("done", (event) => {
    applySnapshot(JSON.parse(event.data));
    setStatus("Stopped. Results are saved under the local results folder.");
    updatePrimaryButtons();
  });
  source.onerror = () => {
    setStatus("Live connection interrupted. Reconnecting...");
  };
}

function applySnapshot(snapshot) {
  state.running = snapshot.running;
  state.results = snapshot.results || [];
  state.audit = snapshot.audit || [];
  state.gameScanLog = snapshot.gameScanLog || [];
  state.sportsArbCandidates = snapshot.sportsArbCandidates || [];
  state.sportsArbWatch = snapshot.sportsArbWatch || null;
  state.spArbWatch = snapshot.spArbWatch || null;
  state.bitcoinArbWatch = snapshot.bitcoinArbWatch || null;
  state.btcTechnicalBias = snapshot.btcTechnicalBias || null;
  state.polymarketWeatherMatches = snapshot.polymarketWeatherMatches || state.polymarketWeatherMatches || [];
  state.webullWeatherMatches = snapshot.webullWeatherMatches || state.webullWeatherMatches || [];
  state.fanduelWeatherMatches = snapshot.fanduelWeatherMatches || state.fanduelWeatherMatches || [];
  state.draftKingsWeatherMatches = snapshot.draftKingsWeatherMatches || state.draftKingsWeatherMatches || [];
  state.weatherBeaconReadings = snapshot.weatherBeaconReadings || state.weatherBeaconReadings || [];
  state.weatherBeaconMeta = {
    ...(state.weatherBeaconMeta || {}),
    fetchedAt: snapshot.weatherBeaconFetchedAt || state.weatherBeaconMeta?.fetchedAt || null,
    nextRefreshAt: snapshot.weatherBeaconNextRefreshAt || state.weatherBeaconMeta?.nextRefreshAt || null
  };
  state.counters = snapshot.counters || {};
  state.settings = snapshot.settings || {};
  state.paper = snapshot.paper || {};
  if (!laneSettingsLocked) applyLaneSnapshot(snapshot.settings || snapshot.paper?.settings || {});
  if (els.maxTradeDollars && Object.prototype.hasOwnProperty.call(snapshot.paper?.settings || {}, "maxTradeDollars") && document.activeElement !== els.maxTradeDollars) {
    els.maxTradeDollars.value = Math.min(50, Math.max(0, Number(snapshot.paper.settings.maxTradeDollars ?? 0)));
  }
  if (els.maxOpenDollars && Object.prototype.hasOwnProperty.call(snapshot.paper?.settings || {}, "maxOpenDollars") && document.activeElement !== els.maxOpenDollars) {
    els.maxOpenDollars.value = Math.min(100, Math.max(0, Number(snapshot.paper.settings.maxOpenDollars ?? 0)));
  }
  renderProgress(snapshot.now || {});
  renderCounters();
  renderAudit();
  renderGameScanLog();
  renderTradeHistory();
  renderShadowLog();
  renderPaper();
  renderWeatherBeaconDashboard();
  renderResults();
  updatePrimaryButtons();
}

async function setLane(key, value) {
  const previous = { ...laneSettings };
  laneSettingsLocked = true;
  laneSettings[key] = Boolean(value);
  renderLaneSwitches();
  try {
    const response = await fetch("/api/settings/lanes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enableBitcoin: false,
        enableBitcoinArb: false,
        enableOtherMarkets: false,
        enableSportsArb: false,
        enableSpArb: false,
        enableGoldScanning: false,
        enableCrudeOilScanning: false,
        enableWeatherScanning: laneSettings.enableWeatherScanning
      })
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Lane update failed");
    const payload = await response.json().catch(() => ({}));
    const accepted = payload.settings || {};
    laneSettings.enableBitcoinArb = false;
    laneSettings.enableSportsArb = false;
    laneSettings.enableSpArb = false;
    laneSettings.enableGoldScanning = false;
    laneSettings.enableCrudeOilScanning = false;
    laneSettings.enableWeatherScanning = accepted.enableWeatherScanning === true;
    state.settings = { ...(state.settings || {}), enableBitcoin: false, enableBitcoinArb: laneSettings.enableBitcoinArb, enableOtherMarkets: false, enableSportsArb: laneSettings.enableSportsArb, enableSpArb: laneSettings.enableSpArb, enableGoldScanning: laneSettings.enableGoldScanning, enableCrudeOilScanning: laneSettings.enableCrudeOilScanning, enableWeatherScanning: laneSettings.enableWeatherScanning };
    if (payload.paper) state.paper = payload.paper;
    if (payloadHasPaperRunning()) state.paper.settings = { ...(state.paper?.settings || {}), enableBitcoin: false, enableBitcoinArb: laneSettings.enableBitcoinArb, enableOtherMarkets: false, enableSportsArb: laneSettings.enableSportsArb, enableSpArb: laneSettings.enableSpArb, enableGoldScanning: laneSettings.enableGoldScanning, enableCrudeOilScanning: laneSettings.enableCrudeOilScanning, enableWeatherScanning: laneSettings.enableWeatherScanning };
    renderLaneSwitches();
    renderGameScanLog();
    setStatus(`Lanes updated: Weather ${laneSettings.enableWeatherScanning ? "ON" : "OFF"}.`);
  } catch (error) {
    laneSettings.enableBitcoinArb = previous.enableBitcoinArb;
    laneSettings.enableSportsArb = previous.enableSportsArb;
    laneSettings.enableSpArb = previous.enableSpArb;
    laneSettings.enableGoldScanning = previous.enableGoldScanning;
    laneSettings.enableCrudeOilScanning = previous.enableCrudeOilScanning;
    laneSettings.enableWeatherScanning = previous.enableWeatherScanning;
    renderLaneSwitches();
    setStatus(`Lane update failed: ${error.message}`);
  } finally {
    laneSettingsLocked = false;
  }
}

function payloadHasPaperRunning() {
  return Boolean(state.paper && typeof state.paper === "object");
}

function maxTradeDollarsValue() {
  if (!els.maxTradeDollars) return 0;
  const value = Number(els.maxTradeDollars.value);
  return Number.isFinite(value) ? Math.min(50, Math.max(0, Math.round(value))) : 0;
}

function maxOpenDollarsValue() {
  if (!els.maxOpenDollars) return 0;
  const value = Number(els.maxOpenDollars.value);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
}

function applyLaneSnapshot(settings) {
  laneSettings.enableBitcoinArb = false;
  laneSettings.enableSportsArb = false;
  laneSettings.enableSpArb = false;
  laneSettings.enableGoldScanning = false;
  laneSettings.enableCrudeOilScanning = false;
  if (Object.prototype.hasOwnProperty.call(settings, "enableWeatherScanning")) laneSettings.enableWeatherScanning = settings.enableWeatherScanning === true;
  renderLaneSwitches();
}

function renderLaneSwitches() {
  renderLaneButton(els.weatherLaneBtn, laneSettings.enableWeatherScanning);
}

function renderLaneButton(button, enabled) {
  if (!button) return;
  const label = button.dataset.label || "";
  button.textContent = `${label ? `${label} ` : ""}${enabled ? "ON" : "OFF"}`;
  button.classList.toggle("on", enabled);
  button.classList.toggle("off", !enabled);
  button.setAttribute("aria-pressed", enabled ? "true" : "false");
}

function renderPaper() {
  if (els.paperStatus) els.paperStatus.textContent = state.running ? "Scanning" : "Stopped";
  if (els.paperActive) els.paperActive.innerHTML = "";
  if (els.paperLog) els.paperLog.innerHTML = "";
  renderTradeHistory();
  renderResults();
  updatePrimaryButtons();
}

function renderProgress(_now) {}

function updatePrimaryButtons() {
  if (els.startBtn) els.startBtn.disabled = Boolean(state.running);
  if (els.stopBtn) els.stopBtn.disabled = !state.running;
}

function renderCounters() {
  for (const [key, value] of Object.entries(state.counters || {})) {
    const el = document.querySelector(`#${key}`);
    if (el) el.textContent = fmt(value || 0);
  }
}

function renderAudit() {
  if (!els.auditLog) return;
  els.auditLog.innerHTML = state.audit.slice(-220).reverse().map((row) => `
    <div class="audit-row ${row.level}">
      <time>${new Date(row.time).toLocaleTimeString()}</time>
      <span>${escapeHtml(row.message)}</span>
    </div>
  `).join("");
}

function renderShadowLog() {
  if (!els.shadowLog) return;
  const account = state.paper?.shadow?.account || {};
  const open = account.openPosition || null;
  const trades = Array.isArray(account.trades) ? account.trades.slice(0, 8) : [];
  const rows = (state.paper?.shadowLog || []).slice(0, 220);
  const statsHtml = `
    <div class="shadow-ledger">
      <div class="shadow-ledger-grid">
        <span><b>${dollars(account.startingCash ?? 20)}</b><small>start</small></span>
        <span><b>${dollars(account.cash ?? 20)}</b><small>cash</small></span>
        <span><b>${dollars(account.equity ?? 20)}</b><small>equity</small></span>
        <span><b>${dollars(account.realizedPnl ?? 0, true)}</b><small>realized</small></span>
        <span><b>${dollars(account.unrealizedPnl ?? 0, true)}</b><small>open P/L</small></span>
      </div>
      ${open ? `
        <div class="shadow-position">
          <strong>OPEN ${escapeHtml(open.action || open.side || "")}</strong>
          <span>${escapeHtml(open.ticker || "")}</span>
          <span>${Number(open.contracts || 0)} @ ${cents(open.entryPriceCents)} | bid ${cents(open.currentBidCents)} | target ${cents(open.targetPriceCents)} | stop ${cents(open.stopPriceCents)}</span>
        </div>
      ` : `<div class="shadow-position muted">No shadow position open.</div>`}
      ${trades.length ? `
        <div class="shadow-trades">
          ${trades.map((trade) => `
            <div>
              <b>${escapeHtml(trade.closeReason || "CLOSED")}</b>
              <span>${escapeHtml(trade.ticker || "")}</span>
              <span>${cents(trade.entryPriceCents)} -> ${cents(trade.exitPriceCents)} | ${dollars(trade.pnl || 0, true)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
  const logHtml = rows.length ? rows.map((row) => `
    <div class="audit-row ${escapeHtml(row.level || "info")}">
      <time>${row.time ? new Date(row.time).toLocaleTimeString() : "-"}</time>
      <span>${escapeHtml(row.message || "")}</span>
    </div>
  `).join("") : `<div class="empty">No shadow paper decisions yet.</div>`;
  els.shadowLog.innerHTML = statsHtml + logHtml;
}

function renderGameScanLog() {
  const bitcoinRows = state.gameScanLog.filter((row) => isBitcoinScanRow(row) && isCurrentBitcoinHourlyRow(row)).slice(0, 120);
  renderScannerSummary(bitcoinRows);
  if (els.bitcoinScanLog) {
    els.bitcoinScanLog.classList.toggle("hidden", !laneSettings.enableBitcoinArb);
    els.bitcoinScanLog.innerHTML = laneSettings.enableBitcoinArb ? bitcoinStableScanCardHtml(bitcoinRows) : "";
  }
  if (els.sportsArbLog) {
    els.sportsArbLog.classList.toggle("hidden", !laneSettings.enableSportsArb);
    els.sportsArbLog.innerHTML = laneSettings.enableSportsArb ? sportsArbStableCardHtml() : "";
  }
  if (els.spArbLog) {
    els.spArbLog.classList.toggle("hidden", !laneSettings.enableSpArb);
    els.spArbLog.innerHTML = laneSettings.enableSpArb ? spArbStableCardHtml() : "";
  }
  if (els.gameScanLog) {
    els.gameScanLog.innerHTML = state.gameScanLog.slice(0, 220).map(scanRowHtml).join("") || `<div class="empty">Waiting for the first scanned contract.</div>`;
  }
}

function renderWeatherBeaconDashboard(errorMessage = "") {
  if (!els.weatherBeaconGrid) return;
  const rows = [...(state.weatherBeaconReadings || [])].sort((a, b) => String(a.city || "").localeCompare(String(b.city || "")));
  const meta = state.weatherBeaconMeta || {};
  const intervalText = meta.scanWindow === "day" ? "1 min scan, 8 AM-8 PM Eastern" : "hourly scan overnight";
  const refreshed = meta.fetchedAt ? `last ${shortTime(meta.fetchedAt)}` : "waiting";
  const next = meta.nextRefreshAt ? `next ${shortTime(meta.nextRefreshAt)}` : "next pending";
  if (els.weatherBeaconSchedule) {
    els.weatherBeaconSchedule.textContent = errorMessage || `${intervalText} | ${refreshed} | ${next}`;
  }
  if (!rows.length) {
    els.weatherBeaconGrid.innerHTML = `<div class="empty compact-empty">Waiting for the first weather.gov beacon read.</div>`;
    return;
  }
  els.weatherBeaconGrid.innerHTML = rows.map(weatherBeaconCardHtml).join("");
}

function weatherBeaconCardHtml(row) {
  const temp = Number.isFinite(Number(row.temperatureF)) ? `${Number(row.temperatureF).toFixed(1)}F` : "--";
  const observed = row.observedAt ? shortTime(row.observedAt) : "no time";
  const coords = Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
    ? `${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}`
    : "coords pending";
  const confidence = String(row.confidence || "candidate").replace(/-/g, " ");
  const detail = row.status === "ok"
    ? `${row.description || "live observation"}${Number.isFinite(Number(row.humidityPct)) ? ` | RH ${Number(row.humidityPct).toFixed(0)}%` : ""}`
    : row.error || "station read failed";
  return `
    <article class="weather-beacon-card ${row.status === "ok" ? "ok" : "error"}">
      <header>
        <strong>${escapeHtml(row.city || row.stationId || "Weather")}</strong>
        <span>${escapeHtml(row.stationId || "")}</span>
      </header>
      <div class="weather-beacon-temp">${escapeHtml(temp)}</div>
      <div class="weather-beacon-line">${escapeHtml(detail)}</div>
      <div class="weather-beacon-meta">
        <span>${escapeHtml(observed)}</span>
        <span>${escapeHtml(confidence)}</span>
        <span>${escapeHtml(coords)}</span>
      </div>
    </article>
  `;
}

function bitcoinStableScanCardHtml(rows) {
  const arb = state.bitcoinArbWatch || null;
  if (arb && bitcoinArbWatchHasConfirmedAnchor(arb)) {
    return `
      <div class="scan-simple-card btc-simple-card btc-monitor-card">
        <div class="scan-simple-main">
          <strong>Bitcoin Scanning</strong>
          <span>${escapeHtml(arb.expiresAt ? `exp ${new Date(arb.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "exp -")}</span>
        </div>
        <div class="scan-simple-strike">
          <b>Scanning next anchor</b>
          <span>Confirmed anchor moved to the scanner log.</span>
          <small>Scanner activity is tracked here.</small>
        </div>
      </div>
    `;
  }
  const latest = strongestBitcoinBookRow(rows);
  if (!latest) {
    return `
      <div class="scan-simple-card btc-simple-card btc-monitor-card">
        <div class="scan-simple-main">
          <strong>Bitcoin Hourly Scanner</strong>
          <span>exp -</span>
        </div>
        <div class="scan-simple-strike">
          <b>${laneSettings.enableBitcoinArb ? "SCANNER READY" : "OFF"}</b>
          <span>waiting for current-hour BTC contract</span>
          <small>Bitcoin scanning is read-only in this app.</small>
        </div>
      </div>
    `;
  }
  const side = latest ? bestScanSide(latest) : null;
  const decision = latest ? Date.parse(latest.decision_time || latest.close_time || "") : NaN;
  const hourLabel = Number.isFinite(decision) ? `BTC ${new Date(decision).toLocaleTimeString([], { hour: "numeric" })}` : "BTC --";
  const expiryLabel = Number.isFinite(decision) ? `exp ${new Date(decision).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "exp -";
  const strikeLabel = latest?.event || "preparing current-hour strike";
  const priceLabel = side?.entry != null ? `${cents(side.entry)} observed` : "waiting";
  const statusLabel = side?.decision === "candidate" ? "Ready" : side?.reason ? scanShortReason(side.reason) : "Watching";
  const marketPriceLabel = btcYesNoPriceLabel(latest);
  const signalLabel = compactBookDecision(latest?.bookWallSummary || side?.bookWallSummary);
  return `
    <div class="scan-simple-card btc-simple-card btc-monitor-card">
      <div class="scan-simple-main">
        <strong>${escapeHtml(hourLabel)} SCANNER</strong>
        <span>${escapeHtml(expiryLabel)}</span>
      </div>
      <div class="scan-simple-strike">
        <b>${laneSettings.enableBitcoinArb ? "BITCOIN SCANNING" : "OFF"}</b>
        <span>${escapeHtml(strikeLabel)}</span>
        <small>${escapeHtml(marketPriceLabel || priceLabel)}</small>
        <small>Watching Kalshi Bitcoin market and orderbook data.</small>
      </div>
      <div class="scan-simple-tech">
        <span class="tech-pill ${statusClass(statusLabel)}">${escapeHtml(statusLabel)}</span>
        <span class="tech-pill ${signalLabel.cls}">${escapeHtml(signalLabel.text)}</span>
      </div>
    </div>
  `;
}

function renderScannerSummary(bitcoinRows = []) {
  if (!els.currentScanSummary) return;
  const cards = scanCardModels();
  els.currentScanSummary.innerHTML = cards.length
    ? `<div class="scan-card-list">${cards.map(scanReadoutCardHtml).join("")}</div>`
    : `<div class="empty compact-empty">Turn on a scan to show the price and five strikes.</div>`;
}

function scanCardModels() {
  const configs = [
    { key: "weather", enabled: laneSettings.enableWeatherScanning, title: "Weather", emptyPrice: "Weather contract feeds" }
  ];
  const active = configs.filter((config) => config.enabled);
  const visible = active.length ? active : configs.filter((config) => {
    const preview = state.recordingPreviews?.[config.key];
    return preview?.spotRows?.length || preview?.strikeRows?.length;
  }).slice(0, 1);
  return visible.map((config) => {
    const preview = state.recordingPreviews?.[config.key] || {};
    return {
      ...config,
      spot: preview.spotRows?.[0] || null,
      strikes: (preview.strikeRows || []).slice(0, config.key === "weather" ? 120 : 5)
    };
  });
}

function scanReadoutCardHtml(card) {
  if (card.key === "weather") return weatherCityReadoutHtml(card);
  const strikes = card.strikes.length ? card.strikes.map((row) => `
    <div class="scan-strike-row">
      <b>${escapeHtml(scanStrikeLabel(card, row))}</b>
      <span>${escapeHtml(card.key === "weather" ? "Kalshi ask" : "YES")} ${escapeHtml(row.yesAsk || "-")}</span>
    </div>
  `).join("") : `<div class="empty compact-empty">Waiting for copied strikes.</div>`;
  const polymarketMatches = card.key === "weather" && state.polymarketWeatherMatches?.length
    ? `<div class="scan-match-list">
        <div class="scan-source-label">Polymarket matched contracts</div>
        ${state.polymarketWeatherMatches.slice(0, 5).map((match) => `
          <div class="scan-strike-row">
            <b>${escapeHtml(`${match.city || ""} ${match.label || ""}`.trim())}</b>
            <span>Kalshi ask ${escapeHtml(match.kalshiYes || "-")} | Polymarket bid ${escapeHtml(match.polymarketBestBid || "-")} / ask ${escapeHtml(match.polymarketBestAsk || match.polymarketYes || "-")}</span>
          </div>
        `).join("")}
      </div>`
    : sourceWaitingHtml("Polymarket", "no exact same city/date/band match yet");
  const webullMatches = card.key === "weather" && state.webullWeatherMatches?.length
    ? `<div class="scan-match-list">
        <div class="scan-source-label">Webull matched contracts</div>
        ${state.webullWeatherMatches.slice(0, 5).map((match) => `
          <div class="scan-strike-row">
            <b>${escapeHtml(`${match.city || ""} ${match.label || ""}`.trim())}</b>
            <span>Kalshi ask ${escapeHtml(match.kalshiYes || "-")} | Webull bid ${escapeHtml(match.webullBestBid || "-")} / ask ${escapeHtml(match.webullBestAsk || match.webullYes || "-")}</span>
          </div>
        `).join("")}
      </div>`
    : sourceWaitingHtml("Webull", "SDK connected; waiting for exact matched row");
  const fanduelMatches = card.key === "weather" && state.fanduelWeatherMatches?.length
    ? `<div class="scan-match-list">
        <div class="scan-source-label">FanDuel matched contracts</div>
        ${state.fanduelWeatherMatches.slice(0, 5).map((match) => `
          <div class="scan-strike-row">
            <b>${escapeHtml(`${match.city || ""} ${match.label || ""}`.trim())}</b>
            <span>Kalshi ask ${escapeHtml(match.kalshiYes || "-")} | FanDuel bid ${escapeHtml(match.fanduelBestBid || "-")} / ask ${escapeHtml(match.fanduelBestAsk || match.fanduelYes || "-")}</span>
          </div>
        `).join("")}
      </div>`
    : "";
  const draftKingsMatches = card.key === "weather" && state.draftKingsWeatherMatches?.length
    ? `<div class="scan-match-list">
        <div class="scan-source-label">DraftKings matched contracts</div>
        ${state.draftKingsWeatherMatches.slice(0, 5).map((match) => `
          <div class="scan-strike-row">
            <b>${escapeHtml(`${match.city || ""} ${match.label || ""}`.trim())}</b>
            <span>Kalshi ask ${escapeHtml(match.kalshiYes || "-")} | DraftKings bid ${escapeHtml(match.draftKingsBestBid || "-")} / ask ${escapeHtml(match.draftKingsBestAsk || match.draftKingsYes || "-")}</span>
          </div>
        `).join("")}
      </div>`
    : "";
  return `
    <section class="scan-readout-card">
      <div class="scan-readout-head">
        <div>
          <strong>${escapeHtml(card.title)}</strong>
          <small>Kalshi contracts plus matched external feeds</small>
        </div>
        <b>${escapeHtml(card.spot?.priceText || card.emptyPrice)}</b>
      </div>
      <div class="scan-strike-list">
        ${strikes}
      </div>
      ${polymarketMatches}
      ${webullMatches}
      ${fanduelMatches}
      ${draftKingsMatches}
    </section>
  `;
}

function weatherCityReadoutHtml(card) {
  const cities = weatherCityModels(card);
  if (!cities.length) {
    return `
      <section class="scan-readout-card weather-city-screen">
        <div class="scan-readout-head">
          <div>
            <strong>Weather</strong>
            <small>Official weather, forecast, and exchange strikes grouped by city</small>
          </div>
          <b>${escapeHtml(card.emptyPrice)}</b>
        </div>
        <div class="empty compact-empty">Waiting for weather rows.</div>
      </section>
    `;
  }
  const meta = state.weatherBeaconMeta || {};
  const refreshed = meta.fetchedAt ? `weather updated ${shortTime(meta.fetchedAt)}` : "weather updating";
  return `
    <section class="weather-city-screen">
      <div class="weather-city-screen-head">
        <div>
          <strong>Weather</strong>
          <small>Official weather, forecast, and exchange strikes grouped by city</small>
        </div>
        <b>${escapeHtml(refreshed)}</b>
      </div>
      <div class="weather-city-grid">
        ${cities.map(weatherCityCardHtml).join("")}
      </div>
    </section>
  `;
}

function weatherCityModels(card) {
  const cityMap = new Map();
  const ensureCity = (city) => {
    const name = String(city || "").trim();
    if (!name) return null;
    const key = name.toLowerCase();
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        city: name,
        beacon: null,
        strikes: new Map()
      });
    }
    return cityMap.get(key);
  };
  for (const beacon of state.weatherBeaconReadings || []) {
    const model = ensureCity(beacon.city);
    if (model) model.beacon = beacon;
  }
  for (const row of card.strikes || []) {
    const city = row.city || weatherCityFromTicker(row.ticker);
    const model = ensureCity(city);
    if (!model) continue;
    const label = row.yesLabel || weatherStrikeLabelFromTicker(row.ticker) || row.strikeText || "Weather strike";
    const strike = ensureWeatherStrikeModel(model, label, row.strike);
    strike.kalshi = row.yesAsk || "-";
    strike.sort = weatherStrikeSortValue(row);
    strike.timestamp = row.timestamp || strike.timestamp || "";
  }
  addWeatherSourceMatches(cityMap, state.polymarketWeatherMatches || [], "polymarket", "Polymarket");
  addWeatherSourceMatches(cityMap, state.webullWeatherMatches || [], "webull", "Webull");
  return [...cityMap.values()]
    .filter((city) => city.beacon || city.strikes.size)
    .sort(weatherCityModelSort);
}

function addWeatherSourceMatches(cityMap, matches, key, label) {
  for (const match of matches || []) {
    const cityName = String(match.city || "").trim();
    if (!cityName) continue;
    const mapKey = cityName.toLowerCase();
    const model = cityMap.get(mapKey) || { city: cityName, beacon: null, strikes: new Map() };
    cityMap.set(mapKey, model);
    const strike = ensureWeatherStrikeModel(model, match.label || "Weather strike", match.bandLow ?? match.bandHigh);
    strike.kalshi ||= match.kalshiYes || "-";
    strike[key] = weatherSourcePriceText(match, key);
    strike.sort = Number.isFinite(Number(match.bandLow)) ? Number(match.bandLow)
      : Number.isFinite(Number(match.bandHigh)) ? Number(match.bandHigh)
        : strike.sort;
  }
}

function ensureWeatherStrikeModel(cityModel, label, sortValue = null) {
  const text = String(label || "Weather strike").trim();
  const key = text.toLowerCase();
  if (!cityModel.strikes.has(key)) {
    cityModel.strikes.set(key, {
      label: text,
      kalshi: "-",
      polymarket: "-",
      webull: "-",
      sort: Number.isFinite(Number(sortValue)) ? Number(sortValue) : 9999,
      timestamp: ""
    });
  }
  return cityModel.strikes.get(key);
}

function weatherCityModelSort(a, b) {
  const aFull = weatherCityFullMatchCount(a);
  const bFull = weatherCityFullMatchCount(b);
  if (aFull !== bFull) return bFull - aFull;
  const aExternal = weatherCityExternalMatchCount(a);
  const bExternal = weatherCityExternalMatchCount(b);
  if (aExternal !== bExternal) return bExternal - aExternal;
  return a.city.localeCompare(b.city);
}

function weatherCityFullMatchCount(city) {
  return [...city.strikes.values()].filter((row) => hasPrice(row.kalshi) && hasPrice(row.polymarket) && hasPrice(row.webull)).length;
}

function weatherCityExternalMatchCount(city) {
  return [...city.strikes.values()].filter((row) => hasPrice(row.polymarket) || hasPrice(row.webull)).length;
}

function hasPrice(value) {
  const text = String(value || "").trim();
  return Boolean(text && text !== "-");
}

function weatherSourcePriceText(match, key) {
  const prefix = key === "draftKings" ? "draftKings" : key;
  const bid = match[`${prefix}BestBid`] || match.sourceBestBid || "";
  const ask = match[`${prefix}BestAsk`] || match.sourceBestAsk || match[`${prefix}Yes`] || match.sourceYes || "";
  if (bid && ask) return `${bid}/${ask}`;
  return ask || bid || "-";
}

function weatherCityCardHtml(model) {
  const beacon = model.beacon || {};
  const temp = Number.isFinite(Number(beacon.temperatureF)) ? `${Number(beacon.temperatureF).toFixed(1)}F` : "--";
  const station = beacon.stationId || "station pending";
  const observed = beacon.observedAt ? shortTime(beacon.observedAt) : "time pending";
  const condition = beacon.status === "ok" ? (beacon.description || "live observation") : (beacon.error || "weather read pending");
  const forecast = weatherForecastText(beacon);
  const strikes = [...model.strikes.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
    .slice(0, 8);
  return `
    <article class="weather-city-card">
      <header class="weather-city-card-head">
        <div>
          <strong>${escapeHtml(model.city)}</strong>
          <small>${escapeHtml(station)} | ${escapeHtml(observed)}</small>
        </div>
        <b>${escapeHtml(temp)}</b>
      </header>
      <div class="weather-city-official">
        <span>Official</span>
        <b>${escapeHtml(condition)}</b>
      </div>
      <div class="weather-city-forecast">
        <span>Forecast</span>
        <b>${escapeHtml(forecast)}</b>
      </div>
      <div class="weather-city-table">
        <div class="weather-city-row weather-city-row-head">
          <span>Band</span>
          <span>Kalshi</span>
          <span>Polymarket</span>
          <span>Webull</span>
        </div>
        ${strikes.length ? strikes.map(weatherCityStrikeRowHtml).join("") : `<div class="empty compact-empty">Waiting for contract strikes.</div>`}
      </div>
    </article>
  `;
}

function weatherCityStrikeRowHtml(row) {
  return `
    <div class="weather-city-row">
      <span>${escapeHtml(row.label)}</span>
      <b>${escapeHtml(row.kalshi || "-")}</b>
      <b>${escapeHtml(row.polymarket || "-")}</b>
      <b>${escapeHtml(row.webull || "-")}</b>
    </div>
  `;
}

function weatherForecastText(beacon = {}) {
  const humidity = Number.isFinite(Number(beacon.humidityPct)) ? `RH ${Number(beacon.humidityPct).toFixed(0)}%` : "";
  const pieces = [beacon.description || "", humidity].filter(Boolean);
  return pieces.length ? pieces.join(" | ") : "forecast feed pending";
}

function weatherStrikeSortValue(row = {}) {
  if (Number.isFinite(Number(row.strike))) return Number(row.strike);
  const label = row.yesLabel || row.strikeText || "";
  const match = String(label).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 9999;
}

function sourceWaitingHtml(source, message) {
  return `
    <div class="scan-match-list source-empty">
      <div class="scan-source-label">${escapeHtml(source)}</div>
      <div class="scan-strike-row">
        <b>${escapeHtml(source)}</b>
        <span>${escapeHtml(message)}</span>
      </div>
    </div>
  `;
}

function scanStrikeLabel(card, row) {
  if (card.key !== "weather") return row.strikeText || "-";
  const place = row.city || weatherCityFromTicker(row.ticker) || row.ticker || "Weather";
  const threshold = row.yesLabel || weatherStrikeLabelFromTicker(row.ticker) || row.strikeText || "-";
  return `${place} ${threshold}`;
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
  const found = map.find(([code]) => new RegExp(`(?:HIGH|LOW|RAIN|SNOW)${code}\\b`).test(text));
  return found?.[1] || "";
}

function weatherStrikeLabelFromTicker(ticker = "") {
  return String(ticker || "").toUpperCase().match(/-([BT]\d+(?:\.\d+)?)$/)?.[1] || "";
}

function latestAuditLine() {
  const rows = Array.isArray(state.audit) ? state.audit : [];
  const found = [...rows].reverse().find((row) => /Weather Scanning|record/i.test(row.message || ""));
  return found ? found.message : "";
}

function strikeFromTicker(ticker = "") {
  const match = String(ticker).match(/-T(\d+(?:\.\d+)?)/);
  if (!match) return "";
  const value = Number(match[1]);
  return Number.isFinite(value) ? `$${Math.round(value).toLocaleString()}` : "";
}

function shortTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function expiryTimeLabel(value) {
  const date = new Date(value);
  if (Number.isFinite(date.getTime())) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const match = String(value || "").match(/(\d{1,2}:\d{2}:\d{2}\s*[AP]M\s*[A-Z]*)/i);
  return match ? match[1] : "waiting";
}

function bitcoinArbWatchHasConfirmedAnchor(arb) {
  const stageText = `${arb?.stage || ""} ${arb?.phase || ""} ${arb?.reason || ""}`.toLowerCase();
  if (stageText.includes("paired") || stageText.includes("held to expiration") || stageText.includes("complete")) return true;
  const recovery = arb?.recovery || null;
  if (!recovery || typeof recovery !== "object") return false;
  if (String(recovery.stage || "").toLowerCase() === "hedge") return true;
  return Boolean(recovery.anchorFilled || recovery.anchorTicker || recovery.filledAnchor || recovery.anchorFill);
}

function bitcoinArbCardHtml(arb) {
  const stage = arb.stage || arb.phase || "watching";
  const nearest = arb.nearestPair || null;
  const lower = arb.lower || nearest?.lower || {};
  const higher = arb.higher || nearest?.higher || {};
  const retry = arb.recovery || {};
  const currentCombo = Number.isFinite(Number(arb.combinedNowCents)) ? Number(arb.combinedNowCents)
    : Number.isFinite(Number(nearest?.combinedNowCents)) ? Number(nearest.combinedNowCents)
      : null;
  const targetCombo = Number.isFinite(Number(arb.combinedTargetCents)) ? Number(arb.combinedTargetCents)
    : Number.isFinite(Number(nearest?.combinedTargetCents)) ? Number(nearest.combinedTargetCents)
      : 80;
  const attempts = Number.isFinite(Number(retry.attempts)) ? Number(retry.attempts) : 0;
  const score = Number.isFinite(Number(arb.score)) ? `EV/vol ${fmt(Number(arb.score))}` : "EV/vol scanning";
  const anchorAsk = Number.isFinite(Number(higher.noAsk)) ? Number(higher.noAsk) : null;
  const arbAsk = Number.isFinite(Number(lower.yesAsk)) ? Number(lower.yesAsk) : null;
  const arbTarget = Number.isFinite(Number(arb.hedgeTargetCents)) ? Number(arb.hedgeTargetCents)
    : Number.isFinite(Number(nearest?.hedgeTargetCents)) ? Number(nearest.hedgeTargetCents)
      : null;
  const hasPair = Boolean(higher.ticker || lower.ticker || anchorAsk != null || arbAsk != null || arbTarget != null);
  const btcRef = Number.isFinite(Number(arb.btcReferencePrice)) ? `$${Math.round(Number(arb.btcReferencePrice)).toLocaleString()}` : "reading BTC ladder";
  const closestText = hasPair
    ? `${lower.strikeLabel || "lower"} YES ${cents(arbAsk)} / ${higher.strikeLabel || "higher"} NO ${cents(anchorAsk)}`
    : "waiting for nearest cross-strike line";
  const planText = anchorAsk != null && arbTarget != null
    ? `${cents(anchorAsk)} higher NO + ${cents(arbTarget)} lower YES target = ${cents(anchorAsk + arbTarget)}`
    : "waiting for cross-strike prices";
  const liveText = anchorAsk != null && arbAsk != null
    ? `${cents(anchorAsk)} anchor + ${cents(arbAsk)} live ask = ${cents(anchorAsk + arbAsk)}`
    : "waiting for live cross-strike quotes";
  const retryText = attempts
    ? `${score} | scanner attempts ${fmt(attempts)}`
    : `${score} | no scanner attempts yet`;
  const legHtml = hasPair ? `
      <div class="arb-leg-list">
        <div class="arb-leg">
          <b>HIGHER NO ${escapeHtml(higher.strikeLabel || higher.ticker || "higher strike")}</b>
          <span>${escapeHtml(higher.ticker || "")}</span>
          <em>ask ${cents(anchorAsk)} | higher strike first</em>
        </div>
        <div class="arb-leg ${retry.stage === "hedge" ? "missing" : ""}">
          <b>LOWER YES ${escapeHtml(lower.strikeLabel || lower.ticker || "lower strike")}</b>
          <span>${escapeHtml(lower.ticker || "")}</span>
          <em>target ${cents(arbTarget)} | live ask ${cents(arbAsk)} | attempts ${fmt(attempts)}</em>
        </div>
      </div>` : `
      <div class="btc-arb-empty">Waiting for a valid lower-YES / higher-NO cross-strike read.</div>`;
  return `
    <div class="scan-simple-card btc-simple-card btc-arb-card">
      <div class="scan-simple-main">
        <strong>BTC CROSS-STRIKE SCAN</strong>
        <span>${escapeHtml(arb.expiresAt ? `exp ${new Date(arb.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "exp -")}</span>
      </div>
      <div class="scan-simple-strike">
        <b>${escapeHtml(stage)}</b>
        <span>${escapeHtml(currentCombo != null ? `${cents(currentCombo)} now / ${cents(targetCombo)} target` : `${cents(targetCombo)} target combo`)}</span>
        <small>${escapeHtml(scannerCopy(arb.reason || "Lower YES + higher NO only; never same strike."))}</small>
      </div>
      <div class="btc-arb-lines">
        <div><b>BTC</b><span>${escapeHtml(btcRef)}</span></div>
        <div><b>Closest</b><span>${escapeHtml(closestText)}</span></div>
        <div><b>Rules</b><span>higher NO 35-40c | $100-lower YES around 40c | max combo ${cents(targetCombo)}</span></div>
        <div><b>Plan</b><span>${escapeHtml(planText)}</span></div>
        <div><b>Live</b><span>${escapeHtml(liveText)}</span></div>
        <div><b>Scanner</b><span>${escapeHtml(retryText)}</span></div>
      </div>
      ${legHtml}
    </div>
  `;
}

function scannerCopy(text) {
  return String(text || "")
    .replace(/\barb\b/gi, "scan")
    .replace(/\barbitrage\b/gi, "scan")
    .replace(/\bIOC\b/g, "target")
    .replace(/\bbuy\b/gi, "watch");
}

function strongestBitcoinBookRow(rows) {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const distance = btcNearMoneyDistance(a) - btcNearMoneyDistance(b);
    if (distance !== 0) return distance;
    return btcWallStrength(b) - btcWallStrength(a);
  })[0] || rows[0];
}

function btcNearMoneyDistance(row) {
  const sides = row?.sides || [];
  const prices = sides
    .map((side) => Number(side.entry))
    .filter((price) => Number.isFinite(price));
  if (!prices.length) return 999;
  return Math.min(...prices.map((price) => Math.abs(price - 50)));
}

function btcWallStrength(row) {
  const summary = row?.bookWallSummary || bestScanSide(row)?.bookWallSummary || null;
  if (!summary) return 0;
  return Math.max(
    Number(summary.yesLowBuy?.quantity || 0),
    Number(summary.noLowBuy?.quantity || 0),
    Number(summary.yesHighSell?.quantity || 0),
    Number(summary.noHighSell?.quantity || 0),
    Number(summary.yesLowBuyTotal || 0),
    Number(summary.noLowBuyTotal || 0),
    Number(summary.yesHighSellTotal || 0),
    Number(summary.noHighSellTotal || 0),
    stackStrength(summary.yesLowBuyStack),
    stackStrength(summary.noLowBuyStack),
    stackStrength(summary.yesHighSellStack),
    stackStrength(summary.noHighSellStack)
  );
}

function stackStrength(stack) {
  return (stack || []).reduce((sum, level) => sum + Number(level.quantity || 0), 0);
}

function btcYesNoPriceLabel(row) {
  if (!row) return "";
  const sides = row.sides || [];
  const yes = sides.find((side) => side.side === "YES");
  const no = sides.find((side) => side.side === "NO");
  const yesLabel = yes?.entry != null ? cents(yes.entry) : "-";
  const noLabel = no?.entry != null ? cents(no.entry) : "-";
  return `Y ${yesLabel} / N ${noLabel}`;
}

function formatBookWallSummary(summary) {
  if (!summary) return "";
  const side = summary.side ? `shove ${summary.side}` : "mixed";
  const yes = summary.yesLowBuy?.price != null ? `YES buy ${fmt(summary.yesLowBuy.price)}c x ${compactNumber(summary.yesLowBuy.quantity)}` : "";
  const no = summary.noLowBuy?.price != null ? `NO buy ${fmt(summary.noLowBuy.price)}c x ${compactNumber(summary.noLowBuy.quantity)}` : "";
  const yesSell = summary.yesHighSell?.price != null ? `YES sell ${fmt(summary.yesHighSell.price)}c x ${compactNumber(summary.yesHighSell.quantity)}` : "";
  const noSell = summary.noHighSell?.price != null ? `NO sell ${fmt(summary.noHighSell.price)}c x ${compactNumber(summary.noHighSell.quantity)}` : "";
  return [side, yes, no, yesSell, noSell].filter(Boolean).join(" | ");
}

function compactBookDecision(summary) {
  const side = String(summary?.side || "").toUpperCase();
  if (side === "YES") return { text: "YES skew", cls: "tech-buy" };
  if (side === "NO") return { text: "NO skew", cls: "tech-sell" };
  return { text: "monitor", cls: "tech-waiting" };
}

function bookWallHtml(summary) {
  const levels = bookWallLevels(summary);
  if (!levels.length) {
    return `<div class="book-wall-strip empty-wall">No abnormal wall locked yet</div>`;
  }
  const read = String(summary?.side || "").toUpperCase();
  const readText = read === "YES" ? "GOLD READ: BUY YES" : read === "NO" ? "TRASH READ: BUY NO" : "READ: WAIT";
  return `
    <div class="book-wall-strip">
      <div class="book-read ${read ? "hot" : ""} ${read === "YES" ? "gold" : read === "NO" ? "trash" : ""}">${escapeHtml(readText)}</div>
      ${nearSpreadHtml(summary)}
      ${levels.map((level) => `
        <span class="book-wall ${level.hot ? "hot" : ""} ${level.kind || ""}">
          <b><span class="book-symbol">${escapeHtml(level.symbol)}</span>${escapeHtml(level.label)}</b>
          <em>${escapeHtml(level.price)}</em>
          <strong>${escapeHtml(level.quantity)}</strong>
        </span>
      `).join("")}
      ${bookStackHtml(summary)}
    </div>
  `;
}

function nearSpreadHtml(summary) {
  const near = summary?.nearSpread;
  if (!near) return "";
  const side = String(near.side || "").toUpperCase();
  const cls = side === "YES" ? "gold" : side === "NO" ? "trash" : "";
  const label = side ? `NEAR READ: BUY ${side}` : "NEAR READ: WAIT";
  const yes = `Y ${compactNumber(near.yesSupport)} bid / ${compactNumber(near.yesResistance)} ask`;
  const no = `N ${compactNumber(near.noSupport)} bid / ${compactNumber(near.noResistance)} ask`;
  return `
    <div class="book-near-read ${cls}">
      <b>${escapeHtml(label)}</b>
      <span>${escapeHtml(yes)}</span>
      <span>${escapeHtml(no)}</span>
    </div>
  `;
}

function bookWallLevels(summary) {
  if (!summary) return [];
  const hotSide = String(summary.side || "").toUpperCase();
  const goldWallTotal = summary.yesHighSellStackTotal ?? stackStrength(summary.yesHighSellStack);
  const trashWallTotal = summary.yesLowBuyStackTotal ?? stackStrength(summary.yesLowBuyStack);
  const levels = [
    { key: "yesHighSell", label: "gold peak", symbol: "🪙", kind: "gold", level: summary.yesHighSell, pct: summary.yesHighSellPeakPct, hot: hotSide === "YES" },
    { label: "GOLD pull", symbol: "🪙", kind: "gold", price: "85-99c", quantity: summary.yesHighSellTotal, pct: summary.yesHighSellPct, flashQuantity: summary.flash?.peakGoldPullTotal, flashPct: summary.flash?.peakGoldPullPct, hot: hotSide === "YES" },
    { label: "GOLD wall", symbol: "🪙", kind: "gold", price: formatBookStack(summary.yesHighSellStack), quantity: goldWallTotal, pct: summary.yesHighSellStackPct, flashQuantity: summary.flash?.peakGoldWallTotal, flashPct: summary.flash?.peakGoldWallPct, hot: hotSide === "YES" },
    { label: "TRASH wall", symbol: "🗑", kind: "trash", price: formatBookStack(summary.yesLowBuyStack), quantity: trashWallTotal, pct: summary.yesLowBuyStackPct, flashQuantity: summary.flash?.peakTrashWallTotal, flashPct: summary.flash?.peakTrashWallPct, hot: hotSide === "NO" },
    { label: "TRASH pull", symbol: "🗑", kind: "trash", price: "1-5c", quantity: summary.yesLowBuyTotal, pct: summary.yesLowBuyPct, flashQuantity: summary.flash?.peakTrashPullTotal, flashPct: summary.flash?.peakTrashPullPct, hot: hotSide === "NO" },
    { key: "yesLowBuy", label: "trash peak", symbol: "🗑", kind: "trash", level: summary.yesLowBuy, pct: summary.yesLowBuyPeakPct, hot: hotSide === "NO" }
  ];
  return levels
    .filter((item) => (item.level?.price != null && Number(item.level.quantity || 0) > 0) || Number(item.quantity || 0) > 0)
    .map((item) => ({
      label: item.label,
      symbol: item.symbol,
      kind: item.kind,
      price: bookWallRangeLabel(item, summary),
      quantity: bookWallQuantityLabel(item, summary),
      hot: item.hot
    }));
}
function bookWallRangeLabel(item, summary) {
  if (item.level?.price != null) return `${fmt(item.level.price)}c`;
  const isGold = /^GOLD/i.test(item.label || "");
  const flashQuantity = isGold ? summary?.flash?.peakGoldPullTotal : summary?.flash?.peakTrashPullTotal;
  const flashPct = isGold ? summary?.flash?.peakGoldPullPct : summary?.flash?.peakTrashPullPct;
  const flash = Number(flashQuantity || 0) > Number(item.quantity || 0)
    ? ` | 5s ${compactNumber(flashQuantity)}${Number(flashPct || 0) ? ` ${fmt(flashPct)}%` : ""}`
    : "";
  return `${item.price}${flash}`;
}

function bookWallQuantityLabel(item, summary) {
  const quantity = compactNumber(item.level?.quantity ?? item.quantity);
  const isGold = /^GOLD|^gold/i.test(item.label || "");
  const pct = item.pct ?? (item.level ? null : (isGold ? summary?.yesHighSellPct : summary?.yesLowBuyPct));
  return Number(pct || 0) ? `${quantity} | ${fmt(pct)}%` : quantity;
}

function bookStackHtml(summary) {
  return "";
}
function formatBookStack(stack) {
  return (stack || [])
    .filter((level) => Number(level.quantity || 0) > 0)
    .slice(0, 6)
    .map((level) => `${fmt(level.price)}c ${compactNumber(level.quantity)}`)
    .join(" | ");
}

function compactNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  if (num >= 1_000_000) return `${Math.round(num / 1_000_000)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return `${Math.round(num)}`;
}

function preparedBitcoinRows(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = row.ticker || row.event || row.market;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= 5) break;
  }
  return unique;
}

function bitcoinPrepChipHtml(row) {
  const side = bestScanSide(row);
  const ready = side?.decision === "candidate" || /\b(ready|qualifies)\b/i.test(side?.reason || "");
  return `<span class="prep-chip ${ready ? "ready" : ""}">${escapeHtml(row.event || row.ticker || "BTC")} ${side?.entry != null ? `${cents(side.entry)}` : ""}</span>`;
}

function btcTechPill(label, frame = {}) {
  const value = frame?.summaryBias || frame?.bias || "neutral";
  return `<span class="tech-pill ${techClass(value)}" title="${escapeHtml(formatTechVote(value))}">${label}</span>`;
}

function techClass(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("buy")) return "tech-buy";
  if (text.includes("sell")) return "tech-sell";
  if (text.includes("neutral")) return "tech-neutral";
  return "tech-waiting";
}

function statusClass(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("ready")) return "ready";
  if (text.includes("too late") || text.includes("off")) return "blocked";
  return "waiting";
}

function scanShortReason(value) {
  const text = String(value || "");
  if (/inside final|no-entry/i.test(text)) return "Too late";
  if (/blackout/i.test(text)) return "Blackout";
  if (/outside|below|above|blocked/i.test(text)) return "Blocked";
  if (/ready|qualif/i.test(text)) return "Ready";
  return "Watching";
}

function otherStableScanCardHtml(rows) {
  heldOtherLeader = null;
  return "";
}

function sportsArbStableCardHtml() {
  const recovery = state.paper?.sportsArbRecovery || null;
  if (recovery?.eventKey && !sportsArbRecoveryHasConfirmedLeg(recovery)) return sportsArbRecoveryCardHtml(recovery);
  const watch = state.sportsArbWatch || null;
  const latest = watch || state.sportsArbCandidates?.[0] || null;
  const legs = latest?.legs || [];
  const title = latest ? sportsArbLockTitle(latest, legs) : "MLB Scanning";
  const phase = displayArbPhase(latest?.phase || latest?.mode || "waiting");
  const combined = latest?.combinedAskCents != null ? `${cents(latest.combinedAskCents)} combined` : "asks waiting";
  const edge = latest?.edgeCents ?? latest?.estimatedEdgeCents;
  const lockStamp = latest?.lockedAt ? `lock ${new Date(latest.lockedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "MLB live";
  return `
    <div class="scan-simple-card arb-simple-card">
      <div class="scan-simple-main">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(lockStamp)}</span>
      </div>
      <div class="scan-simple-strike">
        <b>MLB SCANNING</b>
        <span>${escapeHtml(phase)}</span>
        <small>${escapeHtml(combined)}${edge != null ? ` | edge ${fmt(edge)}c` : ""}</small>
      </div>
      <div class="arb-leg-list">
        ${legs.length ? legs.map((leg) => `
          <div class="arb-leg">
            <b>${escapeHtml(leg.side || "YES")} ${escapeHtml(arbLegDisplayName(leg))}</b>
            <span>${escapeHtml(sportsArbLegContext(leg, latest))}</span>
            <em>Ask ${cents(leg.ask)} | size ${compactNumber(leg.askSize)}</em>
          </div>
        `).join("") : `<div class="empty">Scanning live MLB for paired asks.</div>`}
      </div>
    </div>
  `;
}

function sportsArbRecoveryHasConfirmedLeg(recovery) {
  if (!recovery || typeof recovery !== "object") return false;
  if (String(recovery.stage || "").toLowerCase() === "hedge") return true;
  return Array.isArray(recovery.filled) && recovery.filled.length > 0;
}

function spArbStableCardHtml() {
  const watch = state.spArbWatch || null;
  const phase = displayArbPhase(watch?.phase || "waiting");
  const title = watch?.eventLabel || watch?.title || "S&P Hourly";
  const exp = watch?.expiresAt ? `exp ${new Date(watch.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "finance";
  const current = watch?.current || null;
  const closest = watch?.closest || null;
  const anchor = closest?.anchor || null;
  const lower = closest?.lower || null;
  const ruleText = watch?.reason || "S&P hourly monitor is separate from BTC and sports.";
  const priceLine = current
    ? `Y ${cents(current.yesAsk)} ask / ${cents(current.yesBid)} bid | N ${cents(current.noAsk)} ask / ${cents(current.noBid)} bid`
    : "quotes waiting";
  const strike = current?.strikeLabel || watch?.strikeLabel || "waiting for S&P hourly strike";
  const referenceLine = watch?.spReferencePrice
    ? `S&P zone ${Number(watch.spReferencePrice).toLocaleString()}`
    : "S&P zone reading";
  const closestLine = anchor && lower
    ? `Anchor ${escapeHtml(anchor.strikeLabel || "upper strike")} NO ${cents(anchor.noAsk)} ask / ${cents(anchor.noBid)} bid`
    : "Anchor NO 40c candidate waiting";
  const lowerLine = anchor && lower
    ? `Arb ${escapeHtml(lower.strikeLabel || "lower strike")} YES ${cents(lower.yesAsk)} ask / ${cents(lower.yesBid)} bid`
    : "Lower YES companion waiting";
  const comboLine = closest?.combinedNowCents != null
    ? `live combo ${cents(closest.combinedNowCents)}`
    : "live combo waiting";
  return `
    <div class="scan-simple-card sp-simple-card">
      <div class="scan-simple-main">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(exp)}</span>
      </div>
      <div class="scan-simple-strike">
        <b>S&amp;P SCANNING</b>
        <span>${escapeHtml(phase)}</span>
        <small>${escapeHtml(ruleText)}</small>
      </div>
      <div class="arb-leg-list">
        <div class="arb-leg">
          <b>${escapeHtml(strike)}</b>
          <span>${escapeHtml(priceLine)}</span>
          <em>${escapeHtml(referenceLine)} | ${laneSettings.enableSpArb ? "monitor armed" : "S&P lane off"}</em>
        </div>
        <div class="arb-leg">
          <b>Closest upper NO to 40c</b>
          <span>${closestLine}</span>
          <em>${escapeHtml(comboLine)}</em>
        </div>
        <div class="arb-leg">
          <b>Adjacent lower YES</b>
          <span>${lowerLine}</span>
          <em>${closest?.anchorDistance != null && closest.anchorDistance < 999 ? `NO distance ${fmt(closest.anchorDistance)}c from 40c` : "distance waiting"}</em>
        </div>
      </div>
    </div>
  `;
}

function displayArbPhase(value) {
  const text = String(value || "waiting").replace(/_/g, " ").toLowerCase();
  if (text.includes("execution")) return "entry window";
  if (text.includes("awaiting")) return "locked, waiting on asks";
  if (text.includes("watch")) return "locked";
  if (text.includes("retry")) return "retrying IOC";
  if (text.includes("blocked")) return "blocked";
  if (text.includes("locked")) return "locked";
  if (text.includes("scan")) return "scanning MLB";
  return text || "waiting";
}

function arbLegDisplayName(leg) {
  const label = cleanTitle(leg?.label || leg?.selectionLabel || leg?.marketTitle || "");
  if (label && !looksLikeTicker(label)) return label;
  const suffix = String(leg?.ticker || "").split("-").pop() || "";
  return cleanTickerSuffix(suffix) || label || "Leg";
}

function sportsArbLockTitle(latest, legs = []) {
  const names = uniqueReadableLabels((legs || []).map(arbLegDisplayName));
  if (names.length >= 2) return `${names[0]} vs ${names[1]}`;
  if (names.length === 1) return names[0];
  const eventTitle = cleanTitle(latest?.eventTitle || latest?.title || latest?.marketTitle || latest?.subtitle || "");
  if (eventTitle && !looksLikeTicker(eventTitle)) return eventTitle;
  return "Sports arb candidate";
}

function sportsArbLegContext(leg, latest = null) {
  const eventTitle = cleanTitle(leg?.eventTitle || leg?.subtitle || latest?.eventTitle || latest?.marketTitle || "");
  if (eventTitle && !looksLikeTicker(eventTitle) && eventTitle !== arbLegDisplayName(leg)) return eventTitle;
  return "arb leg";
}

function uniqueReadableLabels(labels = []) {
  const names = [];
  labels.forEach((raw) => {
    const name = cleanTitle(raw);
    if (!name || name === "Leg" || looksLikeTicker(name)) return;
    if (names.some((existing) => existing.toLowerCase() === name.toLowerCase())) return;
    names.push(name);
  });
  return names;
}

function sportsArbRecoveryCardHtml(recovery) {
  const legs = sportsArbRecoveryLegs(recovery, state.paper || {});
  const openLegs = legs.filter((leg) => !leg.arbMissingLeg);
  const confirmedLegs = legs.filter((leg) => !leg.arbMissingLeg && (
    leg.status === "OPEN" || leg.executionStatus === "ARB_HELD_TO_EXPIRATION" || leg.executionStatus === "OPEN"
  ));
  const missing = legs.filter((leg) => leg.arbMissingLeg);
  const hasConfirmedLeg = confirmedLegs.length > 0 || (Array.isArray(recovery?.filled) && recovery.filled.length > 0);
  const stage = String(recovery?.stage || "").toLowerCase();
  const isHedgeStage = hasConfirmedLeg || stage === "hedge";
  const statusTitle = isHedgeStage ? "ARB LEG LIVE" : "ARB ENTRY RETRY";
  const statusText = isHedgeStage ? "arb leg retry active" : "no leg confirmed yet";
  const retryText = isHedgeStage ? "IOC arb leg retry active" : "IOC first-leg retry active";
  const retryPrice = recovery.retryPriceCents != null ? cents(recovery.retryPriceCents) : "-";
  const executableAsk = recovery.currentExecutableAskCents != null ? cents(recovery.currentExecutableAskCents) : "-";
  const executableBid = recovery.currentExecutableBidCents != null ? cents(recovery.currentExecutableBidCents) : "-";
  const fillableText = recovery.currentExecutableAskCents != null && recovery.retryPriceCents != null
    ? (Number(recovery.currentExecutableAskCents) <= Number(recovery.retryPriceCents) ? "fillable now" : "not fillable")
    : "quote pending";
  const retrySelection = recovery.retrySelection || missing[0]?.selectionLabel || missing[0]?.ticker || "missing leg";
  const emptyText = isHedgeStage
    ? "Filled leg is being reconciled from Kalshi."
    : "No arb leg is confirmed filled. Retrying first leg only.";
  const retryPrefix = isHedgeStage ? "RETRY IOC ARB LEG" : "RETRY IOC FIRST LEG";
  const attempts = Number(recovery.attempts || 0);
  const lastAttempt = recovery.lastAttemptAt
    ? new Date(recovery.lastAttemptAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : "arming";
  return `
    <div class="scan-simple-card arb-simple-card arb-recovery-card">
      <div class="scan-simple-main">
        <strong>${escapeHtml(sportsArbLockTitle(recovery, openLegs.length ? openLegs : missing))}</strong>
        <span>${escapeHtml(lastAttempt)}</span>
      </div>
      <div class="scan-simple-strike">
        <b>${escapeHtml(statusTitle)}</b>
        <span>${escapeHtml(statusText)}</span>
        <small>${escapeHtml(retryText)} | ${escapeHtml(retrySelection)} @ ${retryPrice} | ask ${executableAsk} / bid ${executableBid} | ${escapeHtml(fillableText)} | attempts ${fmt(attempts)}</small>
      </div>
      <div class="arb-leg-list">
        ${confirmedLegs.length ? confirmedLegs.map((leg) => `
          <div class="arb-leg">
            <b>FILLED ${escapeHtml(leg.side || "YES")} ${escapeHtml(formatBetName(leg))}</b>
            <span>${escapeHtml(sportsArbLegContext(leg, recovery))}</span>
            <em>${fmt(leg.contracts || 0)} contracts @ ${cents(leg.entryPriceCents)} | hold to expiration</em>
          </div>
        `).join("") : `<div class="empty">${escapeHtml(emptyText)}</div>`}
        ${missing.length ? missing.map((leg) => `
          <div class="arb-leg missing">
            <b>${escapeHtml(retryPrefix)} ${escapeHtml(leg.side || "YES")} ${escapeHtml(legSelectionName(leg))}</b>
            <span>${escapeHtml(sportsArbLegContext(leg, recovery))}</span>
            <em>${fmt(leg.contracts || 0)} contracts @ ${cents(leg.entryPriceCents || recovery.retryPriceCents)} | ask ${executableAsk} / bid ${executableBid} | attempts ${fmt(attempts)}</em>
          </div>
        `).join("") : `<div class="arb-leg"><b>ARB COMPLETE</b><span>Both legs confirmed.</span><em>Held to expiration.</em></div>`}
      </div>
    </div>
  `;
}

function sportsArbRecoveryLegs(recovery, paper = {}) {
  const eventKey = String(recovery?.eventKey || "");
  const exposureKey = `SPORTS_ARB:${eventKey}`.toUpperCase();
  const stage = String(recovery?.stage || "").toLowerCase();
  const retryStatus = stage === "hedge" ? "HEDGE RETRY" : "ANCHOR RETRY";
  const retrySummary = stage === "hedge" ? "Retrying IOC arb leg" : "Retrying first IOC leg";
  const missingTickers = new Set((Array.isArray(recovery?.missing) ? recovery.missing : [])
    .map((ticker) => String(ticker || "").toUpperCase())
    .filter(Boolean));
  const trades = (paper.trades || []).filter((trade) => {
    const ticker = String(trade.ticker || "").toUpperCase();
    return String(trade.exposureKey || "").toUpperCase() === exposureKey || missingTickers.has(ticker);
  });
  const retryContracts = Number(recovery?.contracts || recovery?.count || recovery?.targetContracts || 0);
  const rows = [];
  for (const trade of trades) {
    const ticker = String(trade.ticker || "").toUpperCase();
    const isMissing = missingTickers.has(ticker) && !["OPEN", "SUBMITTING"].includes(trade.status);
    if (!isMissing && !["OPEN", "SUBMITTING"].includes(trade.status)) continue;
    rows.push({
      ...trade,
      status: isMissing ? "SUBMITTING" : trade.status,
      executionStatus: isMissing ? retryStatus : trade.status,
      qualifies: true,
      recommendation: trade.recommendation || `BUY ${trade.side || "YES"}`,
      currentBuyPriceCents: trade.entryPriceCents,
      recommendedContracts: trade.contracts,
      arbMissingLeg: isMissing,
      arbRecoveryLeg: true,
      retryAttempts: Number(recovery?.attempts || 0),
      retryLastAttemptAt: recovery?.lastAttemptAt || null,
      currentExecutableAskCents: recovery?.currentExecutableAskCents ?? null,
      currentExecutableBidCents: recovery?.currentExecutableBidCents ?? null,
      reasonSummary: isMissing
        ? `Retrying IOC ${fmt(trade.contracts || 0)} contracts @ ${cents(trade.entryPriceCents)}`
        : stage === "hedge" ? "Anchor leg filled; waiting for arb leg" : "First arb leg is not confirmed filled yet"
    });
    missingTickers.delete(ticker);
  }
  for (const ticker of missingTickers) {
    rows.push({
      id: "",
      ticker,
      exposureKey,
      status: "SUBMITTING",
      executionStatus: retryStatus,
      side: "YES",
      recommendation: "BUY YES",
      selectionLabel: cleanTickerSuffix(String(ticker).split("-").pop()) || "Missing leg",
      contracts: retryContracts,
      entryPriceCents: null,
      currentBuyPriceCents: null,
      recommendedContracts: retryContracts,
      arbHoldToExpiration: true,
      strategyType: "SPORTS_PAIR_ARB_HOLD",
      arbMissingLeg: true,
      arbRecoveryLeg: true,
      retryAttempts: Number(recovery?.attempts || 0),
      retryLastAttemptAt: recovery?.lastAttemptAt || null,
      currentExecutableAskCents: recovery?.currentExecutableAskCents ?? null,
      currentExecutableBidCents: recovery?.currentExecutableBidCents ?? null,
      reasonSummary: retrySummary
    });
  }
  if (!rows.length && recovery?.eventKey) {
    rows.push({
      id: "",
      ticker: recovery.hedge || recovery.anchor || recovery.eventKey,
      exposureKey,
      status: "SUBMITTING",
      executionStatus: retryStatus,
      side: recovery.retrySide || "YES",
      recommendation: `BUY ${recovery.retrySide || "YES"}`,
      selectionLabel: recovery.retrySelection || cleanTickerSuffix(String(recovery.hedge || recovery.anchor || "").split("-").pop()) || "Arb leg",
      marketTitle: recovery.eventKey,
      subtitle: recovery.eventKey,
      contracts: 0,
      entryPriceCents: recovery.retryPriceCents || null,
      currentBuyPriceCents: recovery.retryPriceCents || null,
      recommendedContracts: 0,
      arbHoldToExpiration: true,
      strategyType: "SPORTS_PAIR_ARB_HOLD",
      arbMissingLeg: true,
      arbRecoveryLeg: true,
      retryAttempts: Number(recovery?.attempts || 0),
      retryLastAttemptAt: recovery?.lastAttemptAt || null,
      currentExecutableAskCents: recovery?.currentExecutableAskCents ?? null,
      currentExecutableBidCents: recovery?.currentExecutableBidCents ?? null,
      reasonSummary: `${retrySummary}; waiting for Kalshi fill confirmation`
    });
  }
  return rows;
}

function updateHeldOtherLeader(rows) {
  const candidates = rows
    .filter((row) => isLiveOtherCandidate(row))
    .map((row) => ({ row, score: otherVolatilityScore(row) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0]?.row || null;
  const now = Date.now();
  if (!best) {
    if (heldOtherLeader && now - heldOtherLeaderAt < OTHER_LEADER_HOLD_MS) return;
    heldOtherLeader = null;
    heldOtherLeaderAt = 0;
    return;
  }
  if (!heldOtherLeader || heldOtherLeader.ticker === best.ticker) {
    heldOtherLeader = best;
    if (!heldOtherLeaderAt) heldOtherLeaderAt = now;
    return;
  }
  const heldScore = otherVolatilityScore(heldOtherLeader);
  const heldExpired = now - heldOtherLeaderAt >= OTHER_LEADER_HOLD_MS;
  if (heldExpired || otherVolatilityScore(best) > heldScore) {
    heldOtherLeader = best;
    heldOtherLeaderAt = now;
  }
}

function isLiveOtherCandidate(row) {
  const decision = Date.parse(row.decision_time || row.close_time || "");
  if (Number.isFinite(decision) && decision < Date.now()) return false;
  const text = `${row.market || ""} ${row.event || ""} ${row.ticker || ""}`.toLowerCase();
  if (/futures|draft|award|season|series winner|championship/.test(text)) return false;
  if (!bestEligibleOtherSide(row)) return false;
  return true;
}

function otherVolatilityScore(row) {
  return Math.max(0, ...(row.sides || []).filter((side) => isEligibleOtherSide(side)).map((side) => Number(side.volatility ?? side.touch ?? side.netProfit ?? 0)).filter(Number.isFinite));
}

function bestEligibleOtherSide(row) {
  return (row.sides || [])
    .filter((side) => isEligibleOtherSide(side))
    .sort((a, b) => Number(b.volatility ?? b.touch ?? b.netProfit ?? 0) - Number(a.volatility ?? a.touch ?? a.netProfit ?? 0))[0] || null;
}

function isEligibleOtherSide(side) {
  const spread = Number(side?.spread ?? 99);
  if (Number.isFinite(spread) && spread > OTHER_LEADER_MAX_SPREAD_CENTS) return false;
  const range = Number(side?.range || 0);
  const recent = Number(side?.recentAmplitude || 0);
  const turns = Number(side?.turns || 0);
  const movementOk = range >= OTHER_LEADER_MIN_RANGE_CENTS || (recent >= OTHER_LEADER_MIN_RECENT_AMPLITUDE_CENTS && turns >= OTHER_LEADER_MIN_DIRECTION_CHANGES);
  if (!movementOk) return false;
  const activity = Math.max(
    Number(side?.volume_24h || 0),
    Number(side?.volume || 0),
    Number(side?.openInterest || 0),
    Number(side?.liquidity || 0)
  );
  return Number.isFinite(activity) && activity >= OTHER_LEADER_MIN_ACTIVITY;
}

function bitcoinVisualScanRowHtml(row) {
  const side = bestScanSide(row);
  const decision = Date.parse(row.decision_time || row.close_time || "");
  const cutoff = Number.isFinite(decision) ? decision - 10 * 60 * 1000 : NaN;
  const expiryMins = Number.isFinite(decision) ? Math.ceil((decision - Date.now()) / 60_000) : null;
  const cutoffMins = Number.isFinite(cutoff) ? Math.ceil((cutoff - Date.now()) / 60_000) : null;
  const hourly = isCurrentBitcoinHourlyRow(row);
  const qualified = side?.decision === "candidate" || /\b(ready|qualifies)\b/i.test(side?.reason || "");
  const statusLabel = qualified ? "Ready" : btcWaitingLabel(side?.reason || "");
  return `
    <div class="visual-scan-row btc-visual ${qualified ? "qualified" : "waiting"} ${hourly ? "" : "warning"}">
      <time>${new Date(row.time).toLocaleTimeString()}</time>
      <strong>Bitcoin ${hourly ? "1hr" : "daily / not hourly"}</strong>
      <span>exp ${Number.isFinite(decision) ? new Date(decision).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-"}${expiryMins == null ? "" : ` (${Math.max(0, expiryMins)}m left)`}</span>
      <span>${hourly ? formatCutoffLine(cutoff, cutoffMins) : "warning: outside current hourly window"}</span>
      <span>strike ${escapeHtml(row.event || row.market || row.ticker || "-")}</span>
      <span>${escapeHtml(formatBtcTechnicals(row.btcTechnicalBias))}</span>
      ${side?.entry != null ? `<span>${escapeHtml(side.side || "-")} ${cents(side.entry)} -> ${side.target != null ? cents(side.target) : "-"}</span>` : ""}
      <b>${escapeHtml(statusLabel)}</b>
      ${!qualified ? `<em>${escapeHtml(shortBlockReason(side?.reason || "No block reason returned."))}</em>` : ""}
    </div>
  `;
}

function btcWaitingLabel(reason) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("off")) return "Off";
  if (text.includes("cannot read bitcoin price") || text.includes("cooling down") || text.includes("429")) return "Waiting for price";
  if (text.includes("neutral") || text.includes("unavailable")) return "Waiting for signal";
  if (text.includes("no-entry") || text.includes("final")) return "Too late";
  return "Waiting";
}

function isVisualScanCurrent(row, bitcoin) {
  const decision = Date.parse(row.decision_time || row.close_time || "");
  if (!Number.isFinite(decision)) return true;
  const cutoff = bitcoin ? decision - 10 * 60 * 1000 : decision;
  return cutoff > Date.now();
}

function isCurrentBitcoinHourlyRow(row) {
  if (isBtcStatusRow(row)) return true;
  const decision = Date.parse(row.decision_time || row.close_time || "");
  if (!Number.isFinite(decision)) return false;
  const minutes = (decision - Date.now()) / 60_000;
  return minutes > -10 && minutes <= 70;
}

function isBtcStatusRow(row) {
  return (row.sides || []).some((side) => side.strategyType === "BTC_STATUS");
}

function formatCutoffLine(cutoff, cutoffMins) {
  if (!Number.isFinite(cutoff)) return "new-entry stop -";
  if (cutoff <= Date.now()) return `new entries stopped at ${new Date(cutoff).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return `new entries stop ${new Date(cutoff).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (${Math.max(0, cutoffMins)}m until stop)`;
}

function compactVisualScanRowHtml(row) {
  const side = bestScanSide(row);
  const decision = Date.parse(row.decision_time || row.close_time || "");
  const cutoffMins = Number.isFinite(decision) ? Math.round((decision - Date.now()) / 60_000) : null;
  const qualified = side?.decision === "candidate" || /\b(ready|qualifies)\b/i.test(side?.reason || "");
  const label = compactSportsLabel(row);
  const detail = compactSportsDetail(row, decision, cutoffMins);
  return `
    <div class="visual-scan-row ${qualified ? "qualified" : "waiting"}">
      <time>${new Date(row.time).toLocaleTimeString()}</time>
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(detail)}</span>
      ${qualified ? `<span>${escapeHtml(side?.side || "-")} ${side?.entry != null ? `${cents(side.entry)} -> ${side.target != null ? cents(side.target) : "-"}` : ""}</span>` : ""}
      ${qualified ? `<span>${formatQualifiedMetrics(side)}</span>` : ""}
      <b>${qualified ? "Qualified" : "Skipped"}</b>
      ${!qualified ? `<em>${escapeHtml(shortBlockReason(side?.reason || "No block reason returned."))}</em>` : ""}
    </div>
  `;
}

function shortBlockReason(reason) {
  const text = String(reason || "").replace(/\s+/g, " ").trim();
  if (!text) return "No block reason returned.";
  const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
  const priority = parts.find((part) => /minimum|target|profit|fee|side-band|trend|stability|late|pause|safety|cooling|cash|risk|size|blocked|skipped/i.test(part));
  return cleanWaitingReason(priority || parts[parts.length - 1] || text).slice(0, 220);
}

function cleanWaitingReason(reason) {
  return String(reason || "")
    .replace(/BTC scraper blocked:\s*/gi, "BTC monitor: ")
    .replace(/BTC scraper/gi, "BTC monitor")
    .replace(/\bblocked by\b/gi, "waiting on")
    .replace(/\bblocked:\s*/gi, "")
    .replace(/\bblocked\b/gi, "waiting")
    .trim();
}

function compactSportsLabel(row) {
  return row.event || row.market || row.ticker || "-";
}

function compactSportsDetail(row, decision, cutoffMins) {
  const parts = [];
  const sport = sportsShortCode(row);
  if (sport) parts.push(sport);
  const priceLine = compactSidePrices(row);
  if (priceLine) parts.push(priceLine);
  if (Number.isFinite(decision)) {
    parts.push(`exp ${new Date(decision).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${cutoffMins == null ? "" : ` (${Math.max(0, cutoffMins)}m)`}`);
  }
  return parts.join(" | ");
}

function compactSidePrices(row) {
  const sides = row.sides || [];
  const yes = sides.find((side) => String(side.side || "").toUpperCase() === "YES");
  const no = sides.find((side) => String(side.side || "").toUpperCase() === "NO");
  const yesText = yes?.entry != null ? `YES ${cents(yes.entry)}` : "";
  const noText = no?.entry != null ? `NO ${cents(no.entry)}` : "";
  return [yesText, noText].filter(Boolean).join(" | ");
}

function formatQualifiedMetrics(side) {
  const metrics = [];
  if (side?.ev != null) metrics.push(`EV ${pct(side.ev)}`);
  if (side?.volatility != null) metrics.push(`Vol ${Number(side.volatility).toFixed(1)}%`);
  return metrics.join(" | ");
}

function sportsShortCode(row) {
  const text = `${row.ticker || ""} ${row.series_ticker || ""} ${row.market || ""} ${row.event || ""}`.toUpperCase();
  if (text.includes("KXMLB") || /\bMLB\b|BASEBALL/.test(text)) return "MLB";
  if (text.includes("KXNBA")) return "NBA";
  if (text.includes("KXWNBA")) return "WNBA";
  if (text.includes("KXNHL")) return "NHL";
  if (text.includes("KXNFL")) return "NFL";
  if (text.includes("KXMLS") || /SOCCER|MLS/.test(text)) return "Soccer";
  if (text.includes("KXATP") || text.includes("KXWTA") || text.includes("KXITF") || /TENNIS/.test(text)) return "Tennis";
  if (/BASKETBALL/.test(text)) return "Basketball";
  if (/HOCKEY/.test(text)) return "Hockey";
  if (/FOOTBALL/.test(text)) return "Football";
  return "";
}

function bestScanSide(row) {
  const sides = row.sides || [];
  const candidate = sides.find((side) => side.decision === "candidate" || /\b(ready|qualifies)\b/i.test(side.reason || ""));
  if (candidate) return candidate;
  if (isBitcoinScanRow(row)) {
    const btcScraperSide = sides.find((side) => /^BTC scraper/i.test(side.reason || ""));
    if (btcScraperSide) return btcScraperSide;
  }
  return [...sides].sort((a, b) => Number(b.ev ?? -999) - Number(a.ev ?? -999))[0]
    || null;
}

function formatBtcTechnicals(snapshot = null) {
  return "BTC monitor";
}

function formatTechVote(value) {
  if (!value) return "-";
  const text = String(value).toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function scanRowHtml(row) {
  const btcRow = isBitcoinScanRow(row);
  return `
    <div class="game-row">
      <time>${new Date(row.time).toLocaleTimeString()}</time>
      <div>
        <strong>${escapeHtml(row.event || row.market || row.ticker)}</strong>
        <small>${escapeHtml(row.market)} | ${escapeHtml(row.ticker)}</small>
        <div class="game-sides">
        ${(row.sides || []).map((side) => `
          <div class="game-side ${side.decision === "candidate" ? "hit" : "blocked"}">
            <div class="game-side-head">
              <b>${escapeHtml(side.side || "")}</b>
              <span>${side.entry != null ? `${cents(side.entry)} to ${side.target != null ? cents(side.target) : "-"}` : "-"}</span>
              ${btcRow ? "" : `<span>EV ${side.ev != null ? `${Number(side.ev).toFixed(2)}%` : "-"}</span>`}
              ${btcRow ? "" : `<span>Vol ${side.volatility != null ? `${Number(side.volatility).toFixed(1)}%` : "-"}</span>`}
            </div>
            <em>${escapeHtml(side.reason || "")}</em>
            ${row.bookWallSummary || side.bookWallSummary ? `<em>${escapeHtml(formatBookWallSummary(row.bookWallSummary || side.bookWallSummary))}</em>` : ""}
          </div>
        `).join("")}
        </div>
      </div>
    </div>
  `;
}

function isBitcoinScanRow(row) {
  const text = `${row.event || ""} ${row.market || ""} ${row.ticker || ""} ${row.series_ticker || ""}`.toLowerCase();
  return text.includes("bitcoin") || text.includes("kxbtc");
}

function setAuditPanel(panel) {
  if (!els.auditLog || !els.auditTab) return;
  const showGames = panel === "games";
  const showAudit = panel === "audit";
  const showTrades = panel === "trades";
  const showShadow = panel === "shadow";
  els.auditLog.classList.toggle("hidden", !showAudit);
  if (els.gameScanLog) els.gameScanLog.classList.toggle("hidden", !showGames);
  if (els.tradeHistoryLog) els.tradeHistoryLog.classList.toggle("hidden", !showTrades);
  if (els.shadowLog) els.shadowLog.classList.toggle("hidden", !showShadow);
  els.auditTab.classList.toggle("active", showAudit);
  if (els.gamesTab) els.gamesTab.classList.toggle("active", showGames);
  if (els.tradeHistoryTab) els.tradeHistoryTab.classList.toggle("active", showTrades);
  if (els.shadowTab) els.shadowTab.classList.toggle("active", showShadow);
  updateDownloadLinks(panel);
}

function updateDownloadLinks(panel) {
  const links = {
    games: { csv: "/api/download/scanned-csv", txt: "/api/download/scanned-txt" },
    audit: { csv: "/api/download/audit-csv", txt: "/api/download/audit" },
    trades: { csv: "/api/download/trades-csv", txt: "/api/download/trades" }
  }[panel] || { csv: "/api/download/scanned-csv", txt: "/api/download/scanned-txt" };
  if (els.downloadCsv) els.downloadCsv.href = links.csv;
  if (els.downloadTxt) els.downloadTxt.href = links.txt;
}

function renderTradeHistory() {
  if (!els.tradeHistoryLog) return;
  const trades = [...((state.paper || {}).trades || [])].sort((a, b) => Date.parse(b.openedAt || 0) - Date.parse(a.openedAt || 0));
  els.tradeHistoryLog.innerHTML = trades.length ? trades.map((trade) => {
    const statusClass = ["TARGET", "PROFIT_LOCK"].includes(trade.status) ? "hit" : ["OPEN", "SUBMITTING"].includes(trade.status) ? "open" : "blocked";
    return `
      <div class="trade-history-row ${statusClass}">
        <time>${trade.openedAt ? new Date(trade.openedAt).toLocaleTimeString() : "-"}</time>
        <div>
          <strong>${escapeHtml(trade.recommendation || `BUY ${trade.side || ""}`)} ${escapeHtml(formatBetName(trade))}</strong>
          <small>${escapeHtml(trade.ticker || "")}</small>
          <span>${escapeHtml(trade.status || "-")} | ${fmt(trade.contracts || 0)} contracts | entry ${cents(trade.entryPriceCents)} | target ${cents(trade.targetPriceCents)} | stop ${cents(trade.softStopPriceCents)} | P/L ${trade.pnl != null ? dollars(trade.pnl, true) : dollars(trade.unrealizedPnl || 0, true)}</span>
        </div>
      </div>
    `;
  }).join("") : `<div class="empty">No system trade history yet.</div>`;
}

function renderResults() {
  els.results.innerHTML = "";
}

function spotRecordingRowHtml(row) {
  return `
    <div class="recording-row spot-recording-row">
      <time>${escapeHtml(shortTime(row.timestamp))}</time>
      <div>
        <strong>${escapeHtml(row.priceText || "-")}</strong>
        <span>${escapeHtml(row.source || "spot feed")}</span>
      </div>
    </div>
  `;
}

function contractRecordingRowHtml(row) {
  return `
    <div class="recording-row">
      <time>${escapeHtml(shortTime(row.timestamp))}</time>
      <div>
        <strong>${escapeHtml(row.strikeText || "BTC strike")}</strong>
        <span>${escapeHtml(row.expiry || "")}</span>
      </div>
      <div>
        <b>${escapeHtml(row.yesAsk || "-")}</b>
        <small>YES above</small>
      </div>
    </div>
  `;
}

function setStatus(message) {
  if (els.paperStatus) els.paperStatus.textContent = state.running ? "Scanning" : (message || "Stopped");
}

function systemTradeRows(paper) {
  const tradeRows = (paper.trades || []).filter(isLivePositionRow);
  if (paper.activeTrade && !tradeRows.some((trade) => trade.id === paper.activeTrade.id)) tradeRows.unshift(paper.activeTrade);
  let rows = tradeRows.map((trade) => ({
    ...trade,
    executionStatus: trade.executionStatus || trade.status,
    qualifies: ["OPEN", "SUBMITTING"].includes(trade.status),
    side: trade.side,
    recommendation: trade.recommendation || `BUY ${trade.side || ""}`,
    currentBuyPriceCents: trade.entryPriceCents,
    sellTargetCents: trade.targetPriceCents,
    stopPriceCents: trade.softStopPriceCents,
    targetLimitPriceCents: trade.targetLimitPriceCents,
    priceBand: trade.priceBand,
    recommendedContracts: trade.contracts,
    strategyType: trade.strategyType,
    arbHoldToExpiration: trade.arbHoldToExpiration,
    arbCombinedTargetCents: trade.arbCombinedTargetCents,
    arbObservedCombinedAskCents: trade.arbObservedCombinedAskCents,
    evRoiPct: trade.evRoiPct,
    netProfitPct: trade.netProfitPct,
    adjustedTouchProbability: null,
    chopScore: null,
    recentTouchRate: trade.recentTouchRate,
    rangeCents: null,
    minutesLeft: null,
    reasonSummary: trade.failureReason || trade.status || "",
    firstSeenAt: trade.openedAt,
    lastSeenAt: trade.lastCheckedAt || trade.closedAt || trade.openedAt
  }));
  const recovery = paper.sportsArbRecovery || null;
  if (recovery?.eventKey) {
    const recoveryExposureKey = `SPORTS_ARB:${String(recovery.eventKey || "")}`.toUpperCase();
    rows = rows.filter((row) => String(row.exposureKey || "").toUpperCase() !== recoveryExposureKey);
    rows.unshift(...sportsArbRecoveryLegs(recovery, paper));
  }
  const managedTickers = new Set(rows.map((row) => String(row.ticker || "").toUpperCase()));
  rows = groupBitcoinArbRows(rows, state.bitcoinArbWatch || paper.bitcoinArbWatch || null);
  const displayRows = groupSportsArbRows(rows);
  for (const position of paper.livePortfolioPositions || []) {
    const ticker = String(position.ticker || "").toUpperCase();
    if (!ticker || managedTickers.has(ticker)) continue;
    displayRows.push({
      id: "",
      ticker,
      portfolioPosition: true,
      systemTracked: Boolean(position.systemTracked),
      marketTitle: position.marketTitle || ticker,
      subtitle: position.subtitle || "Kalshi portfolio position",
      recommendation: Number(position.position || 0) >= 0 ? "PORTFOLIO YES" : "PORTFOLIO NO",
      executionStatus: position.systemTracked ? "UNCONFIRMED SYSTEM POSITION" : "ACCOUNT POSITION",
      qualifies: false,
      side: Number(position.position || 0) >= 0 ? "YES" : "NO",
      recommendedContracts: Math.abs(Number(position.position || 0)),
      currentBuyPriceCents: null,
      sellTargetCents: null,
      stopPriceCents: null,
      reasonSummary: `Live Kalshi position: ${position.position} contracts / ${dollars(position.exposureDollars || 0)} exposure${position.marketStatus ? ` | ${position.marketStatus}` : ""}`
    });
  }
  return displayRows;
}

function isLivePositionRow(trade) {
  const status = String(trade?.status || "").toUpperCase();
  const executionStatus = String(trade?.executionStatus || "").toUpperCase();
  if (["OPEN", "SUBMITTING"].includes(status)) return true;
  return [
    "ARB_HELD_TO_EXPIRATION",
    "HEDGE_RETRY",
    "HEDGE_IMBALANCE",
    "HEDGE_RECOVERY",
    "ANCHOR_FILLED",
    "ANCHOR_SUBMITTING"
  ].includes(executionStatus);
}

function resultRow(r) {
  if (r.btcArbGroup) return btcArbGroupRow(r);
  if (r.arbGroup) return sportsArbGroupRow(r);
  const sideClass = r.side === "NO" ? "side-no" : "side-yes";
  const inactiveClass = (r.missedPasses || 0) > 0 ? "inactive" : "";
  const isArbHold = r.strategyType === "SPORTS_PAIR_ARB_HOLD" || r.arbHoldToExpiration;
  const targetPill = isArbHold
    ? `<div class="row-pill"><small>Exit plan</small><span>Hold to expiration</span></div>`
    : `<div class="row-pill">
        <small>Target exit</small>
        <span>${cents(r.targetLimitPriceCents ?? r.sellTargetCents)}</span>
      </div>`;
  const stopPill = isArbHold
    ? `<div class="row-pill"><small>Risk rail</small><span>No stop/order</span></div>`
    : `<div class="row-pill">
        <small>Auto stop</small>
        <span>${autoStopText(r)}</span>
      </div>`;
  return `
    <article class="result-row ${r.qualifies ? "qualified" : ""} ${sideClass} ${inactiveClass}">
      <div class="trade-row-head">
        <div class="bet-name">
          <strong class="${sideClass}">${escapeHtml(r.recommendation || "")}</strong>
          <a href="${r.url || "#"}" target="_blank" rel="noreferrer">${escapeHtml(formatBetName(r))}</a>
          <small>${escapeHtml(formatTradeMeta(r))}</small>
        </div>
        ${r.id ? `
          <div class="trade-actions">
            <button class="row-action danger small-danger trade-emergency" data-emergency-position="${escapeHtml(r.id)}">Emergency Stop</button>
            <button class="row-action small-danger trade-manual-override" data-manual-override-position="${escapeHtml(r.id)}">Manual Override</button>
          </div>
        ` : ""}
      </div>
      <div class="row-pill hot">
        <small>Contracts</small>
        <span>${fmt(r.recommendedContracts || 0)}</span>
      </div>
      <div class="row-pill">
        <small>${isArbHold ? "IOC entry" : "Entry"}</small>
        <span>${cents(r.currentBuyPriceCents)}</span>
      </div>
      ${targetPill}
      ${stopPill}
      ${r.evRoiPct != null ? `<div class="row-pill vol"><small>EV rating</small><span>${pct(r.evRoiPct)}</span></div>` : ""}
      <div class="row-pill status-alert">
        <small>Status</small>
        <span>${escapeHtml(r.executionStatus || r.tradeStatus || "SIGNAL")}</span>
      </div>
    </article>
  `;
}

function groupSportsArbRows(rows) {
  const groups = new Map();
  const singles = [];
  for (const row of rows) {
    if (isSportsArbHoldRow(row) && row.exposureKey) {
      const key = String(row.exposureKey || row.event_ticker || row.ticker || "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    } else {
      singles.push(row);
    }
  }
  const grouped = [...groups.entries()].map(([key, legs]) => sportsArbGroupFromLegs(key, legs));
  return [...grouped, ...singles];
}

function groupBitcoinArbRows(rows, watch = null) {
  const groups = new Map();
  const singles = [];
  for (const row of rows) {
    if (isBitcoinArbHoldRow(row) && row.exposureKey) {
      const key = String(row.exposureKey || row.event_ticker || row.ticker || "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    } else {
      singles.push(row);
    }
  }
  const grouped = [...groups.entries()].map(([key, legs]) => btcArbGroupFromLegs(key, legs, watch));
  return [...grouped, ...singles];
}

function isSportsArbHoldRow(row) {
  return row?.strategyType === "SPORTS_PAIR_ARB_HOLD";
}

function isBitcoinArbHoldRow(row) {
  return row?.strategyType === "BTC_CROSS_STRIKE_ARB_HOLD";
}

function btcArbRoleRank(row) {
  const role = String(row?.btcArbRole || "").toLowerCase();
  if (role === "anchor") return 0;
  if (role === "hedge") return 1;
  if (String(row?.side || "").toUpperCase() === "NO") return 0;
  return 1;
}

function btcArbGroupFromLegs(key, legs, watch = null) {
  const sorted = [...legs].sort((a, b) => btcArbRoleRank(a) - btcArbRoleRank(b));
  const anchor = sorted.find((leg) => btcArbRoleRank(leg) === 0) || sorted[0] || {};
  const hedge = sorted.find((leg) => btcArbRoleRank(leg) === 1) || sorted[1] || null;
  const recovery = watch?.recovery || null;
  let displayLegs = sorted;
  if (!hedge && recovery?.stage === "hedge" && String(watch?.higher?.ticker || "").toUpperCase() === String(anchor.ticker || "").toUpperCase()) {
    displayLegs = [
      anchor,
      {
        id: "",
        ticker: watch?.lower?.ticker || "",
        marketTitle: `${watch?.lower?.strikeLabel || "Lower strike"} YES`,
        selectionLabel: watch?.lower?.strikeLabel || "Lower strike",
        recommendation: "RETRY IOC BUY YES",
        side: "YES",
        status: "SUBMITTING",
        executionStatus: "HEDGE_RETRY",
        contracts: anchor.contracts || 0,
        entryPriceCents: recovery.retryPriceCents,
        currentExecutableAskCents: recovery.liveHedgeAskCents,
        retryAttempts: recovery.attempts,
        arbMissingLeg: true,
        btcArbRole: "hedge"
      }
    ];
  }
  const filledLegs = displayLegs.filter((leg) => !leg.arbMissingLeg && String(leg.status || "").toUpperCase() === "OPEN");
  const totalContracts = displayLegs.reduce((sum, leg) => sum + Number(leg.contracts || 0), 0);
  const pairedContracts = filledLegs.length >= 2 ? Math.min(...filledLegs.map((leg) => Number(leg.contracts || 0))) : 0;
  const totalEntry = filledLegs.reduce((sum, leg) => sum + Number(leg.entryPriceCents || 0) * Number(leg.contracts || 0), 0);
  const hasRetry = displayLegs.some((leg) => String(leg.executionStatus || "").toUpperCase().includes("HEDGE_RETRY") || String(leg.status || "").toUpperCase() === "SUBMITTING");
  const allOpen = displayLegs.length >= 2 && displayLegs.every((leg) => String(leg.status || "").toUpperCase() === "OPEN" || leg.executionStatus === "ARB_HELD_TO_EXPIRATION");
  return {
    ...anchor,
    id: "",
    btcArbGroup: true,
    btcArbGroupLegs: displayLegs,
    exposureKey: key,
    side: "YES",
    recommendation: "BTC ARB",
    marketTitle: btcArbGroupTitle(displayLegs),
    subtitle: "BTC cross-strike arb",
    ticker: cleanBtcArbExposureKey(key),
    recommendedContracts: pairedContracts,
    arbTotalContracts: totalContracts,
    currentBuyPriceCents: filledLegs.length ? totalEntry / Math.max(1, filledLegs.reduce((sum, leg) => sum + Number(leg.contracts || 0), 0)) : null,
    executionStatus: hasRetry ? "HEDGE_RETRY" : allOpen ? "OPEN" : "CHECK",
    reasonSummary: hasRetry
      ? `Anchor filled | retrying arb leg ${cents(displayLegs.find((leg) => btcArbRoleRank(leg) === 1)?.retryPriceCents ?? displayLegs.find((leg) => btcArbRoleRank(leg) === 1)?.entryPriceCents)}`
      : `${displayLegs.length}/2 legs confirmed | held to expiration`
  };
}

function btcArbGroupRow(r) {
  const legs = r.btcArbGroupLegs || [];
  return `
    <article class="result-row qualified arb-position-row btc-arb-position-row">
      <div class="trade-row-head">
        <div class="bet-name">
          <strong>BTC ARB</strong>
          <a href="#">${escapeHtml(r.marketTitle || "BTC cross-strike arb")}</a>
          <small>${escapeHtml(formatTradeMeta(r))}</small>
        </div>
      </div>
      <div class="arb-position-legs">
        ${legs.map((leg) => {
          const isHedge = btcArbRoleRank(leg) === 1;
          const retryAttempts = leg.retryAttempts ?? (isHedge ? state.bitcoinArbWatch?.recovery?.attempts : null);
          const liveAsk = leg.currentExecutableAskCents ?? (isHedge ? state.bitcoinArbWatch?.recovery?.liveHedgeAskCents : state.bitcoinArbWatch?.recovery?.liveAnchorNoAskCents);
          const liveBid = leg.currentExecutableBidCents ?? (!isHedge ? state.bitcoinArbWatch?.recovery?.liveAnchorNoBidCents : null);
          const retryPrice = leg.retryPriceCents ?? leg.entryPriceCents ?? (isHedge ? state.bitcoinArbWatch?.recovery?.retryPriceCents : null);
          const salvage = isHedge && state.bitcoinArbWatch?.recovery?.salvageMode ? " | salvage mode" : "";
          return `
            <div class="arb-position-leg ${isHedge && String(leg.status || "").toUpperCase() !== "OPEN" ? "missing" : ""}">
              <strong>${escapeHtml(isHedge ? "ARB BUY YES" : "ANCHOR BUY NO")} ${escapeHtml(legSelectionName(leg))}</strong>
              <span>${fmt(leg.contracts || 0)} contracts</span>
              <span>${isHedge && String(leg.status || "").toUpperCase() !== "OPEN" ? "IOC target" : "entry"} ${cents(retryPrice)}</span>
              <span>${escapeHtml(displayExecutionStatus(leg.executionStatus || leg.status || "OPEN"))}</span>
              <small>${escapeHtml(leg.ticker || "")}</small>
              ${isHedge ? `<em>Attempts ${fmt(retryAttempts || 0)} | live ask ${cents(liveAsk)} | target ${cents(retryPrice)}${salvage}</em>` : `<em>Current NO ask ${cents(liveAsk)} | bid ${cents(liveBid)}</em>`}
              ${leg.id ? `
                ${isHedge && String(leg.status || "").toUpperCase() !== "OPEN" ? `<button class="row-action small-primary trade-continue-arb" data-continue-arb-position="${escapeHtml(leg.id)}">Continue Attempts</button>` : ""}
                <button class="row-action small-danger trade-manual-override" data-manual-override-position="${escapeHtml(leg.id)}">Manual Override</button>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
      <div class="row-pill hot">
        <small>Paired contracts</small>
        <span>${fmt(r.recommendedContracts || 0)}</span>
      </div>
      ${r.arbTotalContracts ? `<div class="row-pill"><small>Total legs</small><span>${fmt(r.arbTotalContracts)}</span></div>` : ""}
      <div class="row-pill">
        <small>Avg filled entry</small>
        <span>${cents(r.currentBuyPriceCents)}</span>
      </div>
      <div class="row-pill">
        <small>Exit plan</small>
        <span>Hold to expiration</span>
      </div>
      <div class="row-pill">
        <small>Risk rail</small>
        <span>No stop/order</span>
      </div>
      <div class="row-pill status-alert">
        <small>Status</small>
        <span>${escapeHtml(displayExecutionStatus(r.executionStatus || "OPEN"))}</span>
      </div>
    </article>
  `;
}

function sportsArbGroupFromLegs(key, legs) {
  const sorted = [...legs].sort((a, b) => String(a.selectionLabel || a.marketTitle || a.ticker).localeCompare(String(b.selectionLabel || b.marketTitle || b.ticker)));
  const first = sorted[0] || {};
  const allOpen = sorted.every((leg) => leg.executionStatus === "ARB_HELD_TO_EXPIRATION" || leg.executionStatus === "OPEN" || leg.status === "OPEN");
  const anySubmitting = sorted.some((leg) => leg.executionStatus === "SUBMITTING" || leg.status === "SUBMITTING");
  const anyImbalance = sorted.some((leg) => leg.executionStatus === "HEDGE_IMBALANCE" || Number(leg.unhedgedContracts || 0) > 0);
  const anyRecovery = sorted.some((leg) => leg.arbRecoveryLeg || leg.arbMissingLeg || ["HEDGE RETRY", "ANCHOR RETRY", "ENTRY RETRY"].includes(leg.executionStatus));
  const filledLegs = sorted.filter((leg) => !leg.arbMissingLeg);
  const legCounts = filledLegs.map((leg) => Number(leg.contracts || 0)).filter((count) => count > 0);
  const totalContracts = legCounts.reduce((sum, count) => sum + count, 0);
  const pairedContracts = legCounts.length >= 2 ? Math.min(...legCounts) : 0;
  const totalEntry = filledLegs.reduce((sum, leg) => sum + Number(leg.entryPriceCents || 0) * Number(leg.contracts || 0), 0);
  const totalPnl = sorted.reduce((sum, leg) => sum + Number(leg.unrealizedPnl || 0), 0);
  const warning = sorted.find((leg) => leg.reconciliationWarning)?.reconciliationWarning || "";
  return {
    ...first,
    id: "",
    arbGroup: true,
    arbGroupLegs: sorted,
    exposureKey: key,
    side: "YES",
    recommendation: "SPORTS ARB",
    marketTitle: sportsArbGameTitle(sorted),
    subtitle: sportsArbGameTitle(sorted),
    ticker: cleanArbExposureKey(key),
    recommendedContracts: pairedContracts,
    arbTotalContracts: totalContracts,
    currentBuyPriceCents: totalContracts ? totalEntry / totalContracts : null,
    executionStatus: anyImbalance ? "ARB IMBALANCE" : anyRecovery ? "ARB LEG RETRY" : anySubmitting ? "ARB LEGGING" : allOpen ? "OPEN" : "CHECK",
    reasonSummary: anyImbalance
      ? warning || `${pairedContracts} paired contract(s); arb leg counts do not match`
      : anyRecovery
      ? `${filledLegs.length}/2 legs filled | retrying ${filledLegs.length ? "missing arb leg" : "first leg"}`
      : `${sorted.length}/2 legs confirmed | held to expiration`,
    unrealizedPnl: totalPnl
  };
}

function sportsArbGroupRow(r) {
  const legs = r.arbGroupLegs || [];
  return `
    <article class="result-row qualified arb-position-row">
      <div class="trade-row-head">
        <div class="bet-name">
          <strong>SPORTS ARB</strong>
          <a href="#">${escapeHtml(r.marketTitle || "Paired sports arb")}</a>
          <small>${escapeHtml(formatTradeMeta(r))}</small>
        </div>
      </div>
      <div class="arb-position-legs">
        ${legs.map((leg) => `
          <div class="arb-position-leg ${leg.arbMissingLeg ? "missing" : ""}">
            <strong>${escapeHtml(leg.arbMissingLeg ? "RETRY IOC" : (leg.recommendation || `BUY ${leg.side || "YES"}`))} ${escapeHtml(legSelectionName(leg))}</strong>
            <span>${fmt(leg.contracts || 0)} contracts</span>
            <span>${leg.arbMissingLeg ? "attempt" : "entry"} ${cents(leg.entryPriceCents)}</span>
            <span>${escapeHtml(displayExecutionStatus(leg.executionStatus || leg.status || "OPEN"))}</span>
            <small>${escapeHtml(leg.ticker || "")}</small>
            ${leg.arbMissingLeg ? `<em>Attempt ${fmt(leg.retryAttempts || 0)}${leg.retryLastAttemptAt ? ` | last ${new Date(leg.retryLastAttemptAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""} | ask ${cents(leg.currentExecutableAskCents)} / bid ${cents(leg.currentExecutableBidCents)}</em>` : ""}
            ${leg.id ? `
              <button class="row-action small-danger trade-manual-override" data-manual-override-position="${escapeHtml(leg.id)}">Manual Override</button>
            ` : ""}
          </div>
        `).join("")}
      </div>
      <div class="row-pill hot">
        <small>Arb pairs</small>
        <span>${fmt(r.recommendedContracts || 0)}</span>
      </div>
      ${r.arbTotalContracts ? `<div class="row-pill"><small>Total legs</small><span>${fmt(r.arbTotalContracts)}</span></div>` : ""}
      <div class="row-pill">
        <small>Avg entry</small>
        <span>${cents(r.currentBuyPriceCents)}</span>
      </div>
      <div class="row-pill">
        <small>Exit plan</small>
        <span>Hold to expiration</span>
      </div>
      <div class="row-pill">
        <small>Risk rail</small>
        <span>No stop/order</span>
      </div>
      <div class="row-pill status-alert">
        <small>Status</small>
        <span>${escapeHtml(r.executionStatus || "OPEN")}</span>
      </div>
    </article>
  `;
}

function displayExecutionStatus(status) {
  const key = String(status || "").trim().toUpperCase();
  const labels = {
    ARB_HELD_TO_EXPIRATION: "Held to expiration",
    ANCHOR_FILLED: "Anchor filled",
    ANCHOR_SUBMITTING: "Anchor submitting",
    HEDGE_RETRY: "ARB leg retry",
    HEDGE_IMBALANCE: "ARB imbalance",
    HEDGE_RECOVERY: "ARB leg retry",
    "HEDGE RETRY": "ARB leg retry",
    "ARB IMBALANCE": "ARB imbalance",
    "ARB LEG RETRY": "ARB leg retry",
    "ARB LEGGING": "ARB legging",
    "ANCHOR RETRY": "First leg retry",
    "ENTRY RETRY": "First leg retry",
    SUBMITTING: "Submitting",
    ENTRY_NOT_FILLED: "Not filled",
    ENTRY_UNCONFIRMED: "Confirming",
    OPEN: "Open",
    CHECK: "Checking",
    SIGNAL: "Signal"
  };
  return labels[key] || String(status || "Open").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function priceBandText(row, key) {
  const values = row?.priceBand?.[key];
  if (!Array.isArray(values) || values.length < 3) return "";
  return values.map((value) => `${fmt(value)}c`).join(" ");
}

function autoStopText(row) {
  if (row?.executionStatus && isDisplayCents(row.stopPriceCents)) {
    const hard = isDisplayCents(row.hardStopPriceCents) ? ` / ${fmt(row.hardStopPriceCents)}c hard` : "";
    return `${fmt(row.stopPriceCents)}c${hard}`;
  }
  return priceBandText(row, "stop") || cents(row?.stopPriceCents);
}

function isDisplayCents(value) {
  const centsValue = Number(value);
  return Number.isFinite(centsValue) && centsValue >= 0 && centsValue <= 100;
}

function portfolioPositionsBlock(rows) {
  return `
    <section class="portfolio-positions-block">
      <div class="portfolio-positions-title">Account positions outside this system</div>
      ${rows.map((r) => {
        const exposure = (r.reasonSummary || "").match(/\\$[0-9.]+/)?.[0] || "-";
        return `
          <div class="portfolio-position-row">
            <span class="portfolio-side">${escapeHtml(r.recommendation || "")}</span>
            <strong>${escapeHtml(formatBetName(r))}</strong>
            <span>${fmt(r.recommendedContracts || 0)} contracts</span>
            <span>${escapeHtml(exposure)}</span>
            <small>${escapeHtml(r.ticker || "")}</small>
          </div>
        `;
      }).join("")}
    </section>
  `;
}

function formatTradeMeta(r) {
  const parts = [];
  if (r.btcArbGroup) parts.push("BTC cross-strike arb");
  else if (r.arbGroup) parts.push("paired sports arb");
  else if (r.strategyType === "SPORTS_PAIR_ARB_HOLD") parts.push("sports arb hold");
  else if (r.strategyType === "BTC_CROSS_STRIKE_ARB_HOLD") parts.push("BTC cross-strike arb");
  else if (r.arbHoldToExpiration) parts.push("arb hold");
  if (r.executionStatus === "SIGNAL") parts.push("qualified signal");
  if (r.openedAt) parts.push(`opened ${new Date(r.openedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
  if (r.closedAt && !["OPEN", "SUBMITTING"].includes(r.executionStatus)) parts.push(`closed ${new Date(r.closedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
  if (r.executionStatus && r.executionStatus !== "SIGNAL") parts.push(displayExecutionStatus(r.executionStatus));
  if (r.ticker && !r.arbGroup && !r.btcArbGroup) parts.push(r.ticker);
  return parts.join(" | ");
}

function compareTradeRows(a, b) {
  const portfolioA = a.portfolioPosition && !a.systemTracked ? 1 : 0;
  const portfolioB = b.portfolioPosition && !b.systemTracked ? 1 : 0;
  if (portfolioA !== portfolioB) return portfolioA - portfolioB;
  const activeStatuses = ["OPEN", "SUBMITTING", "HEDGE_RETRY", "ANCHOR_FILLED", "ANCHOR_SUBMITTING"];
  const activeA = activeStatuses.includes(a.executionStatus) ? 2 : a.executionStatus === "SIGNAL" ? 1 : 0;
  const activeB = activeStatuses.includes(b.executionStatus) ? 2 : b.executionStatus === "SIGNAL" ? 1 : 0;
  if (activeA !== activeB) return activeB - activeA;
  if (a.executionStatus === "SIGNAL" && b.executionStatus === "SIGNAL") return (b.evRoiPct || -999) - (a.evRoiPct || -999);
  return Date.parse(b.openedAt || b.closedAt || 0) - Date.parse(a.openedAt || a.closedAt || 0);
}

function formatBetName(r) {
  if (r?.btcArbGroup) return r.marketTitle || btcArbGroupTitle(r.btcArbGroupLegs || []);
  if (r?.arbGroup) return r.marketTitle || sportsArbGameTitle(r.arbGroupLegs || []);
  if (isSportsArbHoldRow(r)) return legSelectionName(r);
  const eventName = cleanTitle(r.subtitle || r.marketTitle || r.ticker);
  const selection = cleanTitle(r.selectionLabel || "");
  if ((r.category || "").toLowerCase() === "crypto" || /\bBTC|KXBTC/i.test(`${r.ticker || ""} ${r.series_ticker || ""}`)) {
    return `${r.bitcoinContractType || bitcoinContractType(r)} - ${selection || eventName}`;
  }
  if (selection && !eventName.toLowerCase().includes(selection.toLowerCase())) {
    return `${selection} - ${eventName}`;
  }
  return eventName;
}

function sportsArbGameTitle(legs = []) {
  const names = legs.map(legSelectionName).filter(Boolean);
  if (names.length >= 2) return `${names[0]} vs ${names[1]}`;
  const fallback = cleanArbExposureKey(legs[0]?.exposureKey || legs[0]?.event_ticker || legs[0]?.subtitle || "");
  return fallback || names[0] || "Paired sports arb";
}

function btcArbGroupTitle(legs = []) {
  const anchor = legs.find((leg) => btcArbRoleRank(leg) === 0) || legs.find((leg) => String(leg?.side || "").toUpperCase() === "NO") || legs[0];
  const hedge = legs.find((leg) => btcArbRoleRank(leg) === 1) || legs.find((leg) => String(leg?.side || "").toUpperCase() === "YES") || legs[1];
  const anchorName = anchor ? legSelectionName(anchor) : "higher strike";
  const hedgeName = hedge ? legSelectionName(hedge) : "lower strike";
  return `${anchorName} NO + ${hedgeName} YES`;
}

function legSelectionName(row) {
  const selection = cleanTitle(row?.selectionLabel || row?.marketTitle || "");
  if (selection && !looksLikeTicker(selection)) return selection;
  const suffix = String(row?.ticker || "").split("-").pop() || "";
  return cleanTickerSuffix(suffix) || cleanTitle(row?.marketTitle || row?.ticker || "Leg");
}

function cleanArbExposureKey(value) {
  return String(value || "").replace(/^SPORTS_ARB:/i, "");
}

function cleanBtcArbExposureKey(value) {
  return String(value || "").replace(/^BTC_CROSS_ARB:/i, "");
}

function looksLikeTicker(value) {
  return /^[A-Z0-9_-]{8,}$/.test(String(value || "").trim());
}

function cleanTickerSuffix(value) {
  const suffix = String(value || "").trim().toUpperCase();
  if (!suffix || suffix.length > 6 || /[0-9]/.test(suffix)) return "";
  return suffix;
}

function formatBetMeta(r) {
  const time = r.decision_time || r.occurrence_datetime || r.expected_expiration_time || r.close_time || r.expiration_time;
  const parts = [];
  if (r.lastSeenAt) parts.push(`updated ${relativeTime(r.lastSeenAt)}`);
  if (r.firstSeenAt) parts.push(`first seen ${new Date(r.firstSeenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
  if ((r.missedPasses || 0) > 0) parts.push("not currently confirmed");
  if (r.bitcoinTrendDirection && r.bitcoinTrendDirection !== "unknown") parts.push(`BTC trend ${r.bitcoinTrendDirection}`);
  if (time) parts.push(new Date(time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
  if (r.marketTitle && r.subtitle && r.marketTitle !== r.subtitle) parts.push(cleanTitle(r.marketTitle));
  if (r.ticker) parts.push(r.ticker);
  return parts.join(" | ");
}

function compareRows(a, b) {
  const activeA = (a.missedPasses || 0) === 0 ? 1 : 0;
  const activeB = (b.missedPasses || 0) === 0 ? 1 : 0;
  if (activeA !== activeB) return activeB - activeA;
  if (activeA && activeB) return (b.evRoiPct || -999) - (a.evRoiPct || -999);
  return Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0);
}

function formatContractTime(r) {
  const time = r.decision_time || r.occurrence_datetime || r.expected_expiration_time || r.close_time || r.expiration_time;
  if (!time) return "";
  return new Date(time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function bitcoinContractType(r) {
  const text = `${r.series_ticker || ""} ${r.event_ticker || ""} ${r.ticker || ""}`.toUpperCase();
  if (isBitcoinHourlyContract(text, r)) return "BTC 1 hour";
  if (text.includes("KXBTCD")) return "BTC daily";
  if (text.includes("KXBTC")) return isBitcoinHourlyContract(text, r) ? "BTC 1 hour" : "BTC daily";
  return "BTC";
}

function isBitcoinHourlyContract(text, r = {}) {
  const close = Date.parse(r.close_time || "");
  const decision = Date.parse(r.decision_time || r.expected_expiration_time || "");
  if (Number.isFinite(close) && Number.isFinite(decision)) {
    const minutesToDecision = (decision - Date.now()) / 60_000;
    return Math.abs(decision - close) <= 10 * 60 * 1000 && minutesToDecision > -10 && minutesToDecision <= 70;
  }
  return false;
}

function fmt(value) {
  return Number(value || 0).toLocaleString();
}

function cents(value) {
  return value == null ? "-" : `${Number(value).toFixed(1).replace(".0", "")}c`;
}

function pct(value) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2)}%`;
}

function dollars(value, signed = false) {
  const num = Number(value || 0);
  const sign = signed && num > 0 ? "+" : "";
  return `${sign}$${num.toFixed(2)}`;
}

function timeLeft(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  if (num < 60) return `${Math.max(0, Math.round(num))}m`;
  return `${(num / 60).toFixed(1)}h`;
}

function relativeTime(value) {
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return "-";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\byes\s+/gi, "")
    .replace(/\bno\s+/gi, "")
    .replace(/\s*,\s*(?=(yes|no)\b)/gi, " / ");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}


