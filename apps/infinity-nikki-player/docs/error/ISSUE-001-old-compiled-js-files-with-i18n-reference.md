# 问题：旧编译文件残留导致白屏

## 问题描述

应用启动后页面显示白屏，控制台报错：

```
TypeError: undefined is not an object (evaluating 'Ke._s')
```

## 根本原因

项目中残留了早期开发阶段的旧编译文件（`.js` 文件），这些文件是在使用 `vue-i18n` 时由 TypeScript/Vite 自动生成的。

### 残留文件

| 文件路径               | 问题                       |
| ---------------------- | -------------------------- |
| `src/main.js`          | 引用已删除的 `./i18n` 模块 |
| `src/stores/player.js` | 旧编译产物                 |
| `src/types/index.js`   | 旧编译产物                 |

其中 `src/main.js` 的内容如下：

```javascript
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vue_1 = require("vue");
var pinia_1 = require("pinia");
var App_vue_1 = require("./App.vue");
var i18n_1 = require("./i18n");  // ❌ 这个模块已被删除
require("./style.css");
var app = (0, vue_1.createApp)(App_vue_1.default);
app.use((0, pinia_1.createPinia)());
app.use(i18n_1.default);  // ❌ 尝试注册一个不存在的 i18n 插件
// ...
```

### 错误机制

1. Vite/TypeScript 在开发模式下会优先使用 `src/` 目录下的 `.js` 文件（因为 `allowImportingTsExtensions` 和 `moduleResolution: bundler` 配置）
2. `main.js` 被加载后尝试 `require("./i18n")`，由于 `vue-i18n` 已卸载，这会失败
3. 即使跳过 i18n 加载，Pinia store 代码也可能是旧版本，导致 `Ke._s`（Pinia 内部属性）访问失败

## 排查过程

1. **搜索 i18n 引用**：在 `dist` 目录和 `src` 目录搜索 `vue-i18n`、`useI18n` 等关键词
2. **检查 bundle 内容**：发现 bundle 中存在 `Ke._s` 相关的 Pinia 代码，但 `Ke` 实例为 `null`
3. **清理缓存**：删除 `node_modules/.vite`、`dist`、`src-tauri/target` 后问题依旧
4. **最终发现**：执行 `grep -r "i18n" src/**/*.js` 发现 `src/main.js` 文件

## 解决方案

删除所有残留的旧编译文件：

```bash
rm -f src/main.js
rm -f src/stores/player.js
rm -f src/types/index.js
```

## 修复效果

| 指标        | 修复前    | 修复后   |
| ----------- | --------- | -------- |
| Bundle 大小 | 349.46 KB | 86.62 KB |
| 模块数量    | 56        | 42       |
| i18n 代码   | 残留      | 已清除   |

## 预防措施

1. **Git 忽略编译产物**：确保 `.gitignore` 包含以下规则：

   ```gitignore
   # 源代码编译产物
   src/**/*.js
   src/**/*.js.map
   ```

2. **清理脚本**：在项目根目录添加清理脚本 `scripts/clean.sh`：

   ```bash
   #!/bin/bash
   rm -rf node_modules/.vite dist
   find src -name "*.js" -type f ! -name "*.config.js" -delete
   ```

3. **CI 检查**：在 CI 中添加步骤检查源代码目录是否存在未授权的 `.js` 文件

## 相关配置

### tsconfig.app.json（防止意外编译 .js 文件）

```json
{
  "compilerOptions": {
    "noEmit": true,
    "moduleResolution": "bundler"
  }
}
```

### Vite 配置（关键）

确保 `vite.config.ts` 正确配置了 `moduleResolution: "bundler"` 和 `allowImportingTsExtensions: true`，这样 Vite 在开发模式下会优先解析 `.ts` 文件而非 `.js` 文件。

## 时间线

- **2026-04-07**：项目初始化，添加 `vue-i18n`
- **2026-04-07**：因 `vue-i18n` 报错，卸载 `vue-i18n` 并删除 `src/i18n/` 目录
- **2026-04-07**：遗漏删除 `src/main.js` 等编译产物
- **2026-04-07**：白屏问题排查，最终定位到残留文件
