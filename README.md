# 🍓 strawberrybear-tools

个人工具仓库 | Monorepo 管理多类型工具项目（Vue/React/CLI/纯 JS）

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建所有项目
pnpm build

# 开发单个项目
cd apps/web-vue && pnpm dev
```

---

## 项目列表

| 项目 | 类型 | 说明 |
|------|------|------|
| `apps/web-vue` | Vite + Vue3 | Web 在线工具示例 |
| `apps/web-react` | Vite + React | Web 在线工具示例 |
| `apps/cli` | 纯 TS CLI | 命令行工具示例 |

---

## 开发流程

### 1. 创建或修改项目

在 `apps/` 目录下创建新项目，或修改现有项目。

```
apps/
├── web-vue/      # 新建或修改这里
├── web-react/    # 或这里
└── cli/          # 或这里
```

### 2. 本地开发

```bash
# 进入项目目录
cd apps/web-vue

# 启动开发服务器
pnpm dev
```

### 3. 提交代码

```bash
git add .
git commit -m "feat(web-vue): 添加新功能"
git push
```

> **注意**：提交代码只会触发 CI（构建 + 类型检查），不会触发发版。

---

## 发版流程

发版通过 **changeset** 文件来声明。changeset 告诉系统"这个项目有变更，需要发版"。

### 1. 创建 changeset 文件

在 `.changeset/` 目录下创建一个 `.md` 文件：

```bash
# 手动创建，或使用命令（交互式）
pnpm changeset
```

**文件格式示例**（`.changeset/fix-vue-button.md`）：

```markdown
---
"@strawberrybear/web-vue": patch
---

修复按钮点击事件
```

### 2. changeset 类型说明

| 类型 | 关键字 | 含义 | 版本号变化 |
|------|--------|------|-----------|
| 补丁 | `patch` | Bug 修复 | `0.0.1` → `0.0.2` |
| 小功能 | `minor` | 新功能（向下兼容） | `0.0.1` → `0.1.0` |
| 大版本 | `major` | 破坏性变更 | `0.0.1` → `1.0.0` |

### 3. 提交 changeset

```bash
git add .changeset/fix-vue-button.md
git commit -m "chore: 添加 vue 按钮修复 changeset"
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
│    - 运行 pnpm ci:version（更新版本号）                      │
│    - 生成 CHANGELOG.md                                       │
│    - 提交版本变更到 main 分支                                │
│    - 创建 GitHub Release                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 单包独立发版

**本项目支持只发一个包**，其他包不受影响。

### 示例场景

假设你只修改了 `web-vue`，只想发 `web-vue`：

**步骤 1**：创建只针对 `web-vue` 的 changeset：

```markdown
---
"@strawberrybear/web-vue": patch
---

修复登录按钮样式
```

**步骤 2**：其他包（`web-react`、`cli`）保持不变，**不需要创建任何 changeset 文件**。

**步骤 3**：push 后，系统只会：
- 更新 `web-vue` 的版本号（`0.0.1` → `0.0.2`）
- 只为 `web-vue` 生成 CHANGELOG
- 只创建 `web-vue` 的 GitHub Release

**结果**：

```
@strawberrybear/web-vue     0.0.1 → 0.0.2  ✅ 发布
@strawberrybear/web-react   0.0.1         ✅ 不变
@strawberrybear/cli         0.0.1         ✅ 不变
```

### 同时发多个包

如果一次修改涉及多个包，可以在同一个 changeset 文件中声明：

```markdown
---
"@strawberrybear/web-vue": minor
"@strawberrybear/web-react": patch
---

统一主题配色
```

---

## 版本号管理规则

| 修改类型 | changeset 关键字 | 原版本 | 新版本 |
|---------|----------------|--------|--------|
| Bug 修复 | `patch` | `1.2.3` | `1.2.4` |
| 新功能 | `minor` | `1.2.3` | `1.3.0` |
| 破坏性变更 | `major` | `1.2.3` | `2.0.0` |

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

# 创建 changeset（交互式）
pnpm changeset

# 手动版本更新（仅本地，不会发版）
pnpm ci:version
```

---

## GitHub Actions 工作流

| Workflow | 文件 | 触发条件 | 作用 |
|----------|------|----------|------|
| **CI** | `.github/workflows/ci.yml` | push / pull_request 到 main | 构建 + 类型检查 |
| **Release** | `.github/workflows/release.yml` | push 到 main，且有 changeset | 发版 + 创建 Release |

### 查看 CI/CD 状态

访问：https://github.com/Ztachi/strawberrybear-tools/actions

---

## 文档规范

详见 [docs/README.md](docs/README.md)

- [开发规范](docs/AGENT.md)
- [国际化规范](docs/I18N.md)
- [项目搭建计划](docs/PLAN.md)
