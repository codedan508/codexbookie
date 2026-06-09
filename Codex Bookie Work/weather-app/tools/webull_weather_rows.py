#!/usr/bin/env python3
import contextlib
import json
import os
import sys
from pathlib import Path

from webull.core.client import ApiClient
from webull.data.data_client import DataClient


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "credentials" / "WEBULL_OPENAPI.env"


MONTHS = {
    "JAN": "01",
    "FEB": "02",
    "MAR": "03",
    "APR": "04",
    "MAY": "05",
    "JUN": "06",
    "JUL": "07",
    "AUG": "08",
    "SEP": "09",
    "OCT": "10",
    "NOV": "11",
    "DEC": "12",
}


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


def chunks(values, size):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def date_from_symbol(symbol):
    import re

    match = re.search(r"-(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{1,2})(?:-|$)", str(symbol).upper())
    if not match:
        return ""
    year = 2000 + int(match.group(1))
    month = MONTHS[match.group(2)]
    day = int(match.group(3))
    return f"{year}-{month}-{day:02d}"


def market_row(instrument, snapshot):
    symbol = instrument.get("symbol", "")
    return {
        "id": instrument.get("instrument_id") or symbol,
        "symbol": symbol,
        "ticker": symbol,
        "eventSymbol": instrument.get("event_symbol", ""),
        "seriesSymbol": instrument.get("series_symbol", ""),
        "question": instrument.get("name") or instrument.get("event_name") or "",
        "name": instrument.get("name") or instrument.get("event_name") or "",
        "yesLabel": instrument.get("yes_condition") or "",
        "date": date_from_symbol(symbol) or date_from_symbol(instrument.get("event_symbol", "")),
        "yesPrice": snapshot.get("price"),
        "yesBid": snapshot.get("yes_bid"),
        "yesAsk": snapshot.get("yes_ask"),
        "bestBid": snapshot.get("yes_bid"),
        "bestAsk": snapshot.get("yes_ask"),
        "status": instrument.get("trading_status") or instrument.get("status") or "",
    }


def main():
    with contextlib.redirect_stdout(sys.stderr):
        client = make_data_client()
        series = response_json(
            client.instrument.get_event_series(category="CLIMATE_WEATHER", page_size=500),
            "CLIMATE_WEATHER series",
        )
        high_temp_series = [
            row for row in series
            if "HIGH" in str(row.get("symbol", "")).upper()
            and "Temperature" in str(row.get("name", ""))
        ]
        instruments = []
        for series_row in high_temp_series:
            symbol = series_row.get("symbol", "")
            if not symbol:
                continue
            rows = response_json(
                client.instrument.get_event_instrument(symbol, page_size=100),
                f"{symbol} instruments",
            )
            for row in rows:
                status = str(row.get("trading_status") or row.get("status") or "").upper()
                if status and status not in {"LISTING", "TRADING"}:
                    continue
                instruments.append(row)

        snapshots = {}
        symbols = [row.get("symbol") for row in instruments if row.get("symbol")]
        for batch in chunks(symbols, 100):
            rows = response_json(
                client.event_market_data.get_event_snapshot(",".join(batch)),
                "event snapshots",
            )
            for row in rows:
                if row.get("symbol"):
                    snapshots[row["symbol"]] = row

    markets = [market_row(row, snapshots.get(row.get("symbol", ""), {})) for row in instruments]
    print(json.dumps({"ok": True, "markets": markets}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Webull weather rows failed: {error}", file=sys.stderr)
        raise
