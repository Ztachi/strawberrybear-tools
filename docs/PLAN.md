# 🍓 strawberrybear-tools 项目搭建计划

> 本文档记录了 strawberrybear-tools 项目从零搭建的完整计划与执行过程。

---

## 项目概述

搭建基于 **Vite 8 + pnpm + Turborepo + changesets** 的 monorepo 工具仓库，包含示例项目，配置 GitHub Actions CI/CD（含 changesets 单包独立发版），生成文档（根目录统一索引 + Agent 规范 + i18n 规范），并推送至 GitHub。

## 项目结构

```
strawberrybear-tools/
├── apps/                          # 应用程序
│   ├── web-vue/                   # Vite + Vue3 示例工具
│   ├── web-react/                 # Vite + React 示例工具
│   └── cli/                       # 纯 TS CLI 示例工具
├── docs/                          # 规范文档
│   ├── README.md                  # 文档统一索引入口
│   ├── AGENT.md                   # Agent 开发规范（持续更新）
│   ├── I18N.md                    # 国际化规范（当前仅此一条目）
│   └── PLAN.md                    # 本计划文档
├── packages/                      # 共享包（非必选，后续扩展）
├── tools/                         # 独立脚本/二进制工具
├── turbo.json                     # Turborepo 配置
├── pnpm-workspace.yaml             # pnpm 工作区配置
├── package.json                   # 根 package.json
├── .changeset/
│   └── config.json                # changesets 配置
├── .github/
│   └── workflows/
│       ├── ci.yml                 # 日常 CI（lint + type-check + build）
│       └── release.yml            # Release CI/CD（changesets 发版）
└── .gitignore
```

## 实施步骤

### Step 1. 初始化 monorepo 基础结构

- 创建根目录 `strawberrybear-tools/`
- 初始化 `package.json`、`pnpm-workspace.yaml`、`turbo.json`
- 安装 Turborepo + changesets CLI

```bash
mkdir -p strawberrybear-tools && cd strawberrybear-tools
pnpm init
pnpm install -Dw turbo @changesets/cli
pnpm changeset init
```

### Step 2. 创建示例应用

**`apps/web-vue/`** — Vite + Vue3 + TS
**`apps/web-react/`** — Vite + React + TS
**`apps/cli/`** — 纯 TS CLI（tsup 打包，tsx 运行示例）

每个 app 独立 `package.json`，设置 `name` 为 `@strawberrybear/[app-name]`

### Step 3. 配置 GitHub Actions CI

`.github/workflows/ci.yml`：每次 PR/推送运行
- pnpm install
- Turborepo build（所有 app）
- Type-check（每个 app 独立）

### Step 4. 配置 GitHub Actions Release CI

`.github/workflows/release.yml`：
- 触发条件：`push` 到 `main` 分支
- 检测 changesets changeset 文件
- 为有变化的包 bump 版本 + 生成 CHANGELOG
- 打 git tag
- 创建 GitHub Release

> **单包独立发版**：每个 app 是独立的 changeset 包，只需在 `.changeset/` 下创建 changeset 文件声明版本变更即可，CI 自动识别哪个 app 需要发版。

### Step 5. 测试 CI/CD 跑通

- **示例 CI**：创建测试 PR 验证 ci.yml 正常执行
- **Release CI**：在 `apps/web-vue/` 下添加 changeset 文件，push 后验证 release.yml 正确识别并创建 Release

### Step 6. 生成文档

**`README.md`（根目录）**：项目介绍 + 快速开始 + apps 索引 + docs 索引

**`docs/README.md`**：规范文档统一索引
- 链接到 `AGENT.md`、`I18N.md` 等

**`docs/AGENT.md`**：Agent 开发规范（当前为框架，后续持续填充）

**`docs/I18N.md`**：国际化规范
> 核心规则：**所有项目必须做国际化，初始只适配中英文（zh-CN / en-US）**

### Step 7. GitHub MCP 创建仓库并推送

- 创建仓库：`strawberrybear-tools`
- 描述：`🍓 个人工具仓库 | Monorepo 管理多类型工具项目（Vue/React/CLI/纯 JS）`
- 初始化 git，添加 remote，推送代码

---

## 关键技术选型

| 技术 | 用途 |
|------|------|
| **pnpm** | 高效磁盘共享依赖，比 npm/yarn 快 2-3 倍 |
| **Turborepo** | 任务编排+缓存，构建提速显著 |
| **changesets** | 业界主流 monorepo 版本管理与 CHANGELOG 生成工具 |
| **GitHub Actions** | CI/CD，GitHub Release 自动发布 |
| **Vite 8** | 统一构建工具，支持 Vue/React/纯 TS/CLI 各类项目 |

---

## Plan Todos 状态追踪

| ID | 任务 | 状态 |
|----|------|------|
| 1 | 初始化 monorepo 基础结构（pnpm workspace + turbo.json + changesets） | ✅ 完成 |
| 2 | 创建示例应用（apps/web-vue、apps/web-react、apps/cli） | ✅ 完成 |
| 3 | 配置 GitHub Actions CI（lint + type-check + build） | ✅ 完成 |
| 4 | 配置 GitHub Actions Release CI（changesets 版本管理 + GitHub Release） | ✅ 完成 |
| 5 | 测试 CI/CD 流程跑通（示例 CI + 单包 changesets 独立发版 CI） | 🔄 进行中 |
| 6 | 生成文档（根 README 统一索引 + Agent 规范 + i18n 规范） | 🔄 进行中 |
| 7 | GitHub MCP 创建仓库并推送代码 | ✅ 完成 |
| 8 | 将计划文档 PLAN.md 放入项目 docs/ 目录 | ✅ 完成（本文档） |
