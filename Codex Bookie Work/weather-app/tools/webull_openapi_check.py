#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

from webull.core.client import ApiClient
from webull.trade.trade_client import TradeClient


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "credentials" / "WEBULL_OPENAPI.env"


def load_env_file(path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def required_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing {name}. Put it in {ENV_PATH}")
    return value


def main():
    load_env_file(ENV_PATH)
    app_key = required_env("WEBULL_APP_KEY")
    app_secret = required_env("WEBULL_APP_SECRET")
    region_id = os.environ.get("WEBULL_REGION_ID", "us").strip() or "us"
    api_endpoint = os.environ.get("WEBULL_API_ENDPOINT", "").strip()

    api_client = ApiClient(app_key, app_secret, region_id)
    if api_endpoint:
        api_client.add_endpoint(region_id, api_endpoint)

    trade_client = TradeClient(api_client)
    response = trade_client.account_v2.get_account_list()

    print(f"HTTP status: {response.status_code}")
    try:
        payload = response.json()
    except Exception:
        payload = response.text

    print(json.dumps(payload, indent=2, sort_keys=True) if not isinstance(payload, str) else payload)
    if response.status_code != 200:
        raise SystemExit("Webull account-list check did not succeed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Webull OpenAPI check failed: {error}", file=sys.stderr)
        raise
