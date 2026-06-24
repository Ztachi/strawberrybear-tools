---
name: dev-standards
description: >-
  快速理解并应用 strawberrybear-tools 单仓库开发规范（根层通用规范 + 当前 app 专属规范）。
  Use before code changes, reviews, debugging, refactors, app or package work, UI work, CI/CD, i18n, or documentation that affects engineering standards in this repository.
---

# Dev Standards（strawberrybear-tools）

在任何工程任务开始时使用本 skill。它是给 Agent 的快速 onboarding 清单，**不替代**仓库文档本身。

## Step 0：确定工作范围

1. 阅读当前任务，检查将要修改的路径与 `git status --short`。
2. 判断任务属于哪一类 workspace：
   - 路径在 `apps/<app-name>/` → 当前 app 为 `<app-name>`
   - 路径在 `packages/<pkg>/` → 当前公共包为 `<pkg>`
   - 路径在根层 `docs/`、`skills/`、`.github/` → 仓库级任务，无单一 app owner
3. 若用户未指明 app，但从文件路径、报错栈或功能描述可推断 app，以推断结果为准并在回复中说明；无法推断时先向用户确认，不要默认猜测 app 规范。

## Fast Load Order（根层，始终加载）

```text
docs/architecture/monorepo.md
docs/standards/development.md
docs/standards/project-structure.md
```

## Fast Load Order（按任务追加）

| 任务类型                                          | 额外必读                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 任意 app 代码/UI                                  | `apps/<app>/docs/README.md`，再按 README 链接加载 design/product/deploy 等子文档                               |
| UI 工作（通用层：组件库、组件化、图标、文本截断） | `docs/standards/ui.md`                                                                                         |
| Tailwind 工作                                     | `docs/standards/tailwindcss.md`（前提是应用启用了 Tailwind）                                                   |
| 样式基础设施（CSS 优先、滚动条）                  | `docs/standards/styling.md`                                                                                    |
| Vue 组件/composable                               | `docs/standards/project-structure.md`「视图单元层级 / 共享 UI 逻辑」；Vue 实战另读 `skills/vue-1.0.1/SKILL.md` |
| Tauri / Rust 后端                                 | `apps/<app>/src-tauri/docs/`（若存在）；Rust 实践另读 `skills/rust-1.0.1/SKILL.md`                             |
| 注释 / JSDoc / 导出 API                           | `docs/standards/comments.md`                                                                                   |
| 常量 / 持久化字段                                 | `docs/standards/constants.md`                                                                                  |
| i18n                                              | `docs/standards/i18n.md`                                                                                       |
| 公共包                                            | `docs/standards/public-packages.md`、目标包 `README.md`、`package.json`、入口与测试                            |
| 依赖变更                                          | `docs/standards/dependencies.md`                                                                               |
| 测试 / bug 修复 / 行为变更                        | `docs/standards/testing.md`、目标 owner 现有测试                                                               |
| CI/CD / 发版 / 部署                               | `docs/standards/cicd.md`、`docs/standards/branching.md`、目标 app 部署相关 docs                                |
| 文档结构变更                                      | `skills/doc-architecture/SKILL.md`、`docs/standards/documentation.md`                                          |
| 新建 app                                          | `skills/create-app/SKILL.md`                                                                                   |
| Cloudflare Pages 上线                             | `skills/launch-cloudflare-pages-app/SKILL.md`                                                                  |

## 当前 App 规范加载规则

1. **入口固定为** `apps/<app>/docs/README.md`。
2. README 中的「继承的根规范」只列链接，不重复正文；需要某条规则时再打开对应 `docs/standards/*.md`。
3. README 中的「应用专属规范」是当前 app 的权威摘要；若与根层冲突，以 app docs 为准（仅限该 app 范围内）。
4. 按任务继续下钻，例如：
   - UI / 主题 / 组件库 → `apps/<app>/docs/design/`
   - 产品口径 / 验收 → `apps/<app>/docs/product/`
   - Tauri 命令 / 平台权限 → `apps/<app>/src-tauri/docs/`
5. 示例/测试 app（`web-vue`、`web-react`）通常只有 README，无额外 design 层；直接沿用根层全部 `docs/standards/`。

## 默认工程规则

- **证据优先级**：当前源码、测试、`package.json`、脚本、workflow 强于旧文档 prose。
- **根层 vs app 层**：根 `docs/standards/` 只写按类别通用的规则；组件库选型、主题 token、平台 SDK、部署脚本、设备验收写在 `apps/<app>/docs/`。
- **依赖方向**：`apps/*` 可依赖 `packages/*`；公共包不得反向依赖 app 源码、UI 框架或单 app 默认值。
- **目录语义**：页面在 `src/views/`，跨页复用在 `src/components/`，共享逻辑在 `src/composables/`，稳定常量在 `src/const/`；有子组件必须建文件夹，子组件放 `components/`。
- **组件边界**：i18n、主题、路由等全局上下文在叶子组件内用组合式 API 获取，不层层 props 透传；可增长集合用结构化数组/对象列表驱动渲染。
- **样式**：布局/间距/响应式优先 Tailwind 或 CSS；文本截断必须配 Tooltip/Popover；能用 CSS 不算 JS 布局。
- **注释**：中文、贴近代码行；关键状态切换、异步顺序、平台分支、持久化与副作用必须说明「为什么」。
- **国际化**：所有 app 必须 i18n，初始 zh-CN / en-US；key 用点号分隔，见 `docs/standards/i18n.md`。
- **交付前校验**：改代码后运行 `pnpm type-check && pnpm lint`；涉及具体 app 时再跑该 app 的 test/build（以 app docs 为准）。
- **提交**：Conventional Commits，中文 commit message；日常 PR 用 Squash merge；`main → develop` 发版后历史同步 PR 用 merge commit（见 branching 规范）。

## 任务决策表

| 任务种类       | 首先 inspect 的 owner                                                      | 额外规范                                                         |
| -------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| App 页面/功能  | `apps/<app>/docs/README.md`、相关 `src/views/`（或应用声明的等价页面目录） | `project-structure.md`「视图单元层级」、`ui.md`、app design docs |
| 公共包 API     | `packages/<pkg>/README.md`、入口、测试                                     | `public-packages.md`、`comments.md`                              |
| Tauri 桌面行为 | `src-tauri/`、app 平台 docs                                                | `rust-1.0.1` skill、app docs                                     |
| UI 布局/交互   | app design docs、局部组件                                                  | `ui.md`、`styling.md`，启用 Tailwind 时另读 `tailwindcss.md`     |
| Bug 修复       | 最近 owner 源码与测试                                                      | `testing.md`                                                     |
| 发版/部署      | workflow、changeset、app deploy docs                                       | `cicd.md`、`branching.md`                                        |
| 文档维护       | 现有文档 owner                                                             | `doc-architecture` skill                                         |

## 校验默认项

```bash
# 根层或跨 workspace 改动
pnpm type-check && pnpm lint

# 单 app（将 <app-name> 替换为实际包名）
pnpm --filter @strawberrybear/<app-name> type-check
pnpm --filter @strawberrybear/<app-name> test
pnpm --filter @strawberrybear/<app-name> build

# 文档/skill 改动
git diff --check
```

各 app 若有额外验收命令（E2E、Tauri 打包、PWA 离线检查等），以 `apps/<app>/docs/` 为准，根层不重复定义。

## 常见失误

- 未读 `apps/<app>/docs/README.md` 就按其他 app 的 UI 框架或目录习惯写代码。
- 把某个 app 的 antdv-next / Vuetify / Babylon 约定写进根层 `docs/standards/`。
- 在 `packages/*` 里修 app 或平台 bug，未先证明 owner 在公共包。
- 根层文档与 app docs 重复维护同一条规则，导致漂移。
- 只跑 build 不跑 type-check/lint，或忽略 app docs 要求的 test。
- 修改 skill 时只更新 `skills/` 或只更新 `.cursor/skills/`，造成两边不一致。

## 相关 Skill

- 文档分层：`skills/doc-architecture/SKILL.md`
- 新建 app：`skills/create-app/SKILL.md`
- Cloudflare Pages 上线：`skills/launch-cloudflare-pages-app/SKILL.md`
- Vue 深入：`skills/vue-1.0.1/SKILL.md`
- Rust 深入：`skills/rust-1.0.1/SKILL.md`

以上路径在 `.cursor/skills/` 下有相同副本，内容需保持同步。
