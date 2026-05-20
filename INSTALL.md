# Codex App Skill 安装指引

本文件给 Codex App 中的本地 agent 使用。v1 只考虑 Codex App，安装和升级 skill 时必须优先使用 Codex 官方 `$skill-installer`，不要默认用本仓库脚本自行复制到 Codex 的 skill 目录。

## 仓库来源

所有 skill 都从同一个仓库下载：

```text
https://github.com/Stargazer1492/caffronix-agent-skills/archive/refs/heads/main.zip
```

Codex 官方 `$skill-installer` 支持 GitHub repo/path 时，优先直接使用仓库地址和 skill 源目录，不必手写下载、解压和复制流程。

## Skill 索引

| skill 名称 | 源目录 | 说明 |
|---|---|---|
| `ai-job-analyze` | `ai-job-analyze/` | 按当前 agent 能力优先使用 Browser、browser-use 或 Computer Use 抓取公开招聘页并分析 AI 岗位；脚本 crawler 仅作为 fallback。 |

## 安装原则

1. 使用 Codex 官方 `$skill-installer` 或等价官方 skill 安装能力安装或升级。
2. 不要手工复制 skill 到 Codex 的 skill 目录。
3. 安装目录由 Codex 官方安装器决定。
4. 写入 Codex 用户级 skill 目录通常会触发权限控制；按 Codex App 的权限流程请求用户授权，不要绕过权限策略。

## Codex App 安装 SOP

1. 确认用户要安装的 `{skill-name}` 在上方 Skill 索引中存在。
2. 使用 Codex 官方 `$skill-installer` 从 GitHub 仓库安装指定目录：

   ```text
   repo: Stargazer1492/caffronix-agent-skills
   path: {skill-name}
   ref: main
   ```

   对 `ai-job-analyze`，安装目标参数应为：

   ```text
   repo: Stargazer1492/caffronix-agent-skills
   path: ai-job-analyze
   ref: main
   ```

3. 不要手工指定或硬编码安装目录。Codex 官方安装器会安装到 `$CODEX_HOME/skills/{skill-name}`；如果 `CODEX_HOME` 未设置，默认是 `~/.codex/skills/{skill-name}`。
4. 如果当前权限模式不允许直接写入 Codex skill 目录，按 Codex App 的权限流程请求用户授权。
5. 安装完成后，提示用户重启 Codex 以加载新 skill。
