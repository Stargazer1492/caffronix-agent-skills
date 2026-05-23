import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import {
  DEFAULT_SETTINGS,
  CONFIG_FILE,
  THINKING_OPTIONS,
  type DeepSeekSettings,
  readDeepSeekConfig,
  readDeepSeekSettings,
} from "./deepseek-config.js";

const HOST = "127.0.0.1";
const RESULT_SERVER_TIMEOUT_MS = 10 * 60 * 1000;
const RESULT_PORT_START = 14920;
const RESULT_PORT_END = 14925;
const RESULT_READY_TIMEOUT_MS = 5_000;
const RESULT_SERVER_STATUS_PATH = "/__deepseek_task_result_status";
const RESULT_SERVER_SHUTDOWN_PATH = "/__deepseek_task_result_shutdown";
const LOGO_FILE = new URL("../assets/logo.png", import.meta.url);

type DisplayMode = "browser" | "command";

type Options = {
  prompt?: string;
  promptFile?: string;
  system?: string;
  systemFile?: string;
  model?: string;
  thinking?: DeepSeekSettings["thinking"];
  temperature?: number;
  maxTokens?: number;
  display: DisplayMode;
  json: boolean;
  serveResultFile?: string;
  readyFile?: string;
};

type DeepSeekChatRequest = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  thinking: {
    type: DeepSeekSettings["thinking"];
  };
};

type DeepSeekMessageWithReasoning = {
  content?: string | null;
  reasoning_content?: string | null;
};

type DeepSeekResult = {
  content: string;
  reasoningContent: string;
  id?: string;
  responseModel?: string;
  requestedModel: string;
  thinking: DeepSeekSettings["thinking"];
  temperature: number;
  maxTokens: number;
  usage?: unknown;
};

type ResultReady = {
  ok: true;
  event: "deepseek_result_ready";
  resultUrl: string;
  port: number;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run deepseek -- --prompt \"Summarize this.\"",
    "  cat prompt.md | npm run deepseek -- --system \"You are concise.\"",
    "",
    "Options:",
    "  --prompt <text>         User prompt.",
    "  --prompt-file <path>    Read user prompt from a file.",
    "  --system <text>         System instruction.",
    "  --system-file <path>    Read system instruction from a file.",
    `  --model <name>          DeepSeek model name. Default: saved setting or ${DEFAULT_SETTINGS.model}.`,
    `  --thinking <enabled|disabled> Thinking mode. Default: saved setting or ${DEFAULT_SETTINGS.thinking}.`,
    `  --temperature <number>  Sampling temperature. Default: saved setting or ${DEFAULT_SETTINGS.temperature}.`,
    `  --max-tokens <number>   max_tokens value. Default: saved setting or ${DEFAULT_SETTINGS.maxTokens}.`,
    "  --display <browser|command> Display mode. Default: browser.",
    "  --json                  Print JSON response metadata and content.",
  ].join("\n");
}

function parseArgs(argv: string[]): Options {
  const options: Options = { display: "browser", json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--prompt":
        if (!next) throw new Error("--prompt requires a value.");
        options.prompt = next;
        index += 1;
        break;
      case "--prompt-file":
        if (!next) throw new Error("--prompt-file requires a value.");
        options.promptFile = next;
        index += 1;
        break;
      case "--system":
        if (!next) throw new Error("--system requires a value.");
        options.system = next;
        index += 1;
        break;
      case "--system-file":
        if (!next) throw new Error("--system-file requires a value.");
        options.systemFile = next;
        index += 1;
        break;
      case "--model":
        if (!next) throw new Error("--model requires a value.");
        options.model = next;
        index += 1;
        break;
      case "--thinking":
        if (!next) throw new Error("--thinking requires a value.");
        if (!THINKING_OPTIONS.includes(next as DeepSeekSettings["thinking"])) {
          throw new Error("--thinking must be either enabled or disabled.");
        }
        options.thinking = next as DeepSeekSettings["thinking"];
        index += 1;
        break;
      case "--temperature":
        if (!next) throw new Error("--temperature requires a value.");
        options.temperature = Number(next);
        if (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2) {
          throw new Error("--temperature must be a number between 0 and 2.");
        }
        index += 1;
        break;
      case "--max-tokens":
        if (!next) throw new Error("--max-tokens requires a value.");
        options.maxTokens = Number.parseInt(next, 10);
        if (!Number.isInteger(options.maxTokens) || options.maxTokens <= 0) {
          throw new Error("--max-tokens must be a positive integer.");
        }
        index += 1;
        break;
      case "--display":
        if (!next) throw new Error("--display requires a value.");
        if (next !== "browser" && next !== "command") {
          throw new Error("--display must be either browser or command.");
        }
        options.display = next;
        index += 1;
        break;
      case "--browser":
        options.display = "browser";
        break;
      case "--command":
        options.display = "command";
        break;
      case "--json":
        options.json = true;
        break;
      case "--serve-result-file":
        if (!next) throw new Error("--serve-result-file requires a value.");
        options.serveResultFile = next;
        index += 1;
        break;
      case "--ready-file":
        if (!next) throw new Error("--ready-file requires a value.");
        options.readyFile = next;
        index += 1;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function readStdinIfAvailable(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function loadPrompt(options: Options): Promise<string> {
  if (options.prompt && options.promptFile) {
    throw new Error("Use either --prompt or --prompt-file, not both.");
  }

  if (options.prompt) {
    return options.prompt;
  }

  if (options.promptFile) {
    return readFile(options.promptFile, "utf8");
  }

  return readStdinIfAvailable();
}

async function loadSystem(options: Options): Promise<string | undefined> {
  if (options.system && options.systemFile) {
    throw new Error("Use either --system or --system-file, not both.");
  }

  if (options.system) {
    return options.system;
  }

  if (options.systemFile) {
    return readFile(options.systemFile, "utf8");
  }

  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let orderedList = false;
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    const tag = orderedList ? "ol" : "ul";
    html.push(`<${tag}>${listItems.join("")}</${tag}>`);
    listItems = [];
    orderedList = false;
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        html.push(`<pre class="code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
      } else {
        flushBlocks();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    if (/^\|/.test(trimmed) && isTableSeparator(lines[index + 1] ?? "")) {
      flushBlocks();
      const headers = trimmed
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\|/.test((lines[index] ?? "").trim())) {
        rows.push(
          (lines[index] ?? "")
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim()),
        );
        index += 1;
      }
      index -= 1;
      html.push(
        `<div class="table-wrap"><table><thead><tr>${headers
          .map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushBlocks();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = /^[-*+]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      const nextOrdered = Boolean(ordered);
      if (listItems.length && orderedList !== nextOrdered) {
        flushList();
      }
      orderedList = nextOrdered;
      listItems.push(`<li>${renderInlineMarkdown((ordered ?? unordered)?.[1] ?? "")}</li>`);
      continue;
    }

    const quote = /^>\s+(.+)$/.exec(trimmed);
    if (quote) {
      flushBlocks();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  if (inCodeBlock) {
    html.push(`<pre class="code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushBlocks();

  return html.join("\n");
}

function resultHtml(result: DeepSeekResult, token: string): string {
  const reasoning = result.reasoningContent.trim();
  const escapedToken = escapeHtml(token);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DeepSeek Result</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #050814;
      color: #f7fbff;
      --panel: #0b1223;
      --line: #1f3a58;
      --muted: #a9bdd3;
      --cyan: #22d3ff;
      --red: #ff2d35;
      --surface: rgb(11 18 35 / 94%);
    }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 18px 16px 28px;
      background:
        radial-gradient(circle at 32% 24%, rgb(34 211 255 / 16%), transparent 30%),
        radial-gradient(circle at 72% 30%, rgb(255 45 53 / 18%), transparent 34%),
        linear-gradient(135deg, #030712 0%, #071322 46%, #18050b 100%);
    }
    main {
      width: min(980px, 100%);
      margin: 0 auto;
    }
    .titlebar,
    section {
      background: var(--surface);
      border: 1px solid rgb(34 211 255 / 22%);
      border-radius: 8px;
      box-shadow: 0 24px 80px rgb(0 0 0 / 34%);
    }
    .titlebar {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 16px 18px;
      margin-bottom: 16px;
    }
    .brand-logo {
      width: 58px;
      height: 40px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid rgb(34 211 255 / 24%);
      box-shadow: 0 0 18px rgb(34 211 255 / 12%), 0 0 22px rgb(255 45 53 / 10%);
    }
    .title-copy {
      min-width: 0;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      letter-spacing: 0;
    }
    .meta {
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
    }
    .close-button {
      width: 36px;
      height: 36px;
      display: inline-grid;
      place-items: center;
      margin: 0;
      padding: 0;
      border: 1px solid rgb(255 45 53 / 34%);
      border-radius: 6px;
      background: rgb(69 16 24 / 64%);
      color: #fff1f2;
      font: 700 18px/1 ui-sans-serif, system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 0 0 22px rgb(255 45 53 / 18%);
    }
    .close-button:hover {
      background: rgb(255 45 53 / 22%);
    }
    section {
      padding: 20px 22px;
      margin-top: 16px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 17px;
      letter-spacing: 0;
    }
    .markdown {
      line-height: 1.65;
      color: #eef8ff;
    }
    .markdown > :first-child {
      margin-top: 0;
    }
    .markdown > :last-child {
      margin-bottom: 0;
    }
    .markdown h3,
    .markdown h4 {
      margin: 18px 0 8px;
      color: #f7fbff;
      letter-spacing: 0;
    }
    .markdown p,
    .markdown li,
    .markdown blockquote {
      color: #dcecff;
    }
    .markdown code {
      padding: 2px 5px;
      border-radius: 4px;
      background: rgb(34 211 255 / 10%);
      color: #c7f5ff;
      font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .code-block {
      margin: 12px 0;
      padding: 14px;
      overflow-x: auto;
      white-space: pre;
      border: 1px solid rgb(34 211 255 / 18%);
      border-radius: 6px;
      background: #050814;
    }
    .code-block code {
      padding: 0;
      background: transparent;
    }
    .table-wrap {
      overflow-x: auto;
      margin: 12px 0;
      border: 1px solid rgb(34 211 255 / 18%);
      border-radius: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 620px;
    }
    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid rgb(34 211 255 / 14%);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: #f7fbff;
      background: rgb(34 211 255 / 8%);
    }
    .reasoning {
      border-color: rgb(255 45 53 / 28%);
    }
    @media (max-width: 640px) {
      .titlebar {
        gap: 12px;
      }
      .brand-logo {
        width: 48px;
        height: 34px;
      }
      h1 {
        font-size: 20px;
      }
    }
  </style>
  <script>
    function closeResult() {
      fetch("/close" + window.location.search, { method: "POST", keepalive: true }).finally(() => {
        document.body.innerHTML = "";
        window.open("", "_self");
        window.close();
      });
    }
  </script>
</head>
<body>
  <main>
    <header class="titlebar">
      <img class="brand-logo" src="/assets/logo.png?token=${escapedToken}" alt="Caffronix logo">
      <div class="title-copy">
        <h1>DeepSeek Result</h1>
        <div class="meta">
          模型：${escapeHtml(result.responseModel ?? result.requestedModel)} · Thinking：${escapeHtml(result.thinking)} · Temperature：${result.temperature} · Max tokens：${result.maxTokens}
        </div>
      </div>
      <button class="close-button" type="button" onclick="closeResult()" aria-label="关闭结果页">X</button>
    </header>
    ${
      reasoning
        ? `<section class="reasoning"><h2>思考内容</h2><div class="markdown">${renderMarkdown(reasoning)}</div></section>`
        : ""
    }
    <section>
      <h2>回复内容</h2>
      <div class="markdown">${renderMarkdown(result.content)}</div>
    </section>
  </main>
</body>
</html>`;
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

function requestToken(request: IncomingMessage): string {
  const parsedUrl = new URL(request.url ?? "/", `http://${HOST}`);
  return parsedUrl.searchParams.get("token") ?? "";
}

function resultMetadata(result: DeepSeekResult, resultUrl: string): Record<string, unknown> {
  return {
    ok: true,
    event: "deepseek_result_ready",
    resultUrl,
    id: result.id,
    model: result.responseModel,
    settings: {
      requestedModel: result.requestedModel,
      thinking: result.thinking,
      temperature: result.temperature,
      maxTokens: result.maxTokens,
    },
    reasoningContent: result.reasoningContent,
    content: result.content,
    usage: result.usage,
  };
}

function localRequest(
  port: number,
  pathname: string,
  method: "GET" | "POST",
  timeoutMs = 300,
): Promise<{ statusCode?: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: HOST,
        port,
        path: pathname,
        method,
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out contacting local result server on port ${port}.`));
    });
    request.on("error", reject);
    request.end();
  });
}

async function shutdownExistingResultServers(): Promise<void> {
  const shutdowns: Promise<void>[] = [];

  for (let port = RESULT_PORT_START; port <= RESULT_PORT_END; port += 1) {
    shutdowns.push(
      (async () => {
        try {
          const status = await localRequest(port, RESULT_SERVER_STATUS_PATH, "GET");
          if (status.statusCode !== 200) return;

          const parsed = JSON.parse(status.body) as { server?: unknown };
          if (parsed.server !== "deepseek-task-result") return;

          await localRequest(port, RESULT_SERVER_SHUTDOWN_PATH, "POST").catch(() => undefined);
        } catch {
          // Ignore ports that are closed or occupied by unrelated processes.
        }
      })(),
    );
  }

  await Promise.all(shutdowns);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

function createResultServer(result: DeepSeekResult, token: string, html: string): http.Server {
  const server = http.createServer((request, response) => {
    const parsedUrl = new URL(request.url ?? "/", `http://${HOST}`);

    if (request.method === "GET" && parsedUrl.pathname === RESULT_SERVER_STATUS_PATH) {
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(
        JSON.stringify({
          ok: true,
          server: "deepseek-task-result",
          portRange: [RESULT_PORT_START, RESULT_PORT_END],
        }),
      );
      return;
    }

    if (request.method === "POST" && parsedUrl.pathname === RESULT_SERVER_SHUTDOWN_PATH) {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      setTimeout(() => {
        serverCloseAndExit(server);
      }, 50);
      return;
    }

    if (requestToken(request) !== token) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Invalid result token");
      return;
    }

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      parsedUrl.pathname === "/assets/logo.png"
    ) {
      const sendAsset = request.method === "HEAD" ? sendLogoHead : sendLogo;
      void sendAsset(response).catch(() => {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Logo not found");
      });
      return;
    }

    if (request.method === "GET" && parsedUrl.pathname === "/") {
      sendHtml(response, 200, html);
      return;
    }

    if (request.method === "POST" && parsedUrl.pathname === "/close") {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      setTimeout(() => {
        serverCloseAndExit(server);
      }, 50);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  return server;
}

function serverCloseAndExit(server: http.Server): void {
  server.closeAllConnections();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 100);
}

function listenOnPort(server: http.Server, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      if (error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(true);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

async function listenInResultPortRange(
  result: DeepSeekResult,
  token: string,
  html: string,
): Promise<{ server: http.Server; port: number }> {
  for (let port = RESULT_PORT_START; port <= RESULT_PORT_END; port += 1) {
    const server = createResultServer(result, token, html);
    if (await listenOnPort(server, port)) {
      return { server, port };
    }
    server.close();
  }

  throw new Error(
    `No available DeepSeek result server port in range ${RESULT_PORT_START}-${RESULT_PORT_END}.`,
  );
}

async function serveResult(result: DeepSeekResult, readyFile?: string): Promise<void> {
  await shutdownExistingResultServers();

  const token = randomBytes(24).toString("base64url");
  const html = resultHtml(result, token);

  await new Promise<void>((resolve, reject) => {
    void listenInResultPortRange(result, token, html)
      .then(async ({ server, port }) => {
        server.on("error", reject);
        server.on("close", () => resolve());

        const resultUrl = `http://${HOST}:${port}/?token=${token}`;
        const ready: ResultReady = {
          ok: true,
          event: "deepseek_result_ready",
          resultUrl,
          port,
        };

        setTimeout(() => {
          if (!readyFile) {
            console.log(
              `DEEPSEEK_RESULT_SERVER_CLOSED=${JSON.stringify({
                ok: true,
                event: "deepseek_result_server_timeout",
                timeoutMs: RESULT_SERVER_TIMEOUT_MS,
              })}`,
            );
          }
          serverCloseAndExit(server);
        }, RESULT_SERVER_TIMEOUT_MS);

        if (readyFile) {
          await writeFile(readyFile, `${JSON.stringify(ready)}\n`, { mode: 0o600 });
          return;
        }

        console.log(`DEEPSEEK_RESULT=${JSON.stringify(resultMetadata(result, resultUrl))}`);
        console.log(`DEEPSEEK_RESULT_URL=${resultUrl}`);
        console.log("Open this local URL in the Codex in-app Browser to show the DeepSeek result.");
      })
      .catch(reject);
  });
}

async function readResultFile(resultFile: string): Promise<DeepSeekResult> {
  const content = await readFile(resultFile, "utf8");
  await unlink(resultFile).catch(() => undefined);
  return JSON.parse(content) as DeepSeekResult;
}

async function waitForReadyFile(readyFile: string): Promise<ResultReady> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < RESULT_READY_TIMEOUT_MS) {
    try {
      const content = await readFile(readyFile, "utf8");
      await unlink(readyFile).catch(() => undefined);
      return JSON.parse(content) as ResultReady;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error("Timed out waiting for the DeepSeek result server to start.");
}

function tempJsonFile(prefix: string): string {
  const suffix = `${process.pid}-${Date.now()}-${randomBytes(8).toString("hex")}.json`;
  return path.join(tmpdir(), `${prefix}-${suffix}`);
}

async function startDetachedResultServer(result: DeepSeekResult): Promise<void> {
  await shutdownExistingResultServers();

  const resultFile = tempJsonFile("deepseek-task-result");
  const readyFile = tempJsonFile("deepseek-task-ready");
  await writeFile(resultFile, `${JSON.stringify(result)}\n`, { mode: 0o600 });

  const scriptPath = process.argv[1] ?? fileURLToPath(import.meta.url);
  const child = spawn(
    process.execPath,
    [
      ...process.execArgv,
      scriptPath,
      "--serve-result-file",
      resultFile,
      "--ready-file",
      readyFile,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: "ignore",
    },
  );

  child.unref();

  try {
    const ready = await waitForReadyFile(readyFile);
    console.log(`DEEPSEEK_RESULT=${JSON.stringify(resultMetadata(result, ready.resultUrl))}`);
    console.log(`DEEPSEEK_RESULT_URL=${ready.resultUrl}`);
    console.log("Open this local URL in the Codex in-app Browser to show the DeepSeek result.");
  } catch (error) {
    await unlink(resultFile).catch(() => undefined);
    await unlink(readyFile).catch(() => undefined);
    throw error;
  }
}

function resultJson(result: DeepSeekResult): string {
  return JSON.stringify(
    {
      id: result.id,
      model: result.responseModel,
      settings: {
        requestedModel: result.requestedModel,
        thinking: result.thinking,
        temperature: result.temperature,
        maxTokens: result.maxTokens,
      },
      reasoningContent: result.reasoningContent,
      content: result.content,
      usage: result.usage,
    },
    null,
    2,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.serveResultFile) {
    const result = await readResultFile(options.serveResultFile);
    await serveResult(result, options.readyFile);
    return;
  }

  const config = await readDeepSeekConfig();
  const settings = await readDeepSeekSettings();

  if (!config.apiKey) {
    throw new Error(
      [
        "DeepSeek API key is not configured.",
        "Run `npm run setup` from the deepseek-task skill directory, or set DEEPSEEK_API_KEY in the environment.",
        `Config file path: ${CONFIG_FILE}`,
      ].join("\n"),
    );
  }

  const prompt = (await loadPrompt(options)).trim();
  if (!prompt) {
    throw new Error(`Prompt is empty.\n\n${usage()}`);
  }

  const system = await loadSystem(options);
  const model = options.model ?? settings.model;
  const thinking = options.thinking ?? settings.thinking;
  const temperature = options.temperature ?? settings.temperature;
  const maxTokens = options.maxTokens ?? settings.maxTokens;

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: "https://api.deepseek.com",
  });

  const request: DeepSeekChatRequest = {
    model,
    messages: [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user" as const, content: prompt },
    ],
    thinking: { type: thinking },
    temperature,
    max_tokens: maxTokens,
  };

  const response = await client.chat.completions.create(request);

  const message = response.choices[0]?.message as DeepSeekMessageWithReasoning | undefined;
  const content = message?.content ?? "";
  const reasoningContent = message?.reasoning_content ?? "";
  const result: DeepSeekResult = {
    id: response.id,
    responseModel: response.model,
    requestedModel: model,
    thinking,
    temperature,
    maxTokens,
    reasoningContent,
    content,
    usage: response.usage,
  };

  if (options.display === "browser") {
    await startDetachedResultServer(result);
    return;
  }

  if (options.json) {
    console.log(resultJson(result));
    return;
  }

  process.stdout.write(content);
  if (!content.endsWith("\n")) {
    process.stdout.write("\n");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
