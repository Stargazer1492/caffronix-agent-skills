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
| `ai-job-analyze` | `ai-job-analyze/` | 抓取并分析字节、阿里、腾讯、美团公开招聘站点中的 AI 岗位，生成 HTML 或 PNG 报告。 |

## 安装目标目录

优先安装到当前宿主支持的用户级 skills 目录：

| 宿主 | 用户级目录 |
|---|---|
| Codex | `~/.agents/skills/{skill-name}` |
| Claude Code | `~/.claude/skills/{skill-name}` |

如果无法判断宿主，安装到当前项目级目录：

```text
<当前项目>/.agents/skills/{skill-name}
```

## 安装步骤

1. 下载并解压仓库 zip。
2. 根据用户要求的 `{skill-name}` 找到同名目录。
3. 将该目录复制到目标 skills 目录。
4. 确认目标目录下存在 `SKILL.md`。
5. 如果该 skill 包含 `scripts/bootstrap.py`，用当前宿主可写 workspace 初始化：

```bash
python scripts/bootstrap.py init-workspace --workspace-root <宿主可写workspace>
```

## 复制规则

只复制 skill 目录本身。不要复制仓库根目录的 `.git/`、本地运行产物、临时目录或私有文件。

不得复制：

- `.env`
- `cookie`
- `token`
- 浏览器 profile 或登录态
- `caffronix-agent-skills/` 运行产物目录
- `DESIGN.md`
