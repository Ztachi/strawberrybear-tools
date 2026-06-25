# Infinity Nikki Player 设计文档

## 概述

本文档描述 Infinity Nikki Player 的界面架构、主题规范和组件使用约定。当前 UI 框架为 `antdv-next`，样式层继续使用 Tailwind CSS v3 与项目 CSS 变量。

## 文档目录

| 文档                               | 说明                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| [ui-guide.md](ui-guide.md)         | antdv-next 组件、Tailwind 原子类、弹层和反馈使用规范 |
| [ui-framework.md](ui-framework.md) | antdv-next 框架专项规范（按钮、Table、Select 等）    |
| [theme.md](theme.md)               | 无限暖暖主题 token、CSS 变量和视觉原则               |

## 技术栈

### 前端

| 技术              | 版本    | 说明                           |
| ----------------- | ------- | ------------------------------ |
| Vue 3             | 3.5.x   | 组合式 API                     |
| TypeScript        | 5.7.x   | 类型安全                       |
| Vite              | 8.0.x   | 构建工具                       |
| Tailwind CSS      | 3.4.x   | 原子类和项目语义色             |
| antdv-next        | 1.3.3   | Vue 3 UI 组件库                |
| lucide-vue-next   | 0.469.x | 首选通用线性图标库             |
| @antdv-next/icons | 1.x     | 品牌图标和 lucide 缺失图标补充 |
| vue-i18n          | 10.x    | 国际化                         |
| Pinia             | 3.x     | 状态管理                       |

### 后端

| 技术  | 版本   | 说明      |
| ----- | ------ | --------- |
| Tauri | 2.10.x | 桌面框架  |
| Rust  | stable | 系统编程  |
| midly | 0.5    | MIDI 解析 |
| enigo | 0.3    | 键盘模拟  |

## UI 架构

应用根节点在 `src/App.vue` 使用 `ConfigProvider` 和 `App` 注入 antdv-next 主题上下文。主题配置集中在 `src/theme/infinityNikkiTheme.ts`，反馈提示统一通过 `src/lib/feedback.ts` 调用。

业务组件直接从 `antdv-next` 导入所需组件，不使用自动导入插件。本项目不维护本地 UI 框架源码树。

常用组件：

- `Button`、`Input`、`Switch`、`Slider`、`Select`
- `Tabs`、`Popover`、`Tooltip`
- `Modal`、`Drawer`
- `Table`、`Pagination`、`Tag`

## 主题色彩

主色调为 `#F7C0C1`，用于表达《无限暖暖》的柔和粉色风格。

| 用途                 | 色值                  |
| -------------------- | --------------------- |
| Primary              | `#F7C0C1`             |
| Primary Hover        | `#F5AAB8`             |
| Primary Active       | `#E98CA2`             |
| Layout Background    | `#FFF7FA`             |
| Container Background | `#FFFFFF` / `#FFF9FC` |
| Text                 | `#4A3F3F`             |
| Secondary Text       | `#6B5A5A`             |
| Border               | `#F3CAD0`             |

## 目录结构

```text
src/
├── components/              # 可跨页面复用的业务组件
│   ├── AboutDialog/
│   ├── KeyboardPreview/
│   ├── PlayerControls/
│   ├── PreviewPlayer/
│   └── ScrollableContainer.vue
├── views/                   # 页面和页面私有组件
│   └── MainWindow/
│       ├── FilesTab/
│       ├── TemplatesTab/
│       ├── LogsTab/
│       ├── OverlayView.vue
│       └── index.vue
├── stores/                  # Pinia 状态
├── lib/                     # 业务逻辑和 UI 适配封装
│   ├── feedback.ts
│   ├── keyboardMapper.ts
│   └── midiPlayer.ts
├── theme/                   # antdv-next 主题和弹层容器规则
│   └── infinityNikkiTheme.ts
├── i18n/
└── types/
```

## 窗口模型

| 窗口     | 说明                                    |
| -------- | --------------------------------------- |
| 主窗口   | 文件管理、MIDI 详情、模板编辑和设置入口 |
| 悬浮模式 | 游戏窗口上方的透明迷你播放器            |

主窗口顶部菜单高度固定为 46px。MIDI 详情和模板编辑抽屉必须挂载到主内容区容器，不能覆盖顶部菜单栏。
