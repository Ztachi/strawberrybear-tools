# @strawberrybear/keystroke-sequencer

把"已映射到物理键的音符区间"编译成满足游戏识别约束的按键事件时间轴，并按高精度时钟执行的公共库。

游戏（如无限暖暖自动演奏）通常按帧轮询键盘：一次按下必须保持至少 N 帧才能被识别（否则吞音）；同一个键两次按下之间必须有足够的抬起间隔（否则被识别为一次长按）。本库把这两条物理约束和 MIDI 音符时值的矛盾在**播放前一次性求解**，输出确定的 down/up 时间轴，执行阶段不再做任何时序决策。

## 设计目标

实时事件驱动的按键模拟（收到 NoteOn 才决定按下、收到 NoteOff 才决定抬起）无法正确处理约束冲突：为了保证同键可重按而提前释放，会误伤长音；为了保证识别而延长保持，会挤占下一个音。本库改为"先编译、后执行"：

- **不同物理键完全独立**，一个键上的长音不会被其他键上的任何音符截断。
- **短音自动拉长**到最短保持时间（`holdMs`），保证游戏轮询能识别，防吞音。
- **同键相邻按下**之间保证最短抬起间隔（`gapMs`），且截断只发生在同键冲突时。
- **同键过密**（间隔小于 `holdMs + gapMs`，物理上无法两全）时，后音仍准时按下（节奏优先），保持与间隔按 `holdMs : gapMs` 比例压缩。
- 执行器每次调度都以注入时钟重新校准，`setTimeout` 抖动不累积；暂停/停止/跳转/销毁时自动抬起所有按下的键。

## 职责边界

本库负责：

- 音符区间 → 按键事件时间轴的约束求解（`compileKeystrokeTimeline`，纯函数）。
- 时间轴的高精度执行、播放控制（play/pause/resume/seek/stop）和按下状态管理（`KeystrokeSequencer`）。

本库不负责：

- MIDI 解析、tempo 计算、音高到按键的映射（模板、移调、白键量化）。
- 真实按键 API（SendInput、Tauri command、CGEvent 等），通过 `onKeyDown` / `onKeyUp` 回调注入。
- UI 框架、状态管理、持久化。

## 安装与导入

在当前 pnpm workspace 内直接从包名导入：

```ts
import { KeystrokeSequencer, type KeystrokeNote } from '@strawberrybear/keystroke-sequencer'
```

请只从包入口导入公共 API，不要依赖 `src/*` 内部路径。

## 快速开始

```ts
import { KeystrokeSequencer } from '@strawberrybear/keystroke-sequencer'

const sequencer = new KeystrokeSequencer({
  // 全曲音符：物理键 + 开始时间 + 持续时间（毫秒，音乐时间）
  notes: [
    { key: 'Q', startMs: 0, durationMs: 2000 }, // 长音
    { key: 'W', startMs: 100, durationMs: 80 }, // 长音期间的旋律，互不影响
    { key: 'W', startMs: 300, durationMs: 80 },
  ],
  // 按键识别约束，通常由游戏 FPS 推导：2 帧轮询 + 调度抖动余量
  timing: { holdMs: 54, gapMs: 54 },
  speed: 1,
  onKeyDown: (key) => simulateKeyDown(key),
  onKeyUp: (key) => simulateKeyUp(key),
  onEnded: () => console.log('演奏结束'),
})

sequencer.play() // 从头开始
sequencer.pause() // 暂停并抬起所有键
sequencer.resume() // 从暂停位置继续，跨界长音会重按
sequencer.seek(30_000) // 跳转到 30 秒
sequencer.stop() // 停止并归零
sequencer.dispose() // 销毁（等价 stop）
```

## 公共 API

### 类型

- `KeystrokeNote` — 输入音符：`{ key, startMs, durationMs }`
- `KeystrokeTiming` — 约束：`{ holdMs, gapMs }`
- `KeystrokeEvent` / `KeystrokeEventType` — 编译产物：`{ atMs, type: 'down' | 'up', key }`
- `KeystrokeSequencerOptions` — 构造配置
- `KeystrokeSequencerStatus` — `'idle' | 'playing' | 'paused' | 'ended'`

### 函数

- `compileKeystrokeTimeline(notes, timing)` — 纯函数，返回按时间升序、同键 down/up 严格交替的事件数组。可单独用于可视化或导出。

### KeystrokeSequencer

- `play(fromMs?)` — 从指定位置（默认上次位置）开始播放；跨越起始位置的长音会立即重按。
- `pause()` / `resume()` — 暂停会抬起所有键；恢复从暂停位置继续。
- `seek(positionMs)` — 播放中立即从新位置继续，否则只记录位置。
- `stop()` / `dispose()` — 抬起所有键并归零。
- `getPositionMs()` — 当前音乐时间位置。
- `status` / `isPlaying` / `durationMs` — 状态与时间轴长度。

## 编译规则明细

对每个物理键独立处理（按 `startMs` 排序后）：

1. **同刻归并**：同键同一时刻的多个音符归并为一次按下，保留最长时值。
2. **期望抬起** = `startMs + max(durationMs, holdMs)`（短音拉长防吞音）。
3. 有同键下一音时，设间隔 `I = next.startMs - startMs`：
   - `I >= holdMs + gapMs`：抬起 = `min(期望抬起, next.startMs - gapMs)`。
   - `I < holdMs + gapMs`（过密）：抬起 = `startMs + I × holdMs / (holdMs + gapMs)`，后音准时按下。
4. 无同键下一音时按期望抬起。

输出保证：全局时间升序（同刻 up 先于 down）、同键 down/up 严格交替、非过密时同键抬起间隔 ≥ `gapMs`。

## 测试

```bash
pnpm --filter @strawberrybear/keystroke-sequencer test
pnpm --filter @strawberrybear/keystroke-sequencer type-check
pnpm --filter @strawberrybear/keystroke-sequencer lint
```

当前测试覆盖：长音不被其他键截断（核心回归）、短音拉长、同键截断与间隔、过密比例压缩、同刻归并、和弦独立、结构不变量，以及执行器的派发时序、暂停释放、跨界长音恢复、seek、速度缩放和自然结束。

## 维护约束

- 公共 API 变更必须同步更新本 README 和 CHANGELOG。
- 本包不能引入 UI 框架、Tauri、MIDI parser 或业务应用依赖，保持零运行时依赖。
- 所有时序决策必须留在编译阶段；执行器只做"到点派发"和状态兜底。
