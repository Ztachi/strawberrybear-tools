# @strawberrybear/piano-roll

高性能钢琴卷帘组件，基于 Canvas 渲染，用于可视化 MIDI 音符。

## 安装

```bash
pnpm add @strawberrybear/piano-roll
```

## 基本用法

```vue
<script setup lang="ts">
import { ref } from 'vue'
import PianoRoll from '@strawberrybear/piano-roll/PianoRoll.vue'
import type { NoteEvent, TrackInfo } from '@strawberrybear/piano-roll'

const notes = ref<NoteEvent[]>([])
const tracks = ref<TrackInfo[]>([])
const disabledTracks = ref(new Set<number>())
const currentTime = ref(0)

function onToggle(trackIndex: number) {
  // 处理音轨切换
}
</script>

<template>
  <PianoRoll
    :notes="notes"
    :duration="duration"
    :tracks="tracks"
    :disabled-tracks="disabledTracks"
    :current-time="currentTime"
    @toggle="onToggle"
  />
</template>
```

## Props

| 属性             | 类型          | 必需 | 说明                 |
| ---------------- | ------------- | ---- | -------------------- |
| `notes`          | `NoteEvent[]` | 是   | 音符事件数组         |
| `duration`       | `number`      | 是   | 持续时间（毫秒）     |
| `tracks`         | `TrackInfo[]` | 是   | 音轨信息数组         |
| `disabledTracks` | `Set<number>` | 是   | 禁用的音轨索引集合   |
| `currentTime`    | `number`      | 是   | 当前播放时间（毫秒） |

## Events

| 事件名   | 参数                   | 说明                                          |
| -------- | ---------------------- | --------------------------------------------- |
| `toggle` | `(trackIndex: number)` | 点击音轨标签时触发，用于切换音轨启用/禁用状态 |

## 类型定义

### NoteEvent

```typescript
interface NoteEvent {
  pitch: number       // 音高 (0-127)
  velocity: number    // 力度 (0-127)
  start_tick: number  // 起始 tick
  end_tick: number    // 结束 tick
  channel: number      // 通道号
  track: number       // 音轨索引
}
```

### TrackInfo

```typescript
interface TrackInfo {
  index: number       // 音轨索引
  channel: number     // 通道号
  name: string        // 音轨名称
  noteCount: number   // 音符数量
  isPercussion: boolean  // 是否为打击乐
  enabled: boolean    // 是否启用
}
```

## 相关文档

- [公共库开发规范](../../../docs/packages/README.md)
- [组件设计规范](../../../docs/design/component-guide.md)
