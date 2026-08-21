"""Non-interactive importer command line interface."""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

from .config import ImportConfig
from .importer import Importer
from .supabase import AppV2Store, PublicationRejectedError, safe_error_summary


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import BBR/DAR shelters into app_v2")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--dry-run", action="store_true", help="Fetch and map without database access"
    )
    mode.add_argument("--write", action="store_true", help="Enable app_v2 database writes")
    parser.add_argument("--max-pages", type=int, help="Stop after this total BBR page number")
    parser.add_argument(
        "--resume-latest", action="store_true", help="Resume the latest failed write run"
    )
    parser.add_argument("--summary", help="Write a secret-free JSON summary to this path")
    return parser


def _write_summary(path: str | None, payload: dict[str, object]) -> None:
    if not path:
        return
    output = json.dumps(payload, indent=2, ensure_ascii=False)
    Path(path).write_text(output + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    args = _parser().parse_args(argv)
    summary_path = args.summary or os.getenv("SUMMARY_PATH")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    try:
        config = ImportConfig.from_env(require_database=args.write)
        store = AppV2Store(config) if args.write else None
        summary = Importer(config, store=store).run(
            dry_run=args.dry_run,
            max_pages=args.max_pages,
            resume_latest=args.resume_latest,
        )
        payload = summary.to_dict()
        output = json.dumps(payload, indent=2, ensure_ascii=False)
        print(output)
        _write_summary(summary_path, payload)
        return 0
    except KeyboardInterrupt:
        logging.getLogger("shelter_importer").error("Importer interrupted")
        _write_summary(
            summary_path,
            {
                "dry_run": args.dry_run,
                "source_name": "datafordeler-bbr-dar",
                "status": "failed",
                "error_summary": "Importer interrupted",
            },
        )
        return 130
    except PublicationRejectedError as exc:
        error_summary = safe_error_summary(str(exc))
        logging.getLogger("shelter_importer").error("Importer failed: %s", error_summary)
        _write_summary(
            summary_path,
            {
                "dry_run": args.dry_run,
                "source_name": "datafordeler-bbr-dar",
                "status": "failed",
                "publication_status": "rejected",
                "quality_gate_passed": False,
                "quality_gate_reasons": exc.reasons,
                "quality_metrics": exc.result.get("qualityMetrics", {}),
                "error_summary": error_summary,
            },
        )
        return 1
    except Exception as exc:
        error_summary = safe_error_summary(str(exc) or type(exc).__name__)
        logging.getLogger("shelter_importer").error(
            "Importer failed: %s", error_summary
        )
        _write_summary(
            summary_path,
            {
                "dry_run": args.dry_run,
                "source_name": "datafordeler-bbr-dar",
                "status": "failed",
                "error_summary": error_summary,
            },
        )
        return 1
