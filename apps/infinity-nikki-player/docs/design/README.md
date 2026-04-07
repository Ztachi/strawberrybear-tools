# Infinity Nikki Player 设计文档

## 概述

本文档描述 Infinity Nikki Player 的设计决策、技术架构和界面规范。

## 目录结构

```
docs/
├── README.md           # 文档索引（本文件）
├── design/             # 设计文档
│   ├── README.md       # 设计文档索引
│   ├── ui-guide.md     # UI 组件使用指南
│   └── theme.md        # 主题和样式规范
└── error/              # 错误文档
    ├── README.md
    └── ISSUE-001-*.md
```

## 技术栈

### 前端

| 技术         | 版本   | 说明       |
| ------------ | ------ | ---------- |
| Vue 3        | 3.5.x  | 组合式 API |
| TypeScript   | 5.7.x  | 类型安全   |
| Vite         | 8.0.x  | 构建工具   |
| Tailwind CSS | 3.4.x  | CSS 框架   |
| shadcn-vue   | latest | UI 组件库  |
| vue-i18n     | 10.x   | 国际化     |
| Pinia        | 3.x    | 状态管理   |

### 后端

| 技术  | 版本   | 说明      |
| ----- | ------ | --------- |
| Tauri | 2.10.x | 桌面框架  |
| Rust  | stable | 系统编程  |
| midly | 0.5    | MIDI 解析 |
| enigo | 0.3    | 键盘模拟  |

## UI 设计

### 组件库

本项目使用 [shadcn-vue](https://www.shadcn-vue.com/) 作为 UI 组件库。

shadcn-vue 不是传统意义上的 npm 包，而是一组可复制、可定制的组件源码，直接拷贝到项目中。

#### 常用组件

- `Button` - 按钮组件
- `Tabs / TabsList / TabsTrigger / TabsContent` - 标签页
- `Card / CardHeader / CardTitle / CardContent` - 卡片
- `Input` - 输入框
- `Badge` - 徽章
- `Slider` - 滑块

### 主题色彩

主色调沿用项目特色：`#F7C0C1`（淡粉色）

#### 明亮主题（当前默认）

使用温暖的粉色系配色，适配《无限暖暖》的清新可爱风格：

- 背景：渐变粉色 `#fdf6f7 → #fef9fa`
- 卡片：半透明白色 `rgba(255,255,255,0.9)`
- 强调：`#f7c0c1` 粉色系

#### 暗色主题（计划中）

待实现，将支持跟随系统自动切换。

### 国际化

使用 `vue-i18n` 管理多语言支持。

| 语言    | 代码  | 状态 |
| ------- | ----- | ---- |
| 中文    | zh-CN | 默认 |
| English | en-US | 支持 |

翻译文件位于 `src/i18n/locales/` 目录。

## 架构设计

### 目录结构

```
src/
├── components/         # Vue 组件
│   ├── ui/            # shadcn-vue UI 组件
│   │   ├── button/
│   │   ├── tabs/
│   │   ├── card/
│   │   └── ...
│   └── ...            # 业务组件
├── views/             # 视图
│   ├── MainWindow.vue
│   └── OverlayWindow.vue
├── stores/            # Pinia 状态
├── i18n/              # 国际化
│   ├── index.ts
│   └── locales/
│       ├── zh-CN.ts
│       └── en-US.ts
└── types/             # TypeScript 类型
```

### 窗口模型

| 窗口     | 标签    | 说明         |
| -------- | ------- | ------------ |
| 主窗口   | main    | 完整功能界面 |
| 悬浮窗口 | overlay | 极简播放控制 |

窗口通过 URL 参数 `windowLabel` 区分。
