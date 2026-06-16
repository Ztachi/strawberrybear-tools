---
"@strawberrybear/infinity-nikki-player": patch
---

1.1.3 补丁版本：优化国内自动更新下载体验，新增 endpoint 请求超时回退。

- 新增国内更新加速：发布流程同时生成 `latest.json`（海外 / 兜底）和 `latest-cn.json`（国内，URL 走 `https://gh-proxy.com/` 代理 GitHub Releases），`tauri.conf.json` 的 `endpoints` 数组把 `latest-cn.json` 放在第一位，签名校验不变。
- 给 `useAppUpdater.ts` 的 `check()` 调用加上 8 秒超时，避免 endpoint 在国内跨境请求时长时间挂住。
- 更新 `docs/CICD.md`：新增「国内更新加速（双清单方案）」章节，沉淀实现要点与注意事项。
