#!/usr/bin/env python3
"""Create YES-only BTC strike logs from raw scanner logs."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


STRIKE_RE = re.compile(
    r"^(BTC HOURLY \(.*?\) - \$[0-9,]+ - YES ABOVE \d+c)(?: \| NO ABOVE \d+c)? - (.+)$"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="records/BITCOIN SCAN RECORDING")
    parser.add_argument("--date", default="2026-05-29")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base = Path(args.base)
    src_dir = base / "bitcoin strike price log" / args.date
    dst_dir = base / "bitcoin strike price log yes-only" / args.date
    dst_dir.mkdir(parents=True, exist_ok=True)

    total_in = 0
    total_out = 0
    skipped = 0
    files = 0
    for src in sorted(src_dir.glob("btc-hourly-*.txt")):
        cleaned = []
        for line in src.read_text().splitlines():
            total_in += 1
            match = STRIKE_RE.match(line)
            if not match:
                skipped += 1
                continue
            yes_part, ts = match.groups()
            cleaned.append(f"{yes_part} - {ts}")
        (dst_dir / src.name).write_text("\n".join(cleaned) + ("\n" if cleaned else ""))
        total_out += len(cleaned)
        files += 1

    print(f"files={files}")
    print(f"raw_rows={total_in}")
    print(f"yes_only_rows={total_out}")
    print(f"skipped_rows={skipped}")
    print(f"output={dst_dir}")


if __name__ == "__main__":
    main()
