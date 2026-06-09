# Kalshi Scanner

This folder is the separate Kalshi scanner project.

The first new piece is `scanner-recorder.mjs`. It reads Kalshi market data and saves very small text records. It does not send orders.

## Weather Market Matching

The weather dashboard records Kalshi daily weather contract rows and compares exact city/date/temperature-band matches against Polymarket's public Gamma API.

Every cross-market match source uses the same rule and the same log format: same city, same contract date, and same stated temperature band. Match logs are printed in alphabetical city order with a header for each city, so a source that only shares some Kalshi cities will only print those shared cities. A combined city-aligned index is also written to:

```text
records/WEATHER SCAN RECORDING/aligned city match log/
```

Webull prediction markets are different: Webull documents event-contract endpoints, but they require Webull OpenAPI authentication. There is no no-key public Webull weather feed configured here. If approved Webull API access is added later, set:

```text
WEBULL_EVENT_MARKET_LIST_URL=
WEBULL_OPENAPI_TOKEN=
```

Matched Webull rows will be written to:

```text
records/WEATHER SCAN RECORDING/kalshi webull match log/
```

Until those fields are configured, the app will not scrape Webull or write guessed Webull data.

FanDuel Predicts does not currently publish an official no-key weather prediction-market API. If a legitimate FanDuel feed is approved later, set:

```text
FANDUEL_PREDICTS_MARKET_LIST_URL=
FANDUEL_PREDICTS_API_KEY=
```

Matched FanDuel rows will be written to:

```text
records/WEATHER SCAN RECORDING/kalshi fanduel match log/
```

Until those fields are configured, the app will not scrape FanDuel or write guessed FanDuel data.

DraftKings Predictions does not currently publish an official no-key weather prediction-market API. If a legitimate DraftKings feed is approved later, set:

```text
DRAFTKINGS_PREDICTIONS_MARKET_LIST_URL=
DRAFTKINGS_PREDICTIONS_API_KEY=
```

Matched DraftKings rows will be written to:

```text
records/WEATHER SCAN RECORDING/kalshi draftkings match log/
```

Until those fields are configured, the app will not scrape DraftKings or write guessed DraftKings data.

## Run A Scan

Use Node to run:

```bash
node scanner-recorder.mjs
```

By default it scans Bitcoin hourly markets from `KXBTCD` and writes two simultaneous logs:

- `records/BITCOIN SCAN RECORDING/bitcoin strike price log/` stores Kalshi contract prices.
- `records/BITCOIN SCAN RECORDING/bitcoin spot price log/` stores BTC spot price readings.

When an approved actual BTC price source is configured, the scanner uses it. If it is not configured yet, the dashboard does not freeze; it writes a Kalshi-only implied spot proxy from the current hourly strike ladder and labels that source in the spot log. The scanner still records only nearby active strikes around the spot/proxy value.

The dashboard uses the same two-log rule for all four scan lanes:

- `records/BITCOIN SCAN RECORDING/bitcoin strike price log/` and `records/BITCOIN SCAN RECORDING/bitcoin spot price log/`
- `records/S&P SCAN RECORDING/s&p strike price log/` and `records/S&P SCAN RECORDING/s&p spot price log/`
- `records/GOLD SCAN RECORDING/gold strike price log/` and `records/GOLD SCAN RECORDING/gold spot price log/`
- `records/CRUDE OIL SCAN RECORDING/crude oil strike price log/` and `records/CRUDE OIL SCAN RECORDING/crude oil spot price log/`

If Bitcoin, S&P, Gold, and Crude Oil are all turned on, the dashboard runs eight recording streams: four strike logs and four spot logs. Each asset is blocked until its approved Kalshi spot URL is configured.

Expected `.env` fields for the price source:

```text
KALSHI_BTC_SPOT_URL=
BTC_PRICE_INDEX=KALSHI_BTC_SPOT
BTC_PRICE_API_KEY=
KALSHI_SP_SPOT_URL=
KALSHI_GOLD_SPOT_URL=
KALSHI_CRUDE_SPOT_URL=
```

`KALSHI_BTC_SPOT_URL` must be an approved Kalshi endpoint. The API key line is optional if the approved endpoint does not require one.

Bitcoin hourly scans pause from 4:00 PM to 5:00 PM Eastern Time. Kalshi does not have a true 5:00 PM hourly contract, and the daily contract uses a different strike spacing, so the scanner does not scan or record during that hour.

You can change the scan:

```bash
node scanner-recorder.mjs --series KXBTCD --limit 25 --depth 20
```

The contract log is plain text. Each row is one active Bitcoin hourly strike at one timestamp:

```text
BTC HOURLY (05/28/2026, 11:00:00 PM EDT) - $73,200 - YES ABOVE 45c | NO ABOVE 56c - 2026-05-29T03:01:35.359Z
```

The spot log is separate:

```text
BTC SPOT PRICE - $73,240 - 2026-05-29T03:01:35.359Z
```

By default it takes one sample. For a five-second linear log:

```bash
node scanner-recorder.mjs --samples 120 --interval 5
```

That records one sample every five seconds for about ten minutes.

## Safety

This recorder is read-only. It does not call the Kalshi order endpoints.

Kalshi order endpoints are disabled for this scanner. The scanner requires your Kalshi API key and private key in `.env` for authenticated market reads, and it requires a separate approved Kalshi BTC spot source before Bitcoin recording can start.

The old dashboard app is still here as `server.js`, but the scanner recorder is separate so we can keep stripping things down without mixing wires.
