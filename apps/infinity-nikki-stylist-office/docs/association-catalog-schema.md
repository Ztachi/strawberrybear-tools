# 协会资料库 JSON 契约

资料库以静态 manifest JSON 形式提供，MVP 会先在前端内置同结构 seed 数据，后续可替换为 ztachi.com/R2 上的远程 JSON。

## 顶层结构

```json
{
  "schemaVersion": "2026-06-18",
  "catalogId": "miraland-stylist-office",
  "catalogVersion": "2026.06.18-001",
  "defaultTemplateId": "template-miracle-continent-classic-001",
  "locales": ["zh-CN", "zh-TW", "en-US", "ja-JP"],
  "templates": [],
  "titleOptions": [],
  "regions": [],
  "comments": [],
  "officialAvatars": [],
  "officialBackgrounds": [],
  "imageAssets": [],
  "fontAssets": []
}
```

## 资源规则

- `templates`：证书模板数组。MVP 只内置一套，但结构必须支持多套模板。
- `titleOptions`：搭配师称号数组；当前证书上显示为“证书等级”。
- `regions`：登记地区数组，包含地区代码与多语言名称。
- `comments`：协会评语数组，草稿创建时随机选定一条。
- `officialAvatars` / `officialBackgrounds`：协会内置头像与背景素材。
- `imageAssets`：模板覆盖层、印章、头像框、装饰图等图片资源。
- `fontAssets`：模板使用的可下载字体资源，例如会长签名字体。

## 素材规格

- 模板覆盖层：透明 PNG/WebP，基准尺寸 `3840 × 2160`，不包含棋盘格、背景、头像或动态文字。
- 背景：16:9，推荐 `3840 × 2160`，最低 `1920 × 1080`。
- 头像：正方形，推荐 `1024 × 1024`，最低 `512 × 512`。
- 印章：透明 PNG，推荐 `1024 × 1024`，最低 `512 × 512`。
- 签名字体：优先 WOFF2，并在模板 `textSlots` 中通过 `fontAssetId` 引用。
