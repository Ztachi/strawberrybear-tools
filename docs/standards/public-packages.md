# 公共包规范

本文档定义 `packages/` 目录下公共包的开发标准，确保代码质量、一致性和可维护性。

## 目录结构

```
packages/
  <package-name>/
    src/
      index.ts          # 主入口，导出核心功能
      <ComponentName>.vue  # Vue 组件（如有）
    package.json
    README.md           # 库使用文档（必需）
    CHANGELOG.md        # 变更记录
```

## 命名规范

- **包名**: `@strawberrybear/<package-name>`，如 `@strawberrybear/piano-roll`
- **目录名**: kebab-case，如 `piano-roll`
- **Vue 组件**: PascalCase，单文件放置于同名目录，如 `PianoRoll/index.vue`

## package.json 必需字段

```json
{
  "name": "@strawberrybear/<package-name>",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "types": "./src/index.ts"
    },
    ".vue": "./src/<ComponentName>.vue"
  },
  "peerDependencies": {
    "vue": "^3.0.0"
  }
}
```

## TypeScript 类型

- 所有公共 API 必须有完整的类型定义
- 使用 `interface` 定义数据结构和配置
- 导出类型通过 `export type` 或 `export interface`

## 注释规范

核心函数和类必须包含 JSDoc 注释：

```typescript
/**
 * @description: 函数功能描述
 * @param {string} paramName 参数描述
 * @return {number} 返回值描述
 */
```

## Vue 组件规范

公共包如果包含 UI 组件（无论 Vue / React / Svelte / 其他），参考应用选定的 UI 框架规范与对应 skill（如 Vue 组件参考 `skills/vue-1.0.1/SKILL.md`）；不在根层重复定义框架特定 API。库内组件目录与命名遵循 [项目结构规范](project-structure.md) 的视图单元规则。

## 构建与发布

- 包通过 pnpm workspace 管理，无需单独构建
- 导出项应与 package.json exports 保持一致

## 相关文档

- [UI 通用规范](ui.md)
- [项目结构规范](project-structure.md)
- [注释规范](comments.md)
- 各包 README：`packages/<package-name>/README.md`
