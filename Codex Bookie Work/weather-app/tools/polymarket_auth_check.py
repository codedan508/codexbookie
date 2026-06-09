#!/usr/bin/env python3
import base64
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ed25519


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "credentials" / "POLYMARKET_CLOB.env"


def load_env(path):
    values = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def decode_secret(value):
    text = value.strip()
    if text.startswith("0x"):
        return bytes.fromhex(text[2:])
    if all(char in "0123456789abcdefABCDEF" for char in text) and len(text) >= 64:
        return bytes.fromhex(text)
    normalized = text.replace("-", "+").replace("_", "/")
    padded = normalized + ("=" * ((4 - len(normalized) % 4) % 4))
    return base64.b64decode(padded)


def candidate_secret_bytes(secret):
    candidates = []
    try:
        decoded = decode_secret(secret)
        candidates.append(("base64", decoded[:32]))
    except Exception:
        pass
    raw = secret.encode()
    candidates.append(("ascii-sha256", hashlib.sha256(raw).digest()))
    candidates.append(("ascii-padded", raw.ljust(32, b"\0")[:32]))
    return [(name, value) for name, value in candidates if len(value) == 32]


def auth_headers(values, method, path, secret_bytes):
    timestamp = str(int(time.time() * 1000))
    private_key = ed25519.Ed25519PrivateKey.from_private_bytes(secret_bytes)
    message = f"{timestamp}{method}{path}".encode()
    signature = base64.b64encode(private_key.sign(message)).decode()
    return {
        "X-PM-Access-Key": values["POLYMARKET_API_KEY"],
        "X-PM-Timestamp": timestamp,
        "X-PM-Signature": signature,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def main():
    values = load_env(ENV_PATH)
    if values.get("POLYMARKET_PRIVATE_KEY") and not values.get("POLYMARKET_SECRET_KEY"):
        values["POLYMARKET_SECRET_KEY"] = values["POLYMARKET_PRIVATE_KEY"]
    if values.get("POLYMARKET_ACCESS_KEY") and not values.get("POLYMARKET_API_KEY"):
        values["POLYMARKET_API_KEY"] = values["POLYMARKET_ACCESS_KEY"]
    missing = [key for key in ("POLYMARKET_API_KEY", "POLYMARKET_SECRET_KEY") if not values.get(key)]
    if missing:
        raise SystemExit(f"Missing {', '.join(missing)} in {ENV_PATH}")
    host = values.get("POLYMARKET_US_API_HOST", "https://api.polymarket.us").rstrip("/")
    path = "/v1/account/balances"
    results = []
    for mode, secret_bytes in candidate_secret_bytes(values["POLYMARKET_SECRET_KEY"]):
        request = urllib.request.Request(f"{host}{path}", headers=auth_headers(values, "GET", path, secret_bytes), method="GET")
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                payload = response.read(500)
                print(json.dumps({"ok": True, "mode": mode, "status": response.status, "bytes": len(payload)}))
                return
        except urllib.error.HTTPError as error:
            body = error.read(300).decode("utf-8", errors="replace")
            results.append({"mode": mode, "status": error.code, "body_preview": body[:180]})
    print(json.dumps({"ok": False, "results": results}))
    raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise
