# Universe Explorer 开发规范

## 文档索引

- [开发规范](README.md) — 技术栈、目录结构、架构铁律、扩展指南
- [设计文档](docs/design.md) — 设计语言、色彩系统、组件清单、技术架构

## 技术栈

| 技术            | 版本  | 说明                         |
| --------------- | ----- | ---------------------------- |
| Vue 3           | 3.5.x | 组合式 API，`<script setup>` |
| TypeScript      | 5.9.x | strict 模式                  |
| Vite            | 8.x   | 构建工具                     |
| Babylon.js      | 7.x   | WebGPU / WebGL 渲染引擎      |
| Tailwind CSS    | 3.x   | UI 样式                      |
| Pinia           | 3.x   | 状态管理                     |
| vue-i18n        | 10.x  | 国际化（zh-CN / en-US）      |
| Lucide Vue Next | 0.5.x | 图标库                       |

## 目录结构

```
src/
├── game/                    # 纯游戏逻辑，零 Vue 依赖
│   ├── interfaces/          # 接口契约（ISystem / IInputService / ISpaceService 等）
│   ├── services/            # 服务实现（键鼠输入、空间服务、音频）
│   ├── systems/             # 游戏系统（Input / Movement / Render / Audio）
│   ├── entities/            # 游戏实体（Ship、未来可扩展）
│   └── GameManager.ts       # 系统调度中心（单例）
├── stores/                  # Pinia Store（game.ts）
├── views/                   # 页面视图（StartView / GameView）
├── components/              # UI 组件（GameCanvas / GameHUD）
└── i18n/                    # 国际化
    └── locales/             # zh-CN.ts / en-US.ts
```

## 架构铁律

1. **MovementSystem 零引擎依赖**：不允许引入 `@babylonjs/core` 类型，只依赖 `IInputService` + `ISpaceService` + 纯数学类型（`Vec3` / `MovementDelta`）
2. **系统间不直接引用**：系统通过服务接口通信，禁止 `MovementSystem` 直接持有 `Ship` 引用
3. **Vue 层禁止操作 Babylon**：`GameCanvas.vue` 是唯一调用 `GameManager` 的 Vue 组件，其他组件只通过 Pinia Store 通信
4. **RenderSystem 相机跟随**：通过 `ISpaceService.getPlayerTransform()` 获取位置，不直接持有 `Ship`

## 扩展指南

### 新增输入设备（如手柄）

```typescript
// 1. 实现接口
class GamepadInput implements IInputService {
  attach(_canvas: HTMLCanvasElement): void { window.addEventListener('gamepadconnected', ...) }
  getState(): InputState { /* 读摇杆轴值映射 */ }
  dispose(): void { /* 解绑 */ }
}
// 2. 在 GameManager.init() 中替换注入
// MovementSystem 零改动 ✓
```

### 切换世界移动（Origin Rebasing）

```typescript
// GameManager.init() 中:
// const spaceService = new PlayerMoveSpaceService(ship)   // 注释掉
const spaceService = new WorldRebaseSpaceService(worldMeshes)  // 替换
// MovementSystem / RenderSystem 零改动 ✓
```

### 新增实体

```typescript
class Planet extends Entity {
  readonly mesh: Mesh
  constructor(scene: Scene) { super(); this.mesh = MeshBuilder.CreateSphere(...) }
  update(_dt: number): void { /* 自转 */ }
}
// 在 GameManager.init() 中创建即可，无需修改任何系统
```

### 新增系统

```typescript
class GravitySystem implements ISystem {
  init(): void {}
  update(dt: number): void { /* 施加引力 via ISpaceService */ }
}
// GameManager.registerSystem(new GravitySystem(...))
```

## 状态管理规范

- `stores/game.ts`：管理 `gamePhase`（idle / playing）+ 音频状态（musicEnabled / volume）
- 游戏内部状态（飞船位置、速度等）由游戏核心层自己管理，不进 Pinia
- 如需 HUD 显示飞行数据，通过 `ISpaceService.getPlayerTransform()` 读取，可暴露为响应式 composable

## 音频系统

采用**游戏引擎标准三层架构**：

```
IAudioService (接口) → DummyAudioService (实现) → AudioSystem (调度)
```

- **接口层**：`IAudioService` 定义 BGM / SFX / 音量控制契约
- **服务层**：`DummyAudioService` 当前为模拟，替换为 `WebAudioService` 时 AudioSystem 零改动
- **系统层**：`AudioSystem` 运行在游戏核心，通过 `getAudioState()` 回调监听 Pinia 状态变化

**Vue 层约束**：仅修改 `store.musicEnabled` / `store.volume`，禁止直接操作 Audio API

详见 [设计文档](docs/design.md#7-音频系统架构)

## 样式规范

- 游戏 UI 使用 Tailwind + 内联样式（backdrop-filter / box-shadow 等特效）
- 游戏画布（`GameCanvas.vue`）不加任何 CSS 过渡，由 Babylon.js 完全接管
- 颜色变量：深空黑 `#000008`，星光蓝 `rgba(100, 180, 255, *)`

## 渲染说明

- **WebGPU**：Chrome 113+ / Edge 113+ 支持，性能更优
- **WebGL 降级**：自动，见 `GameManager.init()` 中的 `IsSupportedAsync` 检测
- **Bloom**：`DefaultRenderingPipeline`，threshold=0.6，weight=0.3
- **星空**：`ParticleSystem`（2000 粒子，程序生成白点纹理，`BLENDMODE_ADD`）
