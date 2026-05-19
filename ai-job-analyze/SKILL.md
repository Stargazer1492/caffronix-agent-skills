---
name: ai-job-analyze
description: 基于当前 agent 可用能力抓取公开招聘站点中的人工智能岗位，分析校招或社招机会，并生成本地优先的网页或图片洞察报告。优先使用 Codex App 内置 Browser、browser-use 或 Computer Use 浏览公开页面；脚本 crawler 只作为 fallback。适用于用户要求收集人工智能岗位、比较校招/社招渠道、或基于公开招聘页生成可视化岗位市场报告的场景。
---

# 人工智能岗位分析

本技能用于本地优先的人工智能岗位市场分析。它的主能力不是固定用脚本爬取，而是指导当前 agent 选择最合适的公开页面访问方式，抓取岗位、归一字段、生成洞察和报告。Python 脚本只保留为无浏览器能力或自动化失败时的兜底路径。

当前脚本 fallback 只接入了腾讯和美团公开接口。字节、阿里的来源配置已保留，但脚本 `crawl` 会把它们写入 `failures.jsonl`，不会声称已成功抓取。使用浏览器能力时，可以直接访问字节、阿里公开招聘页面并按页面可见内容抽取岗位。

## 能力路由

执行抓取前，先检查当前宿主可用的 tools、plugins 和 skills，再按以下顺序选择路径。不要只根据操作系统决定路径；macOS、Windows、Linux 只影响 fallback 能否运行桌面 UI 或 shell。

1. Codex App 内置 Browser 可用时，优先使用内置 Browser 打开公开招聘页面，搜索关键词、翻页、读取页面或 DOM 中的岗位信息。
2. 内置 Browser 不可用但 `browser-use` 可用时，使用 `browser-use` 的默认浏览器访问公开页面；不要连接用户真实 Chrome profile，除非用户明确要求，因为本 skill 不需要 cookie、登录态或本地浏览器数据。
3. 页面只能通过真实可视 UI 操作时，且 Computer Use 可用，才使用 Computer Use 进行点击、输入、滚动和截图识别。
4. 上述浏览器路径都不可用或失败时，运行 `python scripts/run.py crawl` 作为 fallback crawler。
5. 所有路径都失败时，只生成失败摘要和原因，不伪造岗位数据。

不论使用哪条路径，最终产物都必须遵守 `references/output-contract.md`，写入同一套 `raw_jobs.jsonl`、`sources.json`、`failures.jsonl` 和 `crawl_manifest.json`。

## 工作流程

1. 首次使用前，宿主 agent 必须传入一个当前沙箱可写的工作目录，并初始化本 skill 的工作区：

   ```bash
   python scripts/bootstrap.py init-workspace --workspace-root <宿主可写工作目录>
   ```

   该命令会创建：

   ```text
   <宿主可写工作目录>/caffronix-agent-skills/ai-job-analyze/
   ```

2. 抓取前运行启动检查：

   ```bash
   python scripts/bootstrap.py check --workspace-root <宿主可写工作目录>
   ```

3. 如果缺少 `uv`，展示启动脚本输出的安装命令。除非用户明确同意，不要自动安装全局工具。

4. 查看技能统一入口：

   ```bash
   python scripts/run.py --help
   ```

5. 真正抓取前先收集用户意图。用户没有给出时，读取 `scripts/config.toml` 中的默认值：
   - 公司：`bytedance`、`alibaba`、`tencent`、`meituan`
   - 渠道：校招、社招或两者
   - 查询词：例如 `人工智能产品经理`、`智能体`、`大模型应用`、`算法`
   - 输出格式：默认网页，可选图片或两者
   - 分析问题：报告需要优先回答的具体问题

6. 如果用户只给出跨公司分析需求，没有明确公司、渠道或来源，先按 `references/task-decomposition-sop.md` 拆解任务，生成本次抓取计划。计划必须遵守 `scripts/config.toml` 中的 `crawl.max_jobs_per_task`。

7. 按阶段执行，不把抓取、字段归一、洞察和报告导出塞进一个长任务：
   - 抓取阶段：按“能力路由”优先使用浏览器能力抓取公开岗位；只有浏览器路径不可用或失败时，才运行脚本 fallback。
   - 转换阶段：Codex App 读取抓取产物，按 `references/normalization-sop.md` 分批完成字段归一。
   - 洞察阶段：Codex App 根据归一后的岗位和用户问题生成洞察 JSON。
   - 报告阶段：运行 `python scripts/run.py report`，默认生成 HTML；用户要求图片时再导出 PNG。

## 运行规则

- 启动前不要求用户已经安装 Python。`uv` 是运行时管理工具，可把 Python 安装到配置好的本地运行时目录。
- 运行产物只能写入宿主传入的可写工作目录下的 `caffronix-agent-skills/ai-job-analyze/`。不要写入 skill 安装目录、用户 home 目录或未验证可写的任意路径。
- 不读取 `.env`、Cookie、本地存储、浏览器配置文件、令牌、密码或验证码。
- 不要求 `.env.example`。默认值放在可 Git 管理的 `scripts/config.toml` 中，且只允许非敏感配置。
- 不在 Python 脚本中调用 `codex exec`。当前 Codex App 会话就是语义转换和洞察生成的执行层。
- 如果招聘站点出现登录、验证码、账号风险验证或权限弹窗，停止操作并报告被阻断的来源。
- 使用浏览器能力时，只访问公开页面和公开接口；不要使用用户个人浏览器 profile、cookie、登录态或账号权限来扩大抓取范围。
- 公司适配器必须区分渠道。没有专门来源契约时，不要把校招适配器复用于社招。
- 报告输出默认是 HTML；PNG 是可选导出格式，不应替代 HTML 主产物。

## 参考文档

- 新增或修改公司来源前先读 `references/company-sources.md`。
- 修改跨公司任务拆解方式前先读 `references/task-decomposition-sop.md`。
- 修改报告叙事结构前先读 `references/analysis-playbook.md`。
- 修改输出字段前先读 `references/output-contract.md`。
- 修改字段归一流程前先读 `references/normalization-sop.md`。
