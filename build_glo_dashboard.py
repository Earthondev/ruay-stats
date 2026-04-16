#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable
from urllib.request import Request, urlopen

SOURCE_YEAR_URL = "https://www.glo.or.th/api/lottery/getLotteryResultByYear"
SOURCE_LATEST_URL = "https://www.glo.or.th/api/lottery/getLatestLottery"
SOURCE_CATALOG_URL = (
    "https://gdcatalog.glo.or.th/en/dataset/dataset_c4-9_01/resource/"
    "64b39af8-fd9a-4eab-87d4-9193768c3812"
)
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36"
)


def post_json(url: str, payload: dict[str, object], timeout: int) -> dict[str, object]:
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_year_draws(year: int, timeout: int) -> list[dict[str, object]]:
    payload = {"year": str(year)}
    response = post_json(SOURCE_YEAR_URL, payload, timeout=timeout)
    draws = response.get("response")
    return draws if isinstance(draws, list) else []


def fetch_latest_draw(timeout: int) -> dict[str, object] | None:
    response = post_json(SOURCE_LATEST_URL, {}, timeout=timeout)
    latest = response.get("response")
    if isinstance(latest, dict):
        return latest
    return None


def only_digits(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def first_value(values: object) -> str:
    if isinstance(values, list) and values:
        return str(values[0])
    return ""


def many_values(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned = [only_digits(str(item)) for item in values]
    return [item for item in cleaned if item]


def normalize_draw(draw: dict[str, object]) -> dict[str, object] | None:
    draw_date = str(draw.get("date") or "").strip()
    data = draw.get("data")
    if not draw_date or not isinstance(data, dict):
        return None

    first = only_digits(first_value(data.get("first")))
    last2 = only_digits(first_value(data.get("last2")))
    last3f = many_values(data.get("last3f"))
    last3b = many_values(data.get("last3b"))
    year = int(draw_date[:4])

    return {
        "date": draw_date,
        "year": year,
        "first": first,
        "first_last3": first[-3:] if len(first) >= 3 else "",
        "last2": last2,
        "last3f": last3f,
        "last3b": last3b,
    }


def mode_samples(draws: Iterable[dict[str, object]], mode: str) -> list[str]:
    samples: list[str] = []
    for draw in draws:
        if mode == "last2":
            value = str(draw.get("last2") or "")
            if value:
                samples.append(value)
        elif mode == "first_last3":
            value = str(draw.get("first_last3") or "")
            if value:
                samples.append(value)
        elif mode == "last3f":
            samples.extend(str(item) for item in draw.get("last3f", []))
        elif mode == "last3b":
            samples.extend(str(item) for item in draw.get("last3b", []))
        elif mode == "all_last3":
            value = str(draw.get("first_last3") or "")
            if value:
                samples.append(value)
            samples.extend(str(item) for item in draw.get("last3f", []))
            samples.extend(str(item) for item in draw.get("last3b", []))
    return [sample for sample in samples if sample]


def hot_digit_summary(samples: list[str]) -> dict[str, object]:
    if not samples:
        return {"digit": "-", "count": 0, "share": 0.0}
    digit_counter = Counter("".join(samples))
    digit, count = digit_counter.most_common(1)[0]
    return {
        "digit": digit,
        "count": count,
        "share": round(count / len(samples), 4),
    }


def hot_number_summary(samples: list[str]) -> dict[str, object]:
    if not samples:
        return {"value": "-", "count": 0, "share": 0.0}
    counter = Counter(samples)
    value, count = counter.most_common(1)[0]
    return {
        "value": value,
        "count": count,
        "share": round(count / len(samples), 4),
    }


def build_summary(draws: list[dict[str, object]], generated_at: str) -> str:
    lines = [
        "# GLO Lottery History Summary",
        "",
        f"- Generated at: {generated_at}",
        f"- Source API: `{SOURCE_YEAR_URL}`",
        f"- Catalog reference: {SOURCE_CATALOG_URL}",
        f"- Draw count: {len(draws)}",
    ]
    if draws:
        lines.extend(
            [
                f"- Coverage: {draws[0]['date']} to {draws[-1]['date']}",
                f"- Year span: {draws[0]['year']} to {draws[-1]['year']}",
                "",
                "## Frequency Snapshot",
                "",
            ]
        )
    else:
        return "\n".join(lines) + "\n"

    mode_labels = {
        "last2": "เลขท้าย 2 ตัว",
        "first_last3": "3 หลักท้ายของรางวัลที่ 1",
        "last3f": "เลขหน้า 3 ตัว",
        "last3b": "เลขท้าย 3 ตัว",
        "all_last3": "รวม 3 หลักที่วิเคราะห์ได้ทั้งหมด",
    }
    for mode, label in mode_labels.items():
        samples = mode_samples(draws, mode)
        hot_digit = hot_digit_summary(samples)
        hot_number = hot_number_summary(samples)
        lines.append(
            f"- {label}: {len(samples)} samples, digit เด่นย้อนหลัง `{hot_digit['digit']}` "
            f"({hot_digit['count']} hits), เลขเด่นย้อนหลัง `{hot_number['value']}` "
            f"({hot_number['count']} hits)"
        )
    lines.extend(
        [
            "",
            "## Interpretation Guardrail",
            "",
            "- ตัวเลขด้านบนคือความถี่ในอดีต ไม่ใช่การเพิ่มโอกาสถูกของงวดถัดไป",
            "- ถ้าต้องการใช้กับการตัดสินใจ ควรอ่านเป็นแนวโน้มเชิงสถิติ ไม่ใช่สัญญาณทำนาย",
            "- โครงสร้างรางวัลใน API เปลี่ยนตามยุค บางช่วงปีเก่ายังไม่มีเลขหน้า 3 ตัว และเลขท้าย 3 ตัวมีจำนวนค่าต่อหนึ่งงวดไม่เท่าปัจจุบัน",
            "",
        ]
    )
    return "\n".join(lines)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, payload: object) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def write_js_payload(path: Path, variable_name: str, payload: object) -> None:
    content = f"window.{variable_name} = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    write_text(path, content)


def dedupe_and_sort(draws: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    unique: dict[str, dict[str, object]] = {}
    for draw in draws:
        unique[str(draw["date"])] = draw
    return [unique[key] for key in sorted(unique)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a local dashboard from official GLO lottery history.")
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Project root directory.",
    )
    parser.add_argument(
        "--start-year",
        type=int,
        default=2010,
        help="First Gregorian year to request from the official API.",
    )
    parser.add_argument(
        "--end-year",
        type=int,
        default=dt.date.today().year,
        help="Last Gregorian year to request from the official API.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=20,
        help="HTTP timeout in seconds.",
    )
    args = parser.parse_args()

    base_dir = args.base_dir.resolve()
    draws: list[dict[str, object]] = []
    for year in range(args.start_year, args.end_year + 1):
        for raw_draw in fetch_year_draws(year, timeout=args.timeout):
            normalized = normalize_draw(raw_draw)
            if normalized:
                draws.append(normalized)

    draws = dedupe_and_sort(draws)
    latest = fetch_latest_draw(timeout=args.timeout)
    generated_at = dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds")

    payload = {
        "generatedAt": generated_at,
        "source": {
            "yearlyResultsApi": SOURCE_YEAR_URL,
            "latestApi": SOURCE_LATEST_URL,
            "catalog": SOURCE_CATALOG_URL,
        },
        "coverage": {
            "start": draws[0]["date"] if draws else None,
            "end": draws[-1]["date"] if draws else None,
            "years": sorted({draw["year"] for draw in draws}),
            "drawCount": len(draws),
        },
        "latest": latest,
        "draws": draws,
    }

    data_dir = base_dir / "glo" / "data"
    dashboard_dir = base_dir / "glo" / "dashboard"
    reports_dir = base_dir / "glo" / "reports"

    write_json(data_dir / "draws.json", payload)
    write_js_payload(dashboard_dir / "dashboard-data.js", "GLO_HISTORY_DATA", payload)
    write_text(reports_dir / "summary.md", build_summary(draws, generated_at))

    print(f"Fetched {len(draws)} draws from official GLO history.")
    print(f"Coverage: {payload['coverage']['start']} to {payload['coverage']['end']}")
    print(f"Dashboard data: {dashboard_dir / 'dashboard-data.js'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
