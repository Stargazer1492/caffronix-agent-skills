# 简历诊断SOP

## 使用时机

当用户提供简历和目标JD，要求判断是否合适、简历写得好不好、怎么改、投递胜算如何时，使用本SOP。先读取JD解析和公司岗位调研结果，再诊断简历。

本SOP参考`via-pathwise/backend/app/services/graph/resume_diagnosis_workflow_prompts.py`中的诊断说明书，使用五个层级评估简历：

- 定位判断
- 结构
- 内容与岗位贴合度
- 表达是否职业化、可信、好读
- 格式是否无意识减分

## 输入要求

诊断前确认三类输入：

- 简历内容：可以是结构化JSON、PDF、Word、Markdown、纯文本、图片或截图提取文本。
- 岗位信息：至少有岗位名称；如果有JD JSON、JD文本、岗位截图或招聘页链接，优先基于完整JD判断岗位要求。
- 输出语言：用户指定中文或英文时，所有总结、证据、建议和改写内容使用指定语言；用户没有指定时，默认沿用用户当前语言。

如果简历来自附件或截图，先在`input_inventory.md`和`resume_extract.md`中记录来源、页码、截图编号、可读内容和缺口。只能基于可读取内容诊断。

## 结构化简历字段约定

如果简历已经被解析成JSON，优先按以下模块理解：

- `resume_language`：语言元数据，不诊断、不修改。
- `basic_info`：姓名、电话、邮箱、LinkedIn、GitHub、作品集等基础信息，原则上不在诊断问题中提出修改建议。
- `education`：学校、学历、专业、GPA、时间、地点、荣誉、相关课程。
- `professional_experience`：公司、地点、职位、时间、经历要点。
- `leadership_experience`：组织、角色、时间、地点、经历要点。
- `project_experience`：项目名称、时间、项目要点。
- `additional_information`：语言、技术技能、兴趣、证书和其他补充信息。

诊断应聚焦于教育、经历、项目、技能、语言和补充信息等可优化内容。不要臆造`summary`、`objective`等结构外字段。

## 第一层定位判断

判断简历是否有清晰目标方向，以及候选人是否能在同类人群中被快速识别。

检查项：

- 是否能看出候选人指向一个具体岗位、方向或能力组合。
- 是否有突出的技能、成就、经历或项目作为核心卖点。
- 是否有跨领域能力、独特经验、稀缺技能或反差亮点。
- 经历标题本身是否体现相关性，例如`Wealth Management Intern`强于`Intern`。
- 是否出现削弱定位的信号词，例如`exploring`、`interested in various fields`、`seeking opportunities in different areas`、`open to different roles`。

判断原则：

- 用“名词+能力”描述定位，例如`experience in data analysis`、`trained in market research`、`demonstrated ability to build dashboards`。
- 避免用态度词撑定位，例如`passionate about`、`interested in`。

## 第二层结构

判断简历是否让招聘方快速看到最相关的信息。

检查项：

- 是否有教育、实习、项目、技能、语言、附加信息等清晰模块。
- 模块顺序是否服务目标岗位。
- 模块命名是否具体，避免`Additional Experience`、`Miscellaneous`这类模糊名称。
- 关键模块是否缺失，例如技能、语言、作品集、相关项目。
- 经历长度是否合理。

模块顺序建议：

- 分析、金融、咨询类：Education -> Experience -> Projects -> Skills。
- 客户、商业、管理类：Experience -> Education -> Projects -> Skills。
- 技术、产品、设计类：按岗位最强证据排序，优先放实习、项目、作品集或技能。

经历长度控制：

- 最强经历写3到4条bullet。
- 次强经历写2到3条bullet。
- 弱相关经历写1条，或在版面紧张时删除。

## 第三层内容与岗位贴合度

判断简历是否真正贴合目标JD，而不是只写了一份通用简历。

检查项：

- 从JD提取10个关键动词、技能、工具和领域术语，检查简历是否出现原词或明确近义词。
- 与目标岗位高度相关的词应至少出现3次，具体词按岗位调整，例如`analyst`、`research`、`client`、`data`、`strategy`、`operations`。
- 同一关键能力是否在实习、项目、课程、竞赛或作品中多次印证。
- 项目或实习成果是否直接支持岗位目标。
- 经历标题是否一眼能看出岗位相关性。

输出时建立JD要求和简历证据映射：

```text
JD要求 | 简历证据 | 结论 | 修改动作
```

结论使用：

- 强匹配：有直接经历、明确成果和岗位语境。
- 弱匹配：方向相关，但缺少结果、方法或关键词。
- 缺口：简历中没有对应证据，或硬性条件不满足。

## 第四层表达是否职业化、可信、好读

逐条检查经历描述，尤其是`highlights`、项目bullet和实习bullet。

每条经历都应回答：

- 做了什么。
- 怎么做的。
- 带来了什么影响。

标准bullet句式：

```text
Action Verb + What + How + Why
```

示例：

```text
Analyzed client transaction data using Excel and internal databases to identify behavioral trends and support portfolio recommendations.
```

强制补全四类信息：

- 对象：谁或什么。
- 方法：用什么工具、方法、数据或流程。
- 目的：为了什么业务目标或项目目标。
- 输出：支持了什么决策、交付、结果或改进。

如果一句话缺少以上任意两类信息，必须改。

推荐动词：

- 第一梯队：Analyzed、Conducted、Built、Developed、Evaluated、Designed、Led、Synthesized。
- 第二梯队：Supported、Assisted、Coordinated。可用，但不要大量重复。

尽量避免：

- Helped
- Worked on
- Involved in
- Responsible for
- In charge of
- Tasked with
- Worked as part of a team to

常见替换：

```text
helped clients -> supported client requests
did research -> conducted research
made PPT -> prepared client-ready presentations
talked to clients -> communicated with clients
data work -> data analysis
```

避免学校语言：

- `homework`改为`research project`或`applied project`。
- `coursework`只在课程本身重要时保留，否则改成项目、分析或研究产出。
- `class project`改为`independent analysis`、`team project`或具体项目名。

量化原则：

- 可以使用`more than`、`over`、`approximately`、`multiple`、`frequent`、`regular`。
- 缺少真实数字时，提示用户补充，不要编造。
- 不可信的夸张数字直接减分，例如`Increased efficiency by 300%`、`Generated millions in value`。

## 第五层格式是否无意识减分

检查不会直接证明能力、但会影响阅读和专业感的细节。

检查项：

- 时间格式统一，例如`2023.06 - 2023.08`。
- 标点规范。
- 大小写一致。
- 行距合理。
- 页数控制，一般不超过2页；校招和实习简历通常优先控制在1页。
- 模块标题一致。
- bullet符号一致。
- 技能模块写具体工具、分析能力、语言能力和证书。

Skills模块推荐写法：

```text
Tools: Excel, PowerPoint, Python
Analysis: Financial modeling, market research
Languages: English (Fluent), Mandarin (Native)
```

Skills模块不要写：

- Hardworking
- Detail-oriented
- Fast learner

这些特质必须通过经历证明。

## 评分指南

五个维度分别给0到100分：

```text
judgement：定位判断
structure：结构
alignment：内容贴合度
expression：表达
format：格式
```

总体分数：

```text
overall = 五个维度平均值，四舍五入到整数
```

预计提升分数：

```text
projected_improvement = 如果所有URGENT和CRITICAL问题被修正，简历可能达到的总体分数
```

分数只用于排序问题优先级，不承诺录用概率。

## 问题分级

每个问题分为三类：

- URGENT：严重影响机会，必须优先修改。
- CRITICAL：重要但可优化，建议修改。
- OPTIONAL：细节改进，非必须但推荐。

问题列表最多20条。优先保留URGENT，其次CRITICAL，最后OPTIONAL。

## 输出格式

诊断结果必须包含：

```json
{
  "meta": { "rubric_version": "via-five-layer-v1" },
  "scores": {
    "overall": 0,
    "projected_improvement": 0,
    "dimensions": {
      "judgement": 0,
      "structure": 0,
      "alignment": 0,
      "expression": 0,
      "format": 0
    }
  },
  "summary": "整体诊断总结",
  "issues": [
    {
      "id": "URG-001",
      "severity": "URGENT",
      "path": "professional_experience[0].highlights[0]",
      "evidence": "问题所在位置和原文",
      "suggestion": "具体修改建议",
      "new_value": "建议修改后的具体内容"
    }
  ]
}
```

## 路径和证据规则

如果输入是结构化简历JSON，问题的`path`必须指向真实存在的叶子节点：

- `education[0].gpa`
- `professional_experience[0].job_title`
- `professional_experience[0].highlights[2]`
- `project_experience[1].highlights[0]`
- `additional_information.technical_skills[0]`
- `additional_information.languages[0].proficiency`

禁止把`path`指向整个数组、整个对象或不存在的字段，例如：

- `education`
- `professional_experience[0].highlights`
- `summary`
- `basic_info.objective`

如果输入来自PDF、Word、截图或纯文本，且没有结构化JSON路径，`path`改用可定位证据：

```text
文件名#页码#模块#原句序号
截图编号#可见区域#原句序号
粘贴文本#模块#原句序号
```

`evidence`必须描述问题所在位置和问题原文。`suggestion`必须给出具体改法。`new_value`必须是可以直接替换的文本；缺少事实时，写“需要用户补充具体数字或结果”，不要代造。

## 诊断步骤

1. 读取简历内容、岗位名称、JD解析结果和公司岗位调研结果。
2. 按五个层级逐一检查，记录每个维度的问题和分数。
3. 从JD提取10个关键词，建立JD要求和简历证据映射。
4. 对每个问题定位到具体路径或证据位置。
5. 生成`evidence`、`suggestion`、`new_value`。
6. 汇总问题，按URGENT、CRITICAL、OPTIONAL排序。
7. 如果问题超过20条，合并重复问题，只保留影响最大的修改点。
8. 生成`summary`、五项分数、`overall`和`projected_improvement`。

## 修改原则

- 修改要忠于已有经历。缺少事实时，先写“需要用户补充数据”，不要代造指标。
- 可以帮用户把真实经历改得更清楚，不能把未做过的职责写进去。
- 对硬性条件不满足的岗位，直接说明风险，不靠话术掩盖。
- 如果JD和公司调研显示岗位更看重某类能力，简历修改要围绕该能力重排内容。
- 不诊断或修改姓名、电话、邮箱、证件号、住址等基础个人信息。
- 不修改`resume_language`等元数据字段。
