import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = path.join(os.homedir(), ".config", "caffronix-agent-skills");

export const CONFIG_FILE = path.join(CONFIG_DIR, "deepseek.env");
export const SETTINGS_FILE = path.join(CONFIG_DIR, "deepseek.settings.json");

export const MODEL_OPTIONS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
export const THINKING_OPTIONS = ["enabled", "disabled"] as const;

export type DeepSeekSettings = {
  model: (typeof MODEL_OPTIONS)[number];
  thinking: (typeof THINKING_OPTIONS)[number];
  temperature: number;
  maxTokens: number;
};

export const DEFAULT_SETTINGS: DeepSeekSettings = {
  model: "deepseek-v4-flash",
  thinking: "enabled",
  temperature: 0.2,
  maxTokens: 10_240,
};

export const DEFAULT_SETUP_TIMEOUT_MINUTES = 10;

type DeepSeekConfig = {
  apiKey?: string;
};

function parseDeepSeekApiKey(content: string): string | undefined {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (key !== "DEEPSEEK_API_KEY") {
      continue;
    }

    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    return value;
  }

  return undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeModel(value: unknown): DeepSeekSettings["model"] {
  if (typeof value === "string" && MODEL_OPTIONS.includes(value as DeepSeekSettings["model"])) {
    return value as DeepSeekSettings["model"];
  }

  return DEFAULT_SETTINGS.model;
}

function normalizeThinking(value: unknown): DeepSeekSettings["thinking"] {
  if (
    typeof value === "string" &&
    THINKING_OPTIONS.includes(value as DeepSeekSettings["thinking"])
  ) {
    return value as DeepSeekSettings["thinking"];
  }

  return DEFAULT_SETTINGS.thinking;
}

function normalizeTemperature(value: unknown): number {
  const parsedValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;

  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 2) {
    return DEFAULT_SETTINGS.temperature;
  }

  return parsedValue;
}

function normalizeMaxTokens(value: unknown): number {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return DEFAULT_SETTINGS.maxTokens;
  }

  return parsedValue;
}

export async function readDeepSeekSettings(): Promise<DeepSeekSettings> {
  if (!(await fileExists(SETTINGS_FILE))) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const fileContent = await readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(fileContent) as Record<string, unknown>;

    return {
      model: normalizeModel(parsed.model),
      thinking: normalizeThinking(parsed.thinking),
      temperature: normalizeTemperature(parsed.temperature),
      maxTokens: normalizeMaxTokens(parsed.maxTokens),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveDeepSeekSettings(input: {
  model?: unknown;
  thinking?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
}): Promise<DeepSeekSettings> {
  const settings: DeepSeekSettings = {
    model: normalizeModel(input.model),
    thinking: normalizeThinking(input.thinking),
    temperature: normalizeTemperature(input.temperature),
    maxTokens: normalizeMaxTokens(input.maxTokens),
  };

  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await chmod(CONFIG_DIR, 0o700).catch(() => undefined);

  const tmpFile = `${SETTINGS_FILE}.${process.pid}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmpFile, 0o600).catch(() => undefined);
  await rename(tmpFile, SETTINGS_FILE);
  await chmod(SETTINGS_FILE, 0o600).catch(() => undefined);

  return settings;
}

export async function readDeepSeekConfig(): Promise<DeepSeekConfig> {
  const config: DeepSeekConfig = {};

  if (process.env.DEEPSEEK_API_KEY) {
    config.apiKey = process.env.DEEPSEEK_API_KEY;
  }

  if (!(await fileExists(CONFIG_FILE))) {
    return config;
  }

  const fileContent = await readFile(CONFIG_FILE, "utf8");

  config.apiKey ??= parseDeepSeekApiKey(fileContent);

  return config;
}

export async function saveDeepSeekConfig(apiKey: string): Promise<void> {
  const trimmedKey = apiKey.trim();

  if (!trimmedKey) {
    throw new Error("DeepSeek API key is empty.");
  }

  if (/\s/.test(trimmedKey)) {
    throw new Error("DeepSeek API key must not contain whitespace.");
  }

  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await chmod(CONFIG_DIR, 0o700).catch(() => undefined);

  const tmpFile = `${CONFIG_FILE}.${process.pid}.tmp`;
  const content = [
    "# Created by caffronix deepseek-task setup.",
    "# Do not paste this value into chat.",
    `DEEPSEEK_API_KEY=${trimmedKey}`,
    "",
  ].join("\n");

  await writeFile(tmpFile, content, { mode: 0o600 });
  await chmod(tmpFile, 0o600).catch(() => undefined);
  await rename(tmpFile, CONFIG_FILE);
  await chmod(CONFIG_FILE, 0o600).catch(() => undefined);
}

export async function getDeepSeekConfigStatus(): Promise<{
  configFile: string;
  hasEnvKey: boolean;
  hasConfigFile: boolean;
}> {
  return {
    configFile: CONFIG_FILE,
    hasEnvKey: Boolean(process.env.DEEPSEEK_API_KEY),
    hasConfigFile: await fileExists(CONFIG_FILE),
  };
}
