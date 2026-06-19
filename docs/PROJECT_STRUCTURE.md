# 项目结构规范

## 目标

项目结构服务于可维护性和解耦，不是为了机械制造目录。组件、composable、公共配置都应表达真实职责边界，让页面编排、局部展示和共享逻辑各自清楚。

## Vue 组件层级

- `src/views/` 根目录只放页面目录，不直接放 `.vue` 文件；页面入口统一使用 `views/A/A.vue`。
- 全局复用组件放在 `src/components/`；只被单个页面使用的组件放在对应页面目录的 `components/` 下。
- 非页面组件没有子组件时可以保持单文件，例如 `components/A.vue`。
- 一旦某个非页面 `.vue` 组件拥有自己的子组件，就目录化为 `A/A.vue`，直接子组件放入 `A/components/B/B.vue`。
- 如果子组件继续拆分，递归应用同一规则：`D/D.vue` 的子组件放在 `D/components/E/E.vue`。
- 页面私有子组件放在页面目录下的 `components/`，例如 `views/A/components/B/B.vue`。
- 父组件优先负责路由动作、store 协调、数据组合和组件编排；子组件维护自己的展示状态、局部交互和内部结构。
- 可增长的同构 DOM 使用结构化数组和 `v-for` 驱动，不复制多段只改文案的模板。

## Composables

- `src/composables/use*.ts` 只用于共享逻辑、可复用副作用、跨组件状态协调，或足够复杂且有清晰语义边界的生命周期/异步流程。
- 单个组件内部的一次性状态、简单计算、纯展示交互，默认留在组件内，不为了抽离而抽离。
- 页面私有逻辑如果不会被复用，优先保留在页面或页面私有组件中；只有当它显著降低组件复杂度或表达稳定业务概念时，再考虑抽成 composable。
- composable 文件必须以 `use` 开头，返回响应式状态和语义化 action；对有业务约束的副作用补充简短注释。

## 共享 TypeScript 配置

- 单仓库内应用应通过 workspace package 使用共享配置：在 app 的 `devDependencies` 中添加 `"@strawberrybear/tsconfig": "workspace:*"`。
- app 级 `tsconfig.*.json` 继承 `"@strawberrybear/tsconfig/base.json"`，只保留本应用必要的 `paths`、`types`、`include` 等覆盖项。
- `packages/tsconfig/package.json` 必须显式导出公共配置，例如 `"./base.json": "./base.json"`，避免 app 使用相对路径穿透包内部。

## UI 框架

- Vuetify 项目允许使用 `vuetify({ autoImport: true })`，这是自动按需导入组件的有效方案。
- 新增公共组件时优先沉淀稳定业务能力，不把页面私有展示提前提升为全局组件。
