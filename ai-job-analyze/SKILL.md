---
name: ai-job-analyze
description: 使用当前 agent 可用的浏览器能力采集公开招聘网站上的 AI 岗位，分析校招或社招机会，并生成本地优先的洞察产物。优先使用 Playwright 或 Codex App 内置 Browser，再按需降级到 browser-use、Computer Use 或 Chrome plugin。适用于用户要求采集 AI 岗位、对比校招与社招渠道，或基于公开招聘页面生成岗位市场分析。
---

# AI 岗位分析

这个 skill 用于本地优先的 AI 岗位市场分析。核心任务是指导当前 agent 选择合适的浏览器操作路径，访问公开招聘页面，提取岗位列表和详情页可见内容，再完成字段归一、洞察组织和本地产物保存。

## 能力路由

采集前必须先检查当前宿主实际可用的 tools、plugins 和 skills，再按以下顺序选择路径。不要只根据操作系统或历史经验选择采集方式。

1. 如果 Playwright 可用，优先使用 Playwright 访问公开招聘页面。它适合可复现的列表页和详情页采集、独立 tab、有限并发、截图和结构化文本提取。
2. 如果 Codex App 内置 Browser 可用，使用它打开公开招聘页面、搜索关键词、翻页，并从页面或 DOM 读取岗位信息。它是 Codex App 的官方浏览器能力，但是否暴露取决于当前会话实际可用的工具、插件和技能。
3. 如果 Playwright 和内置 Browser 都不可用，但 `browser-use` 可用，使用默认 `browser-use` 浏览器访问公开页面。它是可独立运行的浏览器自动化路径，但只作为降级路径。除非用户明确要求，不要连接用户真实 Chrome profile。
4. 只有在页面必须通过真实可视 UI 操作且 Computer Use 可用时，才用 Computer Use 点击、输入、滚动和截图识别。Computer Use 依赖单个可见 UI 状态，不适合作为并发采集路径。
5. Chrome plugin 只作为最后浏览器兜底：Computer Use 不可用，或用户明确要求真实 Chrome 环境时才使用。默认不要读取或依赖用户真实 Chrome profile、cookie、登录态或本地浏览器数据来扩大采集范围。
6. 如果任何浏览器工具返回宿主安全策略拒绝，例如 `Browser Use rejected this action due to browser security policy`、`The user has requested that ... should not be used`，或明确禁止 workaround、CDP、alternate browser surface、indirect execution 等绕行方式，立即停止该来源。不要再尝试其他浏览器、Computer Use、命令行 HTTP 请求或其他自动化路径访问同一域名。
7. 如果所有浏览器路径都不可用或失败，只生成失败摘要和原因，不编造岗位数据。

无论使用哪条浏览器路径，最终产物都必须遵守 `references/output-contract.md`，并写出同一组文件：`crawl_plan.json`、`crawl_result.json`、`jobs_index.jsonl`、`failures.jsonl`、`details/`、`normalized_jobs.jsonl` 和报告文件。

## 工作流

1. 采集前先确认用户意图。用户没有提供时，使用默认范围：
   - 公司：`bytedance`、`alibaba`、`tencent`、`meituan`
   - 渠道：校招、社招或两者
   - 查询词：例如 `AI 产品经理`、`agent`、`大模型应用`、`算法`
   - 分析问题：本次洞察需要优先回答的具体问题

2. 如果用户只提出跨公司分析请求，没有指定公司、渠道或来源，先按 `references/stage1-collection.md` 拆解任务，生成本次采集计划，并控制每个采集批次的规模。不要把多家公司、多渠道和大量详情页塞进一个长任务。

3. 分阶段执行。不要把采集、字段归一和洞察组织混成一个长任务：
   - 采集阶段：按“能力路由”选择浏览器能力，并遵守 `references/stage1-collection.md`，完成搜索、翻页、详情页打开、截图、正文提取和本地保存。
   - 归一阶段：让 Codex App 读取采集产物，并按 `references/stage2-normalization.md` 分批归一字段。
   - 分析与报告阶段：根据归一岗位、用户问题和 `references/stage3-analyze-and-report.md` 生成 `report.json` 与报告。

## 运行规则

- 运行产物只能写入宿主提供的可写工作目录下的 `caffronix-agent-skills/ai-job-analyze/`。不要写入 skill 安装目录、用户 home 目录或任何尚未确认可写的任意路径。
- 不要读取 `.env`、cookie、localStorage、sessionStorage、浏览器 profile、token、密码或验证码。
- 招聘网站出现登录、验证码、账号风险检查或权限弹窗时，停止操作并报告该来源被阻断。
- 使用浏览器能力时，只访问公开页面和公开 API。不要使用用户个人浏览器 profile、cookie、登录态或账号权限扩大采集范围。
- 宿主工具的安全策略拒绝优先于本 skill 的采集目标。不要用其他浏览器路径或命令行请求绕过安全策略。
- 公司和渠道必须分开采集。没有明确页面来源时，不要把校招页面复用于社招，也不要把社招页面复用于校招。

## 自升级

用户要求安装或升级本 skill 时，使用 Codex 官方 `$skill-installer` 或等价的官方技能管理能力重新安装：

```text
repo: Stargazer1492/caffronix-agent-skills
path: ai-job-analyze
ref: main
```

如果官方安装器检测到 `ai-job-analyze` 已存在并拒绝覆盖，说明这是升级场景，请向用户解释并确认是否覆盖已安装 skill。用户确认前，不要删除或覆盖 `$CODEX_HOME/skills/ai-job-analyze` 或 `~/.codex/skills/ai-job-analyze`。升级完成后，确认目标目录中存在 `SKILL.md`，并提示用户重启 Codex。

## 参考文档

- 修改公司来源前，先读 `references/company-sources.md`。
- 修改采集计划、浏览器采集、详情页截图、详情页正文提取或分页流程前，先读 `references/stage1-collection.md`。
- 修改字段归一流程前，先读 `references/stage2-normalization.md`。
- 修改分析方法或报告结构前，先读 `references/stage3-analyze-and-report.md`。
- 修改输出字段或产物类型前，先读 `references/output-contract.md`。
