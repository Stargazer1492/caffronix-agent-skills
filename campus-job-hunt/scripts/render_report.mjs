#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = {
    demo: false,
    width: 1536,
    height: 2048,
    html: "diagnosis_report.html",
    png: "diagnosis_report.png",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--demo") {
      args.demo = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    index += 1;
    if (key === "width" || key === "height") {
      args[key] = Number.parseInt(value, 10);
    } else {
      args[key] = value;
    }
  }
  return args;
}

function resolvePlaywright() {
  const candidates = [
    process.cwd(),
    path.resolve("node_modules"),
    ...String(process.env.NODE_PATH || "")
      .split(path.delimiter)
      .filter(Boolean),
  ];
  const resolved = require.resolve("playwright", { paths: candidates });
  return require(resolved);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function severityRank(severity) {
  const ranks = {
    URGENT: 0,
    CRITICAL: 1,
    OPTIONAL: 2,
  };
  return ranks[String(severity || "").toUpperCase()] ?? 3;
}

function severityLabel(severity) {
  const labels = {
    URGENT: "高",
    CRITICAL: "中",
    OPTIONAL: "低",
  };
  return labels[String(severity || "").toUpperCase()] || "待判断";
}

function normalizeReport(raw) {
  const scores = raw.scores || {};
  const dimensions = scores.dimensions || {};
  const conclusion = raw.conclusion || {};
  const dimensionAdvice = raw.dimension_advice || {};
  const jdAnalysis = raw.jd_analysis || raw.jdAnalysis || {};
  const issues = Array.isArray(raw.issues) ? raw.issues : [];
  const dimensionNames = {
    judgement: "定位判断",
    structure: "结构",
    alignment: "岗位贴合度",
    expression: "表达",
    format: "格式",
  };
  const inferredAdvice = {};
  for (const key of Object.keys(dimensionNames)) {
    inferredAdvice[key] = asArray(dimensionAdvice[key]);
  }
  for (const issue of issues) {
    const dimension = issue.dimension || issue.category || "alignment";
    if (!inferredAdvice[dimension]) {
      inferredAdvice[dimension] = [];
    }
    const text = [issue.suggestion, issue.new_value].filter(Boolean).join("；");
    if (text) {
      inferredAdvice[dimension].push(text);
    }
  }
  const severityAdvice = asArray(raw.severity_advice || raw.severityAdvice);
  const rankedAdvice = (severityAdvice.length
    ? severityAdvice
    : issues.map((issue) => ({
        severity: issue.severity,
        title: issue.title || issue.suggestion || "简历问题",
        evidence: issue.evidence,
        action: issue.suggestion,
        rewrite: issue.new_value,
      }))
  )
    .map((item) => ({
      severity: String(item.severity || "OPTIONAL").toUpperCase(),
      title: firstValue(item.title, item.problem, item.action, "改进建议"),
      evidence: firstValue(item.evidence, item.reason, ""),
      action: firstValue(item.action, item.suggestion, ""),
      rewrite: firstValue(item.rewrite, item.new_value, ""),
    }))
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity))
    .slice(0, 3);
  return {
    candidate: raw.candidate || "示例候选人",
    targetRole: raw.target_role || raw.targetRole || "目标岗位",
    company: raw.company || "目标公司",
    generatedAt: raw.generated_at || new Date().toISOString().slice(0, 10),
    matchLevel: conclusion.match_level || raw.match_level || "待判断",
    oneSentence: conclusion.one_sentence || raw.summary || "等待诊断结论。",
    strengths: asArray(conclusion.strengths || raw.strengths),
    weaknesses: asArray(conclusion.weaknesses || raw.weaknesses),
    improvements: asArray(conclusion.improvements || raw.improvements),
    scores: {
      overall: scores.overall ?? 0,
      projectedImprovement: scores.projected_improvement ?? scores.projectedImprovement ?? 0,
      dimensions,
    },
    dimensionNames,
    dimensionAdvice: inferredAdvice,
    jdAnalysis: {
      companyProfile: firstValue(jdAnalysis.company_profile, jdAnalysis.companyProfile, "未提供JD时不展开公司分析。"),
      roleAnalysis: firstValue(jdAnalysis.role_analysis, jdAnalysis.roleAnalysis, "未提供JD时不展开岗位分析。"),
      assessmentFocus: asArray(firstValue(jdAnalysis.assessment_focus, jdAnalysis.assessmentFocus, raw.assessment_focus)).slice(0, 6),
      highFrequencyQuestions: asArray(
        firstValue(jdAnalysis.high_frequency_questions, jdAnalysis.highFrequencyQuestions, raw.high_frequency_questions),
      ).slice(0, 4),
    },
    rankedAdvice,
    interviewPreparation: asArray(raw.interview_preparation || raw.interviewPreparation).slice(0, 4),
  };
}

function scoreClass(score) {
  if (score >= 85) return "strong";
  if (score >= 70) return "solid";
  if (score >= 55) return "watch";
  return "risk";
}

function listItems(items) {
  if (!items.length) {
    return '<li class="muted">暂无明确内容。</li>';
  }
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function taggedItems(items) {
  if (!items.length) {
    return '<div class="tag muted">暂无明确内容</div>';
  }
  return items.map((item) => `<div class="tag">${escapeHtml(item)}</div>`).join("");
}

function rankedAdviceCards(items) {
  if (!items.length) {
    return '<div class="rank-card"><span class="severity optional">待判断</span><h3>暂无明确改进建议</h3><p>请先完成JD解析和简历诊断。</p></div>';
  }
  return items
    .map((item) => {
      const label = severityLabel(item.severity);
      const levelClass = String(item.severity || "OPTIONAL").toLowerCase();
      return `
        <article class="rank-card">
          <span class="severity ${levelClass}">${label}</span>
          <h3>${escapeHtml(item.title)}</h3>
          ${item.evidence ? `<p><strong>证据</strong>${escapeHtml(item.evidence)}</p>` : ""}
          ${item.action ? `<p><strong>动作</strong>${escapeHtml(item.action)}</p>` : ""}
          ${item.rewrite ? `<p><strong>改写</strong>${escapeHtml(item.rewrite)}</p>` : ""}
        </article>`;
    })
    .join("");
}

function fillTemplate(template, values) {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

async function renderTemplateHtml(rawReport, skillRoot) {
  const report = normalizeReport(rawReport);
  const templateDir = path.join(skillRoot, "assets", "report-template");
  const [template, styles] = await Promise.all([
    readFile(path.join(templateDir, "index.html"), "utf8"),
    readFile(path.join(templateDir, "styles.css"), "utf8"),
  ]);
  const scoreRows = Object.entries(report.dimensionNames)
    .map(([key, label]) => {
      const score = Number(report.scores.dimensions[key] ?? 0);
      return `
        <div class="score-row">
          <div class="score-meta">
            <span>${escapeHtml(label)}</span>
            <strong>${score}</strong>
          </div>
          <div class="bar"><span class="${scoreClass(score)}" style="width:${Math.max(0, Math.min(100, score))}%"></span></div>
        </div>`;
    })
    .join("");
  const adviceBlocks = Object.entries(report.dimensionNames)
    .map(([key, label]) => {
      return `
        <section class="advice-block">
          <h3>${escapeHtml(label)}</h3>
          <ul>${listItems(report.dimensionAdvice[key] || [])}</ul>
        </section>`;
    })
    .join("");
  return fillTemplate(template, {
    STYLES: styles,
    CANDIDATE: escapeHtml(report.candidate),
    COMPANY: escapeHtml(report.company),
    TARGET_ROLE: escapeHtml(report.targetRole),
    GENERATED_AT: escapeHtml(report.generatedAt),
    MATCH_LEVEL: escapeHtml(report.matchLevel),
    ONE_SENTENCE: escapeHtml(report.oneSentence),
    STRENGTHS: listItems(report.strengths),
    WEAKNESSES: listItems(report.weaknesses),
    IMPROVEMENTS: listItems(report.improvements),
    COMPANY_PROFILE: escapeHtml(report.jdAnalysis.companyProfile),
    ROLE_ANALYSIS: escapeHtml(report.jdAnalysis.roleAnalysis),
    ASSESSMENT_FOCUS: taggedItems(report.jdAnalysis.assessmentFocus),
    HIGH_FREQUENCY_QUESTIONS: listItems(report.jdAnalysis.highFrequencyQuestions),
    OVERALL_SCORE: escapeHtml(report.scores.overall),
    PROJECTED_IMPROVEMENT: escapeHtml(report.scores.projectedImprovement),
    SCORE_ROWS: scoreRows,
    ADVICE_BLOCKS: adviceBlocks,
    RANKED_ADVICE: rankedAdviceCards(report.rankedAdvice),
    INTERVIEW_PREPARATION: listItems(report.interviewPreparation),
  });
}

function demoReport() {
  return {
    candidate: "李同学",
    target_role: "AI产品经理校招",
    company: "示例科技",
    generated_at: "2026-06-12",
    jd_analysis: {
      company_profile:
        "示例科技主营企业协同和AI效率工具，团队规模约千人，近两年把大模型能力接入知识库、客服和内部工作流，校招岗位更看重产品判断、数据验证和跨团队推进。",
      role_analysis:
        "AI产品经理校招岗位承担需求分析、功能设计、数据跟踪和用户反馈闭环，面试会围绕真实AI产品理解、指标意识、项目复盘和落地细节追问。",
      assessment_focus: ["AI产品理解", "需求判断", "数据分析", "项目复盘", "跨团队沟通"],
      high_frequency_questions: [
        "你做过的AI产品项目解决了什么真实问题？",
        "如果模型效果不稳定，你会如何设计产品兜底？",
        "你如何判断一个功能是否值得上线？",
        "项目指标从哪里来，如何验证改进有效？",
      ],
    },
    conclusion: {
      match_level: "中高匹配",
      one_sentence:
        "候选人与AI产品经理校招岗位整体中高匹配，优势在于有AI工具产品项目和数据分析基础，劣势是业务指标与用户验证不足，优先补强项目结果、岗位关键词和面试追问证据。",
      strengths: ["有AI工作流项目经历，能支撑岗位方向", "技术和产品语言都有基础", "项目可改写为岗位相关案例"],
      weaknesses: ["关键成果量化不足", "JD关键词覆盖不够稳定", "部分项目描述偏功能清单"],
      improvements: ["补充用户、效率、转化或留存指标", "把项目要点改成任务、方法、结果结构", "准备三层追问证据"],
    },
    scores: {
      overall: 76,
      projected_improvement: 87,
      dimensions: {
        judgement: 82,
        structure: 74,
        alignment: 78,
        expression: 70,
        format: 81,
      },
    },
    dimension_advice: {
      judgement: ["在开头或最强项目标题中明确AI产品方向", "删除泛泛兴趣表达，改为产品能力和项目证据"],
      structure: ["把AI项目和实习经历前置", "弱相关校园经历压缩为一条"],
      alignment: ["从JD抽取10个关键词并映射到项目描述", "补充用户调研、需求判断和数据验证证据"],
      expression: ["每条经历描述补齐对象、方法、目的和输出", "把“负责优化流程”改成可追问的结果句"],
      format: ["统一时间格式和模块标题", "技能模块按工具、分析、语言分组"],
    },
    severity_advice: [
      {
        severity: "URGENT",
        title: "补齐项目结果和验证证据",
        evidence: "最相关AI项目只写了功能和流程，缺少用户、指标、反馈或上线结果。",
        action: "优先补充使用人数、节省时间、转化变化、满意度或定性反馈。",
        rewrite: "需要用户补充真实数字后，改成“面向X用户，用Y方案解决Z问题，带来N结果”。",
      },
      {
        severity: "CRITICAL",
        title: "把JD考察重点映射到简历关键词",
        evidence: "简历没有稳定覆盖需求判断、数据验证、AI产品落地等关键词。",
        action: "把JD关键词分配到项目、实习和技能模块，避免只堆在技能清单。",
        rewrite: "在项目描述中加入“需求分析、指标跟踪、用户反馈、模型效果评估”等真实相关动作。",
      },
      {
        severity: "OPTIONAL",
        title: "统一格式并压缩弱相关经历",
        evidence: "部分经历描述较长，弱相关校园经历占用版面。",
        action: "保留强相关项目3到4条，弱相关经历压缩为1条。",
        rewrite: "把弱相关经历改成一条能证明沟通或推进能力的结果句。",
      },
    ],
    interview_preparation: [
      "准备一个AI产品项目的完整复盘：问题、用户、方案、指标、失败点和迭代。",
      "把简历中最强的三条核心经历拆成三层追问答案，确保每个数字和方法都能解释。",
      "补一组目标公司业务理解：核心产品、用户场景、AI能力落点和竞品差异。",
      "准备反问问题，聚焦团队目标、岗位职责边界、校招生培养和前三个月预期。",
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const skillRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const outDir = path.resolve(args.outDir || args["out-dir"] || (args.demo ? path.join(skillRoot, "runs", "demo") : process.cwd()));
  const report = args.demo ? demoReport() : JSON.parse(await readFile(path.resolve(args.input), "utf8"));
  const html = await renderTemplateHtml(report, skillRoot);
  await mkdir(outDir, { recursive: true });
  const htmlPath = path.join(outDir, args.html);
  const pngPath = path.join(outDir, args.png);
  await writeFile(htmlPath, html, "utf8");
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: args.width, height: args.height },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.screenshot({ path: pngPath, type: "png", fullPage: false });
  await browser.close();
  console.log(JSON.stringify({ html: htmlPath, png: pngPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
