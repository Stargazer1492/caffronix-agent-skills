# 输出契约

## 分阶段产物

每次运行都创建独立目录：

```text
<workspace-root>/caffronix-agent-skills/ai-job-analyze/
  work/{run_id}/
    crawl_plan.json
    crawl_manifest.json
    raw_jobs.jsonl
    sources.json
    failures.jsonl
    details/
      {source_id}.txt
      {source_id}.png
      {source_id}.json
    normalized_jobs.jsonl
    normalization_manifest.json
    normalization_failures.jsonl
    insights.json
  reports/{run_id}/
    report.html
    report.png
    report.json
  cache/
  logs/
  runtime/
```

`work/{run_id}/` 保存中间产物。`reports/{run_id}/` 保存最终交付物。

`report.html` 是默认必需产物。`report.png` 只有用户要求图片或配置启用图片导出时生成。

采集产物格式与浏览器工具无关。无论岗位来自 Codex App 内置 Browser、`browser-use` 还是 Computer Use，都必须写入同一套文件和字段。

浏览器路径进入详情页时，还必须保存详情页截图和详情页正文。详情页无法进入、截图失败或正文无法提取时，在 `failures.jsonl` 和 `crawl_manifest.json` 中说明降级原因。

## 报告请求

```json
{
  "公司": ["字节", "阿里", "腾讯", "美团"],
  "渠道": "两者",
  "查询词": "人工智能产品经理",
  "输出格式": "html",
  "分析问题": "社招人工智能产品经理更看重哪些能力？"
}
```

## 原始岗位

采集阶段输出 `raw_jobs.jsonl`，每行一个岗位：

```json
{
  "source_id": "bytedance-social-123",
  "公司": "字节",
  "渠道": "社招",
  "标题": "AI 产品经理",
  "城市": "北京",
  "详情链接": "https://example.com/jobs/123",
  "原始正文": "岗位职责：...",
  "详情页正文文件": "details/bytedance-social-123.txt",
  "详情页截图文件": "details/bytedance-social-123.png",
  "抓取时间": "2026-05-19T00:00:00+00:00"
}
```

## 详情页元数据

浏览器采集阶段输出 `details/{source_id}.json`：

```json
{
  "source_id": "bytedance-social-123",
  "详情链接": "https://example.com/jobs/123",
  "列表页链接": "https://example.com/jobs?page=1",
  "截图文件": "details/bytedance-social-123.png",
  "正文文件": "details/bytedance-social-123.txt",
  "采集方式": "codex-browser",
  "关键词": "AI 产品经理",
  "抓取时间": "2026-05-19T00:00:00+00:00"
}
```

## 归一岗位

转换阶段输出 `normalized_jobs.jsonl`，每行一个岗位：

```json
{
  "source_id": "bytedance-social-123",
  "公司": "字节",
  "渠道": "社招",
  "岗位标题": "AI 产品经理",
  "岗位族": "产品",
  "AI 相关度": "明确人工智能",
  "资历层级": "中高级",
  "城市": ["北京"],
  "核心能力": ["大模型应用", "产品规划", "数据分析"],
  "证据": ["岗位职责中出现大模型应用落地、智能体产品规划"],
  "详情链接": "https://example.com/jobs/123"
}
```

## 来源失败项

```json
{
  "公司": "字节",
  "渠道": "社招",
  "链接": "https://example.com/jobs",
  "阶段": "岗位发现",
  "原因": "需要验证码"
}
```

宿主安全策略拒绝访问某个域名时，失败项应写成：

```json
{
  "公司": "字节",
  "渠道": "社招",
  "链接": "https://jobs.bytedance.com/campus/position",
  "阶段": "宿主安全策略检查",
  "原因": "宿主浏览器安全策略拒绝访问该域名",
  "错误摘要": "Browser Use rejected this action due to browser security policy. The user has requested that https://jobs.bytedance.com should not be used.",
  "blocked_by_host_browser_policy": true
}
```

## 报告草稿

```json
{
  "请求": {},
  "创建时间": "2026-05-19T00:00:00+00:00",
  "失败项": []
}
```
