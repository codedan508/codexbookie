# Polymarket Weather History Source Audit

Status: source not finished; do not display fictional EV.

What is loaded:
- 200 Polymarket US weather city-days.
- 1,200 settled contract rows for Chicago, Los Angeles, Miami, New York, and San Francisco.
- Settlement/final outcome data is present.

What is not wired yet:
- Historical price timestamps at the target times: 12:05 AM ET for New York/Miami, 1:05 AM ET for Chicago, and 3:05 AM ET for Los Angeles/San Francisco.

Important correction:
- Do not say Polymarket weather has no timestamped price history. The correct state is: the app has not yet found or authenticated the right trade/report history source.

Tested official path:
- Official report route tested: /v1/report/trades/stats.
- api.prod.polymarketexchange.com responded 401 Unauthorized with the current local key.
- api.polymarket.us rejected direct script access through Cloudflare.

Likely next move:
- Use a report-enabled Polymarket credential/session, or locate a verified public trade-history feed for these US weather symbols.
- Once price snapshots are available, bucket by contract price only and compute ordinary YES long EV first, including both positive and negative EV over the requested thresholds.
