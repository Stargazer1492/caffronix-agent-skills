---
name: deepseek-task
description: Use DeepSeek from Codex through the OpenAI TypeScript SDK for summarization, analysis, drafting, code review, or other delegated LLM tasks. Trigger when the user asks Codex to call DeepSeek, compare a result with DeepSeek, run a task through DeepSeek, or use a DeepSeek model while keeping the API key out of the chat transcript.
---

# DeepSeek Task

This skill lets Codex delegate a bounded task to DeepSeek through a local TypeScript runner. It uses the official `openai` npm package with `baseURL: "https://api.deepseek.com"`.

## Safety Rules

- Never ask the user to paste `DEEPSEEK_API_KEY` into chat.
- Never print, summarize, inspect, or log the API key.
- Prefer `process.env.DEEPSEEK_API_KEY` when it is already set.
- If no key is configured, run the local setup script and have the user enter the key in the browser page.
- The local `deepseek.env` file is for `DEEPSEEK_API_KEY` only. Do not store model names, timeouts, or other runtime options in that file.
- Non-sensitive defaults from the setup page are stored separately in `~/.config/caffronix-agent-skills/deepseek.settings.json`.
- Do not write secrets into this repository, the skill install directory, shell history, prompts, reports, or generated artifacts.
- The local setup page may be opened in Codex Browser, but after opening the URL, let the user type the key manually. Do not inspect the password field after user input.
- After a successful setup result, close the Codex Browser setup tab if it is still open, hide the Codex in-app Browser panel, then run the smoke test.

## Post-Install Setup

This skill should be initialized immediately after installation or upgrade. Do not wait until the first DeepSeek task unless the user explicitly asks to skip initialization.

After the official installer finishes, run setup from the installed skill directory, not from the source repository:

```bash
cd "${CODEX_HOME:-$HOME/.codex}/skills/deepseek-task"
```

Install dependencies if needed:

```bash
npm install
```

Start the local setup server:

```bash
npm run setup
```

The setup page lets the user enter the API key and configure non-sensitive DeepSeek defaults. If the user deletes a value or submits an invalid setting, the scripts fall back to built-in defaults:

- `model`: `deepseek-v4-flash`
- `thinking`: `enabled`
- `temperature`: `0.2`
- `maxTokens`: `10240`

If the user explicitly asks to use another timeout for this run, pass it as a command argument. Command arguments always have higher priority than setup-page defaults:

```bash
npm run setup -- --timeout-minutes 5
```

The script asks the OS for an available local port, so port conflicts are handled automatically. It prints a machine-readable setup URL:

```text
DEEPSEEK_SETUP_URL=http://127.0.0.1:<port>/?token=<one-time-token>
```

Open that URL with the Codex App Browser if available; otherwise ask the user to open it in their browser. The page saves the key to:

```text
~/.config/caffronix-agent-skills/deepseek.env
```

The setup page saves non-sensitive defaults to:

```text
~/.config/caffronix-agent-skills/deepseek.settings.json
```

Both files are written with owner-only permissions where the platform supports it. The setup server defaults to a ten-minute wait. If the user does not submit the key in time, the script exits non-zero and Codex should tell the user to run setup again and complete the browser form within the allowed time. If the process is still running after the allowed time because of host behavior, Codex may kill the setup process and report the timeout.

The setup page sends a local cancel signal when the browser page is closed before saving. It also sends a short heartbeat while the page is open; if the heartbeat stops before a key is saved, the setup server exits non-zero with a browser-closed or browser-disconnected result. Treat that as a canceled setup, not a credential failure.

When Codex opens the setup URL in the built-in Browser, record the setup tab id and monitor that tab while the setup process is waiting. If the tab disappears before `DEEPSEEK_SETUP_RESULT` reports success, kill the setup process and tell the user the setup was canceled because the browser page was closed. This Codex-side tab check is the reliable fallback when browser close events or beacon delivery are blocked by the host.

The setup page is shown in Chinese and includes the bundled `assets/logo.png` brand image. It uses a centered logo, a compact configuration list for API key and model, and a separate guidance section. The guidance section tells the user to open `https://platform.deepseek.com/api_keys`, click "创建 API key", copy the key immediately, and remember that once the key window is closed, the same key cannot be viewed again and must be recreated.

On success, the script prints a machine-readable result and exits `0`:

```text
DEEPSEEK_SETUP_RESULT={"ok":true,"event":"deepseek_key_saved","configFile":"..."}
```

After a successful setup, immediately run a smoke test:

```bash
npm run doctor
```

If Codex opened the setup page in the built-in Browser, close that tab before running `npm run doctor`. The success page also attempts to close itself automatically, but Codex should not rely on browser self-close behavior alone.

After closing the setup tab, also hide the in-app Browser panel itself. Navigating the tab to `about:blank` is not enough. Use the Browser visibility capability and call `set(false)` on it. The proven path is:

```js
globalThis.browser = await agent.browsers.get("iab");
const visibility = await browser.capabilities.get("visibility");
await visibility.set(false);
```

If the skill is already installed but has not been initialized, or if a DeepSeek run fails because no key is configured, run the same setup flow as a fallback. This fallback does not change the rule that fresh installs should initialize immediately after installation.

## Running DeepSeek

Use `npm run deepseek --` followed by a prompt, or pass input through stdin:

```bash
npm run deepseek -- --prompt "Summarize this in three bullets."
```

```bash
cat notes.md | npm run deepseek -- --system "You are a concise analyst."
```

For larger prompts, write the prompt into a temporary local file and use:

```bash
npm run deepseek -- --prompt-file /absolute/path/to/prompt.md
```

Useful options:

- `--model <name>` overrides the default model.
- `--thinking <enabled|disabled>` overrides the default thinking mode.
- `--system <text>` or `--system-file <path>` adds a system message.
- `--temperature <number>` sets sampling temperature.
- `--max-tokens <number>` sets `max_tokens`.
- `--display <browser|command>` controls how results are presented. Default: `browser`.
- `--json` prints the response as JSON with metadata in command mode.

Runtime option resolution:

1. Command arguments such as `--model`, `--thinking`, `--temperature`, and `--max-tokens`
2. Values saved in `deepseek.settings.json`
3. Built-in defaults: `deepseek-v4-flash`, `enabled`, `0.2`, and `10240`

Use `deepseek-v4-flash` by default. The setup page currently offers `deepseek-v4-flash` and `deepseek-v4-pro`. If the user asks for higher quality, stronger reasoning, or explicitly asks to use the Pro model for a single run, pass `--model deepseek-v4-pro` on that command. Do not persist the model choice in `deepseek.env`.

DeepSeek thinking mode is sent as `thinking: { "type": "enabled" }` or `thinking: { "type": "disabled" }` in the chat completion request body. DeepSeek documents that `temperature` is ignored when thinking mode is enabled; still pass the configured `temperature` value so the non-thinking path and saved settings remain consistent.

Default result mode is `browser`: after DeepSeek returns, the runner prints a machine-readable `DEEPSEEK_RESULT=...` line for Codex and starts a temporary local result page. Open `DEEPSEEK_RESULT_URL` in the Codex in-app Browser so the user can see DeepSeek output directly. The result page displays both `reasoningContent` and `content` when DeepSeek returns both. The local result server exits when the result page posts `/close` or after its timeout.

If the user asks for command mode, no-browser mode, or asks Codex to answer from the result, pass:

```bash
npm run deepseek -- --display command --prompt "..."
```

In command mode, the runner exits immediately after writing stdout. With `--json`, stdout includes `reasoningContent` and `content` separately. Without `--json`, stdout prints only final `content`.

## Health Check

Use `npm run doctor` after setup or when diagnosing configuration. It reads the configured key without printing it, sends a minimal request to DeepSeek using the saved non-secret settings, and prints JSON status. Pass `--model deepseek-v4-pro` only when the user asks to test the Pro model. A successful result looks like:

```json
{"ok":true,"provider":"deepseek","model":"deepseek-v4-flash","content":"deepseek-ok"}
```

## Task Boundary

Use DeepSeek for a specific subtask with a concrete prompt. Do not forward unrelated workspace files, secrets, environment dumps, browser cookies, local configs, or private credentials. When using source files as input, include only the minimum excerpts needed for the task.

## Self-Upgrade

When the user asks to install or upgrade this skill, use the Codex official `$skill-installer` or an equivalent official skill management capability to reinstall this skill:

```text
repo: Stargazer1492/caffronix-agent-skills
path: deepseek-task
ref: main
```

If the official installer detects that `deepseek-task` already exists and refuses to overwrite it, explain to the user that this is an upgrade scenario and ask the user to confirm whether to overwrite the installed skill. Before the user confirms, do not delete or overwrite `$CODEX_HOME/skills/deepseek-task` or `~/.codex/skills/deepseek-task`.

Skill upgrades must not read, delete, overwrite, truncate, or migrate local DeepSeek configuration files unless the user explicitly asks for a config reset:

```text
~/.config/caffronix-agent-skills/deepseek.env
~/.config/caffronix-agent-skills/deepseek.settings.json
```

After installation or upgrade, confirm that `SKILL.md` exists in the target skill directory, then run the post-install setup flow from that installed directory. When setup and `npm run doctor` succeed, tell the user to restart Codex so the new skill is loaded. If the user explicitly asks to skip initialization, say that the skill is installed but not initialized and that the next use must run the setup flow before calling DeepSeek.
