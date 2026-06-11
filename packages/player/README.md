# @strawberrybear/player

平台无关的播放器状态机公共库。

`@strawberrybear/player` 负责播放调度、队列、播放列表、播放模式、进度、音量、错误和事件派发。它本身不发声，也不绑定任何 UI 框架。真实音频能力通过 `AudioPlayerPort` 注入，因此同一套核心可以协调 WebAudio MIDI 试听、Tauri/Rust 桥接、React Native 音频实现或测试 mock。

## 设计目标

播放器逻辑很容易在应用里散开：组件知道当前媒体，store 手写上一曲/下一曲，平台适配器直接写 UI 状态，后续增加播放列表或随机播放时又需要改很多地方。本库把这些规则收敛到一个稳定的公共状态机里。

适用场景：

- 应用需要一个稳定的 `PlayerState` 快照给 UI store 使用。
- 应用需要队列、播放列表、循环、随机、上一曲、下一曲和历史回退能力。
- 应用希望统一处理播放、暂停、恢复、停止、seek、自然结束和错误恢复。
- 应用希望平台层只实现播放能力，不拥有业务状态。

## 职责边界

本库负责：

- 当前媒体、播放队列、播放列表元信息、最近播放和播放历史。
- 播放命令：`play`、`pause`、`resume`、`stop`、`seek`、`previous`、`next`。
- 队列编辑：`setQueue`、`setPlaylist`、`addToQueue`、`insertNext`、`removeFromQueue`、`clearQueue`。
- 播放策略：列表循环、单曲循环、随机播放、自然结束策略。
- 平台事件回灌：开始播放、暂停、等待缓冲、停止、进度、自然结束和错误。
- 通过事件订阅向应用层输出不可变状态快照。

本库不负责：

- 音频解码、WebAudio、MIDI 解析、soundfont 加载、Tauri command 或 React Native 原生音频 API。
- Vue、Pinia、React、路由、播放条 UI、系统托盘、窗口行为。
- 业务 DTO 归一化、远端播放地址请求、文件导入、权限检查、模板映射或持久化。

## 安装与导入

在当前 pnpm workspace 内直接从包名导入：

```ts
import { Player, type AudioPlayerPort, type MediaItem } from '@strawberrybear/player'
```

请只从包入口导入公共 API，不要依赖 `src/*` 内部路径。

## 快速开始

```ts
import { Player, type AudioPlayerPort } from '@strawberrybear/player'

const audio: AudioPlayerPort = {
  async load(media) {
    console.log('加载媒体:', media.url)
  },
  async play() {
    console.log('开始播放')
  },
  async pause() {
    console.log('暂停播放')
  },
  async stop() {
    console.log('停止播放')
  },
  async seek(positionSeconds) {
    console.log('跳转到:', positionSeconds)
  },
  async setVolume(volume) {
    console.log('音量:', volume)
  },
  async setMuted(muted) {
    console.log('静音:', muted)
  },
}

const player = new Player({
  audio,
  initialState: {
    repeatMode: 'all',
    endBehavior: 'advance',
  },
})

const unsubscribe = player.on('statechange', (state) => {
  console.log(state.status, state.current?.title, state.positionSeconds)
})

player.setPlaylist(
  {
    id: 'demo-playlist',
    title: '示例播放列表',
    items: [
      { id: 'track-1', title: '曲目 1', url: '/tracks/1.mid', durationSeconds: 60 },
      { id: 'track-2', title: '曲目 2', url: '/tracks/2.mid', durationSeconds: 72 },
    ],
  },
  0
)

await player.play()
await player.next()

unsubscribe()
```

## 核心概念

### Player

`Player` 是应用层持有的播放器 facade。它拥有内部状态机，并在需要真实播放副作用时调用注入的 `AudioPlayerPort`。

### AudioPlayerPort

`AudioPlayerPort` 是平台边界。Web 应用可以用 WebAudio 实现，Tauri 应用可以通过 Rust command 实现，移动端可以通过原生音频 API 实现。端口不应该拥有队列、播放列表、循环、随机或 UI 状态。

### PlayerState

`PlayerState` 是 `getState()` 返回、并通过 `statechange` / `error` / `ended` 事件派发的不可变快照。Vue/Pinia、React store 或其他状态容器可以订阅它并桥接成自己的响应式状态。

### Queue 与 Playlist

`queue` 是上一曲/下一曲实际使用的有序队列。`playlist` 是可选的来源元信息，用于表示当前队列来自某个业务播放列表。手动编辑队列会清空 `playlist`，因为队列已经不再等同于原播放列表快照。

### Repeat 与 Shuffle

- `repeatMode: 'none'`：上一曲/下一曲到队列边界后不再切换。
- `repeatMode: 'all'`：上一曲/下一曲在队列首尾循环。
- `repeatMode: 'one'`：上一曲/下一曲仍停留在当前媒体。
- `shuffleMode: 'on'`：下一曲随机选择非当前媒体；上一曲优先按照真实播放历史回退。

### End Behavior

- `endBehavior: 'advance'`：有下一首时自动播放下一首；没有下一首时把当前媒体归位为 stopped。
- `endBehavior: 'pause'`：把当前媒体 seek 到 `0` 并标记为 paused。
- `endBehavior: 'stop'`：调用平台 stop 并重置进度。

## 公共 API

### 类型

- `PlayerMediaId`
- `PlayerStatus`
- `RepeatMode`
- `ShuffleMode`
- `EndBehavior`
- `PlayerEventType`
- `Unsubscribe`
- `PlayerError`
- `MediaItem`
- `Playlist`
- `AudioPlayerPort`
- `PlayerState`
- `PlayerOptions`
- `PlayerListener`

### 工具函数

- `createPlayerState(initialState?)`

### Player 方法

- `getState()`
- `on(event, listener)`
- `setQueue(items, startIndex?)`
- `setPlaylist(playlist, startIndex?)`
- `addToQueue(items)`
- `insertNext(items)`
- `removeFromQueue(mediaId)`
- `replaceMedia(media)`
- `clearQueue()`
- `prepare(media)`
- `play(media?)`
- `playIndex(index)`
- `pause()`
- `resume()`
- `stop()`
- `seek(positionSeconds)`
- `previous()`
- `next()`
- `handleEnded()`
- `handlePlaying()`
- `handlePaused()`
- `handleWaiting()`
- `handleStopped()`
- `handleError(error)`
- `updateProgress(positionSeconds, durationSeconds?)`
- `setVolume(volume)`
- `setMuted(muted)`
- `setRepeatMode(mode)`
- `setShuffleMode(mode)`
- `setEndBehavior(behavior)`
- `setLiked(mediaId, liked)`
- `clearError()`

## 推荐集成方式

```text
app bootstrap
  创建平台端口
  创建 Player({ audio: platformAudioPort })
  创建应用侧 feature/facade 做业务媒体转换
  把 Player 状态绑定到应用 store

app store
  持有响应式 PlayerState 快照
  暴露 UI 需要的 computed 或兼容字段
  不重复实现队列和播放模式规则

platform adapter
  实现 AudioPlayerPort
  将平台事件回灌给 Player
  不拥有播放列表或 UI 状态
```

平台事件桥接示例：

```ts
const runtime: { player?: Player } = {}

const audio: AudioPlayerPort = createAudioPort({
  onPlaying() {
    runtime.player?.handlePlaying()
  },
  onWaiting() {
    runtime.player?.handleWaiting()
  },
  onProgress(positionSeconds, durationSeconds) {
    runtime.player?.updateProgress(positionSeconds, durationSeconds)
  },
  onEnded() {
    void runtime.player?.handleEnded()
  },
  onError(error) {
    runtime.player?.handleError(error)
  },
})

const player = new Player({ audio })
runtime.player = player
```

## 错误处理

如果平台端口方法抛错或 reject，`Player` 会进入 `status: 'error'`，保存标准化的 `PlayerError`，先派发 `error`，再派发 `statechange`。应用层展示或记录错误后，可以调用 `clearError()` 恢复到可继续操作的状态。

## 并发保证

`play()` 内部使用请求序号。旧的异步 `load()` 如果晚于新的播放请求完成，其结果会被忽略，不能覆盖新的当前媒体或播放状态。

## 测试

```bash
pnpm --filter @strawberrybear/player test
pnpm --filter @strawberrybear/player type-check
pnpm --filter @strawberrybear/player lint
```

当前测试覆盖队列编辑、播放列表、循环模式、随机与历史回退、自然结束策略、平台事件回灌、错误恢复和旧异步播放请求失效。

## 维护约束

- 公共 API 变更必须同步更新本 README。
- 平台差异必须留在 `AudioPlayerPort` 或应用侧 feature 中。
- 状态切换、异步请求取消、队列索引调整、平台事件回灌和资源释放必须写清楚注释。
- 本包不能引入 UI 框架、Tauri、WebAudio、MIDI parser 或业务应用依赖。
