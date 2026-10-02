# @strawberrybear/midi-editor

无 UI 的 MIDI 编辑核心库。

`@strawberrybear/midi-editor` 在 `@strawberrybear/piano-roll/core` 的 `PianoRollDocument` 之上提供：不可变的编辑命令、撤销/重做、剪贴板、网格吸附与量化、SMF 编解码，以及基于 lookahead 的试听调度器。它不依赖 DOM、Vue、Tauri 或 WebAudio；宿主负责视图（钢琴卷帘）、发声（`SynthPort`）与持久化。

## 职责边界

本库负责：

- 音符命令：新增、删除、平移（整组截断不拆散）、拉伸、力度。
- 轨道命令：新增、删除（保留至少一条）、重命名/配色/通道/打击乐、复制、排序、区域右边界调整。
- 歌曲命令：单一 BPM、拍号、按最长启用区域右边界计算总长。
- 吸附/量化/移调：`SnapResolution` 表、`snapTick`、`quantizeNotes`、`transposeNotes`。
- 历史：`createHistory` 线性栈，支持 `coalesceKey` 合并连续拖动。
- 剪贴板：相对时间复制、跨 PPQ 粘贴、`duplicate` 按网格接在选区之后。
- SMF：`encodeMidi`（format 1，conductor 轨 + 每启用轨一条，保留各轨自身边界）与 `decodeMidi`。
- 试听：`createEditorTransport`，位置由注入的音频时钟推导，支持循环区与倍速。
- 会话：`createEditorSession` 汇总以上能力，所有变更走 `dispatch(EditorAction)`。

本库不负责：

- Canvas/DOM 手势识别（由 `@strawberrybear/piano-roll` 的 editing 层把指针操作解析成意图）。
- 发声实现、soundfont、AudioContext。
- 文件读写、对话框、i18n 文案。

## 快速使用

```ts
import {
  createEditorSession,
  createEditorTransport,
  createProject,
  encodeMidi,
} from '@strawberrybear/midi-editor'

const session = createEditorSession(createProject({ name: 'Demo' }), {
  trackDefaultName: (index) => `音轨 ${index}`,
})
session.subscribe((state) => render(state.document, state.selection))

// 钢琴卷帘的 edit-intent 可直接透传
session.dispatch({ type: 'add-note', trackId: 'track-1', pitch: 60, startTick: 0, durationTicks: 480 })
session.dispatch({ type: 'undo' })

const transport = createEditorTransport({
  getDocument: () => session.getState().document,
  synth: mySynthPort,          // noteOn / noteOff / allNotesOff
  now: () => audioContext.currentTime,
})
transport.setLoop({ startTick: 0, endTick: 1920 })
transport.play()

const bytes = encodeMidi(session.getState().document, { name: session.getState().project.name })
```

文档变化后需调用 `transport.invalidate()` 重建事件表；`SynthPort.allNotesOff` 必须同时取消尚未触发的排程，倍速与 seek 依赖这一点避免重复发声。

## 音轨区域与曲长

`ensureDurationCovers` 以启用轨道有效区域的最大 `endTick` 计算曲长；只有未声明边界的旧轨道才按音符尾端推断。禁用、删除或缩短最长区域会同步缩短 `durationTicks`。全部禁用时曲长为 0，禁用轨道的编辑数据继续保留。

`session.dispatch({ type: 'resize-track-region', trackId, endTick })` 调整区域右边界，最短为起点之后 1 tick。缩短只限制有效范围，不删除或改写原始音符，保存重开后拉长仍能恢复；跨边界音符在试听和导出时截断，起点在右边界及之后的音符不参与。一段拖动只在松手提交一次。显式新增或修改音符时间超出边界时会延长所属区域，仅改力度、音高或删除不会恢复隐藏尾部。新文档首轨为 8 小节，新添空轨为 1 小节。宿主可给视图增加留白，但不能把浏览留白写入试听、保存或导出的文档。

网格支持 `1/64`、`1/128`、`1/256` 和已有的整音符、三连音、小节及关闭选项；低 PPQ 时最小步长为 1 tick。总览区域拖拽按宿主网格吸附，也可通过 `snapToNoteEnds` 贴齐附近音符结尾；Option/Alt 临时绕过吸附。竖线和标尺位置标签在松手前预览实际落点。

`encodeMidi` 仅导出启用轨道有效范围内的音符，不将短轨的 End of Track 补齐到整曲结尾，曲尾之后的速度和拍号事件不写入文件。工程文件仍保留全部轨道和完整音符。

## 项目文件

新建、新增或从 MIDI 导入的轨道不自动分配颜色，缺省配色交给宿主视图主题。`addTrack(document, { color })` 与 `updateTrack` 可显式设置颜色，复制、排序和工程保存会保留它。`TRACK_PALETTE` 仅作为颜色选择器的预设色表，不再作为自动配色策略。

`MidiProject` 是持久化形态：`schemaVersion`、`id`、`name`、时间戳、来源、`meta` 摘要、`loop` 与完整 `document`。`session.toProject()` 会重算 `meta` 与 `updatedAt`，保存成功后调用 `session.markSaved()` 清除 dirty。

## 验证

```bash
pnpm --filter @strawberrybear/midi-editor type-check
pnpm --filter @strawberrybear/midi-editor test
pnpm --filter @strawberrybear/midi-editor lint
```
