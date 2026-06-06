const els = {
  contracts: document.querySelector("#contractsPerOrder"),
  sellBets: document.querySelector("#sellBetsButton"),
  orders: document.querySelector("#orders"),
  ordersCount: document.querySelector("#ordersCount"),
  refreshAccount: document.querySelector("#refreshAccount"),
  positions: document.querySelector("#positions"),
  positionsStatus: document.querySelector("#positionsStatus"),
  scanNoBet: document.querySelector("#scanNoBet"),
  scanNow: document.querySelector("#scanNow"),
  slate: document.querySelector("#mlbSlate"),
  slateStatus: document.querySelector("#slateStatus"),
  offerResult: document.querySelector("#offerResult"),
  evBins: document.querySelector("#evBins"),
  evBinsStatus: document.querySelector("#evBinsStatus"),
  evSport: document.querySelector("#evSport"),
  evType: document.querySelector("#evType"),
  evMin: document.querySelector("#evMin"),
  evMax: document.querySelector("#evMax"),
  addEvBin: document.querySelector("#addEvBin"),
  getReports: document.querySelector("#getReports"),
  attachedGrid: document.querySelector("#attachedGrid")
};

let settings = null;
let stateRequestInFlight = null;
let slateRequestInFlight = null;
let currentMatches = [];

init();

async function init() {
  els.contracts.addEventListener("change", saveSettings);
  els.sellBets.addEventListener("click", toggleSellBets);
  els.scanNoBet.addEventListener("click", scanNoBet);
  els.scanNow.addEventListener("click", offerBets);
  els.refreshAccount.addEventListener("click", refreshAccount);
  els.addEvBin.addEventListener("click", addEvBin);
  els.getReports.addEventListener("click", getReports);
  await loadState();
  await getReports();
}

async function loadState(options = {}) {
  if (stateRequestInFlight) return stateRequestInFlight;
  stateRequestInFlight = loadStateInner(options).finally(() => {
    stateRequestInFlight = null;
  });
  return stateRequestInFlight;
}

async function loadStateInner({ includeSlate = true } = {}) {
  const state = await fetchJson(`/api/state?t=${Date.now()}`);
  settings = state.settings;
  renderSettings();
  renderAccount(state.account || {});
  renderOrders(state.openOrdersLive || [], state.accountError || "");
  renderPositions(state.positionsLive || [], state.accountError || "");
  if (includeSlate) await loadMatches();
  return state;
}

function renderSettings() {
  els.contracts.value = settings.contractsPerOrder;
  els.sellBets.className = settings.sellBetsEnabled ? "sell-status active" : "sell-status inactive";
  els.sellBets.querySelector("b").textContent = settings.sellBetsEnabled ? "BETS ON" : "BETS OFF";
  renderEvBins();
}

function renderAccount(account) {
  document.querySelector("#accountTotal").textContent = account.accountTotal || "--";
  document.querySelector("#openPositions").textContent = account.openPositions || "0";
  document.querySelector("#pendingOrderTotal").textContent = account.pendingOrderTotal || "--";
  document.querySelector("#openCash").textContent = account.openCash || "--";
}

function renderOrders(orders, error) {
  if (error) {
    els.ordersCount.textContent = "API error";
    els.orders.textContent = cleanError(error);
    return;
  }
  const entries = Array.isArray(orders) ? orders : Object.values(orders || {});
  els.ordersCount.textContent = `${entries.length} open`;
  els.orders.textContent = entries.length ? entries.slice(-12).map(formatOrder).join("\n\n") : "No open orders.";
}

function formatOrder(order) {
  if (!order.targetTeam && !order.ruleName) return formatLiveOrder(order);
  return [
    `${order.matchup || order.marketSlug || ""}`,
    `${order.targetTeam || "Team"}`,
    `maker order ${formatMoneyCents(order.limitCents ?? order.makerBidCents)}   contracts ${order.quantity || "--"}`
  ].filter(Boolean).join("\n");
}

function formatLiveOrder(order) {
  const meta = order.marketMetadata || {};
  const title = meta.title || order.title || order.marketSlug || "Open order";
  const outcome = meta.outcome || meta.team?.name || order.outcome || order.marketOutcome || "";
  const price = moneyValue(order.price) || moneyValue(order.limitPrice) || moneyValue(order.originalPrice) || "--";
  const qty = order.leavesQuantity || order.remainingQuantity || order.quantity || order.originalQuantity || "--";
  return [
    outcome ? `${title} | ${outcome}` : title,
    `maker order ${price}   contracts ${trimNumber(qty)}`
  ].filter(Boolean).join("\n");
}

function renderPositions(positions, error) {
  if (error) {
    els.positionsStatus.textContent = "API error";
    els.positions.textContent = cleanError(error);
    return;
  }
  els.positionsStatus.textContent = `${positions.length} open`;
  els.positions.textContent = positions.length ? positions.map(formatPosition).join("\n\n") : "No open positions.";
}

function formatPosition(position) {
  const meta = position.marketMetadata || {};
  const team = meta.outcome || meta.team?.name || meta.title || position.marketSlug || "Position";
  const title = meta.title && meta.title !== team ? `${meta.title} | ${team}` : team;
  const qty = position.qtyAvailableDecimal || position.netPositionDecimal || position.netPosition || "--";
  const avg = moneyValue(position.avgPx) || moneyValue(position.costPerShare) || "--";
  const value = moneyValue(position.cashValue) || "--";
  const cost = moneyValue(position.cost) || "--";
  return [
    title,
    `qty ${trimNumber(qty)}   avg ${avg}   value ${value}   cost ${cost}`
  ].filter(Boolean).join("\n");
}

function moneyValue(amount) {
  if (!amount) return "";
  const raw = typeof amount === "object" ? amount.value : amount;
  const value = Number(raw);
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "";
}

function trimNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(4)));
}

async function saveSettings() {
  settings.contractsPerOrder = Number(els.contracts.value);
  settings.makerBidOffsetCents = 0;
  await fetchJson("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
}

async function saveSettingsAndReloadSlate() {
  await saveSettings();
  renderEvBins();
  await loadMatches();
}

function renderEvBins() {
  const rules = Array.isArray(settings?.rules) ? settings.rules.filter((rule) => rule.enabled !== false) : [];
  els.evBinsStatus.textContent = `${rules.length} active`;
    els.evBins.innerHTML = rules.length ? rules.map((rule) => `
    <div class="ev-bin">
      <span>${escapeHtml(formatRule(rule))}</span>
      <button class="x ev-remove" type="button" data-rule-id="${escapeAttr(rule.id)}" aria-label="Remove ${escapeAttr(formatRule(rule))}"></button>
    </div>
  `).join("") : `<div class="ev-empty">No manual offers active.</div>`;
  els.evBins.querySelectorAll(".ev-remove").forEach((button) => {
    button.addEventListener("click", async () => {
      settings.rules = (settings.rules || []).filter((rule) => rule.id !== button.dataset.ruleId);
      await saveSettingsAndReloadSlate();
    });
  });
}

async function addEvBin() {
  const sport = els.evSport.value;
  const type = parseEvType(els.evType.value);
  const min = Math.round(Number(els.evMin.value));
  const max = Math.round(Number(els.evMax.value));
  if (sport !== "mlb" || !type || !Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 99 || min >= max) return;
  const labelSide = ruleLabel(type);
  settings.rules = [
    ...(settings.rules || []),
    {
      id: `${sport}_${type.market}_${type.side}_${String(type.line || "").replace(".", "pt")}_${min}_${max}_${Date.now()}`,
      name: `${labelSide} ${min}-${max}c`,
      sport,
      market: type.market,
      side: type.side,
      line: type.line,
      min,
      max,
      enabled: true
    }
  ];
  els.evMin.value = "";
  els.evMax.value = "";
  await saveSettingsAndReloadSlate();
}

function formatRule(rule) {
  const sport = String(rule.sport || "MLB").toUpperCase();
  if (rule.market === "first_inning_run") {
    const side = rule.side === "yes" ? "YRFI" : "NRFI";
    return `${sport} ${side} ${rule.min}-${rule.max}c`;
  }
  if (rule.market === "totals") {
    const side = rule.side === "over" ? "Over" : "Under";
    return `${sport} ${side} ${Number(rule.line).toFixed(1)} ${rule.min}-${rule.max}c`;
  }
  const side = rule.side === "away" ? "Away" : "Home";
  return `${sport} Moneyline ${side} ${rule.min}-${rule.max}c`;
}

function parseEvType(value) {
  const raw = String(value || "");
  if (raw === "moneyline_home") return { market: "moneyline", side: "home" };
  if (raw === "moneyline_away") return { market: "moneyline", side: "away" };
  if (raw === "first_inning_run_yes") return { market: "first_inning_run", side: "yes" };
  if (raw === "first_inning_run_no") return { market: "first_inning_run", side: "no" };
  const totalMatch = raw.match(/^totals_(over|under)_(\d+)pt(\d+)$/);
  if (totalMatch) return { market: "totals", side: totalMatch[1], line: Number(`${totalMatch[2]}.${totalMatch[3]}`) };
  return null;
}

function ruleLabel(rule) {
  if (rule.market === "moneyline") return rule.side === "away" ? "Away" : "Home";
  if (rule.market === "first_inning_run") return rule.side === "yes" ? "YRFI" : "NRFI";
  if (rule.market === "totals") return `${rule.side === "over" ? "Over" : "Under"} ${Number(rule.line).toFixed(1)}`;
  return "";
}

async function toggleSellBets() {
  settings.sellBetsEnabled = !settings.sellBetsEnabled;
  renderSettings();
  await saveSettings();
}

async function refreshAccount() {
  const originalText = els.refreshAccount.textContent;
  els.refreshAccount.disabled = true;
  els.refreshAccount.textContent = "Refreshing";
  try {
    await loadState({ includeSlate: false });
  } finally {
    els.refreshAccount.disabled = false;
    els.refreshAccount.textContent = originalText;
  }
}

async function offerBets() {
  if (!currentMatches.length) return;
  const originalText = els.scanNow.textContent;
  els.scanNow.disabled = true;
  els.scanNow.textContent = "Offering...";
  try {
    const body = await fetchJson("/api/found-bets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matches: currentMatches })
    });
    const freshState = await loadState();
    renderOfferResult(body.result || {}, freshState);
  } catch (error) {
    els.positionsStatus.textContent = "API error";
    els.positions.textContent = cleanError(error);
    els.offerResult.textContent = cleanError(error);
  } finally {
    els.scanNow.disabled = false;
    els.scanNow.textContent = originalText;
  }
}

function renderOfferResult(result, state = {}) {
  const requested = Number(result.requestedMatches || currentMatches.length || 0);
  const accepted = Array.isArray(result.placed) ? result.placed.length : 0;
  const skipped = Array.isArray(result.skipped) ? result.skipped.length : 0;
  const liveOpen = Array.isArray(state.openOrdersLive) ? state.openOrdersLive.length : null;
  const reasons = {};
  for (const item of result.skipped || []) {
    reasons[item.reason || "skipped"] = (reasons[item.reason || "skipped"] || 0) + 1;
  }
  const reasonText = Object.entries(reasons)
    .map(([reason, count]) => `${count} ${reason.replaceAll("_", " ")}`)
    .join(" · ");
  els.offerResult.textContent = `Last offer: ${requested} requested · ${accepted} accepted · ${skipped} skipped${liveOpen == null ? "" : ` · ${liveOpen} live open`}${reasonText ? ` (${reasonText})` : ""}`;
}

async function loadMatches() {
  if (slateRequestInFlight) return slateRequestInFlight;
  slateRequestInFlight = loadMatchesInner().finally(() => {
    slateRequestInFlight = null;
  });
  return slateRequestInFlight;
}

async function loadMatchesInner() {
  els.slateStatus.textContent = "Loading";
  els.slate.innerHTML = "";
  currentMatches = [];
  updateOfferButton();
  try {
    const body = await fetchJson(`/api/matching-bets?t=${Date.now()}`);
    const matches = body.matches || [];
    const rawMatches = Number(body.rawMatches ?? matches.length);
    const hiddenLiveExposure = Number(body.hiddenLiveExposure || 0);
    const liveBucketSkipped = Number(body.liveBucketSkipped || 0);
    currentMatches = matches;
    els.slateStatus.textContent = formatMatchStatus(matches.length, rawMatches, hiddenLiveExposure, liveBucketSkipped);
    if (!matches.length) {
      els.slate.textContent = "No matching bets found.";
      updateOfferButton();
      return;
    }
    els.slate.innerHTML = matches.map(renderMatchLine).join("");
    updateOfferButton();
  } catch (error) {
    els.slateStatus.textContent = "Offline";
    els.slate.textContent = cleanError(error);
    updateOfferButton();
  }
}

async function scanNoBet() {
  const originalText = els.scanNoBet.textContent;
  els.scanNoBet.disabled = true;
  els.scanNoBet.textContent = "Scanning...";
  try {
    await loadState({ includeSlate: false });
    await loadMatches();
  } finally {
    els.scanNoBet.disabled = false;
    els.scanNoBet.textContent = originalText;
  }
}

async function getReports() {
  const originalText = els.getReports.textContent;
  els.getReports.disabled = true;
  els.getReports.textContent = "Getting...";
  try {
    const data = await fetchJson("/api/refresh-reports", { method: "POST" });
    renderAttachedReports(data);
    await loadMatches();
  } finally {
    els.getReports.disabled = false;
    els.getReports.textContent = originalText;
  }
}

function renderAttachedReports(data = {}) {
  const groups = Array.isArray(data.byApp) ? data.byApp : [];
  const reports = Array.isArray(data.apps) ? data.apps : [];
  if (!reports.length) return;
  els.attachedGrid.innerHTML = reports.map((report) => {
    const group = groups.find((item) => item.appId === report.app?.id);
    return renderAttachedReport(report, group);
  }).join("");
}

function renderAttachedReport(report, group) {
  const app = report.app || {};
  const best = Array.isArray(group?.best) ? group.best.slice(0, 3) : [];
  const statusClass = report.status === "online" ? "online" : "offline";
  return `
    <article class="attached-card report-card">
      <div class="attached-report-head">
        <a href="${escapeAttr(app.baseUrl || "#")}" target="_blank" rel="noreferrer">${escapeHtml(app.name || "Attached App")}</a>
        <span class="${statusClass}">${escapeHtml(report.status || "unknown")}</span>
      </div>
      <p>${escapeHtml(report.subtitle || app.snapshot || "report")}</p>
      <dl>
        <div><dt>rows</dt><dd>${escapeHtml(report.filledRows ?? "--")} / ${escapeHtml(report.rowCount || "--")}</dd></div>
        <div><dt>last pull</dt><dd>${escapeHtml(formatReportDate(report.latestPullDate))}</dd></div>
        <div><dt>missing</dt><dd>${escapeHtml(report.missingRows || 0)}</dd></div>
        <div><dt>qualified</dt><dd>${escapeHtml(report.candidateCount || 0)}</dd></div>
      </dl>
      <div class="attached-best">
        ${best.length ? best.map((item) => `<p><b>${escapeHtml(formatCandidateAction(item))}</b><span>${escapeHtml(formatSignedPct(item.evPct))} EV · ${escapeHtml(item.gamesLabel || `${item.games || "--"}`)}</span></p>`).join("") : `<p><span>No qualified candidate.</span></p>`}
      </div>
    </article>
  `;
}

function formatCandidateAction(item = {}) {
  const label = String(item.label || "");
  const totalCap = label.match(/\b(Over|Under)\s+(\d+(?:\.\d+)?)\s+<=\s*(\d+(?:\.\d+)?)c/i);
  if (totalCap) return `Take ${titleCase(totalCap[1])} ${totalCap[2]} at ${totalCap[3]}c or less`;

  const yrfiPair = label.match(/\bYes\s+(\d+-\d+)\s+\/\s+No\s+(\d+-\d+)/i);
  if (yrfiPair) {
    const side = Number(item.wins || 0) >= Number(item.losses || 0) ? "YRFI" : "NRFI";
    const bucket = side === "YRFI" ? yrfiPair[1] : yrfiPair[2];
    return `Take ${side}: ${side === "YRFI" ? "Yes" : "No"} price ${bucket}c`;
  }

  const moneyline = label.match(/\b(Home|Away)\s+(\d+-\d+)/i);
  if (moneyline) return `Take ${titleCase(moneyline[1])} team at ${moneyline[2]}c`;

  return label;
}

function formatMatchStatus(available, rawMatches, hiddenLiveExposure, liveBucketSkipped = 0) {
  if (liveBucketSkipped > 0) {
    return `${available} live · ${liveBucketSkipped} moved · ${hiddenLiveExposure} already open`;
  }
  if (hiddenLiveExposure > 0) {
    return `${available} available · ${hiddenLiveExposure} already open`;
  }
  return `${available} found`;
}

function updateOfferButton() {
  els.scanNow.disabled = !currentMatches.length;
  els.scanNow.textContent = "Offer Bets";
}

function renderMatchLine(match) {
  return `
    <div class="slate-game targeted">
      <div class="slate-line">
        <span>${escapeHtml(match.eventTitle || match.marketQuestion || "")}</span>
        <i class="slate-marker active" aria-label="Found bet"></i>
      </div>
      <div class="slate-odds">${escapeHtml(formatFoundBet(match))}</div>
    </div>
  `;
}

function formatFoundBet(match) {
  const line = [match.displaySide, match.line || ""].filter(Boolean).join(" ");
  const price = formatBid(match.price);
  const ev = Number.isFinite(Number(match.criterionEvPct)) ? ` | ${Number(match.criterionEvPct).toFixed(2)}% EV` : "";
  return `${line} ${price}c | ${match.sourceApp || ""}${ev}`;
}

function renderSlateGame(game) {
  const matches = slatePocketMatches(game);
  const hasLiveExposure = Boolean(game.hasLiveExposure || (game.targets || []).some((target) => target.hasLiveExposure));
  const markerClass = hasLiveExposure ? "check" : matches.length ? "active" : "";
  const markerLabel = hasLiveExposure ? "Order or position live" : matches.length ? "Target pocket" : "";
  const targetText = matches.map((match) => `${match.team} ${match.bid}c ${match.name}`).join(" | ");
  return `
    <div class="slate-game ${hasLiveExposure ? "covered" : matches.length ? "targeted" : ""}" title="${escapeAttr(targetText)}">
      <div class="slate-line">
        <span>${escapeHtml(game.away)} @ ${escapeHtml(game.home)}</span>
        <i class="slate-marker ${markerClass}" aria-label="${markerLabel}"></i>
      </div>
      <div class="slate-odds">${formatBid(game.awayBid)} / ${formatBid(game.homeBid)}</div>
    </div>
  `;
}

function slatePocketMatches(game) {
  if (game.started) return [];
  const rules = settings?.rules || [];
  return rules.flatMap((rule) => {
    if ((rule.sport || "mlb") !== "mlb") return [];
    let bid = null;
    let team = "";
    if ((rule.market || "moneyline") === "moneyline") {
      bid = rule.side === "away" ? game.awayBid : game.homeBid;
      team = rule.side === "away" ? game.away : game.home;
    } else if (rule.market === "first_inning_run") {
      bid = rule.side === "yes" ? game.yrfiBid : game.nrfiBid;
      team = rule.side === "yes" ? "YRFI" : "NRFI";
    } else if (rule.market === "totals") {
      const total = (game.totals || []).find((item) => Number(item.line) === Number(rule.line));
      bid = rule.side === "over" ? total?.overBid : total?.underBid;
      team = `${rule.side === "over" ? "Over" : "Under"} ${Number(rule.line).toFixed(1)}`;
    } else {
      return [];
    }
    if (bid == null || bid < rule.min || bid > rule.max) return [];
    return [{
      side: rule.side,
      team,
      bid,
      name: rule.name
    }];
  });
}

function cleanError(error) {
  const message = error?.message || String(error || "");
  if (message.includes("failed 429") || message.includes("Error 1015") || message.includes("rate limited")) {
    return "Polymarket rate limited account refresh. Orders may still be placed; refresh later.";
  }
  return message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 260);
}

function formatBid(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
}

function formatMoneyCents(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${(number / 100).toFixed(2)}` : "--";
}

function formatReportDate(value) {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatSignedPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}%`;
}

function titleCase(value) {
  const text = String(value || "").toLowerCase();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function formatCancelTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function todayEtDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? JSON.parse(text) : {};
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
