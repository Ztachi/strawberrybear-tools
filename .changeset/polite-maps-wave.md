---
"@strawberrybear/infinity-nikki-player": patch
---

修复发布流程生成的 `latest.json` 缺少 macOS `darwin-aarch64` 更新入口的问题，确保 macOS 客户端也能通过内置更新检测获取 `.app.tar.gz` 与签名。
