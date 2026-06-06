# Codex Bookie

Polymarket US MLB moneyline maker-order app.

## Local Safety State

This workspace copy has been converted into a development copy:

- `.env` contains no live credentials.
- `orders-state.json` has Sell Bets off.
- Real scans, order creation, and order cancellation are blocked unless `LIVE_TRADING_ENABLED=true`.

## What It Does

- Uses the Polymarket US API only.
- Shows MLB moneyline bid/bid prices for the current slate.
- Places real maker-only limit orders when Sell Bets is active.
- Uses current bid as the maker order price.
- Refreshes account, open orders, positions, and slate from the API.
- Scans automatically every half hour from 3:00 AM through 11:00 AM ET.
- The Scan + Place Offers button runs the same scan immediately.
- Does not paper trade and has no dry-run execution path.

## Active Buckets

- Away team bid 40c-45c.
- Home team bid 50c-55c.
- Home team bid 35c-40c.

The app should not place a new order for a game/team that already has a live order or position.

## Running

The live `.env` file is included in this safe copy when the user explicitly requests a full API copy.

Windows:

```powershell
.\start-windows.ps1
```

macOS:

```bash
chmod +x ./start-macos.command
./start-macos.command
```

Then open:

```text
http://localhost:2010
```

If Node.js is missing, install the current LTS version from https://nodejs.org and run the launcher again.
