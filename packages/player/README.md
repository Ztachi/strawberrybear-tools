# @strawberrybear/player

平台无关的普通音频播放器核心。应用通过 `AudioPlayerPort` 注入实际播放能力，播放器只负责队列、状态、进度、音量、错误和结束行为。

## Boundary

- 不包含 MIDI 解析、WebAudio、Tauri、Vue 或 Pinia。
- 不包含播放条 UI。
- 业务层负责媒体数据加载、音频实现、倒计时、权限、键盘模拟等应用逻辑。

## Usage

```ts
import { Player, type AudioPlayerPort } from '@strawberrybear/player'

const audio: AudioPlayerPort = {
  async load(media) {
    console.log(media.url)
  },
  async play() {},
  async pause() {},
  async stop() {},
  async seek(positionSeconds) {
    console.log(positionSeconds)
  },
  async setVolume(volume) {
    console.log(volume)
  },
  async setMuted(muted) {
    console.log(muted)
  },
}

const player = new Player({ audio })
player.on('statechange', state => console.log(state.status))
player.setQueue([{ id: '1', title: 'Track', url: '/track.mid', durationSeconds: 60 }])
await player.play()
```

## Testing

```bash
pnpm --filter @strawberrybear/player test
pnpm --filter @strawberrybear/player type-check
```
