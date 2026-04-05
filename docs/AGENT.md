# Agent 开发规范

本仓库遵循以下 Agent 开发规范，持续更新中...

## 目录结构

```
src/
  ├── agents/          # Agent 核心逻辑
  ├── tools/           # Agent 工具集
  ├── prompts/         # 提示词模板
  └── index.ts         # 入口文件
```

## 代码规范

1. 使用 TypeScript 严格模式
2. 所有工具函数必须类型签名完整
3. 使用 async/await 处理异步操作
4. 错误处理必须包含具体错误信息

## ESLint + Prettier 代码规范

本项目使用 ESLint + Prettier 保证代码风格统一，支持提交时自动格式化。

### 配置文件

| 文件 | 说明 |
|------|------|
| `.eslintrc.cjs` | ESLint 主配置 |
| `.prettierrc` | Prettier 格式化配置 |
| `lint-staged.config.mjs` | git commit 时自动格式化 |

### 依赖说明

```json
{
  "eslint": "^9.x",
  "prettier": "^3.x",
  "eslint-plugin-vue": "^10.x",
  "@typescript-eslint/eslint-plugin": "^8.x",
  "@typescript-eslint/parser": "^8.x"
}
```

### 使用方式

#### 1. 提交时自动格式化（推荐）

通过 husky + lint-staged 实现，commit 时自动检查并格式化：

```bash
git add .
git commit -m "提交信息"
# 自动执行 eslint --fix + prettier --write
```

#### 2. 手动检查代码规范

```bash
# 检查所有代码
pnpm lint

# 检查并自动修复（部分问题）
eslint --fix .

# 格式化所有文件
prettier --write .
```

#### 3. lint-staged 规则

| 文件模式 | 执行的命令 |
|----------|------------|
| `apps/**/*.{js,ts,mjs,cjs,vue}` | `eslint --fix` + `prettier --write` |
| `server/**/*.ts` | `eslint --fix` + `prettier --write` |
| `test/**/*.{ts,js}` | `eslint --fix` + `prettier --write` |
| `*.{json,md,css,yaml,yml}` | `prettier --write` |

### Prettier 格式化规则

| 规则 | 值 | 说明 |
|------|-----|------|
| `semi` | `false` | 不使用分号 |
| `singleQuote` | `true` | 使用单引号 |
| `printWidth` | `100` | 单行最大宽度 |
| `tabWidth` | `2` | 缩进宽度 |
| `trailingComma` | `es5` | ES5 尾随逗号 |
| `bracketSpacing` | `true` | 对象括号空格 |

### ESLint 规则

- `@typescript-eslint/no-unused-vars`: 错误未使用的变量（_开头除外）
- `@typescript-eslint/consistent-type-imports`: 类型导入使用 `import type`
- `prefer-const`: 必须使用 const
- `no-console`: 控制台警告
- `vue/multi-word-component-names`: 关闭组件名多单词要求

## 工具开发

每个工具应包含：
- 清晰的名称和描述
- 完整的参数类型定义
- 返回值类型注解
- 错误处理逻辑
