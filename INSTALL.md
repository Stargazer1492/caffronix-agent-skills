# Skill 安装指引

本文件给本地 agent 使用。用户通常只需要把 README 中的一句话安装 prompt 发给 agent。

## 仓库下载

所有 skill 都从同一个仓库下载：

```text
https://github.com/Stargazer1492/caffronix-agent-skills/archive/refs/heads/main.zip
```

安装时先下载并解压这个 zip，然后复制其中对应 skill 名字的目录。

## Skill 索引

| skill 名称 | 源目录 | 说明 |
|---|---|---|
| `ai-job-analyze` | `ai-job-analyze/` | 按当前 agent 能力优先使用 Browser、browser-use 或 Computer Use 抓取公开招聘页并分析 AI 岗位；脚本 crawler 仅作为 fallback。 |

## 安装目标目录

优先安装到当前宿主支持的原生 skills 目录：

| 宿主 | 推荐安装目录 |
|---|---|
| Codex | `~/.agents/skills/{skill-name}` |
| Claude Code | `~/.claude/skills/{skill-name}` |
| OpenClaw | `<OpenClaw active workspace>/skills/{skill-name}` |
| Hermes | `~/.hermes/skills/{skill-name}` |

如果无法判断宿主，安装到当前项目级目录：

```text
<当前项目>/.agents/skills/{skill-name}
```

安装前必须确认目标 skills 根目录可写。做法是先创建目标根目录，再写入并删除一个临时探测文件：

```text
<目标 skills 根目录>/.write-test
```

如果不可写，不要继续安装到该目录；先提醒用户：

```text
本 skill 会输出文件，默认会写入 skill 所在工作目录。你可以提供一个本 agent 可写入的路径，或者修改工作目录的写入权限。
```

用户提供可写路径后，再安装到该路径下的项目级目录；如果用户选择修改权限，则重新探测目标目录写权限。

## 安装步骤

1. 下载并解压仓库 zip。
2. 根据用户要求的 `{skill-name}` 找到同名目录。
3. 判断当前宿主的目标 skills 根目录，并确认该目录可写。
4. 将整个 `{skill-name}` 目录复制到目标 skills 目录。
5. 确认目标目录下存在 `SKILL.md`。
6. 如果该 skill 包含 `scripts/bootstrap.py`，用当前宿主可写 workspace 初始化：

```bash
python scripts/bootstrap.py init-workspace --workspace-root <宿主可写workspace>
```
