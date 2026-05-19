from __future__ import annotations

import argparse
import sys
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = SKILL_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from ai_job_analyze.runtime import build_runtime_summary  # noqa: E402


def command_doctor(args: argparse.Namespace) -> int:
    summary = build_runtime_summary()
    print("ai-job-analyze doctor")
    for key, value in summary.items():
        print(f"- {key}: {value}")
    return 0


def command_crawl(args: argparse.Namespace) -> int:
    print("ai-job-analyze crawl stage is not implemented yet.")
    print("Planned output: crawl_plan.json, raw_jobs.jsonl, crawl_manifest.json, sources.json, failures.jsonl.")
    print(f"- companies: {args.companies}")
    print(f"- channel: {args.channel}")
    print(f"- query: {args.query}")
    print(f"- max jobs: {args.max_jobs}")
    print(f"- output dir: {args.output_dir}")
    return 2


def command_report(args: argparse.Namespace) -> int:
    print("ai-job-analyze report stage is not implemented yet.")
    print("Planned input: normalized_jobs.jsonl and insights.json.")
    print(f"- output: {args.output}")
    print("- default output is html; png is generated only when requested.")
    return 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run ai-job-analyze skill commands.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="print local runtime readiness summary")
    doctor.set_defaults(func=command_doctor)

    crawl = subparsers.add_parser("crawl", help="planned crawl stage for public job pages")
    crawl.add_argument("--companies", default="bytedance,alibaba,tencent,meituan")
    crawl.add_argument("--channel", choices=("campus", "social", "both"), default="social")
    crawl.add_argument("--query", default="AI")
    crawl.add_argument("--max-jobs", type=int, default=120)
    crawl.add_argument("--output-dir", default="caffronix-agent-skills/ai-job-analyze/work")
    crawl.set_defaults(func=command_crawl)

    report = subparsers.add_parser("report", help="planned deterministic report render stage")
    report.add_argument("--input-dir", default="")
    report.add_argument("--output", choices=("html", "png", "both"), default="html")
    report.set_defaults(func=command_report)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
