#!/usr/bin/env python3
"""Fee-aware BTC hourly edge search over recorded scanner data.

This intentionally treats the recorded BTC price as the available scan-time price
series, then scores every candidate against the contract's final 60-second
average over that same recorded series. It is not a replacement for official
BRTI data; it is a consistency check on the data we actually have.
"""

from __future__ import annotations

import argparse
import bisect
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean


STRIKE_RE = re.compile(
    r"^BTC HOURLY \((.*?)\) - \$([0-9,]+) - YES ABOVE (\d+)c \| NO ABOVE (\d+)c - (.+)$"
)
SPOT_RE = re.compile(r"^BTC SPOT PRICE - \$([0-9,]+)(?: - SOURCE (.*?))? - (.+)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="records/BITCOIN SCAN RECORDING")
    parser.add_argument("--date", default="2026-05-29")
    parser.add_argument("--out", default="research/fee_edge_bitcoin_scan_2026-05-29.json")
    parser.add_argument("--contracts", type=int, default=4)
    return parser.parse_args()


def parse_ts(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def parse_hour(filename: str) -> int:
    match = re.search(r"(\d{2})00-et", filename)
    if not match:
        raise ValueError(f"Cannot infer hour from {filename}")
    return int(match.group(1))


def expiry_ts(hour_et: int, sample_ts: float) -> float:
    sample = datetime.fromtimestamp(sample_ts, tz=timezone.utc)
    return sample.replace(hour=(hour_et + 4) % 24, minute=0, second=0, microsecond=0).timestamp()


def fee_total_cents(price_cents: float, contracts: int) -> int:
    price = price_cents / 100
    raw_cents = 100 * 0.07 * contracts * price * (1 - price)
    return math.ceil(raw_cents - 1e-12)


def fee_per_contract_cents(price_cents: float, contracts: int) -> float:
    return fee_total_cents(price_cents, contracts) / contracts


def load_data(base: Path, date: str) -> tuple[list[dict], dict[int, list[dict]], list[str]]:
    errors: list[str] = []
    rows: list[dict] = []
    spots: dict[int, list[dict]] = defaultdict(list)

    for file in sorted((base / "bitcoin spot price log" / date).glob("*.txt")):
        hour = parse_hour(file.name)
        for line_no, line in enumerate(file.read_text().splitlines(), 1):
            match = SPOT_RE.match(line)
            if not match:
                errors.append(f"{file}:{line_no}: unparsed spot row")
                continue
            price, source, ts = match.groups()
            spots[hour].append(
                {
                    "hour": hour,
                    "price": int(price.replace(",", "")),
                    "source": source or "",
                    "ts": ts,
                    "t": parse_ts(ts),
                }
            )
    for hour_rows in spots.values():
        hour_rows.sort(key=lambda item: item["t"])

    for file in sorted((base / "bitcoin strike price log" / date).glob("*.txt")):
        hour = parse_hour(file.name)
        for line_no, line in enumerate(file.read_text().splitlines(), 1):
            match = STRIKE_RE.match(line)
            if not match:
                errors.append(f"{file}:{line_no}: unparsed strike row")
                continue
            _, strike, yes, no, ts = match.groups()
            t = parse_ts(ts)
            rows.append(
                {
                    "hour": hour,
                    "strike": int(strike.replace(",", "")),
                    "yes": int(yes),
                    "no": int(no),
                    "ts": ts,
                    "t": t,
                    "expiry_t": expiry_ts(hour, t),
                }
            )
    return rows, spots, errors


def settlement_averages(spots: dict[int, list[dict]]) -> dict[int, dict]:
    settlements: dict[int, dict] = {}
    for hour, hour_spots in spots.items():
        if not hour_spots:
            continue
        end = expiry_ts(hour, hour_spots[-1]["t"])
        values = [row["price"] for row in hour_spots if end - 60 <= row["t"] < end]
        if len(values) >= 30:
            settlements[hour] = {
                "avg60": mean(values),
                "n": len(values),
                "min": min(values),
                "max": max(values),
                "last": hour_spots[-1]["price"],
            }
    return settlements


def nearest_spot(row: dict, hour_spots: list[dict], times: list[float]) -> dict | None:
    idx = bisect.bisect_left(times, row["t"])
    candidates = []
    if idx < len(hour_spots):
        candidates.append(hour_spots[idx])
    if idx > 0:
        candidates.append(hour_spots[idx - 1])
    return min(candidates, key=lambda item: abs(item["t"] - row["t"])) if candidates else None


def rolling_stats(row: dict, hour_spots: list[dict]) -> tuple[float | None, int, float | None]:
    start = row["expiry_t"] - 60
    values_so_far = [item["price"] for item in hour_spots if start <= item["t"] <= row["t"]]
    if not values_so_far:
        return None, 0, None
    last_window = [item["price"] for item in hour_spots if row["t"] - 10 <= item["t"] <= row["t"]]
    return mean(values_so_far), len(values_so_far), mean(last_window) if last_window else None


def build_observations(rows: list[dict], spots: dict[int, list[dict]], settlements: dict[int, dict], contracts: int) -> list[dict]:
    times_by_hour = {hour: [item["t"] for item in hour_spots] for hour, hour_spots in spots.items()}
    observations: list[dict] = []
    for row in rows:
        if row["hour"] not in settlements or row["hour"] not in spots:
            continue
        hour_spots = spots[row["hour"]]
        spot = nearest_spot(row, hour_spots, times_by_hour[row["hour"]])
        if not spot:
            continue
        partial_avg, partial_n, recent_avg = rolling_stats(row, hour_spots)
        final_avg = settlements[row["hour"]]["avg60"]
        seconds_left = row["expiry_t"] - row["t"]
        for side, ask, opposite in (("YES", row["yes"], row["no"]), ("NO", row["no"], row["yes"])):
            signed_spot_margin = spot["price"] - row["strike"] if side == "YES" else row["strike"] - spot["price"]
            signed_partial_margin = None
            if partial_avg is not None:
                signed_partial_margin = partial_avg - row["strike"] if side == "YES" else row["strike"] - partial_avg
            signed_recent_margin = None
            if recent_avg is not None:
                signed_recent_margin = recent_avg - row["strike"] if side == "YES" else row["strike"] - recent_avg
            final_margin = final_avg - row["strike"] if side == "YES" else row["strike"] - final_avg
            fee_pc = fee_per_contract_cents(ask, contracts)
            observations.append(
                {
                    "hour": row["hour"],
                    "strike": row["strike"],
                    "side": side,
                    "ask": ask,
                    "opposite": opposite,
                    "ts": row["ts"],
                    "seconds_left": seconds_left,
                    "spot": spot["price"],
                    "spot_margin": signed_spot_margin,
                    "partial_avg": partial_avg,
                    "partial_n": partial_n,
                    "partial_margin": signed_partial_margin,
                    "recent_avg": recent_avg,
                    "recent_margin": signed_recent_margin,
                    "final_avg": final_avg,
                    "final_margin": final_margin,
                    "won": final_margin > 0 if side == "YES" else final_margin >= 0,
                    "fee_per_contract_cents": fee_pc,
                    "cost_cents": ask + fee_pc,
                    "breakeven_prob": (ask + fee_pc) / 100,
                }
            )
    return observations


def score_rule(name: str, observations: list[dict], contracts: int) -> dict | None:
    if not observations:
        return None
    wins = sum(1 for item in observations if item["won"])
    pnl_per_contract = [
        (100 if item["won"] else 0) - item["ask"] - item["fee_per_contract_cents"]
        for item in observations
    ]
    avg_cost = mean(item["cost_cents"] for item in observations)
    realized_win = wins / len(observations)
    breakeven = avg_cost / 100
    relative_lift = (realized_win / breakeven - 1) if breakeven > 0 else None
    unique_setups = {(item["hour"], item["strike"], item["side"]) for item in observations}
    return {
        "name": name,
        "count": len(observations),
        "wins": wins,
        "losses": len(observations) - wins,
        "realized_win_rate": round(realized_win, 4),
        "avg_breakeven_win_rate": round(breakeven, 4),
        "relative_lift_vs_breakeven": round(relative_lift, 4) if relative_lift is not None else None,
        "avg_net_cents_per_contract": round(mean(pnl_per_contract), 4),
        "total_net_cents_at_contract_size": round(sum(pnl_per_contract) * contracts, 4),
        "avg_ask": round(mean(item["ask"] for item in observations), 3),
        "avg_fee_per_contract": round(mean(item["fee_per_contract_cents"] for item in observations), 4),
        "unique_setup_count": len(unique_setups),
        "hour_counts": dict(Counter(item["hour"] for item in observations)),
        "setup_counts": dict(Counter(f"{h}:{strike}:{side}" for h, strike, side in unique_setups)),
        "loss_examples": [
            {
                "hour": item["hour"],
                "strike": item["strike"],
                "side": item["side"],
                "ask": item["ask"],
                "opposite": item["opposite"],
                "seconds_left": round(item["seconds_left"], 3),
                "spot": item["spot"],
                "spot_margin": round(item["spot_margin"], 3),
                "partial_margin": round(item["partial_margin"], 3) if item["partial_margin"] is not None else None,
                "final_avg": round(item["final_avg"], 3),
                "final_margin": round(item["final_margin"], 3),
                "ts": item["ts"],
            }
            for item in observations
            if not item["won"]
        ][:5],
    }


def search_rules(observations: list[dict], contracts: int) -> list[dict]:
    scored: list[dict] = []
    windows = [(600, 60), (300, 60), (120, 10), (60, 1), (30, 1), (10, 1)]
    ask_maxes = [60, 70, 80, 88, 92, 95, 97]
    opposite_maxes = [5, 10, 15, 22, 50, 100]
    margins = [0, 10, 25, 50, 100, 200, 500, 1000]
    fields = ["spot_margin", "partial_margin", "recent_margin"]
    for high, low in windows:
        for ask_max in ask_maxes:
            for opposite_max in opposite_maxes:
                for field in fields:
                    for margin in margins:
                        rows = [
                            item
                            for item in observations
                            if low <= item["seconds_left"] <= high
                            and item["ask"] <= ask_max
                            and item["opposite"] <= opposite_max
                            and item[field] is not None
                            and item[field] >= margin
                        ]
                        unique = {(item["hour"], item["strike"], item["side"]) for item in rows}
                        hours = {item["hour"] for item in rows}
                        if len(rows) < 50 or len(unique) < 5 or len(hours) < 3:
                            continue
                        name = (
                            f"T-{int(high)}..{int(low)}s ask<={ask_max} opp<={opposite_max} "
                            f"{field}>={margin}"
                        )
                        score = score_rule(name, rows, contracts)
                        if score:
                            scored.append(score)
    return sorted(
        scored,
        key=lambda item: (
            item["relative_lift_vs_breakeven"],
            item["avg_net_cents_per_contract"],
            item["unique_setup_count"],
            item["count"],
        ),
        reverse=True,
    )


def main() -> None:
    args = parse_args()
    base = Path(args.base)
    rows, spots, errors = load_data(base, args.date)
    settlements = settlement_averages(spots)
    observations = build_observations(rows, spots, settlements, args.contracts)
    rules = search_rules(observations, args.contracts)
    qualified = [
        rule
        for rule in rules
        if rule["relative_lift_vs_breakeven"] is not None
        and rule["relative_lift_vs_breakeven"] >= 0.2
        and rule["avg_net_cents_per_contract"] > 0
    ]
    output = {
        "date": args.date,
        "contracts": args.contracts,
        "strike_rows": len(rows),
        "spot_rows": sum(len(value) for value in spots.values()),
        "settlement_proxy_hours": {
            str(hour): {
                "avg60": round(value["avg60"], 4),
                "n": value["n"],
                "min": value["min"],
                "max": value["max"],
                "last": value["last"],
            }
            for hour, value in sorted(settlements.items())
        },
        "observation_count": len(observations),
        "searched_rule_count": len(rules),
        "qualified_20pct_lift_rules": qualified[:25],
        "top_rules": rules[:25],
        "parse_errors": errors[:20],
        "notes": [
            "Rules require at least 50 observations, 5 unique hour/strike/side setups, and 3 settlement-proxy hours.",
            "Settlement is modeled as average of recorded price samples from T-60s to T.",
            "Recorded spot source is whatever is present in the log; current data is Kalshi implied proxy, not official BRTI.",
        ],
    }
    Path(args.out).write_text(json.dumps(output, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {args.out}")
    print(f"Settlement proxy hours: {len(settlements)} -> {sorted(settlements)}")
    print(f"Observations: {len(observations)}")
    print(f"Searched rules meeting sample floor: {len(rules)}")
    print(f"Qualified +20% lift rules: {len(qualified)}")
    if qualified:
        best = qualified[0]
    elif rules:
        best = rules[0]
    else:
        best = None
    if best:
        print(json.dumps(best, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
