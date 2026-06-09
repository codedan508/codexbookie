# Codex Bookie MLB Totals Logger

Read-only EV freshness app for MLB game total Over/Under bucket research.

This app does not place, preview, or cancel orders. It stores a 2026 season ledger, recalculates paired Over/Under bucket win rate and EV by total line, and exports the ledger CSV used for calculations.

## API config

The app ships with `.env` and `.env.example` for the data APIs it uses:

```text
HOST=127.0.0.1
PORT=2022
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
http://localhost:2022
```

## Data

The ledger is written to `data/mlb_2026_totals_3am_game_line_ledger.csv`.

Click **Get Data** to rebuild the season ledger:

- MLB supplies authoritative away/home teams and final total runs.
- Polymarket event data resolves MLB game total markets and token IDs.
- Polymarket CLOB price history supplies the nearest available historical Over/Under price to 3:00am ET.
- Rows are paired game-by-game as `Over ##-## / Under ##-##`, then marked as one winning side and one losing side before bucket EV is computed.

Current target lines are `7.5`, `8.5`, and `9.5`.
