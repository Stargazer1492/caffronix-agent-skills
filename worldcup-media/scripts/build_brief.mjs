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

const materials = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const items = materials.items || [];
const topic = args.topic || materials.topic || "世界杯主题";
const angle = args.angle || materials.angle || "人物故事";
const platform = args.platform || materials.platform || "xiaohongshu";

const evidence = pickEvidence(items);
const cardPlan = buildCardPlan({ topic, angle, platform, evidence });
const videoStoryboard = buildVideoStoryboard({ topic, angle, evidence });
const brief = renderBrief({ topic, angle, platform, evidence, cardPlan, videoStoryboard });

fs.writeFileSync(path.join(outDir, "brief.md"), brief);
fs.writeFileSync(path.join(outDir, "card_plan.json"), `${JSON.stringify(cardPlan, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "video_storyboard.json"), `${JSON.stringify(videoStoryboard, null, 2)}\n`);

console.log(path.join(outDir, "brief.md"));
console.log(path.join(outDir, "card_plan.json"));
console.log(path.join(outDir, "video_storyboard.json"));

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
  console.log(`Usage: node scripts/build_brief.mjs --input <materials.json> [--out-dir <dir>]

Creates brief.md, card_plan.json, and video_storyboard.json.
`);
}

function pickEvidence(items) {
  const sorted = [...items].sort((a, b) => scoreItem(b) - scoreItem(a));
  return sorted.slice(0, 8);
}

function scoreItem(item) {
  const factScore = {
    confirmed: 4,
    reported: 3,
    inferred: 2,
    social: 1,
    unknown: 0
  }[item.factLevel] ?? 0;
  const riskPenalty = { low: 0, medium: 1, high: 2 }[item.usageRisk] ?? 1;
  return factScore * 10 - riskPenalty;
}

function buildCardPlan({ topic, angle, platform, evidence }) {
  return {
    platform,
    aspectRatio: platform === "wechat" ? "2.35:1" : "3:4",
    topic,
    angle,
    visualSystem: "Editorial Magazine x E-ink",
    pages: [
      page(1, "cover", `${topic}`, `围绕${angle}给出一个清楚判断。`, evidence.slice(0, 2)),
      page(2, "context", "先把背景讲清楚", "对象、比赛阶段、球队处境和时间线。", evidence.slice(0, 3)),
      page(3, "turning-point", "关键转折在哪里", "用一个比赛节点、报道节点或人物事件承接叙事。", evidence.slice(0, 3)),
      page(4, "evidence", "证据支持什么", "数据、采访、官方资料和媒体报道分开呈现。", evidence.slice(0, 4)),
      page(5, "debate", "争议和讨论边界", "把已确认事实、报道和社媒讨论分开。", evidence.filter((item) => item.factLevel === "social").slice(0, 2)),
      page(6, "close", "接下来重点看什么", "给出后续观察点，避免过度断言。", evidence.slice(0, 3))
    ]
  };
}

function page(pageNumber, type, headline, body, sources) {
  return {
    page: pageNumber,
    type,
    headline,
    body,
    sourceIds: sources.map((item) => item.id),
    assetIds: sources
      .filter((item) => item.imageUrl || item.videoUrl)
      .map((item) => item.id)
  };
}

function buildVideoStoryboard({ topic, angle, evidence }) {
  const segments = [
    segment("seg_001", 0, 5, "hook", `${topic}的关键问题，要放进完整时间线里看。`, "开场判断", evidence.slice(0, 1)),
    segment("seg_002", 5, 12, "context", `先看${angle}的背景和时间线。`, "背景和时间线", evidence.slice(0, 2)),
    segment("seg_003", 17, 16, "turning-point", "改变叙事的是这个节点。", "关键转折", evidence.slice(0, 3)),
    segment("seg_004", 33, 18, "evidence", "把官方信息、媒体报道和数据拆开看。", "证据层", evidence.slice(0, 4)),
    segment("seg_005", 51, 14, "debate", "社媒讨论能说明热度，不能直接当事实。", "讨论边界", evidence.filter((item) => item.factLevel === "social").slice(0, 2)),
    segment("seg_006", 65, 10, "close", "接下来要看的是下一场比赛和官方更新。", "后续观察", evidence.slice(0, 2))
  ];
  return {
    format: "vertical",
    aspectRatio: "9:16",
    durationSeconds: 75,
    topic,
    angle,
    segments
  };
}

function segment(id, start, duration, type, voiceover, onScreenText, sources) {
  return {
    id,
    start,
    duration,
    type,
    voiceover,
    onScreenText,
    visual: "授权明确时使用可追溯照片；授权不明时使用时间线、数据卡、地图或战术板。",
    sourceIds: sources.map((item) => item.id),
    assetIds: sources
      .filter((item) => item.imageUrl || item.videoUrl)
      .map((item) => item.id)
  };
}

function renderBrief({ topic, angle, platform, evidence, cardPlan, videoStoryboard }) {
  const lines = [
    "# Worldcup Media Brief",
    "",
    `Topic: ${topic}`,
    `Angle: ${angle}`,
    `Platform: ${platform}`,
    "",
    "## Core Evidence",
    ""
  ];

  if (!evidence.length) {
    lines.push("- No evidence yet. Collect and normalize sources before production.");
  } else {
    for (const item of evidence) {
      lines.push(`- ${item.id}: ${item.title || "Untitled"} (${item.factLevel}, ${item.usageRisk})`);
    }
  }

  lines.push("");
  lines.push("## Production Plan");
  lines.push("");
  lines.push(`- Cards: ${cardPlan.pages.length} pages, aspect ratio ${cardPlan.aspectRatio}.`);
  lines.push(`- Video: ${videoStoryboard.durationSeconds} seconds, ${videoStoryboard.segments.length} segments.`);
  lines.push("- Before publishing, recheck source dates, image usage risk, and any reported or social facts.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}
