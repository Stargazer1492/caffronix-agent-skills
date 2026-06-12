# 视频配方

## 默认规格

- 竖屏：9:16。
- 时长：45到90秒。
- 结构：开场钩子、背景、转折、证据、判断、结尾观察点。
- 输出先做分镜和旁白，再生成HyperFrames工程，最后按需要渲染MP4。

## 人物故事视频

段落建议：

1. `0-5s`：开场钩子，用一句判断抓住人物矛盾。
2. `5-15s`：背景和球队角色。
3. `15-30s`：关键事件或比赛节点。
4. `30-50s`：数据、采访和媒体报道。
5. `50-70s`：争议、讨论和未确认边界。
6. `70-90s`：结尾判断和后续观察点。

## 比赛复盘视频

段落建议：

1. 比分和核心冲突。
2. 赛前条件。
3. 关键时间线。
4. 数据解释。
5. 影响和下一场看点。

## HyperFrames输入要点

- 每个片段对应一个`data-start`和`data-duration`。
- 旁白和字幕按句拆分，避免一屏字幕超过两行。
- 人物照片和视频截图必须来自`materials.json`里的素材，且标注`usageRisk`。
- 比赛画面版权不确定时，使用时间线、战术板、数据图、地图、球队色块和文字动效替代。
- 工程必须包含`DESIGN.md`、`index.html`、`package.json`、`hyperframes.json`和`meta.json`。
- 渲染前必须先跑`lint`，再跑`inspect`。公开成片使用`standard`或`high`质量，快速验证使用`draft`质量。

## 分镜输出结构

```json
{
  "format": "vertical",
  "aspectRatio": "9:16",
  "durationSeconds": 75,
  "segments": [
    {
      "id": "seg_001",
      "start": 0,
      "duration": 5,
      "hook": "",
      "voiceover": "",
      "onScreenText": "",
      "visual": "",
      "sourceIds": [],
      "assetIds": []
    }
  ]
}
```

## 生成视频工程

从`video_storyboard.json`生成HyperFrames工程：

```bash
node worldcup-media/scripts/build_hyperframes_video.mjs \
  --storyboard runs/<run-id>/video_storyboard.json \
  --materials runs/<run-id>/materials.json \
  --out-dir runs/<run-id>/hyperframes-video \
  --name <project-name>
```

如需旁白音频，先生成旁白文本：

```bash
node worldcup-media/scripts/build_voiceover_text.mjs \
  --storyboard runs/<run-id>/video_storyboard.json \
  --out-dir runs/<run-id>/audio
```

再调用本地TTS：

```bash
node worldcup-media/scripts/tts_voiceover.mjs \
  --input runs/<run-id>/audio/voiceover.txt \
  --output runs/<run-id>/audio/voiceover.wav
```

中文旁白在macOS上默认走系统`say`，输出WAV后由HyperFrames接入音轨。英文旁白可以走HyperFrames本地TTS。若要强制指定路径，使用`--provider macos-say`或`--provider hyperframes`。

生成视频工程时追加：

```bash
--audio runs/<run-id>/audio/voiceover.wav
```

脚本会生成：

```text
hyperframes-video/<project-name>/
├── DESIGN.md
├── index.html
├── package.json
├── hyperframes.json
├── meta.json
├── storyboard.input.json
└── assets/
```

## 校验和渲染

```bash
node worldcup-media/scripts/render_hyperframes_video.mjs \
  --project runs/<run-id>/hyperframes-video/<project-name> \
  --render \
  --quality draft
```

脚本串行执行：

1. `npx --yes hyperframes@0.6.90 lint`
2. `npx --yes hyperframes@0.6.90 inspect`
3. `npx --yes hyperframes@0.6.90 render --quality <level>`

如果只需要检查项目，不传`--render`。
