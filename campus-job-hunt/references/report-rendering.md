# 诊断报告渲染

## 使用时机

当用户要求把简历诊断结论做成报告、网页、截图、图片或可分享视觉产物时，使用本参考。

## 报告结构

HTML报告必须包含三个主部分：

1. JD深度分析：如果用户同时提供JD，先展示公司主营业务、规模或业务阶段、岗位职责、重点考察能力和推断高频问题。
2. 简历诊断结果：使用`references/resume-diagnosis.md`中的五层诊断SOP，展示一句话结论、优势项、劣势项、改进措施和各维度评分。
3. 严重程度排序建议：按URGENT、CRITICAL、OPTIONAL从高到低展示缺点、证据、修改动作和可替换文本。

面试整体准备建议可以保留在报告底部，但不能替代以上三个主部分。

## 数据结构

渲染脚本接受JSON文件，推荐结构如下：

```json
{
  "candidate": "候选人",
  "target_role": "目标岗位",
  "company": "目标公司",
  "jd_analysis": {
    "company_profile": "公司主营业务、规模、业务阶段和岗位所在业务线",
    "role_analysis": "岗位职责、职责边界和能力结构",
    "assessment_focus": ["重点考察能力"],
    "high_frequency_questions": ["推断高频问题"]
  },
  "conclusion": {
    "match_level": "中高匹配",
    "one_sentence": "一句话结论",
    "strengths": ["优势"],
    "weaknesses": ["劣势"],
    "improvements": ["改进措施"]
  },
  "scores": {
    "overall": 76,
    "projected_improvement": 86,
    "dimensions": {
      "judgement": 78,
      "structure": 72,
      "alignment": 80,
      "expression": 70,
      "format": 82
    }
  },
  "dimension_advice": {
    "judgement": ["建议"],
    "structure": ["建议"],
    "alignment": ["建议"],
    "expression": ["建议"],
    "format": ["建议"]
  },
  "severity_advice": [
    {
      "severity": "URGENT",
      "title": "问题标题",
      "evidence": "问题证据",
      "action": "修改动作",
      "rewrite": "可替换文本或需要补充的信息"
    }
  ],
  "interview_preparation": ["建议"]
}
```

如果诊断结果只有`issues`数组，先按问题的所属维度和严重性汇总为`dimension_advice`，再按`URGENT -> CRITICAL -> OPTIONAL`推导`severity_advice`。3:4报告首图只展示前三个最高优先级问题，完整问题列表保留在诊断JSON或Markdown里。

## 渲染命令

从诊断JSON生成HTML和3:4竖版2K PNG：

```bash
node campus-job-hunt/scripts/render_report.mjs \
  --input campus-job-hunt/runs/<run-id>/resume_diagnosis.json \
  --out-dir campus-job-hunt/runs/<run-id> \
  --html diagnosis_report.html \
  --png diagnosis_report.png \
  --width 1536 \
  --height 2048
```

生成demo：

```bash
node campus-job-hunt/scripts/render_report.mjs --demo
```

默认输出：

```text
campus-job-hunt/runs/demo/diagnosis_report.html
campus-job-hunt/runs/demo/diagnosis_report.png
```

## 视觉规则

- 画布默认`1536 x 2048`，使用3:4竖版比例，适合移动端查看和社交平台分享。
- 报告应为信息密度高的专业诊断页，不做营销落地页。
- 竖版报告优先使用上中下结构：顶部JD分析，中部诊断结果，底部严重程度排序建议和面试准备。
- 不使用装饰性渐变球、夸张英雄区或大面积单一色系。
- 分数和建议必须可扫描，避免长段落堆叠。
- 首图控制信息密度：重点考察能力最多展示6项，高频问题最多展示4项，严重程度建议最多展示3项。
- 结论要直给，不用夸张词。
- 所有截图必须由Playwright打开本地HTML后生成。
