#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.storyboard) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const storyboardPath = path.resolve(args.storyboard);
const storyboard = JSON.parse(fs.readFileSync(storyboardPath, "utf8"));
const segments = Array.isArray(storyboard.segments) ? storyboard.segments : [];
if (!segments.length) {
  throw new Error("Storyboard must include a non-empty segments array.");
}

const outDir = path.resolve(args["out-dir"] || args.outDir || args.out || path.dirname(storyboardPath));
fs.mkdirSync(outDir, { recursive: true });

const lines = segments
  .map((segment) => clean(segment.voiceover || segment.hook || segment.onScreenText))
  .filter(Boolean);

const scriptPath = path.join(outDir, args.output || "voiceover.txt");
fs.writeFileSync(scriptPath, `${lines.join("\n")}\n`);
console.log(scriptPath);

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
  console.log(`Usage: node scripts/build_voiceover_text.mjs --storyboard <video_storyboard.json> [options]

Options:
  --out-dir <dir>      Output directory
  --output <filename>  Output text filename. Default: voiceover.txt
`);
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}
