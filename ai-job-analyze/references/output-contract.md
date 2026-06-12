# 输出契约

## 分阶段产物

每次运行都创建独立目录：

```text
<workspace-root>/caffronix-agent-skills/ai-job-analyze/
  work/{run_id}/
    crawl_plan.json
    crawl_result.json
    jobs_index.jsonl
    failures.jsonl
    details/
      {job_id}.txt
      {job_id}.png
    normalized_jobs.jsonl
  reports/{run_id}/
    report.json
    report.html
    report.png
```

`work/{run_id}/` 保存采集和归一化中间产物。`reports/{run_id}/` 保存最终交付物。

`report.html` 是默认必需产物。`report.png` 只有用户要求图片、分享图，或配置启用图片导出时生成。

## 必需性

- `crawl_plan.json`：必需。记录本次计划采集哪些公司、渠道、关键词、source 和数量上限。
- `crawl_result.json`：必需。记录实际采集结果、成功来源、失败来源、样本数量、使用的浏览器能力和安全策略阻断情况。
- `jobs_index.jsonl`：必需。记录已采集岗位索引和详情文件路径，不重复保存详情正文。
- `failures.jsonl`：有失败时必需；无失败时可以不存在，也可以保留空文件，但同一次运行内要保持一致。
- `details/{job_id}.txt`：每个成功进入详情页的岗位必需。保存详情页可见正文。
- `details/{job_id}.png`：每个成功进入详情页的岗位默认必需。截图失败时要在 `failures.jsonl` 和 `crawl_result.json` 中说明。
- `normalized_jobs.jsonl`：必需。归一化后的岗位数据，是报告分析输入。
- `report.json`：必需。结构化报告，包含结论、证据、图表数据、行动建议和限制说明。
- `report.html`：必需。默认最终报告。
- `report.png`：可选。只有用户要求图片或分享图时生成。

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

## 采集计划

`crawl_plan.json` 由采集阶段开始前生成：

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

## 采集结果

`crawl_result.json` 记录本次采集实际结果：

```json
{
  "run_id": "20260519-000000",
  "started_at": "2026-05-19T00:00:00+00:00",
  "finished_at": "2026-05-19T00:12:00+00:00",
  "collection_methods": ["playwright"],
  "planned_sources": 4,
  "completed_sources": 3,
  "failed_sources": 1,
  "planned_jobs": 120,
  "collected_jobs": 62,
  "blocked_by_host_browser_policy": false,
  "sources": [
    {
      "source_key": "sources.bytedance.social",
      "company": "bytedance",
      "channel": "social",
      "status": "completed",
      "planned_jobs": 30,
      "collected_jobs": 24,
      "failure_reason": null
    }
  ]
}
```

`collection_methods` 使用以下枚举值：`playwright`、`codex-browser`、`browser-use`、`computer-use`、`chrome-plugin`。

## 岗位索引

采集阶段输出 `jobs_index.jsonl`，每行一个岗位索引。详情正文只保存在 `details/{job_id}.txt`，不要在索引中重复保存全文。

```json
{
  "job_id": "bytedance-social-123",
  "company": "bytedance",
  "channel": "social",
  "title": "AI 产品经理",
  "city": "北京",
  "department": "产品部",
  "list_url": "https://example.com/jobs?page=1",
  "detail_url": "https://example.com/jobs/123",
  "detail_text_path": "details/bytedance-social-123.txt",
  "screenshot_path": "details/bytedance-social-123.png",
  "collection_method": "playwright",
  "query": "AI 产品经理",
  "collected_at": "2026-05-19T00:00:00+00:00"
}
```

## 详情页正文

`details/{job_id}.txt` 保存详情页可见正文。建议包含标题、地点、部门、职责和要求等页面可见内容，不补充外部信息。

`details/{job_id}.png` 保存详情页截图。截图失败时仍可保留正文和索引，但必须在 `failures.jsonl` 和 `crawl_result.json` 中记录。

## 归一岗位

归一化阶段输出 `normalized_jobs.jsonl`，每行一个岗位：

```json
{
  "job_id": "bytedance-social-123",
  "company": "bytedance",
  "channel": "social",
  "岗位标题": "AI 产品经理",
  "岗位族": "产品",
  "AI 相关度": "明确人工智能",
  "资历层级": "中高级",
  "城市": ["北京"],
  "核心能力": ["大模型应用", "产品规划", "数据分析"],
  "业务方向": ["大模型应用"],
  "技术关键词": ["Agent", "RAG"],
  "证据": ["岗位职责中出现大模型应用落地、智能体产品规划"],
  "详情链接": "https://example.com/jobs/123",
  "详情正文文件": "details/bytedance-social-123.txt"
}
```

## 失败项

`failures.jsonl` 每行一个失败项：

```json
{
  "company": "bytedance",
  "channel": "social",
  "source_key": "sources.bytedance.social",
  "url": "https://example.com/jobs",
  "stage": "岗位发现",
  "reason": "需要验证码",
  "blocked_by_host_browser_policy": false
}
```

宿主安全策略拒绝访问某个域名时，失败项应写成：

```json
{
  "company": "bytedance",
  "channel": "campus",
  "source_key": "sources.bytedance.campus",
  "url": "https://jobs.bytedance.com/campus/position",
  "stage": "宿主安全策略检查",
  "reason": "宿主浏览器安全策略拒绝访问该域名",
  "error_summary": "Browser Use rejected this action due to browser security policy. The user has requested that https://jobs.bytedance.com should not be used.",
  "blocked_by_host_browser_policy": true
}
```

## 结构化报告

报告阶段先输出 `report.json`，再基于它渲染 `report.html`。不要单独生成 `insights.json`。

```json
{
  "request": {},
  "sample_scope": {
    "companies": ["bytedance"],
    "channels": ["social"],
    "job_count": 62,
    "failed_sources": 1
  },
  "headline": "AI 产品岗正在转向交付责任",
  "key_findings": [
    {
      "claim": "AI 产品岗更看重业务落地和跨团队推进",
      "evidence": ["bytedance-social-123"],
      "impact": "简历需要展示从需求到上线的闭环证据",
      "action": "用 STAR 结构描述一个大模型应用项目"
    }
  ],
  "charts": [],
  "limitations": ["样本只覆盖公开招聘页面"]
}
```
