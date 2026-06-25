# 奇迹大陆搭配师协会总部 · 证书签发处

《无限暖暖》玩家向的搭配师身份登记与证书签发 Web App。用户可以登记搭配师资料、选择地区和称号、管理头像与签章素材，并在“档案核对”阶段直接点击证书图上的可编辑区域完成最终校样。

当前实现口径以 `docs/product/current-requirements.md` 为准；旧交接和旧 MVP 文档已归档到 `docs/archive/legacy-2026-06-18/`，只作为历史参考。

## 核心能力

- 多语言界面与证书底图切换：支持简体中文、繁体中文、英文、日文。
- 登记流程：填写搭配师姓名，选择地区、称号、头像和会长签章。
- 档案核对：证书图上交互，不提供侧边编辑面板；点击姓名、编号、称号、头像、签章等热区打开对应编辑器。
- 会长签章：支持图片签章和文字签章；图片签章可选协会内置或自定义素材，文字签章最多 6 个用户可见字符。
- 自定义素材：头像和签章在个人中心管理，支持上传、CropperJS 裁剪、编辑、删除和预览。
- 本地数据：草稿、已签发证书元数据、自定义素材和缓存数据存储在 IndexedDB。
- 移动端证书查看：核对页证书区域支持拖拽和双指缩放，并区分点击编辑与查看手势。

## 模板包机制

证书模板使用“一个入口目录 + 相对资源”的结构，方便后续从远程同步或导入新模板。

当前内置模板入口：

```text
public/template/templates/1/
```

目录结构：

```text
public/template/
├── avatars/
│   └── 1.png
├── signatures/
│   └── 1/
│       ├── zh-CN.png
│       ├── zh-TW.png
│       ├── en-US.png
│       └── ja-JP.png
└── templates/
    └── 1/
        ├── manifest.json
        ├── zh-CN.png
        ├── zh-TW.png
        ├── en-US.png
        └── ja-JP.png
```

`manifest.json` 声明模板基准尺寸、语言底图文件名、动态字段坐标、渲染样式、点击热区和编辑能力。会长签章字段使用 `signatureImagePosition` 控制图片签章位置，`signatureImageSourceSize` 控制自定义签章裁剪比例；文字签章继续使用原文字坐标和样式。语言底图、后续素材和 manifest 都从模板入口相对解析，业务代码不逐个 import 单张图片。

模板素材放在 `public/template` 下，是为了避免证书底图被构建图片压缩插件处理，保持导出与预览清晰度。

## 离线缓存与资源更新

生产构建会启用 Service Worker 和 Cache API，让内置模板、协会头像、协会签章、签发页素材和资料库种子在首次加载后可离线使用。`pnpm dev` 开发环境会主动注销 Service Worker 并清理本应用离线缓存，避免旧缓存接管 Vite HMR；因此本地开发时“离线资源缓存”可能显示为 0B 或开发模式禁用，这是正常现象。

线上缓存策略：

- 应用入口页、`public/template/` 模板包、`public/association-data/` 资料库走 network-first：在线时优先拿最新文件，离线时回退缓存。
- 其他同源静态资源走 stale-while-revalidate：先展示已有缓存，同时在后台更新下一次可用的缓存。
- 关键资源清单集中在 `src/domain/offline/resources.ts`，Service Worker 预缓存清单在 `public/sw.js`，两边的缓存名版本需要保持一致。
- 用户业务数据不放进资源缓存；草稿、签发记录和自定义头像/签章仍在 IndexedDB，由“本地数据”页导入导出。

更新模板、头像、签章、签发背景、资料库种子等同路径 public 资源时，需要同步做三件事：

1. 修改对应资源文件或 manifest。
2. 如果新增关键资源，把路径加入 `IMPORTANT_OFFLINE_RESOURCE_PATHS` 和 `CORE_RESOURCES`。
3. 递增 `OFFLINE_RESOURCE_CACHE_NAME` 与 `CACHE_NAME` 的版本号，例如从 `resources-v2` 到 `resources-v3`。

部署新版本后，浏览器会发现新的 Service Worker。应用会显示“证书资源包已更新”的提示，用户点击“立即更新”后应用新缓存并刷新页面；如果用户暂时不更新，当前页面不会被强制打断。

## 技术栈

- Vue 3 + Vite 8 + TypeScript
- Vuetify + Tailwind CSS
- Pinia + pinia-plugin-persistedstate
- Vue Router + vue-i18n + TanStack Query Vue
- Dexie + Zod + CropperJS + fflate

## 目录概览

```text
src/app/                 应用入口、路由和全局装配
src/components/          跨页面通用组件
src/data/                本地协会资料 seed
src/db/                  Dexie 数据库与 repository
src/domain/              业务领域类型、模板解析、证书格式化等
src/i18n/                界面与模板文案
src/stores/              Pinia 状态
src/views/               页面与页面私有组件
public/template/         不经构建压缩的模板包和协会素材
docs/product/            当前产品需求
docs/archive/            旧文档归档
```

## 本地开发

在仓库根目录运行：

```bash
pnpm --filter @strawberrybear/infinity-nikki-stylist-office dev
```

或在本应用目录运行：

```bash
pnpm dev
```

## 常用命令

```bash
pnpm type-check
pnpm test
pnpm build
```

在仓库根目录也可以使用 filter：

```bash
pnpm --filter @strawberrybear/infinity-nikki-stylist-office type-check
pnpm --filter @strawberrybear/infinity-nikki-stylist-office test
pnpm --filter @strawberrybear/infinity-nikki-stylist-office build
```

## 开发约定

- 当前需求以 `docs/product/current-requirements.md` 为准。
- 能使用 Vuetify 的基础交互组件时优先使用 Vuetify，不重复造表格、弹窗、菜单等轮子。
- 用户可见文本必须走 i18n。
- 模板坐标、热区和字段渲染配置放在模板包 manifest 中，页面组件不写死坐标。
- 固定证书内容由语言底图承载；动态层只渲染用户输入值或资料库派生值。
- 自定义头像和签章保存原图、裁剪图、裁剪框和 CropperJS 图片矩阵，保证编辑时能回显裁剪状态。

## 备注

`public/template` 中的素材会被 Vite 原样拷贝到 `dist/template`。请避免把 `.DS_Store` 等系统文件提交进模板包。
