# Infinity Nikki Player 文档

`apps/infinity-nikki-player` 是基于 Tauri v2 + Vue 3 的跨平台桌面应用，用于无限暖暖自动演奏。

## 文档索引

- [用户指南](USER_GUIDE.md)
- [设计文档](design/README.md)
- [UI 组件指南](design/ui-guide.md)
- [antdv-next 框架规范](design/ui-framework.md)
- [主题规范](design/theme.md)
- [钢琴引擎设计](design/piano-engine-design.md)
- [错误追踪](error/README.md)
- [Tauri 后端文档](../src-tauri/docs/README.md)

## 继承的根规范

- 项目结构、组件、常量、注释、样式、i18n、CI/CD、分支：见 [`docs/standards/`](../../../docs/standards/)
- 文档分层：见 [`docs/standards/documentation.md`](../../../docs/standards/documentation.md)

## 应用专属规范

- UI 框架：antdv-next + Tailwind CSS v3 + 项目 CSS 变量
- 图标：lucide-vue-next 为主，@antdv-next/icons 补充
- 平台：Tauri 桌面端（macOS / Windows），键盘模拟需辅助功能权限
- antdv-next 组件 API 约定、主题 token、滚动条样式：见 [design/](design/)
