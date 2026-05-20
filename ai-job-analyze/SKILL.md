---
name: ai-job-analyze
description: 基于当前 agent 可用浏览器能力采集公开招聘站点中的人工智能岗位，分析校招或社招机会，并生成本地优先的洞察产物。依次使用 Codex App 内置 Browser、browser-use 或 Computer Use 浏览公开页面并抽取页面可见数据。适用于用户要求收集人工智能岗位、比较校招/社招渠道、或基于公开招聘页生成岗位市场分析的场景。
---

# 人工智能岗位分析

本技能用于本地优先的人工智能岗位市场分析。它的核心能力是指导当前 agent 选择合适的浏览器操作方式，访问公开招聘页面，抽取页面可见的岗位列表和详情页内容，再完成字段归一、洞察整理和本地产物保存。

## 能力路由

执行采集前，先检查当前宿主可用的 tools、plugins 和 skills，再按以下顺序选择路径。不要只根据操作系统决定路径；路由选择以当前会话实际可用能力为准。

1. Codex App 内置 Browser 可用时，优先使用内置 Browser 打开公开招聘页面，搜索关键词、翻页、读取页面或 DOM 中的岗位信息。
2. 内置 Browser 不可用但 `browser-use` 可用时，使用 `browser-use` 的默认浏览器访问公开页面；不要连接用户真实 Chrome profile，除非用户明确要求，因为本 skill 不需要 cookie、登录态或本地浏览器数据。
3. 页面只能通过真实可视 UI 操作时，且 Computer Use 可用，才使用 Computer Use 进行点击、输入、滚动和截图识别。
4. 如果任一浏览器工具返回宿主安全策略拒绝，例如 `Browser Use rejected this action due to browser security policy`、`The user has requested that ... should not be used`、禁止通过 workaround、CDP、alternate browser surface 或 indirect execution 达成同一结果，则该来源必须立即停止。不要再尝试其他浏览器、Computer Use、命令行 HTTP 请求或其他自动化路径访问同一域名。
5. 所有浏览器路径都不可用或失败时，只生成失败摘要和原因，不伪造岗位数据。

不论使用哪条浏览器路径，最终产物都必须遵守 `references/output-contract.md`，写入同一套 `raw_jobs.jsonl`、`sources.json`、`failures.jsonl` 和 `crawl_manifest.json`。

## 工作流程

1. 采集前先收集用户意图。用户没有给出时，使用以下默认范围：
   - 公司：`bytedance`、`alibaba`、`tencent`、`meituan`
   - 渠道：校招、社招或两者
   - 查询词：例如 `人工智能产品经理`、`智能体`、`大模型应用`、`算法`
   - 分析问题：洞察需要优先回答的具体问题

2. 如果用户只给出跨公司分析需求，没有明确公司、渠道或来源，先按 `references/task-decomposition-sop.md` 拆解任务，生成本次采集计划，并控制每轮采集规模，避免把多个公司、多个渠道和大量详情页塞进一个长任务。

3. 按阶段执行，不把采集、字段归一和洞察整理塞进一个长任务：
   - 采集阶段：按“能力路由”使用浏览器能力，并按 `references/browser-collection-sop.md` 搜索、翻页、进入详情页、截图、提取正文和保存本地产物。
   - 转换阶段：Codex App 读取采集产物，按 `references/normalization-sop.md` 分批完成字段归一。
   - 洞察阶段：Codex App 根据归一后的岗位和用户问题生成洞察 JSON。

## 运行规则

- 运行产物只能写入宿主传入的可写工作目录下的 `caffronix-agent-skills/ai-job-analyze/`。不要写入 skill 安装目录、用户 home 目录或未验证可写的任意路径。
- 不读取 `.env`、Cookie、本地存储、浏览器配置文件、令牌、密码或验证码。
- 如果招聘站点出现登录、验证码、账号风险验证或权限弹窗，停止操作并报告被阻断的来源。
- 使用浏览器能力时，只访问公开页面和公开接口；不要使用用户个人浏览器 profile、cookie、登录态或账号权限来扩大抓取范围。
- 宿主工具安全策略拒绝访问某个域名时，该拒绝优先级高于本 skill 的采集目标。不要使用其他浏览器路径或命令行请求绕过安全策略。
- 公司和渠道必须区分采集。没有明确页面来源时，不要把校招页面复用于社招，也不要把社招页面复用于校招。

## 自我升级

当用户要求升级本 skill 时，使用 Codex 官方 `$skill-installer` 或等价官方 skill 管理能力重新安装本 skill：

```text
repo: Stargazer1492/caffronix-agent-skills
path: ai-job-analyze
ref: main
```

如果官方安装器检测到 `ai-job-analyze` 已存在并拒绝覆盖，向用户说明当前是升级场景，并请求用户确认是否覆盖已安装的 skill。用户确认前，不要删除或覆盖 `$CODEX_HOME/skills/ai-job-analyze` 或 `~/.codex/skills/ai-job-analyze`。升级完成后，确认目标目录下存在 `SKILL.md`，并提示用户重启 Codex。

## 参考文档

- 新增或修改公司来源前先读 `references/company-sources.md`。
- 修改浏览器采集、详情页截图、详情页正文提取或分页流程前先读 `references/browser-collection-sop.md`。
- 修改跨公司任务拆解方式前先读 `references/task-decomposition-sop.md`。
- 修改输出字段前先读 `references/output-contract.md`。
- 修改字段归一流程前先读 `references/normalization-sop.md`。
