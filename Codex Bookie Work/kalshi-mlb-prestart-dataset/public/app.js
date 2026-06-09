const els = {
  marketSubtitle: document.querySelector("#marketSubtitle"),
  settledRows: document.querySelector("#settledRows"),
  latestPull: document.querySelector("#latestPull"),
  rowCount: document.querySelector("#rowCount"),
  pullUpdated: document.querySelector("#pullUpdated"),
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
  els.marketSubtitle.textContent = data.subtitle;
  els.settledRows.textContent = `${data.settledRows}`;
  els.latestPull.textContent = formatUsDate(data.latestPullDate);
  els.pullUpdated.textContent = `updated: ${formatUsDateTime(data.lastUpdatedAt)}`;
  els.rowCount.textContent = `${data.buckets.length} buckets / ${data.filledRows || 0}/${data.totalRows || 0} filled / ${data.missingRows || 0} blank rows`;
  els.bucketRows.innerHTML = data.buckets.map(renderBucket).join("");
  els.analysisRows.innerHTML = renderAnalysis(data.analysis || {});
  renderPairAudit(data.pairedAudit || []);
  renderUpdateLog(data.updateLog || []);
}

function renderBucket(bucket) {
  const evClass = toneClass(bucket.evPct);
  const weeklyClass = toneClass(bucket.weeklyEvDeltaPct);
  const monthlyClass = toneClass(bucket.monthlyEvDeltaPct);
  return `
    <article class="bucket-card">
      <h3>${escapeHtml(bucket.displayLabel || bucket.label)}</h3>
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
    ${renderAnalysisPanel("Correcting", analysis.riskFlags || [], "risk")}
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
  const meta = mode === "confidence" ? stabilityText(item) : escapeHtml(item.pattern || "");
  if (mode === "pattern") return renderPatternItem(item, weeklyClass, monthlyClass, evClass);
  return `
    <div class="analysis-item">
      <div class="analysis-title">
        <b>${escapeHtml(item.displayLabel || item.label)}</b>
        <span>${escapeHtml(item.gamesLabel || `${item.games}`)} games</span>
      </div>
      <p>${meta}</p>
      <div class="analysis-metrics">
        <span>${escapeHtml(winLossRecord(item))}</span>
        <span class="${weeklyClass}">week ${arrow(item.weeklyEvDeltaPct)} ${formatSignedPct(item.weeklyEvDeltaPct)}</span>
        <span class="${monthlyClass}">month ${arrow(item.monthlyEvDeltaPct)} ${formatSignedPct(item.monthlyEvDeltaPct)}</span>
        <span class="${evClass}">season ${arrow(item.evPct)} ${formatSignedPct(item.evPct)}</span>
      </div>
    </div>
  `;
}

function renderPatternItem(item, weeklyClass, monthlyClass, evClass) {
  const indication = parseIndication(item.indicationRead || item.nextRead || "");
  return `
    <div class="analysis-item pattern-card">
      <div class="analysis-title">
        <b>${escapeHtml(item.displayLabel || item.label)}</b>
        <span>${escapeHtml(item.gamesLabel || `${item.games}`)} games</span>
      </div>
      <div class="pattern-callout">
        <span>${escapeHtml(item.patternType || "tracked move")}</span>
        <b>${formatWholePct(item.patternStrengthPct)}</b>
      </div>
      <div class="pattern-bullet">
        <span class="bullet-dot"></span>
        <span class="bullet-date">${escapeHtml(indication.date)}</span>
        <span class="bullet-label">indication</span>
        <b>${escapeHtml(indication.read)}</b>
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

function renderPairAudit(items) {
  const qualified = items.filter((item) => Number(item.games) >= 50);
  els.pairAuditCount.textContent = `${qualified.length} conjoined buckets with 50+ rows`;
  if (!qualified.length) {
    els.pairAuditRows.innerHTML = `<p class="analysis-empty">No paired buckets with 50+ rows yet.</p>`;
    return;
  }
  els.pairAuditRows.innerHTML = qualified.map((item) => `
    <article class="pair-audit-card">
      <h3>${escapeHtml(item.pairLabel)}</h3>
      <dl>
        <div>
          <dt>rows</dt>
          <dd>${escapeHtml(item.gamesLabel || `${item.games}`)}</dd>
        </div>
        <div>
          <dt>result split</dt>
          <dd>Home ${escapeHtml(item.homeWins)} / Away ${escapeHtml(item.awayWins)}</dd>
        </div>
        <div>
          <dt>home EV</dt>
          <dd class="${toneClass(item.homeEvPct)}">${arrow(item.homeEvPct)} ${formatSignedPct(item.homeEvPct)}</dd>
        </div>
        <div>
          <dt>away EV</dt>
          <dd class="${toneClass(item.awayEvPct)}">${arrow(item.awayEvPct)} ${formatSignedPct(item.awayEvPct)}</dd>
        </div>
      </dl>
    </article>
  `).join("");
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

function formatWholePct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : "--";
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

function directionClass(direction) {
  if (direction === "up") return "read-up";
  if (direction === "down") return "read-down";
  return "read-watch";
}

function parseIndication(value) {
  const match = String(value || "").match(/^([^:]+):\s*(.+)$/);
  return {
    date: match ? match[1] : "",
    read: match ? match[2] : value
  };
}

function winLossRecord(item) {
  const wins = Number(item.wins);
  const losses = Number(item.losses);
  if (!Number.isFinite(wins) || !Number.isFinite(losses)) return "--";
  return `${wins} W | ${losses} L`;
}

function stabilityText(item) {
  const winsOver = Number(item.winsOverBreakEven);
  const lower = Number(item.lowerEvPct);
  const parts = [`record ${winLossRecord(item)}`];
  if (Number.isFinite(winsOver)) parts.push(`${winsOver >= 0 ? "+" : ""}${winsOver.toFixed(1)} wins vs price`);
  if (Number.isFinite(lower)) parts.push(`lower EV ${formatSignedPct(lower)}`);
  return escapeHtml(parts.join(" / "));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
