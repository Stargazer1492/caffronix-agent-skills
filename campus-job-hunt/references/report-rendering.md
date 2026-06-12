# 诊断报告渲染

## 使用时机

当用户要求把简历诊断结论做成报告、网页、截图、图片或可分享视觉产物时，使用本参考。

## 报告结构

HTML报告必须包含四个部分：

1. 一句话结论：概述匹配度、优势项、劣势项和改进措施。
2. 各维度评分：展示`judgement`、`structure`、`alignment`、`expression`、`format`五项分数和总体分。
3. 不同维度的优化建议：按定位、结构、贴合度、表达、格式输出可执行建议。
4. 面试整体准备建议：围绕项目深挖、能力证明、风险解释和反问准备给出下一步动作。

## 数据结构

渲染脚本接受JSON文件，推荐结构如下：

```json
{
  "candidate": "候选人",
  "target_role": "目标岗位",
  "company": "目标公司",
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
  "interview_preparation": ["建议"]
}
```

如果诊断结果只有`issues`数组，先按问题的所属维度和严重性汇总为`dimension_advice`。`URGENT`优先进入报告首屏，`CRITICAL`进入分维建议，`OPTIONAL`只保留最有价值的细节。

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
- 竖版报告优先使用上中下结构：顶部结论，中部评分和关键建议，底部面试准备。
- 不使用装饰性渐变球、夸张英雄区或大面积单一色系。
- 分数和建议必须可扫描，避免长段落堆叠。
- 结论要直给，不用夸张词。
- 所有截图必须由Playwright打开本地HTML后生成。
