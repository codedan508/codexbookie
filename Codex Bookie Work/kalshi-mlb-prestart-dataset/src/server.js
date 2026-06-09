import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csvLedgerText, getData, report } from "./edge-engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 2030);
const host = process.env.HOST || "127.0.0.1";

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/report") return json(res, 200, await report());
    if (req.method === "POST" && url.pathname === "/api/get-data") return json(res, 200, { ok: true, update: await getData() });
    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      const body = await csvLedgerText();
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=\"polymarket_mlb_2026_prestart_moneyline_ledger.csv\"",
        "cache-control": "no-store"
      });
      return res.end(body);
    }
    if (req.method === "GET") {
      const filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
      if (!filePath.startsWith(publicDir)) return text(res, 403, "Forbidden");
      const body = await fs.readFile(filePath);
      return send(res, 200, body, contentType(filePath));
    }
    return text(res, 404, "Not found");
  } catch (error) {
    return text(res, 500, error.stack || error.message || String(error));
  }
});

server.listen(port, host, () => {
  console.log(`Polymarket MLB Prestart Logger running at http://${host}:${port}`);
});

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

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
