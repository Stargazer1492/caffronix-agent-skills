#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import platform
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
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


def nested_config(config: dict[str, Any], *path: str) -> dict[str, Any]:
    value: Any = config
    for key in path:
        if not isinstance(value, dict):
            return {}
        value = value.get(key, {})
    return value if isinstance(value, dict) else {}


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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def append_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as output_file:
        for row in rows:
            output_file.write(json.dumps(row, ensure_ascii=False) + "\n")


def request_json(url: str, *, method: str = "GET", params: dict[str, Any] | None = None, payload: dict[str, Any] | None = None, timeout: int = 30) -> dict[str, Any]:
    if params:
        query = urllib.parse.urlencode(params, doseq=True)
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}{query}"
    body = None
    headers = {
        "Accept": "application/json,text/plain,*/*",
        "User-Agent": "ai-job-analyze/0.1 public-job-crawler",
    }
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def company_label(company: str) -> str:
    return {
        "bytedance": "字节",
        "alibaba": "阿里",
        "tencent": "腾讯",
        "meituan": "美团",
    }.get(company, company)


def channel_label(channel: str) -> str:
    return {
        "social": "社招",
        "campus": "校招",
        "intern": "实习",
        "freshman": "应届",
    }.get(channel, channel)


def split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def selected_channels(channel: str) -> list[str]:
    return ["social", "campus"] if channel == "both" else [channel]


def source_key(company: str, channel: str) -> str:
    return f"{company}.{channel}"


def format_source_url(source: dict[str, Any], query: str, page: int) -> str:
    template = str(source.get("url_template") or source.get("entry_url") or "")
    limit = source.get("default_limit", 10)
    try:
        return template.format(query=urllib.parse.quote(query), page=page, limit=limit)
    except KeyError:
        return template


def clean_text(value: Any, limit: int = 4000) -> str:
    text = "" if value is None else str(value)
    return " ".join(text.split())[:limit]


def extract_meituan_jobs(data: dict[str, Any], company: str, channel: str) -> list[dict[str, Any]]:
    jobs = data.get("data", {}).get("list", [])
    if not isinstance(jobs, list):
        return []
    rows = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("jobUnionId") or job.get("id") or job.get("jobId") or "")
        cities = []
        for city in job.get("cityList") or []:
            if isinstance(city, dict) and city.get("name"):
                cities.append(str(city["name"]))
        title = clean_text(job.get("name") or job.get("jobName"))
        if not title and not job_id:
            continue
        detail_url = f"https://zhaopin.meituan.com/web/position/detail?jobUnionId={job_id}" if job_id else "https://zhaopin.meituan.com"
        rows.append({
            "source_id": f"{company}-{channel}-{job_id or len(rows) + 1}",
            "公司": company_label(company),
            "渠道": channel_label(channel),
            "标题": title,
            "城市": "、".join(cities),
            "详情链接": detail_url,
            "原始正文": clean_text(job.get("jobDescription") or job.get("description") or job.get("jobFamilyGroup") or job),
            "抓取时间": now_iso(),
        })
    return rows


def extract_tencent_jobs(data: dict[str, Any], company: str, channel: str) -> list[dict[str, Any]]:
    jobs = data.get("Data", {}).get("Posts", [])
    if not isinstance(jobs, list):
        return []
    rows = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("PostId") or job.get("RecruitPostId") or "")
        title = clean_text(job.get("RecruitPostName"))
        if not title and not job_id:
            continue
        detail_url = str(job.get("PostURL") or f"https://careers.tencent.com/jobdesc.html?postId={job_id}")
        body_parts = [
            job.get("Responsibility"),
            job.get("Requirement"),
            job.get("ProductName"),
            job.get("CategoryName"),
            job.get("RequireWorkYearsName"),
        ]
        rows.append({
            "source_id": f"{company}-{channel}-{job_id or len(rows) + 1}",
            "公司": company_label(company),
            "渠道": channel_label(channel),
            "标题": title,
            "城市": clean_text(job.get("LocationName")),
            "详情链接": detail_url,
            "原始正文": clean_text("\n".join(str(part) for part in body_parts if part)),
            "抓取时间": now_iso(),
        })
    return rows


def crawl_meituan(source: dict[str, Any], company: str, channel: str, query: str, page: int, page_size: int, timeout: int) -> tuple[list[dict[str, Any]], str]:
    url = str(source.get("api_url"))
    payload = {
        "keyword": query,
        "pageNo": page,
        "pageSize": page_size,
    }
    if source.get("hiring_type"):
        payload["hiringType"] = source["hiring_type"]
    data = request_json(url, method="POST", payload=payload, timeout=timeout)
    return extract_meituan_jobs(data, company, channel), url


def crawl_tencent(source: dict[str, Any], company: str, channel: str, query: str, page: int, page_size: int, timeout: int) -> tuple[list[dict[str, Any]], str]:
    url = str(source.get("api_url"))
    params = {
        "keyword": query,
        "pageIndex": page,
        "pageSize": page_size,
        "language": "zh-cn",
        "area": "cn",
    }
    data = request_json(url, params=params, timeout=timeout)
    return extract_tencent_jobs(data, company, channel), url


def crawl_source(config: dict[str, Any], company: str, channel: str, query: str, page: int, page_size: int, timeout: int) -> tuple[list[dict[str, Any]], str]:
    source = nested_config(config, "sources", company, channel)
    if company == "meituan" and source.get("api_url"):
        return crawl_meituan(source, company, channel, query, page, page_size, timeout)
    if company == "tencent" and source.get("api_url"):
        return crawl_tencent(source, company, channel, query, page, page_size, timeout)
    raise NotImplementedError("该来源的公开接口适配器尚未实现")


def command_doctor(args: argparse.Namespace) -> int:
    summary = build_runtime_summary()
    print("ai-job-analyze doctor")
    for key, value in summary.items():
        print(f"- {key}: {value}")
    return 0


def command_crawl(args: argparse.Namespace) -> int:
    config = load_config()
    companies = split_csv(args.companies)
    channels = selected_channels(args.channel)
    max_jobs = max(args.max_jobs, 0)
    page_size = min(20, max(1, max_jobs or 1))
    timeout = int(config_value(config, "crawl", "request_timeout_seconds", 30))
    hard_max_pages = int(config_value(config, "crawl", "hard_max_pages_per_source", 20))
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = Path(args.output_dir) / run_id
    ensure_dir(output_dir)

    tasks = [(company, channel) for company in companies for channel in channels]
    jobs: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    plan = {
        "run_id": run_id,
        "公司": [company_label(company) for company in companies],
        "渠道": [channel_label(channel) for channel in channels],
        "查询词": args.query,
        "max_jobs": max_jobs,
        "created_at": now_iso(),
    }

    for task_index, (company, channel) in enumerate(tasks):
        if len(jobs) >= max_jobs:
            break
        remaining_total = max_jobs - len(jobs)
        remaining_tasks = max(1, len(tasks) - task_index)
        source_budget = max(1, (remaining_total + remaining_tasks - 1) // remaining_tasks)
        key = source_key(company, channel)
        source = nested_config(config, "sources", company, channel)
        page = int(source.get("page_start", 1) or 1)
        source_url = format_source_url(source, args.query, page)
        sources.append({
            "source_key": key,
            "company": company,
            "channel": channel,
            "source_url": source_url,
            "api_url": source.get("api_url", ""),
        })
        source_count = 0
        for current_page in range(page, page + hard_max_pages):
            if len(jobs) >= max_jobs or source_count >= source_budget:
                break
            try:
                rows, api_url = crawl_source(config, company, channel, args.query, current_page, page_size, timeout)
                if not rows:
                    break
                remaining_source = source_budget - source_count
                remaining_task = max_jobs - len(jobs)
                selected = rows[:min(remaining_source, remaining_task)]
                jobs.extend(selected)
                source_count += len(selected)
                if len(rows) < page_size:
                    break
                time.sleep(0.2)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, NotImplementedError, OSError) as error:
                failures.append({
                    "公司": company_label(company),
                    "渠道": channel_label(channel),
                    "链接": source_url,
                    "阶段": "岗位发现",
                    "原因": str(error),
                })
                break
        print(f"- {key}: {source_count} jobs")

    manifest = {
        "run_id": run_id,
        "created_at": now_iso(),
        "query": args.query,
        "companies": companies,
        "channel": args.channel,
        "max_jobs": max_jobs,
        "job_count": len(jobs),
        "failure_count": len(failures),
        "output_dir": str(output_dir),
    }
    write_json(output_dir / "crawl_plan.json", plan)
    write_json(output_dir / "crawl_manifest.json", manifest)
    write_json(output_dir / "sources.json", sources)
    append_jsonl(output_dir / "raw_jobs.jsonl", jobs)
    append_jsonl(output_dir / "failures.jsonl", failures)

    print("ai-job-analyze fallback crawler completed")
    print(f"- jobs: {len(jobs)}")
    print(f"- failures: {len(failures)}")
    print(f"- output dir: {output_dir}")
    return 0 if jobs else 1


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

    parser = argparse.ArgumentParser(description="Run ai-job-analyze fallback and utility commands.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="print local runtime readiness summary")
    doctor.set_defaults(func=command_doctor)

    crawl = subparsers.add_parser("crawl", help="fallback crawler for public job pages")
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
