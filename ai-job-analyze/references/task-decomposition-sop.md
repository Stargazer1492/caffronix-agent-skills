# 任务拆解 SOP

## 目标

当用户提出的是跨公司、跨渠道或泛化分析需求时，不应直接把所有公司和所有来源一次性抓满。必须先把用户问题拆成可执行的抓取计划，并用 `crawl.max_jobs_per_task` 控制单次任务总量。

## 触发条件

遇到以下情况时先执行任务拆解：

- 用户只说“分析 AI 产品经理岗位”“对比大厂 AI 岗位”，没有指定公司。
- 用户要求跨公司比较，但没有指定渠道。
- 用户要求“AI 岗位市场”“大模型岗位趋势”等宽泛问题。
- 用户给出分析问题，但没有给出 source URL。

如果用户已经明确给出公司、渠道、关键词和 source URL，可以跳过拆解，直接形成抓取计划。

## 输入

- 用户分析问题。
- `scripts/config.toml` 中的默认公司、默认渠道、默认查询词。
- `scripts/config.toml` 中的 `crawl.max_jobs_per_task`。
- `scripts/config.toml` 中的 `sources.*` 来源契约。

## 输出

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

## 拆解规则

1. 先识别用户问题里的岗位关键词，例如 `AI 产品经理`、`大模型应用`、`智能体`。
2. 再识别比较维度，例如公司差异、校招/社招差异、城市分布、能力要求。
3. 如果用户没有指定公司，默认使用 `crawl.default_companies`。
4. 如果用户没有指定渠道，默认使用 `crawl.default_channel`；当问题明确比较校招和社招时使用两者。
5. 根据可用来源生成 source 列表，跳过没有来源契约的组合。
6. 把 `crawl.max_jobs_per_task` 分配到各 source。默认均分；如果用户问题明显聚焦某家公司或某个渠道，可以提高该 source 的计划样本量。
7. 每个 source 的 `planned_jobs` 只是目标上限，不是保证数量。来源无结果、被验证码阻断或提前到底时，应停止该 source 并记录失败或样本不足。
8. 全部 source 合计不得超过 `crawl.max_jobs_per_task`。

## 兜底规则

`crawl.hard_max_pages_per_source` 只用于防止异常无限翻页，不作为用户可见的分析预算。adapter 达到以下任一条件必须停止当前 source：

- 本次任务已达到 `crawl.max_jobs_per_task`。
- 当前 source 已达到 `planned_jobs`。
- 页面无更多结果。
- 页面结果重复。
- 触发登录、验证码、风控或权限阻断。
- 达到 `crawl.hard_max_pages_per_source`。

## 与后续阶段的关系

抓取阶段必须把 `crawl_plan.json` 写入同一 run 目录。字段归一、洞察和报告阶段都应引用这个计划，说明本次样本为什么这样分配，以及哪些 source 未能达到计划样本量。
