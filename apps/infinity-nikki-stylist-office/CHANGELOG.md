# @strawberrybear/infinity-nikki-stylist-office

## 1.2.2

### Patch Changes

- Revert the unnecessary custom signature cropper refactor from 1.2.1 after confirming the observed ratio issue was caused by stale offline caches.
- Add a build-time app version manifest and reuse the existing bottom resource-update prompt when the deployed version differs from the running bundle.
- Clear rebuildable offline caches before applying a version refresh, so unchanged public asset paths such as template signature images do not keep serving stale Cache API entries.
- Bump the offline resource cache names to invalidate previously cached template and signature assets.

## 1.2.1

### Patch Changes

- Restore custom signature crop ratio handling and signature preview proportions. Reverted in 1.2.2 after the underlying issue was confirmed to be stale offline cache data.

## 1.2.0

### Minor Changes

- Add image and text modes for president signatures.
  - New drafts default to the first built-in image signature, and built-in signatures follow the selected certificate language.
  - Add a tabbed signature picker for built-in image signatures, custom image signatures, and text signatures.
  - Add text signature validation with no default fallback; blank text signatures now prompt before saving.
  - Add custom signature assets with upload, crop, edit, delete, and save-and-use flows.
  - Persist issued signature snapshots and render image/text signatures consistently in proofing, issued certificate previews, and downloaded certificate images.
  - Document template-driven signature image positioning and the `2172 × 724` custom signature crop ratio.

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
