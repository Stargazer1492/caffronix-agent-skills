# 浏览器采集 SOP

## 目标

当当前 agent 具备内置 Browser、`browser-use` 或 Computer Use 能力时，使用浏览器访问公开招聘页面，完成岗位搜索、详情页截图、正文提取和本地保存。

## 输入

- 用户指定的公司、渠道和岗位关键词。
- 用户需要的岗位数量。
- `references/company-sources.md` 中的来源契约。
- 本次采集计划中的 source 数量、每个 source 预算和详情页数量上限。

## 工作目录

每次采集都写入同一个 run 目录：

```text
<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/
  crawl_plan.json
  raw_jobs.jsonl
  sources.json
  failures.jsonl
  details/
    {source_id}.txt
    {source_id}.png
    {source_id}.json
```

## 执行流程

1. 根据用户要求选择公司、渠道和来源 URL。用户没有指定 source URL 时，读取 `references/company-sources.md` 中对应的公开来源。
2. 打开对应公司招聘入口或模板 URL。
3. 如果宿主浏览器工具返回安全策略拒绝，立即停止该来源，写入 `failures.jsonl`，不要改用其他浏览器、Computer Use、命令行 HTTP 请求或其他自动化方式访问同一域名。
4. 在关键词输入框或 URL 查询参数中输入用户需要的岗位关键词。
5. 如果用户输入多个关键词，拆成多个批次执行；每个批次只查询 1 个关键词，不在同一列表页混合多个关键词。
6. 等待搜索结果稳定后，读取当前页岗位列表。每条列表项至少记录标题、城市、部门、更新时间、当前列表页 URL 和可点击元素定位方式。
7. 对每个岗位点击 title 或岗位卡片进入详情页。
8. 进入详情页后截图，并提取页面可见文字。
9. 将详情页截图保存为 `details/{source_id}.png`，将详情页正文保存为 `details/{source_id}.txt`，将结构化元数据保存为 `details/{source_id}.json`。
10. 将该岗位追加写入 `raw_jobs.jsonl`。`原始正文` 优先使用详情页完整文本；详情页无法进入时，才退回列表页摘要，并在 `failures.jsonl` 写入降级原因。
11. 返回搜索结果页，继续下一个岗位。
12. 如果当前列表页可用岗位数量不足用户要求，查看列表底部翻页控件：
    - 优先找“下一页”按钮并点击。
    - 找不到“下一页”时，定位当前高亮页码，再点击后一个页码。
    - 如果 URL 契约明确支持页码参数，也可以构造下一页 URL，但仍需确认页面结果发生变化。
13. 到达用户要求数量、当前 source 计划数量、无更多结果、重复页面、登录/验证码阻断或宿主安全策略拒绝时停止。

## 宿主安全策略拒绝

宿主浏览器工具的安全策略拒绝不是普通技术失败。遇到以下报错时，必须视为该来源的硬停止：

- `Browser Use rejected this action due to browser security policy`
- `The user has requested that ... should not be used`
- 报错明确禁止 workaround、indirect execution、raw CDP、browser commands、alternate browser surfaces 或 policy circumvention

处理规则：

- 不要继续尝试内置 Browser、Chrome 插件、`browser-use`、Computer Use、Playwright、CDP、curl 或其他命令行 HTTP 请求访问同一域名。
- 在 `failures.jsonl` 记录 `阶段 = 宿主安全策略检查`，`原因 = 宿主浏览器安全策略拒绝访问该域名`，并保存原始报错摘要。
- 在 `crawl_manifest.json` 中标记 `blocked_by_host_browser_policy = true`。
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

- 内置 Browser：并发度 1 到 2。
- `browser-use`：并发度 1 到 2。
- Computer Use：并发度固定为 1，因为它依赖可视 UI 状态。

## 分页识别规则

分页不能只依赖 URL 推断。浏览器路径必须优先观察页面底部控件：

- 当前页通常是高亮数字、禁用态按钮或 `aria-current`。
- 下一页可能是“下一页”、右箭头、`>`、`Next` 或带有 `aria-label` 的按钮。
- 点击后必须等待列表首条岗位、页码高亮或 URL 至少一个发生变化。
- 如果点击后一页内容与上一页完全重复，停止该 source 并记录 `页面结果重复`。
- 如果没有下一页按钮，也没有后续页码，记录 `无更多结果`。

## 安全边界

- 只读取公开页面可见内容和公开详情页正文。
- 不读取 cookie、localStorage、sessionStorage、token、浏览器 profile、密码或验证码。
- 不打开开发者工具、网络面板或应用存储面板获取登录态。
- 如果页面要求登录、验证码、安全验证或权限授权，停止该来源并写入 `failures.jsonl`。
- 如果宿主工具安全策略拒绝访问该域名，停止该来源并写入 `failures.jsonl`；不要改用其他路径绕过策略。
