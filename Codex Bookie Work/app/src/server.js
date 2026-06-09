import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAccountSnapshot, fetchMlbSlateForDate, normalizeSettings, offerFoundBets, readState, reconcileOrderState, runScan, validateFoundMatches, writeState } from "./bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 2010);
const commandCenterBase = process.env.COMMAND_CENTER_BASE || "http://localhost:2040";

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/state") {
      const state = await readState();
      state.settings = normalizeSettings(state.settings || {});
      try {
        const snapshot = await fetchAccountSnapshot();
        reconcileOrderState(state, snapshot.openOrders, snapshot.positions);
        state.account = snapshot.account;
        state.positionsLive = snapshot.positions;
        state.openOrdersLive = snapshot.openOrders;
        state.accountError = "";
      } catch (error) {
        state.accountError = error.message || String(error);
      }
      await writeLocalState(state);
      return json(res, 200, state);
    }
    if (req.method === "GET" && url.pathname === "/api/mlb-slate") {
      const date = url.searchParams.get("date");
      if (!date) return text(res, 400, "Missing date");
      return json(res, 200, { date, slate: await fetchMlbSlateForDate(date) });
    }
    if (req.method === "GET" && url.pathname === "/api/matching-bets") {
      const result = await fetchJson(`${commandCenterBase}/api/matching-bets`, { method: "POST", timeoutMs: 60_000 });
      const validated = await validateFoundMatches(result.matches || [], { excludeLiveExposure: true });
      return json(res, 200, {
        ...result,
        commandCenterMatches: Array.isArray(result.matches) ? result.matches.length : 0,
        liveBucketSkipped: validated.skipped.length,
        liveBucketSkipReasons: validated.skipped.reduce((counts, item) => {
          counts[item.reason || "skipped"] = (counts[item.reason || "skipped"] || 0) + 1;
          return counts;
        }, {}),
        skipped: validated.skipped,
        matches: validated.matches
      });
    }
    if (req.method === "POST" && url.pathname === "/api/refresh-reports") {
      const result = await fetchJson(`${commandCenterBase}/api/refresh-reports`, { method: "POST", timeoutMs: 60_000 });
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      const state = await readState();
      const body = await readJson(req);
      state.settings = normalizeSettings({ ...state.settings, ...body });
      await writeState(state);
      return json(res, 200, { ok: true, settings: state.settings });
    }
    if (req.method === "POST" && url.pathname === "/api/scan") {
      const result = await runScan("manual-ui");
      return json(res, 200, { ok: true, result });
    }
    if (req.method === "POST" && url.pathname === "/api/found-bets") {
      const body = await readJson(req);
      const result = await offerFoundBets(body.matches || [], "command-center-found-bets");
      return json(res, 200, { ok: true, result });
    }
    if (req.method === "GET") {
      const filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
      if (!filePath.startsWith(publicDir)) return text(res, 403, "Forbidden");
      const body = await fs.readFile(filePath);
      return send(res, 200, body, contentType(filePath));
    }
    return text(res, 404, "Not found");
  } catch (error) {
    const message = error.message || String(error);
    const status = message.includes("Trigger Safety is BETS OFF") ? 409 : 500;
    return text(res, status, message);
  }
});

server.listen(port, () => {
  console.log(`Polymarket MLB Maker Bot UI running at http://localhost:${port}`);
});

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const textBody = Buffer.concat(chunks).toString("utf8");
  return textBody ? JSON.parse(textBody) : {};
}

async function fetchJson(url, { method = "GET", timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, signal: controller.signal, headers: { accept: "application/json" } });
    const textBody = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${textBody.slice(0, 200)}`);
    return textBody ? JSON.parse(textBody) : {};
  } finally {
    clearTimeout(timeout);
  }
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
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "pragma": "no-cache",
    "expires": "0"
  });
  res.end(body);
}

async function writeLocalState(state) {
  const localState = { ...state };
  delete localState.account;
  delete localState.accountError;
  delete localState.positionsLive;
  delete localState.openOrdersLive;
  await writeState(localState);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function isPastEtOffer(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(time))) return true;
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const hhmm = `${parts.hour}:${parts.minute}`;
  return String(date) < today || (String(date) === today && String(time) <= hhmm);
}
