# 钢琴发音引擎设计

## 1. 需求分析

### 1.1 功能目标

- 根据 MIDI 文件自动演奏音符发音
- 支持按键映射预览发音
- 单音发音 API
- 开关控制

### 1.2 资源分析

- 钢琴音色样本位置: `/Users/strawberrybear/Music/钢琴发音资源/SalamanderGrandPianoV3_OggVorbis/ogg`
- 覆盖范围: A0-C8 (21-108)，16 层 velocity
- 授权: CC-by 3.0

### 1.3 FreePiano 模板音域

- C2-B6 (pitch 36-95)，共 35 个白键
- 5 个八度: C2-B2, C3-B3, C4-B4, C5-B5, C6-B6

## 2. 架构设计

### 2.1 模块划分

```
src/lib/
├── keyboardMapper.ts      # 键盘映射（现有）
├── pianoEngine.ts        # 新增：钢琴音频引擎
└── midiPlayer.ts         # 现有：MIDI 播放

stores/
├── player.ts             # 播放器状态
└── settings.ts           # 设置状态
```

### 2.2 PianoEngine 类设计

```typescript
/** 钢琴引擎配置 */
interface PianoEngineOptions {
  sampleBaseUrl: string  // 音色样本基础路径
  velocities?: number    // 使用的 velocity 层数，默认 5
}

/** 单音配置 */
interface NoteOptions {
  pitch: number         // MIDI 音符号 (0-127)
  velocity?: number      // 力度 (0-1)，默认 0.8
  duration?: number      // 持续时间（秒），默认 1.0
}

class PianoEngine {
  /** 初始化音频引擎 */
  async init(): Promise<void>

  /** 播放单个音符 */
  keyDown(pitch: number, velocity?: number): void

  /** 释放音符 */
  keyUp(pitch: number): void

  /** 根据 MelodyEvent 数组同步演奏 */
  playMelody(
    events: MelodyEvent[],
    onNoteStart?: (event: MelodyEvent) => void,
    onNoteEnd?: (event: MelodyEvent) => void
  ): void

  /** 停止演奏 */
  stop(): void

  /** 暂停/恢复 */
  pause(): void
  resume(): void

  /** 是否启用发音 */
  enabled: boolean

  /** 销毁引擎 */
  destroy(): void
}
```

### 2.3 与 KeyboardMapper 集成

KeyboardMapper 保持独立，只负责映射逻辑。新增可选的发音回调：

```typescript
interface KeyboardMapperOptions {
  // ... 现有配置
  onNotePlay?: (pitch: number, mappedKey: string) => void
  onNoteStop?: (pitch: number, mappedKey: string) => void
}
```

## 3. 资源文件

### 3.1 需要复制的样本

覆盖 FreePiano 模板的 35 个白键，选用 velocity v5（中等力度）：

| 音高 | 文件     |
| ---- | -------- |
| C2   | C2v5.ogg |
| D2   | D2v5.ogg |
| ...  | ...      |
| B6   | B6v5.ogg |

### 3.2 目标位置

`public/samples/piano/`

## 4. 实现策略

### 4.1 低耦合设计

- PianoEngine 作为独立模块，不依赖 KeyboardMapper
- 通过事件回调或外部调用触发演奏
- MIDI 同步演奏由 playerStore 协调

### 4.2 性能优化

- 样本只加载一次，复用 AudioBuffer
- 使用 Web Audio API 的 BufferSourceNode
- 预加载当前需要的所有样本

### 4.3 扩展性

- 可配置多个音色库路径
- 支持不同 velocity 层级
- 预留踏板支持接口

## 5. 使用流程

### 5.1 初始化

1. 应用启动时初始化 PianoEngine
2. 后台异步加载当前模板需要的样本

### 5.2 演奏流程

1. 用户选择 MIDI 文件
2. KeyboardMapper 根据模板映射音符
3. 同时触发:
   - KeyboardPreview 高亮按键
   - PianoEngine 播放对应音

### 5.3 开关控制

- 全局开关：控制是否发音
- 不影响键盘映射和按键高亮
