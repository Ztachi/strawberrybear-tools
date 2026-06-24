# 单仓库架构

## 目标

`strawberrybear-tools` 使用 pnpm workspace + Turborepo 组织多应用和共享能力。根层只描述仓库级架构、依赖方向和公共边界；具体应用的运行时、UI 框架、平台端口、部署和验收细节由各应用自己的 `docs/` 维护。

## Workspace

```txt
apps/
  <app>/              # 可独立开发、构建、发版的应用

packages/
  <package>/          # 跨应用共享的公共包或工程配置

skills/
  <skill>/            # 仓库级 Agent Skill（唯一源）

docs/
  architecture/       # 单仓库架构
  standards/          # 跨应用通用规范
  archive/            # 历史文档归档
```

## 依赖方向

```txt
apps/* -> packages/*
apps/* -> 平台 API、宿主 SDK 或部署边界（留在 app 内）
packages/<package> -> packages/tsconfig 或纯 TS 依赖
```

- app 可以消费公共包，但公共包不能反向依赖 app 源码。
- 平台差异、环境默认值和发布渠道策略留在 app 层。
- 公共包之间只能通过包入口互相依赖。

## App 边界模式

每个 `apps/<app>` 都是一个应用边界。应用可以选择 Web 前端、Tauri 桌面端、CLI 等运行面，但必须把这些运行面收敛在自己的目录中。

通用目录语义（按技术栈选用，非强制全部存在）：

- `src/views/`：页面与页面私有组件。
- `src/components/`：跨页面复用的全局组件。
- `src/composables/`：共享组合式逻辑。
- `src/const/`：跨页面稳定业务常量。
- `src/i18n/`：国际化资源。
- `src-tauri/`：Tauri 桌面应用的 Rust 后端（仅桌面 app）。
- `docs/`：应用自己的架构、UI、部署、用户手册和验收文档。

## 公共包边界

公共包承载跨应用稳定能力、共享 UI 组件、测试夹具或工程配置（如 `@strawberrybear/tsconfig`）。公共包必须提供 README，不能内置单个 app 的运行策略、环境默认值或临时开关。

当前公共包：

| 包名                          | 说明                 |
| ----------------------------- | -------------------- |
| `@strawberrybear/piano-roll`  | 钢琴卷帘 Vue 组件    |
| `@strawberrybear/player`      | 播放器相关逻辑       |
| `@strawberrybear/nikki-theme` | 无限暖暖主题 token   |
| `@strawberrybear/tsconfig`    | 共享 TypeScript 配置 |

## 发版模型

- 每个 app 是独立的 Changeset 包，通过 `.changeset/` 声明版本变更。
- Release workflow 按 `apps/<app>/**` paths 过滤，只发变更的应用。
- 分支策略见 [分支管理](../standards/branching.md)，CI/CD 见 [CI/CD 规范](../standards/cicd.md)。
