# @strawberrybear/piano-roll

只读 MIDI 多轨总览和单轨钢琴卷帘。公共库负责时间映射、网格、音符、缩放、滚动、Follow 和 seek 意图；宿主负责播放、MIDI 解析、轨道启用策略及浮层布局。本版不新增、删除或修改音符。

## 最小 Vue 接入

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { PianoRoll } from '@strawberrybear/piano-roll/vue'
import type { PianoRollDocument } from '@strawberrybear/piano-roll/core'
import type { PianoRollTransport } from '@strawberrybear/piano-roll/browser'

const document: PianoRollDocument = {
  ticksPerBeat: 480,
  durationTicks: 3840,
  tempoMap: [{ tick: 0, microsecondsPerQuarter: 500000 }],
  timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: [{ id: 'piano', name: 'Piano', isPercussion: false, enabled: true }],
  notes: [{ id: 'n1', trackId: 'piano', pitch: 60, velocity: 96, startTick: 480, endTick: 960 }],
}
const transport = ref<PianoRollTransport>({ positionSeconds: 0, isPlaying: false, playbackRate: 1 })
const selected = ref('piano')
function seek(seconds: number) {
  // 实际项目在这里调用自己的播放器 seek，再回传权威 positionSeconds。
  transport.value = { ...transport.value, positionSeconds: seconds }
}
</script>

<template>
  <div style="height: 480px">
    <PianoRoll :document="document" :transport="transport" :selected-track-id="selected"
      @select-track="selected = $event" @seek="seek" />
  </div>
</template>
```

可运行的完整组合见 [examples/Minimal.vue](./examples/Minimal.vue)。双击主轨道的 `open-editor` 事件由 app 打开 `variant="editor"` 的第二个实例；主轨道单击只更新 `selectedTrackId`，使已打开详情切换内容。两个实例可以处在完全不同的滚动和缩放等级。`PianoRollOverview`、`PianoRollEditor` 是固定 variant 的具名便捷组件。根入口仍保留默认 Vue 导入。

Vue props：`document`、`transport` 必填，`variant`、`selectedTrackId`、`timeZoom`、`pitchZoom`、`labels`、`plugins` 可选。`toolbar` slot 用于关闭按钮等宿主控件。容器必须通过 CSS 指定高度；组件使用完整容器高度，不用歌曲时长决定布局高度。

| 事件                           | 参数          | 宿主处理                                      |
| ------------------------------ | ------------- | --------------------------------------------- |
| `select-track` / `open-editor` | 标准轨道 ID   | 选择轨道 / 打开非模态浮层                     |
| `toggle-track`                 | 标准轨道 ID   | 更新自己的启用状态，再替换 document.tracks    |
| `seek`                         | 原曲秒        | 点击标尺或手柄松手，仅提交一次音频 seek       |
| `seek-preview`                 | 原曲秒或 null | 可选地预览另一个视图的指针；不能调用音频 seek |
| `follow-change`                | boolean       | 当前实例的 Follow 状态                        |
| `viewport-change`              | 只读视口快照  | 可选保存缩放/滚动或显示状态                   |

文档使用不可变输入：音符变化时替换 `document.notes`，不要原地修改数组。每个音符和轨道都使用稳定字符串 ID。旧版 `notes/duration/currentTime/disabledTracks` props 已迁移为 `document/transport`；时间单位由旧毫秒改为明确的原曲秒。Rust 轨道索引与 MIDI 播放器 1-based 索引的换算属于 app adapter，不进入公共包。

## 原生 TypeScript 浏览器接入

```ts
import { createTracksOverview, createPianoRollEditor } from '@strawberrybear/piano-roll/browser'

const overview = createTracksOverview({ container, document, transport, onSeek: seek })
const editor = createPianoRollEditor({ container: floatingContainer, document, selectedTrackId: 'piano', onSeek: seek })
overview.setTransport({ positionSeconds: 2.5, isPlaying: true, playbackRate: 1 })
editor.setTransport({ positionSeconds: 2.5, isPlaying: true, playbackRate: 1 })
editor.setTimeZoom(180) // px / 原曲秒，只改变此实例
editor.setPitchZoom(20) // px / 半音
editor.setSelectedTrack('piano')
overview.setTrackHeight('piano', 140)
// 宿主卸载时释放观察器、事件、RAF 和插件。
overview.destroy()
editor.destroy()
```

`getViewport()` 返回滚动、时间/音高缩放和 Follow 的快照。`subscribe()` 返回取消订阅函数，`fitToSong()` 显示全曲，`setFollow(true)` 立即回到播放位置。插件通过 `{ id, install(view) => cleanup }` 安装并使用公开 API，卸载时统一清理；没有暴露可变 Canvas 或音符内部状态，未来编辑命令可复用相同稳定 ID。

## 精确时间轴与索引

`/core` 导入不访问 Vue、DOM、window 或 Tauri。`createTimeline(document)` 提供：

- `tickToSeconds` / `secondsToTick`：预计算分段起点并二分查找，保留原始 `microsecondsPerQuarter`。
- `tickToBeat`：以四分音符为单位；`tickToBarPosition` 返回从 1 开始的小节、拍和拍内 tick。
- `secondsToContentX` / `contentXToSeconds`：绝对内容坐标，调用者统一减去当前视图的 scrollLeft。
- `getRulerMarks`：仅生成可见范围的小节/拍/细分标记，拍号变化处开始新小节。缩放过小时减少密度。

完整时长来自 `durationTicks`，必须保留 MIDI End of Track 后的时间，不能从最后一个 NoteOff 推导。缺少 tempo/拍号时默认 500000µs、4/4；重复 tick 最后一个有效值生效。变速只改变外部时钟推进，不改音符 tick 或曲长。

`createNoteIndex(notes)` 提供按轨道的闭区间重叠查询和音域查询。区间树包含跨过整个视口的长音；20 万音符不会使用参数展开求最大值。网格、音符与播放头分层，播放头更新不查询音符或重置 Canvas；backing store 只按可见宽高和 DPR 分配。滚动时仅绘制可见轨道与时间区间。

## 交互边界

Follow 默认开启。手动滚动只关闭当前实例的 Follow，点击 Follow 可恢复。滚轮在对应滚动容器内生效；Ctrl/Command + 滚轮以鼠标时间为锚缩放，工具栏缩放以可见播放头或视口中心为锚。详情支持完整 MIDI 0–127 琴键，初次进入居中于轨道音域，切换轨道仅在新音域不可见时调整纵向位置。

标尺点击默认不吸附；顶部手柄使用 pointer capture，靠近边缘自动滚动。拖动只发预览，松手提交一次；pointercancel、Escape、失焦或销毁会取消预览。播放头支持键盘左右键（0.1s）、Shift+左右键（1s）及 Home/End。双击和轨道单击不触发 seek。

公共库不会创建遮罩、锁定页面、决定浮层高度或启动音频。app 自行提供非模态浮层、顶部拖动调整、关闭按钮及当前歌曲校验。视图只读取 `transport`，没有独立壁钟，因此页面挂起、暂停和倍速都应由音频适配层回传权威原曲时间。

## 验证

```bash
pnpm --filter @strawberrybear/piano-roll type-check
pnpm --filter @strawberrybear/piano-roll lint
pnpm --filter @strawberrybear/piano-roll build
pnpm --filter @strawberrybear/piano-roll test
pnpm --filter @strawberrybear/piano-roll exec playwright install chromium
pnpm --filter @strawberrybear/piano-roll test:browser
```

包级 type-check 使用 vue-tsc，包含 TS、Vue 和最小示例。测试覆盖分段 tempo、非整数 BPM、拍号变化、首尾静音、长音和 20 万音符索引，以及缩放/跟随边界。设备验收还应检查实际音频输出延迟；显示时间正确并不等同于声卡延迟校准。

浏览器回归使用 Playwright，覆盖独立双视图、不同缩放的 seek 一致性、拖拽单次提交、取消与失焦、边缘滚动和 20 万音符分层渲染。已有系统 Chrome 时可使用 `PIANO_ROLL_BROWSER_CHANNEL=chrome pnpm --filter @strawberrybear/piano-roll test:browser`。
