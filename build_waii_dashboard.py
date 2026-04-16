#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent

RESULT_COLUMNS = [
    "source",
    "section",
    "date",
    "date_label",
    "round",
    "game_code",
    "game_name",
    "game_name_short",
    "field",
    "result",
    "digits",
    "digit_length",
    "status",
    "close_datetime",
    "captured_at",
    "snapshot_file",
]

FIELD_META = {
    "FULL_NUMBER": {"label": "รางวัลที่ 1", "digits": 6},
    "RESULT_4UP": {"label": "4ตัวบน", "digits": 4},
    "RESULT_3UP": {"label": "3ตัวบน", "digits": 3},
    "RESULT_2DOWN": {"label": "2ตัวล่าง", "digits": 2},
    "RESULT_3DOWN": {"label": "3ตัวล่าง", "digits": 3},
}

THEORETICAL_FIXED_DIGIT_HIT_RATE = {
    2: round(1 - (9 / 10) ** 2, 4),
    3: round(1 - (9 / 10) ** 3, 4),
}


def load_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_snapshots(
    snapshots_dir: Path,
    latest_status: dict,
    latest_home: dict | None,
    latest_home_config: dict | None,
    latest_yeekee: list | None,
) -> list[dict]:
    snapshots: list[dict] = []
    if snapshots_dir.exists():
        for path in sorted(snapshots_dir.glob("*.json")):
            payload = load_json(path)
            if not payload:
                continue
            payload["_snapshot_file"] = path.name
            snapshots.append(payload)

    if snapshots:
        snapshots.sort(key=lambda item: item.get("capturedAt", ""))
        return snapshots

    fallback = {
        "capturedAt": latest_status.get("capturedAt"),
        "pages": latest_status.get("pages", []),
        "apiResponses": latest_status.get("apiResponses", {}),
        "requestFailures": latest_status.get("requestFailures", []),
        "consoleMessages": latest_status.get("consoleMessages", []),
        "availability": latest_status.get("availability", {}),
        "home": latest_home,
        "homeConfig": latest_home_config,
        "yeekee": latest_yeekee,
        "_snapshot_file": "latest-status.json",
    }
    if fallback["capturedAt"]:
        snapshots.append(fallback)
    return snapshots


def numeric_digits(value: object) -> str:
    text = str(value or "").strip()
    return text if text.isdigit() else ""


def coerce_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def flatten_home_results(snapshot: dict) -> list[dict[str, object]]:
    home = snapshot.get("home")
    if not isinstance(home, dict):
        return []

    captured_at = snapshot.get("capturedAt", "")
    snapshot_file = snapshot.get("_snapshot_file", "")
    rows: list[dict[str, object]] = []

    def add_row(
        *,
        section: str,
        field_key: str,
        result: object,
        date_label: str = "",
        game_code: str = "",
        game_name: str = "",
        game_name_short: str = "",
        close_datetime: str = "",
        round_no: int | None = None,
    ) -> None:
        meta = FIELD_META.get(field_key, {"label": field_key, "digits": 0})
        digits = numeric_digits(result)
        date_value = close_datetime[:10] if len(close_datetime) >= 10 else captured_at[:10]
        rows.append(
            {
                "source": "home",
                "section": section,
                "date": date_value,
                "date_label": date_label,
                "round": round_no,
                "game_code": game_code,
                "game_name": game_name,
                "game_name_short": game_name_short,
                "field": meta["label"],
                "result": str(result or "").strip(),
                "digits": digits,
                "digit_length": meta["digits"],
                "status": "complete" if digits and len(digits) == meta["digits"] else "pending",
                "close_datetime": close_datetime,
                "captured_at": captured_at,
                "snapshot_file": snapshot_file,
            }
        )

    gov = home.get("gov", {})
    if gov:
        add_row(section="gov", field_key="FULL_NUMBER", result=gov.get("FULL_NUMBER", ""), date_label=gov.get("GAME_NAME", ""))
        add_row(section="gov", field_key="RESULT_3UP", result=gov.get("RESULT_3UP", ""), date_label=gov.get("GAME_NAME", ""))
        add_row(section="gov", field_key="RESULT_2DOWN", result=gov.get("RESULT_2DOWN", ""), date_label=gov.get("GAME_NAME", ""))
        three_down = " ".join(
            value
            for value in (
                gov.get("RESULT_3DOWN1", ""),
                gov.get("RESULT_3DOWN2", ""),
                gov.get("RESULT_3DOWN3", ""),
                gov.get("RESULT_3DOWN4", ""),
            )
            if value
        )
        add_row(section="gov", field_key="RESULT_3DOWN", result=three_down or "รอผล", date_label=gov.get("GAME_NAME", ""))

    for section_name in ("baac", "gsb"):
        section = home.get(section_name, {})
        if not section:
            continue
        for field_key in ("RESULT_3UP", "RESULT_2DOWN"):
            add_row(section=section_name, field_key=field_key, result=section.get(field_key, ""), date_label=section.get("GAME_NAME", ""))

    list_sections = {
        "set": ("RESULT_4UP",),
        "settrade": ("RESULT_3UP", "RESULT_2DOWN"),
        "settradeInt": ("RESULT_3UP", "RESULT_2DOWN"),
        "settradeVIP": ("RESULT_3UP", "RESULT_2DOWN"),
        "settrandNoInt": ("RESULT_3UP", "RESULT_2DOWN"),
        "ppclose": ("RESULT_3UP", "RESULT_2DOWN"),
        "ppopen": ("RESULT_3UP", "RESULT_2DOWN"),
    }

    for section_name, fields in list_sections.items():
        section = home.get(section_name, {})
        date_label = section.get("DATE_GAME", "")
        for item in section.get("lists", []):
            round_no = coerce_int(item.get("SEQ")) or coerce_int(item.get("GAME_CODE"))
            for field_key in fields:
                add_row(
                    section=section_name,
                    field_key=field_key,
                    result=item.get(field_key, ""),
                    date_label=date_label,
                    game_code=str(item.get("GAME_CODE", "")),
                    game_name=item.get("GAME_NAME", ""),
                    game_name_short=item.get("GAME_NAME_SHORT", ""),
                    close_datetime=item.get("CLOSE_DATETIME", ""),
                    round_no=round_no,
                )

    return rows


def flatten_yeekee_schedule(snapshot: dict) -> list[dict[str, object]]:
    yeekee = snapshot.get("yeekee")
    if not isinstance(yeekee, list):
        return []

    captured_at = snapshot.get("capturedAt", "")
    snapshot_file = snapshot.get("_snapshot_file", "")
    rows: list[dict[str, object]] = []

    for item in yeekee:
        round_no = coerce_int(item.get("SEQ"))
        close_datetime = str(item.get("CLOSE_DATETIME", "") or "")
        date_value = close_datetime[:10] if len(close_datetime) >= 10 else captured_at[:10]
        for field_key in ("RESULT_3UP", "RESULT_2DOWN"):
            meta = FIELD_META[field_key]
            result = str(item.get(field_key, "") or "").strip()
            digits = numeric_digits(result)
            rows.append(
                {
                    "source": "yeekee",
                    "section": "schedule",
                    "date": date_value,
                    "date_label": date_value,
                    "round": round_no,
                    "game_code": str(item.get("GAME_ID", "")),
                    "game_name": item.get("GAME_NAME", ""),
                    "game_name_short": item.get("GAME_NAME_SHORT", ""),
                    "field": meta["label"],
                    "result": result,
                    "digits": digits,
                    "digit_length": meta["digits"],
                    "status": "complete" if digits and len(digits) == meta["digits"] else "pending",
                    "close_datetime": close_datetime,
                    "captured_at": captured_at,
                    "snapshot_file": snapshot_file,
                }
            )
    return rows


def dedupe_yeekee_records(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    keyed: dict[tuple[str, int | None, str], dict[str, object]] = {}
    for row in sorted(rows, key=lambda item: (str(item["captured_at"]), str(item["result"]))):
        key = (str(row["date"]), row["round"], str(row["field"]))
        current = keyed.get(key)
        row_complete = row["status"] == "complete"
        current_complete = current and current["status"] == "complete"
        if current is None:
            keyed[key] = row
            continue
        if row_complete and not current_complete:
            keyed[key] = row
            continue
        if row_complete == current_complete and str(row["captured_at"]) >= str(current["captured_at"]):
            keyed[key] = row
    records = list(keyed.values())
    records.sort(key=lambda item: (str(item["date"]), item["round"] or 0, str(item["field"])))
    return records


def build_capture_timeline(snapshots: list[dict]) -> list[dict[str, object]]:
    timeline = []
    for snapshot in snapshots:
        pages = {page.get("name"): page for page in snapshot.get("pages", [])}
        availability = snapshot.get("availability", {})
        failures = snapshot.get("requestFailures", [])
        timeline.append(
            {
                "captured_at": snapshot.get("capturedAt"),
                "snapshot_file": snapshot.get("_snapshot_file"),
                "home_api_captured": bool(availability.get("homeApiCaptured")),
                "yeekee_api_captured": bool(availability.get("yeekeeApiCaptured")),
                "failure_count": len(failures),
                "home_final_url": pages.get("home", {}).get("finalUrl", ""),
                "yeekee_final_url": pages.get("yeekee", {}).get("finalUrl", ""),
            }
        )
    return timeline


def group_by_field(records: list[dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for record in records:
        grouped[str(record["field"])].append(record)
    for rows in grouped.values():
        rows.sort(key=lambda item: (str(item["date"]), item["round"] or 0))
    return dict(grouped)


def hot_digit(records: list[dict[str, object]]) -> tuple[str | None, Counter]:
    counter: Counter[str] = Counter()
    for record in records:
        counter.update(str(record["digits"]))
    if not counter:
        return None, counter
    top_count = max(counter.values())
    choices = sorted(digit for digit, count in counter.items() if count == top_count)
    return choices[0], counter


def cold_digit(records: list[dict[str, object]]) -> tuple[str | None, Counter]:
    counter: Counter[str] = Counter()
    for record in records:
        counter.update(str(record["digits"]))
    if not counter:
        return None, counter
    low_count = min(counter.values())
    choices = sorted(digit for digit, count in counter.items() if count == low_count)
    return choices[0], counter


def run_pattern_test(records: list[dict[str, object]], test_id: str, label: str, description: str, evaluator, baseline: float | None = None) -> dict[str, object]:
    hits = 0
    trials = 0
    recent_examples: list[dict[str, object]] = []
    for index in range(1, len(records)):
        outcome = evaluator(records[:index], records[index])
        if outcome is None:
            continue
        trials += 1
        if outcome["hit"]:
            hits += 1
        if len(recent_examples) < 6:
            recent_examples.append(
                {
                    "date": records[index]["date"],
                    "round": records[index]["round"],
                    "actual": records[index]["digits"],
                    "signal": outcome["signal"],
                    "hit": outcome["hit"],
                }
            )

    return {
        "id": test_id,
        "label": label,
        "description": description,
        "trials": trials,
        "hits": hits,
        "misses": max(trials - hits, 0),
        "hit_rate": round((hits / trials) * 100, 2) if trials else 0.0,
        "baseline_hit_rate": round(baseline * 100, 2) if baseline is not None else None,
        "recent_examples": recent_examples,
    }


def build_backtests(field_records: dict[str, list[dict[str, object]]]) -> dict[str, list[dict[str, object]]]:
    payload: dict[str, list[dict[str, object]]] = {}
    for field, records in field_records.items():
        digit_length = int(records[0]["digit_length"]) if records else 0
        baseline = THEORETICAL_FIXED_DIGIT_HIT_RATE.get(digit_length)

        tests = [
            run_pattern_test(
                records,
                "repeat_last_exact",
                "ผลถัดไปซ้ำเลขก่อนหน้า",
                "เช็กว่ารอบถัดไปให้ผลเลขตรงกับ observation ก่อนหน้าหรือไม่",
                lambda previous, current: {
                    "signal": previous[-1]["digits"],
                    "hit": current["digits"] == previous[-1]["digits"],
                },
            ),
            run_pattern_test(
                records,
                "share_prev_digit",
                "มี digit ซ้ำจากรอบก่อนหน้า",
                "เช็กว่าผลถัดไปมีอย่างน้อย 1 digit ซ้ำกับรอบก่อนหน้าหรือไม่",
                lambda previous, current: {
                    "signal": "".join(sorted(set(str(previous[-1]["digits"])))),
                    "hit": bool(set(str(previous[-1]["digits"])) & set(str(current["digits"]))),
                },
            ),
            run_pattern_test(
                records,
                "hot_digit_5",
                "ติด digit เด่นจาก 5 observations ล่าสุด",
                "ใช้ digit ที่ขึ้นบ่อยสุดจาก 5 observation ก่อนหน้า แล้วดูว่าผลถัดไปมี digit นี้หรือไม่",
                lambda previous, current: (
                    None
                    if len(previous) < 5 or hot_digit(previous[-5:])[0] is None
                    else {
                        "signal": hot_digit(previous[-5:])[0],
                        "hit": hot_digit(previous[-5:])[0] in str(current["digits"]),
                    }
                ),
                baseline,
            ),
            run_pattern_test(
                records,
                "cold_digit_5",
                "ติด digit อ่อนจาก 5 observations ล่าสุด",
                "ใช้ digit ที่ขึ้นน้อยสุดจาก 5 observation ก่อนหน้า แล้วดูว่าผลถัดไปมี digit นี้หรือไม่",
                lambda previous, current: (
                    None
                    if len(previous) < 5 or cold_digit(previous[-5:])[0] is None
                    else {
                        "signal": cold_digit(previous[-5:])[0],
                        "hit": cold_digit(previous[-5:])[0] in str(current["digits"]),
                    }
                ),
                baseline,
            ),
            run_pattern_test(
                records,
                "hot_digit_10",
                "ติด digit เด่นจาก 10 observations ล่าสุด",
                "ใช้ digit ที่ขึ้นบ่อยสุดจาก 10 observation ก่อนหน้า แล้วดูว่าผลถัดไปมี digit นี้หรือไม่",
                lambda previous, current: (
                    None
                    if len(previous) < 10 or hot_digit(previous[-10:])[0] is None
                    else {
                        "signal": hot_digit(previous[-10:])[0],
                        "hit": hot_digit(previous[-10:])[0] in str(current["digits"]),
                    }
                ),
                baseline,
            ),
        ]

        payload[field] = tests
    return payload


def build_yeekee_overview(records: list[dict[str, object]]) -> dict[str, object]:
    grouped = group_by_field(records)
    per_field = {}
    for field, rows in grouped.items():
        digit_counter = Counter()
        value_counter = Counter()
        for row in rows:
            digit_counter.update(str(row["digits"]))
            value_counter.update([str(row["digits"])])
        per_field[field] = {
            "record_count": len(rows),
            "day_count": len({str(row["date"]) for row in rows}),
            "top_digits": digit_counter.most_common(10),
            "top_values": value_counter.most_common(12),
            "latest_records": rows[-12:],
        }
    return {
        "fields": sorted(grouped),
        "record_count": len(records),
        "day_count": len({str(row["date"]) for row in records}),
        "latest_date": max((str(row["date"]) for row in records), default=None),
        "per_field": per_field,
        "backtests": build_backtests(grouped),
    }


def summarize(latest_status: dict, snapshots: list[dict], rows: list[dict[str, object]], yeekee_records: list[dict[str, object]], yeekee_overview: dict[str, object]) -> str:
    capture_timeline = build_capture_timeline(snapshots)
    lines = [
        "# WAII Public Collector Summary",
        "",
        f"- Generated at: `{dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec='seconds')}`",
        f"- Latest capture: `{latest_status.get('capturedAt', 'unknown')}`",
        f"- Snapshot count: `{len(snapshots)}`",
        f"- Home API captured runs: `{sum(1 for item in capture_timeline if item['home_api_captured'])}`",
        f"- Yeekee API captured runs: `{sum(1 for item in capture_timeline if item['yeekee_api_captured'])}`",
        f"- Normalized rows: `{len(rows)}`",
        f"- Complete yeekee rows: `{len(yeekee_records)}`",
        "",
        "## Current status",
        "",
        f"- Home API captured now: `{latest_status.get('availability', {}).get('homeApiCaptured', False)}`",
        f"- Home config captured now: `{latest_status.get('availability', {}).get('homeConfigCaptured', False)}`",
        f"- Yeekee API captured now: `{latest_status.get('availability', {}).get('yeekeeApiCaptured', False)}`",
        f"- Request failures now: `{len(latest_status.get('requestFailures', []))}`",
        "",
        "## Backtest readiness",
        "",
    ]

    if yeekee_records:
        lines.append(
            f"- Ready for limited pattern testing across `{yeekee_overview['day_count']}` day(s) and `{yeekee_overview['record_count']}` complete yeekee observations."
        )
    else:
        lines.append("- Not ready yet: no complete yeekee observations have been captured from WAII.")

    lines.extend(["", "## Recent capture timeline", ""])
    for item in capture_timeline[-8:]:
        lines.append(
            f"- `{item['captured_at']}` | home={item['home_api_captured']} "
            f"| yeekee={item['yeekee_api_captured']} | failures={item['failure_count']}"
        )

    return "\n".join(lines) + "\n"


def build_dashboard_payload(latest_status: dict, snapshots: list[dict], rows: list[dict[str, object]], yeekee_records: list[dict[str, object]], yeekee_overview: dict[str, object]) -> dict[str, object]:
    capture_timeline = build_capture_timeline(snapshots)
    latest_pages = latest_status.get("pages", [])
    return {
        "source": "https://wwii.one/",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "latestStatus": latest_status,
        "latestPages": latest_pages,
        "captureTimeline": capture_timeline,
        "coverage": {
            "snapshotCount": len(snapshots),
            "normalizedRowCount": len(rows),
            "completeYeekeeRowCount": len(yeekee_records),
            "homeApiCaptureCount": sum(1 for item in capture_timeline if item["home_api_captured"]),
            "yeekeeApiCaptureCount": sum(1 for item in capture_timeline if item["yeekee_api_captured"]),
            "latestCapture": latest_status.get("capturedAt"),
            "firstCapture": capture_timeline[0]["captured_at"] if capture_timeline else None,
        },
        "diagnostics": {
            "requestFailures": latest_status.get("requestFailures", []),
            "consoleMessages": latest_status.get("consoleMessages", []),
            "apiResponses": latest_status.get("apiResponses", {}),
        },
        "pageSnapshots": latest_pages,
        "normalizedRows": rows,
        "yeekee": {
            "records": yeekee_records,
            "overview": yeekee_overview,
            "readiness": {
                "hasAnyRecords": bool(yeekee_records),
                "enoughForBacktest": len(yeekee_records) >= 12,
            },
        },
    }


def write_text(path: Path, payload: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a WAII read-only dashboard and pattern-lab bundle.")
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=ROOT,
        help="Project root containing waii/",
    )
    args = parser.parse_args()

    base_dir = args.base_dir.resolve()
    waii_dir = base_dir / "waii"
    data_dir = waii_dir / "data"
    status = load_json(data_dir / "status.json") or {}
    latest_home = load_json(data_dir / "api-home.json")
    latest_home_config = load_json(data_dir / "api-home-cf.json")
    latest_yeekee = load_json(data_dir / "api-yeekee.json")

    snapshots = load_snapshots(data_dir / "snapshots", status, latest_home, latest_home_config, latest_yeekee)
    rows: list[dict[str, object]] = []
    for snapshot in snapshots:
        rows.extend(flatten_home_results(snapshot))
        rows.extend(flatten_yeekee_schedule(snapshot))

    rows.sort(key=lambda item: (str(item["captured_at"]), str(item["section"]), str(item["field"]), item["round"] or 0))
    yeekee_records = dedupe_yeekee_records([row for row in rows if row["source"] == "yeekee" and row["status"] == "complete"])
    yeekee_overview = build_yeekee_overview(yeekee_records) if yeekee_records else {"fields": [], "record_count": 0, "day_count": 0, "latest_date": None, "per_field": {}, "backtests": {}}

    with (base_dir / "waii" / "data" / "results.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=RESULT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    history_bundle = {
        "source": "https://wwii.one/",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "snapshots": build_capture_timeline(snapshots),
        "records": rows,
        "yeekee": {
            "records": yeekee_records,
            "overview": yeekee_overview,
        },
    }
    write_json(base_dir / "waii" / "data" / "history.json", history_bundle)

    payload = build_dashboard_payload(status, snapshots, rows, yeekee_records, yeekee_overview)
    write_text(
        base_dir / "waii" / "dashboard" / "dashboard-data.js",
        "window.WAII_DASHBOARD_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
    )
    write_text(base_dir / "waii" / "reports" / "summary.md", summarize(status, snapshots, rows, yeekee_records, yeekee_overview))

    print(f"Built WAII dashboard from {len(snapshots)} snapshots and {len(rows)} normalized rows.")
    print(f"History JSON: {base_dir / 'waii' / 'data' / 'history.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
