import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  CONFIG_FILE,
  SETTINGS_FILE,
  DEFAULT_SETTINGS,
  DEFAULT_SETUP_TIMEOUT_MINUTES,
  MODEL_OPTIONS,
  THINKING_OPTIONS,
  type DeepSeekSettings,
  readDeepSeekConfig,
  readDeepSeekSettings,
  saveDeepSeekConfig,
  saveDeepSeekSettings,
} from "./deepseek-config.js";

const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024;
const HEARTBEAT_INTERVAL_MS = 2_000;
const HEARTBEAT_GRACE_MS = 10_000;
const LOGO_FILE = new URL("../assets/logo.png", import.meta.url);

function parseArgs(argv: string[]): { timeoutMinutes?: number; resetKey: boolean } {
  let timeoutMinutes: number | undefined;
  let resetKey = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--timeout-minutes":
        if (!next) throw new Error("--timeout-minutes requires a value.");
        timeoutMinutes = Number(next);
        if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
          throw new Error("--timeout-minutes must be a positive number.");
        }
        index += 1;
        break;
      case "--timeout-ms":
        if (!next) throw new Error("--timeout-ms requires a value.");
        timeoutMinutes = Number(next) / 60_000;
        if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
          throw new Error("--timeout-ms must be a positive number.");
        }
        index += 1;
        break;
      case "--reset-key":
        resetKey = true;
        break;
      case "--help":
      case "-h":
        console.log("Usage: npm run setup -- [--timeout-minutes 10] [--reset-key]");
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { timeoutMinutes, resetKey };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function pageHtml(
  token: string,
  settings: DeepSeekSettings,
  options: { canEditApiKey: boolean; hasExistingKey: boolean },
  message = "",
): string {
  const escapedMessage = escapeHtml(message);
  const escapedToken = escapeHtml(token);
  const apiKeyRequired = options.canEditApiKey;
  const apiKeyDisabled = !options.canEditApiKey;
  const apiKeyValue = apiKeyDisabled && options.hasExistingKey ? "********" : "";
  const apiKeyCopy = options.canEditApiKey
    ? "保存到本机 secret 文件，仅用于调用 DeepSeek。"
    : "已保存。当前只修改默认运行配置，不会覆盖 API Key。";
  const modelOptionsHtml = MODEL_OPTIONS.map((model) => {
    const selected = model === settings.model ? " selected" : "";
    return `<option value="${escapeHtml(model)}"${selected}>${escapeHtml(model)}</option>`;
  }).join("");
  const thinkingOptionsHtml = THINKING_OPTIONS.map((thinking) => {
    const selected = thinking === settings.thinking ? " selected" : "";
    const label = thinking === "enabled" ? "开启" : "关闭";
    return `<option value="${escapeHtml(thinking)}"${selected}>${label}</option>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>配置 DeepSeek API Key</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #050814;
      color: #f7fbff;
      --panel: #0b1223;
      --panel-soft: #101a31;
      --line: #1f3a58;
      --text: #f7fbff;
      --muted: #a9bdd3;
      --cyan: #22d3ff;
      --cyan-soft: #08384d;
      --red: #ff2d35;
      --red-soft: #451018;
      --magenta: #ff2f7f;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px 16px;
      background:
        radial-gradient(circle at 32% 24%, rgb(34 211 255 / 18%), transparent 30%),
        radial-gradient(circle at 72% 30%, rgb(255 45 53 / 20%), transparent 34%),
        linear-gradient(135deg, #030712 0%, #071322 46%, #18050b 100%);
    }
    main {
      width: min(760px, 100%);
      background: linear-gradient(180deg, rgb(11 18 35 / 94%), rgb(7 11 22 / 96%));
      border: 1px solid rgb(34 211 255 / 24%);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 24px 80px rgb(0 0 0 / 46%), 0 0 42px rgb(255 45 53 / 10%);
    }
    .brand {
      padding: 28px 28px 18px;
      text-align: center;
      background:
        radial-gradient(circle at 42% 18%, rgb(34 211 255 / 20%), transparent 34%),
        radial-gradient(circle at 62% 28%, rgb(255 45 53 / 18%), transparent 36%);
    }
    .logo {
      width: min(220px, 70vw);
      aspect-ratio: 16 / 10;
      object-fit: cover;
      display: inline-block;
      border: 1px solid rgb(34 211 255 / 24%);
      border-radius: 8px;
      box-shadow: 0 0 34px rgb(34 211 255 / 14%), 0 0 38px rgb(255 45 53 / 12%);
    }
    h1 {
      margin: 18px 0 8px;
      font-size: 26px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    p {
      line-height: 1.65;
      margin: 10px 0;
      color: var(--muted);
    }
    .form-area {
      padding: 0 32px 28px;
    }
    .config-list {
      display: grid;
      gap: 14px;
      margin: 22px 0;
    }
    .config-item {
      display: grid;
      grid-template-columns: minmax(150px, 210px) 1fr;
      gap: 16px;
      align-items: start;
      padding: 16px;
      background: rgb(16 26 49 / 74%);
      border: 1px solid rgb(34 211 255 / 18%);
      border-radius: 8px;
    }
    .field-title {
      font-weight: 650;
      color: var(--text);
      padding-top: 11px;
    }
    .field-copy {
      display: block;
      margin-top: 5px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--muted);
      font-weight: 400;
    }
    .tips {
      background: rgb(8 56 77 / 42%);
      border: 1px solid rgb(34 211 255 / 24%);
      border-radius: 8px;
      padding: 18px 20px;
    }
    .tips h2 {
      margin: 0 0 10px;
      font-size: 17px;
      letter-spacing: 0;
    }
    ol {
      margin: 0;
      padding-left: 20px;
      color: var(--muted);
      line-height: 1.7;
    }
    li + li {
      margin-top: 8px;
    }
    a {
      color: var(--cyan);
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    a:hover {
      text-decoration: underline;
      }
    label {
      display: block;
      margin-top: 0;
      font-weight: 650;
      color: var(--text);
    }
    input,
    select {
      width: 100%;
      box-sizing: border-box;
      margin-top: 8px;
      padding: 12px 14px;
      border: 1px solid rgb(34 211 255 / 34%);
      border-radius: 6px;
      background: #050814;
      color: var(--text);
      font: inherit;
      outline: none;
    }
    input:focus,
    select:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 3px rgb(34 211 255 / 14%);
    }
    button {
      margin-top: 18px;
      padding: 11px 16px;
      border: 0;
      border-radius: 6px;
      background: linear-gradient(90deg, var(--red), #ff5b2e);
      color: white;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      box-shadow: 0 0 24px rgb(255 45 53 / 28%);
    }
    .actions {
      text-align: center;
    }
    .field-error {
      display: none;
      margin-top: 8px;
      color: #ffd7da;
      font-size: 13px;
      line-height: 1.5;
    }
    .field-error.visible {
      display: block;
    }
    input[aria-invalid="true"] {
      border-color: var(--red);
      box-shadow: 0 0 0 3px rgb(255 45 53 / 16%);
    }
    .note {
      background: rgb(8 56 77 / 46%);
      border: 1px solid rgb(34 211 255 / 24%);
      border-radius: 6px;
      padding: 12px 14px;
      margin: 16px 0;
      color: #d9f7ff;
    }
    .message {
      background: rgb(69 16 24 / 72%);
      border: 1px solid rgb(255 45 53 / 32%);
      border-radius: 6px;
      padding: 12px 14px;
      margin: 16px 0;
      color: #ffd7da;
    }
    code {
      overflow-wrap: anywhere;
      color: #c7f5ff;
    }
    .warning {
      color: #ffd7da;
    }
    @media (max-width: 680px) {
      .form-area {
        padding-left: 18px;
        padding-right: 18px;
      }
      .config-item {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .field-title {
        padding-top: 0;
      }
    }
  </style>
  <script>
    const setupToken = ${JSON.stringify(token)};
    const apiKeyRequired = ${JSON.stringify(apiKeyRequired)};
    let formSubmitting = false;

    function notifyCancel() {
      if (formSubmitting) return;
      const url = "/cancel?token=" + encodeURIComponent(setupToken);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob(["closed"], { type: "text/plain" }));
        return;
      }
      fetch(url, { method: "POST", keepalive: true }).catch(() => {});
    }

    window.addEventListener("pagehide", notifyCancel);
    window.addEventListener("beforeunload", notifyCancel);
    window.addEventListener("DOMContentLoaded", () => {
      const form = document.querySelector("form");
      const apiKeyInput = document.querySelector("#apiKey");
      const apiKeyError = document.querySelector("#apiKeyError");

      function showApiKeyRequired() {
        apiKeyInput?.setAttribute("aria-invalid", "true");
        apiKeyError?.classList.add("visible");
      }

      apiKeyInput?.addEventListener("input", () => {
        if (apiKeyInput.value.trim()) {
          apiKeyInput.removeAttribute("aria-invalid");
          apiKeyError?.classList.remove("visible");
        }
      });

      form?.addEventListener("submit", (event) => {
        if (apiKeyRequired && !apiKeyInput?.value.trim()) {
          event.preventDefault();
          showApiKeyRequired();
          apiKeyInput?.focus();
          return;
        }
        formSubmitting = true;
      });
      window.setInterval(() => {
        if (!formSubmitting) {
          fetch("/heartbeat?token=" + encodeURIComponent(setupToken), {
            method: "POST",
            keepalive: true,
          }).catch(() => {});
        }
      }, ${HEARTBEAT_INTERVAL_MS});
    });
  </script>
</head>
<body>
  <main>
    <section class="brand">
      <img class="logo" src="/assets/logo.png?token=${escapedToken}" alt="Caffronix logo">
      <h1>配置 DeepSeek</h1>
    </section>
    <section class="form-area">
      <div class="note">
        不要把 API Key 粘贴到聊天窗口
      </div>
      <form method="post" action="/save?token=${escapedToken}" autocomplete="off" novalidate>
        ${
          escapedMessage
            ? `<div class="message" role="alert">${escapedMessage}</div>`
            : ""
        }
        <input type="hidden" name="token" value="${escapedToken}">
        <div class="config-list">
          <label class="config-item" for="apiKey">
            <span class="field-title">API Key<span class="field-copy">${escapeHtml(apiKeyCopy)}</span></span>
            <span>
              <input id="apiKey" name="apiKey" type="password"${apiKeyRequired ? " required autofocus" : " disabled"} autocomplete="off" spellcheck="false" placeholder="粘贴 sk-..." value="${escapeHtml(apiKeyValue)}" aria-describedby="apiKeyError">
              <span id="apiKeyError" class="field-error" role="alert">请填写 API Key</span>
            </span>
          </label>
          <label class="config-item" for="model">
            <span class="field-title">默认模型<span class="field-copy">后续命令仍可用 --model 临时覆盖。</span></span>
            <select id="model" name="model">
              ${modelOptionsHtml}
            </select>
          </label>
          <label class="config-item" for="thinking">
            <span class="field-title">Thinking<span class="field-copy">默认开启；后续命令仍可临时覆盖。</span></span>
            <select id="thinking" name="thinking">
              ${thinkingOptionsHtml}
            </select>
          </label>
          <label class="config-item" for="temperature">
            <span class="field-title">Temperature<span class="field-copy">默认 ${DEFAULT_SETTINGS.temperature}。Thinking 开启时 DeepSeek 会忽略该参数。</span></span>
            <input id="temperature" name="temperature" type="number" min="0" max="2" step="0.1" inputmode="decimal" value="${escapeHtml(String(settings.temperature))}" placeholder="${DEFAULT_SETTINGS.temperature}">
          </label>
          <label class="config-item" for="maxTokens">
            <span class="field-title">Max tokens<span class="field-copy">默认 ${DEFAULT_SETTINGS.maxTokens}。</span></span>
            <input id="maxTokens" name="maxTokens" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(String(settings.maxTokens))}" placeholder="${DEFAULT_SETTINGS.maxTokens}">
          </label>
        </div>
        <div class="actions">
          <button type="submit">保存配置</button>
        </div>
      </form>
      <section class="tips">
        <h2>如何获取 DeepSeek API Key</h2>
        <ol>
          <li>打开 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">DeepSeek API Keys 页面</a>。</li>
          <li>登录账号并按需完成充值或开通 API 使用权限。</li>
          <li>点击「创建 API key」，创建后立即复制 Key。</li>
          <li><span class="warning">注意：Key 展示窗口关闭后将无法再次查看同一个 Key；如果没有复制，只能重新创建。</span></li>
        </ol>
      </section>
    </section>
  </main>
</body>
</html>`;
}

function successHtml(token: string, options: { keySaved: boolean }): string {
  const escapedToken = escapeHtml(token);
  const title = options.keySaved ? "DeepSeek API Key 已保存" : "DeepSeek 配置已保存";
  const body = options.keySaved
    ? "本地 setup server 将自动停止。此页面会尝试自动关闭；如果浏览器阻止自动关闭，请直接关闭此标签页并返回 Codex。"
    : "默认运行配置已保存，API Key 未被修改。本地 setup server 将自动停止。此页面会尝试自动关闭；如果浏览器阻止自动关闭，请直接关闭此标签页并返回 Codex。";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #050814;
      color: #f7fbff;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 16px;
      background:
        radial-gradient(circle at 35% 30%, rgb(34 211 255 / 16%), transparent 32%),
        radial-gradient(circle at 72% 40%, rgb(255 45 53 / 18%), transparent 35%),
        linear-gradient(135deg, #030712 0%, #071322 48%, #18050b 100%);
    }
    main {
      width: min(680px, 100%);
      background: linear-gradient(180deg, rgb(11 18 35 / 94%), rgb(7 11 22 / 96%));
      border: 1px solid rgb(34 211 255 / 24%);
      border-radius: 8px;
      padding: 28px;
      box-shadow: 0 24px 80px rgb(0 0 0 / 46%);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 24px;
    }
    p {
      line-height: 1.65;
      color: #a9bdd3;
    }
    .brand {
      width: 128px;
      height: 86px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid rgb(34 211 255 / 24%);
      margin-bottom: 18px;
    }
  </style>
  <script>
    window.setTimeout(() => {
      window.open("", "_self");
      window.close();
    }, 900);
  </script>
</head>
<body>
  <main>
    <img class="brand" src="/assets/logo.png?token=${escapedToken}" alt="Caffronix logo">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(body)}</p>
  </main>
</body>
</html>`;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

async function sendLogo(response: ServerResponse): Promise<void> {
  const logo = await readFile(LOGO_FILE);
  response.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-store",
    "Content-Length": String(logo.byteLength),
  });
  response.end(logo);
}

async function sendLogoHead(response: ServerResponse): Promise<void> {
  const logo = await readFile(LOGO_FILE);
  response.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-store",
    "Content-Length": String(logo.byteLength),
  });
  response.end();
}

function setupResult(ok: boolean, event: string, extra: Record<string, unknown> = {}): string {
  return `DEEPSEEK_SETUP_RESULT=${JSON.stringify({
    ok,
    event,
    configFile: CONFIG_FILE,
    ...extra,
  })}`;
}

function requestToken(request: IncomingMessage): string {
  const parsedUrl = new URL(request.url ?? "/", `http://${HOST}`);
  return parsedUrl.searchParams.get("token") ?? "";
}

async function main(): Promise<void> {
  let saved = false;
  let canceled = false;
  let pageActive = false;
  let lastHeartbeatAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const config = await readDeepSeekConfig();
  const hasExistingKey = Boolean(config.apiKey);
  const canEditApiKey = args.resetKey || !hasExistingKey;
  const settings = await readDeepSeekSettings();
  const timeoutMinutes = args.timeoutMinutes ?? DEFAULT_SETUP_TIMEOUT_MINUTES;
  const timeoutMs = timeoutMinutes * 60_000;
  const token = randomBytes(24).toString("base64url");

  const server = http.createServer(async (request, response) => {
    try {
      const parsedUrl = new URL(request.url ?? "/", `http://${HOST}`);

      if (parsedUrl.searchParams.get("token") !== token) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid setup token");
        return;
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        parsedUrl.pathname === "/assets/logo.png"
      ) {
        if (request.method === "HEAD") {
          await sendLogoHead(response);
          return;
        }
        await sendLogo(response);
        return;
      }

      if (request.method === "GET" && parsedUrl.pathname === "/") {
        pageActive = true;
        lastHeartbeatAt = Date.now();
        sendHtml(response, 200, pageHtml(token, settings, { canEditApiKey, hasExistingKey }));
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/heartbeat") {
        pageActive = true;
        lastHeartbeatAt = Date.now();
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/cancel") {
        if (!saved) {
          canceled = true;
          console.log(setupResult(false, "deepseek_setup_browser_closed"));
          response.writeHead(204, { "Cache-Control": "no-store" });
          response.end();
          setTimeout(() => server.close(), 50);
          return;
        }
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/save") {
        const body = await readBody(request);
        const form = new URLSearchParams(body);
        const apiKey = form.get("apiKey") ?? "";
        const model = form.get("model") ?? undefined;
        const thinking = form.get("thinking") ?? undefined;
        const temperature = form.get("temperature") ?? undefined;
        const maxTokens = form.get("maxTokens") ?? undefined;

        if ((form.get("token") ?? requestToken(request)) !== token) {
          response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Invalid setup token");
          return;
        }

        if (canEditApiKey) {
          await saveDeepSeekConfig(apiKey);
        }
        await saveDeepSeekSettings({ model, thinking, temperature, maxTokens });
        saved = true;
        sendHtml(response, 200, successHtml(token, { keySaved: canEditApiKey }));
        console.log(setupResult(true, canEditApiKey ? "deepseek_key_saved" : "deepseek_settings_saved"));
        setTimeout(() => server.close(), 1800);
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendHtml(response, 400, pageHtml(token, settings, { canEditApiKey, hasExistingKey }, message));
    }
  });

  server.listen(0, HOST, () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to determine setup server address.");
    }

    const url = `http://${HOST}:${address.port}/?token=${token}`;
    console.log(`DEEPSEEK_SETUP_URL=${url}`);
    console.log("Open this local URL in a browser, enter the API key, then return to Codex.");
    console.log(`Config file: ${CONFIG_FILE}`);
    console.log(`Settings file: ${SETTINGS_FILE}`);
  });

  const timeout = setTimeout(() => {
    if (!saved) {
      console.log(setupResult(false, "deepseek_setup_timeout", { timeoutMs }));
      console.error("Setup timed out before a key was saved.");
      server.close(() => process.exit(1));
    }
  }, timeoutMs);

  const heartbeatMonitor = setInterval(() => {
    if (saved || canceled || !pageActive) return;
    if (Date.now() - lastHeartbeatAt <= HEARTBEAT_GRACE_MS) return;

    canceled = true;
    console.log(
      setupResult(false, "deepseek_setup_browser_disconnected", {
        heartbeatGraceMs: HEARTBEAT_GRACE_MS,
      }),
    );
    console.error("Setup page stopped sending heartbeats before a key was saved.");
    server.close();
  }, HEARTBEAT_INTERVAL_MS);

  server.on("close", () => {
    clearTimeout(timeout);
    clearInterval(heartbeatMonitor);
    process.exit(saved ? 0 : 1);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
