#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.input) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const inputPath = path.resolve(args.input);
const outDir = path.resolve(args["out-dir"] || args.outDir || args.out || path.dirname(inputPath));
fs.mkdirSync(outDir, { recursive: true });

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const rawItems = Array.isArray(raw) ? raw : raw.items || [];

const materials = {
  generatedAt: new Date().toISOString(),
  topic: raw.topic || args.topic || "",
  angle: raw.angle || args.angle || "",
  platform: raw.platform || args.platform || "",
  items: rawItems.map(normalizeItem)
};

const materialsPath = path.join(outDir, "materials.json");
const sourcesPath = path.join(outDir, "sources.md");
fs.writeFileSync(materialsPath, `${JSON.stringify(materials, null, 2)}\n`);
fs.writeFileSync(sourcesPath, renderSources(materials));

console.log(materialsPath);
console.log(sourcesPath);

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
  console.log(`Usage: node scripts/normalize_sources.mjs --input <materials.raw.json> [--out-dir <dir>]

Creates materials.json and sources.md with fact levels, source types, and usage risk.
`);
}

function normalizeItem(item, index) {
  const sourceType = item.sourceType || inferSourceType(item.url);
  const factLevel = item.factLevel || inferFactLevel(sourceType, item.url);
  const usageRisk = item.usageRisk || inferUsageRisk(item, sourceType);
  return {
    id: item.id || `src_${String(index + 1).padStart(3, "0")}`,
    title: clean(item.title),
    url: clean(item.url),
    sourceName: clean(item.sourceName) || inferSourceName(item.url),
    publishedAt: clean(item.publishedAt),
    eventDate: clean(item.eventDate),
    sourceType,
    factLevel,
    people: ensureArray(item.people),
    teams: ensureArray(item.teams),
    matches: ensureArray(item.matches),
    tags: ensureArray(item.tags),
    summary: clean(item.summary),
    imageUrl: clean(item.imageUrl),
    imagePageUrl: clean(item.imagePageUrl),
    videoUrl: clean(item.videoUrl),
    videoPageUrl: clean(item.videoPageUrl),
    usageRisk,
    notes: clean(item.notes)
  };
}

function renderSources(materials) {
  const lines = [
    "# Sources",
    "",
    `Generated: ${materials.generatedAt}`,
    `Topic: ${materials.topic || "unspecified"}`,
    `Angle: ${materials.angle || "unspecified"}`,
    `Platform: ${materials.platform || "unspecified"}`,
    ""
  ];

  for (const item of materials.items) {
    lines.push(`## ${item.id} ${item.title || "Untitled source"}`);
    lines.push("");
    lines.push(`- Source: ${item.sourceName || "unknown"}`);
    lines.push(`- URL: ${item.url || "missing"}`);
    lines.push(`- Published: ${item.publishedAt || "unknown"}`);
    lines.push(`- Event date: ${item.eventDate || "unknown"}`);
    lines.push(`- Type: ${item.sourceType}`);
    lines.push(`- Fact level: ${item.factLevel}`);
    lines.push(`- Usage risk: ${item.usageRisk}`);
    if (item.summary) lines.push(`- Summary: ${item.summary}`);
    if (item.imageUrl) lines.push(`- Image URL: ${item.imageUrl}`);
    if (item.imagePageUrl) lines.push(`- Image page: ${item.imagePageUrl}`);
    if (item.videoPageUrl) lines.push(`- Video page: ${item.videoPageUrl}`);
    if (item.tags.length) lines.push(`- Tags: ${item.tags.join(", ")}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function inferFactLevel(sourceType, url) {
  if (sourceType === "official" || safeHost(url).includes("fifa.com")) return "confirmed";
  if (sourceType === "news" || sourceType === "data") return "reported";
  if (sourceType === "social") return "social";
  return "unknown";
}

function inferUsageRisk(item, sourceType) {
  if (item.usageRisk) return item.usageRisk;
  if ((item.imageUrl && !item.imagePageUrl) || (item.videoUrl && !item.videoPageUrl)) return "high";
  if (sourceType === "official" || sourceType === "data") return "medium";
  if (sourceType === "social" || sourceType === "video" || sourceType === "image") return "high";
  return "medium";
}

function inferSourceType(url) {
  const host = safeHost(url);
  if (host.includes("fifa.com") || host.includes("the-afc.com") || host.includes("uefa.com")) return "official";
  if (host.includes("youtube.com") || host.includes("tiktok.com") || host.includes("bilibili.com")) return "video";
  if (host.includes("x.com") || host.includes("twitter.com") || host.includes("reddit.com")) return "social";
  if (host.includes("gettyimages") || host.includes("apimages") || host.includes("alamy")) return "image";
  return url ? "news" : "other";
}

function inferSourceName(url) {
  const host = safeHost(url);
  return host.replace(/^www\./, "");
}

function safeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}
