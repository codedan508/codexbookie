#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

from webull.core.client import ApiClient
from webull.data.data_client import DataClient


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


def make_data_client():
    load_env_file(ENV_PATH)
    app_key = required_env("WEBULL_APP_KEY")
    app_secret = required_env("WEBULL_APP_SECRET")
    region_id = os.environ.get("WEBULL_REGION_ID", "us").strip() or "us"
    api_endpoint = os.environ.get("WEBULL_API_ENDPOINT", "").strip()
    api_client = ApiClient(app_key, app_secret, region_id)
    if api_endpoint:
        api_client.add_endpoint(region_id, api_endpoint)
    return DataClient(api_client)


def response_json(response, label):
    if response.status_code != 200:
        raise SystemExit(f"{label} failed with HTTP {response.status_code}: {response.text}")
    return response.json()


def main():
    client = make_data_client()
    categories = response_json(client.instrument.get_event_categories(), "event categories")
    weather_series = response_json(
        client.instrument.get_event_series(category="CLIMATE_WEATHER", page_size=500),
        "CLIMATE_WEATHER series",
    )
    high_temp_series = [
        row for row in weather_series
        if "HIGH" in str(row.get("symbol", "")).upper()
        and "Temperature" in str(row.get("name", ""))
    ]
    payload = {
        "categories": categories,
        "weather_series_count": len(weather_series),
        "high_temperature_series": high_temp_series,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Webull weather discovery failed: {error}", file=sys.stderr)
        raise
