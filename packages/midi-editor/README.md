# @strawberrybear/midi-editor

无 UI 的 MIDI 编辑核心库。

`@strawberrybear/midi-editor` 在 `@strawberrybear/piano-roll/core` 的 `PianoRollDocument` 之上提供：不可变的编辑命令、撤销/重做、剪贴板、网格吸附与量化、SMF 编解码，以及基于 lookahead 的试听调度器。它不依赖 DOM、Vue、Tauri 或 WebAudio；宿主负责视图（钢琴卷帘）、发声（`SynthPort`）与持久化。

## 职责边界

本库负责：

- 音符命令：新增、删除、平移（整组截断不拆散）、拉伸、力度。
- 轨道命令：新增、删除（保留至少一条）、重命名/配色/通道/打击乐、复制、排序。
- 歌曲命令：单一 BPM、拍号、总长自动扩展到整小节。
- 吸附/量化/移调：`SnapResolution` 表、`snapTick`、`quantizeNotes`、`transposeNotes`。
- 历史：`createHistory` 线性栈，支持 `coalesceKey` 合并连续拖动。
- 剪贴板：相对时间复制、跨 PPQ 粘贴、`duplicate` 按网格接在选区之后。
- SMF：`encodeMidi`（format 1，conductor 轨 + 每编辑轨一条）与 `decodeMidi`。
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

## 项目文件

`MidiProject` 是持久化形态：`schemaVersion`、`id`、`name`、时间戳、来源、`meta` 摘要、`loop` 与完整 `document`。`session.toProject()` 会重算 `meta` 与 `updatedAt`，保存成功后调用 `session.markSaved()` 清除 dirty。

## 验证

```bash
pnpm --filter @strawberrybear/midi-editor type-check
pnpm --filter @strawberrybear/midi-editor test
pnpm --filter @strawberrybear/midi-editor lint
```
