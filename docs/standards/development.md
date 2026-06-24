# 开发规范

## 基本原则

1. 使用 TypeScript strict 模式。
2. 所有 workspace 通过 `@strawberrybear/tsconfig` 继承共享配置。
3. 根层公共规则不写 app 专属实现细节；应用规则写入 `apps/<app>/docs/`。
4. 每个 workspace 必须有 README；有复杂运行面的 app 必须补 `docs/README.md`。
5. 每次写完代码必须先运行 `pnpm type-check && pnpm lint`，确保类型检查和 lint 都没问题后才能提交交付。
6. 使用 async/await 处理异步操作；错误处理必须包含具体错误信息。
7. 所有工具函数必须类型签名完整。

项目目录、视图单元层级、composables 边界见 [项目结构规范](project-structure.md)。通用 UI 原则、组件库优先级、图标见 [UI 通用规范](ui.md)。注释见 [注释规范](comments.md)。常量见 [常量管理规范](constants.md)。

## ESLint + Prettier

本项目使用 ESLint + Prettier 保证代码风格统一，支持提交时自动格式化。

### 配置文件

| 文件                     | 说明                    |
| ------------------------ | ----------------------- |
| `eslint.config.js`       | ESLint 主配置           |
| `.prettierrc`            | Prettier 格式化配置     |
| `lint-staged.config.mjs` | git commit 时自动格式化 |

### 使用方式

完成代码编写后，**必须**先手动执行：

```bash
pnpm type-check && pnpm lint
```

提交时通过 husky + lint-staged 自动检查并格式化。

### Prettier 格式化规则

| 规则             | 值      | 说明         |
| ---------------- | ------- | ------------ |
| `semi`           | `false` | 不使用分号   |
| `singleQuote`    | `true`  | 使用单引号   |
| `printWidth`     | `100`   | 单行最大宽度 |
| `tabWidth`       | `2`     | 缩进宽度     |
| `trailingComma`  | `es5`   | ES5 尾随逗号 |
| `bracketSpacing` | `true`  | 对象括号空格 |

### ESLint 规则

- `@typescript-eslint/no-unused-vars`：错误未使用的变量（`_` 开头除外）
- `@typescript-eslint/consistent-type-imports`：类型导入使用 `import type`
- `prefer-const`：必须使用 const
- `no-console`：控制台警告
- `vue/multi-word-component-names`：关闭组件名多单词要求

## 校验命令

```bash
pnpm lint
pnpm type-check
pnpm build
```

具体 app 的 build、部署前检查和平台验收命令由应用文档维护。

## 提交规范

使用 Conventional Commits。仓库的 Husky `commit-msg` 钩子会执行 commitlint，第一行必须包含 `type` 和 `subject`：

```txt
feat: add player module shell
fix: correct template editor clear behavior
docs: update documentation structure
chore: version packages
```

带 scope 的提交更适合单仓库：

```txt
fix(infinity-nikki-player): guard release pipeline with changeset checks
docs(standards): clarify commit message requirements
```

分支模型、PR 合并规则见 [分支管理](branching.md)。

## 相关规范

- 项目结构：[project-structure.md](project-structure.md)
- UI 通用规范：[ui.md](ui.md)
- Tailwind：[tailwindcss.md](tailwindcss.md)
- 注释：[comments.md](comments.md)
- 常量：[constants.md](constants.md)
- 依赖策略：[dependencies.md](dependencies.md)
