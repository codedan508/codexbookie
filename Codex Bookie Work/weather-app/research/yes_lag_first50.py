#!/usr/bin/env python3
"""YES ABOVE lag analysis for the first 50 minutes of BTC hourly contracts."""

from __future__ import annotations

import argparse
import bisect
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
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
    parser.add_argument("--out", default="research/yes_lag_first50_2026-05-29.json")
    return parser.parse_args()


def parse_ts(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def parse_hour(filename: str) -> int:
    match = re.search(r"(\d{2})00-et", filename)
    if not match:
        raise ValueError(f"Cannot infer ET hour from {filename}")
    return int(match.group(1))


def expiry_ts(hour_et: int, sample_ts: float) -> float:
    sample = datetime.fromtimestamp(sample_ts, tz=timezone.utc)
    return sample.replace(hour=(hour_et + 4) % 24, minute=0, second=0, microsecond=0).timestamp()


def load_spots(base: Path, date: str) -> dict[int, list[dict]]:
    spots: dict[int, list[dict]] = defaultdict(list)
    for file in sorted((base / "bitcoin spot price log" / date).glob("*.txt")):
        hour = parse_hour(file.name)
        for line in file.read_text().splitlines():
            match = SPOT_RE.match(line)
            if not match:
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
    for rows in spots.values():
        rows.sort(key=lambda item: item["t"])
    return spots


def nearest_spot(t: float, hour_spots: list[dict], times: list[float]) -> dict | None:
    idx = bisect.bisect_left(times, t)
    candidates = []
    if idx < len(hour_spots):
        candidates.append(hour_spots[idx])
    if idx > 0:
        candidates.append(hour_spots[idx - 1])
    return min(candidates, key=lambda item: abs(item["t"] - t)) if candidates else None


def load_yes_rows(base: Path, date: str, spots: dict[int, list[dict]]) -> list[dict]:
    rows: list[dict] = []
    times_by_hour = {hour: [item["t"] for item in hour_spots] for hour, hour_spots in spots.items()}
    for file in sorted((base / "bitcoin strike price log" / date).glob("*.txt")):
        hour = parse_hour(file.name)
        if hour not in spots:
            continue
        for line in file.read_text().splitlines():
            match = STRIKE_RE.match(line)
            if not match:
                continue
            _, strike_text, yes_text, _, ts = match.groups()
            t = parse_ts(ts)
            end = expiry_ts(hour, t)
            sec_left = end - t
            if not (600 <= sec_left <= 3600):
                continue
            spot = nearest_spot(t, spots[hour], times_by_hour[hour])
            if not spot:
                continue
            rows.append(
                {
                    "hour": hour,
                    "strike": int(strike_text.replace(",", "")),
                    "yes": int(yes_text),
                    "btc": spot["price"],
                    "distance": spot["price"] - int(strike_text.replace(",", "")),
                    "ts": ts,
                    "t": t,
                    "sec_left": sec_left,
                    "minute_left": int(sec_left // 60),
                }
            )
    return rows


def event_future(rows: list[dict], idx: int, seconds: float, direction: str) -> tuple[int, float]:
    start = rows[idx]
    end_t = start["t"] + seconds
    best = start["yes"]
    best_dt = 0.0
    for future in rows[idx + 1 :]:
        if future["t"] > end_t:
            break
        if direction == "up" and future["yes"] > best:
            best = future["yes"]
            best_dt = future["t"] - start["t"]
        if direction == "down" and future["yes"] < best:
            best = future["yes"]
            best_dt = future["t"] - start["t"]
    return best - start["yes"], best_dt


def build_lag_events(rows: list[dict]) -> list[dict]:
    by_contract: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for row in rows:
        by_contract[(row["hour"], row["strike"])].append(row)
    events: list[dict] = []
    for (hour, strike), contract_rows in by_contract.items():
        contract_rows.sort(key=lambda item: item["t"])
        for idx in range(1, len(contract_rows)):
            previous = contract_rows[idx - 1]
            current = contract_rows[idx]
            dt = current["t"] - previous["t"]
            if dt <= 0 or dt > 8:
                continue
            btc_delta = current["btc"] - previous["btc"]
            yes_delta = current["yes"] - previous["yes"]
            if btc_delta == 0:
                continue
            direction = "up" if btc_delta > 0 else "down"
            same_tick_reacted = yes_delta > 0 if direction == "up" else yes_delta < 0
            stale = not same_tick_reacted
            future = {}
            for horizon in (2, 5, 10, 20, 30):
                move, seconds_to_best = event_future(contract_rows, idx, horizon, direction)
                future[f"{horizon}s_move"] = move
                future[f"{horizon}s_delay"] = seconds_to_best
            events.append(
                {
                    "hour": hour,
                    "strike": strike,
                    "ts": current["ts"],
                    "t": current["t"],
                    "minute_left": current["minute_left"],
                    "sec_left": round(current["sec_left"], 3),
                    "btc": current["btc"],
                    "btc_delta": btc_delta,
                    "yes": current["yes"],
                    "yes_delta": yes_delta,
                    "distance": current["distance"],
                    "direction": direction,
                    "stale": stale,
                    **future,
                }
            )
    return events


def summarize_events(events: list[dict]) -> dict:
    summary = {
        "total_events": len(events),
        "by_direction": dict(Counter(item["direction"] for item in events)),
        "stale_by_direction": {},
        "top_exact_up_lags": [],
        "top_exact_down_lags": [],
        "top_repeated_up_lags": [],
        "top_repeated_down_lags": [],
    }
    for direction in ("up", "down"):
        subset = [item for item in events if item["direction"] == direction]
        stale = [item for item in subset if item["stale"]]
        summary["stale_by_direction"][direction] = {
            "events": len(subset),
            "stale": len(stale),
            "stale_pct": round(100 * len(stale) / len(subset), 2) if subset else 0,
        }

    for direction in ("up", "down"):
        groups: dict[tuple, list[dict]] = defaultdict(list)
        for item in events:
            if item["direction"] != direction or not item["stale"]:
                continue
            key = (item["minute_left"], item["btc_delta"], item["yes"], item["distance"])
            groups[key].append(item)
        scored = []
        for (minute_left, btc_delta, yes, distance), values in groups.items():
            if len(values) < 5:
                continue
            move_key = "10s_move"
            if direction == "up":
                hits = [item for item in values if item[move_key] >= 1]
                avg_best = mean(item[move_key] for item in values)
            else:
                hits = [item for item in values if item[move_key] <= -1]
                avg_best = mean(-item[move_key] for item in values)
            scored.append(
                {
                    "minute_left": minute_left,
                    "btc_delta": btc_delta,
                    "yes": yes,
                    "distance": distance,
                    "count": len(values),
                    "hit_count": len(hits),
                    "hit_rate": round(len(hits) / len(values), 4),
                    "avg_10s_follow_cents": round(avg_best, 3),
                    "median_10s_follow_cents": round(median(abs(item[move_key]) for item in values), 3),
                    "hours": dict(Counter(item["hour"] for item in values)),
                    "strikes": sorted(set(item["strike"] for item in values)),
                }
            )
        scored.sort(key=lambda item: (item["hit_rate"], item["avg_10s_follow_cents"], item["count"]), reverse=True)
        summary[f"top_exact_{direction}_lags"] = scored[:40]
        summary[f"top_repeated_{direction}_lags"] = [item for item in scored if item["count"] >= 20][:40]
    return summary


def main() -> None:
    args = parse_args()
    base = Path(args.base)
    spots = load_spots(base, args.date)
    rows = load_yes_rows(base, args.date, spots)
    events = build_lag_events(rows)
    report = {
        "date": args.date,
        "scope": "YES ABOVE only, first 50 minutes of each contract hour: 60 to 10 minutes left",
        "spot_sources": dict(Counter(item["source"] for rows in spots.values() for item in rows)),
        "yes_rows": len(rows),
        "yes_rows_by_hour": dict(Counter(item["hour"] for item in rows)),
        "events": summarize_events(events),
    }
    Path(args.out).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {args.out}")
    print(f"YES rows first50: {len(rows)}")
    print(f"Rows by hour: {dict(Counter(item['hour'] for item in rows))}")
    print(f"Lag events: {len(events)}")
    for direction in ("up", "down"):
        stats = report["events"]["stale_by_direction"][direction]
        print(f"{direction}: {stats}")
    print("Top repeated UP lags:")
    for item in report["events"]["top_repeated_up_lags"][:10]:
        print(item)


if __name__ == "__main__":
    main()
