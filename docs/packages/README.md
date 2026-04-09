# 公共库开发规范

本文档定义了 `@packages` 目录下公共库的开发标准，确保代码质量、一致性和可维护性。

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

- 使用 `<script setup lang="ts">` 组合式 API
- Props 和 Emits 使用类型定义
- 样式使用 scoped，避免污染全局
- 组件放在同名目录（如 `PianoRoll/index.vue`）

## 构建与发布

- 包通过 pnpm workspace 管理，无需单独构建
- 导出项应与 package.json exports 保持一致

## 相关文档

- [组件设计规范](../design/component-guide.md)
- [主题变量文档](../design/theme.md)
