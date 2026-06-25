# 依赖策略

## 适用范围

本规范描述 `strawberrybear-tools` 仓库跨 workspace 共享的依赖管理策略。具体 app 的依赖清单由其 `package.json` 维护，CI 校验以 `pnpm-lock.yaml` 为准。

## 依赖来源

- 所有依赖通过 pnpm workspace + `pnpm-lock.yaml` 统一管理。
- 仓库内 workspace（`apps/*` 与 `packages/*`）必须使用 pnpm workspace 协议声明：`"@strawberrybear/<name>": "workspace:*"`。
- 跨 workspace 引入必须通过包入口（`exports` 字段），不得穿透 `packages/<name>/src/*` 之类的内部路径。

## 依赖方向

- `apps/*` 可依赖 `packages/*`，可调用平台 API、宿主 SDK、浏览器运行时、Node 运行时。
- `packages/*` **不得**反向依赖 `apps/*`，不得调用具体 app 的平台 SDK、UI 框架或环境变量。
- `packages/*` 之间互相依赖也只通过包入口；不允许在 `packages/<a>/src/*` 内部 import `packages/<b>/src/*`。

## 版本与变更

- 关键依赖（TypeScript / Vite / pnpm / Changesets / 各 app 框架核心）版本变更必须走 Changeset，遵守 [CI/CD 规范](cicd.md) 与 [分支管理](branching.md)。
- 升级锁文件必须由依赖 owner 提交，不允许在 PR 中夹带无关依赖更新。
- 新增依赖前先确认仓库是否已有等价实现；优先复用 `packages/*` 公共能力。

## 校验

- 仓库根 `pnpm install --frozen-lockfile` 必须在 CI 强制通过。
- 任何 `package.json` 字段的 `dependencies` / `devDependencies` 变更，都需要该 app 的 type-check 与 build 同时通过。

## 应用专属依赖

平台 SDK、桌面端 Tauri 插件、PWA / Worker 专用库、UI 框架（antdv-next / Vuetify / Babylon.js 等）由各 app 的 `docs/` 维护，根层不重复定义。
