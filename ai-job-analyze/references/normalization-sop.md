# 字段归一 SOP

## 目标

字段归一阶段由当前 Codex App 会话执行，不由 Python 脚本调用 Codex CLI。它读取抓取阶段的 `raw_jobs.jsonl`，分批生成可稳定分析的 `normalized_jobs.jsonl`。

## 输入

- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/raw_jobs.jsonl`
- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/failures.jsonl`
- 用户本次分析问题
- `config.toml` 中的 `normalize.batch_size`

## 输出

- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/normalized_jobs.jsonl`
- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/normalization_manifest.json`
- `<workspace-root>/caffronix-agent-skills/ai-job-analyze/work/{run_id}/normalization_failures.jsonl`

## 执行规则

1. 按 `normalize.batch_size` 分批读取原始岗位，默认每批 20 条。
2. 对每条岗位保留 `source_id` 和 `详情链接`，保证可以回溯。
3. 只基于抓取文本做归一，不补充外部事实。
4. 对无法判断的字段写 `未知` 或空数组，不编造。
5. 发现重复岗位时保留信息最完整的一条，并在 manifest 中记录去重数量。
6. 遇到正文为空、页面被登录/验证码拦截、内容明显不是岗位时，写入 `normalization_failures.jsonl`。

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

字段归一阶段不写报告结论。洞察阶段再根据 `normalized_jobs.jsonl`、失败项和用户问题生成 `insights.json`。报告渲染阶段默认生成 HTML，用户要求图片时再从 HTML 导出 PNG。
