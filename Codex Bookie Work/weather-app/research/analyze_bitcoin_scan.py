#!/usr/bin/env python3
"""Analyze BTC hourly scanner recordings for repeatable trading inefficiencies."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from statistics import mean, median


STRIKE_RE = re.compile(
    r"^BTC HOURLY \((.*?)\) - \$([0-9,]+) - YES ABOVE (\d+)c \| NO ABOVE (\d+)c - (.+)$"
)
SPOT_RE = re.compile(r"^BTC SPOT PRICE - \$([0-9,]+)(?: - SOURCE (.*?))? - (.+)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="records/BITCOIN SCAN RECORDING")
    parser.add_argument("--date", default="2026-05-29")
    parser.add_argument("--out", default="research/bitcoin_scan_analysis_2026-05-29.json")
    return parser.parse_args()


def parse_hour(name: str) -> int:
    match = re.search(r"(\d{2})00-et", name)
    if not match:
        raise ValueError(f"Cannot infer ET hour from {name}")
    return int(match.group(1))


def iso_timestamp(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def load_rows(base: Path, date: str) -> tuple[list[dict], list[dict], list[str]]:
    errors: list[str] = []
    rows: list[dict] = []
    spots: list[dict] = []
    strike_dir = base / "bitcoin strike price log" / date
    spot_dir = base / "bitcoin spot price log" / date

    for file in sorted(strike_dir.glob("*.txt")):
        hour = parse_hour(file.name)
        for line_no, line in enumerate(file.read_text().splitlines(), 1):
            match = STRIKE_RE.match(line)
            if not match:
                errors.append(f"{file}:{line_no}: unparsed strike row: {line[:120]}")
                continue
            expiry, strike, yes, no, ts = match.groups()
            rows.append(
                {
                    "file": file.name,
                    "hour": hour,
                    "expiry": expiry,
                    "strike": int(strike.replace(",", "")),
                    "yes": int(yes),
                    "no": int(no),
                    "ts": ts,
                    "t": iso_timestamp(ts),
                }
            )

    for file in sorted(spot_dir.glob("*.txt")):
        hour = parse_hour(file.name)
        for line_no, line in enumerate(file.read_text().splitlines(), 1):
            match = SPOT_RE.match(line)
            if not match:
                errors.append(f"{file}:{line_no}: unparsed spot row: {line[:120]}")
                continue
            price, source, ts = match.groups()
            spots.append(
                {
                    "file": file.name,
                    "hour": hour,
                    "price": int(price.replace(",", "")),
                    "source": source or "",
                    "ts": ts,
                    "t": iso_timestamp(ts),
                }
            )
    return rows, spots, errors


def tick_groups(rows: list[dict]) -> dict[tuple[int, str], list[dict]]:
    grouped: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for row in rows:
        grouped[(row["hour"], row["ts"])].append(row)
    return grouped


def run_analysis(rows: list[dict], spots: list[dict], errors: list[str]) -> dict:
    grouped = tick_groups(rows)
    row_count_by_tick = Counter(len(value) for value in grouped.values())
    hour_ticks = Counter(hour for hour, _ in grouped)

    cross_arb = []
    monotonic_violations = []
    for (hour, ts), tick_rows in grouped.items():
        sorted_rows = sorted(tick_rows, key=lambda item: item["strike"])
        for i, lower in enumerate(sorted_rows):
            for higher in sorted_rows[i + 1 :]:
                cost = lower["yes"] + higher["no"]
                if cost < 100:
                    cross_arb.append(
                        {
                            "hour": hour,
                            "ts": ts,
                            "lower": lower["strike"],
                            "higher": higher["strike"],
                            "yes_lower": lower["yes"],
                            "no_higher": higher["no"],
                            "cost": cost,
                            "gross_edge": 100 - cost,
                        }
                    )
        for lower, higher in zip(sorted_rows, sorted_rows[1:]):
            if higher["yes"] > lower["yes"]:
                monotonic_violations.append(
                    {
                        "hour": hour,
                        "ts": ts,
                        "lower": lower["strike"],
                        "higher": higher["strike"],
                        "type": "higher_strike_yes_ask_above_lower",
                        "lower_yes": lower["yes"],
                        "higher_yes": higher["yes"],
                        "gap": higher["yes"] - lower["yes"],
                    }
                )
            if higher["no"] < lower["no"]:
                monotonic_violations.append(
                    {
                        "hour": hour,
                        "ts": ts,
                        "lower": lower["strike"],
                        "higher": higher["strike"],
                        "type": "higher_strike_no_ask_below_lower",
                        "lower_no": lower["no"],
                        "higher_no": higher["no"],
                        "gap": lower["no"] - higher["no"],
                    }
                )

    same_strike_complement = [
        {
            "hour": row["hour"],
            "ts": row["ts"],
            "strike": row["strike"],
            "yes": row["yes"],
            "no": row["no"],
            "cost": row["yes"] + row["no"],
            "gross_edge": 100 - row["yes"] - row["no"],
        }
        for row in rows
        if row["yes"] + row["no"] < 100
    ]

    drops = []
    by_contract: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for row in rows:
        by_contract[(row["hour"], row["strike"])].append(row)
    for (hour, strike), contract_rows in by_contract.items():
        contract_rows.sort(key=lambda item: item["t"])
        for side in ("yes", "no"):
            for idx in range(1, len(contract_rows)):
                previous = contract_rows[idx - 1][side]
                current = contract_rows[idx][side]
                if previous - current < 5 or current > 70:
                    continue
                best = current
                best_time = contract_rows[idx]["t"]
                for future in contract_rows[idx + 1 :]:
                    if future["t"] - contract_rows[idx]["t"] > 10:
                        break
                    if future[side] > best:
                        best = future[side]
                        best_time = future["t"]
                if best - current >= 3:
                    drops.append(
                        {
                            "hour": hour,
                            "strike": strike,
                            "side": side.upper(),
                            "ts": contract_rows[idx]["ts"],
                            "drop": previous - current,
                            "ask": current,
                            "rebound": best - current,
                            "seconds_to_rebound": round(best_time - contract_rows[idx]["t"], 3),
                        }
                    )

    drop_groups = []
    grouped_drops: dict[tuple[int, int, str], list[dict]] = defaultdict(list)
    for drop in drops:
        grouped_drops[(drop["hour"], drop["strike"], drop["side"])].append(drop)
    for (hour, strike, side), values in grouped_drops.items():
        drop_groups.append(
            {
                "hour": hour,
                "strike": strike,
                "side": side,
                "count": len(values),
                "avg_rebound": round(mean(item["rebound"] for item in values), 2),
                "max_rebound": max(item["rebound"] for item in values),
                "avg_seconds": round(mean(item["seconds_to_rebound"] for item in values), 2),
            }
        )
    drop_groups.sort(key=lambda item: (item["count"], item["avg_rebound"], item["max_rebound"]), reverse=True)

    complement_sums = Counter(row["yes"] + row["no"] for row in rows)
    spot_sources = Counter(spot["source"] for spot in spots)
    hour_summary = []
    for hour in sorted(hour_ticks):
        hour_cross_ticks = {item["ts"] for item in cross_arb if item["hour"] == hour}
        hour_summary.append(
            {
                "hour": hour,
                "ticks": hour_ticks[hour],
                "cross_arb_ticks": len(hour_cross_ticks),
                "cross_arb_tick_pct": round(100 * len(hour_cross_ticks) / hour_ticks[hour], 2),
                "rows": sum(1 for row in rows if row["hour"] == hour),
            }
        )

    return {
        "row_count": len(rows),
        "spot_count": len(spots),
        "tick_count": len(grouped),
        "row_count_by_tick": dict(row_count_by_tick),
        "hour_summary": hour_summary,
        "spot_sources": dict(spot_sources),
        "complement_sum_distribution_top": complement_sums.most_common(12),
        "same_strike_complement_under_100": same_strike_complement,
        "cross_strike_guaranteed_arb": cross_arb,
        "monotonic_violations": monotonic_violations,
        "sudden_drop_rebound_count": len(drops),
        "sudden_drop_rebound_groups": drop_groups[:20],
        "sudden_drop_rebound_examples": sorted(drops, key=lambda item: (item["rebound"], item["drop"]), reverse=True)[:30],
        "parse_errors": errors,
    }


def main() -> None:
    args = parse_args()
    base = Path(args.base)
    rows, spots, errors = load_rows(base, args.date)
    report = run_analysis(rows, spots, errors)
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {output}")
    print(f"Rows: {report['row_count']} strike, {report['spot_count']} spot, {report['tick_count']} ticks")
    print(f"Guaranteed cross-strike arbs: {len(report['cross_strike_guaranteed_arb'])}")
    print(f"Same-strike complement under 100c: {len(report['same_strike_complement_under_100'])}")
    print(f"Sudden drop/rebound candidates: {report['sudden_drop_rebound_count']}")


if __name__ == "__main__":
    main()
