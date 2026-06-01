---
"@strawberrybear/infinity-nikki-player": minor
---

修复 macOS 游戏内按键模拟失效问题：新增 macOS 物理 virtual keycode/raw key event 路径，支持字母、数字行和 F1-F12；Windows 继续保留 SendInput + scan code 路径，并将前端按键模拟和 Rust 后台播放统一收敛到同一层 KeySimulator 门面，避免不同播放路径行为不一致。

接入 Tauri 2 官方自动更新能力：启动后静默检查更新，在右下角浮动按钮区显示更新入口，并在关于弹窗版本号旁提供手动检测与更新按钮；下载更新时显示进度，安装完成后自动重启，失败时保留 GitHub Release 兜底入口。

完善发布流程以支持自动更新：发布工作流先执行 Changesets 版本更新再构建 Tauri 安装包，构建时注入 updater 签名私钥，生成并上传 Windows 安装包、签名文件和 latest.json；同时上传 macOS updater 签名产物（如生成）。

统一 infinity-nikki-player 的 package.json、tauri.conf.json 和 Cargo.toml 版本号，并补齐 Tauri updater/process 前后端依赖、插件注册和 capability 权限。

增强 MIDI 预览播放音量：新增 WebAudio 主输出增益与动态压缩链路，提高 100% 音量下的实际响度，同时保留力度动态并降低多音同时播放时的峰值风险。
