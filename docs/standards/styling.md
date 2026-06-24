# 样式规范

## 适用范围

本文档仅作为仓库样式相关规范的入口和指针。具体的样式规则已按类别拆分到对应文件，避免在多处重复维护。

## 文本超长处理

UI 截断 + Tooltip 的强制规则、适用场景和移动端注意事项，见 [UI 通用规范 - 文本超长处理](ui.md#文本超长处理)。

## CSS 优先原则

能用 CSS 表达的布局、尺寸、滚动和响应式约束，不要用 JS 测量 DOM 后再回写状态。优先使用 `flex`、`grid`、`min-height`、`max-height`、`calc()`、`clamp()`、CSS 变量和原生 `overflow`，只有在业务状态或组件 API 无法表达真实布局关系时才引入 `ResizeObserver`、`getBoundingClientRect()`、`debounce` 等 JS 布局计算。

应用级滚动条属于主题基础设施，应集中写在全局样式入口，并通过 CSS 变量或主题 token 表达颜色、hover 和轨道状态。不要在单个组件里硬编码滚动条颜色；覆盖 UI 框架内部滚动容器前，先检查组件配置、语义 class 和内部 CSS 变量，只有没有配置入口时才使用限定范围的全局选择器。原生滚动条可以用全局伪元素统一覆盖，虚拟滚动条或内联样式必须优先使用框架暴露的变量或配置。

## 相关规范

- 通用 UI 原则、组件库优先级、图标、可访问性：[ui.md](ui.md)
- 启用 Tailwind 的应用：[tailwindcss.md](tailwindcss.md)
- 视图单元目录与命名：[project-structure.md](project-structure.md)
