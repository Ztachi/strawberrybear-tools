# infinity-nikki-stylist-office

奇迹大陆搭配师协会总部 · 证书签发处。

本应用是面向《无限暖暖》玩家的搭配师身份登记与证书签发静态 Web App，当前阶段先完成项目骨架、响应式布局、国际化、状态管理、IndexedDB 数据层和 CI/CD 配置。

## 技术栈

- Vue 3 + Vite 8 + TypeScript
- Vuetify + Tailwind CSS
- Pinia + pinia-plugin-persistedstate
- Vue Router + vue-i18n + TanStack Query Vue
- Dexie + Zod + fflate + CropperJS

## 本地开发

```bash
pnpm --filter @strawberrybear/infinity-nikki-stylist-office dev
```

## 构建

```bash
pnpm --filter @strawberrybear/infinity-nikki-stylist-office build
```
