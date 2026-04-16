#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
from collections import Counter
from pathlib import Path

SOURCE_URL = "https://www.ruay.org/login"
ROUND_COUNT = 88
FIELD_DIGITS = {"3ตัวบน": 3, "2ตัวล่าง": 2}


def parse_draw_date(label: str) -> str:
    return dt.datetime.strptime(label, "%d %B %Y").date().isoformat()


def read_yikee_rows(results_path: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    with results_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row["category"] != "yeekee_vip":
                continue
            draw_date_iso = parse_draw_date(row["draw_date"])
            digits = row["digits"]
            rows.append(
                {
                    "date": draw_date_iso,
                    "draw_label": row["draw_date"],
                    "round": int(row["round"]),
                    "field": row["field"],
                    "value": row["result"],
                    "digits": digits,
                    "payout": row["payout"],
                    "is_placeholder": row["is_placeholder"] == "1",
                    "captured_at": row["scraped_at"],
                }
            )
    rows.sort(key=lambda item: (item["date"], item["round"], item["field"]))
    return rows


def complete_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        row
        for row in rows
        if not row["is_placeholder"]
        and row["digits"]
        and len(str(row["digits"])) == FIELD_DIGITS.get(str(row["field"]), len(str(row["digits"])))
    ]


def latest_status(rows: list[dict[str, object]]) -> dict[str, object]:
    latest_date = max(str(row["date"]) for row in rows)
    latest_rows = [row for row in rows if row["date"] == latest_date]
    latest_complete = complete_rows(latest_rows)
    field_completion = {}
    for field in FIELD_DIGITS:
        field_completion[field] = len({row["round"] for row in latest_complete if row["field"] == field})
    completed_rounds = len({row["round"] for row in latest_complete})
    complete_rounds_sorted = sorted({row["round"] for row in latest_complete})
    return {
        "date": latest_date,
        "draw_label": next(str(row["draw_label"]) for row in latest_rows),
        "visible_rounds": len({row["round"] for row in latest_rows}),
        "completed_rounds": completed_rounds,
        "field_completion": field_completion,
        "last_completed_round": complete_rounds_sorted[-1] if complete_rounds_sorted else None,
        "pending_rounds": [round_no for round_no in range(1, ROUND_COUNT + 1) if round_no not in set(complete_rounds_sorted)],
        "captured_at": max(str(row["captured_at"]) for row in latest_rows),
    }


def build_summary(rows: list[dict[str, object]], latest: dict[str, object], generated_at: str) -> str:
    numeric = complete_rows(rows)
    days = sorted({str(row["date"]) for row in rows})
    by_field = {}
    for field in FIELD_DIGITS:
        field_rows = [row for row in numeric if row["field"] == field]
        exact_counts = Counter(str(row["digits"]) for row in field_rows)
        digit_counts = Counter("".join(str(row["digits"]) for row in field_rows))
        by_field[field] = {
            "observations": len(field_rows),
            "top_values": exact_counts.most_common(8),
            "top_digits": digit_counts.most_common(6),
        }

    latest_numeric = [row for row in numeric if row["date"] == latest["date"]]
    latest_numeric.sort(key=lambda item: (item["round"], item["field"]))

    lines = [
        "# RUAY Yikee Read-Only Summary",
        "",
        f"- Source: {SOURCE_URL}",
        f"- Generated at: {generated_at}",
        f"- Days captured: {len(days)}",
        f"- Total visible rows: {len(rows)}",
        f"- Completed numeric rows: {len(numeric)}",
        "",
        "## Latest Draw Status",
        "",
        f'- Draw date: {latest["draw_label"]}',
        f'- Completed rounds: {latest["completed_rounds"]}/{ROUND_COUNT}',
        f'- 3ตัวบน complete rounds: {latest["field_completion"]["3ตัวบน"]}',
        f'- 2ตัวล่าง complete rounds: {latest["field_completion"]["2ตัวล่าง"]}',
        f'- Last completed round seen: {latest["last_completed_round"] or "-"}',
        f'- Latest capture timestamp: {latest["captured_at"]}',
        "",
        "## Latest Completed Rounds",
        "",
    ]

    for row in latest_numeric[-16:]:
        lines.append(f'- รอบ {row["round"]:02d} | {row["field"]}: {row["value"]}')

    lines.extend(["", "## Field Frequency Snapshot", ""])
    for field, payload in by_field.items():
        lines.append(f'- {field}: {payload["observations"]} observations')
        lines.append(f'  top values: {payload["top_values"][:5]}')
        lines.append(f'  top digits: {payload["top_digits"][:5]}')
    lines.extend(
        [
            "",
            "## Note",
            "",
            "- This dashboard is read-only and built from the public RUAY login page.",
            "- Frequency data is for record-keeping and observation only, not betting advice.",
            "",
        ]
    )
    return "\n".join(lines)


def build_bundle(rows: list[dict[str, object]], latest: dict[str, object], generated_at: str) -> dict[str, object]:
    numeric = complete_rows(rows)
    dates = sorted({str(row["date"]) for row in rows})
    return {
        "source": SOURCE_URL,
        "generated_at": generated_at,
        "fields": list(FIELD_DIGITS),
        "rounds": list(range(1, ROUND_COUNT + 1)),
        "dates": dates,
        "coverage": {
            "start": dates[0] if dates else None,
            "end": dates[-1] if dates else None,
            "day_count": len(dates),
            "row_count": len(rows),
            "complete_row_count": len(numeric),
        },
        "latest_status": latest,
        "records": rows,
    }


def write_text(path: Path, payload: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a read-only RUAY yikee dashboard bundle.")
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Project root containing data/results.csv",
    )
    args = parser.parse_args()

    base_dir = args.base_dir.resolve()
    results_path = base_dir / "data" / "results.csv"
    if not results_path.exists():
        raise SystemExit(f"Missing results file: {results_path}")

    rows = read_yikee_rows(results_path)
    if not rows:
        raise SystemExit("No yeekee rows found in results.csv")

    now = dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds")
    latest = latest_status(rows)
    bundle = build_bundle(rows, latest, now)

    data_path = base_dir / "yikee" / "data" / "history.json"
    dashboard_bundle_path = base_dir / "yikee" / "dashboard" / "dashboard-data.js"
    summary_path = base_dir / "yikee" / "reports" / "summary.md"

    write_json(data_path, bundle)
    write_text(
        dashboard_bundle_path,
        "window.RUAY_YIKEE_DATA = " + json.dumps(bundle, ensure_ascii=False, indent=2) + ";\n",
    )
    write_text(summary_path, build_summary(rows, latest, now))

    print(f"Built yikee dashboard bundle from {len(rows)} rows.")
    print(f"Data JSON: {data_path}")
    print(f"Summary: {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
