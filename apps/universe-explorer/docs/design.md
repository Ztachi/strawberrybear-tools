# Universe Explorer 设计文档

## 1. 概念与愿景

Universe Explorer 是一款探索无尽星空的 3D 网页游戏。玩家驾驶飞船在宇宙中自由飞行，体验深邃的太空环境和沉浸式的视觉特效。整体风格偏向科幻、简洁，强调星空粒子效果和流畅的飞行体验。

## 2. 设计语言

### 2.1 美学方向

**参考风格**：深空科幻 + 极简主义

- 以深空黑和星空蓝为主色调
- 通过发光效果（Bloom）和粒子系统营造宇宙氛围
- UI 元素采用毛玻璃效果（backdrop-filter），不喧宾夺主

### 2.2 色彩系统

```css
/* 主色调 */
--color-primary: #4080ff;
--color-primary-light: #80c0ff;
--color-primary-dark: #2060cc;

/* 强调色 */
--color-accent: #60a0ff;
--color-accent-glow: rgba(96, 160, 255, 0.6);

/* 深空背景 */
--color-space-dark: #000008;
--color-space-blue: #0a0e2a;

/* 星光色 */
--color-star-white: #ffffff;
--color-star-blue: rgba(100, 180, 255, 0.8);

/* 文字色 */
--color-text-primary: #ffffff;
--color-text-secondary: rgba(180, 210, 255, 0.75);
--color-text-muted: rgba(255, 255, 255, 0.65);

/* 面板色 */
--color-panel-bg: rgba(0, 0, 0, 0.45);
--color-panel-border: rgba(120, 180, 255, 0.4);

/* 按钮色 */
--color-btn-bg: rgba(60, 120, 220, 0.7);
--color-btn-hover: rgba(80, 140, 255, 0.5);
--color-btn-shadow: rgba(80, 140, 255, 0.25);
--color-btn-hover-shadow: rgba(80, 160, 255, 0.5);
```

### 2.3 字体

- 系统字体栈：`-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
- 标题使用 `text-transform: uppercase` 增加科幻感

### 2.4 空间系统

- 基础间距单位：0.25rem (4px)
- HUD 面板内边距：0.75rem (12px)
- 圆角：0.375rem (6px) 用于面板，2rem 用于按钮

### 2.5 动效哲学

- **星空粒子**：三层不同速度的星星交错闪烁（4s / 6s / 8s），营造深度感
- **标题动画**：渐变色流光 + 发光脉冲，悬停时加速
- **按钮交互**：scale 变换 + 阴影增强，transition 200ms
- **HUD 面板**：毛玻璃背景 + 微妙的模糊效果

### 2.6 视觉资产

- **图标库**：Lucide Vue Next
- **游戏图标**：PNG 格式（favicon.ico / apple-touch-icon.png / android-chrome-\*.png）
- **BGM**：`/public/assets/BGM/space.mp3`

## 3. 布局与结构

### 3.1 页面结构

```
├── StartView (开始界面)
│   ├── 纯 CSS 星空动画背景（三层粒子）
│   ├── 语言切换按钮（右上角）
│   └── 主内容区（居中）：标题 + 副标题 + 开始按钮
│
└── GameView (游戏界面)
    ├── 全屏 GameCanvas（Babylon.js 渲染）
    └── GameHUD 叠加层
        ├── 左上角：操控说明面板
        ├── 右上角：返回按钮
        └── 右下角：音乐开关
```

### 3.2 响应式策略

- 使用 `clamp()` 实现流式字体大小
- 全屏布局无需响应式断点

## 4. 功能与交互

### 4.1 开始界面

- **星空背景**：CSS 多层 radial-gradient 粒子动画
- **语言切换**：中/英文切换，实时更新所有文案
- **开始按钮**：点击进入游戏

### 4.2 游戏界面

- **视角控制**：鼠标点击锁定，ESC 释放
- **移动控制**：
  - W/↑：前进
  - S/↓：后退
  - A/←：左移
  - D/→：右移
  - Q：上升
  - E：下降
  - Shift：加速
- **音乐开关**：点击切换 BGM 播放/静音

### 4.3 边界情况

- BGM 自动播放会被浏览器拦截，需用户交互后生效
- 移动端暂时不支持（无鼠标锁定功能）

## 5. 组件清单

### 5.1 StartView

- 星空背景层（三层 `.stars`）
- 语言切换按钮 `.lang-toggle`
- 标题 `.title`（含渐变流光动画）
- 副标题 `.subtitle`
- 开始按钮 `.start-btn`

### 5.2 GameHUD

- 操控说明面板（毛玻璃背景）
- 返回按钮
- 音乐开关按钮（Lucide Volume2/VolumeX 图标）

### 5.3 GameCanvas

- 全屏 Babylon.js 画布
- 无 CSS 样式，完全由引擎控制

## 6. 技术架构

### 6.1 游戏核心层（game/）

游戏核心完全独立于 Vue，使用接口与服务通信：

```
game/
├── interfaces/     # 接口契约（ISystem / IInputService / ISpaceService / IAudioService）
├── services/       # 服务实现（键鼠输入 / 空间移动 / 音频）
├── systems/        # 游戏系统（Input / Movement / Render / Audio）
├── entities/       # 游戏实体（Ship）
└── GameManager.ts  # 系统调度中心
```

### 6.2 Vue 层（views/ components/）

Vue 层通过 Pinia Store 与游戏核心通信，不直接操作 Babylon.js：

```
src/
├── views/          # 页面（StartView / GameView）
├── components/     # UI 组件（GameCanvas / GameHUD）
├── stores/         # Pinia Store（game.ts）
└── i18n/           # 国际化
```

### 6.3 渲染引擎

- 优先 WebGPU（Chrome 113+ / Edge 113+）
- 不支持时自动降级 WebGL
- Bloom 后处理 + 星空粒子系统

### 6.4 代码规范

#### TypeScript 配置

```json
// tsconfig.app.json 关键配置
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  }
}
```

**注意**：`erasableSyntaxOnly` 选项不允许 `constructor(private readonly xxx)` 语法，与当前代码结构不兼容，已禁用。

#### Vite 配置

```typescript
// vite.config.ts — manualChunks 必须使用函数形式
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('@babylonjs/core')) {
          return 'babylon'
        }
      },
    },
  },
}
```

#### 代码风格

- **参数声明**：使用 `constructor(private readonly xxx)` 简写形式
- **私有字段**：以 `_` 前缀命名（如 `this._audioService`）
- **只读字段**：使用 `readonly` 修饰符
- **接口类型**：导入时使用 `import type` 区分值类型和类型声明
- **Vue 模板属性**：多属性必须换行（遵守 `vue/max-attributes-per-line` 规则）

#### 提交前检查（强制）

**每次修改代码后**，必须执行以下检查，确保代码通过后再提交：

```bash
# 1. ESLint 检查（自动修复可修复的问题）
pnpm run -r --filter @strawberrybear/universe-explorer lint --fix

# 2. TypeScript 类型检查
pnpm run -r --filter @strawberrybear/universe-explorer type-check

# 3. 完整构建（验证生产环境编译）
pnpm run -r --filter @strawberrybear/universe-explorer build
```

**注意**：ESLint 检查必须先于 type-check 和 build 执行，确保代码风格符合规范。

## 7. 音频系统架构

### 7.1 设计原则

音频系统遵循**游戏引擎标准的三层架构**：

1. **接口层（IAudioService）**：定义音频能力契约
2. **服务层（DummyAudioService）**：具体实现，当前为模拟
3. **系统层（AudioSystem）**：游戏核心的音频调度中心

**核心约束**：

- Vue 层**禁止**直接播放音频，仅修改 Pinia store 状态
- AudioSystem **禁止**直接操作 DOM/Audio API，通过 IAudioService
- 所有音频逻辑在**游戏层**，与 Vue 完全解耦

### 7.2 架构图

```
┌─────────────────────────────────────────────────────────┐
│                      Vue 层                             │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Pinia Store (game.ts)              │    │
│  │  • gamePhase: 'idle' | 'playing'                │    │
│  │  • musicEnabled: boolean                        │    │
│  │  • volume: number (0~1)                         │    │
│  │  • toggleMusic() / setVolume()                 │    │
│  └─────────────────────────────────────────────────┘    │
│                         ▲                                │
│                         │ 状态读取                       │
│                         │                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │              AudioSystem (game/)                 │    │
│  │  • 每帧调用 getAudioState() 同步状态            │    │
│  │  • 根据状态调用 IAudioService                   │    │
│  │  • playSFX() 供游戏逻辑触发音效                │    │
│  └─────────────────────────────────────────────────┘    │
│                         ▲                                │
│                         │ 接口调用                       │
│                         │                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │           IAudioService (接口)                  │    │
│  │  • playBGM(name) / stopBGM()                   │    │
│  │  • playSFX(name, options) / stopSFX(name)     │    │
│  │  • setVolume() / setBGMVolume()                │    │
│  │  • pauseAll() / resumeAll()                   │    │
│  └─────────────────────────────────────────────────┘    │
│                         ▲                                │
│                         │ 实现注入                       │
│                         │                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │         DummyAudioService (当前实现)            │    │
│  │  • console 模拟，不实际播放                     │    │
│  │  • 未来替换为 WebAudioService                  │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 7.3 接口定义

```typescript
// IAudioService.ts
export interface IAudioService {
  playBGM(name: string): void
  stopBGM(): void
  playSFX(name: string, options?: { loop?: boolean; volume?: number }): void
  stopSFX(name: string): void
  stopAllSFX(): void
  setVolume(volume: number): void
  setBGMVolume(volume: number): void
  pauseAll(): void
  resumeAll(): void
}
```

### 7.4 AudioSystem 实现

```typescript
// AudioSystem.ts
export class AudioSystem implements ISystem {
  private _audioService: IAudioService
  private _state: AudioState
  private _lastBGMPlaying = false

  constructor(audioService: IAudioService, getState: () => AudioState) {
    this._audioService = audioService
    this._state = getState()
  }

  init(): void {
    this._syncBGM()
  }

  update(_deltaTime: number): void {
    this._syncVolume()
    this._syncBGM()
  }

  private _syncVolume(): void {
    this._audioService.setVolume(this._state.volume)
    this._audioService.setBGMVolume(this._state.volume)
  }

  private _syncBGM(): void {
    const shouldPlay = this._state.musicEnabled && this._state.gamePhase === 'playing'

    if (shouldPlay && !this._lastBGMPlaying) {
      this._audioService.playBGM('space')
      this._lastBGMPlaying = true
    } else if (!shouldPlay && this._lastBGMPlaying) {
      this._audioService.stopBGM()
      this._lastBGMPlaying = false
    }
  }

  /** 供游戏逻辑调用，如碰撞、加速等 */
  playSFX(name: string, options?: { loop?: boolean; volume?: number }): void {
    this._audioService.playSFX(name, options)
  }

  dispose(): void {
    this._audioService.stopBGM()
    this._audioService.stopAllSFX()
    this._lastBGMPlaying = false
  }
}
```

### 7.5 Pinia Store 联动

```typescript
// game.ts
export const useGameStore = defineStore('game', () => {
  // 游戏阶段
  const gamePhase = ref<GamePhase>('idle')
  function startGame(): void { gamePhase.value = 'playing' }
  function stopGame(): void { gamePhase.value = 'idle' }

  // 音频状态
  const musicEnabled = ref(true)
  const volume = ref(0.3)

  function toggleMusic(): void { musicEnabled.value = !musicEnabled.value }
  function setVolume(v: number): void { volume.value = Math.max(0, Math.min(1, v)) }

  // 供 AudioSystem 获取状态（回调注入，避免直接依赖 Pinia）
  function getAudioState() {
    return { musicEnabled: musicEnabled.value, volume: volume.value, gamePhase: gamePhase.value }
  }

  return { gamePhase, startGame, stopGame, musicEnabled, volume, toggleMusic, setVolume, getAudioState }
})
```

### 7.6 GameManager 注册

```typescript
// GameManager.ts
const audioService = new DummyAudioService()
const gameStore = useGameStore()

// 注入状态回调，AudioSystem 通过回调获取最新状态
this.registerSystem(new AudioSystem(audioService, () => gameStore.getAudioState()))
```

### 7.7 Vue 层控制

```vue
<!-- GameHUD.vue -->
<script setup>
import { useGameStore } from '../stores/game'
const gameStore = useGameStore()
</script>

<template>
  <!-- 点击仅修改 store 状态，AudioSystem 监听并响应 -->
  <button @click="gameStore.toggleMusic()">
    {{ gameStore.musicEnabled ? 'Mute' : 'Play' }}
  </button>
</template>
```

### 7.8 扩展设计

#### 3D 音效（未来）

扩展 `IAudioService` 添加 3D 空间接口：

```typescript
interface IAudioService {
  // 现有接口...
  play3DSFX(name: string, position: Vec3, options?: SFXOptions): void
  updateListener(position: Vec3, forward: Vec3): void
}
```

实现时使用 Web Audio API `PannerNode` 或 Babylon.js 的 `Sound + AudioEngine`。

#### 多音轨管理（未来）

```typescript
interface IAudioService {
  // 现有接口...
  crossFadeBGM(from: string, to: string, duration: number): void
  setBGMTrack(name: string, volume: number): void
}
```

#### 替换为真实音频实现

1. 创建 `WebAudioService implements IAudioService`
2. 在 `GameManager.ts` 中替换 `DummyAudioService` 为 `WebAudioService`
3. `AudioSystem` 零改动 ✓

## 8. 文件结构

```
apps/universe-explorer/
├── public/
│   ├── assets/
│   │   └── BGM/
│   │       └── space.mp3        # 游戏 BGM
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   ├── android-chrome-192x192.png
│   ├── android-chrome-512x512.png
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   └── site.webmanifest
├── src/
│   ├── game/                    # 游戏核心（零 Vue 依赖）
│   │   ├── interfaces/
│   │   │   ├── ISystem.ts
│   │   │   ├── IInputService.ts
│   │   │   ├── ISpaceService.ts
│   │   │   ├── IAudioService.ts  # 音频接口
│   │   │   ├── InputState.ts
│   │   │   ├── MovementDelta.ts
│   │   │   └── AudioState.ts
│   │   ├── services/
│   │   │   ├── KeyboardMouseInput.ts
│   │   │   ├── PlayerMoveSpaceService.ts
│   │   │   ├── WorldRebaseSpaceService.ts
│   │   │   └── DummyAudioService.ts  # 空实现（MVP）
│   │   ├── systems/
│   │   │   ├── InputSystem.ts
│   │   │   ├── MovementSystem.ts
│   │   │   ├── RenderSystem.ts
│   │   │   └── AudioSystem.ts       # 状态驱动音频调度
│   │   ├── entities/
│   │   │   ├── Entity.ts
│   │   │   └── Ship.ts
│   │   └── GameManager.ts
│   ├── stores/
│   │   └── game.ts              # Pinia Store（游戏阶段 + 音频状态）
│   ├── views/
│   │   ├── StartView.vue
│   │   └── GameView.vue
│   ├── components/
│   │   ├── GameCanvas.vue
│   │   └── GameHUD.vue
│   ├── i18n/
│   │   └── locales/
│   │       ├── zh-CN.ts
│   │       └── en-US.ts
│   ├── App.vue
│   ├── main.ts
│   ├── style.css                # 全局样式 + 主题变量
│   └── vite-env.d.ts
├── docs/
│   └── design.md                # 本文档
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
├── tsconfig.json
└── tsconfig.app.json
```
