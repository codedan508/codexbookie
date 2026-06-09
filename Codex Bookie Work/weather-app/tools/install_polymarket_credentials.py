#!/usr/bin/env python3
import os
import base64
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_CANDIDATES = [
    Path.home() / "Desktop" / "Prediction Weather Polymarket API" / "POLYMARKET_API_INFO_PASTE_HERE.txt",
    ROOT / "POLYMARKET_API_INFO_PASTE_HERE.txt",
]
TARGET = ROOT / "credentials" / "POLYMARKET_CLOB.env"
REQUIRED_KEYS = {
    "POLYMARKET_API",
    "POLYMARKET_ACCESS_KEY",
    "POLYMARKET_API_KEY",
    "POLYMARKET_SECRET_KEY",
    "POLYMARKET_PRIVATE_KEY",
}


def parse_env_lines(text):
    values = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in REQUIRED_KEYS:
            continue
        parts = [value.strip().strip('"').strip("'")]
        # Polymarket's developer portal sometimes wraps long keys across lines
        # when pasted from a browser. Join continuation lines until blank or the
        # next POLYMARKET_* assignment.
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt:
                break
            if nxt.startswith("POLYMARKET_") and "=" in nxt:
                break
            parts.append(nxt.strip('"').strip("'"))
            i += 1
            if nxt.endswith("="):
                break
        values[key] = "".join(parts)
    return values


def validate(values):
    errors = []
    if not (values.get("POLYMARKET_ACCESS_KEY") or values.get("POLYMARKET_API_KEY") or values.get("POLYMARKET_API")):
        errors.append("POLYMARKET_ACCESS_KEY is blank")
    secret_key = values.get("POLYMARKET_SECRET_KEY") or values.get("POLYMARKET_PRIVATE_KEY")
    if not secret_key:
        errors.append("POLYMARKET_SECRET_KEY is blank")
    return errors


def decode_secret(value):
    text = value.strip()
    if text.startswith("0x"):
        return bytes.fromhex(text[2:])
    if all(char in "0123456789abcdefABCDEF" for char in text) and len(text) >= 64:
        return bytes.fromhex(text)
    normalized = text.replace("-", "+").replace("_", "/")
    padded = normalized + ("=" * ((4 - len(normalized) % 4) % 4))
    return base64.b64decode(padded)


def main():
    source = next((path for path in SOURCE_CANDIDATES if path.exists()), None)
    if not source:
        raise SystemExit("Could not find the Polymarket paste file on Desktop or in the project folder.")
    values = parse_env_lines(source.read_text(encoding="utf-8"))
    errors = validate(values)
    if errors:
        raise SystemExit("Polymarket credential file needs fixing:\n- " + "\n- ".join(errors))
    normalized = {
        "POLYMARKET_US_API_HOST": "https://api.polymarket.us",
        "POLYMARKET_US_GATEWAY_HOST": "https://gateway.polymarket.us",
        "POLYMARKET_CHAIN_ID": "137",
        "POLYMARKET_ACCESS_KEY": values.get("POLYMARKET_ACCESS_KEY") or values.get("POLYMARKET_API_KEY") or values.get("POLYMARKET_API") or "",
        "POLYMARKET_API_KEY": values.get("POLYMARKET_ACCESS_KEY") or values.get("POLYMARKET_API_KEY") or values.get("POLYMARKET_API") or "",
        "POLYMARKET_SECRET_KEY": values.get("POLYMARKET_SECRET_KEY") or values.get("POLYMARKET_PRIVATE_KEY") or "",
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text("\n".join(f"{key}={value}" for key, value in normalized.items()) + "\n", encoding="utf-8")
    os.chmod(TARGET, 0o600)
    filled_api = bool(normalized["POLYMARKET_ACCESS_KEY"])
    filled_secret = bool(normalized["POLYMARKET_SECRET_KEY"])
    print(f"Saved {TARGET}")
    print(f"Access key present: {'yes' if filled_api else 'no'}")
    print(f"Secret key present: {'yes' if filled_secret else 'no'}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise
