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
5. **每次写完代码必须先运行 `pnpm type-check && pnpm lint`，确保类型检查和 lint 都没问题后才能提交交付**

## 组件边界规范

组件应在自己的职责边界内获取框架上下文。像 i18n 翻译函数、主题上下文、路由上下文这类全局
上下文，不要为了省事通过多层 props 逐级透传；叶子组件需要翻译文案时，应在组件内使用对应
组合式 API（例如 `useI18n()`）获取。props 只表达业务输入和组件配置，不能把 `Function` 当作
逃避类型设计或 lint 规则的兜底类型。

可扩展数据不能在 UI 叶子组件里硬编码枚举联合类型。语言、主题、平台能力、菜单项等会增长的
集合，应由统一数据源或领域类型提供；UI 组件只消费数据源并按通用类型传递事件，避免新增选项时
需要逐层修改组件类型。

## UI 框架与图标规范

使用 antdv-next 的项目必须优先使用 antdv-next 及其生态组件。图标选择以项目既有设计系统为准：
通用操作图标优先使用项目指定的主图标库，例如 `lucide-vue-next`；品牌图标、实心状态图标或
主图标库缺失的语义图标，可以使用 `@antdv-next/icons` 补充。不要手写 SVG 或使用文本伪装图标；
新增图标前应先查询现有图标库，确认没有合适图标再向用户说明取舍。

图标类帮助入口、说明入口应使用 `Tooltip` 或 `Popover` 提供提示内容，不要依赖原生 `title`
属性。只有确实需要按钮视觉时才使用框架按钮；单纯图标入口应使用语义化 `button` 承载图标、
`aria-label` 和点击行为，避免给帮助图标套不必要的边框按钮。

## 注释规范

新增或修改代码时，注释必须使用中文，并贴近被解释的代码行。前端组件的 `ref`、`computed`、
关键 props、emit、跨组件公共组件边界和副作用函数必须说明业务含义；Rust 的常量、状态结构、
持久化数据结构、Tauri command、平台分支和跨进程/跨刷新恢复逻辑必须说明用途、参数和返回值。
不要只写文件头注释或泛泛描述；当一段逻辑依赖平台行为、持久化状态或非显而易见的顺序约束时，
必须在对应代码附近补充原因。

## 文件编辑安全

修改已有源码必须使用局部补丁，改动范围只覆盖当前需求涉及的行。不要为了绕过补丁匹配、
编码显示或批量替换问题，对源码做整文件读写、转码、重生成或基线覆盖；这类操作会破坏用户
未提交改动。遇到补丁无法匹配、中文注释乱码、文件编码异常或工具准备改写整文件时，必须先
停止并重新读取局部上下文，改用更小的补丁；仍无法安全定位时，先向用户说明风险，不继续写入。

在 Windows PowerShell 环境下，Agent 读取包含中文的源码或文档前必须自行设置 UTF-8 控制台
编码，例如设置 `[Console]::InputEncoding`、`[Console]::OutputEncoding` 和 `$OutputEncoding`
为 UTF-8。该设置只用于命令显示和读取，不得把 PowerShell 的 `Get-Content` / `Set-Content`
作为源码修改手段。

如果终端、文件读取、shell profile、命令输出存在编码异常，必须先修复或绕开开发环境问题，再
继续修改业务代码；不要在乱码上下文里继续写补丁、猜测中文内容或把错误归因到源码本身。对于
Windows PowerShell 5.1，除控制台编码外，还要确保 `Get-Content` 默认使用 UTF-8，例如在用户
profile 中设置 `$PSDefaultParameterValues['Get-Content:Encoding'] = 'UTF8'`。

## CSS 优先原则

能用 CSS 表达的布局、尺寸、滚动和响应式约束，不要用 JS 测量 DOM 后再回写状态。优先使用
`flex`、`grid`、`min-height`、`max-height`、`calc()`、`clamp()`、CSS 变量和原生
`overflow`，只有在业务状态或组件 API 无法表达真实布局关系时才引入
`ResizeObserver`、`getBoundingClientRect()`、`debounce` 等 JS 布局计算。

典型案例：`apps/infinity-nikki-player/src/views/MainWindow/TemplatesTab/components/TemplateEditor.vue`
的模板表格滚动高度可以直接通过 antdv-next `Table` 的 `scroll.y: 'calc(...)'` 交给 CSS
计算，不需要维护 `debouncedUpdateTableScrollY`、窗口 resize 监听和表格行高测量链路。

## ESLint + Prettier 代码规范

本项目使用 ESLint + Prettier 保证代码风格统一，支持提交时自动格式化。

### 配置文件

| 文件                     | 说明                    |
| ------------------------ | ----------------------- |
| `.eslintrc.cjs`          | ESLint 主配置           |
| `.prettierrc`            | Prettier 格式化配置     |
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

#### 1. 每次写完代码必须先运行类型检查和 lint（强制要求）

完成代码编写后，**必须**先手动执行以下命令并修复所有问题，确保代码规范后再进行提交：

```bash
# 先运行类型检查，再运行 lint，两者都必须通过
pnpm type-check && pnpm lint
```

#### 2. 提交时自动格式化（推荐）

通过 husky + lint-staged 实现，commit 时自动检查并格式化：

```bash
git add .
git commit -m "提交信息"
# 自动执行 eslint --fix + prettier --write
```

#### 3. 手动检查代码规范

```bash
# 检查所有代码
pnpm lint

# 检查并自动修复（部分问题）
eslint --fix .

# 格式化所有文件
prettier --write .
```

#### 3. lint-staged 规则

| 文件模式                        | 执行的命令                          |
| ------------------------------- | ----------------------------------- |
| `apps/**/*.{js,ts,mjs,cjs,vue}` | `eslint --fix` + `prettier --write` |
| `server/**/*.ts`                | `eslint --fix` + `prettier --write` |
| `test/**/*.{ts,js}`             | `eslint --fix` + `prettier --write` |
| `*.{json,md,css,yaml,yml}`      | `prettier --write`                  |

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

- `@typescript-eslint/no-unused-vars`: 错误未使用的变量（\_开头除外）
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
