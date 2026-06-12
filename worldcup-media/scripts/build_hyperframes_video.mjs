#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const HYPERFRAMES_VERSION = "0.6.90";

const args = parseArgs(process.argv.slice(2));
const WIDTH = Math.max(320, Number(args.width || 1080));
const HEIGHT = Math.max(320, Number(args.height || 1920));

if (args.help || !args.storyboard) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const storyboardPath = path.resolve(args.storyboard);
const materialsPath = args.materials ? path.resolve(args.materials) : "";
const storyboard = readJson(storyboardPath);
const materials = materialsPath && fs.existsSync(materialsPath) ? readJson(materialsPath) : { items: [] };
const projectName = slug(args.name || storyboard.topic || "worldcup-video");
const outDir = path.resolve(args["out-dir"] || args.outDir || args.out || path.join(path.dirname(storyboardPath), "hyperframes-video"));
const projectDir = path.join(outDir, projectName);

fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(path.join(projectDir, "assets"), { recursive: true });

const model = normalizeStoryboard(storyboard, materials, args);
await prepareImageAssets(projectDir, model);
writeProject(projectDir, projectName, model);

console.log(projectDir);

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
  console.log(`Usage: node scripts/build_hyperframes_video.mjs --storyboard <video_storyboard.json> [options]

Options:
  --materials <materials.json>  Optional normalized source list
  --out-dir <dir>               Output directory for the generated project
  --name <text>                 Project name
  --audio <file>                Optional voiceover audio file copied into assets/
  --duration <seconds>          Override duration
  --layout <card|poster>        Visual layout. Default: card
  --width <px>                  Composition width. Default: 1080
  --height <px>                 Composition height. Default: 1920
  --show-source-labels          Show source labels on poster pages

Output:
  <out-dir>/<project-name>/ with index.html, package.json, hyperframes.json, meta.json, DESIGN.md.
`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeStoryboard(storyboard, materials, parsedArgs) {
  const rawSegments = Array.isArray(storyboard.segments) ? storyboard.segments : [];
  if (!rawSegments.length) {
    throw new Error("Storyboard must include a non-empty segments array.");
  }

  const segments = rawSegments.map((segment, index) => {
    const start = toNumber(segment.start, index === 0 ? 0 : undefined);
    const duration = Math.max(1, toNumber(segment.duration, 8));
    const sourceIds = ensureArray(segment.sourceIds);
    const sourceItems = sourceIds
      .map((id) => findMaterial(materials, id))
      .filter(Boolean);
    return {
      id: slug(segment.id || `seg-${index + 1}`),
      index,
      start,
      duration,
      type: clean(segment.type || "scene"),
      hook: clean(segment.hook || ""),
      voiceover: clean(segment.voiceover || ""),
      posterText: clean(segment.posterText || ""),
      onScreenText: clean(segment.onScreenText || segment.hook || ""),
      visual: clean(segment.visual || ""),
      layout: clean(segment.layout || parsedArgs.layout || storyboard.layout || "card"),
      showSourceLabels: Boolean(parsedArgs["show-source-labels"] || storyboard.showSourceLabels || segment.showSourceLabels),
      sourceIds,
      assetIds: ensureArray(segment.assetIds),
      sourceItems,
      imageAsset: "",
      imageCredit: ""
    };
  });

  for (let index = 0; index < segments.length; index += 1) {
    if (!Number.isFinite(segments[index].start)) {
      const previous = segments[index - 1];
      segments[index].start = previous ? previous.start + previous.duration : 0;
    }
  }

  segments.sort((a, b) => a.start - b.start);

  const computedDuration = segments.reduce((max, segment) => Math.max(max, segment.start + segment.duration), 0);
  const duration = Math.max(1, toNumber(parsedArgs.duration, storyboard.durationSeconds || computedDuration));
  const audioAsset = parsedArgs.audio ? copyAudioAsset(parsedArgs.audio) : "";

  return {
    topic: clean(storyboard.topic || parsedArgs.topic || "世界杯故事"),
    angle: clean(storyboard.angle || parsedArgs.angle || "足球故事"),
    format: clean(storyboard.format || "vertical"),
    aspectRatio: clean(storyboard.aspectRatio || "9:16"),
    layout: clean(parsedArgs.layout || storyboard.layout || "card"),
    showSourceLabels: Boolean(parsedArgs["show-source-labels"] || storyboard.showSourceLabels),
    duration,
    segments,
    materials: Array.isArray(materials.items) ? materials.items : [],
    audioAsset
  };
}

async function prepareImageAssets(projectDir, model) {
  const cache = new Map();
  for (const segment of model.segments) {
    const imageSource = firstImageSource(segment.sourceItems);
    if (!imageSource) continue;
    const assetPath = await copyOrDownloadImage(projectDir, imageSource, cache);
    if (!assetPath) continue;
    segment.imageAsset = assetPath;
    segment.imageCredit = `${imageSource.id || "source"} ${imageSource.sourceName || imageSource.imagePageUrl || imageSource.url || "image"}`;
  }
}

function firstImageSource(sourceItems) {
  return sourceItems.find((item) => clean(item.imageUrl));
}

async function copyOrDownloadImage(projectDir, source, cache) {
  const imageUrl = clean(source.imageUrl);
  if (!imageUrl) return "";
  if (cache.has(imageUrl)) return cache.get(imageUrl);

  const assetsDir = path.join(projectDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const hash = crypto.createHash("sha1").update(imageUrl).digest("hex").slice(0, 10);
  const baseName = `image-${slug(source.id || source.sourceName || "source")}-${hash}`;

  try {
    if (isLocalFile(imageUrl)) {
      const resolved = imageUrl.startsWith("file://") ? new URL(imageUrl) : path.resolve(imageUrl);
      const ext = imageExtension(path.extname(resolved.pathname || resolved));
      const fileName = `${baseName}${ext}`;
      fs.copyFileSync(resolved, path.join(assetsDir, fileName));
      const relative = `assets/${fileName}`;
      cache.set(imageUrl, relative);
      return relative;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; worldcup-media-skill/1.0)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: clean(source.imagePageUrl || source.url)
      }
    });
    clearTimeout(timer);
    if (!response.ok) {
      cache.set(imageUrl, "");
      return "";
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      cache.set(imageUrl, "");
      return "";
    }
    const ext = imageExtension(contentTypeToExt(contentType) || path.extname(new URL(imageUrl).pathname));
    const fileName = `${baseName}${ext}`;
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(path.join(assetsDir, fileName), Buffer.from(arrayBuffer));
    const relative = `assets/${fileName}`;
    cache.set(imageUrl, relative);
    return relative;
  } catch {
    cache.set(imageUrl, "");
    return "";
  }
}

function isLocalFile(value) {
  return value.startsWith("/") || value.startsWith("file://");
}

function contentTypeToExt(contentType) {
  const lower = contentType.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return ".jpg";
  if (lower.includes("png")) return ".png";
  if (lower.includes("webp")) return ".webp";
  if (lower.includes("gif")) return ".gif";
  if (lower.includes("svg")) return ".svg";
  return "";
}

function imageExtension(ext) {
  const cleaned = clean(ext).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(cleaned)) {
    return cleaned === ".jpeg" ? ".jpg" : cleaned;
  }
  return ".jpg";
}

function copyAudioAsset(audioPath) {
  const resolved = path.resolve(audioPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Audio file not found: ${resolved}`);
  }
  return path.basename(resolved);
}

function writeProject(projectDir, projectName, model) {
  if (args.audio) {
    fs.copyFileSync(path.resolve(args.audio), path.join(projectDir, "assets", model.audioAsset));
  }

  fs.writeFileSync(path.join(projectDir, "index.html"), renderIndex(model));
  fs.writeFileSync(path.join(projectDir, "package.json"), `${JSON.stringify(packageJson(projectName), null, 2)}\n`);
  fs.writeFileSync(path.join(projectDir, "hyperframes.json"), `${JSON.stringify(hyperframesJson(), null, 2)}\n`);
  fs.writeFileSync(path.join(projectDir, "meta.json"), `${JSON.stringify(metaJson(projectName), null, 2)}\n`);
  fs.writeFileSync(path.join(projectDir, "DESIGN.md"), renderDesign(model));
  fs.writeFileSync(path.join(projectDir, "storyboard.input.json"), `${JSON.stringify(model, null, 2)}\n`);
}

function packageJson(projectName) {
  return {
    name: projectName,
    private: true,
    type: "module",
    scripts: {
      dev: `npx --yes hyperframes@${HYPERFRAMES_VERSION} preview`,
      lint: `npx --yes hyperframes@${HYPERFRAMES_VERSION} lint`,
      inspect: `npx --yes hyperframes@${HYPERFRAMES_VERSION} inspect`,
      check: `npm run lint && npm run inspect`,
      render: `npx --yes hyperframes@${HYPERFRAMES_VERSION} render`,
      "render:draft": `npx --yes hyperframes@${HYPERFRAMES_VERSION} render --quality draft --output renders/${projectName}.mp4`
    }
  };
}

function hyperframesJson() {
  return {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: {
      blocks: "compositions",
      components: "compositions/components",
      assets: "assets"
    }
  };
}

function metaJson(projectName) {
  return {
    id: projectName,
    name: projectName,
    createdAt: new Date().toISOString()
  };
}

function renderDesign(model) {
  return `# Design

## Style Prompt

世界杯编辑部风格，竖屏短视频，纸张质感、深色墨水、球场绿色、金色重点和克制红色提示。画面以时间线、数据卡、地图感线条和大标题为主，避免伪造新闻现场。

## Colors

- Paper: #F4F0E8
- Ink: #151515
- Grass: #1F7A4C
- Line: #C8BCA8
- Alert: #B3261E
- Gold: #C8A24A

## Typography

- Headline: system sans-serif, condensed weight when available
- Body: system sans-serif
- Numbers: tabular numerals

## Motion

- Entrance uses y, x, scale and opacity.
- Transitions use a field-green wipe between scenes.
- Final scene fades out after the closing observation.

## What To Avoid

- Generated images that look like real players or real match photos.
- Unlicensed broadcast footage in public output.
- Claims without source IDs.
- Dense subtitles that exceed two lines.

## Content

- Topic: ${model.topic}
- Angle: ${model.angle}
- Duration: ${model.duration}s
`;
}

function renderIndex(model) {
  const duration = formatNumber(model.duration);
  const scenes = model.segments.map((segment, index) => renderScene(segment, index)).join("\n");
  const transitions = model.segments.slice(1).map((segment, index) => renderTransition(segment, index)).join("\n");
  const audio = model.audioAsset
    ? `<audio id="voiceover" data-start="0" data-duration="${duration}" data-track-index="20" src="assets/${escapeAttr(model.audioAsset)}" data-volume="1"></audio>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      html,
      body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        overflow: hidden;
        background: #151515;
      }

      body {
        font-family: sans-serif;
        color: #151515;
      }

      #root {
        position: relative;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        overflow: hidden;
        background: #f4f0e8;
      }

      .scene {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background:
          radial-gradient(circle at 20% 14%, rgba(200, 162, 74, 0.22), transparent 28%),
          linear-gradient(135deg, rgba(31, 122, 76, 0.16), rgba(244, 240, 232, 0) 38%),
          #f4f0e8;
      }

      .scene::before {
        content: "";
        position: absolute;
        inset: 76px;
        border: 2px solid rgba(31, 122, 76, 0.28);
        border-radius: 28px;
      }

      .scene::after {
        content: "";
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(21, 21, 21, 0.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(21, 21, 21, 0.035) 1px, transparent 1px);
        background-size: 48px 48px;
        opacity: 0.6;
        pointer-events: none;
      }

      .scene-content {
        position: relative;
        z-index: 2;
        width: 100%;
        height: 100%;
        padding: 132px 92px 118px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 36px;
      }

      .topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        color: #1f7a4c;
        font-size: 28px;
        font-weight: 780;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .scene-number {
        color: #b3261e;
        font-variant-numeric: tabular-nums;
      }

      .headline {
        max-width: 880px;
        color: #151515;
        font-size: 96px;
        line-height: 0.98;
        letter-spacing: 0;
        font-weight: 900;
      }

      .voiceover {
        max-width: 850px;
        color: #151515;
        font-size: 44px;
        line-height: 1.22;
        font-weight: 650;
      }

      .visual-card {
        display: grid;
        grid-template-columns: 128px 1fr;
        gap: 28px;
        align-items: center;
        width: 100%;
        min-height: 250px;
        padding: 32px;
        border: 2px solid rgba(21, 21, 21, 0.18);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.48);
      }

      .visual-card.has-image {
        display: block;
        min-height: 610px;
        padding: 0;
        overflow: hidden;
        background: #151515;
      }

      .image-frame {
        position: relative;
        width: 100%;
        height: 510px;
        overflow: hidden;
        background: #151515;
      }

      .image-photo {
        width: 100%;
        height: 100%;
        display: block;
        background-position: center;
        background-size: cover;
        background-repeat: no-repeat;
      }

      .image-frame::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(21, 21, 21, 0) 46%, rgba(21, 21, 21, 0.72) 100%);
        pointer-events: none;
      }

      .image-caption {
        position: absolute;
        left: 28px;
        right: 28px;
        bottom: 22px;
        z-index: 2;
        color: #f4f0e8;
        font-size: 22px;
        line-height: 1.14;
        font-weight: 700;
      }

      .visual-card.has-image .visual-text {
        padding: 24px 30px 28px;
        color: #f4f0e8;
        font-size: 28px;
        line-height: 1.25;
        background: #151515;
      }

      .pitch-mark {
        width: 128px;
        height: 180px;
        border: 4px solid #1f7a4c;
        border-radius: 56px;
        position: relative;
      }

      .pitch-mark::before,
      .pitch-mark::after {
        content: "";
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        border: 3px solid #1f7a4c;
      }

      .pitch-mark::before {
        top: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
      }

      .pitch-mark::after {
        bottom: 26px;
        width: 72px;
        height: 36px;
        border-radius: 36px 36px 0 0;
        border-bottom: 0;
      }

      .visual-text {
        color: #151515;
        font-size: 32px;
        line-height: 1.28;
        font-weight: 560;
      }

      .sources {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .source-pill {
        max-width: 420px;
        padding: 10px 14px;
        border: 1px solid rgba(21, 21, 21, 0.24);
        border-radius: 999px;
        color: #151515;
        background: rgba(244, 240, 232, 0.76);
        font-size: 22px;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .transition {
        position: absolute;
        inset: 0;
        z-index: 8;
        background: #1f7a4c;
        transform-origin: left center;
      }

      .transition-label {
        position: absolute;
        left: 96px;
        bottom: 104px;
        color: #f4f0e8;
        font-size: 34px;
        font-weight: 800;
      }

      .scene.poster-layout {
        background: #111;
      }

      .scene.poster-layout::before,
      .scene.poster-layout::after {
        display: none;
      }

      .poster-photo {
        position: absolute;
        inset: 0;
        z-index: 0;
        background-position: center top;
        background-size: cover;
        background-repeat: no-repeat;
      }

      .poster-photo::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.16) 32%, rgba(0, 0, 0, 0.22) 58%, rgba(0, 0, 0, 0.88) 100%),
          linear-gradient(90deg, rgba(0, 0, 0, 0.50) 0%, rgba(0, 0, 0, 0.04) 48%, rgba(0, 0, 0, 0.32) 100%);
        pointer-events: none;
      }

      .poster-content {
        position: relative;
        z-index: 2;
        width: 100%;
        height: 100%;
        padding: ${HEIGHT <= 1500 ? "64px 70px 62px" : "88px 74px 82px"};
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 0;
        color: #f7f1e7;
      }

      .poster-main {
        display: flex;
        flex-direction: column;
        gap: 18px;
        max-width: 930px;
      }

      .poster-title {
        max-width: 920px;
        font-size: ${HEIGHT <= 1500 ? "82px" : "104px"};
        line-height: 0.92;
        font-weight: 930;
        letter-spacing: 0;
        color: #fff8ec;
        text-shadow: 0 4px 30px rgba(0, 0, 0, 0.48);
      }

      .scene-cover .poster-title {
        font-size: ${HEIGHT <= 1500 ? "92px" : "118px"};
        line-height: 0.9;
      }

      .poster-caption {
        max-width: 860px;
        padding-left: 24px;
        border-left: 8px solid #f3c74f;
        color: #fff8ec;
        font-size: ${HEIGHT <= 1500 ? "34px" : "38px"};
        line-height: 1.18;
        font-weight: 760;
        text-shadow: 0 4px 24px rgba(0, 0, 0, 0.58);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .poster-voice {
        max-width: 900px;
        color: #f7f1e7;
        margin-top: 34px;
        font-size: ${HEIGHT <= 1500 ? "34px" : "38px"};
        line-height: 1.2;
        font-weight: 760;
        text-shadow: 0 4px 22px rgba(0, 0, 0, 0.62);
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .poster-debug-source {
        position: absolute;
        left: 70px;
        top: 64px;
        max-width: 620px;
        color: rgba(247, 241, 231, 0.76);
        font-size: 22px;
        line-height: 1.1;
        font-weight: 800;
      }

      ${model.segments.map((segment) => cssAccent(segment)).join("\n")}
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${duration}"
      data-width="${WIDTH}"
      data-height="${HEIGHT}"
    >
${scenes}
${transitions}
${audio}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
${renderTimeline(model)}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

function renderScene(segment, index) {
  if (segment.imageAsset && segment.layout === "poster") {
    return renderPosterScene(segment, index);
  }
  const start = formatNumber(segment.start);
  const duration = formatNumber(segment.duration);
  const sourcePills = renderSourcePills(segment);
  const visual = renderVisual(segment);
  return `      <section id="scene-${segment.id}" class="clip scene scene-${segment.id}" data-start="${start}" data-duration="${duration}" data-track-index="${index + 1}">
        <div class="scene-content">
          <div class="topline">
            <span>${escapeHtml(typeLabel(segment.type))}</span>
            <span class="scene-number">${String(index + 1).padStart(2, "0")}</span>
          </div>
          <div class="headline">${escapeHtml(segment.onScreenText || segment.hook || "世界杯故事")}</div>
${visual}
          <div class="voiceover">${escapeHtml(segment.voiceover || segment.hook || "")}</div>
          <div class="sources">${sourcePills}</div>
        </div>
      </section>`;
}

function renderPosterScene(segment, index) {
  const start = formatNumber(segment.start);
  const duration = formatNumber(segment.duration);
  const isCover = segment.type === "cover" || index === 0;
  const debugSource = segment.showSourceLabels
    ? `<div class="poster-debug-source">${escapeHtml(segment.imageCredit || renderSourceText(segment))}</div>`
    : "";
  return `      <section id="scene-${segment.id}" class="clip scene poster-layout ${isCover ? "scene-cover" : ""} scene-${segment.id}" data-start="${start}" data-duration="${duration}" data-track-index="${index + 1}">
        <div class="poster-photo" style="background-image: url('${escapeAttr(segment.imageAsset)}')"></div>
        <div class="poster-content">
          ${debugSource}
          <div class="poster-main">
            <div class="poster-title">${escapeHtml(segment.onScreenText || segment.hook || "世界杯故事")}</div>
            <div class="poster-caption">${escapeHtml(segment.visual || "可追溯图片素材")}</div>
            <div class="poster-voice">${escapeHtml(segment.posterText || segment.voiceover || segment.hook || "")}</div>
          </div>
        </div>
      </section>`;
}

function renderVisual(segment) {
  const visualText = escapeHtml(segment.visual || segment.voiceover || "使用可核验来源和编辑化图形。");
  if (segment.imageAsset) {
    return `          <div class="visual-card has-image">
            <div class="image-frame">
              <div class="image-photo" style="background-image: url('${escapeAttr(segment.imageAsset)}')"></div>
              <div class="image-caption">${escapeHtml(segment.imageCredit || "可追溯图片素材")}</div>
            </div>
            <div class="visual-text">${visualText}</div>
          </div>`;
  }
  return `          <div class="visual-card">
            <div class="pitch-mark"></div>
            <div class="visual-text">${visualText}</div>
          </div>`;
}

function typeLabel(type) {
  const labels = {
    cover: "封面",
    hook: "开场判断",
    context: "背景",
    "turning-point": "关键转折",
    evidence: "证据",
    debate: "讨论边界",
    close: "结尾观察",
    scene: "片段"
  };
  return labels[type] || type || "片段";
}

function renderPosterSourcePills(segment) {
  const labels = segment.sourceItems.length
    ? segment.sourceItems.slice(0, 2).map((item) => `${item.id || "src"} ${item.sourceName || item.factLevel || "source"}`)
    : segment.sourceIds.slice(0, 2);
  const fallback = labels.length ? labels : ["source check required"];
  return fallback.map((label) => `<span class="poster-source-pill">${escapeHtml(label)}</span>`).join("");
}

function renderSourceText(segment) {
  const item = segment.sourceItems.find((source) => source.imageUrl) || segment.sourceItems[0];
  if (!item) return "";
  return `${item.id || "src"} ${item.sourceName || item.factLevel || "source"}`;
}

function renderSourcePills(segment) {
  const labels = segment.sourceItems.length
    ? segment.sourceItems.slice(0, 3).map((item) => `${item.id || "src"} ${item.sourceName || item.factLevel || "source"}`)
    : segment.sourceIds.slice(0, 3);
  const fallback = labels.length ? labels : ["source check required"];
  return fallback.map((label) => `<span class="source-pill">${escapeHtml(label)}</span>`).join("");
}

function renderTransition(segment, index) {
  const start = Math.max(0, segment.start - 0.34);
  return `      <div id="transition-${index + 1}" class="clip transition" data-start="${formatNumber(start)}" data-duration="0.72" data-track-index="${30 + index}">
        <div class="transition-label">世界杯素材</div>
      </div>`;
}

function cssAccent(segment) {
  const color = accentColor(segment.index);
  return `      .scene-${segment.id} .scene-number,
      .scene-${segment.id} .topline {
        color: ${color};
      }`;
}

function renderTimeline(model) {
  const lines = [];
  const eases = ["power3.out", "expo.out", "back.out(1.2)", "circ.out"];

  for (const segment of model.segments) {
    const base = formatNumber(segment.start + 0.18);
    const selector = `#scene-${segment.id}`;
    if (segment.imageAsset && segment.layout === "poster") {
      lines.push(`      tl.from("${selector} .poster-photo", { opacity: 0.86, duration: 0.5, ease: "power2.out" }, ${formatNumber(segment.start)});`);
      lines.push(`      tl.from("${selector} .poster-title", { y: 70, opacity: 0, duration: 0.7, ease: "${eases[(segment.index + 1) % eases.length]}" }, ${formatNumber(segment.start + 0.34)});`);
      lines.push(`      tl.from("${selector} .poster-caption", { x: -34, opacity: 0, duration: 0.56, ease: "${eases[(segment.index + 2) % eases.length]}" }, ${formatNumber(segment.start + 0.78)});`);
      lines.push(`      tl.from("${selector} .poster-voice", { y: 28, opacity: 0, duration: 0.48, ease: "${eases[(segment.index + 3) % eases.length]}" }, ${formatNumber(segment.start + 1.2)});`);
      if (segment.showSourceLabels) {
        lines.push(`      tl.from("${selector} .poster-debug-source", { y: -16, opacity: 0, duration: 0.3, ease: "power2.out" }, ${base});`);
      }
    } else {
      lines.push(`      tl.from("${selector} .topline", { y: 26, opacity: 0, duration: 0.46, ease: "${eases[segment.index % eases.length]}" }, ${base});`);
      lines.push(`      tl.from("${selector} .headline", { y: 72, opacity: 0, duration: 0.7, ease: "${eases[(segment.index + 1) % eases.length]}" }, ${formatNumber(segment.start + 0.34)});`);
      lines.push(`      tl.from("${selector} .visual-card", { x: -46, opacity: 0, duration: 0.62, ease: "${eases[(segment.index + 2) % eases.length]}" }, ${formatNumber(segment.start + 0.72)});`);
      lines.push(`      tl.from("${selector} .voiceover", { y: 42, opacity: 0, duration: 0.55, ease: "${eases[(segment.index + 3) % eases.length]}" }, ${formatNumber(segment.start + 1.02)});`);
      lines.push(`      tl.from("${selector} .source-pill", { y: 18, opacity: 0, duration: 0.34, stagger: 0.08, ease: "power2.out" }, ${formatNumber(segment.start + 1.32)});`);
    }
  }

  model.segments.slice(1).forEach((segment, index) => {
    const transitionId = `#transition-${index + 1}`;
    const start = Math.max(0, segment.start - 0.34);
    lines.push(`      tl.fromTo("${transitionId}", { scaleX: 0 }, { scaleX: 1, duration: 0.34, ease: "power3.inOut", overwrite: "auto" }, ${formatNumber(start)});`);
    lines.push(`      tl.to("${transitionId}", { scaleX: 0, transformOrigin: "right center", duration: 0.36, ease: "power3.inOut", overwrite: "auto" }, ${formatNumber(start + 0.34)});`);
    lines.push(`      tl.from("${transitionId} .transition-label", { y: 20, opacity: 0, duration: 0.2, ease: "power2.out" }, ${formatNumber(start + 0.1)});`);
  });

  const finalStart = Math.max(0, model.duration - 0.65);
  lines.push(`      tl.to("#root", { opacity: 0, duration: 0.55, ease: "power2.in" }, ${formatNumber(finalStart)});`);
  return lines.join("\n");
}

function findMaterial(materials, id) {
  const items = Array.isArray(materials.items) ? materials.items : [];
  return items.find((item) => item.id === id);
}

function accentColor(index) {
  return ["#1F7A4C", "#B3261E", "#8A6A16", "#151515"][index % 4];
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function toNumber(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  return fallback;
}

function formatNumber(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function slug(value) {
  const normalized = String(value || "worldcup-video")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "worldcup-video";
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
