# Codex Bookie Edge Research

Read-only EV freshness app for MLB moneyline bucket research.

This app does not place, preview, or cancel orders. It stores a season ledger, recalculates paired bucket win rate and EV, and exports the ledger CSV used for calculations.

## API config

The app ships with `.env` and `.env.example` for the data APIs it uses:

```text
HOST=127.0.0.1
PORT=2020
MLB_BASE=https://statsapi.mlb.com
POLYMARKET_GAMMA_BASE=https://gamma-api.polymarket.com
POLYMARKET_CLOB_BASE=https://clob.polymarket.com
```

These are public data endpoints. No live trading key, wallet key, order key, or Polymarket secret is required by this research app.

## Run

```bash
npm start
```

Then open:

```text
http://localhost:2020
```

## Data

Seed data lives in `data/mlb_2026_moneyline_3am_clean_game_ledger.csv`.

Click **Get Data** to backfill from the ledger's last missing date:

- MLB public API supplies the authoritative away/home teams and final winners.
- Polymarket Gamma resolves moneyline markets and token IDs.
- Polymarket CLOB price history supplies the nearest available historical price to 3:00am ET.
