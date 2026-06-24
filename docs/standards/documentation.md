# 文档分层规范

## 原则

- 根 `README.md` 只说明项目定位、workspace、常用命令、核心架构规则和文档入口。
- `docs/README.md` 是根层文档索引，只链接当前有效的根层规范、应用文档索引、公共包文档、Skill 和归档。
- `docs/architecture/` 只放单仓库和公共架构。
- `docs/standards/` 只放按规则类别、技术类别或代码类别组织的通用规范。
- 根层规范可以用具体应用做示例，但不能把某个应用写成规则前提；应用专属规则必须下沉到 `apps/<app>/docs/`。
- `apps/<app>/docs/` 放应用专属架构、UI 框架、平台端口、部署和验收，并声明该应用继承哪些根层规范。
- `packages/<package>/README.md` 是该公共包的使用说明和 API 文档。
- `skills/<skill>/SKILL.md` 是仓库级 Agent Skill 的唯一源；`.cursor/skills/` 仅作索引指向根 `skills/`。
- `docs/archive/` 只放历史需求、旧架构草案和背景材料，不作为当前实现依据。

## 去重规则

同一条规则只能有一个权威位置：

- 单仓库结构、依赖方向、app / 公共包边界写在 [`docs/architecture/monorepo.md`](../architecture/monorepo.md)。
- 开发命令、提交规范、ESLint / Prettier、基础编码约定写在 [development.md](development.md)。
- 项目目录、源码别名、应用源码、视图单元层级、子视图拆分触发条件、共享 UI 逻辑、常量目录与共享 tsconfig 写在 [project-structure.md](project-structure.md)。
- UI 通用原则、组件库优先级、组件化与样式复用、图标与可访问性、文本超长处理写在 [ui.md](ui.md)。
- 启用 Tailwind 的应用（原子 class、复用与组合、响应式、验收）写在 [tailwindcss.md](tailwindcss.md)。
- CSS 优先原则（避免 JS 测量 DOM）、应用级滚动条基础设施写在 [styling.md](styling.md)。
- 注释与 JSDoc 规范、关键逻辑行内注释、注释同步规则写在 [comments.md](comments.md)。
- 常量管理（目录、机器字段、来源标注、校验）写在 [constants.md](constants.md)。
- 单元测试（owner、mock 边界、命令矩阵、CI 关系）写在 [testing.md](testing.md)。
- 公共包边界、命名、package.json 必需字段、TypeScript 类型、JSDoc 注释、构建与发布写在 [public-packages.md](public-packages.md)。
- 依赖策略（来源、方向、版本变更、校验）写在 [dependencies.md](dependencies.md)。
- 国际化（必须 i18n、点号 key、跨栈约定）写在 [i18n.md](i18n.md)。
- CI/CD 规范、workflow 设计、新增 app 步骤、发版流程写在 [cicd.md](cicd.md)。
- 分支模型、PR 合并规则、commit 规范、紧急修复流程写在 [branching.md](branching.md)。
- 框架特定实践（Vue 组合式 API、React 模式、JSX 模式、UI 库 API 等）**不进入根层**，按需放到应用 `docs/` 或对应 skill（如 [skills/vue-1.0.1/](../../skills/vue-1.0.1/SKILL.md)、[skills/rust-1.0.1/](../../skills/rust-1.0.1/SKILL.md)）。
- 应用选择的 UI 框架、主题 token、平台 SDK、部署脚本、设备验收写在 `apps/<app>/docs/`。

如果旧文档和代码实现冲突，以当前源码、测试、manifest、脚本和部署配置为准。

## 文件编辑安全（Agent 协作）

修改已有源码必须使用局部补丁，改动范围只覆盖当前需求涉及的行。不要为了绕过补丁匹配、编码显示或批量替换问题，对源码做整文件读写、转码、重生成或基线覆盖；这类操作会破坏用户未提交改动。

遇到补丁无法匹配、中文注释乱码、文件编码异常或工具准备改写整文件时，必须先停止并重新读取局部上下文，改用更小的补丁；仍无法安全定位时，先向用户说明风险，不继续写入。

在 Windows PowerShell 环境下，Agent 读取包含中文的源码或文档前必须自行设置 UTF-8 控制台编码。该设置只用于命令显示和读取，不得把 PowerShell 的 `Get-Content` / `Set-Content` 作为源码修改手段。

## Skill

文档重构前先使用仓库内 skill：`skills/doc-architecture/SKILL.md`。
