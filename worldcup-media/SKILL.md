---
name: worldcup-media
description: Produce World Cup media workflows and outputs for football players, teams, matches, and story angles. Use when the user asks to collect real-time World Cup materials, verify source credibility, plan Rednote or Xiaohongshu social cards, create football story briefs, generate HyperFrames vertical video projects, or render short football story videos using traceable sources.
---

# Worldcup Media

本skill是世界杯主题内容生产工作流。它处理素材输入、来源归一、事实分级、卡片策划、视频分镜和HyperFrames视频工程生成，再按任务需要调用社交卡片、HyperFrames、网页搜索、图片搜索、网页智能体和图像生成能力。

## 适用范围

使用本skill处理以下任务：

- 围绕一个球员、球队、比赛或争议点收集世界杯相关素材。
- 从新闻、官方资料、图片、视频和社媒讨论整理`materials.json`和`sources.md`。
- 生成小红书、Rednote、公众号封面或社交轮播图的页面计划。
- 生成人物故事、比赛复盘、球队线索和争议背景的竖屏短视频分镜。
- 从分镜生成可校验、可预览、可渲染的HyperFrames竖屏视频工程。
- 把同一份素材清单交给`guizang-social-card-skill`或`hyperframes`继续生产。

## 能力路由

1. 实时网页素材优先使用当前会话中可用的搜索能力，例如Tavily、`web.search_query`或浏览器搜索。需要图片时使用`web.image_query`，并记录图片来源页。
2. 需要X、Grok、ChatGPT、DeepSeek等网页智能体辅助检索或判断时，按`use-web-agent`的规则执行。社媒讨论只能标为讨论信号，不能直接写成已确认事实。
3. 社交卡片生产优先调用`guizang-social-card-skill`。本skill只负责页面计划、来源约束、事实级别和视觉方向输入。
4. 视频生产优先调用`hyperframes`和`hyperframes-cli`。本skill先输出分镜、旁白、字幕建议和素材清单，再用`scripts/build_hyperframes_video.mjs`生成HyperFrames工程，用`scripts/render_hyperframes_video.mjs`执行lint、inspect和render。
5. `imagegen`只用于背景、地图氛围、概念插画、纹理、图标和非真实人物剪影。现役球员、教练、名人和新闻现场图片优先使用可溯源图片。

## 默认流程

1. 明确任务对象：球员、球队、比赛、赛事阶段、平台、目标篇幅和内容角度。
2. 建立运行目录。默认写入当前工作区的`worldcup-media/runs/<run-id>/`，不要写入skill安装目录。
3. 收集素材并保留原始链接、发布时间、媒体名、作者、图片来源页、视频来源页和摘录。
4. 如果用户只给人物、球队或比赛描述，先运行`scripts/search_materials.mjs`自动搜索并生成`materials.raw.json`和`search_report.md`。默认抽取原文页图片URL，图片必须同时保留`imagePageUrl`。
5. 运行或参考`scripts/normalize_sources.mjs`生成`materials.json`和`sources.md`。
6. 按`references/source-policy.md`给事实分级：已确认、媒体报道、社媒讨论、推测。
7. 按内容目标读取对应参考：
   - 卡片计划读取`references/card-recipes.md`。
   - 视频分镜读取`references/video-recipes.md`。
   - 人物、比赛、球队和争议结构读取`references/story-patterns.md`。
8. 运行或参考`scripts/build_brief.mjs`生成`brief.md`、`card_plan.json`和`video_storyboard.json`。
9. 需要旁白时，运行`scripts/build_voiceover_text.mjs`生成旁白文本。需要本地TTS时，再运行`scripts/tts_voiceover.mjs`生成`voiceover.wav`。
10. 需要视频成片时，运行`scripts/build_hyperframes_video.mjs`生成HyperFrames工程，再运行`scripts/render_hyperframes_video.mjs`做lint、inspect和MP4渲染。
11. 交给下游skill或发布前做最终检查：时间是否最新、来源是否可追溯、人物肖像是否安全、事实级别是否清楚、卡片和视频是否引用同一份素材清单。

## 输入和输出

最小输入：

```text
对象：球员、球队或比赛
平台：小红书、Rednote、公众号、抖音、TikTok或其他
目标：卡片、视频分镜、卡片加视频分镜
角度：成长故事、比赛复盘、数据对比、争议背景、球队线索等
```

标准输出：

```text
runs/<run-id>/
├── materials.raw.json
├── materials.json
├── sources.md
├── brief.md
├── card_plan.json
├── video_storyboard.json
└── hyperframes-video/
    └── <project-name>/
        ├── DESIGN.md
        ├── index.html
        ├── package.json
        ├── hyperframes.json
        ├── meta.json
        └── renders/
```

## 运行规则

- 不把旧新闻当新新闻。涉及“最新”“刚刚”“今天”“昨晚”时必须核对发布日期和事件日期。
- 不把球迷讨论、博彩赔率、论坛观点和二手聚合内容写成已确认事实。
- 每个核心事实至少保留一个来源链接；关键争议至少保留两个独立来源。
- 人物照片、比赛照片、新闻截图和视频片段必须记录来源页。无法确认来源时，只能作为参考素材，不能进入最终成品。
- 明确标注授权风险。没有授权的图片和视频素材只用于内部策划，公开发布前需要替换为可授权素材或平台允许使用的素材。
- 生成型视觉不得伪装成新闻照片、现场照片或真实人物照片。
- 输出公开文案时避免夸大和断言，把来源级别体现到措辞中。

## 脚本

- `scripts/collect_materials.mjs`：把人工输入的素材种子或检索记录整理成`materials.raw.json`模板。
- `scripts/search_materials.mjs`：根据人物、球队、比赛和角度自动搜索网页素材，生成`materials.raw.json`和`search_report.md`。
- `scripts/normalize_sources.mjs`：把原始素材归一成`materials.json`和`sources.md`。
- `scripts/build_brief.mjs`：从`materials.json`生成内容brief、卡片计划和竖屏视频分镜骨架。
- `scripts/build_voiceover_text.mjs`：从`video_storyboard.json`提取旁白文本。
- `scripts/tts_voiceover.mjs`：调用HyperFrames TTS把旁白文本生成`voiceover.wav`。
- `scripts/build_hyperframes_video.mjs`：从`video_storyboard.json`生成HyperFrames竖屏视频工程。
- `scripts/render_hyperframes_video.mjs`：串行调用HyperFrames CLI执行lint、inspect和可选MP4渲染。

脚本是辅助工具。实时搜索、浏览器访问、截图和卡片渲染仍由当前会话可用工具及下游skill完成。`search_materials.mjs`可以抽取原文页图片URL，`build_hyperframes_video.mjs`会把可下载图片复制到HyperFrames工程的`assets/`并嵌入视频画面。MP4渲染依赖当前环境的`npx hyperframes`、Node.js、Chrome和FFmpeg。

## 自动搜索素材

用户只给人物或故事角度时，先自动搜索：

```bash
node worldcup-media/scripts/search_materials.mjs \
  --person "Vinicius Junior" \
  --topic "Brazil World Cup 2026" \
  --angle "player to watch and national team ceiling" \
  --out-dir runs/<run-id> \
  --max-results 10
```

如果当前环境有`TAVILY_API_KEY`，脚本优先走Tavily；否则降级到公开搜索页面。脚本会打开候选原文页，抽取`og:image`、`twitter:image`或结构化数据里的图片，并把原文页记录为`imagePageUrl`。不需要图片时传`--no-images`。

## 视频制作命令

从已有分镜生成视频工程：

```bash
node worldcup-media/scripts/build_hyperframes_video.mjs \
  --storyboard runs/<run-id>/video_storyboard.json \
  --materials runs/<run-id>/materials.json \
  --out-dir runs/<run-id>/hyperframes-video \
  --name <project-name> \
  --layout poster \
  --width 1080 \
  --height 1440
```

如果`materials.json`里的来源带有`imageUrl`，视频工程会优先把图片下载到`assets/`并用于对应片段。`--layout poster`会把每个片段渲染为整页人物海报，图片用`cover`裁剪以适配竖屏画面，不拉伸变形。需要3:4视频时使用`--width 1080 --height 1440`。海报模式默认不在画面里显示`SRC_...`来源标签，来源保留在`sources.md`和工程元数据中；内部审稿需要时再传`--show-source-labels`。下载失败或来源没有图片时，片段会回退到编辑化文字视觉卡。

海报模式的文字应集中在底部。底部字幕字号要可读，最多显示三行，避免在人物脸部和主体动作区域堆叠文字。
如果旁白较长，在分镜里使用`posterText`写短画面文案，完整`voiceover`只进入音频，不直接塞进画面底部。

海报视频应避免重复图片。多个事实点依赖同一张图片时，合并到同一页分镜里讲述，不要在多个片段复用同一张人物图。

校验并渲染MP4：

```bash
node worldcup-media/scripts/render_hyperframes_video.mjs \
  --project runs/<run-id>/hyperframes-video/<project-name> \
  --render \
  --quality draft
```

如果用户已有第三方TTS或克隆声音成品音频，把音频文件传给`--audio`，脚本会复制到HyperFrames工程的`assets/`并作为独立音轨接入。

需要本地TTS时：

```bash
node worldcup-media/scripts/build_voiceover_text.mjs \
  --storyboard runs/<run-id>/video_storyboard.json \
  --out-dir runs/<run-id>/audio

node worldcup-media/scripts/tts_voiceover.mjs \
  --input runs/<run-id>/audio/voiceover.txt \
  --output runs/<run-id>/audio/voiceover.wav
```

随后生成视频工程时增加：

```bash
--audio runs/<run-id>/audio/voiceover.wav
```

中文旁白在macOS上默认使用系统`say`和`Tingting`语音生成WAV；英文旁白默认使用HyperFrames TTS。需要强制指定时，传`--provider macos-say`或`--provider hyperframes`。

## 参考文件

- 读取`references/source-policy.md`处理来源可信度、事实分级、图片和视频素材风险。
- 读取`references/story-patterns.md`选择人物、比赛、球队、争议和数据故事结构。
- 读取`references/card-recipes.md`生成小红书、Rednote、公众号封面和社交轮播图计划。
- 读取`references/video-recipes.md`生成竖屏短视频分镜、旁白、字幕和HyperFrames输入。
