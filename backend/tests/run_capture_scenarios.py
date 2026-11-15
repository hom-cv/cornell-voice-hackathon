"""Run ten CSV acceptance scenarios against the configured live Bonsai service.

From backend: pipenv run python tests/run_capture_scenarios.py
No API server, login, database, or saved inspection is involved.
"""

import argparse
import asyncio
import csv
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.capture import CaptureDraft  # noqa: E402
from app.services.capture import extract_form  # noqa: E402

SCENARIO_IDS = (
    "S001", "S018", "S019", "S024", "S030",
    "S032", "S035", "S036", "S040", "S042",
)
DEFAULT_CSV = Path(__file__).parent / "fixtures" / "capture_scenarios.csv"


def load_scenarios(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {
            "id", "title", "transcript", "ata_chapter", "ata_advisory",
            "expected_status", "max_questions",
        }
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("CSV is missing required scenario columns")
        rows = {}
        for row in reader:
            if row["id"] in SCENARIO_IDS:
                if row["id"] in rows:
                    raise ValueError(f"Duplicate scenario: {row['id']}")
                int(row["max_questions"])
                rows[row["id"]] = row
        missing = set(SCENARIO_IDS) - rows.keys()
        if missing:
            raise ValueError(f"Missing scenarios: {', '.join(sorted(missing))}")
    return [rows[scenario_id] for scenario_id in SCENARIO_IDS]


def check_result(row, result, initial):
    failures = []
    if len(result.questions) > int(row["max_questions"]):
        failures.append(
            f"questions: expected <= {row['max_questions']}, "
            f"got {len(result.questions)}"
        )
    if result.transcript != row["transcript"]:
        failures.append("Original transcript was changed")
    if result.questions and result.draft != initial:
        failures.append("Clarification changed the draft before answers")
    if not result.questions and result.draft == initial:
        failures.append("Extraction returned the unchanged empty draft")
    match = re.match(r"^ATA\s+(\d+)\b", result.draft.area)
    actual_ata = match.group(1) if match else ""
    if actual_ata != row["ata_chapter"]:
        failures.append(
            f"ATA: expected {row['ata_chapter'] or 'unassigned'}, "
            f"got {result.draft.area!r}"
        )
    expected_status = row["expected_status"]
    if expected_status and result.draft.status != expected_status:
        failures.append(
            f"status: expected {expected_status}, got {result.draft.status}"
        )
    # S036 explicitly states that the cargo door remains physically open.
    if row["id"] == "S036" and not result.draft.left_open:
        failures.append("Door remains open: expected leftOpen=true")
    # These scenarios contain no actual maintenance-manual reference.
    if result.draft.manual_reference:
        failures.append("Invented a maintenance-manual reference")
    return failures


async def run(rows, timeout):
    reports = []
    for row in rows:
        print(f"Running {row['id']}: {row['title']}...", flush=True)
        started = time.monotonic()
        report = {
            "id": row["id"], "title": row["title"], "expected": row,
            "unsupported_checks": [
                "ata_advisory: CaptureOut exposes no advisory field"
            ],
        }
        try:
            initial = CaptureDraft()
            result = await asyncio.wait_for(
                extract_form(row["transcript"], initial), timeout=timeout
            )
            report["actual"] = result.model_dump(by_alias=True)
            report["failures"] = check_result(row, result, initial)
        except Exception as exc:
            detail = getattr(exc, "detail", str(exc))
            report["failures"] = [f"{type(exc).__name__}: {detail}"]
        report["seconds"] = round(time.monotonic() - started, 2)
        report["passed"] = not report["failures"]
        reports.append(report)
        print(
            f"  {'PASS' if report['passed'] else 'FAIL'} "
            f"({report['seconds']}s)", flush=True
        )
        for failure in report["failures"]:
            print(f"  - {failure}", flush=True)
    return reports


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--report", type=Path, help="Write full JSON results")
    parser.add_argument("--timeout", type=float, default=180)
    parser.add_argument("--list", action="store_true", help="List without inference")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    try:
        rows = load_scenarios(args.csv)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    if args.list:
        for row in rows:
            print(f"{row['id']}: {row['title']}")
        return 0
    print("Live extraction only; no records will be saved.")
    print("UNSUPPORTED: ata_advisory (not exposed by CaptureOut).")
    reports = asyncio.run(run(rows, args.timeout))
    if args.report:
        args.report.write_text(json.dumps(reports, indent=2) + "\n")
    passed = sum(report["passed"] for report in reports)
    print(f"\n{passed}/{len(reports)} passed supported checks; "
          "ATA advisory checks unsupported.")
    return 0 if passed == len(reports) else 1


if __name__ == "__main__":
    raise SystemExit(main())
