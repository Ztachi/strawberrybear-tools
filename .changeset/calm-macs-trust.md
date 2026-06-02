---
"@strawberrybear/infinity-nikki-player": patch
---

修复 macOS 更新后辅助功能权限状态无法平滑继承的问题：辅助功能检查改为使用当前进程的原生 Accessibility/TCC 信任状态，避免通过 AppleScript 间接检测导致误判。

发布流程新增 macOS Developer ID 签名证书导入入口，配置 Apple 签名证书后可使用稳定代码签名构建新版应用，避免 ad-hoc 签名更新后被 macOS TCC 识别为新的应用身份。
