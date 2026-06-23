# @strawberrybear/infinity-nikki-stylist-office

## 1.1.0

### Minor Changes

- Improve the certificate proofing experience for Infinity Nikki Stylist Office.
  - Add adjustable avatar framing with drag, zoom, reset, and issued-certificate persistence.
  - Improve certificate title fitting across Simplified Chinese, Traditional Chinese, English, and Japanese.
  - Add proofing guidance and responsive avatar action buttons for mobile editing.
  - Improve exported avatar clipping and feathering around the certificate portrait frame.
  - Add a main-site return action and show the association dossier number in the catalog overview.
  - Fix workflow reset behavior after certificate issuance.

## 1.0.3

### Patch Changes

- Add a header action that returns visitors to the Infinity Nikki certificate tool page on the main site.

## 1.0.2

### Patch Changes

- Fix production CSS layer ordering so Tailwind reset styles do not override Vuetify component spacing.
- Stop blocking app entry on a full offline resource preload; cache page resources in the background when their route uses them.
- Fix offline image cache reuse so template and UI PNGs are served from Cache Storage instead of being re-fetched on every visit.

## 1.0.0

### Major Changes

- 6fc307b: Infinity Nikki Stylist Office 1.0.0 first release.

  搭配师协会证书签发处首个正式版本，为无限暖暖玩家提供协会会员证书的本地化申请、签发与归档全流程。

  主要能力：
  - 身份登记、档案核实、正式签发、证书领取四步标准流程，离线可用。
  - 个人中心支持已签发证书管理、自定义头像与背景素材、本地数据导入导出。
  - 内置搭配师协会目录，证书模板、文案、字段映射支持多语言切换。
  - Service Worker + IndexedDB 提供完整离线资源缓存与数据持久化。
  - 完整的中文用户手册随包发布在 apps/infinity-nikki-stylist-office/docs/USER_GUIDE.md。

## 0.1.0

### Minor Changes

- 初始化奇迹大陆搭配师协会总部证书签发处静态 Web App。
