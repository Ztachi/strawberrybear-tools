---
name: create-app
description: >-
  在 strawberrybear-tools monorepo 中创建新 app 的完整流程指导。覆盖阅读规范文档、创建 /apps 目录结构、配置 package.json、设置 lint/type-check、建立 CI/CD workflow、以及为 app 建立内部规范约束。
  Use when user mentions "创建app"、"新建app"、"create app"、"add app"、"新增应用"、"新建一个工具"、or any request to scaffold a new application in this monorepo.
---

# 创建 App（Monorepo）

本仓库采用 **pnpm + Turborepo + Changesets** 的 monorepo 架构，App 放在 `/apps` 目录下，公共库放在 `/packages` 目录下。

---

## Step 0：阅读规范文档（必须第一步）

**在动任何代码之前，必须先读完以下文档：**

```
docs/README.md          → 文档索引（入口）
docs/CICD.md            → CI/CD 规范（尤其重要，含完整 workflow 模板）
docs/CODE_COMMENTARY.md → 代码注释规范
docs/I18N.md            → 国际化规范
docs/UI.md              → UI 交互规范（如适用）
docs/packages/README.md → 公共库规范（如需引用 packages）
```

> 关键规范不在此 SKILL 中重复，以文档为准，SKILL 只提供流程框架。

---

## Step 1：确认 App 类型

在开始之前，与用户确认以下信息：

| 问题                                               | 影响项                                                      |
| -------------------------------------------------- | ----------------------------------------------------------- |
| 技术栈是什么？（Vue / React / Tauri / CLI / 其他） | 模板选择、依赖安装                                          |
| App 名称是什么？                                   | 目录名 `apps/<app-name>`，包名 `@strawberrybear/<app-name>` |
| 是否需要部署到 Cloudflare Pages？                  | CI/CD workflow 情形选择                                     |
| 是否有跨平台桌面端需求？（Tauri）                  | Rust 环境、多平台 build job                                 |

---

## Step 2：创建 App 目录结构

```bash
apps/<app-name>/
├── package.json         # 必须，name = @strawberrybear/<app-name>
├── src/
│   ├── i18n/            # 国际化（所有 app 必须）
│   │   ├── index.ts
│   │   ├── zh-CN.ts
│   │   └── en-US.ts
│   └── ...
├── docs/                # App 内部规范文档（见 Step 5）
│   └── README.md
├── CHANGELOG.md         # Changeset 自动生成，手动创建空文件占位
├── README.md
└── vite.config.ts       # 如适用
```

---

## Step 3：配置 `package.json`

```json
{
  "name": "@strawberrybear/<app-name>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "lint": "eslint ."
  }
}
```

> - `name` 必须为 `@strawberrybear/<app-name>` 格式，Changeset 和 Turbo filter 均依赖此命名
> - `type-check` 和 `lint` script 是 CI 强制要求，缺失则 `ci.yml` 会报错

---

## Step 4：配置 CI/CD Workflow

在 `.github/workflows/` 下新建 `release-<app-name>.yml`。
根据 `docs/CICD.md` 选择对应情形的模板：

| 情形       | 适用场景                                   |
| ---------- | ------------------------------------------ |
| **情形一** | 普通 Web 应用，构建 dist 作为 Release 附件 |
| **情形三** | 需同时部署到 Cloudflare Pages              |
| **情形二** | Tauri 桌面应用，需多平台构建               |

**关键配置项（替换 `<app-name>`）：**

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'apps/<app-name>/**'
      - '!apps/<app-name>/**/*.md'   # 排除纯文档变更
  workflow_dispatch:

# build 命令
run: pnpm --filter @strawberrybear/<app-name> build

# Release tag
tag_name: <app-name>@v${{ steps.version.outputs.version }}
```

> 完整 workflow 模板见 `docs/CICD.md`，不要自行简化或省略步骤。

---

## Step 5：建立 App 内部规范（重要）

每个 App 的技术栈、方向不同，必须在 `apps/<app-name>/docs/README.md` 中建立自己的内部规范约束。

**内部规范文档应包含（根据实际情况取舍）：**

```markdown
# <App名称> 开发规范

## 技术栈
- 列出本 App 使用的框架、关键依赖、版本

## 目录结构
- 说明 src/ 下的目录用途

## 状态管理规范
- 如使用 Pinia / Zustand / 自定义 composable，说明约定

## 组件规范
- 命名规则（如小驼峰）、存放位置（局部组件 vs 全局组件）
- 参考通用规范中 vue 代码规范

## 路由规范
- 如有路由，说明路由文件组织方式

## API 调用规范
- 接口封装方式、错误处理约定

## 样式规范
- CSS / Tailwind / UnoCSS 使用约定

## Tauri 命令规范（仅 Tauri App）
- 命令命名、前端调用方式
```

---

## Step 6：Changeset 配置

在 `.changeset/` 下添加初始 changeset 文件（触发首次发版）：

```markdown
---
"@strawberrybear/<app-name>": minor
---

初始化 <app-name> 应用
```

---

## Step 7：完成后验收清单

```
- [ ] apps/<app-name>/package.json → name 格式正确
- [ ] package.json 包含 type-check 和 lint script
- [ ] 国际化目录已创建（i18n/index.ts + zh-CN.ts + en-US.ts）
- [ ] CHANGELOG.md 存在（哪怕是空文件）
- [ ] .github/workflows/release-<app-name>.yml 已创建
- [ ] workflow 中 paths 过滤正确，排除了 *.md
- [ ] apps/<app-name>/docs/README.md 内部规范已编写
- [ ] 运行 pnpm type-check && pnpm lint 无报错
- [ ] 已创建 .changeset/ 初始 changeset 文件
```

---

## 参考资源

- [CI/CD 规范](../../docs/CICD.md) — workflow 完整模板，必读
- [代码注释规范](../../docs/CODE_COMMENTARY.md) — JSDoc/Rust 注释格式
- [国际化规范](../../docs/I18N.md) — i18n 实施要求
- [UI 交互规范](../../docs/UI.md) — 组件使用约定
- [公共库规范](../../docs/packages/README.md) — 如需引用 @packages/\*
