# 阶段二：字段归一 SOP

## 目标

字段归一阶段由当前 Codex App 会话执行，不由 Python 脚本调用 Codex CLI。它读取采集阶段生成的 `jobs_index.jsonl` 和 `details/{job_id}.txt`，分批生成可稳定分析的 `normalized_jobs.jsonl`。

## 输入

- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/jobs_index.jsonl`
- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/details/{job_id}.txt`
- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/failures.jsonl`，存在失败项时读取
- 用户本次分析问题
- 本次采集计划指定的归一批大小；未指定时默认每批 20 条

## 输出

- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/normalized_jobs.jsonl`

## 执行规则

1. 分批读取岗位索引，默认每批 20 条，并按 `detail_text_path` 读取详情正文。
2. 对每条岗位保留 `job_id`、`detail_url` 和 `detail_text_path`，保证后续报告可以回溯证据。
3. 只基于采集文本做归一，不补充外部事实。
4. 对无法判断的字段写 `未知` 或空数组，不编造。
5. 发现重复岗位时保留信息最完整的一条。
6. 遇到正文为空、页面被登录/验证码拦截、内容明显不是岗位时，写入或追加 `failures.jsonl`，并在 `normalized_jobs.jsonl` 中跳过该岗位。

## 归一字段

- 公司
- 渠道
- 岗位标题
- 岗位族
- AI 相关度
- 资历层级
- 城市
- 核心能力
- 业务方向
- 技术关键词
- 证据
- 详情链接

## 与报告的关系

字段归一阶段不写报告结论。报告阶段再根据 `normalized_jobs.jsonl`、`crawl_plan.json`、`crawl_result.json`、失败项和用户问题生成 `report.json` 与 HTML 报告。
