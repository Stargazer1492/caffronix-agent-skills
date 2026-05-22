import process from "node:process";
import OpenAI from "openai";
import {
  CONFIG_FILE,
  THINKING_OPTIONS,
  type DeepSeekSettings,
  readDeepSeekConfig,
  readDeepSeekSettings,
} from "./deepseek-config.js";

type DoctorOptions = {
  model?: string;
  thinking?: DeepSeekSettings["thinking"];
};

type DeepSeekChatRequest = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  thinking: {
    type: DeepSeekSettings["thinking"];
  };
};

function parseArgs(argv: string[]): DoctorOptions {
  let model: string | undefined;
  let thinking: DeepSeekSettings["thinking"] | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--model":
        if (!next) throw new Error("--model requires a value.");
        model = next;
        index += 1;
        break;
      case "--thinking":
        if (!next) throw new Error("--thinking requires a value.");
        if (!THINKING_OPTIONS.includes(next as DeepSeekSettings["thinking"])) {
          throw new Error("--thinking must be either enabled or disabled.");
        }
        thinking = next as DeepSeekSettings["thinking"];
        index += 1;
        break;
      case "--help":
      case "-h":
        console.log("Usage: npm run doctor -- [--model <name>] [--thinking enabled|disabled]");
        console.log("Defaults: saved settings or built-in DeepSeek defaults.");
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { model, thinking };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = await readDeepSeekConfig();
  const settings = await readDeepSeekSettings();
  const model = options.model ?? settings.model;
  const thinking = options.thinking ?? settings.thinking;

  if (!config.apiKey) {
    throw new Error(
      [
        "DeepSeek API key is not configured.",
        "Run `npm run setup` from the deepseek-task skill directory, or set DEEPSEEK_API_KEY in the environment.",
        `Config file path: ${CONFIG_FILE}`,
      ].join("\n"),
    );
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: "https://api.deepseek.com",
  });

  const request: DeepSeekChatRequest = {
    model,
    messages: [{ role: "user", content: "Reply exactly: deepseek-ok" }],
    thinking: { type: thinking },
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
  };

  const response = await client.chat.completions.create(request);

  const content = response.choices[0]?.message?.content?.trim() ?? "";

  if (content !== "deepseek-ok") {
    throw new Error(`DeepSeek health check returned unexpected content: ${JSON.stringify(content)}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      provider: "deepseek",
      model: response.model ?? model,
      settings: {
        requestedModel: model,
        thinking,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      },
      content,
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
