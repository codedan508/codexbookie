# YES ABOVE Price Delay - Simple Readout - 2026-05-29

Scope:

- May 29, 2026 only.
- YES ABOVE only.
- First 50 minutes of each hourly contract.
- Looking for BTC moving first, YES ABOVE lagging, then YES ABOVE catching up.

Dataset:

- 50,062 YES ABOVE rows.
- 18,208 BTC-change events.

## Main Result

When BTC moved up about `$10-$14` between scans and YES ABOVE did not move up on that same scan:

- 166 cases.
- YES ABOVE rose by average `1.78c` within 10 seconds.
- YES ABOVE rose by average `3.19c` within 30 seconds.
- YES ABOVE rose `4c+` within 10 seconds in 25 cases, `15.1%`.
- YES ABOVE rose `4c+` within 30 seconds in 55 cases, `33.1%`.
- Median delay for the `4c+` catch-up was about 19 seconds.

Plain English:

BTC +$10 to +$14 produced a real YES ABOVE lag, but the common catch-up was closer to `2c-3c`, not a reliable `4c+` scrape.

## Bigger BTC Up Moves

BTC +$15-$19:

- 40 cases.
- Avg YES catch-up: `1.75c` in 10s, `2.98c` in 30s.
- `4c+` catch-up within 30s: 12 cases, `30.0%`.

BTC +$20-$29:

- 11 cases.
- Avg YES catch-up: `0.82c` in 10s, `1.64c` in 30s.
- Too rare and weak.

## Downside Lag

BTC -$10 to -$14 while YES ABOVE was stale:

- 170 cases.
- Avg YES drop: `1.56c` in 10s, `3.27c` in 30s.
- `4c+` drop within 30s: 60 cases, `35.3%`.

Plain English:

Downside lag is about as real as upside lag. That matters because if you buy YES after an up move, a reversal can punish quickly.

## Trading Read

The delay exists.

The scrape is not strong enough yet.

Best simple watch pattern:

BTC moves up `$10-$14` between scans, YES ABOVE does not move up immediately, then watch for a possible `3c` catch-up over the next `20-30` seconds.

I would not treat this as a live IOC rule yet because `4c+` catch-up only happened about one-third of the time within 30 seconds.
