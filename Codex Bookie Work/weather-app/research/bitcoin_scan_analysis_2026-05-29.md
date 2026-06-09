# Bitcoin Scanner Inefficiency Pass - 2026-05-29

Input files:

- `records/BITCOIN SCAN RECORDING/bitcoin strike price log/2026-05-29/`
- `records/BITCOIN SCAN RECORDING/bitcoin spot price log/2026-05-29/`

Parsed sample:

- 51,480 strike rows
- 11,699 spot rows
- 11,698 scanner ticks
- Spot source was always `Kalshi implied proxy from hourly strike ladder`, not an independent BTC feed.

## Hard-Arbitrage Tests

| Test | Result | Tradeability |
| --- | ---: | --- |
| Same-strike buy YES + buy NO under 100c | 1 tick | Reject: not repeated |
| Cross-strike buy lower YES + higher NO under 100c | 0 ticks | Reject |
| Cross-strike target under 80c | 0 ticks | Reject |

The single same-strike complement was:

- 12:00 ET contract, `$73,700`, `YES 93c + NO 2c = 95c`, at `2026-05-29T15:59:47.434Z`.

This is not enough to trade. It happened once in more than eleven thousand scanner ticks.

## Repeated Candidate Patterns

These are candidates for live monitoring, not green-lit money printers.

| Rank | Pattern | Observations | Initial verdict |
| ---: | --- | ---: | --- |
| 1 | Last 10 min, buy dominant side 80-90c with opposite side <=22c | 796 rows, 7 unique contract-side cases, 100% winners in completed sample | Best candidate, but correlated and expiry-risky |
| 2 | Last 15 min, buy dominant side 95-98c | 2,804 rows, 14 unique contract-side cases, 100% winners | Frequent but small gross edge, fee/slippage sensitive |
| 3 | Last 15 min, buy 90-98c with opposite side <=12c | 3,749 rows, 15 unique cases, 99.68% winners | One losing cluster; needs stricter filter |
| 4 | Sudden ask drop then rebound within 10 sec | 66 rows | Interesting for IOC scalping, but no bid/exit data in logs |
| 5 | Adjacent strike monotonic ask violations | 38 rows | Interesting quote glitch detector, but not directly actionable without executable bid/sell data |

Top sudden-drop/rebound clusters:

| Hour ET | Strike | Side | Count | Avg rebound | Max rebound | Avg seconds |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 12 | 73,700 | NO | 14 | 22.71c | 97c | 6.23 |
| 12 | 73,700 | YES | 12 | 10.67c | 36c | 5.57 |
| 2 | 73,600 | YES | 6 | 25.17c | 46c | 6.46 |
| 2 | 73,600 | NO | 5 | 19.60c | 44c | 5.60 |
| 3 | 73,700 | NO | 5 | 6.60c | 10c | 5.99 |

## Immediate Conclusions

1. There is no repeated guaranteed ask-side arbitrage in these logs.
2. The current strike logs are missing bid prices and order-book depth, so scalping claims cannot be proven from this dataset alone.
3. The most promising repeated behavior is late-hour dominant-side pricing, especially 80-90c in the final 10 minutes with the opposite side <=22c.
4. The sudden drop/rebound clusters deserve a live watcher, but the backtest must record executable bids before it can estimate realizable exits.
5. The spot log should be upgraded to an independent BTC feed if it is going to drive entry rules; the current spot series is derived from Kalshi prices.

Re-run:

```bash
python3 research/analyze_bitcoin_scan.py --base 'records/BITCOIN SCAN RECORDING' --date 2026-05-29
```
