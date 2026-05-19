from __future__ import annotations

import platform
import shutil
from pathlib import Path


SKILL_NAME = "ai-job-analyze"
DATA_ROOT_NAME = "caffronix-agent-skills"


def skill_root() -> Path:
    return Path(__file__).resolve().parents[2]


def workspace_root() -> Path:
    return Path.cwd()


def skill_workspace_dir(root: Path | None = None) -> Path:
    base = root or workspace_root()
    return base / DATA_ROOT_NAME / SKILL_NAME


def runtime_dir(root: Path | None = None) -> Path:
    return skill_workspace_dir(root) / "runtime"


def build_runtime_summary() -> dict[str, str]:
    root = skill_root()
    workspace = workspace_root()
    skill_workspace = skill_workspace_dir(workspace)
    runtime = runtime_dir(workspace)
    return {
        "os": platform.system(),
        "skill_root": str(root),
        "workspace_root": str(workspace),
        "skill_workspace_dir": str(skill_workspace),
        "runtime_dir": str(runtime),
        "runtime_exists": str(runtime.exists()),
        "uv": shutil.which("uv") or "not found",
    }
