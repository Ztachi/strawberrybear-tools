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

- 单仓库结构写在 `docs/architecture/monorepo.md`。
- 开发命令、提交规范、ESLint/Prettier 写在 `docs/standards/development.md`。
- 组件边界、Vue 代码规范写在 `docs/standards/components.md`。
- 注释和 JSDoc 写在 `docs/standards/comments.md`；常量管理写在 `docs/standards/constants.md`。
- CSS 优先、Tailwind 通用原则、文本超长处理写在 `docs/standards/styling.md`。
- 项目目录、视图单元层级、composables 抽取和共享 tsconfig 规则写在 `docs/standards/project-structure.md`。
- 公共包边界写在 `docs/standards/public-packages.md`；包内 API 用法写在各包 README。
- 应用选择的组件库、主题 token、平台 SDK、部署脚本和验收方式写在 `apps/<app>/docs/`。

如果旧文档和代码实现冲突，以当前源码、测试、manifest、脚本和部署配置为准。

## 文件编辑安全（Agent 协作）

修改已有源码必须使用局部补丁，改动范围只覆盖当前需求涉及的行。不要为了绕过补丁匹配、编码显示或批量替换问题，对源码做整文件读写、转码、重生成或基线覆盖；这类操作会破坏用户未提交改动。

遇到补丁无法匹配、中文注释乱码、文件编码异常或工具准备改写整文件时，必须先停止并重新读取局部上下文，改用更小的补丁；仍无法安全定位时，先向用户说明风险，不继续写入。

在 Windows PowerShell 环境下，Agent 读取包含中文的源码或文档前必须自行设置 UTF-8 控制台编码。该设置只用于命令显示和读取，不得把 PowerShell 的 `Get-Content` / `Set-Content` 作为源码修改手段。

## Skill

文档重构前先使用仓库内 skill：`skills/doc-architecture/SKILL.md`。
