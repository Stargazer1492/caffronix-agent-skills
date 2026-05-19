from __future__ import annotations

from pathlib import Path

from scripts.bootstrap import ensure_workspace_dirs, runtime_environment, skill_workspace_dir, uv_install_hint


def test_uv_install_hint_supports_macos_linux_and_windows() -> None:
    assert "brew install uv" in (uv_install_hint("Darwin") or "")
    assert "astral.sh/uv/install.sh" in (uv_install_hint("Linux") or "")
    assert "install.ps1" in (uv_install_hint("Windows") or "")
    assert uv_install_hint("FreeBSD") is None


def test_runtime_environment_is_workspace_local() -> None:
    runtime_dir = Path("/tmp/example-workspace/caffronix-agent-skills/ai-job-analyze/runtime")
    env = runtime_environment(runtime_dir)

    assert env["UV_CACHE_DIR"] == "/tmp/example-workspace/caffronix-agent-skills/ai-job-analyze/runtime/uv-cache"
    assert env["UV_PYTHON_INSTALL_DIR"] == "/tmp/example-workspace/caffronix-agent-skills/ai-job-analyze/runtime/python"
    assert env["UV_PROJECT_ENVIRONMENT"] == "/tmp/example-workspace/caffronix-agent-skills/ai-job-analyze/runtime/venv"


def test_ensure_workspace_dirs_is_idempotent(tmp_path: Path) -> None:
    first_created = ensure_workspace_dirs(tmp_path)
    second_created = ensure_workspace_dirs(tmp_path)

    assert skill_workspace_dir(tmp_path) in first_created
    assert {path.name for path in first_created} >= {"caffronix-agent-skills", "ai-job-analyze", "work", "reports", "cache", "logs", "runtime", "uv-cache", "python", "venv"}
    assert second_created == []
