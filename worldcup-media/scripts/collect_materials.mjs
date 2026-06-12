#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const outDir = path.resolve(args["out-dir"] || args.outDir || args.out || defaultRunDir());
fs.mkdirSync(outDir, { recursive: true });

const inputItems = args.input ? readJsonArray(args.input) : [];
const cliItems = collectCliItems(args);
const records = [...inputItems, ...cliItems].map((item, index) => ({
  id: item.id || `raw_${String(index + 1).padStart(3, "0")}`,
  title: item.title || "",
  url: item.url || "",
  sourceName: item.sourceName || "",
  sourceType: item.sourceType || inferSourceType(item.url),
  publishedAt: item.publishedAt || "",
  eventDate: item.eventDate || "",
  people: ensureArray(item.people),
  teams: ensureArray(item.teams),
  matches: ensureArray(item.matches),
  tags: ensureArray(item.tags),
  summary: item.summary || item.excerpt || "",
  imageUrl: item.imageUrl || "",
  imagePageUrl: item.imagePageUrl || "",
  videoUrl: item.videoUrl || "",
  videoPageUrl: item.videoPageUrl || "",
  notes: item.notes || ""
}));

const output = {
  generatedAt: new Date().toISOString(),
  topic: args.topic || "",
  angle: args.angle || "",
  platform: args.platform || "",
  items: records
};

const outFile = path.join(outDir, "materials.raw.json");
fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(outFile);

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
  console.log(`Usage: node scripts/collect_materials.mjs [options]

Options:
  --topic <text>        Topic, player, team, or match
  --angle <text>        Story angle
  --platform <text>     Target platform
  --input <file>        JSON array or object with an items array
  --url <url>           Add one source URL from CLI
  --title <text>        Title for the CLI source
  --source-name <text>  Source name for the CLI source
  --out-dir <dir>       Output run directory
`);
}

function defaultRunDir() {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  return path.join(process.cwd(), "worldcup-media", "runs", stamp);
}

function readJsonArray(file) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  throw new Error("Input JSON must be an array or an object with an items array.");
}

function collectCliItems(parsed) {
  if (!parsed.url && !parsed.title) return [];
  return [
    {
      title: parsed.title || parsed.topic || "",
      url: parsed.url || "",
      sourceName: parsed["source-name"] || "",
      sourceType: parsed["source-type"] || "",
      tags: parsed.tags ? String(parsed.tags).split(",").map((tag) => tag.trim()).filter(Boolean) : []
    }
  ];
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function inferSourceType(url) {
  if (!url) return "other";
  const host = safeHost(url);
  if (host.includes("fifa.com")) return "official";
  if (host.includes("youtube.com") || host.includes("tiktok.com") || host.includes("bilibili.com")) return "video";
  if (host.includes("x.com") || host.includes("twitter.com") || host.includes("reddit.com")) return "social";
  return "news";
}

function safeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
