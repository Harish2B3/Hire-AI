"""
CLI: read job JSON exports in this folder (same files as tasks.platform_jobs.SOURCE_FILES).

Refresh data by running the Playwright scrapers (Chrome with remote debugging), e.g.:
  python indeed_scrape.py
  python linkedin_scrape.py   # if present __main__
  python naukri_scrape.py

From the backend project root (with venv activated):
  python tasks/automation/extract_exported_jobs.py --search "python django" --limit 15
  python tasks/automation/extract_exported_jobs.py --summary
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Keep filenames aligned with tasks.platform_jobs.SOURCE_FILES
EXPORT_FILES: tuple[tuple[str, str], ...] = (
    ("Naukri", "structured_jobs_final.json"),
    ("Indeed", "indeed_jobs.json"),
    ("LinkedIn", "linkedin_public_results.json"),
)

HERE = Path(__file__).resolve().parent


def _tokens(q: str) -> list[str]:
    q = (q or "").strip().lower()
    toks = [t for t in re.findall(r"[a-z0-9]+", q) if len(t) >= 2]
    return toks[:12] if toks else ([q] if len(q) >= 2 else [])


def _haystack(row: dict) -> str:
    parts: list[str] = []
    for k in (
        "title",
        "jobTitle",
        "company",
        "companyName",
        "location",
        "description",
        "abstract",
        "salary",
        "experience",
        "job_type",
        "jobType",
    ):
        v = row.get(k)
        if isinstance(v, str):
            parts.append(v)
    skills = row.get("skills") or row.get("tags")
    if isinstance(skills, list):
        parts.extend(str(s) for s in skills)
    elif isinstance(skills, str):
        parts.append(skills)
    return " ".join(parts).lower()


def _matches(row: dict, tokens: list[str]) -> bool:
    if not tokens:
        return False
    h = _haystack(row)
    return all(t in h for t in tokens)


def load_all_rows() -> list[tuple[str, dict]]:
    rows: list[tuple[str, dict]] = []
    for source, name in EXPORT_FILES:
        path = HERE / name
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"{path}: skip ({e})", file=sys.stderr)
            continue
        if not isinstance(data, list):
            continue
        for item in data:
            if isinstance(item, dict):
                rows.append((source, item))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="Filter/list job JSON exports in tasks/automation/")
    ap.add_argument("--search", "-s", default="", help="AND match on alphanumeric tokens (>=2 chars)")
    ap.add_argument("--limit", "-n", type=int, default=50, help="max rows when using --search")
    ap.add_argument("--summary", action="store_true", help="print row counts per file and exit")
    args = ap.parse_args()

    if args.summary:
        for source, name in EXPORT_FILES:
            path = HERE / name
            n = 0
            if path.is_file():
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    if isinstance(data, list):
                        n = len(data)
                except (json.JSONDecodeError, OSError):
                    n = -1
            print(f"{source:12} {name:32} {n if n >= 0 else 'unreadable'}")
        print(f"Total loaded rows: {len(load_all_rows())}")
        return 0

    tokens = _tokens(args.search)
    if not tokens:
        print("Provide a --search string with at least 2 characters.", file=sys.stderr)
        return 2

    out: list[dict] = []
    for source, row in load_all_rows():
        if len(out) >= args.limit:
            break
        if not _matches(row, tokens):
            continue
        row = dict(row)
        row["_export_source"] = source
        out.append(row)

    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
