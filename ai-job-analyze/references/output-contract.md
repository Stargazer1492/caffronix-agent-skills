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

抓取阶段输出 `raw_jobs.jsonl`，每行一个岗位：

```json
{
  "source_id": "bytedance-social-123",
  "公司": "字节",
  "渠道": "社招",
  "标题": "AI 产品经理",
  "城市": "北京",
  "详情链接": "https://example.com/jobs/123",
  "原始正文": "岗位职责：...",
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

## 报告草稿

```json
{
  "请求": {},
  "创建时间": "2026-05-19T00:00:00+00:00",
  "失败项": []
}
```
