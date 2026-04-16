#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

SOURCE_URL = "https://www.ruay.org/login"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36"
)

RESULT_COLUMNS = [
    "draw_date",
    "category",
    "market",
    "round",
    "field",
    "result",
    "digits",
    "payout",
    "is_placeholder",
    "source_url",
    "scraped_at",
]


def fetch_html(url: str, timeout: int) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def collapse_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def trim_modal_artifacts(value: str) -> str:
    for marker in ("ฉันเข้าใจและยอมรับ", "อัตราการจ่าย", "Hotline"):
        if marker in value:
            value = value.split(marker, 1)[0]
    return value.strip(" -\n\t")


def strip_tags(fragment: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    text = re.sub(r"</(p|div|h\d|ul|ol)>", "\n", text, flags=re.I)
    text = re.sub(r"<li[^>]*>", "- ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def comment_text(fragment: str) -> str:
    comments = re.findall(r"<!--(.*?)-->", fragment, flags=re.S)
    return strip_tags(" ".join(comments))


def clean_label(fragment: str) -> str:
    no_comments = re.sub(r"<!--.*?-->", "", fragment, flags=re.S)
    label = collapse_ws(strip_tags(no_comments))
    if label:
        return label
    commented = collapse_ws(comment_text(fragment))
    if commented:
        return re.sub(r"\s*\([^)]*\)\s*$", "", commented).strip()
    return ""


def clean_value(fragment: str) -> str:
    return collapse_ws(strip_tags(fragment))


def parse_payout(fragment: str) -> str:
    match = re.search(r"<small>\(([^)]+)\)</small>", fragment, flags=re.S)
    return collapse_ws(match.group(1)) if match else ""


def section_between(page: str, start_marker: str, end_marker: str) -> str:
    start = page.find(start_marker)
    if start == -1:
        return ""
    end = page.find(end_marker, start)
    if end == -1:
        return page[start:]
    return page[start:end]


def extract_section_date(fragment: str, heading: str) -> str:
    pattern = re.compile(
        re.escape(heading) + r'.*?<span class="badge[^"]*">([^<]+)</span>',
        flags=re.S,
    )
    match = pattern.search(fragment)
    return collapse_ws(match.group(1)) if match else ""


def extract_first_badge_text(fragment: str) -> str:
    match = re.search(r'<span[^>]*class="badge[^"]*"[^>]*>([^<]+)</span>', fragment, flags=re.S)
    return collapse_ws(match.group(1)) if match else ""


def is_placeholder(value: str) -> bool:
    return bool(re.fullmatch(r"[xX,]+", value))


def digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def make_row(
    *,
    draw_date: str,
    category: str,
    market: str,
    field: str,
    result: str,
    payout: str = "",
    round_no: str = "",
    scraped_at: str,
) -> dict[str, str]:
    digits = digits_only(result)
    return {
        "draw_date": draw_date,
        "category": category,
        "market": market,
        "round": round_no,
        "field": field,
        "result": result,
        "digits": digits,
        "payout": payout,
        "is_placeholder": "1" if is_placeholder(result) else "0",
        "source_url": SOURCE_URL,
        "scraped_at": scraped_at,
    }


def parse_yikee_rows(page: str, scraped_at: str) -> list[dict[str, str]]:
    section = section_between(
        page,
        'id="yeekee"',
        '<div class="bgwhitealpha shadow-sm rounded p-2 h-100 xtarget" id="government">',
    )
    draw_date = extract_first_badge_text(section)
    pattern = re.compile(
        r"จับยี่กี VIP - รอบที่\s*(\d+)\s*</div>\s*"
        r'<div class="card-body p-0">\s*<div class="d-flex flex-row">\s*'
        r'<div class="card text-center w-50 border-card-right m-0">\s*'
        r'<div class="card-header sub-card-header bg-transparent p-0">\s*(.*?)</div>\s*'
        r'<div class="card-body p-0">\s*<p class="card-text">(.*?)</p>\s*</div>\s*</div>\s*'
        r'<div class="card text-center w-50 border-card-right m-0">\s*'
        r'<div class="card-header sub-card-header bg-transparent p-0">\s*(.*?)</div>\s*'
        r'<div class="card-body p-0">\s*<p class="card-text">(.*?)</p>',
        flags=re.S,
    )
    rows: list[dict[str, str]] = []
    seen_rounds: set[str] = set()
    for match in pattern.finditer(section):
        round_no = collapse_ws(match.group(1))
        if round_no in seen_rounds:
            continue
        seen_rounds.add(round_no)
        pairs = [
            (clean_label(match.group(2)), clean_value(match.group(3)), parse_payout(match.group(2))),
            (clean_label(match.group(4)), clean_value(match.group(5)), parse_payout(match.group(4))),
        ]
        for field, result, payout in pairs:
            rows.append(
                make_row(
                    draw_date=draw_date,
                    category="yeekee_vip",
                    market="จับยี่กี VIP",
                    field=field,
                    result=result,
                    payout=payout,
                    round_no=round_no,
                    scraped_at=scraped_at,
                )
            )
    return rows


def parse_simple_block(
    page: str,
    *,
    start_marker: str,
    end_marker: str,
    category: str,
    market: str,
    scraped_at: str,
) -> list[dict[str, str]]:
    section = section_between(page, start_marker, end_marker)
    draw_date = extract_section_date(section, market) or extract_first_badge_text(section)
    pair_pattern = re.compile(
        r'<div class="card-header[^>]*>\s*(.*?)\s*</div>\s*'
        r'<div class="card-body[^>]*>.*?<p class="card-text">(.*?)</p>',
        flags=re.S,
    )
    rows: list[dict[str, str]] = []
    for header_html, value_html in pair_pattern.findall(section):
        field = clean_label(header_html)
        result = clean_value(value_html)
        if not field or not result:
            continue
        rows.append(
            make_row(
                draw_date=draw_date,
                category=category,
                market=market,
                field=field,
                result=result,
                payout=parse_payout(header_html),
                scraped_at=scraped_at,
            )
        )
    return rows


def parse_thai_stock_rows(page: str, scraped_at: str) -> list[dict[str, str]]:
    section = section_between(page, 'id="thaiStock"', "<!-- end หวยหุ้นไทย -->")
    draw_date = extract_section_date(section, "หวยหุ้นไทย") or extract_first_badge_text(section)
    market_pattern = re.compile(
        r'<div class="card-header text-danger p-1">\s*(.*?)\s*</div>\s*'
        r'<div class="card-body p-0">\s*<div class="d-flex flex-row">\s*'
        r'<div class="card text-center w-50 border-card-right">\s*'
        r'<div class="card-header sub-card-header bg-transparent p-0">\s*(.*?)</div>\s*'
        r'<div class="card-body p-0">\s*<p class="card-text">(.*?)</p>\s*</div>\s*</div>\s*'
        r'<div class="card text-center w-50 border-card-right">\s*'
        r'<div class="card-header sub-card-header bg-transparent p-0">\s*(.*?)</div>\s*'
        r'<div class="card-body p-0">\s*<p class="card-text">(.*?)</p>',
        flags=re.S,
    )
    rows: list[dict[str, str]] = []
    for market_html, header_one, value_one, header_two, value_two in market_pattern.findall(section):
        market = clean_label(market_html)
        pairs = [
            (clean_label(header_one), clean_value(value_one), parse_payout(header_one)),
            (clean_label(header_two), clean_value(value_two), parse_payout(header_two)),
        ]
        for field, result, payout in pairs:
            rows.append(
                make_row(
                    draw_date=draw_date,
                    category="thai_stock",
                    market=market,
                    field=field,
                    result=result,
                    payout=payout,
                    scraped_at=scraped_at,
                )
            )
    return rows


def parse_foreign_stock_rows(page: str, scraped_at: str) -> list[dict[str, str]]:
    section = section_between(page, 'id="foreignStock"', "<!-- end หวยหุ้นต่างประเทศ -->")
    draw_date = extract_section_date(section, "หวยหุ้นต่างประเทศ") or extract_first_badge_text(section)
    item_pattern = re.compile(
        r'<div class="card-header text-danger p-1">\s*(?:<span[^>]*></span>\s*)?(.*?)\s*</div>\s*'
        r'<div class="card-body p-0">\s*<div class="d-flex flex-row">\s*'
        r'<div class="card text-center w-50 border-card-right m-0">\s*'
        r'<div class="card-header sub-card-header bg-transparent p-0">\s*(.*?)</div>\s*'
        r'<div class="card-body p-0">\s*<p class="card-text">(.*?)</p>\s*</div>\s*</div>\s*'
        r'<div class="card text-center w-50 border-card-right m-0">\s*'
        r'<div class="card-header sub-card-header bg-transparent p-0">\s*(.*?)</div>\s*'
        r'<div class="card-body p-0">\s*<p class="card-text">(.*?)</p>',
        flags=re.S,
    )
    rows: list[dict[str, str]] = []
    for market_html, header_one, value_one, header_two, value_two in item_pattern.findall(section):
        market = clean_label(market_html)
        if market in {"Previous", "Next"} or not market:
            continue
        pairs = [
            (clean_label(header_one), clean_value(value_one), parse_payout(header_one)),
            (clean_label(header_two), clean_value(value_two), parse_payout(header_two)),
        ]
        for field, result, payout in pairs:
            rows.append(
                make_row(
                    draw_date=draw_date,
                    category="foreign_stock",
                    market=market,
                    field=field,
                    result=result,
                    payout=payout,
                    scraped_at=scraped_at,
                )
            )
    return rows


def extract_rules(page: str) -> dict[str, object]:
    modal_match = re.search(
        r'id="ModalRule".*?<div class="modal-body">(.*?)</div>\s*</div>\s*<div class="modal-footer">',
        page,
        flags=re.S,
    )
    if not modal_match:
        return {"intro": "", "sections": []}
    body = modal_match.group(1)
    intro_match = re.search(r"<p[^>]*>(.*?)</p>", body, flags=re.S)
    intro = trim_modal_artifacts(collapse_ws(strip_tags(intro_match.group(1)))) if intro_match else ""
    section_pattern = re.compile(
        r"<strong[^>]*><u[^>]*>(.*?)</u></strong><br\s*/?>\s*(.*?)(?=(?:<p>\s*<strong|$))",
        flags=re.S,
    )
    sections = []
    for title_html, content_html in section_pattern.findall(body):
        title = collapse_ws(strip_tags(title_html))
        bullets = []
        for bullet_html in re.findall(r"<li[^>]*>(.*?)</li>", content_html, flags=re.S):
            bullet = trim_modal_artifacts(collapse_ws(strip_tags(bullet_html)))
            if bullet:
                bullets.append(bullet)
        paragraph = trim_modal_artifacts(
            collapse_ws(strip_tags(re.sub(r"<ul.*?</ul>", "", content_html, flags=re.S)))
        )
        sections.append({"title": title, "paragraph": paragraph, "bullets": bullets})
    return {"intro": intro, "sections": sections}


def parse_page(page: str, scraped_at: str) -> tuple[list[dict[str, str]], dict[str, object]]:
    rows: list[dict[str, str]] = []
    rows.extend(parse_yikee_rows(page, scraped_at))
    rows.extend(
        parse_simple_block(
            page,
            start_marker='<div class="bgwhitealpha shadow-sm rounded p-2 h-100 xtarget" id="government">',
            end_marker="<!-- end หวยรัฐบาล -->",
            category="government",
            market="หวยรัฐบาล",
            scraped_at=scraped_at,
        )
    )
    rows.extend(
        parse_simple_block(
            page,
            start_marker='<h6><span class="flag-icon flag-icon-baac"></span> หวย ธกส.',
            end_marker="<!-- end ธกส. -->",
            category="baac",
            market="หวย ธกส.",
            scraped_at=scraped_at,
        )
    )
    rows.extend(parse_thai_stock_rows(page, scraped_at))
    rows.extend(parse_foreign_stock_rows(page, scraped_at))
    return rows, extract_rules(page)


def load_existing_rows(path: Path) -> dict[tuple[str, str, str, str, str], dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return {
            (row["draw_date"], row["category"], row["market"], row["round"], row["field"]): row
            for row in reader
        }


def write_rows(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=RESULT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, payload: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")


def build_stats(rows: list[dict[str, str]], scraped_at: str) -> dict[str, object]:
    complete_rows = [row for row in rows if row["is_placeholder"] == "0" and row["digits"]]
    by_market_field: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_category = Counter(row["category"] for row in rows)
    for row in complete_rows:
        by_market_field[f'{row["market"]}|{row["field"]}'].append(row)

    markets = {}
    for key, group in sorted(by_market_field.items()):
        values = [row["digits"] for row in group]
        digits = Counter("".join(values))
        markets[key] = {
            "observations": len(group),
            "latest_draw_date": max(row["draw_date"] for row in group),
            "latest_value": group[-1]["result"],
            "top_values": [
                {"value": value, "count": count}
                for value, count in Counter(values).most_common(10)
            ],
            "digit_frequency": dict(sorted(digits.items())),
        }

    return {
        "updated_at": scraped_at,
        "row_count": len(rows),
        "completed_row_count": len(complete_rows),
        "categories": dict(sorted(by_category.items())),
        "markets": markets,
    }


def build_rules_markdown(rules: dict[str, object], scraped_at: str) -> str:
    lines = [
        "# RUAY Rules Snapshot",
        "",
        f"- Source: {SOURCE_URL}",
        f"- Captured at: {scraped_at}",
        "",
    ]
    intro = rules.get("intro") or ""
    if intro:
        lines.extend([intro, ""])
    for section in rules.get("sections", []):
        title = section.get("title", "").strip()
        paragraph = section.get("paragraph", "").strip()
        bullets = section.get("bullets", [])
        if title:
            lines.extend([f"## {title}", ""])
        if paragraph:
            lines.extend([paragraph, ""])
        for bullet in bullets:
            lines.append(f"- {bullet}")
        if bullets:
            lines.append("")
    return "\n".join(lines).strip() + "\n"


def build_summary_markdown(
    *,
    rows: list[dict[str, str]],
    stats: dict[str, object],
    rules: dict[str, object],
    scraped_at: str,
) -> str:
    lines = [
        "# RUAY Daily Summary",
        "",
        f"- Source: {SOURCE_URL}",
        f"- Captured at: {scraped_at}",
        f'- Rows stored: {stats["row_count"]}',
        f'- Completed numeric rows: {stats["completed_row_count"]}',
        "",
        "## Today",
        "",
    ]
    latest_draw_dates = {}
    for row in rows:
        latest_draw_dates[row["category"]] = row["draw_date"]
    for category, count in stats["categories"].items():
        lines.append(f"- {category}: {count} rows, draw date {latest_draw_dates.get(category, '-')}")
    lines.append("")
    lines.extend(["## Sample Results", ""])
    complete_rows = [row for row in rows if row["is_placeholder"] == "0"]
    for row in complete_rows[:20]:
        market = row["market"]
        round_suffix = f' รอบ {row["round"]}' if row["round"] else ""
        lines.append(f'- {market}{round_suffix} | {row["field"]}: {row["result"]}')
    lines.append("")
    lines.extend(["## Frequency Snapshot", ""])
    market_items = list(stats["markets"].items())[:12]
    for key, payload in market_items:
        lines.append(
            f'- {key}: {payload["observations"]} observations, latest {payload["latest_value"]}, '
            f'top {payload["top_values"][:3]}'
        )
    lines.append("")
    lines.extend(["## Rule Highlights", ""])
    for section in rules.get("sections", [])[:4]:
        title = section.get("title", "").strip()
        bullets = section.get("bullets", [])
        paragraph = section.get("paragraph", "").strip()
        snippet = bullets[0] if bullets else paragraph
        if title and snippet:
            lines.append(f"- {title}: {snippet}")
    lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch the public RUAY page and persist daily result/stat snapshots."
    )
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Project directory where data/ and reports/ will be written.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=20,
        help="HTTP timeout in seconds.",
    )
    parser.add_argument(
        "--skip-raw",
        action="store_true",
        help="Skip writing the raw HTML snapshot.",
    )
    args = parser.parse_args()

    base_dir = args.base_dir.resolve()
    now = dt.datetime.now(dt.timezone.utc).astimezone()
    scraped_at = now.isoformat(timespec="seconds")
    stamp = now.strftime("%Y%m%d-%H%M%S")
    day = now.strftime("%Y-%m-%d")

    try:
        page = fetch_html(SOURCE_URL, timeout=args.timeout)
    except URLError as exc:
        print(f"Fetch failed: {exc}", file=sys.stderr)
        return 1

    rows, rules = parse_page(page, scraped_at)
    if not rows:
        print("No result rows were parsed from the page.", file=sys.stderr)
        return 1

    raw_dir = base_dir / "data" / "raw"
    snapshots_dir = base_dir / "data" / "snapshots"
    results_path = base_dir / "data" / "results.csv"
    stats_path = base_dir / "data" / "stats.json"
    rules_path = base_dir / "reports" / "rules.md"
    summary_path = base_dir / "reports" / "latest_summary.md"

    if not args.skip_raw:
        write_text(raw_dir / f"{stamp}.html", page)

    write_json(
        snapshots_dir / f"{day}.json",
        {"captured_at": scraped_at, "source": SOURCE_URL, "rows": rows, "rules": rules},
    )

    existing = load_existing_rows(results_path)
    for row in rows:
        key = (row["draw_date"], row["category"], row["market"], row["round"], row["field"])
        existing[key] = row
    merged_rows = [existing[key] for key in sorted(existing)]
    write_rows(results_path, merged_rows)

    stats = build_stats(merged_rows, scraped_at)
    write_json(stats_path, stats)
    write_text(rules_path, build_rules_markdown(rules, scraped_at))
    write_text(
        summary_path,
        build_summary_markdown(rows=merged_rows, stats=stats, rules=rules, scraped_at=scraped_at),
    )

    print(f"Saved {len(rows)} rows from the current fetch.")
    print(f"Results CSV: {results_path}")
    print(f"Summary: {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
