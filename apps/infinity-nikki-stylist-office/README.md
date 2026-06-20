# 奇迹大陆搭配师协会总部 · 证书签发处

《无限暖暖》玩家向的搭配师身份登记与证书签发 Web App。用户可以登记搭配师资料、选择地区和称号、管理头像素材，并在“档案核对”阶段直接点击证书图上的可编辑区域完成最终校样。

当前实现口径以 `docs/product/current-requirements.md` 为准；旧交接和旧 MVP 文档已归档到 `docs/archive/legacy-2026-06-18/`，只作为历史参考。

## 核心能力

- 多语言界面与证书底图切换：支持简体中文、繁体中文、英文、日文。
- 登记流程：填写搭配师姓名，选择地区、称号和头像。
- 档案核对：证书图上交互，不提供侧边编辑面板；点击姓名、编号、称号、头像等热区打开对应编辑器。
- 头像素材：头像选择弹窗展示协会头像、自定义头像和管理入口；自定义头像在个人中心管理，支持上传、CropperJS 裁剪、编辑、删除和预览。
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
└── templates/
    └── 1/
        ├── manifest.json
        ├── zh-CN.png
        ├── zh-TW.png
        ├── en-US.png
        └── ja-JP.png
```

`manifest.json` 声明模板基准尺寸、语言底图文件名、动态字段坐标、渲染样式、点击热区和编辑能力。语言底图、后续素材和 manifest 都从模板入口相对解析，业务代码不逐个 import 单张图片。

模板素材放在 `public/template` 下，是为了避免证书底图被构建图片压缩插件处理，保持导出与预览清晰度。

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
- 自定义头像保存原图、裁剪图、裁剪框和 CropperJS 图片矩阵，保证编辑时能回显裁剪状态。

## 备注

`public/template` 中的素材会被 Vite 原样拷贝到 `dist/template`。请避免把 `.DS_Store` 等系统文件提交进模板包。
