# 萌园园上岗日开发交接记录

更新时间：2026-07-17 15:37（UTC+8）

## 当前状态

项目已从空目录搭建为可继续开发的 Vue 3 游戏应用，主要架构、页面骨架、基础物理引擎、业务规则、存档层和测试骨架均已创建，但**尚未达到 PRD 第一版完整验收状态**。

当前不要把“文件已经存在”等同于“需求已经完整实现”。现阶段更接近可运行的第一轮集成稿，后续接手者需要先修复构建与运行问题，再逐项对照 PRD 补齐玩法。

Git 工作区当前状态：

```text
M  docs/README.md
M  pnpm-lock.yaml
?? apps/myy-on-duty/
?? docs/apps/myy-on-duty.md
```

未创建 commit。

## 已完成内容

### 1. 应用脚手架

- 新增 workspace：`apps/myy-on-duty`
- 已配置 Vite、Vue 3、TypeScript、Vue Router、Pinia、Tailwind CSS 4。
- 已接入 PixiJS、Rapier2D、`@pixi/sound`、Dexie、Zod、vue-i18n、Vitest、Playwright。
- 已配置 `@` 源码别名，并继承 `@strawberrybear/tsconfig`。
- 已通过 `pnpm install` 更新根 `pnpm-lock.yaml`。

关键文件：

- `package.json`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `tsconfig.app.json`
- `tsconfig.node.json`

### 2. 统一数值与台面配置

- `src/config/balance.ts`
  - 集中保存物理、规则、验收倍率、八类事件、四组材料池、称号参数。
  - 使用 Zod 在模块加载时校验。
- `src/config/board.ts`
  - 使用 720×1280 设计坐标保存墙体、拍板、机关、目标和传感器位置。
  - 与平衡数值分离，后续调整经济或手感不需要修改布局文件。

### 3. 物理与渲染初稿

`src/game/engine/GameEngine.ts` 已包含：

- Rapier2D 固定 120Hz 物理步长。
- PixiJS 画布和代码绘制的占位图形。
- 动态弹珠、静态墙体、三个劳动碰撞器、三个验收目标、若干传感区域。
- 左右 kinematic 拍板初稿。
- Space 蓄力发射、A/L 和左右半屏触控。
- CCD 与最大速度钳制。
- 引擎事件：劳动装置、目标、传感器、发射、物理快照。
- 720×1280 台面等比缩放。

### 4. 玩法纯逻辑

`src/game/systems/rules.ts` 已包含：

- 通用权重抽取。
- 普通/丰收材料抽取。
- 库存合并和估值。
- 成果验收倍率与收入计算。
- 避免连续重复的随机事件选择。
- 时长评分插值。
- 称号和三条亮点初步计算。

`src/game/systems/rules.test.ts` 已有 5 个单元测试，覆盖材料边界、库存、验收、事件去重和称号结果。

### 5. 对局编排与持久化初稿

- `src/stores/game.ts`
  - 新局/继续游戏。
  - 材料、连续劳动、目标牌、成果验收、随机事件、大喵保护和结束结算的第一轮编排。
  - 定时存档、暂停、恢复倒计时和结束报告状态。
- `src/db/database.ts`
  - Dexie 表：设置、当前对局、历史记录。
  - 设置校验。
  - 完成游戏时通过事务写历史并删除当前存档。
- `src/stores/settings.ts`
  - 音量、静音、语言、教学状态、默认按键。
  - 设置变更自动持久化。

### 6. 页面与公共组件初稿

- `src/views/Home/Home.vue`
  - 开始、继续、覆盖确认。
  - 玩法说明、声音、游玩记录、设置、关于入口。
- `src/views/Game/Game.vue`
  - Pixi 画布、HUD、事件状态、反馈、暂停、教学、恢复倒计时。
  - 开发用 Balance 参数调试面板。
- `src/components/BaseModal/BaseModal.vue`
  - 公共弹层。
- `src/components/LaborReport/LaborReport.vue`
  - 劳动报告初稿。
  - Canvas 分享图生成、预览和下载。
- `src/i18n/index.ts`
  - 中文 key 已建立；尚未添加英文。

### 7. 文档

- `apps/myy-on-duty/README.md`
- `apps/myy-on-duty/docs/README.md`
- `apps/myy-on-duty/docs/architecture.md`
- `apps/myy-on-duty/docs/assets.md`
- `apps/myy-on-duty/docs/acceptance.md`
- `docs/apps/myy-on-duty.md`
- 根 `docs/README.md` 已增加应用入口。

素材清单已经记录当前缺少的角色、台面、机关、材料、UI、BGM 和音效。

## 最近一次校验结果

已经成功：

```text
pnpm --filter @strawberrybear/myy-on-duty type-check
pnpm --filter @strawberrybear/myy-on-duty lint
pnpm --filter @strawberrybear/myy-on-duty test
```

结果：

- type-check：通过。
- lint：通过，且已运行 `eslint . --fix` 清理模板格式警告。
- Vitest：5 个测试全部通过。

最近一次 build 曾失败，报错为：

```text
src/stores/game.ts: EventId 未使用
src/stores/settings.ts: @pixi/sound muteAll 用法错误
vite.config.ts: Vite defineConfig 不识别 test 字段
```

之后已经做了以下修正：

- 删除未使用的 `EventId`。
- 改为调用 `sound.muteAll()` / `sound.unmuteAll()`。
- 从 `vite.config.ts` 移除 Vitest 配置。
- 新增独立 `vitest.config.ts`。

**修正后尚未重新运行 build**，接手后的第一件事应重新执行完整检查。

## 接手后第一步

在仓库根目录执行：

```bash
pnpm --filter @strawberrybear/myy-on-duty type-check
pnpm --filter @strawberrybear/myy-on-duty lint
pnpm --filter @strawberrybear/myy-on-duty test
pnpm --filter @strawberrybear/myy-on-duty build
```

然后启动：

```bash
pnpm --filter @strawberrybear/myy-on-duty dev
```

浏览器分别检查主页和 `/game`。确认运行稳定后再执行 Playwright：

```bash
pnpm --filter @strawberrybear/myy-on-duty test:e2e
```

Playwright 浏览器如果尚未安装，需要先按当前仓库环境安装 Chromium。

## 明确未完成或需要重做的部分

### 物理台面

- 左侧加班回环目前只有少量墙段，未形成可验证的完整回环。
- 右侧发射通道顶部单向挡片未实现。
- 内回球道、外侧下班道、下班弹弓的几何和弹力仍是粗略占位。
- 拍板当前直接跳到目标角度，不是按 `flipperSpeed` 平滑推进；`flipperImpulse` 未真正应用。
- 调试面板直接修改 `BALANCE`，但 Rapier 世界的重力和已创建碰撞体不会自动全部同步。
- `resize` 只在初始化执行，窗口尺寸变化时未更新 Pixi 根容器。
- `GameEngine` 的 window 级键盘监听没有保存引用并解除，反复进入游戏页可能累积监听器。
- 机关碰撞冲量方向目前包含随机横向分量，尚未按法线或机关中心计算。
- 发射力度不足回落后，`launched` 不会自动重置，可能无法再次蓄力。

### 八类随机事件

当前只完成事件选择、持续时间和“今日超想要 / 丰收 / 大喵重新上岗”的少量业务分支。

以下 PRD 行为未完整实现：

- 强制加班的等待劳动区、出口关闭与超时。
- 暖暖查岗三个区域首次命中进度。
- 下班冲刺实际修改主动机关弹力。
- 借口连发的三块动态碰撞牌。
- 陨星丰收命中后立即结束。
- 风险事件不能连续出现的分类约束。
- 事件冷却应读取各自配置，目前结束后写死 10 秒。
- 成果验收捕获期间事件剩余时间应冻结，目前使用绝对时间，会继续流逝。

### 成果验收与结束

- 验收通道尚未有开关门碰撞体和捕获/弹回动画。
- 三块目标当前是固定碰撞体，视觉和物理上不会真正倒下。
- 验收冷却应在 10 秒后同时升起目标，目前在 1.2 秒反馈结束时直接重置。
- 下班后“继续掉出画面、台面变暗、下班方式文案、剩余材料结算反馈”未完整制作。
- 称号技术分、特殊分和亮点选择只是简化实现，未覆盖 PRD 全部指标。

### 存档一致性

- 只对设置做了 Zod 校验，对完整对局和历史结构尚未建立 Zod Schema。
- 暂停时事件绝对结束时间没有换算为剩余时长，恢复后可能提前结束。
- 验收结算目前先改内存再保存，不是 IndexedDB 内部单事务结算。
- 拍板、机关、借口牌等物理状态尚未进入存档。
- `beforeunload` 的异步保存不保证浏览器完成，需要再设计可靠策略。
- 尚未实现旧版本存档迁移。

### UI 和页面

- 资源加载页、加载失败和重试尚未实现。
- 设置中的语言只有中文展示；PC 键位只显示，不能编辑，且引擎仍写死 A/L/Space。
- 首页“继续游戏”的进度摘要尚未展示。
- 教学是文字列表，没有分步遮罩和操作示意。
- 当前自定义按钮使用文字“声 / 静 / 录 / 设”等代替图标，后续应接入正式图标素材。
- 报告缺少分类展开、验收收入/下班收入拆分、最高倍率、事件与回环等完整字段。
- 分享图只有基础文字版，没有正式主题视觉和三条经过翻译的亮点。
- 没有单独实现资源预加载进度和音频注册。

### 测试与验收

- Playwright 用例尚未实际执行。
- 未做真实浏览器截图和移动端尺寸验收。
- 未对 Dexie 事务、暂停恢复、存档迁移、全部随机事件补测试。
- 未进行高速穿透压力测试。
- 未逐条完成 PRD 第 27、28 节验收。

## 建议的继续顺序

1. 重新运行 type-check、lint、test、build，修复所有阻塞。
2. 启动浏览器，先修复 Pixi/Rapier 运行时异常、事件监听泄漏和重复进入问题。
3. 完整搭建台面几何、发射回落、拍板平滑运动、单向挡片和出口判定。
4. 将八类随机事件拆为独立状态处理器，不继续堆叠到 `stores/game.ts`。
5. 完整实现验收状态机和暂停时钟，随后完善存档 Schema 与事务。
6. 补资源加载页、设置按键、报告字段和分享图。
7. 补单元测试与 Playwright，最后按 `docs/acceptance.md` 做浏览器验收。

## 重要约束

- 不要修改原计划文件。
- 不要修改 `public/`，除非获得用户明确授权。
- 所有平衡数值继续集中在 `src/config/balance.ts`。
- 台面坐标继续维护在 `src/config/board.ts`，不要把布局与经济配置混在一起。
- 逐帧坐标、速度和拍板角度不要放入 Pinia。
- Vue 页面保持薄，新增复杂区块按仓库规则放入页面同级 `components/<组件>/<组件>.vue`。
- 每次代码修改后至少运行应用级 type-check 和 lint。
