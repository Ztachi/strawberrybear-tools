# sensitive-word-checker 开发计划

> 本地单机版敏感词检测工具 — 开发蓝图与实施计划

---

## 项目概述

| 字段     | 值                                                                          |
| -------- | --------------------------------------------------------------------------- |
| 项目名称 | sensitive-word-checker                                                      |
| 包名     | `@strawberrybear/sensitive-word-checker`                                    |
| 类型     | Web App（纯前端，无后端）                                                   |
| 目录     | `apps/sensitive-word-checker/`                                              |
| 主题色   | `#f7c0c1`（草莓粉）                                                         |
| 词库来源 | [konsheng/Sensitive-lexicon](https://github.com/konsheng/Sensitive-lexicon) |

---

## 技术选型

| 技术         | 版本  | 说明                                           |
| ------------ | ----- | ---------------------------------------------- |
| Vue 3        | ^3.5  | 标准 `<script setup>` Composition API          |
| Vite         | ^8.0  | 构建工具，支持 Web Worker 内联模式             |
| TypeScript   | ~5.9  | 严格模式                                       |
| Vuetify 3    | ^3.8  | 主 UI 框架，提供 Material Design 组件          |
| Tailwind CSS | ^3.4  | 工具类 CSS，禁用 Preflight 避免与 Vuetify 冲突 |
| Pinia        | ^3.0  | 状态管理                                       |
| vue-i18n     | ^10.0 | 国际化（zh-CN / en-US）                        |
| idb          | ^8.0  | IndexedDB 封装库，用于本地词库持久化           |
| @mdi/font    | ^7.0  | Material Design 图标字体（Vuetify 配套）       |

---

## 功能模块

### 2.1 敏感词库管理

- **存储**：IndexedDB（`idb` 库），两个 store：`words`（词条）和 `meta`（版本信息）
- **来源**：`Vocabulary/` 目录下多个 `.txt` 文件，每行一个词，文件名映射风险等级
- **风险等级映射**（基于文件名）：
  - **高风险**：暴恐、反动、政治、涉枪涉爆、GFW、新思想
  - **中风险**：色情、贪腐、非法网址、COVID、民生
  - **低风险**：广告、其他、补充、零时、网易
- **更新**：通过 GitHub Contents API 拉取文件列表，逐一下载解析
- **手动导入**：支持上传本地 `.txt` 文件，按行解析并合并到词库

### 2.2 文本扫描

- **触发方式**：手动点击「扫描」按钮（性能稳定，避免大词库下实时扫描的压力）
- **输入**：文本框输入 + `.txt` 文件上传
- **算法**：Aho-Corasick 多模式字符串匹配，时间复杂度 O(n+m)
- **并发**：Web Worker 异步执行，扫描期间 UI 不阻塞
- **匹配选项**：区分大小写 / 忽略标点（可配置）

### 2.3 结果展示与高亮

| 风险等级 | 背景色 | 文字色 |
| -------- | ------ | ------ |
| 高风险   | 红色   | 白色   |
| 中风险   | 黄色   | 黑色   |
| 低风险   | 绿色   | 白色   |

- 使用 `v-html` 渲染带 `<span>` 标签的高亮文本
- 顶部展示风险统计摘要（各等级命中数量）
- 支持一键复制结果

### 2.4 设置

- 区分大小写（默认：否）
- 忽略标点符号（默认：否）
- 持久化到 localStorage（Pinia persist plugin）

---

## 架构设计

### 数据流

```
用户输入文本
    │
    ▼
TextInputPanel.vue
    │ 点击「扫描」
    ▼
scanner.worker.ts（Web Worker）
    │ 接收 { text, words[], settings }
    │ 构建 Aho-Corasick 自动机
    │ 返回 MatchPosition[]
    ▼
ResultPanel.vue
    │ 渲染高亮 HTML
    ▼
用户查看结果
```

### 词库同步流

```
点击「从 GitHub 同步」
    │
    ▼
github.ts: fetchFileList()
    │ GitHub Contents API → 获取 Vocabulary/ 文件列表
    ▼
github.ts: fetchFileContent(url)
    │ 下载每个 .txt 文件
    ▼
github.ts: parseLexicon(filename, content)
    │ 按行解析，文件名推断 category
    ▼
db.ts: importWords(entries[])
    │ 写入 IndexedDB
    ▼
lexicon store: loadFromDB()
    │ 更新 Pinia 状态
    ▼
UI 显示「词库更新成功」
```

### 组件树

```
App.vue
├── AppHeader.vue          # 顶栏：标题 + 语言切换 + 设置
├── HomeView.vue           # 主布局（响应式双列/单列）
│   ├── TextInputPanel.vue # 左/上：输入区 + 文件上传 + 扫描按钮
│   ├── LexiconManager.vue # 左/上（下方）：词库管理
│   └── ResultPanel.vue    # 右/下：结果展示 + 高亮 + 统计
└── SettingsDialog.vue     # 弹窗：设置项
```

---

## 文件结构

```
apps/sensitive-word-checker/
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── tailwind.config.js          # corePlugins.preflight: false
├── postcss.config.js
├── CHANGELOG.md
├── README.md
└── src/
    ├── main.ts                 # 注册 Vuetify、Pinia、vue-i18n
    ├── App.vue
    ├── style.css               # CSS 变量 + Tailwind 工具类
    ├── vite-env.d.ts
    ├── types/
    │   └── index.ts            # WordEntry, RiskLevel, MatchPosition, ScanResult
    ├── lib/
    │   ├── db.ts               # IndexedDB 服务 (idb)
    │   ├── aho-corasick.ts     # Aho-Corasick 算法实现
    │   └── github.ts           # GitHub Contents API + 词库解析
    ├── workers/
    │   └── scanner.worker.ts   # Web Worker: 扫描任务
    ├── stores/
    │   ├── lexicon.ts          # 词库状态管理
    │   └── settings.ts         # 设置状态管理
    ├── i18n/
    │   ├── index.ts
    │   ├── zh-CN.ts
    │   └── en-US.ts
    ├── components/
    │   ├── AppHeader.vue
    │   ├── TextInputPanel.vue
    │   ├── ResultPanel.vue
    │   ├── LexiconManager.vue
    │   └── SettingsDialog.vue
    └── views/
        └── HomeView.vue
```

---

## 响应式布局

| 断点 | 布局         | 说明                    |
| ---- | ------------ | ----------------------- |
| < md | 单列上下排列 | 输入区在上，结果区在下  |
| ≥ md | 双列左右排列 | 左侧输入+词库，右侧结果 |

---

## 国际化

遵循 [docs/I18N.md](../../docs/I18N.md)，使用点号分隔 key：

- `common.button.scan` — 扫描
- `common.button.sync` — 从 GitHub 同步
- `common.button.import` — 导入文件
- `common.button.copy` — 复制结果
- `page.home.inputPlaceholder` — 输入框占位符
- `page.home.resultEmpty` — 结果区空状态提示
- `lexicon.wordCount` — 词库词条数量
- `lexicon.lastUpdated` — 最后更新时间
- `risk.high` — 高风险
- `risk.medium` — 中风险
- `risk.low` — 低风险

---

## CI/CD

参考 [docs/CICD.md](../../docs/CICD.md) 情形一（普通 Web 应用）：

- Workflow 文件：`.github/workflows/release-sensitive-word-checker.yml`
- 触发条件：push 到 `main`，`apps/sensitive-word-checker/**` 有变化
- 发版产物：`sensitive-word-checker-dist.zip`（`dist/` 目录打包）

---

## 验证清单

- [ ] `pnpm --filter @strawberrybear/sensitive-word-checker dev` — 开发服务器启动
- [ ] `pnpm --filter @strawberrybear/sensitive-word-checker build` — 构建成功
- [ ] `pnpm type-check && pnpm lint` — 零错误
- [ ] 点击「从 GitHub 同步」→ 词库加载进 IndexedDB → 词条数量显示正确
- [ ] 输入文本 → 点击「扫描」→ 高亮正确显示（高/中/低颜色区分）
- [ ] 上传本地 .txt 文件 → 词库合并 → 重新扫描可用
- [ ] 移动端宽度 → 布局折叠为单列，无横向溢出
- [ ] 语言切换（zh/en）→ 所有文本正确切换
