#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";

const HYPERFRAMES_VERSION = "0.6.90";
const args = parseArgs(process.argv.slice(2));

if (args.help || !args.input) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const inputPath = path.resolve(args.input);
if (!fs.existsSync(inputPath)) {
  throw new Error(`Voiceover text not found: ${inputPath}`);
}

const outputPath = path.resolve(args.output || path.join(path.dirname(inputPath), "voiceover.wav"));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const inputText = fs.readFileSync(inputPath, "utf8");
const provider = args.provider || (process.platform === "darwin" && hasCjk(inputText) ? "macos-say" : "hyperframes");

if (provider === "macos-say") {
  runMacosSay(inputPath, outputPath);
} else if (provider === "hyperframes") {
  runHyperframesTts(inputPath, outputPath);
} else {
  throw new Error(`Unsupported provider: ${provider}`);
}

console.log(outputPath);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        i += 1;
      }
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/tts_voiceover.mjs --input <voiceover.txt> [options]

Options:
  --output <file>  Output WAV path. Default: voiceover.wav beside input
  --provider <id>  hyperframes or macos-say. Default: macos-say for CJK text on macOS, otherwise hyperframes
  --voice <id>     HyperFrames voice ID. Default: af_nova
  --macos-voice    macOS say voice. Default: Tingting
  --speed <value>  Optional speech speed passed to HyperFrames TTS
`);
}

function runHyperframesTts(inputPath, outputPath) {
  const commandArgs = [
    "--yes",
    `hyperframes@${HYPERFRAMES_VERSION}`,
    "tts",
    inputPath,
    "--voice",
    args.voice || "af_nova",
    "--output",
    outputPath
  ];

  if (args.speed) {
    commandArgs.push("--speed", args.speed);
  }

  run("npx", commandArgs, path.dirname(inputPath), "hyperframes tts");
}

function runMacosSay(inputPath, outputPath) {
  if (process.platform !== "darwin") {
    throw new Error("macos-say provider is available only on macOS.");
  }

  const outputExt = path.extname(outputPath).toLowerCase();
  const sayOutput = outputExt === ".aiff" || outputExt === ".aif"
    ? outputPath
    : path.join(os.tmpdir(), `worldcup-voiceover-${process.pid}.aiff`);

  const sayArgs = ["-v", args["macos-voice"] || "Tingting", "-f", inputPath, "-o", sayOutput];
  run("say", sayArgs, path.dirname(inputPath), "macOS say");

  if (sayOutput !== outputPath) {
    run("ffmpeg", ["-y", "-i", sayOutput, outputPath], path.dirname(inputPath), "ffmpeg audio convert");
    fs.rmSync(sayOutput, { force: true });
  }
}

function run(command, commandArgs, cwd, label) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    env: process.env
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}
