# @strawberrybear/infinity-nikki-player

## 0.3.2

### Patch Changes

- 15356b0: 完善 macOS 辅助功能权限异常时的重新授权引导：用户指南补充删除旧权限项、重启应用并重新授权的处理步骤，主界面授权按钮增加悬停提示，并在帮助弹窗中补充 QQ 联系方式。

## 0.3.1

### Patch Changes

- 554923f: 修复 macOS 更新后辅助功能权限状态无法平滑继承的问题：辅助功能检查改为使用当前进程的原生 Accessibility/TCC 信任状态，避免通过 AppleScript 间接检测导致误判。

  发布流程新增 macOS Developer ID 签名证书导入入口，配置 Apple 签名证书后可使用稳定代码签名构建新版应用，避免 ad-hoc 签名更新后被 macOS TCC 识别为新的应用身份。

## 0.3.0

### Minor Changes

- b6a1ad9: 修复 macOS 游戏内按键模拟失效问题：新增 macOS 物理 virtual keycode/raw key event 路径，支持字母、数字行和 F1-F12；Windows 继续保留 SendInput + scan code 路径，并将前端按键模拟和 Rust 后台播放统一收敛到同一层 KeySimulator 门面，避免不同播放路径行为不一致。

  接入 Tauri 2 官方自动更新能力：启动后静默检查更新，在右下角浮动按钮区显示更新入口，并在关于弹窗版本号旁提供手动检测与更新按钮；下载更新时显示进度，安装完成后自动重启，失败时保留 GitHub Release 兜底入口。

  完善发布流程以支持自动更新：发布工作流先执行 Changesets 版本更新再构建 Tauri 安装包，构建时注入 updater 签名私钥，生成并上传 Windows 安装包、签名文件和 latest.json；同时上传 macOS updater 签名产物（如生成）。

  统一 infinity-nikki-player 的 package.json、tauri.conf.json 和 Cargo.toml 版本号，并补齐 Tauri updater/process 前后端依赖、插件注册和 capability 权限。

  增强 MIDI 预览播放音量：新增 WebAudio 主输出增益与动态压缩链路，提高 100% 音量下的实际响度，同时保留力度动态并降低多音同时播放时的峰值风险。

### Patch Changes

- 824bfd9: 修复游戏演奏短音符按键持续时间过短导致的丢音问题，按固定 60FPS 内部时序配置计算默认按键保持时间，并保留后续自动获取 FPS 的扩展入口。

  修复悬浮窗播放列表、上一曲、下一曲切歌后立即播放的问题，统一改为切歌后倒计时 3 秒再从头播放。

## 0.2.3

### Patch Changes

- d4d7057: 新增 4 首默认 MIDI 示例曲目到应用内置资源，首次安装后可直接在默认曲库中使用：`Interstellar（钢琴版）汉斯·季默`、`sky03`、`菊次郎的夏天-Summer`、`霞光`。

## 0.2.2

### Patch Changes

- dc41cc7: 修复更新交互体验：检查更新失败时前端统一提示暂无更新并保留控制台日志，避免展示底层错误；修复 Tauri 更新对象被 Vue 代理后点击更新报 private member 错误的问题；右下角更新入口改为红底白字的醒目按钮，并为通知框启用关闭按钮。

## 0.2.1

### Patch Changes

- 4332a03: 修复发布流程生成的 `latest.json` 缺少 macOS `darwin-aarch64` 更新入口的问题，确保 macOS 客户端也能通过内置更新检测获取 `.app.tar.gz` 与签名。

## 0.2.0

### Minor Changes

- a94c4b2: 修复 macOS 游戏内按键模拟失效问题：新增 macOS 物理 virtual keycode/raw key event 路径，支持字母、数字行和 F1-F12；Windows 继续保留 SendInput + scan code 路径，并将前端按键模拟和 Rust 后台播放统一收敛到同一层 KeySimulator 门面，避免不同播放路径行为不一致。

  接入 Tauri 2 官方自动更新能力：启动后静默检查更新，在右下角浮动按钮区显示更新入口，并在关于弹窗版本号旁提供手动检测与更新按钮；下载更新时显示进度，安装完成后自动重启，失败时保留 GitHub Release 兜底入口。

  完善发布流程以支持自动更新：发布工作流先执行 Changesets 版本更新再构建 Tauri 安装包，构建时注入 updater 签名私钥，生成并上传 Windows 安装包、签名文件和 latest.json；同时上传 macOS updater 签名产物（如生成）。

  统一 infinity-nikki-player 的 package.json、tauri.conf.json 和 Cargo.toml 版本号，并补齐 Tauri updater/process 前后端依赖、插件注册和 capability 权限。

  增强 MIDI 预览播放音量：新增 WebAudio 主输出增益与动态压缩链路，提高 100% 音量下的实际响度，同时保留力度动态并降低多音同时播放时的峰值风险。

## 0.1.0

### Minor Changes

- 首次发布：无限暖暖自动演奏工具，支持 MIDI 文件解析、键盘映射模板、智能音高适配算法、悬浮模式、中英文国际化
