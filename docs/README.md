# 文档索引

根层文档只描述单仓库、公共规范和公共包边界。应用专属架构、UI、平台端口、部署和验收文档放在对应 `apps/<app>/docs/`。

## 架构

- [单仓库架构](architecture/monorepo.md)

## 规范

- [文档分层规范](standards/documentation.md)
- [开发规范](standards/development.md)
- [项目结构规范](standards/project-structure.md)
- [UI 通用规范](standards/ui.md)
- [Tailwind CSS 规范](standards/tailwindcss.md)
- [样式规范](standards/styling.md)
- [注释与 JSDoc 规范](standards/comments.md)
- [常量管理规范](standards/constants.md)
- [单元测试规范](standards/testing.md)
- [公共包规范](standards/public-packages.md)
- [依赖策略](standards/dependencies.md)
- [国际化规范](standards/i18n.md)
- [CI/CD 规范](standards/cicd.md)
- [分支管理](standards/branching.md)

## 应用文档

- [萌园园上岗日](../apps/myy-on-duty/docs/README.md)
- [Infinity Nikki Player](../apps/infinity-nikki-player/docs/README.md)
- [Infinity Nikki Stylist Office](../apps/infinity-nikki-stylist-office/docs/README.md)
- [Sensitive Word Checker](../apps/sensitive-word-checker/docs/README.md)
- [Universe Explorer](../apps/universe-explorer/docs/README.md)
- [DQ7 Shuffle](../apps/dq7-shuffle/docs/README.md)
- [web-vue](../apps/web-vue/docs/README.md)
- [web-react](../apps/web-react/docs/README.md)

## 公共包文档

公共包的使用说明以各包 `README.md` 为准，公共包写作和边界规则见 [公共包规范](standards/public-packages.md)。

- [piano-roll](../packages/piano-roll/README.md)
- [player](../packages/player/README.md)
- [nikki-theme](../packages/nikki-theme/README.md)
- [tsconfig](../packages/tsconfig/package.json)

## Skill

Skill 唯一源在根目录 [`skills/`](../skills/README.md)：

- [doc-architecture](../skills/doc-architecture/SKILL.md)
- [create-app](../skills/create-app/SKILL.md)
- [launch-cloudflare-pages-app](../skills/launch-cloudflare-pages-app/SKILL.md)
- [vue-1.0.1](../skills/vue-1.0.1/SKILL.md)
- [rust-1.0.1](../skills/rust-1.0.1/SKILL.md)

## 归档

- [2026 项目搭建过程](archive/PLAN-2026-bootstrap.md)

归档文档只保留背景信息，不作为当前架构、规范、验收或 CI 门禁依据。

## 根目录文档

| 文档                            | 说明                          |
| ------------------------------- | ----------------------------- |
| [README.md](../README.md)       | 中文项目文档                  |
| [README_en.md](../README_en.md) | English project documentation |
