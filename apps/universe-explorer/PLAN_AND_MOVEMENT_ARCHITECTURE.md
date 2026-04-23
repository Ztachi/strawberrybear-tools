# Universe Explorer 计划与移动架构设计汇总

## 1. 项目目标

构建一个可长期扩展的宇宙探索 3D Web 游戏，技术栈与目标如下：

- Vue 3 + Vite 8 + TypeScript
- Babylon.js（WebGPU 优先，WebGL 自动降级）
- 架构模式：System + Entity + Service + Interface
- UI 与引擎解耦，UI 不直接操作 Babylon
- 输入采用语义抽象，支持未来多设备扩展（键鼠/手柄/触屏）

---

## 2. 已确认设计决策

- UI 方案：Tailwind CSS
- 渲染策略：WebGPU 优先，自动降级 WebGL
- i18n：zh-CN / en-US
- MVP 视觉：星空粒子背景 + 轻微 Bloom

---

## 3. 架构总览

### 3.1 分层原则

- System：纯游戏逻辑系统（Input / Movement / Render / Audio）
- Entity：游戏对象（当前 Ship）
- Service：底层能力抽象（Input / Audio / Space）
- Interface：系统与服务契约（解耦核心）

### 3.2 调度中心

`GameManager` 负责：

- 创建 Engine / Scene
- 创建 Service / Entity / System
- `registerSystem()` 注册系统
- 启动统一 update loop
- 生命周期管理（init / start / dispose）

---

## 4. 目录结构（当前应用）

```text
apps/universe-explorer/
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── CHANGELOG.md
├── README.md
├── docs/
│   └── README.md
└── src/
    ├── main.ts
    ├── App.vue
    ├── style.css
    ├── vite-env.d.ts
    ├── i18n/
    │   ├── index.ts
    │   └── locales/
    │       ├── zh-CN.ts
    │       └── en-US.ts
    ├── stores/
    │   └── game.ts
    ├── views/
    │   ├── StartView.vue
    │   └── GameView.vue
    ├── components/
    │   ├── GameCanvas.vue
    │   └── GameHUD.vue
    └── game/
        ├── GameManager.ts
        ├── interfaces/
        │   ├── ISystem.ts
        │   ├── IInputService.ts
        │   ├── IAudioService.ts
        │   ├── ISpaceService.ts
        │   ├── InputState.ts
        │   └── MovementDelta.ts
        ├── entities/
        │   ├── Entity.ts
        │   └── Ship.ts
        ├── services/
        │   ├── KeyboardMouseInput.ts
        │   ├── NullAudioService.ts
        │   ├── PlayerMoveSpaceService.ts
        │   └── WorldRebaseSpaceService.ts
        └── systems/
            ├── InputSystem.ts
            ├── MovementSystem.ts
            ├── RenderSystem.ts
            └── AudioSystem.ts
```

---

## 5. 模块职责

### 5.1 System 层

- `InputSystem`：输入服务生命周期管理（attach/dispose 扩展点）
- `MovementSystem`：读取语义输入，计算位移增量，交给 SpaceService
- `RenderSystem`：场景渲染、相机跟随、后处理和星空粒子
- `AudioSystem`：音频系统壳层（当前可空实现）

### 5.2 Service 层

- `KeyboardMouseInput`：键鼠输入映射到 `InputState`
- `NullAudioService`：音频空实现，占位可替换
- `PlayerMoveSpaceService`：MVP 方案，直接移动玩家实体
- `WorldRebaseSpaceService`：未来方案，移动世界（Origin Rebasing）

### 5.3 Entity 层

- `Entity`：实体抽象基类（mesh / position / update）
- `Ship`：玩家飞船实体（MVP 用 Box）

### 5.4 Vue UI 层

- `StartView`：开始界面 + 语言切换
- `GameView`：承载游戏画布 + HUD
- `GameCanvas`：唯一调用 GameManager 的组件
- `stores/game.ts`：仅维护 UI 阶段状态，不持有 Babylon 对象

---

## 6. 移动方案核心设计（Space Service）

本项目采用“移动策略抽象”设计，避免 `MovementSystem` 绑定具体对象或渲染引擎。

### 6.1 关键思想

`MovementSystem` 只负责：

1. 读取语义输入
2. 计算 `MovementDelta`
3. 调用 `ISpaceService.applyMovement(delta)`

它不关心：

- 是谁在移动（玩家/世界）
- 使用什么渲染引擎
- 具体实体类型

### 6.2 接口契约

- `InputState`：语义输入（`moveForward/moveRight/moveUp/lookDelta/boost`）
- `MovementDelta`：
  - `translation: Vec3`
  - `rotation: Vec3`
- `ISpaceService`：
  - `applyMovement(delta: MovementDelta): void`
  - `getPlayerTransform(): PlayerTransform`

### 6.3 两种空间实现策略

#### A. PlayerMoveSpaceService（当前 MVP）

- 直接移动飞船 mesh
- 适合快速验证可玩性

#### B. WorldRebaseSpaceService（未来扩展）

- 玩家锚定原点
- 世界整体反向移动（Origin Rebasing）
- 解决超大地图浮点精度问题

### 6.4 无缝切换保证

从 A 切到 B 时：

- `MovementSystem` 不需要改动
- 输入系统不需要改动
- UI 层不需要改动
- 仅在 `GameManager` 注入层替换 `ISpaceService` 实现

---

## 7. 输入抽象策略

### 7.1 语义输入而非设备输入

输入语义包括：

- `moveForward`
- `moveRight`
- `moveUp`
- `lookDelta`
- `boost`

因此 `MovementSystem` 与具体设备无关。

### 7.2 多输入扩展方式

新增输入设备时，仅需实现 `IInputService`：

- `GamepadInputService`
- `TouchInputService`

并在 `GameManager` 注入替换，无需修改移动系统。

---

## 8. 当前 MVP 功能闭环

- 点击“开始游戏”进入场景
- 创建飞船（Box）
- WASD + 鼠标控制飞行（含加速）
- 相机跟随
- 渲染循环稳定运行
- WebGPU/WebGL 自动兼容

---

## 9. 关键扩展路线

### 9.1 手柄支持

实现 `IInputService` 新类并替换注入，`MovementSystem` 零改动。

### 9.2 音效系统

将 `NullAudioService` 替换为真实音频服务，`AudioSystem` 调用方零改动。

### 9.3 新实体

新增 Entity 子类并在 GameManager 组装，不改核心调度和移动接口。

### 9.4 世界移动/原点重定基

切换到 `WorldRebaseSpaceService`，以最小改动支持超大宇宙场景。

---

## 10. 运行方式

在仓库根目录执行：

```bash
pnpm --filter @strawberrybear/universe-explorer dev
```

校验命令：

```bash
pnpm --filter @strawberrybear/universe-explorer type-check
pnpm --filter @strawberrybear/universe-explorer lint
```

---

## 11. 验收标准（架构向）

- 系统间无直接硬依赖
- `MovementSystem` 无渲染引擎依赖
- 位移逻辑统一经过 `ISpaceService`
- 输入逻辑统一经过 `IInputService`
- UI 不直接调用 Babylon API
- 能通过替换注入完成移动策略切换

---

## 12. 工程执行版（Sprint 里程碑）

本章节用于实际推进开发，以 2 周一个 Sprint 为建议节奏，可按团队容量压缩或拆分。

### Sprint 1（MVP 稳定化）

目标：从“可运行”升级到“可稳定演示”。

- 任务 1：补齐核心单元测试
  - 覆盖 `MovementSystem` 的输入到 `MovementDelta` 映射
  - 覆盖 `KeyboardMouseInput` 的语义状态输出与 `lookDelta` 重置逻辑
  - 覆盖 `PlayerMoveSpaceService` 的位移与旋转应用
- 任务 2：完善运行时保护
  - `GameManager` 增加重复初始化/重复销毁保护日志
  - 输入服务在失焦、指针锁定失败场景下的降级处理
- 任务 3：HUD 可观测性
  - 增加 FPS、渲染后端（WebGPU/WebGL）与玩家坐标显示
  - 预留 debug 开关（仅开发环境显示）

交付标准：

- 本地 15 分钟连续飞行无异常
- `type-check`、`lint` 全通过
- 关键移动链路有可回归测试

### Sprint 2（输入扩展）

目标：验证“语义输入层”设计的扩展性。

- 任务 1：新增 `GamepadInputService`
  - 左摇杆映射 `moveForward/moveRight`
  - 右摇杆映射 `lookDelta`
  - 扳机或肩键映射 `boost/moveUp`
- 任务 2：输入源切换策略
  - 在 `GameManager` 提供输入服务工厂（按设备可用性选择）
  - 支持热切换（键鼠与手柄并存时优先级策略）
- 任务 3：输入调参
  - 增加 dead-zone、灵敏度、加速度配置
  - 为不同输入源维护独立配置

交付标准：

- 不修改 `MovementSystem`，即可使用手柄飞行
- 手柄与键鼠都能完整驱动移动与视角

### Sprint 3（移动策略切换验证）

目标：落地 Origin Rebasing，验证 Space Service 抽象有效。

- 任务 1：实现 `WorldRebaseSpaceService` 正式版
  - 世界实体注册与批量反向位移
  - 逻辑坐标累积（用于 HUD/存档）
  - 大距离移动后的数值稳定性控制
- 任务 2：相机与空间服务联动校正
  - 保证 `RenderSystem` 在 rebase 模式下跟随无抖动
  - 校验旋转与局部坐标一致性
- 任务 3：双策略运行模式
  - 提供 `spaceMode: player | rebase` 配置
  - 通过注入切换，其他系统零改动

交付标准：

- 连续长距离移动不出现精度抖动
- 从 `PlayerMove` 切到 `WorldRebase` 仅改注入配置

### Sprint 4（内容扩展与可发布）

目标：从技术 Demo 走向可持续迭代版本。

- 任务 1：实体扩展
  - 新增至少 2 类实体（行星/空间站/小行星）
  - 不修改核心调度与移动接口
- 任务 2：音频系统落地
  - 用真实 `AudioService` 替换 `NullAudioService`
  - 实现背景氛围音 + 推进器音效
- 任务 3：发布与回归
  - 增加 smoke test（启动、进入场景、移动、退出）
  - 完成 release 流程演练（changeset -> tag -> release）

交付标准：

- 新实体和音频均通过现有接口接入
- 发版流程可重复执行且无人工阻塞

### 风险与缓解

- 风险 1：输入设备差异导致手感不一致
  - 缓解：引入输入配置层与设备 profile，拆分灵敏度参数
- 风险 2：World Rebasing 后相机/粒子系统出现视觉跳变
  - 缓解：将关键视觉节点纳入可重定位集合，增加 rebase 钩子
- 风险 3：长期扩展后系统耦合回潮
  - 缓解：新增功能必须先定义接口契约，再落地实现

### 建议优先级

1. 先完成 Sprint 1 的可观测性与回归能力
2. 再推进 Sprint 2/3 验证架构扩展性
3. 最后进行 Sprint 4 的内容化与发布化
