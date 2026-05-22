import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
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

function resultHtml(result: DeepSeekResult): string {
  const reasoning = result.reasoningContent.trim();

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
    }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 28px 16px;
      background:
        radial-gradient(circle at 32% 24%, rgb(34 211 255 / 16%), transparent 30%),
        radial-gradient(circle at 72% 30%, rgb(255 45 53 / 18%), transparent 34%),
        linear-gradient(135deg, #030712 0%, #071322 46%, #18050b 100%);
    }
    main {
      width: min(980px, 100%);
      margin: 0 auto;
    }
    header,
    section {
      background: rgb(11 18 35 / 94%);
      border: 1px solid rgb(34 211 255 / 22%);
      border-radius: 8px;
      box-shadow: 0 24px 80px rgb(0 0 0 / 34%);
    }
    header {
      padding: 22px 24px;
      margin-bottom: 16px;
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
    section {
      padding: 20px 22px;
      margin-top: 16px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 17px;
      letter-spacing: 0;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.65;
      font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #eef8ff;
    }
    .reasoning {
      border-color: rgb(255 45 53 / 28%);
    }
    button {
      margin-top: 16px;
      padding: 9px 13px;
      border: 0;
      border-radius: 6px;
      background: linear-gradient(90deg, var(--red), #ff5b2e);
      color: white;
      font: inherit;
      cursor: pointer;
    }
  </style>
  <script>
    function closeResult() {
      fetch("/close" + window.location.search, { method: "POST", keepalive: true }).finally(() => {
        window.open("", "_self");
        window.close();
      });
    }
  </script>
</head>
<body>
  <main>
    <header>
      <h1>DeepSeek Result</h1>
      <div class="meta">
        Model: ${escapeHtml(result.responseModel ?? result.requestedModel)}<br>
        Thinking: ${escapeHtml(result.thinking)} · Temperature: ${result.temperature} · Max tokens: ${result.maxTokens}
      </div>
      <button type="button" onclick="closeResult()">关闭结果页</button>
    </header>
    ${
      reasoning
        ? `<section class="reasoning"><h2>Thinking Content</h2><pre>${escapeHtml(reasoning)}</pre></section>`
        : ""
    }
    <section>
      <h2>Response Content</h2>
      <pre>${escapeHtml(result.content)}</pre>
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

function requestToken(request: IncomingMessage): string {
  const parsedUrl = new URL(request.url ?? "/", `http://${HOST}`);
  return parsedUrl.searchParams.get("token") ?? "";
}

async function serveResult(result: DeepSeekResult): Promise<void> {
  const token = randomBytes(24).toString("base64url");
  const html = resultHtml(result);

  await new Promise<void>((resolve, reject) => {
    let closed = false;
    const server = http.createServer((request, response) => {
      const parsedUrl = new URL(request.url ?? "/", `http://${HOST}`);

      if (requestToken(request) !== token) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid result token");
        return;
      }

      if (request.method === "GET" && parsedUrl.pathname === "/") {
        sendHtml(response, 200, html);
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/close") {
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        closed = true;
        setTimeout(() => {
          server.closeAllConnections();
          server.close(() => process.exit(0));
          setTimeout(() => process.exit(0), 100);
        }, 50);
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    });

    server.on("error", reject);
    server.on("close", () => resolve());

    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to determine result server address."));
        return;
      }

      const resultUrl = `http://${HOST}:${address.port}/?token=${token}`;
      console.log(
        `DEEPSEEK_RESULT=${JSON.stringify({
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
        })}`,
      );
      console.log(`DEEPSEEK_RESULT_URL=${resultUrl}`);
      console.log("Open this local URL in the Codex in-app Browser to show the DeepSeek result.");
    });

    setTimeout(() => {
      if (!closed) {
        console.log(
          `DEEPSEEK_RESULT_SERVER_CLOSED=${JSON.stringify({
            ok: true,
            event: "deepseek_result_server_timeout",
            timeoutMs: RESULT_SERVER_TIMEOUT_MS,
          })}`,
        );
        server.closeAllConnections();
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 100);
      }
    }, RESULT_SERVER_TIMEOUT_MS);
  });
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
    await serveResult(result);
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
