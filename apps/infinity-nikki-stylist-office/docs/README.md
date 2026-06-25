# 奇迹大陆搭配师协会总部 · 证书签发处 文档

`apps/infinity-nikki-stylist-office` 是《无限暖暖》玩家向的搭配师身份登记与证书签发 Web App。

## 文档索引

- [用户指南](USER_GUIDE.md)
- [当前产品需求](product/current-requirements.md)
- [首页体验指南](home-experience-guidelines.md)
- [关联目录 Schema](association-catalog-schema.md)
- [历史归档](archive/legacy-2026-06-18/)

## 继承的根规范

- 项目结构、组件、常量、注释、样式、i18n、CI/CD、分支：见 [`docs/standards/`](../../../docs/standards/)
- 文档分层：见 [`docs/standards/documentation.md`](../../../docs/standards/documentation.md)

## 应用专属规范

- UI 框架：Vuetify + Tailwind CSS
- 状态：Pinia + pinia-plugin-persistedstate
- 存储：Dexie (IndexedDB)，草稿与证书元数据本地持久化
- 模板包：`public/template/templates/<id>/manifest.json` 驱动证书渲染与热区
- 离线：Service Worker + Cache API，详见应用 [README.md](../README.md)

当前实现口径以 [product/current-requirements.md](product/current-requirements.md) 为准。
