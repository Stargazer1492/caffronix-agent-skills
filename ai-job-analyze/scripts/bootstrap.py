from __future__ import annotations

import argparse
import json
import platform
import shutil
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


SKILL_NAME = "ai-job-analyze"
DATA_ROOT_NAME = "caffronix-agent-skills"
SKILL_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class BootstrapStatus:
    os_name: str
    supported_os: bool
    skill_root: str
    workspace_root: str
    data_root_dir: str
    skill_workspace_dir: str
    runtime_dir: str
    workspace_writable: bool
    skill_workspace_exists: bool
    uv_path: str | None
    uv_available: bool
    install_hint: str | None
    environment: dict[str, str]


def resolve_workspace_root(workspace_root: str | Path | None) -> Path:
    raw_root = Path(workspace_root) if workspace_root else Path.cwd()
    return raw_root.expanduser().resolve()


def data_root_dir(workspace_root: Path) -> Path:
    return workspace_root / DATA_ROOT_NAME


def skill_workspace_dir(workspace_root: Path) -> Path:
    return data_root_dir(workspace_root) / SKILL_NAME


def runtime_dir(workspace_root: Path) -> Path:
    return skill_workspace_dir(workspace_root) / "runtime"


def runtime_environment(runtime: Path) -> dict[str, str]:
    return {
        "UV_CACHE_DIR": str(runtime / "uv-cache"),
        "UV_PYTHON_INSTALL_DIR": str(runtime / "python"),
        "UV_PROJECT_ENVIRONMENT": str(runtime / "venv"),
    }


def uv_install_hint(os_name: str) -> str | None:
    if os_name == "Darwin":
        return "brew install uv\n# or\ncurl -LsSf https://astral.sh/uv/install.sh | sh"
    if os_name == "Linux":
        return "curl -LsSf https://astral.sh/uv/install.sh | sh"
    if os_name == "Windows":
        return 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
    return None


def is_workspace_writable(workspace_root: Path) -> bool:
    probe = workspace_root / ".ai-job-analyze-bootstrap-write-test"
    try:
        workspace_root.mkdir(parents=True, exist_ok=True)
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        try:
            if probe.exists():
                probe.unlink()
        except OSError:
            pass
        return False


def check_status(workspace_root_arg: str | Path | None = None) -> BootstrapStatus:
    os_name = platform.system()
    uv_path = shutil.which("uv")
    workspace_root = resolve_workspace_root(workspace_root_arg)
    skill_workspace = skill_workspace_dir(workspace_root)
    runtime = runtime_dir(workspace_root)
    return BootstrapStatus(
        os_name=os_name,
        supported_os=os_name in {"Darwin", "Linux", "Windows"},
        skill_root=str(SKILL_ROOT),
        workspace_root=str(workspace_root),
        data_root_dir=str(data_root_dir(workspace_root)),
        skill_workspace_dir=str(skill_workspace),
        runtime_dir=str(runtime),
        workspace_writable=is_workspace_writable(workspace_root),
        skill_workspace_exists=skill_workspace.exists(),
        uv_path=uv_path,
        uv_available=uv_path is not None,
        install_hint=uv_install_hint(os_name),
        environment=runtime_environment(runtime),
    )


def ensure_workspace_dirs(workspace_root: Path) -> list[Path]:
    skill_workspace = skill_workspace_dir(workspace_root)
    runtime = runtime_dir(workspace_root)
    created: list[Path] = []
    for path in [
        data_root_dir(workspace_root),
        skill_workspace,
        skill_workspace / "work",
        skill_workspace / "reports",
        skill_workspace / "cache",
        skill_workspace / "logs",
        runtime,
        runtime / "uv-cache",
        runtime / "python",
        runtime / "venv",
    ]:
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            created.append(path)
    return created


def print_human_status(status: BootstrapStatus) -> None:
    print("ai-job-analyze bootstrap check")
    print(f"- OS: {status.os_name} ({'supported' if status.supported_os else 'unsupported for v1'})")
    print(f"- Skill root: {status.skill_root}")
    print(f"- Workspace root: {status.workspace_root}")
    print(f"- Workspace writable: {status.workspace_writable}")
    print(f"- Data root dir: {status.data_root_dir}")
    print(f"- Skill workspace dir: {status.skill_workspace_dir}")
    print(f"- Runtime dir: {status.runtime_dir}")
    print(f"- Skill workspace exists: {status.skill_workspace_exists}")
    print(f"- uv: {status.uv_path or 'not found'}")
    print("- Skill workspace uv environment:")
    for key, value in status.environment.items():
        print(f"  {key}={value}")
    if not status.uv_available:
        print("\nuv is required before crawling.")
        if status.install_hint:
            print("Install command:")
            print(status.install_hint)
        else:
            print("Install uv from https://docs.astral.sh/uv/")


def command_check(args: argparse.Namespace) -> int:
    status = check_status(args.workspace_root)
    if args.json:
        print(json.dumps(asdict(status), ensure_ascii=False, indent=2))
    else:
        print_human_status(status)
    return 0 if status.supported_os and status.workspace_writable and status.uv_available else 1


def command_init_workspace(args: argparse.Namespace) -> int:
    workspace_root = resolve_workspace_root(args.workspace_root)
    status = check_status(workspace_root)
    if not status.supported_os:
        print(f"Unsupported OS for v1: {status.os_name}", file=sys.stderr)
        return 1
    if not status.workspace_writable:
        print(f"Workspace root is not writable: {status.workspace_root}", file=sys.stderr)
        return 1
    created = ensure_workspace_dirs(workspace_root)
    if args.json:
        print(
            json.dumps(
                {
                    "workspace_root": status.workspace_root,
                    "data_root_dir": status.data_root_dir,
                    "skill_workspace_dir": status.skill_workspace_dir,
                    "runtime_dir": status.runtime_dir,
                    "created": [str(path) for path in created],
                    "environment": status.environment,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        if created:
            print("Created skill workspace directories:")
            for path in created:
                print(f"- {path}")
        else:
            print("Skill workspace directories already exist.")
        print(f"Skill workspace: {status.skill_workspace_dir}")
        print("Use these environment variables when invoking uv:")
        for key, value in runtime_environment(runtime_dir(workspace_root)).items():
            print(f"{key}={value}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Bootstrap ai-job-analyze local runtime.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    check = subparsers.add_parser("check", help="check uv, OS, and host workspace readiness")
    check.add_argument("--workspace-root", default=None, help="host agent writable workspace root; defaults to current directory")
    check.add_argument("--json", action="store_true", help="print machine-readable status")
    check.set_defaults(func=command_check)

    init_workspace = subparsers.add_parser(
        "init-workspace",
        help="create <workspace-root>/caffronix-agent-skills/ai-job-analyze directories",
    )
    init_workspace.add_argument("--workspace-root", required=True, help="host agent writable workspace root")
    init_workspace.add_argument("--json", action="store_true", help="print machine-readable result")
    init_workspace.set_defaults(func=command_init_workspace)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
