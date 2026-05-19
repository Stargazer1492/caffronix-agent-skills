#!/usr/bin/env python3
from __future__ import annotations

import argparse
import platform
import shutil
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:
    tomllib = None


SKILL_NAME = "ai-job-analyze"
DATA_ROOT_NAME = "caffronix-agent-skills"
SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "config.toml"

DEFAULT_CONFIG: dict[str, Any] = {
    "crawl": {
        "default_companies": ["bytedance", "alibaba", "tencent", "meituan"],
        "default_channel": "social",
        "default_query": "AI",
        "max_jobs_per_task": 120,
    },
    "report": {
        "default_format": "html",
    },
    "output": {
        "work_dir": "caffronix-agent-skills/ai-job-analyze/work",
    },
}


def merge_config(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_config(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_config() -> dict[str, Any]:
    if tomllib is None or not CONFIG_PATH.exists():
        return DEFAULT_CONFIG
    with CONFIG_PATH.open("rb") as config_file:
        loaded = tomllib.load(config_file)
    return merge_config(DEFAULT_CONFIG, loaded)


def config_value(config: dict[str, Any], section: str, key: str, default: Any) -> Any:
    section_value = config.get(section, {})
    if not isinstance(section_value, dict):
        return default
    return section_value.get(key, default)


def workspace_root() -> Path:
    return Path.cwd()


def skill_workspace_dir(root: Path | None = None) -> Path:
    base = root or workspace_root()
    return base / DATA_ROOT_NAME / SKILL_NAME


def runtime_dir(root: Path | None = None) -> Path:
    return skill_workspace_dir(root) / "runtime"


def build_runtime_summary() -> dict[str, str]:
    workspace = workspace_root()
    runtime = runtime_dir(workspace)
    return {
        "os": platform.system(),
        "skill_root": str(SKILL_ROOT),
        "workspace_root": str(workspace),
        "skill_workspace_dir": str(skill_workspace_dir(workspace)),
        "runtime_dir": str(runtime),
        "runtime_exists": str(runtime.exists()),
        "config_path": str(CONFIG_PATH),
        "config_exists": str(CONFIG_PATH.exists()),
        "uv": shutil.which("uv") or "not found",
    }


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
    config = load_config()
    default_companies = config_value(config, "crawl", "default_companies", ["bytedance", "alibaba", "tencent", "meituan"])
    if isinstance(default_companies, list):
        default_companies = ",".join(str(company) for company in default_companies)
    default_channel = str(config_value(config, "crawl", "default_channel", "social"))
    default_query = str(config_value(config, "crawl", "default_query", "AI"))
    max_jobs = int(config_value(config, "crawl", "max_jobs_per_task", 120))
    output_dir = str(config_value(config, "output", "work_dir", "caffronix-agent-skills/ai-job-analyze/work"))
    default_format = str(config_value(config, "report", "default_format", "html"))

    parser = argparse.ArgumentParser(description="Run ai-job-analyze skill commands.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="print local runtime readiness summary")
    doctor.set_defaults(func=command_doctor)

    crawl = subparsers.add_parser("crawl", help="planned crawl stage for public job pages")
    crawl.add_argument("--companies", default=default_companies)
    crawl.add_argument("--channel", choices=("campus", "social", "both"), default=default_channel)
    crawl.add_argument("--query", default=default_query)
    crawl.add_argument("--max-jobs", type=int, default=max_jobs)
    crawl.add_argument("--output-dir", default=output_dir)
    crawl.set_defaults(func=command_crawl)

    report = subparsers.add_parser("report", help="planned deterministic report render stage")
    report.add_argument("--input-dir", default="")
    report.add_argument("--output", choices=("html", "png", "both"), default=default_format)
    report.set_defaults(func=command_report)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
