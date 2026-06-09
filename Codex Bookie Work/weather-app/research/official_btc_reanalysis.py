#!/usr/bin/env python3
"""BTC scanner reanalysis using Kalshi official settlement values."""

from __future__ import annotations

import argparse
import bisect
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median


STRIKE_RE = re.compile(
    r"^BTC HOURLY \((.*?)\) - \$([0-9,]+) - YES ABOVE (\d+)c(?: \| NO ABOVE (\d+)c)? - (.+)$"
)
SPOT_RE = re.compile(r"^BTC SPOT PRICE - \$([0-9,]+)(?: - SOURCE (.*?))? - (.+)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="records/BITCOIN SCAN RECORDING")
    parser.add_argument("--date", default="2026-05-29")
    parser.add_argument("--official-dir", default="/tmp")
    parser.add_argument("--out", default="research/official_btc_reanalysis_2026-05-29.json")
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


def load_official_finals(official_dir: Path) -> dict[int, dict]:
    finals: dict[int, dict] = {}
    for file in sorted(official_dir.glob("kalshi_event_*.json")):
        hour = int(file.stem.rsplit("_", 1)[1])
        data = json.loads(file.read_text())
        markets = data.get("markets") or []
        if not markets:
            continue
        values = sorted({m.get("expiration_value") for m in markets if m.get("expiration_value")})
        statuses = {m.get("status") for m in markets if m.get("status")}
        if not values or "finalized" not in statuses:
            continue
        by_strike = {round(float(m["floor_strike"]) + 0.01): m for m in markets}
        finals[hour] = {
            "final": float(values[0]),
            "event_ticker": markets[0].get("event_ticker"),
            "settlement_ts": markets[0].get("settlement_ts"),
            "by_strike": by_strike,
        }
    return finals


def load_spots(base: Path, date: str) -> dict[int, list[dict]]:
    spots: dict[int, list[dict]] = defaultdict(list)
    for file in sorted((base / "bitcoin spot price log" / date).glob("btc-spot-*.txt")):
        hour = parse_hour(file.name)
        for line in file.read_text().splitlines():
            match = SPOT_RE.match(line)
            if not match:
                continue
            price, source, ts = match.groups()
            spots[hour].append(
                {
                    "hour": hour,
                    "btc": int(price.replace(",", "")),
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
    choices = []
    if idx < len(hour_spots):
        choices.append(hour_spots[idx])
    if idx > 0:
        choices.append(hour_spots[idx - 1])
    return min(choices, key=lambda item: abs(item["t"] - t)) if choices else None


def load_rows(base: Path, date: str, spots: dict[int, list[dict]]) -> list[dict]:
    rows: list[dict] = []
    spot_times = {hour: [item["t"] for item in values] for hour, values in spots.items()}
    for file in sorted((base / "bitcoin strike price log" / date).glob("btc-hourly-*.txt")):
        hour = parse_hour(file.name)
        if hour not in spots:
            continue
        for line in file.read_text().splitlines():
            match = STRIKE_RE.match(line)
            if not match:
                continue
            _, strike_text, yes_text, no_text, ts = match.groups()
            t = parse_ts(ts)
            end = expiry_ts(hour, t)
            spot = nearest_spot(t, spots[hour], spot_times[hour])
            if not spot:
                continue
            strike = int(strike_text.replace(",", ""))
            rows.append(
                {
                    "hour": hour,
                    "strike": strike,
                    "yes": int(yes_text),
                    "no": int(no_text) if no_text is not None else 100 - int(yes_text),
                    "btc": spot["btc"],
                    "distance": spot["btc"] - strike,
                    "ts": ts,
                    "t": t,
                    "sec_left": end - t,
                    "minute_left": int((end - t) // 60),
                }
            )
    return rows


def one_contract_fee_cents(price_cents: int) -> int:
    p = price_cents / 100
    return math.ceil(100 * 0.07 * p * (1 - p))


def future_hit(rows: list[dict], idx: int, horizon: int, target_cents: int, direction: str) -> tuple[bool, float | None, int]:
    start = rows[idx]
    end_t = start["t"] + horizon
    best = start["yes"]
    hit_time = None
    for future in rows[idx + 1 :]:
        if future["t"] > end_t:
            break
        if direction == "up":
            best = max(best, future["yes"])
            if hit_time is None and future["yes"] >= start["yes"] + target_cents:
                hit_time = future["t"] - start["t"]
        else:
            best = min(best, future["yes"])
            if hit_time is None and future["yes"] <= start["yes"] - target_cents:
                hit_time = future["t"] - start["t"]
    return hit_time is not None, hit_time, best - start["yes"]


def summarize_hits(events: list[dict], direction: str, target: int, horizons: tuple[int, ...]) -> dict:
    subset = [event for event in events if event["direction"] == direction]
    out = {"events": len(subset)}
    for horizon in horizons:
        eligible = [event for event in subset if f"eligible_{horizon}" in event and event[f"eligible_{horizon}"]]
        hits = [event for event in eligible if event[f"hit_{target}_{horizon}"]]
        hit_times = [event[f"hit_time_{target}_{horizon}"] for event in hits]
        moves = [abs(event[f"best_move_{horizon}"]) for event in eligible]
        out[f"{horizon}s"] = {
            "eligible": len(eligible),
            "hits": len(hits),
            "hit_pct": round(100 * len(hits) / len(eligible), 2) if eligible else 0,
            "avg_best_move": round(mean(moves), 3) if moves else 0,
            "median_hit_time": round(median(hit_times), 3) if hit_times else None,
            "mean_hit_time": round(mean(hit_times), 3) if hit_times else None,
        }
    if 30 in horizons and 300 in horizons:
        elig = [event for event in subset if event.get("eligible_30") and event.get("eligible_300")]
        late = [event for event in elig if not event[f"hit_{target}_30"] and event[f"hit_{target}_300"]]
        out["late_after_30s_by_5m"] = {
            "eligible": len(elig),
            "hits": len(late),
            "pct": round(100 * len(late) / len(elig), 2) if elig else 0,
        }
    return out


def analyze_lag(rows: list[dict]) -> dict:
    first50 = [row for row in rows if 600 <= row["sec_left"] <= 3600]
    grouped: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for row in first50:
        grouped[(row["hour"], row["strike"])].append(row)

    horizons = (10, 30, 60, 120, 300)
    target = 4
    events = []
    for contract_rows in grouped.values():
        contract_rows.sort(key=lambda item: item["t"])
        for idx in range(1, len(contract_rows)):
            previous = contract_rows[idx - 1]
            current = contract_rows[idx]
            dt = current["t"] - previous["t"]
            if dt <= 0 or dt > 8:
                continue
            btc_delta = current["btc"] - previous["btc"]
            if btc_delta == 0:
                continue
            yes_delta = current["yes"] - previous["yes"]
            direction = "up" if btc_delta > 0 else "down"
            stale = yes_delta <= 0 if direction == "up" else yes_delta >= 0
            if not stale:
                continue
            event = {
                "hour": current["hour"],
                "strike": current["strike"],
                "ts": current["ts"],
                "btc_delta": btc_delta,
                "yes_delta": yes_delta,
                "yes": current["yes"],
                "distance": current["distance"],
                "direction": direction,
                "sec_left": current["sec_left"],
            }
            last_t = contract_rows[-1]["t"]
            for horizon in horizons:
                eligible = current["t"] + horizon <= last_t
                event[f"eligible_{horizon}"] = eligible
                hit, hit_time, best_move = future_hit(contract_rows, idx, horizon, target, direction) if eligible else (False, None, 0)
                event[f"hit_{target}_{horizon}"] = hit
                event[f"hit_time_{target}_{horizon}"] = hit_time
                event[f"best_move_{horizon}"] = best_move
            events.append(event)

    by_btc_delta = {}
    for direction in ("up", "down"):
        counter = Counter()
        hits_300 = Counter()
        for event in events:
            if event["direction"] != direction:
                continue
            delta = event["btc_delta"]
            counter[delta] += 1
            if event.get("eligible_300") and event.get("hit_4_300"):
                hits_300[delta] += 1
        repeated = []
        for delta, count in counter.items():
            if count < 100:
                continue
            repeated.append(
                {
                    "btc_delta": delta,
                    "events": count,
                    "hit_4c_5m": hits_300[delta],
                    "hit_pct": round(100 * hits_300[delta] / count, 2),
                }
            )
        by_btc_delta[direction] = sorted(repeated, key=lambda item: (item["hit_pct"], item["events"]), reverse=True)[:10]

    return {
        "first50_rows": len(first50),
        "stale_btc_move_events": len(events),
        "by_direction": dict(Counter(event["direction"] for event in events)),
        "target": target,
        "summary": {
            "btc_up_yes_catchup": summarize_hits(events, "up", target, horizons),
            "btc_down_yes_drop": summarize_hits(events, "down", target, horizons),
        },
        "repeated_exact_btc_delta": by_btc_delta,
    }


def analyze_expiration(rows: list[dict], finals: dict[int, dict]) -> dict:
    official_hours = set(finals)
    settled = [row for row in rows if row["hour"] in official_hours]
    last10 = [row for row in settled if 0 < row["sec_left"] <= 600]
    for row in last10:
        official = finals[row["hour"]]
        market = official["by_strike"].get(row["strike"])
        if market:
            yes_win = market.get("result") == "yes"
        else:
            yes_win = official["final"] > row["strike"] - 0.01
        row["official_final"] = official["final"]
        row["yes_win"] = yes_win
        row["no_win"] = not yes_win

    exact_yes = []
    by_yes: dict[int, list[dict]] = defaultdict(list)
    for row in last10:
        by_yes[row["yes"]].append(row)
    for yes, values in by_yes.items():
        wins = sum(1 for row in values if row["yes_win"])
        fee = one_contract_fee_cents(yes)
        net = sum((100 - yes - fee) if row["yes_win"] else -(yes + fee) for row in values)
        exact_yes.append(
            {
                "yes_price": yes,
                "rows": len(values),
                "yes_wins": wins,
                "win_pct": round(100 * wins / len(values), 2),
                "avg_net_cents": round(net / len(values), 3),
            }
        )

    return {
        "official_hours_used": sorted(official_hours),
        "rows_with_official_finals": len(settled),
        "last10_rows": len(last10),
        "last10_exact_yes_prices_min_2500_rows": sorted(
            [item for item in exact_yes if item["rows"] >= 2500],
            key=lambda item: item["avg_net_cents"],
            reverse=True,
        ),
        "last10_exact_yes_top_by_rows": sorted(exact_yes, key=lambda item: item["rows"], reverse=True)[:10],
    }


def main() -> None:
    args = parse_args()
    base = Path(args.base)
    finals = load_official_finals(Path(args.official_dir))
    spots = load_spots(base, args.date)
    rows = load_rows(base, args.date, spots)
    report = {
        "date": args.date,
        "official_finals": {
            str(hour): {
                "final": value["final"],
                "event_ticker": value["event_ticker"],
                "settlement_ts": value["settlement_ts"],
            }
            for hour, value in sorted(finals.items())
        },
        "scanner_hours": sorted({row["hour"] for row in rows}),
        "total_rows": len(rows),
        "lag": analyze_lag(rows),
        "expiration": analyze_expiration(rows, finals),
    }
    Path(args.out).write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
