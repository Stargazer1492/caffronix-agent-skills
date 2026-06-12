# 阶段一：采集 SOP

## 目标

当用户提出人工智能岗位分析需求时，先把问题拆成可执行的采集计划，再根据当前 agent 可用能力访问公开招聘页面，完成岗位搜索、详情页截图、正文提取和本地保存。

## 任务拆解

遇到以下情况时先执行任务拆解：

- 用户只说“分析 AI 产品经理岗位”“对比大厂 AI 岗位”，没有指定公司。
- 用户要求跨公司比较，但没有指定渠道。
- 用户要求“AI 岗位市场”“大模型岗位趋势”等宽泛问题。
- 用户给出分析问题，但没有给出来源 URL。

如果用户已经明确给出公司、渠道、关键词和来源 URL，可以跳过拆解，直接形成采集计划。

### 拆解输入

- 用户分析问题。
- 默认公司、默认渠道、默认查询词。
- 本次任务的岗位数量上限。
- `references/company-sources.md` 中的来源契约。

### 拆解输出

生成 `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/crawl_plan.json`，至少包含：

```json
{
  "analysis_question": "对比四家公司 AI 产品经理岗位能力要求",
  "query": "AI 产品经理",
  "max_jobs_per_task": 120,
  "sources": [
    {
      "company": "bytedance",
      "channel": "social",
      "source_key": "sources.bytedance.social",
      "planned_jobs": 30,
      "reason": "覆盖字节社招 AI 产品经理样本"
    }
  ]
}
```

### 拆解规则

1. 先识别用户问题里的岗位关键词，例如 `AI 产品经理`、`大模型应用`、`智能体`。
2. 如果识别出多个关键词，拆成多个关键词批次；每个批次只查询 1 个关键词，避免不同关键词的搜索结果混在同一批样本中。
3. 再识别比较维度，例如公司差异、校招/社招差异、城市分布、能力要求。
4. 如果用户没有指定公司，默认使用字节、阿里、腾讯、美团。
5. 如果用户没有指定渠道，默认使用社招；当问题明确比较校招和社招时使用两者。
6. 根据可用来源生成来源列表，跳过没有来源契约的组合。
7. 把本次任务的岗位数量上限分配到各来源和关键词批次。默认均分；如果用户问题明显聚焦某家公司、某个渠道或某个关键词，可以提高对应批次的计划样本量。
8. 每个来源的 `planned_jobs` 只是目标上限，不是保证数量。来源无结果、被验证码阻断或提前到底时，应停止该来源并记录失败或样本不足。
9. 全部来源和关键词批次合计不得超过本次任务的岗位数量上限。

## 工具优先级

采集工具按稳定性、可复现性、并发能力和安全边界选择：

1. Playwright：优先路径。适合公开页面的列表页和详情页采集、独立 tab、有限并发、截图、正文提取和结构化保存。
2. Codex App 内置 Browser：第二优先级。适合 Codex App 内直接打开和检查页面；是否可用以当前会话实际暴露的 tools、plugins 和 skills 为准。
3. `browser-use`：降级路径。它可以独立完成浏览器采集，但属于更高层的 agent 友好操作层，速度、确定性和并发能力通常不作为首选假设。
4. Computer Use：视觉 UI 兜底。仅在必须通过可视界面操作时使用，并发度固定为 1。
5. Chrome plugin：最后兜底。仅当 Computer Use 不可用，或用户明确要求真实 Chrome 环境时使用；默认不要读取或依赖用户 Chrome profile、cookie、登录态或本地浏览器数据。

## Playwright 可用性检查与安装兜底

Playwright 是采集阶段的优先路径，但不能假设用户环境已经安装。执行采集前先做可用性检查，再决定是否安装或降级。

### 检查顺序

1. 检查当前会话是否已有 Playwright skill、`playwright-cli`、项目内 Playwright 依赖，或可用的 `npx playwright`。
2. 如果已有可用 Playwright，优先使用该路径，不重复安装。
3. 如果 Playwright 未安装，但当前环境允许安装依赖，可以尝试安装。
4. 如果安装或运行失败，最多进行 3 次修复尝试。第 3 次仍失败时，放弃 Playwright 路径，继续尝试内置 Browser、`browser-use`、Computer Use 或 Chrome plugin。

### 安装与修复策略

优先使用最小安装，避免扩大环境影响：

```bash
npm i -D playwright
npx playwright install chromium
```

如果已有 `package.json` 或项目使用 `pnpm`、`npm`、`yarn`，优先沿用项目包管理器。没有明确项目依赖时，优先使用临时工具或当前宿主已提供的 Playwright 能力，不要为了采集任务重构项目依赖。

常见修复尝试按以下顺序计数，每执行一次算 1 次：

1. 补装浏览器二进制：`npx playwright install chromium`。
2. 补装浏览器系统依赖：`npx playwright install --with-deps chromium`，仅在当前系统和权限允许时执行。
3. 清理错误配置或改用当前可用浏览器通道，例如只使用 Chromium、降低并发度到 1、改成无头/有头模式中当前环境可运行的一种。

3 次修复失败后必须停止 Playwright 路径，并在 `failures.jsonl` 或 `crawl_result.json` 中记录：

```json
{
  "阶段": "Playwright 可用性检查",
  "原因": "Playwright 安装或启动失败，已达到 3 次修复上限",
  "fallback_to_next_browser_tool": true
}
```

不要因为 Playwright 安装失败而终止整个采集任务；除非所有浏览器路径都失败，否则继续尝试下一种采集工具。

### 边界

- Playwright 安装失败不是岗位来源失败，只是采集工具失败。
- Playwright 路径中的宿主安全策略拒绝仍然是硬停止；不要用安装、换浏览器或命令行请求绕过同一域名的宿主安全策略。
- 不要读取或复用用户浏览器 profile、cookie、localStorage、sessionStorage、token 或账号权限来修复 Playwright。
- 如果安装需要网络、系统包或权限，而当前宿主不允许，记录失败并降级，不要卡住任务。

## 输入

- 用户指定的公司、渠道和岗位关键词。
- 用户需要的岗位数量。
- `references/company-sources.md` 中的来源契约。
- 本次采集计划中的来源数量、每个来源预算和详情页数量上限。

## 工作目录

每次采集都写入同一个 run 目录：

```text
<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/
  crawl_plan.json
  crawl_result.json
  jobs_index.jsonl
  failures.jsonl
  details/
    {job_id}.txt
    {job_id}.png
```

## 执行流程

1. 根据用户要求选择公司、渠道和来源 URL。用户没有指定来源 URL 时，读取 `references/company-sources.md` 中对应的公开来源。
2. 打开对应公司招聘入口或模板 URL。
3. 如果宿主浏览器工具返回安全策略拒绝，立即停止该来源，写入 `failures.jsonl`，不要改用其他浏览器、Computer Use、命令行 HTTP 请求或其他自动化方式访问同一域名。
4. 在关键词输入框或 URL 查询参数中输入用户需要的岗位关键词。
5. 如果用户输入多个关键词，拆成多个批次执行；每个批次只查询 1 个关键词，不在同一列表页混合多个关键词。
6. 等待搜索结果稳定后，读取当前页岗位列表。每条列表项至少记录标题、城市、部门、更新时间、当前列表页 URL 和可点击元素定位方式。
7. 对每个岗位点击 title 或岗位卡片进入详情页。
8. 进入详情页后截图，并提取页面可见文字。
9. 将详情页截图保存为 `details/{job_id}.png`，将详情页正文保存为 `details/{job_id}.txt`。
10. 将该岗位追加写入 `jobs_index.jsonl`。索引只记录岗位元数据、详情链接、详情正文路径、截图路径和采集方式，不重复保存详情正文；详情页无法进入时，不把列表页摘要伪装成详情正文，只在 `failures.jsonl` 写入降级原因。
11. 返回搜索结果页，继续下一个岗位。
12. 如果当前列表页可用岗位数量不足用户要求，查看列表底部翻页控件：
    - 优先找“下一页”按钮并点击。
    - 找不到“下一页”时，定位当前高亮页码，再点击后一个页码。
    - 如果 URL 契约明确支持页码参数，也可以构造下一页 URL，但仍需确认页面结果发生变化。
13. 到达用户要求数量、当前来源计划数量、无更多结果、重复页面、登录/验证码阻断或宿主安全策略拒绝时停止。

## 宿主安全策略拒绝

宿主浏览器工具的安全策略拒绝不是普通技术失败。遇到以下报错时，必须视为该来源的硬停止：

- `Browser Use rejected this action due to browser security policy`
- `The user has requested that ... should not be used`
- 报错明确禁止 workaround、indirect execution、raw CDP、browser commands、alternate browser surfaces 或 policy circumvention

处理规则：

- 不要继续尝试内置 Browser、Chrome 插件、`browser-use`、Computer Use、Playwright、CDP、curl 或其他命令行 HTTP 请求访问同一域名。
- 在 `failures.jsonl` 记录 `阶段 = 宿主安全策略检查`，`原因 = 宿主浏览器安全策略拒绝访问该域名`，并保存原始报错摘要。
- 在 `crawl_result.json` 中标记 `blocked_by_host_browser_policy = true`。
- 告知用户可以在宿主 agent 或浏览器工具配置中解除该域名限制后重试，或手工打开网页并提供页面文本、截图或导出的岗位详情。
- 如果任务包含多个公司或多个域名，只停止被策略拒绝的域名；其他未被拒绝的来源可以继续执行。

## 详情页并发规则

步骤 6 到 10 可以有限并发，但必须满足以下条件：

- 只能并发“详情页打开、截图、正文提取、保存”这一段。
- 列表页搜索、分页、结果去重和任务预算统计必须串行。
- 不要在同一个浏览器 tab 中并发点击多个岗位。
- 只有当前浏览器工具支持多个独立 tab，且页面不会因为并发打开详情页而触发明显风控时，才允许并发。
- 并发度由本次采集计划指定；如果没有明确计划，默认并发度为 1。
- 如果出现页面加载异常、截图失败、详情页错乱、验证码或结果不稳定，立即把并发度降为 1。

推荐默认策略：

- Playwright：并发度 2 到 4；如果目标站点加载不稳定或出现风控迹象，降为 1。
- 内置 Browser：并发度 1 到 2。
- `browser-use`：并发度 1；只有确认多 tab 稳定且不会混乱页面状态时，才提升到 2。
- Computer Use：并发度固定为 1，因为它依赖可视 UI 状态。
- Chrome plugin：并发度固定为 1，除非用户明确要求并确认可以使用真实 Chrome 多 tab。

## 分页识别规则

分页不能只依赖 URL 推断。浏览器路径必须优先观察页面底部控件：

- 当前页通常是高亮数字、禁用态按钮或 `aria-current`。
- 下一页可能是“下一页”、右箭头、`>`、`Next` 或带有 `aria-label` 的按钮。
- 点击后必须等待列表首条岗位、页码高亮或 URL 至少一个发生变化。
- 如果点击后一页内容与上一页完全重复，停止该来源并记录 `页面结果重复`。
- 如果没有下一页按钮，也没有后续页码，记录 `无更多结果`。

## 安全边界

- 只读取公开页面可见内容和公开详情页正文。
- 不读取 cookie、localStorage、sessionStorage、token、浏览器 profile、密码或验证码。
- 不打开开发者工具、网络面板或应用存储面板获取登录态。
- 如果页面要求登录、验证码、安全验证或权限授权，停止该来源并写入 `failures.jsonl`。
- 如果宿主工具安全策略拒绝访问该域名，停止该来源并写入 `failures.jsonl`；不要改用其他路径绕过策略。

## 与后续阶段的关系

采集阶段必须把 `crawl_plan.json` 和 `crawl_result.json` 写入同一 run 目录。字段归一和报告阶段都应引用这两个文件，说明本次样本为什么这样分配、实际采集到了什么，以及哪些 source 未能达到计划样本量。
