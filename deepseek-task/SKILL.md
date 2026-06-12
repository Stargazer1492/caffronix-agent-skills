---
name: deepseek-task
description: 通过 OpenAI TypeScript SDK 在 Codex 中调用 DeepSeek，完成摘要、分析、起草、代码审查或其他边界清晰的委托任务。用户要求 Codex 调用 DeepSeek、对比 DeepSeek 结果、让 DeepSeek 执行某个任务，或要求在不把 API key 写入聊天记录的前提下使用 DeepSeek 模型时触发。
---

# DeepSeek 任务

这个 skill 让 Codex 通过本地 TypeScript runner 把边界清晰的任务委托给 DeepSeek。runner 使用官方 `openai` npm 包，并设置 `baseURL: "https://api.deepseek.com"`。

## 安全规则

- 永远不要要求用户把 `DEEPSEEK_API_KEY` 粘贴到聊天里。
- 永远不要打印、总结、检查或记录 API key。
- 如果环境中已经设置 `process.env.DEEPSEEK_API_KEY`，优先使用它。
- 如果没有配置 key，运行本地 setup 脚本，让用户在浏览器页面里手动输入。
- 本地 `deepseek.env` 文件只用于保存 `DEEPSEEK_API_KEY`。不要把模型名、超时时间或其他运行参数写入该文件。
- 非敏感默认值由 setup 页面单独保存到 `~/.config/caffronix-agent-skills/deepseek.settings.json`。
- 不要把 secrets 写入本仓库、skill 安装目录、shell history、prompt、报告或生成产物。
- 可以用 Codex Browser 打开本地 setup 页面，但打开 URL 后必须让用户手动输入 key。用户输入后，不要检查 password 字段。
- setup 成功后，如果 Codex Browser setup tab 仍然打开，先关闭该 tab，隐藏 Codex 内置 Browser 面板，再运行 smoke test。

## 安装后初始化

安装或升级后应立即初始化本 skill。除非用户明确要求跳过初始化，否则不要等到第一次 DeepSeek 任务时才配置。

官方安装器完成后，从已安装的 skill 目录运行 setup，不要从源码仓库运行：

```bash
cd "${CODEX_HOME:-$HOME/.codex}/skills/deepseek-task"
```

如有需要，安装依赖：

```bash
npm install
```

启动本地 setup server：

```bash
npm run setup
```

setup 页面允许用户输入 API key，并配置非敏感 DeepSeek 默认值。如果 key 已经存在，同一个 setup 页面默认以 settings-only 模式打开：API Key 输入框禁用，只显示 `********`，保存表单时不得覆盖 `deepseek.env`。

如果用户明确要求重置、替换、更新或重新输入 DeepSeek API key，使用：

```bash
npm run setup -- --reset-key
```

如果用户删除某个值或提交无效配置，脚本会回退到内置默认值：

- `model`: `deepseek-v4-flash`
- `thinking`: `enabled`
- `temperature`: `0.2`
- `maxTokens`: `10240`

如果用户明确要求本次 setup 使用其他超时时间，通过命令参数传入。命令参数优先级高于 setup 页面保存的默认值：

```bash
npm run setup -- --timeout-minutes 5
```

脚本会向操作系统申请可用本地端口，因此端口冲突会自动处理。脚本会打印机器可读的 setup URL：

```text
DEEPSEEK_SETUP_URL=http://127.0.0.1:<port>/?token=<one-time-token>
```

如果 Codex App Browser 可用，用它打开该 URL；否则让用户在自己的浏览器中打开。页面会把 key 保存到：

```text
~/.config/caffronix-agent-skills/deepseek.env
```

setup 页面会把非敏感默认值保存到：

```text
~/.config/caffronix-agent-skills/deepseek.settings.json
```

在平台支持的情况下，两个文件都会以仅 owner 可读写的权限写入。setup server 默认等待 10 分钟。如果用户没有在时限内提交 key，脚本会非零退出，Codex 应告诉用户重新运行 setup，并在允许时间内完成浏览器表单。如果因为宿主行为导致进程超时后仍在运行，Codex 可以终止 setup 进程并报告超时。

浏览器页面在保存前被关闭时，setup 页面会发送本地取消信号。页面打开期间也会发送短 heartbeat；如果 key 保存前 heartbeat 停止，setup server 会以浏览器关闭或断开连接结果非零退出。把这种情况视为用户取消 setup，而不是凭证失败。

当 Codex 用内置 Browser 打开 setup URL 时，记录 setup tab id，并在 setup 进程等待期间监控该 tab。如果 `DEEPSEEK_SETUP_RESULT` 成功前 tab 消失，终止 setup 进程，并告诉用户 setup 因浏览器页面被关闭而取消。这个 Codex 侧 tab 检查是浏览器 close event 或 beacon 被宿主拦截时的可靠兜底。

setup 页面使用中文展示，并包含内置 `assets/logo.png` 品牌图。页面使用居中 logo、紧凑的 API key 和模型配置列表，以及独立的指引区。指引区提示用户打开 `https://platform.deepseek.com/api_keys`，点击“创建 API key”，立即复制 key，并记住 key 窗口关闭后无法再次查看同一 key，只能重新创建。

成功时，脚本打印机器可读结果并以 `0` 退出。保存新 key 时输出 `deepseek_key_saved`；只保存 settings 且不修改 key 时输出 `deepseek_settings_saved`：

```text
DEEPSEEK_SETUP_RESULT={"ok":true,"event":"deepseek_key_saved","configFile":"..."}
```

setup 成功后，立即运行 smoke test：

```bash
npm run doctor
```

如果 Codex 用内置 Browser 打开 setup 页面，运行 `npm run doctor` 前先关闭 setup tab。成功页也会尝试自动关闭自己，但 Codex 不应只依赖页面自关闭行为。

关闭 setup tab 后，还要隐藏 in-app Browser 面板本身。把 tab 导航到 `about:blank` 不够。使用 Browser visibility capability，并对它调用 `set(false)`。已验证路径如下：

```js
globalThis.browser = await agent.browsers.get("iab");
const visibility = await browser.capabilities.get("visibility");
await visibility.set(false);
```

如果用户随时要求修改已保存的默认值，用 `npm run setup` 在 Codex in-app Browser 打开同一个 setup 页面。普通设置变更不要传 `--reset-key`。用户保存后，同样关闭 setup tab 并隐藏 Browser 面板。如果用户要求重置 API key，改用 `npm run setup -- --reset-key`。

如果 skill 已安装但尚未初始化，或 DeepSeek 调用因为没有 key 而失败，执行同一 setup 流程作为兜底。这个兜底不改变“新安装后应立即初始化”的规则。

## 运行 DeepSeek

使用 `npm run deepseek --` 加 prompt，或通过 stdin 传入输入：

```bash
npm run deepseek -- --prompt "用三条 bullet 总结这段内容。"
```

```bash
cat notes.md | npm run deepseek -- --system "你是一个简洁的分析师。"
```

较大的 prompt 先写入临时本地文件，再使用：

```bash
npm run deepseek -- --prompt-file /absolute/path/to/prompt.md
```

常用选项：

- `--model <name>` 覆盖默认模型。
- `--thinking <enabled|disabled>` 覆盖默认 thinking 模式。
- `--system <text>` 或 `--system-file <path>` 增加 system message。
- `--temperature <number>` 设置采样温度。
- `--max-tokens <number>` 设置 `max_tokens`。
- `--display <browser|command>` 控制结果展示方式，默认是 `browser`。
- `--json` 在 command 模式下以 JSON 打印响应和元数据。

运行参数解析优先级：

1. 命令参数，例如 `--model`、`--thinking`、`--temperature`、`--max-tokens`
2. `deepseek.settings.json` 中保存的值
3. 内置默认值：`deepseek-v4-flash`、`enabled`、`0.2`、`10240`

默认使用 `deepseek-v4-flash`。setup 页面当前提供 `deepseek-v4-flash` 和 `deepseek-v4-pro`。如果用户要求更高质量、更强推理，或明确要求本次使用 Pro 模型，在该命令中传 `--model deepseek-v4-pro`。不要把模型选择持久化到 `deepseek.env`。

DeepSeek thinking mode 会在 chat completion 请求体中以 `thinking: { "type": "enabled" }` 或 `thinking: { "type": "disabled" }` 发送。DeepSeek 文档说明 thinking mode 启用时会忽略 `temperature`；仍然传入配置的 `temperature`，以保持非 thinking 路径和已保存 settings 的一致性。

默认结果模式是 `browser`：DeepSeek 返回后，runner 会为 Codex 打印机器可读的 `DEEPSEEK_RESULT=...` 行，并启动一个 detached 临时本地结果页 server。打开 `DEEPSEEK_RESULT_URL` 到 Codex in-app Browser，让用户直接查看 DeepSeek 输出。打开结果 URL 后，Codex 可以结束任务，不需要等待结果页 server 进程。

结果 server 只监听 `127.0.0.1`，固定端口范围为 `14920` 到 `14925`。启动新结果 server 前，runner 会扫描这个端口范围，并关闭发现的旧 `deepseek-task` 结果 server。结果页顶部标题栏包含 `assets/logo.png`、标题 `DeepSeek Result` 和当前 DeepSeek 请求参数。页面把 `reasoningContent` 显示为 `思考内容`，把 `content` 显示为 `回复内容`，两者都按 Markdown 渲染。结果页向 `/close` 发请求、用户点击右上角 `X` 按钮，或 10 分钟自动到期时，本地结果 server 退出。页面也会在 `/close` 后尝试 `window.close()`，但 Codex 不应只依赖网页自己隐藏 in-app Browser 面板。

如果用户要求 command 模式、no-browser 模式，或要求 Codex 直接从结果中回答，传：

```bash
npm run deepseek -- --display command --prompt "..."
```

command 模式下，runner 写完 stdout 后立即退出。加 `--json` 时，stdout 分别包含 `reasoningContent` 和 `content`。不加 `--json` 时，stdout 只打印最终 `content`。

## 健康检查

setup 后或诊断配置时，使用：

```bash
npm run doctor
```

它会读取已配置 key 但不打印 key，使用已保存的非敏感 settings 向 DeepSeek 发送最小请求，并打印 JSON 状态。只有用户要求测试 Pro 模型时，才传 `--model deepseek-v4-pro`。成功结果示例：

```json
{"ok":true,"provider":"deepseek","model":"deepseek-v4-flash","content":"deepseek-ok"}
```

## 任务边界

只把具体、边界清晰的子任务交给 DeepSeek。不要转发无关工作区文件、secrets、环境 dump、浏览器 cookie、本地配置或私密凭证。使用源码文件作为输入时，只包含完成任务所需的最小片段。

## 自升级

用户要求安装或升级本 skill 时，使用 Codex 官方 `$skill-installer` 或等价的官方技能管理能力重新安装：

```text
repo: Stargazer1492/caffronix-agent-skills
path: deepseek-task
ref: main
```

如果官方安装器检测到 `deepseek-task` 已存在并拒绝覆盖，说明这是升级场景，请向用户解释并确认是否覆盖已安装 skill。用户确认前，不要删除或覆盖 `$CODEX_HOME/skills/deepseek-task` 或 `~/.codex/skills/deepseek-task`。

除非用户明确要求重置配置，否则 skill 升级不得读取、删除、覆盖、截断或迁移本地 DeepSeek 配置文件：

```text
~/.config/caffronix-agent-skills/deepseek.env
~/.config/caffronix-agent-skills/deepseek.settings.json
```

安装或升级后，确认目标 skill 目录中存在 `SKILL.md`，再从已安装目录执行安装后初始化流程。setup 和 `npm run doctor` 都成功后，提示用户重启 Codex，让新 skill 生效。如果用户明确要求跳过初始化，说明 skill 已安装但尚未初始化，下一次使用前必须先执行 setup 流程。
