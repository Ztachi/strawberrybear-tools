# Sensitive Word Checker 文档

`apps/sensitive-word-checker` 是本地单机版敏感词检测 Web 工具。

## 文档索引

- [用户手册](../USER_GUIDE.md)
- [项目 README](../README.md) — 开发与项目概览

## 继承的根规范

- 项目结构、组件、常量、注释、样式、i18n、CI/CD、分支：见 [`docs/standards/`](../../../docs/standards/)
- 文档分层：见 [`docs/standards/documentation.md`](../../../docs/standards/documentation.md)

## 应用专属规范

- UI 框架：Vuetify 3 + Tailwind CSS（禁用 Preflight）
- 扫描：Aho-Corasick 算法 + Web Worker
- 词库：GitHub 同步 + 本地 IndexedDB
- 按钮配色约定：见 [README.md](../README.md) 中「本项目 UI 约定」
