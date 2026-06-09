const els = {
  updatedAt: document.querySelector("#updatedAt"),
  ruleNote: document.querySelector("#ruleNote"),
  bestGrid: document.querySelector("#bestGrid"),
  matchCount: document.querySelector("#matchCount"),
  matchGrid: document.querySelector("#matchGrid"),
  appGrid: document.querySelector("#appGrid"),
  bookieFrame: document.querySelector("#bookieFrame"),
  refreshReports: document.querySelector("#refreshReports"),
  matchingBets: document.querySelector("#matchingBets"),
  getDataAll: document.querySelector("#getDataAll")
};

let lastFoundMatches = [];

els.refreshReports.addEventListener("click", () => loadDashboard("/api/refresh-reports", "POST"));
els.matchingBets.addEventListener("click", runMatchingBets);
els.getDataAll.addEventListener("click", runGetDataAll);
loadDashboard();

async function loadDashboard(url = "/api/dashboard", method = "GET") {
  setBusy(true, method === "POST" ? "Refreshing..." : "");
  try {
    const data = await fetchJson(url, { method });
    renderDashboard(data);
  } finally {
    setBusy(false);
  }
}

async function runGetDataAll() {
  setBusy(true, "Running data pulls...");
  try {
    const data = await fetchJson("/api/get-data-all", { method: "POST" });
    renderDashboard(data);
  } finally {
    setBusy(false);
  }
}

async function runMatchingBets() {
  setBusy(true, "Scanning...");
  lastFoundMatches = [];
  if (els.matchCount) els.matchCount.textContent = "Scanning current MLB lines...";
  if (els.matchGrid) els.matchGrid.innerHTML = `<p class="empty">Checking current MLB markets.</p>`;
  try {
    const data = await fetchJson("/api/matching-bets", { method: "POST" });
    lastFoundMatches = data.matches || [];
    if (els.matchCount) els.matchCount.textContent = formatMatchStatus(data);
    if (els.matchGrid) {
      els.matchGrid.innerHTML = data.matches.length
        ? renderMatchGroups(data.matches)
        : `<p class="empty">No current MLB lines match the source list right now.</p>`;
    }
    reloadBookieFrame();
  } finally {
    setBusy(false);
  }
}

function formatMatchStatus(data) {
  const available = Number(data.matches?.length || 0);
  const rawMatches = Number(data.rawMatches ?? available);
  const hiddenLiveExposure = Number(data.hiddenLiveExposure || 0);
  if (hiddenLiveExposure > 0) {
    return `${available} available · ${hiddenLiveExposure} already open · ${data.eventsChecked} games checked`;
  }
  return `${available} matches / ${data.eventsChecked} games checked`;
}

function renderDashboard(data) {
  els.updatedAt.textContent = formatDateTime(data.generatedAt);
  els.ruleNote.textContent = `${data.minGames}+ games minimum`;
  els.bestGrid.innerHTML = data.best.length
    ? `<div class="source-lines">${data.best.map(renderBestLine).join("")}</div>`
    : `<p class="empty">No qualified positive EV candidates.</p>`;
  els.appGrid.innerHTML = data.apps.map((app) => renderAppCard(app, data.byApp.find((group) => group.appId === app.app.id))).join("");
}

function renderBestLine(item) {
  const recent = [
    Number.isFinite(Number(item.weeklyEvPct)) ? `<span class="${tone(item.weeklyEvPct)}">week ${formatSigned(item.weeklyEvPct)}</span>` : "",
    Number.isFinite(Number(item.monthlyEvPct)) ? `<span class="${tone(item.monthlyEvPct)}">month ${formatSigned(item.monthlyEvPct)}</span>` : ""
  ].join("");
  return `
    <p class="source-line">
      <b>${escapeHtml(item.label)}</b>
      <span>${escapeHtml(item.appName)} · ${escapeHtml(item.gamesLabel || `${item.games}`)} · ${escapeHtml(record(item))}</span>
      <span class="${tone(item.evPct)}">annual ${formatSigned(item.evPct)} EV</span>
      ${recent}
    </p>
  `;
}

function renderMatchGroups(matches) {
  const groups = new Map();
  for (const item of matches) {
    const key = item.eventSlug || item.eventTitle;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].map(renderMatchGroup).join("");
}

function renderMatchGroup(items) {
  const first = items[0];
  return `
    <article class="match-card">
      <div class="match-head">
        <h3>${escapeHtml(first.eventTitle)}</h3>
        <span>${escapeHtml(formatStart(first.startTime))}</span>
      </div>
      <div class="bet-lines">
        ${items.map(renderBetLine).join("")}
      </div>
      <a class="open-link" href="${escapeHtml(first.url)}" target="_blank" rel="noreferrer">Open</a>
    </article>
  `;
}

function renderBetLine(item) {
  return `
    <p>
      <span>${escapeHtml(betLine(item))} - <em>${escapeHtml(formatCents(item.price))}</em></span>
    </p>
  `;
}

function renderAppCard(app, group) {
  const statusClass = app.status === "online" ? "positive" : "negative";
  const best = group?.best || [];
  return `
    <article class="app-card">
      <div class="app-head">
        <div>
          <h3>${escapeHtml(app.app.name)}</h3>
          <p>${escapeHtml(app.app.snapshot)} · ${escapeHtml(app.subtitle || "report")}</p>
          <p class="source-note">Authority: ${escapeHtml(app.app.authority || "MLB")} · Odds feed: ${escapeHtml(app.app.oddsFeed || "current")}</p>
        </div>
        <span class="${statusClass}">${escapeHtml(app.status)}</span>
      </div>
      <dl>
        <div><dt>rows</dt><dd>${app.filledRows ?? "--"} / ${app.rowCount || "--"}</dd></div>
        <div><dt>last pull</dt><dd>${formatUsDate(app.latestPullDate)}<small>updated: ${formatDateTime(app.lastUpdatedAt)}</small></dd></div>
        <div><dt>missing</dt><dd>${app.missingRows || 0}</dd></div>
        <div><dt>qualified</dt><dd>${app.candidateCount || 0}</dd></div>
      </dl>
      ${app.error ? `<p class="error">${escapeHtml(app.error)}</p>` : ""}
      <div class="mini-list">
        ${best.length ? best.map((item) => `<p><b>${escapeHtml(item.label)}</b><span>${formatSigned(item.evPct)} EV · ${escapeHtml(item.gamesLabel || `${item.games}`)}</span></p>`).join("") : `<p><span>No qualified candidate.</span></p>`}
      </div>
      <button type="button" data-app="${escapeHtml(app.app.id)}">Run This App</button>
    </article>
  `;
}

document.addEventListener("click", async (event) => {
  const id = event.target?.dataset?.app;
  if (!id) return;
  setBusy(true, "Running app...");
  try {
    const data = await fetchJson(`/api/get-data/${encodeURIComponent(id)}`, { method: "POST" });
    renderDashboard(data);
  } finally {
    setBusy(false);
  }
});

async function fetchJson(url, options = {}) {
  const headers = options.body ? { "content-type": "application/json", ...(options.headers || {}) } : options.headers;
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? JSON.parse(text) : {};
}

function setBusy(busy, label = "") {
  els.refreshReports.disabled = busy;
  els.matchingBets.disabled = busy;
  els.getDataAll.disabled = busy;
  if (label) els.getDataAll.textContent = label;
  else els.getDataAll.textContent = "Run Get Data";
  els.matchingBets.textContent = busy && label === "Scanning..." ? "Finding..." : "Find Bets";
}

function cleanError(error) {
  return String(error?.message || error || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function reloadBookieFrame() {
  if (!els.bookieFrame) return;
  els.bookieFrame.src = `http://localhost:2010/?t=${Date.now()}`;
}

function record(item) {
  return Number.isFinite(item.wins) && Number.isFinite(item.losses) ? `${item.wins} W | ${item.losses} L` : "--";
}

function matchTitle(item) {
  return [item.displaySide, item.line || "", item.bucket].filter(Boolean).join(" ");
}

function betLine(item) {
  return [item.displaySide, item.line || ""].filter(Boolean).join(" ");
}

function formatSigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatUsDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : "--";
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatStart(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.month}/${parts.day}/${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

function formatCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1)}c`;
}

function tone(value) {
  const number = Number(value);
  if (number > 0) return "positive";
  if (number < 0) return "negative";
  return "neutral";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
