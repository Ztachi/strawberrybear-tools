# sensitive-word-checker

本地单机版敏感词检测工具，基于 Vue 3 + Vuetify 3 + Vite 8 构建。

## 用户说明书

- 面向终端用户的详细操作文档见 `USER_GUIDE.md`
- 适合部署后直接给使用者阅读，包含首次使用、词库管理、扫描流程、结果解读和常见问题
- 文档会随版本持续更新，可用于验证自动发版流程中的文档变更发布

## 功能

- 从 GitHub（konsheng/Sensitive-lexicon）同步中文敏感词库到本地 IndexedDB
- 支持手动导入自定义 `.txt` 词库文件
- 使用 Aho-Corasick 算法 + Web Worker 高效扫描文本
- 按高/中/低风险等级高亮显示命中词语
- 响应式布局，适配 PC 和手机

## 文档分工

- `README.md`：开发与项目概览
- `USER_GUIDE.md`：用户使用手册

## 本地开发

```bash
cd apps/sensitive-word-checker
pnpm dev
```

## 构建

```bash
pnpm --filter @strawberrybear/sensitive-word-checker build
```

## 技术栈

- Vue 3 (`<script setup>`)
- Vite 8
- Vuetify 3（主 UI 框架）
- Tailwind CSS（工具类，禁用 Preflight）
- Pinia（状态管理）
- vue-i18n（zh-CN / en-US）
- idb（IndexedDB 封装）
- Aho-Corasick 算法（Web Worker 内执行）

## 本项目 UI 约定

### 按钮配色

1. 深色/主题实底按钮（如 `variant="flat"` 且 `color="primary"`）必须使用白色文字和图标
2. 非实底按钮（如 `outlined`、`text`）使用主题色文字与边框，不使用纯黑文字和纯黑边框
3. 若组件库内层样式覆盖按钮文字色（如 Vuetify 的 `.v-btn__content`），需在组件中补充覆盖规则，确保最终视觉符合本约定

### 验收标准

- 主操作按钮（扫描、同步、跳转主站）在亮色主题下始终为白色文字/图标
- 次操作按钮（导入）在亮色主题下不出现黑字黑边

## 词库格式与等级适配

### 解析时机

- 风险等级在**导入/同步词库时**确定并写入数据库
- 扫描阶段仅使用已入库的 `category` 字段，不做实时重算

### 判定优先级

1. 先按**文件名关键词**推断等级（当前既有规则）
2. 若文件名未命中，再按每行格式 `词语|等级|类型` 解析其中“等级”字段
3. 若仍无法识别，默认 `medium`

### 行格式

- 推荐格式：`词语|等级|类型`
- 兼容格式：仅 `词语`（无等级时走上面的优先级与兜底）
- 注释行：以 `#` 开头会被忽略

### 等级枚举映射（当前实现）

- `high`：`high`、`h`、`1`、`高`、`高风险`、`严重`、`critical`
- `medium`：`medium`、`mid`、`m`、`2`、`中`、`中风险`、`一般`
- `low`：`low`、`l`、`3`、`低`、`低风险`、`轻微`

如需接入新的词库格式，请优先在导入解析层扩展映射，不要在扫描阶段增加等级计算逻辑。
