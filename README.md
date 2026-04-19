# 🍓 strawberrybear-tools

个人工具仓库 | Monorepo 管理多类型工具项目（Vue/React/CLI/纯 JS）

> **English**: [README_en.md](README_en.md)

---

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建所有项目
pnpm build

# 开发单个项目（示例项目）
cd apps/web-vue && pnpm dev
```

---

## 项目列表

| 项目             | 类型         | 说明               |
| ---------------- | ------------ | ------------------ |
| `apps/web-vue`   | Vite + Vue3  | 示例项目（测试用） |
| `apps/web-react` | Vite + React | 示例项目（测试用） |
| `apps/cli`       | 纯 TS CLI    | 示例项目（测试用） |

> **这三个是示例/测试项目**，用于验证 monorepo 架构和 CI/CD 流程正常。新建自己的项目时请参考示例创建新的目录。

---

## 如何新增自己的项目

> 在创建新应用之前，请先完成以下**前置清单**，确保项目从第一天起就接入规范。

### 前置清单

| 事项               | 说明                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **目录结构**       | 在 `apps/` 下创建新目录，`package.json` 的 `name` 字段使用 `@strawberrybear/<app-name>`  |
| **CICD 配置**      | 在 `.github/workflows/` 下新建 `release-<app-name>.yml`，参考 [CI/CD 规范](docs/CICD.md) |
| **国际化**         | 初始适配中英文（zh-CN / en-US），参考 [i18n 规范](docs/I18N.md)                          |
| **README**         | 在应用目录下创建 `README.md`，说明项目用途、本地开发命令、构建方式                       |
| **CHANGELOG**      | 在应用目录下创建空的 `CHANGELOG.md`（Changesets 会自动维护，需要文件存在）               |
| **Changeset 接入** | 发版前在 `.changeset/` 目录下创建变更描述文件，参考下方发版流程                          |

---

### 1. 在 `apps/` 下创建新目录

```
apps/
└── my-new-tool/           # 新建你的项目目录
    ├── package.json       # name: "@strawberrybear/my-new-tool"
    ├── src/
    └── ...
```

### 2. 配置 package.json

```json
{
  "name": "@strawberrybear/my-new-tool",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "你的开发命令",
    "build": "你的构建命令"
  }
}
```

### 3. 本地开发

```bash
cd apps/my-new-tool
pnpm dev
```

### 4. 提交代码

```bash
git add .
git commit -m "feat(my-new-tool): 添加新工具"
git push
```

> **注意**：提交代码只会触发 CI（构建 + 类型检查），不会触发发版。

---

## 发版流程

发版通过 **changeset** 文件来声明。changeset 告诉系统"这个项目有变更，需要发版"。

### 1. 创建 changeset 文件

在 `.changeset/` 目录下创建一个 `.md` 文件：

**手动创建**，内容格式：

```markdown
---
"@strawberrybear/你的项目名": patch
---

修复某个问题
```

### 2. changeset 类型说明

| 类型   | 关键字  | 含义               | 版本号变化        |
| ------ | ------- | ------------------ | ----------------- |
| 补丁   | `patch` | Bug 修复           | `0.0.1` → `0.0.2` |
| 小功能 | `minor` | 新功能（向下兼容） | `0.0.1` → `0.1.0` |
| 大版本 | `major` | 破坏性变更         | `0.0.1` → `1.0.0` |

### 3. 提交 changeset

```bash
git add .changeset/xxx.md
git commit -m "chore: 添加发版 changeset"
git push
```

### 4. 系统自动做什么

push 后，GitHub Actions 会自动执行：

```
┌─────────────────────────────────────────────────────────────┐
│ 触发条件：push 到 main 分支，且 .changeset/ 目录有变化       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. CI Workflow（自动运行）                                    │
│    - 安装依赖                                                │
│    - 构建所有项目                                            │
│    - 类型检查                                                │
│    状态：✅ 成功 / ❌ 失败（失败会阻止后续步骤）              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Release Workflow（自动运行）                              │
│    - 检测 changeset 文件                                     │
│    - 确定哪些包有变更                                        │
│    - 只构建变更的包（pnpm build）                           │
│    - 运行 pnpm ci:version（更新版本号）                      │
│    - 生成各项目的 CHANGELOG.md                               │
│    - 提交版本变更到 main 分支                                │
│    - 创建 GitHub Release（带 changelog + dist 打包产物）     │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Release 产物说明

发版后，GitHub Release 包含：

| 内容            | 说明                         |
| --------------- | ---------------------------- |
| **CHANGELOG**   | 完整版本历史和变更记录       |
| **dist.tar.gz** | 构建产物压缩包（可下载使用） |

**示例**：`web-react@0.2.1` Release 包含 `web-react-0.2.1.tar.gz`（可下载的构建产物）

---

## 单包独立发版

**本项目支持只发一个包**，其他包不受影响。

### 示例场景

假设你只修改了 `my-new-tool`，只想发 `my-new-tool`：

**步骤 1**：创建只针对 `my-new-tool` 的 changeset：

```markdown
---
"@strawberrybear/my-new-tool": patch
---

修复按钮点击问题
```

**步骤 2**：push 后，系统只会：

- 更新 `my-new-tool` 的版本号
- 只为 `my-new-tool` 生成 CHANGELOG
- 只创建 `my-new-tool` 的 GitHub Release

### 同时发多个包

如果一次修改涉及多个包，可以在同一个 changeset 文件中声明：

```markdown
---
"@strawberrybear/my-new-tool": minor
"@strawberrybear/another-tool": patch
---

统一主题配色
```

---

## 版本号管理规则

| 修改类型   | changeset 关键字 | 原版本  | 新版本  |
| ---------- | ---------------- | ------- | ------- |
| Bug 修复   | `patch`          | `1.2.3` | `1.2.4` |
| 新功能     | `minor`          | `1.2.3` | `1.3.0` |
| 破坏性变更 | `major`          | `1.2.3` | `2.0.0` |

---

## 常用命令

```bash
# 安装依赖
pnpm install

# 构建所有项目
pnpm build

# 构建单个项目
pnpm --filter @strawberrybear/web-vue build

# 类型检查
pnpm type-check

# 开发单个项目
cd apps/web-vue && pnpm dev

# 创建 changeset（手动编辑 .changeset/xxx.md）
```

---

## GitHub Actions 工作流

| Workflow             | 文件                                       | 触发条件                          | 作用                                          |
| -------------------- | ------------------------------------------ | --------------------------------- | --------------------------------------------- |
| **CI**               | `.github/workflows/ci.yml`                 | push / PR 到 main（非纯文档变更） | 只对变更包构建 + 类型检查 + Lint              |
| **Release**          | `.github/workflows/release-<app-name>.yml` | push 到 main，对应 app 目录有变化 | 仅在检测到 changeset 版本变更时发版           |
| **Release + 云部署** | `.github/workflows/release-<app-name>.yml` | push 到 main，对应 app 目录有变化 | 同上，**并行**额外自动部署到 Cloudflare Pages |

> **Release + 云部署**属于一种特定配置模式：在同一个 workflow 文件中包含 `deploy-pages` 和 `release` 两个并行的 job。适用于需要将构建产物实时公开访问（如 Web 应用）的场景，详见 [CI/CD 规范](docs/CICD.md)。

### 查看 CI/CD 状态

访问：https://github.com/Ztachi/strawberrybear-tools/actions

---

## 文档规范

详见 [docs/README.md](docs/README.md)

- [开发规范](docs/AGENT.md)
- [国际化规范](docs/I18N.md)
- [项目搭建计划](docs/PLAN.md)
