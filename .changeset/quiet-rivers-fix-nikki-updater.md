---
"@strawberrybear/infinity-nikki-player": patch
---

修复更新交互体验：检查更新失败时前端统一提示暂无更新并保留控制台日志，避免展示底层错误；修复 Tauri 更新对象被 Vue 代理后点击更新报 private member 错误的问题；右下角更新入口改为红底白字的醒目按钮，并为通知框启用关闭按钮。
