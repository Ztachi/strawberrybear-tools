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

Vue props：`document`、`transport` 必填，`variant`、`selectedTrackId`、`timeZoom`、`pitchZoom`、`hideEmptyTracks`、`labels`、`theme`、`plugins` 可选。`toolbar` slot 用于关闭按钮等宿主控件。容器必须通过 CSS 指定高度；组件使用完整容器高度，不用歌曲时长决定布局高度。

公共 Vue 层不绑定 Ant Design、Element 或其它 UI 框架。需要与宿主设计系统一致时，将 `showToolbarControls` 设为 `false`，通过 `title`、`toolbar` 和 `corner` slot 注入宿主的标题、按钮和滑块；总览轨道开关通过 `renderTrackToggle(container, context)` 注入，可能被省略的轨道名称通过 `renderTrackLabel(container, context)` 注入。渲染器把组件挂载到给定容器，并返回清理函数；虚拟行离开可见区域及视图销毁时都会清理。`context.onChange()` 只提交切换意图，实际启用状态仍由宿主更新 `document.tracks[].enabled`。轨道名称应先测量 `scrollWidth > clientWidth`，只有发生省略时才显示 Tooltip。

依赖主题或语言 Provider 的 Vue 控件应通过页面组件树中的 `Teleport` 放入挂载点，保留祖先的依赖注入。不要直接用独立的 `render(h(Component), container)` 代替，否则控件虽然来自 UI 库，却可能丢失宿主主题。挂载点回调可以登记 `{ container, context }`，由页面渲染对应 Teleport；更新状态时复用挂载点的稳定 key，清理时删除登记项。这样公共层保持框架无关，宿主 UI 控件继续继承页面的主题和语言。

Follow 开启时直接生成三段画面：开头内容固定，播放头走向中线；中段播放头固定在中线，只有卷轴移动；曲尾内容固定在末端，播放头从中线走向终点。全曲已在一屏内时，内容始终固定。关闭 Follow 后，滚动位置完全由用户控制，播放头按真实时间投射到这个视口，移出视野就隐藏，不会自动拉回。两个实例分别计算，纵向浏览音轨或音高不改变这一横向模式。

| 事件              | 参数                | 宿主处理                                      |
| ----------------- | ------------------- | --------------------------------------------- |
| `select-track`    | 标准轨道 ID         | 选择轨道                                      |
| `open-editor`     | 轨道 ID、手势上下文 | 打开、切换或关闭非模态浮层                    |
| `toggle-track`    | 标准轨道 ID         | 更新自己的启用状态，再替换 document.tracks    |
| `seek`            | 原曲秒              | 点击标尺或手柄松手，仅提交一次音频 seek       |
| `seek-preview`    | 原曲秒或 null       | 可选地预览另一个视图的指针；不能调用音频 seek |
| `follow-change`   | boolean             | 当前实例的 Follow 状态                        |
| `viewport-change` | 只读视口快照        | 可选保存缩放/滚动或显示状态                   |

文档使用不可变输入：音符变化时替换 `document.notes`，不要原地修改数组。每个音符和轨道都使用稳定字符串 ID。旧版 `notes/duration/currentTime/disabledTracks` props 已迁移为 `document/transport`；时间单位由旧毫秒改为明确的原曲秒。Rust 轨道索引与 MIDI 播放器 1-based 索引的换算属于 app adapter，不进入公共包。

轨道左侧提供明确的启用开关，可用鼠标、空格或 Enter 操作。开关只发出 `toggle-track` 意图；宿主更新 `document.tracks[].enabled` 后，开关和两个视图同步反映状态。它不会选中轨道、打开详情或触发 seek。完整状态回传见最小示例的 `toggleTrack()`。

双击前会先发生两次单击，因此 `open-editor` / `onTrackOpen` 的第二参数提供 `selectedTrackIdAtGestureStart`。需要“再次双击当前轨道关闭”时，用这个字段与目标轨道比较，不能比较已经被单击更新的 `selectedTrackId`；双击另一轨道应切换并保持打开。只接收 ID 的既有回调仍然兼容，完整写法见最小组合示例。

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
overview.setHideEmptyTracks(true) // 仅隐藏总览中的空轨，不删除轨道或改变播放数据
// 宿主卸载时释放观察器、事件、RAF 和插件。
overview.destroy()
editor.destroy()
```

`getViewport()` 返回滚动、时间/音高缩放、`minTimeZoom` / `maxTimeZoom` 和 Follow 的快照。`subscribe()` 返回取消订阅函数，`fitToSong()` 显示全曲，`setFollow(true)` 立即回到播放位置。插件通过 `{ id, install(view) => cleanup }` 安装并使用公开 API，卸载时统一清理；没有暴露可变 Canvas 或音符内部状态，未来编辑命令可复用相同稳定 ID。

## 编辑手势层

视图始终"不改文档"。传入 `editing` 后，详情视图把指针操作解析为 `PianoRollEditIntent`（select / add-note / move / resize / set-velocity / delete / loop-change / audition / context-menu）交给宿主，宿主应用到文档后再 `setDocument`；Vue 组件同时通过 `edit-intent` 事件发出。

```ts
view.setEditing({
  enabled: true,
  tool: 'select',                          // 或 'draw'
  selectedNoteIds: selection,              // 宿主状态的只读投影
  snapTicks: (tick, mode) => session.snapTick(tick, mode),
  defaultDurationTicks: 480,
  highlightPitches: playablePitches,       // 不可演奏音高会被遮罩/灰化
  loop: { startTick: 0, endTick: 1920 },   // 标尺 Alt+拖拽产生，双击清除
  velocityLaneHeight: 64,                  // 0 隐藏力度条
  onIntent: (intent) => session.dispatch(intent),
})
```

交互约定：点选/Shift 加选，空白拖拽框选，双击空白落音符；拖音符体移动（以按住的音符为吸附基准，Alt 关闭吸附）、拖左右缘拉伸；draw 工具点击即落并横拖定长；右键发 `context-menu`；拖动期间只绘制 overlay 幽灵，松手才提交一次意图，Esc 取消。总览视图可通过 `renderTrackActions(container, { track })` 在轨道行右侧挂载宿主菜单，与 `renderTrackToggle` 同模式。相关主题 token：`noteSelected / noteGhost / noteUnplayable / selectionBox / loopRegion / velocityBar / pitchUnplayable`。

## 总览空轨筛选

`hideEmptyTracks` 默认为 `false`，保持所有原始轨道可见。Vue 可通过 `<PianoRoll :hide-empty-tracks="true" ... />` 设置；原生浏览器通过 `createTracksOverview({ hideEmptyTracks: true, ... })` 初始化，或调用 `setHideEmptyTracks(enabled)` 动态切换。总览和详情均可接受此配置，但只有总览的显示行受到影响。

空轨依据音符索引的有效音符判定：没有音符、只有非有限 tick/音高音符的轨道被隐藏；禁用但含有效音符的轨道仍然可见，继续使用原始轨道 ID 和启用状态。筛选不会修改传入文档、音符索引、全曲时长或当前选择，因此只含结束事件的长空轨被隐藏后，曲尾静音和 seek 范围仍保留。选中的空轨被隐藏时，已打开的详情仍显示该轨；恢复显示后选中状态也会恢复可见。

切换筛选会在同一实例内重新分配行高、裁剪超出内容范围的纵向滚动，不重置 Follow 或用户缩放；纵向滚动条变化时仍按实际时间区宽度更新缩放下限。若全部轨道为空，总览显示 `labels.empty`，标尺、时间轴和宿主工具栏保留，用户可以直接取消筛选。文档更新后会重新判定有效音符，无须重新挂载组件。

总览默认让音轨行均分时间区的可用高度，随容器伸缩，最低每行 56 px；只有所有轨道在最小高度下仍放不下时才产生纵向滚动条。有更多空间时，自动行可以继续增高。原生接入可用 `trackHeights` 或 `setTrackHeight()` 指定个别轨道高度（56–320 px），其余轨道均分剩余空间。行布局、音符渲染、左侧控件和命中测试共用同一份几何数据。

## 主题定制

默认提供浅粉主题：暖白背景、粉色轨道、深玫瑰音符与播放头。浏览器和 Vue 使用同一套语义 token，公共包不依赖宿主的 CSS 框架或应用主题模块。

```ts
import type { PianoRollThemeInput } from '@strawberrybear/piano-roll/browser'

const theme: PianoRollThemeInput = {
  colors: {
    primary: '#7548a3',
    primarySoft: '#eee3f8',
    trackEnabled: '#e5d3f3',
    trackSelected: '#f2e9fa',
    overviewNote: '#583577',
    editorNote: '#7548a3',
    playhead: '#583577',
    playheadHandle: '#583577',
  },
  metrics: { controlRadius: '8px' },
}
// 原生 TS：overview.setTheme(theme)。Vue：<PianoRoll :theme="theme" ... />。
// 省略的字段沿用默认值；setTheme() 或移除 Vue theme prop 恢复默认主题。
```

颜色 token 包含背景/文字、轨道/音符、网格、播放头、琴键、滚动条与焦点；完整字段和中文说明见 [`PianoRollThemeInput`](./src/browser/theme.ts)。`defaultPianoRollTheme`、`resolvePianoRollTheme`、`pianoRollThemeVariables` 也从 `/browser` 导出。`getTheme()` 返回当前主题副本。动态换肤只重绘静态图层，保留 DOM、轨道选择、缩放、滚动及 Follow。

Canvas 需要具体颜色值，例如十六进制、`rgb()` 或 `rgba()`，不能直接传 `var(--app-primary)`。从现有 CSS 变量接入时先通过 `getComputedStyle(element).getPropertyValue('--app-primary').trim()` 读取具体值，再传入 `theme`。不要仅覆盖 `--pr-*` CSS 变量来改变 Canvas 颜色。

## 精确时间轴与索引

`/core` 导入不访问 Vue、DOM、window 或 Tauri。`createTimeline(document)` 提供：

- `tickToSeconds` / `secondsToTick`：预计算分段起点并二分查找，保留原始 `microsecondsPerQuarter`。
- `tickToBeat`：以四分音符为单位；`tickToBarPosition` 返回从 1 开始的小节、拍和拍内 tick。
- `secondsToContentX` / `contentXToSeconds`：绝对内容坐标，调用者统一减去当前视图的 scrollLeft。
- `getRulerMarks`：仅生成可见范围的小节/拍/细分标记，拍号变化处开始新小节。缩放过小时减少密度。

完整时长来自 `durationTicks`，必须保留 MIDI End of Track 后的时间，不能从最后一个 NoteOff 推导。缺少 tempo/拍号时默认 500000µs、4/4；重复 tick 最后一个有效值生效。变速只改变外部时钟推进，不改音符 tick 或曲长。

总览的轨道行与粉色内容区域分开：轨道行可滚动和选择，粉色区域只覆盖本轨的时间范围，区域之间保留窄间距。通过 `PianoRollTrack.startTick` / `endTick` 传入范围；原始 MIDI 轨道通常传 `startTick: 0`，`endTick` 使用该轨完整结束 tick，从而保留本轨的前导和尾部静音。两者不改变文档的全曲时长、标尺、缩放边界或 seek。

没有范围元数据时，公共库按该轨音符的最早开始与最晚结束推导；空轨只显示起点标记。极短或零时长区域使用最小可见宽度，不把名称长度当作曲长，也不扩大全曲滚动范围。名称裁剪在区域内部，完整名称可在左侧轨道栏查看。显式范围不足以包含音符时，显示范围会包含有效音符并限制到文档时长。

`createNoteIndex(notes)` 提供按轨道的闭区间重叠查询和音域查询。区间树包含跨过整个视口的长音；20 万音符不会使用参数展开求最大值。backing store 只按可见宽高和 DPR 分配，滚动时仅绘制可见轨道与时间区间。

绘制按动画帧统一提交：标尺、网格、音符和播放头使用同一份时间与视口快照。自动模式保留内容坐标的亚像素精度，中段播放头坐标直接等于视口宽度的一半，不从原生滚动条取整后的偏移反推；原生滚动条只同步浏览位置。手动模式使用用户的实际滚动位置。

标尺刻度与音符使用相同的连续坐标，不在每一帧对屏幕位置取整。刻度密度以全曲最快 tempo 为基准，较慢段允许更疏，避免速度点进出视口时整批刻度切换。文字采用独立于细分线的标签密度，由全曲小节位数、拍号、字体和缩放确定；以内容坐标避让并保留视口外邻居，使标签在边缘自然裁剪，滚动时不重新选择可见标签。

图层按各自依赖失效：播放时间变化但内容未平移时只更新播放头；内容横移时绘制时间层，琴键不重画；琴键只在纵向位置、音高缩放、视口高度、主题或 DPR 改变时更新。横向 Follow 不回写纵向坐标，纵向滚轮由同一输入入口同步更新 Y，避免与浏览器异步滚动争用位置。

## 交互边界

Follow 默认开启，纵向浏览音轨或音高始终保持跟随。开启时，横向滚轮（包括 Shift+滚轮）先记录本次手势的净位移意图，小幅横向尾帧不改变画面、不冻结自动播放；明确横向滑动达到 **可见时间区域宽度的四分之一** 后才关闭当前视图的 Follow 并进入手动浏览。距离只来自用户横向输入，不计播放推进或普通滚动通知；纵向输入、滚轮停止 200ms、缩放、seek、文档或尺寸变化清除未确认的手势。边缘可移动范围不足时不降低确认阈值。

原生水平滚动条是明确的直接操作，抓住期间由用户控制；实际横移达到四分之一屏后关闭 Follow，未达到则在释放时恢复自动视口。Follow 关闭后，所有横向浏览立即生效，不再经过手势确认，播放推进也不改变用户的滚动位置。

普通 `scroll` 通知仅用于更新绘制，不用于推断手动操作；自动跟随、布局裁剪、延迟通知和重复通知都不能关闭 Follow。聚焦时间区后，左右方向键是明确的横向导航，实际移动时直接关闭当前视图的 Follow；上下方向键继续浏览纵向内容。点击 Follow 可恢复。两个视图的状态与临时浏览完全独立。

触控板按主导方向处理输入，纵向手势夹带的横向偏移会被过滤；滚轮仅作用于所在视图。Ctrl/Command + 滚轮以鼠标时间为锚缩放，工具栏缩放以可见播放头或视口中心为锚。详情支持完整 MIDI 0–127 琴键，初次进入居中于轨道音域，切换轨道仅在新音域不可见时调整纵向位置。

滑块、双指缩放产生的 Ctrl+滚轮、WebKit `gesturestart/change/end`、`setTimeZoom()` 与“适合全曲”共用下限：**时间区实际可见宽度 ÷ 完整曲长秒数**。左侧轨道栏/琴键和纵向滚动条不计入时间区；不添加尾部 padding，最小缩放时 `scrollWidth === clientWidth`，全曲恰好铺满且不能继续缩小。MIDI 本身的尾部静音仍保留。上限通常为 1200 px/s，极短曲目至少容纳整曲下限；零时长文档使用有限默认值。

WebKit 手势使用相对手势开始的 scale，锚点按右侧时间区计算，并抑制同一手势附带的重复 Ctrl+滚轮。原生页面缩放的阻止范围仅限当前卷帘；手势结束、取消、窗口失焦和实例销毁均释放状态。手势语义参考 [Apple 事件处理文档](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html)。

CSS 容器查询负责工具栏的响应式布局，`ResizeObserver` 根据当前滚动容器重新计算坐标与缩放边界，采用 60ms 防抖、180ms 最长等待。处于最小缩放时，调整容器后继续铺满；主动放大时尽量保留视口中心时间，必要时裁剪到新边界。隐藏容器不会以零宽覆盖已有状态，恢复显示后重新测量；销毁会取消待处理回调。两个视图分别计算，互不影响。

标尺点击默认不吸附；顶部手柄使用 pointer capture，靠近边缘自动滚动。手柄始终保持 18×25 px 的对称形状，中心与指针线共同指向真实时间；通过独立播放头图层和 CSS 层级覆盖轨道栏，不按边缘位置改变中心、宽度或尖端。音符和琴键各自在视口内裁剪；宿主不要在卷帘外层额外设置 `overflow: hidden`，以免裁掉跨过首尾边界的手柄。拖动保留按下时的抓取偏移，点击手柄边缘不会跳变时间。拖动只发预览，松手提交一次；pointercancel、Escape、失焦或销毁会取消预览。播放头支持键盘左右键（0.1s）、Shift+左右键（1s）及 Home/End。双击和轨道单击不触发 seek。

公共库不会创建遮罩、锁定页面、决定浮层高度或启动音频。app 自行提供非模态浮层、顶部拖动调整、关闭按钮及当前歌曲校验。视图只读取 `transport`，没有独立壁钟，因此页面挂起、暂停和倍速都应由音频适配层回传权威原曲时间。

宿主迁移面板到其它容器或独立窗口时，可保存 `view.getViewport()`，在新实例挂载后调用 `view.restoreViewport(saved)`。该方法恢复时间／音高缩放、双轴滚动和 Follow，裁剪到新容器边界并取消旧手势；开启 Follow 且正在播放时按当前播放位置恢复自动视口。它不会改变歌曲、播放状态或触发 seek。窗口创建、通信、关闭和视口保存由宿主负责。

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

### 倍率滑块与琴键布局

`browser` 入口导出 `timeZoomToSlider(zoom, min, max)` 与 `sliderToTimeZoom(value, min, max)`，将控制器唯一的真实 px/s 值可逆映射到 0–100 的对数滑块刻度；等倍缩放对应等距移动，0/100 精确对应一屏全曲／最大缩放。宿主只做显示转换，不保存第二份滑块状态。最小值和最大值始终读取当前 `getViewport()`，容器变化后重新映射。内置 Vue 滑块采用同样刻度。

WebKit 手势按相邻采样倍率更新当前实际缩放；在边界外继续捏合后反向，无需抵消隐藏的超界值。琴键白键层连续铺满 MIDI 0–127，黑键覆盖两个白键的接缝；E/F、B/C 无黑键。琴键中心仍与等高半音网格对应，时间缩放不改变琴键几何。

### 调整时间放大比例

总览和详情统一使用 `src/browser/zoom-config.ts` 中的 `TIME_ZOOM_CONFIG`（也从 `/browser` 导出）。修改源码中的这三个参数即可调整交互：

| 常量 | 默认值 | 作用 |
| --- | --- | --- |
| `maxPixelsPerSecond` | `4800` | 最大 CSS 像素/秒。原值为 1200，现最大展开距离为原来的 4 倍；同一滑块中点对应的距离约为原来的 2 倍。 |
| `gestureExponent` | `2` | 手势倍率指数，原效果为 1；手指放大 1.5 倍时，视图放大 2.25 倍。WebKit pinch 和 Ctrl/Meta+wheel 共用。 |
| `wheelLogScalePerPixel` | `0.01` | wheel 原始像素转换成对数倍率的系数，再乘 `gestureExponent`。只需进一步调节滚轮设备时修改。 |

增大这些正数会提高最大展开比例或手势灵敏度。最小缩放仍严格适合一屏；滑块始终反映控制器的真实 px/s，手势到达边界后反向立即响应。音符、标尺和播放头共同展开，真实音符时长与间隔比例保持不变。无休止、首尾相接的音符不会凭空出现时间空隙。已保存的 px/s 保持原值，下一次缩放才按新参数响应；音高缩放不受影响。

`corner` 插槽位于标尺左侧，提供 `{ view, viewport }`，适合放置跟随、轨道筛选等控件；提供插槽时替代默认角落文字。它保留宿主 Vue 的主题和国际化上下文。纯浏览器调用可使用 `renderCorner(container)`，返回可选清理函数。
