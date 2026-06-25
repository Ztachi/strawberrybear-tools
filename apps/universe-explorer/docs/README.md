# Universe Explorer 文档

`apps/universe-explorer` 是基于 Babylon.js 的 Web 太空探索游戏。

## 文档索引

- [设计文档](design.md)
- [开发规范](../README.md) — 技术栈、架构铁律、扩展指南

## 继承的根规范

- 项目结构、组件、常量、注释、样式、i18n、CI/CD、分支：见 [`docs/standards/`](../../../docs/standards/)
- 文档分层：见 [`docs/standards/documentation.md`](../../../docs/standards/documentation.md)

## 应用专属规范

- 渲染：Babylon.js 9.x，WebGPU 优先、WebGL 降级
- 架构：游戏核心层（`src/game/`）零 Vue 依赖，Vue 层仅通过 Pinia 通信
- 样式：Tailwind CSS 4 + 内联特效，游戏画布不加 CSS 过渡
