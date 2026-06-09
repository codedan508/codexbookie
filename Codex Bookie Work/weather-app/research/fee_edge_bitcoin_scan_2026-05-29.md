# Fee-Aware BTC Scan Result - 2026-05-29

Question tested:

> Is there a repeated condition where buying the price-indicated YES/NO side beats fee-adjusted expectation by at least 20% on a lot of data?

Short answer:

**No robust sleeper rule survived.**

## Method

- Settlement proxy: average of recorded BTC price samples from `T-60s` to expiration.
- Trade side:
  - Buy YES only when scan-time price/average is above strike.
  - Buy NO only when scan-time price/average is below strike.
- Fee model: Kalshi fee formula with 1-contract and 4-contract rounding.
- Rule floor: at least 50 observations, 5 unique hour/strike/side setups, and 3 expiration hours.
- Edge test: realized win rate must be at least 20% above fee-adjusted break-even and net positive.

## Key Results

The broadest near-pass was:

```text
T-600..60s
ask <= 70c
opposite ask <= 50c
spot margin >= $0
```

Result:

```text
1,416 observations
10 unique setups
77.05% win rate
64.76% fee-adjusted break-even
18.97% lift over break-even
```

This is close but does **not** meet the requested 20% lift. More importantly, it was not stable by hour:

```text
2:00 ET   +33.06c/contract avg
3:00 ET   +27.53c/contract avg
12:00 ET  -18.21c/contract avg
19:00 ET  +23.72c/contract avg
```

That is not a low-stress sleeper. One bad hour wrecks the pattern.

The strongest rules that technically cleared +20% lift were mostly cheap longshot-style buys in the final 30-60 seconds. They had many losses and were unstable by hour. Example:

```text
T-60..1s
ask <= 60c
spot margin >= $0

420 observations
24.05% win rate
19.10% break-even
25.89% lift
```

But per-hour behavior was unacceptable:

```text
2:00 ET   -7.35c/contract avg
3:00 ET   -4.49c/contract avg
12:00 ET  +30.14c/contract avg
19:00 ET  -7.25c/contract avg
```

This is not a scrape. It is a noisy longshot artifact.

## Conclusion

I would not turn on live auto-trading from these logs.

I found:

- No repeated hard arbitrage.
- No stable high-confidence 90c-95c expiry-lock rule.
- No fee-adjusted +20% edge that also held up across hours.
- A few aggregate-positive cheap-entry rules, but they are hour-fragile and too loss-heavy for a small account.

The required next dataset is official BRTI or a close BRTI proxy recorded every second, because the current spot log is Kalshi-implied and can jump in ways that contaminate settlement analysis.

Artifacts:

- `research/fee_edge_bitcoin_scan.py`
- `research/fee_edge_bitcoin_scan_2026-05-29_4c.json`
- `research/fee_edge_bitcoin_scan_2026-05-29_1c.json`
