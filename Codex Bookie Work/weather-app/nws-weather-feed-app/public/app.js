const els = {
  liveStatus: document.querySelector("#liveStatus"),
  historyStatus: document.querySelector("#historyStatus"),
  liveMeta: document.querySelector("#liveMeta"),
  primaryWeatherGrid: document.querySelector("#primaryWeatherGrid"),
  secondaryWeatherGrid: document.querySelector("#secondaryWeatherGrid"),
  evMeta: document.querySelector("#evMeta"),
  evTable: document.querySelector("#evTable"),
  refreshCurrent: document.querySelector("#refreshCurrent"),
  runHistory: document.querySelector("#runHistory"),
  refreshEv: document.querySelector("#refreshEv"),
  placePolyYes: document.querySelector("#placePolyYes"),
  placeKalshiYes: document.querySelector("#placeKalshiYes"),
  placeKalshiShort: document.querySelector("#placeKalshiShort"),
  polyScope: document.querySelector("#polyScope"),
  kalshiYesScope: document.querySelector("#kalshiYesScope"),
  kalshiShortScope: document.querySelector("#kalshiShortScope"),
  orderStatus: document.querySelector("#orderStatus"),
  createCsv: document.querySelector("#createCsv"),
  backupCsv: document.querySelector("#backupCsv"),
  datasetStatus: document.querySelector("#datasetStatus")
};

const PRIMARY_CITIES = new Set(["San Francisco", "Los Angeles", "Miami", "New York", "Chicago"]);

els.refreshCurrent.addEventListener("click", () => loadCurrent(true));
els.runHistory.addEventListener("click", runHistory);
els.refreshEv.addEventListener("click", refreshEv);
els.placePolyYes.addEventListener("click", () => previewOrders("polymarket-yes", els.polyScope.value));
els.placeKalshiYes.addEventListener("click", () => previewOrders("kalshi-yes", els.kalshiYesScope.value));
els.placeKalshiShort.addEventListener("click", () => previewOrders("kalshi-short", els.kalshiShortScope.value));
els.createCsv.addEventListener("click", createCsv);
els.backupCsv.addEventListener("click", backupCsv);

loadCurrent(false);
loadHistory();
setInterval(() => loadCurrent(false), 60_000);

async function loadCurrent(force) {
  els.liveStatus.textContent = "reading";
  const data = await fetchJson(`/api/current${force ? "?force=1" : ""}`);
  const rows = data.rows || [];
  els.liveStatus.textContent = `${rows.filter((row) => row.status === "ok").length}/${rows.length} online`;
  els.liveMeta.textContent = data.fetchedAt
    ? `Last refresh ${shortTime(data.fetchedAt)}.`
    : "Waiting for first station read.";
  const primaryRows = rows.filter((row) => PRIMARY_CITIES.has(row.city));
  const secondaryRows = rows.filter((row) => !PRIMARY_CITIES.has(row.city));
  els.primaryWeatherGrid.innerHTML = primaryRows.length
    ? primaryRows.map((row) => weatherCard(row, "primary")).join("")
    : `<div class="empty">No primary market rows yet.</div>`;
  els.secondaryWeatherGrid.innerHTML = secondaryRows.length
    ? secondaryRows.map((row) => weatherCard(row, "secondary")).join("")
    : `<div class="empty">No station rows yet.</div>`;
}

async function runHistory() {
  els.historyStatus.textContent = "updating";
  els.datasetStatus.textContent = "Updating permanent city/time CSVs...";
  await fetchJson("/api/history/run");
  pollHistory();
}

async function createCsv() {
  els.datasetStatus.textContent = "Creating/updating CSVs from history start to eligible date...";
  await fetchJson("/api/history/create");
  pollHistory();
}

async function backupCsv() {
  els.datasetStatus.textContent = "Making backup copy...";
  const data = await fetchJson("/api/history/backup");
  els.datasetStatus.textContent = `Backup made: ${data.copied || 0} files`;
}

async function pollHistory() {
  const status = await fetchJson("/api/history/status");
  els.historyStatus.textContent = status.running
    ? `${status.completedStations || 0}/${status.totalStations || 5} ${status.status || "running"}`
    : status.lastDateRecorded || status.status || "idle";
  if (status.running) {
    setTimeout(pollHistory, 2000);
    return;
  }
  await loadHistory();
  els.datasetStatus.textContent = status.status === "complete" ? "Datasets updated in place." : (status.error || status.status || "idle");
}

async function loadHistory() {
  const data = await fetchJson("/api/history/latest");
  if (!data.available) {
    els.historyStatus.textContent = "not built";
    return;
  }
  els.historyStatus.textContent = formatDateOnly(data.lastDateRecorded) || "no date";
  renderEvSummary(data);
  await refreshEv().catch((error) => {
    els.evTable.className = "ev-table empty";
    els.evTable.textContent = `EV unavailable: ${error.message}`;
  });
}

function weatherCard(row, mode = "primary") {
  const ok = row.status === "ok";
  const isSecondary = mode === "secondary";
  return `
    <article class="weather-card ${isSecondary ? "secondary-card" : "primary-card"} ${ok ? "ok" : "error"}">
      <header>
        <div>
          <strong>${escapeHtml(row.city)}</strong>
          <small>${escapeHtml(row.stationId)} · ${escapeHtml(row.series)}</small>
        </div>
        <b>${ok ? temp(row.temperatureF) : "ERR"}</b>
      </header>
      <div class="condition">${escapeHtml(ok ? shortTimestamp(row.observedAt) : row.error || "station error")}</div>
      ${ok ? forecastHighLine(row) : ``}
      ${isSecondary ? `<div class="mini-metrics"></div>` : ``}
    </article>
  `;
}

function forecastHighLine(row) {
  if (row.forecastHighF == null) return `<div class="forecast-high muted">NWS high --</div>`;
  return `<div class="forecast-high"><span>NWS high</span><b>${temp(row.forecastHighF)}</b></div>`;
}

function renderEvSummary(data) {
  const datasets = Number(data.datasets || 0);
  const completeReadings = Number(data.completeReadings || 0);
  const snapshots = Number(data.snapshots || 0);
  const errors = Number(data.errors || 0);
  els.evMeta.textContent = datasets
    ? `${datasets} reading CSVs · ${completeReadings} complete city-readings · ${snapshots} snapshots · ${errors} errors`
    : "Waiting for weather history data.";
  els.evTable.className = "ev-table empty";
  els.evTable.textContent = "";
}

async function refreshEv() {
  els.evTable.className = "ev-table empty";
  els.evTable.textContent = "Refreshing EV...";
  const data = await fetchJson("/api/ev/latest");
  els.evMeta.textContent = `${data.snapshots || 0} snapshots · ${data.errors || 0} errors`;
  renderEvScreen(data);
}

function renderEvScreen(data) {
  els.evTable.className = "ev-table";
  els.evTable.innerHTML = `
    <section class="ev-section">
      <h3>LOCATION</h3>
      <div class="overlap-box">
        <h4>Overlap</h4>
        ${overlapLines(data.overlap || [])}
      </div>
      ${todayContractsScreen(data.todayContracts || {})}
      <div class="location-ev-grid">
        ${(data.location || []).map((city) => `
          <article class="location-ev-card">
            <h4>${escapeHtml(city.city)}</h4>
            ${(city.readings || []).map((reading) => `
              <div class="reading-block">
                <strong>${escapeHtml(reading.label)}</strong>
                ${bucketTable(reading.buckets || [], true, true)}
              </div>
            `).join("")}
          </article>
        `).join("")}
      </div>
    </section>
    <section class="ev-section">
      <h3>GENERAL</h3>
      ${bucketTable(data.general || [])}
    </section>
    <section class="ev-section">
      <h3>TIME EV</h3>
      <div class="ev-split">
        ${(data.time || []).map((group) => `
          <div>
            <h4>${escapeHtml(group.label)}</h4>
            ${bucketTable(group.buckets || [])}
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function todayContractsScreen(data) {
  const contracts = Array.isArray(data.contracts) ? data.contracts : [];
  if (!contracts.length) return `<div class="today-contracts empty compact-empty">No 10 Reading snapshot contracts.</div>`;
  return `
    <div class="today-contracts">
      <h4>10 Reading Snapshot Contracts ${data.date ? `· ${escapeHtml(data.date)}` : ""}</h4>
      <div class="today-contract-list">
        ${contracts.map((item) => `
          <div class="today-contract ${escapeHtml(item.stance)}">
            <strong>${escapeHtml(item.city)}</strong>
            <span class="contract-target">${contractShortLabel(item.contract)} (${escapeHtml(item.bidCents)}c snapshot)</span>
            <span class="contract-meta">${escapeHtml(item.bucket)}${item.yesEvPct === "" ? "" : ` · ${signedNumber(item.yesEvPct)}%`}${item.maxSpreadCents === "" ? "" : ` · max spread ${escapeHtml(item.maxSpreadCents)}c`}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function overlapLines(rows) {
  if (!rows.length) return `<div class="empty compact-empty">No location overlap yet.</div>`;
  return `
    <div class="overlap-card-grid">
      ${rows.map((row) => {
        const sorted = [...(row.rows || [])].sort((a, b) => Number(b.yesEvPct) - Number(a.yesEvPct));
        const best = sorted[0];
        const weakest = sorted[sorted.length - 1];
        return `
          <article class="overlap-card ${escapeHtml(row.stance)}">
            <div class="overlap-card-top">
              <strong>${escapeHtml(row.bucket)}</strong>
              <span>${escapeHtml(overlapStanceLabel(row.stance))}</span>
            </div>
            <div class="overlap-card-meta">${row.rows.length} locations · ${escapeHtml(row.reading)}</div>
            <div class="overlap-card-locations">
              ${sorted.map((item) => `<span>${escapeHtml(item.city)} ${signedNumber(item.yesEvPct)}%</span>`).join("")}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function overlapStanceLabel(stance) {
  if (stance === "positive") return "positive";
  if (stance === "negative") return "negative";
  return "overlap";
}

function bucketTable(rows, compact = false, significantOnly = false) {
  const visibleRows = significantOnly
    ? rows.filter((row) => Math.abs(Number(row.yesEvPct)) >= 5)
    : rows;
  if (!visibleRows.length) return `<div class="empty compact-empty">No +/-5% bucket.</div>`;
  return `
    <table class="${compact ? "compact-bucket-table" : ""}">
      <colgroup>
        <col class="bucket-col">
        <col class="n-col">
        <col class="wins-col">
        <col class="rate-col">
        <col class="ev-col">
        <col class="spread-col">
      </colgroup>
      <thead>
        <tr>
          <th>Bucket</th>
          <th>${compact ? "N" : "Contracts"}</th>
          <th>${compact ? "W" : "Wins"}</th>
          <th>${compact ? "Rate" : "Yes Rate"}</th>
          <th>${compact ? "EV" : "Yes EV"}</th>
          <th>${compact ? "Spread" : "Max Spread"}</th>
        </tr>
      </thead>
      <tbody>
        ${visibleRows.map((row) => {
          const rowClass = Number(row.yesEvPct) >= 5 ? "positive" : Number(row.yesEvPct) <= -5 ? "negative" : "";
          const detail = "";
          return `
            <tr class="${rowClass}">
              <td><span class="bucket-label">${escapeHtml(row.bucket)}</span></td>
              <td>${escapeHtml(row.contracts)}</td>
              <td>${escapeHtml(row.yesWins)}</td>
              <td>${escapeHtml(row.yesRatePct)}%</td>
              <td>${signedNumber(row.yesEvPct)}%</td>
              <td>${maxSpread(row.yesEvPct)}</td>
            </tr>
            ${detail}
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

async function previewOrders(venue, scope) {
  els.orderStatus.textContent = "Checking candidates...";
  const data = await fetchJson(`/api/orders/preview?venue=${encodeURIComponent(venue)}&scope=${encodeURIComponent(scope)}`);
  els.orderStatus.textContent = `${orderLabel(venue)} · ${scope}: ${data.candidates?.length || 0} candidates staged. ${data.message || ""}`;
}

function orderLabel(value) {
  if (value === "polymarket-yes") return "Polymarket YES";
  if (value === "kalshi-yes") return "Kalshi YES";
  if (value === "kalshi-short") return "Kalshi SHORT";
  return value;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function temp(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}F` : "--";
}

function num(value, suffix = "") {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(0)}${suffix}` : "--";
}

function shortTime(value) {
  const parsed = Number(value) || Date.parse(value);
  if (!Number.isFinite(parsed)) return "pending";
  return new Date(parsed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function shortTimestamp(value) {
  if (!value) return "no time";
  return shortTime(value);
}

function formatDateOnly(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function pct(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "--";
}

function signedPct(value) {
  if (!Number.isFinite(Number(value))) return "--";
  const pctValue = Number(value) * 100;
  return `${pctValue >= 0 ? "+" : ""}${pctValue.toFixed(1)}%`;
}

function signedNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
}

function maxSpread(yesEvPct) {
  const value = Number(yesEvPct);
  if (!Number.isFinite(value) || Math.abs(value) < 5) return "";
  return `${Math.max(0, Math.abs(value) - 5).toFixed(2)}c`;
}

function bucketSnapshot(row) {
  const examples = Array.isArray(row.examples) ? row.examples.slice(0, 2) : [];
  if (!examples.length) return "";
  return `<span class="bucket-snapshot">${examples.map((item) => {
    const date = shortDate(item.date);
    const city = item.city ? `${escapeHtml(item.city)} · ` : "";
    const result = item.result || "pending";
    return `<span class="contract-snapshot-line"><b>Contract:</b> ${date} · ${city}${escapeHtml(item.contract)} <b>Bid:</b> ${escapeHtml(item.bidCents)}c <b>Result:</b> ${escapeHtml(result)}</span>`;
  }).join("")}</span>`;
}

function contractShortLabel(value) {
  return escapeHtml(String(value || "").replaceAll("°", "").replace(/\s*to\s*/i, "-").replace(/\s*or above/i, "+").replace(/\s*or below/i, "-"));
}

function shortDate(value) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}/${match[2]}` : escapeHtml(value || "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
