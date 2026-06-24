# 单元测试规范

## 目标

测试是可执行的规格说明。公共包 API、app 业务行为、状态迁移、平台端口适配、bug 修复和关键常量需要聚焦的单元测试，测试应放在最近的 owner。

## 编写原则

- 修复行为时必须补回归测试，当行为可自动化验证时。
- Mock 在 owner 边界：公共包测试 mock 注入的端口；app 测试 mock 平台/API/storage/router 或组件库表面；不要 mock 掉被测逻辑本身。
- 测试文件与源码同目录或放在 `*.test.ts` / `*.spec.ts` 命名约定下，遵循各 app 现有布局。

## 命令

在仓库根目录：

```bash
pnpm --filter @strawberrybear/<app-name> test
pnpm --filter @strawberrybear/<package-name> test
```

各 app 的 `package.json` 中 `test` 脚本不得使用 `--passWithNoTests`（除非该 workspace 确实无测试且处于 scaffold 阶段，需在 app docs 中说明）。

## 与 CI 的关系

- 根层 `ci.yml` 对变更包执行 lint、type-check 和 build。
- 有 test script 的 workspace 应在 CI 或 app docs 中明确是否纳入门禁。
- 设备、浏览器、数据库、部署和平台特定的验收由各 app 的 `docs/` 维护，不在根层重复定义。

## 应用专属测试

Tauri command、Web Worker、Service Worker、IndexedDB 等平台相关测试策略由各 app 文档补充。
