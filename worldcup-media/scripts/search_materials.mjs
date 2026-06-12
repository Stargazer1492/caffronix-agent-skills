#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.person) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const outDir = path.resolve(args["out-dir"] || args.outDir || args.out || defaultRunDir());
const topic = clean(args.topic || `${args.person} World Cup`);
const angle = clean(args.angle || "");
const platform = clean(args.platform || "xiaohongshu");
const maxResults = Math.max(3, Number(args["max-results"] || args.maxResults || 10));
const includeImages = !args["no-images"];
const queries = buildQueries(args.person, topic, angle, args.query);

fs.mkdirSync(outDir, { recursive: true });

const provider = process.env.TAVILY_API_KEY && !args["no-tavily"] ? "tavily" : "search-pages";
const results = await searchAll(queries, provider);
const ranked = rankResults(results, args.person, topic).slice(0, maxResults);
const items = await enrichResults(ranked);

const output = {
  generatedAt: new Date().toISOString(),
  topic,
  angle,
  platform,
  searchProvider: provider,
  queries,
  items
};

fs.writeFileSync(path.join(outDir, "materials.raw.json"), `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "search_report.md"), renderSearchReport(output));
console.log(path.join(outDir, "materials.raw.json"));
console.log(path.join(outDir, "search_report.md"));

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
  console.log(`Usage: node scripts/search_materials.mjs --person <name> [options]

Options:
  --topic <text>        Topic context, such as "Brazil World Cup 2026"
  --angle <text>        Story angle
  --platform <text>     Target platform. Default: xiaohongshu
  --query <text>        Extra query. Can be passed multiple times only by shell wrapping into one string
  --max-results <n>     Number of sources to keep. Default: 10
  --out-dir <dir>       Output run directory
  --no-images           Do not extract article image URLs from source pages
  --no-tavily           Ignore TAVILY_API_KEY and use public search pages

Output:
  materials.raw.json and search_report.md
`);
}

function defaultRunDir() {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  return path.join(process.cwd(), "worldcup-media", "runs", stamp);
}

function buildQueries(person, topic, angle, extraQuery) {
  const base = [
    `${person} ${topic} official squad`,
    `site:fifa.com ${person} Brazil World Cup 2026`,
    `${person} Brazil World Cup 2026 player to watch`,
    `${person} Brazil Carlo Ancelotti World Cup 2026`,
    `${person} Brazil national team World Cup analysis`,
    `${person} Brazil qualification goal Paraguay World Cup`
  ];

  if (angle) {
    base.push(`${person} ${topic} ${angle}`);
  }

  if (extraQuery) {
    base.push(extraQuery);
  }

  return [...new Set(base.map((query) => query.trim()).filter(Boolean))];
}

async function searchAll(queries, provider) {
  const all = [];
  for (const query of queries) {
    const results = provider === "tavily"
      ? await searchTavily(query)
      : await searchPublicPages(query);
    all.push(...results.map((result) => ({ ...result, query })));
  }
  return dedupeByUrl(all);
}

async function searchTavily(query) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
      include_images: includeImages,
      include_raw_content: false
    })
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return ensureArray(data.results).map((item) => ({
    title: clean(item.title),
    url: clean(item.url),
    snippet: clean(item.content),
    score: Number(item.score || 0)
  }));
}

async function searchPublicPages(query) {
  const duck = await searchDuckDuckGo(query);
  if (duck.length) return duck;
  return searchBing(query);
}

async function searchDuckDuckGo(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  if (!html) return [];

  const results = [];
  const blockRegex = /<div class="result(?:[^"]*)">([\s\S]*?)<\/div>\s*<\/div>/g;
  for (const match of html.matchAll(blockRegex)) {
    const block = match[1];
    const anchor = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!anchor) continue;
    const snippet = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
      || block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/);
    const decodedUrl = decodeDuckUrl(htmlDecode(anchor[1]));
    if (!decodedUrl) continue;
    results.push({
      title: stripHtml(anchor[2]),
      url: decodedUrl,
      snippet: snippet ? stripHtml(snippet[1]) : "",
      score: 0
    });
  }
  return results;
}

async function searchBing(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  if (!html) return [];

  const results = [];
  const blockRegex = /<li class="b_algo"[\s\S]*?<\/li>/g;
  for (const match of html.matchAll(blockRegex)) {
    const block = match[0];
    const anchor = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!anchor) continue;
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    results.push({
      title: stripHtml(anchor[2]),
      url: htmlDecode(anchor[1]),
      snippet: snippet ? stripHtml(snippet[1]) : "",
      score: 0
    });
  }
  return results;
}

async function enrichResults(results) {
  const items = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const metadata = await fetchMetadata(result.url);
    const sourceType = inferSourceType(result.url);
    const factLevel = inferFactLevel(sourceType, result.url);
    const title = metadata.title || result.title || result.url;
    const summary = metadata.description || result.snippet || "";
    items.push({
      id: `src_${String(index + 1).padStart(3, "0")}`,
      title,
      url: result.url,
      sourceName: inferSourceName(result.url),
      sourceType,
      factLevel,
      publishedAt: metadata.publishedAt || inferDate(summary) || "",
      eventDate: metadata.eventDate || inferDate(summary) || "",
      people: [clean(args.person)],
      teams: inferTeams(`${title} ${summary} ${result.url}`),
      matches: inferMatches(`${title} ${summary}`),
      tags: inferTags(result.url, title, summary, result.query),
      summary,
      imageUrl: includeImages ? metadata.imageUrl || clean(result.imageUrl) : "",
      imagePageUrl: includeImages && (metadata.imageUrl || result.imageUrl) ? result.url : "",
      videoUrl: "",
      videoPageUrl: "",
      usageRisk: inferUsageRisk(sourceType, metadata.imageUrl || result.imageUrl),
      notes: `query: ${result.query}`
    });
  }
  return items;
}

async function fetchMetadata(url) {
  const html = await fetchText(url);
  if (!html) return {};
  const title = getMetaContent(html, ["og:title", "twitter:title"])
    || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = getMetaContent(html, ["description", "og:description", "twitter:description"]);
  const publishedAt = getMetaContent(html, ["article:published_time", "datePublished"])
    || firstMatch(html, /<time[^>]+datetime=["']([^"']+)["']/i)
    || firstMatch(html, /"datePublished"\s*:\s*"([^"]+)"/i);
  const imageUrl = normalizeAssetUrl(
    getMetaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"])
      || firstJsonLdImage(html),
    url
  );
  return {
    title: clean(stripHtml(title || "")),
    description: clean(stripHtml(description || "")),
    publishedAt: normalizeDate(publishedAt),
    imageUrl
  };
}

async function fetchText(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; worldcup-media-skill/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    clearTimeout(timer);
    if (!response.ok) return "";
    const text = await response.text();
    return text.slice(0, 500000);
  } catch {
    return "";
  }
}

function rankResults(results, person, topic) {
  return dedupeByUrl(results)
    .map((result) => ({
      ...result,
      rankScore: scoreResult(result, person, topic)
    }))
    .filter((result) => result.rankScore > 0)
    .sort((a, b) => b.rankScore - a.rankScore);
}

function scoreResult(result, person, topic) {
  const haystack = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  const host = safeHost(result.url);
  let score = 0;

  const title = String(result.title || "").toLowerCase();
  if (haystack.includes(person.toLowerCase().split(" ")[0])) score += 8;
  if (title.includes(person.toLowerCase().split(" ")[0])) score += 8;
  if (title.includes("endrick") && !person.toLowerCase().includes("endrick")) score -= 8;
  if (haystack.includes("brazil")) score += 6;
  if (haystack.includes("world cup") || haystack.includes("worldcup")) score += 6;
  if (haystack.includes("2026")) score += 5;
  if (topic && haystack.includes(topic.toLowerCase())) score += 3;
  if (host.includes("fifa.com") || host.includes("cbf.com.br")) score += 14;
  if (isTrustedNewsHost(host)) score += 8;
  if (host.includes("youtube.com") || host.includes("tiktok.com")) score -= 5;
  if (host.includes("pinterest") || host.includes("facebook")) score -= 8;

  return score;
}

function dedupeByUrl(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const normalized = normalizeUrl(item.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push({ ...item, url: normalized });
  }
  return output;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ocid|cid)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function decodeDuckUrl(url) {
  try {
    const parsed = new URL(url.startsWith("//") ? `https:${url}` : url);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return "";
  }
}

function inferSourceType(url) {
  const host = safeHost(url);
  if (host.includes("fifa.com") || host.includes("cbf.com.br") || host.includes("realmadrid.com")) return "official";
  if (host.includes("youtube.com") || host.includes("tiktok.com") || host.includes("bilibili.com")) return "video";
  if (host.includes("x.com") || host.includes("twitter.com") || host.includes("reddit.com")) return "social";
  if (host.includes("gettyimages") || host.includes("alamy") || host.includes("apimages")) return "image";
  if (host.includes("fbref.com") || host.includes("transfermarkt") || host.includes("statbunker")) return "data";
  return "news";
}

function inferFactLevel(sourceType) {
  if (sourceType === "official" || sourceType === "data") return "confirmed";
  if (sourceType === "news") return "reported";
  if (sourceType === "social") return "social";
  return "unknown";
}

function inferUsageRisk(sourceType, imageUrl = "") {
  if (imageUrl && sourceType === "official") return "medium";
  if (imageUrl) return "high";
  if (sourceType === "official" || sourceType === "data") return "medium";
  if (sourceType === "social" || sourceType === "video" || sourceType === "image") return "high";
  return "medium";
}

function inferSourceName(url) {
  const host = safeHost(url).replace(/^www\./, "");
  const names = {
    "fifa.com": "FIFA",
    "cbf.com.br": "CBF",
    "realmadrid.com": "Real Madrid",
    "aljazeera.com": "Al Jazeera",
    "goal.com": "GOAL",
    "skysports.com": "Sky Sports",
    "espn.com": "ESPN",
    "bbc.com": "BBC",
    "reuters.com": "Reuters",
    "apnews.com": "AP News"
  };
  for (const [needle, name] of Object.entries(names)) {
    if (host.includes(needle)) return name;
  }
  return host || "unknown";
}

function inferTeams(text) {
  const teams = [];
  if (/brazil|brasil/i.test(text)) teams.push("Brazil");
  if (/real madrid/i.test(text)) teams.push("Real Madrid");
  if (/paraguay/i.test(text)) teams.push("Paraguay");
  return [...new Set(teams)];
}

function inferMatches(text) {
  const matches = [];
  if (/brazil.*paraguay|paraguay.*brazil/i.test(text)) matches.push("Brazil vs Paraguay");
  return matches;
}

function inferTags(url, title, summary, query) {
  const haystack = `${url} ${title} ${summary} ${query}`.toLowerCase();
  const tags = ["auto-search"];
  if (haystack.includes("squad")) tags.push("squad");
  if (haystack.includes("player to watch")) tags.push("player-to-watch");
  if (haystack.includes("ancelotti")) tags.push("ancelotti");
  if (haystack.includes("qualif")) tags.push("qualification");
  if (haystack.includes("paraguay")) tags.push("timeline");
  if (haystack.includes("stat") || haystack.includes("data")) tags.push("data");
  return [...new Set(tags)];
}

function isTrustedNewsHost(host) {
  return [
    "aljazeera.com",
    "goal.com",
    "skysports.com",
    "espn.com",
    "bbc.com",
    "reuters.com",
    "apnews.com",
    "theathletic.com",
    "nytimes.com",
    "theguardian.com",
    "marca.com",
    "as.com"
  ].some((trusted) => host.includes(trusted));
}

function renderSearchReport(output) {
  const lines = [
    "# Search Report",
    "",
    `Generated: ${output.generatedAt}`,
    `Provider: ${output.searchProvider}`,
    `Topic: ${output.topic}`,
    `Angle: ${output.angle || "unspecified"}`,
    "",
    "## Queries",
    ""
  ];
  for (const query of output.queries) {
    lines.push(`- ${query}`);
  }
  lines.push("", "## Selected Sources", "");
  for (const item of output.items) {
    lines.push(`- ${item.id}: ${item.title}`);
    lines.push(`  - ${item.url}`);
    lines.push(`  - ${item.sourceType}, ${item.factLevel}, ${item.usageRisk}`);
    if (item.imageUrl) lines.push(`  - image: ${item.imageUrl}`);
    if (item.imagePageUrl) lines.push(`  - image page: ${item.imagePageUrl}`);
  }
  return `${lines.join("\n")}\n`;
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? htmlDecode(match[1]) : "";
}

function getMetaContent(html, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const metaRegex = /<meta\s+[^>]*>/gi;
  for (const match of html.matchAll(metaRegex)) {
    const attrs = parseAttributes(match[0]);
    const key = clean(attrs.property || attrs.name || attrs.itemprop).toLowerCase();
    if (wanted.has(key) && attrs.content) return htmlDecode(attrs.content);
  }
  return "";
}

function parseAttributes(tag) {
  const attrs = {};
  const attrRegex = /([a-zA-Z_:.-]+)\s*=\s*(["'])(.*?)\2/g;
  for (const match of tag.matchAll(attrRegex)) {
    attrs[match[1].toLowerCase()] = match[3];
  }
  return attrs;
}

function firstJsonLdImage(html) {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptRegex)) {
    try {
      const json = JSON.parse(stripJsonHtml(match[1]));
      const image = pickJsonLdImage(json);
      if (image) return image;
    } catch {
      // Keep searching other structured data blocks.
    }
  }
  return "";
}

function pickJsonLdImage(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = pickJsonLdImage(item);
      if (image) return image;
    }
    return "";
  }
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  if (value.image) {
    if (typeof value.image === "string") return value.image;
    if (Array.isArray(value.image)) return pickJsonLdImage(value.image);
    if (value.image.url) return value.image.url;
  }
  if (value["@graph"]) return pickJsonLdImage(value["@graph"]);
  return "";
}

function stripJsonHtml(value) {
  return htmlDecode(String(value || "").trim());
}

function normalizeAssetUrl(value, pageUrl) {
  const cleaned = clean(value);
  if (!cleaned) return "";
  try {
    return new URL(cleaned, pageUrl).toString();
  } catch {
    return "";
  }
}

function inferDate(text) {
  return normalizeDate(firstMatch(text, /\b((?:20)\d{2}[-/年.](?:0?[1-9]|1[0-2])(?:[-/月.](?:0?[1-9]|[12]\d|3[01]))?)/));
}

function normalizeDate(value) {
  const cleaned = clean(value);
  if (!cleaned) return "";
  const iso = cleaned.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const yearMonthDay = cleaned.match(/(20\d{2})[-/年.](\d{1,2})(?:[-/月.](\d{1,2}))?/);
  if (!yearMonthDay) return cleaned.slice(0, 32);
  const [, year, month, day] = yearMonthDay;
  return day
    ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    : `${year}-${month.padStart(2, "0")}`;
}

function safeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stripHtml(value) {
  return htmlDecode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function htmlDecode(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}
