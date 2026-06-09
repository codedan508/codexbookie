const els = {
  sportTitle: document.querySelector("#sportTitle"),
  marketSubtitle: document.querySelector("#marketSubtitle"),
  totalEv: document.querySelector("#totalEv"),
  positiveBuckets: document.querySelector("#positiveBuckets"),
  settledRows: document.querySelector("#settledRows"),
  latestPull: document.querySelector("#latestPull"),
  rowCount: document.querySelector("#rowCount"),
  bucketRows: document.querySelector("#bucketRows"),
  analysisRows: document.querySelector("#analysisRows"),
  getData: document.querySelector("#getData"),
  updateLog: document.querySelector("#updateLog"),
  pairAuditCount: document.querySelector("#pairAuditCount"),
  pairAuditRows: document.querySelector("#pairAuditRows")
};

loadReport();
els.getData.addEventListener("click", runGetData);

async function loadReport() {
  const data = await fetchJson("/api/report");
  els.sportTitle.textContent = data.title;
  els.marketSubtitle.textContent = data.subtitle;
  els.totalEv.textContent = formatSignedPct(data.totalEvPct);
  els.totalEv.className = toneClass(data.totalEvPct);
  els.positiveBuckets.textContent = `${data.positiveBucketCount}`;
  els.settledRows.textContent = `${data.settledRows}`;
  els.latestPull.textContent = formatUsDate(data.latestPullDate);
  els.rowCount.textContent = `${data.buckets.length} buckets / ${data.missingRows || 0} missing audit rows`;
  els.bucketRows.innerHTML = data.buckets.map(renderBucket).join("");
  els.analysisRows.innerHTML = renderAnalysis(data.analysis || {});
  renderUpdateLog(data.updateLog || []);
  renderPairAudit(data.pairedAudit || []);
}

function renderBucket(bucket) {
  const evClass = toneClass(bucket.evPct);
  const weeklyClass = toneClass(bucket.weeklyEvDeltaPct);
  const monthlyClass = toneClass(bucket.monthlyEvDeltaPct);
  return `
    <article class="bucket-card">
      <h3>${escapeHtml(displayLabel(bucket))}</h3>
      <dl class="bucket-lines">
        <div>
          <dt>win rate</dt>
          <dd>${formatPct(bucket.winRatePct)}</dd>
        </div>
        <div>
          <dt>games</dt>
          <dd>${escapeHtml(bucket.gamesLabel || `${bucket.games}`)}</dd>
        </div>
        <div class="weekly-move ${weeklyClass}">
          <dt>weekly</dt>
          <dd>${arrow(bucket.weeklyEvDeltaPct)} ${formatSignedPct(bucket.weeklyEvDeltaPct)} EV</dd>
        </div>
        <div class="monthly-move ${monthlyClass}">
          <dt>monthly</dt>
          <dd>${arrow(bucket.monthlyEvDeltaPct)} ${formatSignedPct(bucket.monthlyEvDeltaPct)} EV</dd>
        </div>
        <div class="main-ev ${evClass}">
          <dt>season</dt>
          <dd>${arrow(bucket.evPct)} ${formatSignedPct(bucket.evPct)} EV</dd>
        </div>
      </dl>
    </article>
  `;
}

function renderAnalysis(analysis) {
  return `
    ${renderAnalysisPanel("Best EV / Sample", analysis.opportunities || [], "confidence")}
    ${renderAnalysisPanel("Pattern Tracker", analysis.patterns || [], "pattern")}
    ${renderAnalysisPanel("Correction Risk", analysis.riskFlags || [], "risk")}
  `;
}

function renderAnalysisPanel(title, items, mode) {
  const body = items.length
    ? items.map((item) => renderAnalysisItem(item, mode)).join("")
    : `<p class="analysis-empty">No strong read yet.</p>`;
  return `
    <article class="analysis-panel">
      <h3>${escapeHtml(title)}</h3>
      <div class="analysis-items">${body}</div>
    </article>
  `;
}

function renderAnalysisItem(item, mode) {
  const evClass = toneClass(item.evPct);
  const weeklyClass = toneClass(item.weeklyEvDeltaPct);
  const monthlyClass = toneClass(item.monthlyEvDeltaPct);
  const score = Number(item.confidenceScore);
  const meta = mode === "confidence"
    ? `score ${Number.isFinite(score) ? score.toFixed(2) : "--"} / ${escapeHtml(item.sampleLabel)}`
    : escapeHtml(item.pattern);
  return `
    <div class="analysis-item">
      <div class="analysis-title">
        <b>${escapeHtml(displayLabel(item))}</b>
        <span>${escapeHtml(item.gamesLabel || `${item.games}/${item.totalGames || item.games}`)} games</span>
      </div>
      <p>${meta}</p>
      <div class="analysis-metrics">
        <span class="${weeklyClass}">week ${arrow(item.weeklyEvDeltaPct)} ${formatSignedPct(item.weeklyEvDeltaPct)}</span>
        <span class="${monthlyClass}">month ${arrow(item.monthlyEvDeltaPct)} ${formatSignedPct(item.monthlyEvDeltaPct)}</span>
        <span class="${evClass}">season ${arrow(item.evPct)} ${formatSignedPct(item.evPct)}</span>
      </div>
    </div>
  `;
}

async function runGetData() {
  els.getData.disabled = true;
  els.getData.textContent = "Getting data...";
  try {
    await fetchJson("/api/get-data", { method: "POST" });
    await loadReport();
  } finally {
    els.getData.disabled = false;
    els.getData.textContent = "Get Data";
  }
}

function renderUpdateLog(log) {
  if (!log.length) {
    els.updateLog.textContent = "No data pulls yet.";
    return;
  }
  els.updateLog.textContent = log.slice(0, 5).map((entry) =>
    `${formatUsDateTime(entry.ranAt)}\n${entry.status}: ${entry.message || ""}\nrows ${entry.rowsAfter || 0}, missing audit ${entry.missingRows || 0}`
  ).join("\n\n");
}

function renderPairAudit(items) {
  const qualified = items.filter((item) => Number(item.games) >= 50);
  els.pairAuditCount.textContent = `${qualified.length} conjoined buckets with 50+ rows`;
  if (!qualified.length) {
    els.pairAuditRows.innerHTML = `<p class="analysis-empty">No paired buckets with 50+ rows yet.</p>`;
    return;
  }
  els.pairAuditRows.innerHTML = qualified.map((item) => {
    const overClass = toneClass(item.overEvPct);
    const underClass = toneClass(item.underEvPct);
    return `
      <article class="pair-audit-card">
        <h3>${escapeHtml(item.pairLabel)}</h3>
        <dl>
          <div>
            <dt>rows</dt>
            <dd>${escapeHtml(item.gamesLabel || `${item.games}`)}</dd>
          </div>
          <div>
            <dt>result split</dt>
            <dd>Over ${escapeHtml(item.overWins)} / Under ${escapeHtml(item.underWins)}</dd>
          </div>
          <div>
            <dt>over EV</dt>
            <dd class="${overClass}">${arrow(item.overEvPct)} ${formatSignedPct(item.overEvPct)}</dd>
          </div>
          <div>
            <dt>under EV</dt>
            <dd class="${underClass}">${arrow(item.underEvPct)} ${formatSignedPct(item.underEvPct)}</dd>
          </div>
        </dl>
      </article>
    `;
  }).join("");
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? JSON.parse(text) : {};
}

function formatSignedPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}%`;
}

function formatPct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : "--";
}

function formatUsDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : "--";
}

function formatUsDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(date);
}

function toneClass(value) {
  const number = Number(value);
  if (number > 0) return "positive";
  if (number < 0) return "negative";
  return "neutral";
}

function arrow(value) {
  const number = Number(value);
  if (number > 0) return "▲";
  if (number < 0) return "▼";
  return "▬";
}

function displayLabel(item) {
  if (item.displayLabel) return item.displayLabel;
  if (item.edgeSide === "Over") {
    const match = String(item.label || "").match(/Over ([0-9]+-[0-9]+)/);
    if (match) return `Over ${item.totalLine || ""} ${match[1]}`.trim();
  }
  if (item.edgeSide === "Under") {
    const match = String(item.label || "").match(/Under ([0-9]+-[0-9]+)/);
    if (match) return `Under ${item.totalLine || ""} ${match[1]}`.trim();
  }
  return item.label || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
