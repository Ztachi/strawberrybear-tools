# DQ7 Shuffle 文档

`apps/dq7-shuffle` 是 Dragon Quest VII 珍爱之物对对碰卡牌顺序记录工具。

## 文档索引

- [项目 README](../README.md) — 游戏规则、交互模式、模块职责

## 继承的根规范

- 项目结构、常量、注释、i18n、CI/CD、分支：见 [`docs/standards/`](../../../docs/standards/)
- 文档分层：见 [`docs/standards/documentation.md`](../../../docs/standards/documentation.md)

## 应用专属规范

- 技术：纯 TS 模块化 + Vite 8，全部打包进单个 HTML
- 国际化：路径 `/en` 检测英文，否则默认中文
- 交互：定义阶段 + 交换阶段，三套独立交互模式（拖拽/点击/键盘）
