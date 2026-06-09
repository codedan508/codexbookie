# YES ABOVE Lag Study - First 50 Minutes - 2026-05-29

Scope:

- YES ABOVE only.
- First 50 minutes only: `60` to `10` minutes before expiration.
- Looking for BTC price movement leading delayed YES ABOVE price movement.
- No NO-side analysis.

Dataset:

```text
50,062 YES ABOVE rows
18,208 BTC-change events
```

Rows by hour:

```text
1:00 ET    918
2:00 ET   2,762
3:00 ET  13,265
4:00 ET   3,074
12:00 ET  8,485
13:00 ET 13,099
19:00 ET  8,459
```

## Main Finding

There is a real delay effect, but most exact all-field repeats are too sparse.

When BTC moved, YES ABOVE failed to move in the same direction on the same tick about 63% of the time:

```text
BTC up events:   9,372 total, 5,953 stale = 63.52%
BTC down events: 8,836 total, 5,553 stale = 62.85%
```

But exact condition matching like:

```text
exact minute-left + exact BTC move + exact YES price + exact BTC-vs-strike distance
```

did not produce large repeated samples. The repeated exact groups were mostly under 20 rows.

## Best Repeated UP-Lag Candidates

These are exact BTC jumps by hour, not exact YES-price/distance bins.

```text
13:00 ET | BTC +$11 tick | 60 events | 24 stale | 22/24 followed with YES +1c or more within 10s | avg follow +4.04c
```

```text
12:00 ET | BTC +$6 tick | 304 events | 138 stale | 99/138 followed with YES +1c or more within 10s | avg follow +1.79c
```

```text
13:00 ET | BTC +$9 tick | 75 events | 31 stale | 25/31 followed with YES +1c or more within 10s | avg follow +2.42c
```

```text
12:00 ET | BTC +$8 tick | 75 events | 25 stale | 20/25 followed with YES +1c or more within 10s | avg follow +1.72c
```

## Best Repeated DOWN-Lag Candidates

Useful as danger/avoid signals for YES, not direct YES buys.

```text
12:00 ET | BTC -$7 tick | 135 events | 54 stale | 42/54 followed with YES -1c or more within 10s | avg follow -3.00c
```

```text
13:00 ET | BTC -$11 tick | 74 events | 24 stale | 18/24 followed with YES -1c or more within 10s | avg follow -2.21c
```

```text
12:00 ET | BTC -$10 tick | 54 events | 17 stale | 10/17 followed with YES -1c or more within 10s | avg follow -3.12c
```

## Trade Read

This confirms lag exists, especially during 12:00 and 13:00 ET first-50-minute trading.

But as a live YES-buy scrape, it is not clean yet:

- The repeated UP lag is usually only `+1c` to `+4c` of YES movement.
- We only have YES ask, not executable sell bid, so the apparent follow-through is not guaranteed exit profit.
- Exact all-field repeats are too sparse to make a strict production rule.

Best paper-watch candidate:

```text
13:00 ET first 50 minutes
BTC jumps exactly +$11
YES ABOVE does not rise on the same tick
Watch for YES catch-up within 10 seconds
```

Second paper-watch candidate:

```text
12:00 ET first 50 minutes
BTC jumps exactly +$6 to +$8
YES ABOVE does not rise on the same tick
Watch for YES catch-up within 10 seconds
```

Saved data:

- `research/yes_lag_first50.py`
- `research/yes_lag_first50_2026-05-29.json`
