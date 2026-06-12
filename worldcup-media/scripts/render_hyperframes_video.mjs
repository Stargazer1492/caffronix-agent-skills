#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const HYPERFRAMES_VERSION = "0.6.90";
const args = parseArgs(process.argv.slice(2));

if (args.help || !args.project) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const projectDir = path.resolve(args.project);
if (!fs.existsSync(path.join(projectDir, "index.html"))) {
  throw new Error(`HyperFrames project not found: ${projectDir}`);
}

runHyperframes(["lint"], projectDir);

if (!args["skip-inspect"]) {
  const inspectArgs = ["inspect", "--samples", args.samples || "8"];
  if (args["inspect-timeout"] || args.inspectTimeout) {
    inspectArgs.push("--timeout", args["inspect-timeout"] || args.inspectTimeout);
  }
  runHyperframes(inspectArgs, projectDir);
}

if (args.render || args.output) {
  fs.mkdirSync(path.join(projectDir, "renders"), { recursive: true });
  const output = args.output || path.join("renders", `${path.basename(projectDir)}.mp4`);
  const renderArgs = ["render", "--quality", args.quality || "draft", "--output", output];
  if (args.fps) renderArgs.push("--fps", args.fps);
  runHyperframes(renderArgs, projectDir);
  console.log(path.resolve(projectDir, output));
}

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
  console.log(`Usage: node scripts/render_hyperframes_video.mjs --project <project-dir> [options]

Options:
  --render              Render MP4 after lint and inspect
  --output <file>       Output path relative to project dir, or absolute path
  --quality <level>     draft, standard, or high. Default: draft
  --fps <number>        Optional frame rate
  --samples <number>    Inspect sample count. Default: 8
  --inspect-timeout <ms> Inspect runtime initialization timeout
  --skip-inspect        Run lint only before rendering
`);
}

function runHyperframes(commandArgs, cwd) {
  const result = spawnSync(
    "npx",
    ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...commandArgs],
    {
      cwd,
      stdio: "inherit",
      env: process.env
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`hyperframes ${commandArgs.join(" ")} failed with exit code ${result.status}`);
  }
}
