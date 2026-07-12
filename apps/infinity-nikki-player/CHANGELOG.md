# @strawberrybear/infinity-nikki-player

## 1.2.0

### Minor Changes

- 76317ad: 发布无限暖暖自动演奏 1.2.0：重构自动演奏与试听调度，完善歌曲管理和播放交互，并提升页面切换时的播放稳定性。
  - 重写自动演奏按键调度：全曲预编译为高精度按键时间轴，修复长音被其他按键截断、短音吞音、同键密集触发和定时器抖动累积问题；暂停、停止、跳转和切歌时可靠释放按键。
  - 重构 MIDI 试听调度：SoundFont 音符提前提交到 Web Audio 时间轴，页面切换和复杂页面渲染不再打断试听；修复快速导入、切歌和暂停恢复时继续播放旧音源的问题。
  - 优化歌曲管理：拖入 MIDI 到歌单时自动加入当前歌单，在线曲库保留虚拟滚动并支持响应式多列布局。
  - 新增“播完即停”播放模式，适用于单曲录制场景；播放进度悬浮提示改为分钟和秒格式。
  - 优化虚拟键盘页面的初始化与渲染开销，避免进入页面时重复重建播放过滤，同时保持模拟按键逻辑不变。
  - 修复 `@strawberrybear/piano-roll` 缺少正式类型入口导致 `vue-tsc -b` 和 GitHub Actions 构建失败的问题。

### Patch Changes

- 8a4f531: 重写自动演奏按键模拟核心：新增 `@strawberrybear/keystroke-sequencer` 公共包，采用"先编译、后执行"策略取代实时事件驱动调度。
  - 新增公共包 `@strawberrybear/keystroke-sequencer`：播放前把全曲音符一次性编译为满足游戏识别约束的按键事件时间轴（纯函数，可单测），执行器按高精度时钟派发，定时器抖动不累积。
  - 修复"后按的音截断先弹长音"问题：提前释放只作用于同一物理键的下一次按下，不同键完全独立，小提琴、琵琶等有音长的乐器长音时值完整保留。
  - 保留防吞音能力：短音自动拉长到最短保持时间，同键相邻按下之间保证最短抬起间隔；同键过密时后音准时按下、保持与间隔按比例压缩。
  - 键盘演奏时间表通过 tempoMap 精确换算，正确覆盖含中途变速的 MIDI；暂停/停止/跳转/切歌时自动抬起所有按下的键，恢复播放会重按跨界长音。

- Updated dependencies [8a4f531]
- Updated dependencies [76317ad]
  - @strawberrybear/keystroke-sequencer@0.2.0
  - @strawberrybear/piano-roll@0.1.1

## 1.1.4

### Patch Changes

- a3dfffb: Fix preview queue navigation and synchronization in Infinity Nikki Player.
  - Keep manual and automatic queue navigation looping across playlist boundaries.
  - Synchronize the active preview queue when the MIDI library or song lists change.
  - Allow Escape to exit batch selection mode in song collections.

- Updated dependencies [a3dfffb]
  - @strawberrybear/player@0.1.1

## 1.1.3

### Patch Changes

- 20e4a84: 1.1.3 补丁版本：优化国内自动更新下载体验，新增 endpoint 请求超时回退。
  - 新增国内更新加速：发布流程同时生成 `latest.json`（海外 / 兜底）和 `latest-cn.json`（国内，URL 走 `https://gh-proxy.com/` 代理 GitHub Releases），`tauri.conf.json` 的 `endpoints` 数组把 `latest-cn.json` 放在第一位，签名校验不变。
  - 给 `useAppUpdater.ts` 的 `check()` 调用加上 8 秒超时，避免 endpoint 在国内跨境请求时长时间挂住。
  - 更新 `docs/CICD.md`：新增「国内更新加速（双清单方案）」章节，沉淀实现要点与注意事项。

## 1.1.2

### Patch Changes

- 4e7b539: 1.1.2 补丁版本：修复列表时长与旋律音符数显示错误，新增在线曲库免责声明。
  - 修复文件列表中时长显示错误、旋律音符数始终为 0 的问题：Rust 端 `parse_midi_file` 时长改为基于所有音符 `end_tick` 的最大值（多轨 MIDI 不再因轨道累加而虚高），并在 `MidiInfo` 中新增 `melody_note_count` 字段；`load_midi_config` 在配置文件不存在时返回错误，让前端能正确触发「重新计算并写缓存」流程。
  - 新增在线曲库免责声明：搜索栏下方、列表上方展示「仅供学习交流，禁止商用」警告条，警示用户合规使用。
  - 顺手同步 Cargo.lock 中遗漏的 1.1.0 → 1.1.1 版本号，与 package.json、Cargo.toml、tauri.conf.json 保持一致。

## 1.1.1

### Patch Changes

- 085c265: 1.1.1 补丁版本：调整歌单菜单顺序与图标细节，修复模板保存误自动切换、嵌套菜单残留与 Tooltip 主题色。
  - 调整歌单右键菜单与歌曲右键菜单的菜单项顺序：无论多少操作，删除固定放最底部，避免误触。
  - 修复"添加到"按钮左侧加号图标在 Dropdown 弹层中未垂直居中的问题，统一菜单图标样式。
  - 修复在模板编辑页面保存模板后自动被选中的问题：保存只刷新模板列表，是否启用由用户在详情页/悬浮窗主动选择，避免自动换模板。
  - 修复歌曲列表右键菜单与右侧操作按钮嵌套菜单残留问题：两个菜单改为受控模式，由父组件统一管理唯一打开状态，保证同时只有一个菜单可见。
  - Tooltip 主题色统一为品牌粉色系：背景使用主品牌按压态色，文字保持白色，箭头背景色自动跟随。

## 1.1.0

### Minor Changes

- ad4d536: 1.1.0 次版本：补齐自建歌单、在线曲库、播放模式控制、悬浮模式体验与键盘模拟体验优化。
  - 新增自建歌单功能：可在应用内创建、编辑、复制、删除、导入、导出歌单，并为歌单设置封面；删除 MIDI 文件时会自动从所有歌单中移除对应条目。
  - 新增在线 MIDI 曲库入口：可在应用内浏览并导入更多乐谱。
  - 新增播放模式控制：支持顺序、随机、单曲循环、列表循环四种模式，模式选择自动持久化，主窗口与悬浮窗统一使用同一控件。
  - 优化悬浮模式体验：悬浮窗常显可拖动进度条，新增"定位当前播放歌曲"快捷按钮，进入与退出悬浮时窗口状态彻底隔离，悬浮模式仅读取列表播放、不影响主界面页面状态。
  - 优化键盘模拟：新增"自动获取游戏帧数"开关（beta），开启后应用会在演奏前检测游戏帧数并据此调整按键的持续和间隔，减少断音；用户也可手动指定帧数。
  - 优化整体界面：统一应用滚动条样式、增强虚拟钢琴与键盘映射提示、为输入框增加可清空按钮、为关键操作增加悬停提示。
  - 修复多个 UI 与交互问题：模板编辑器与 antdv-next 重构后的 UI 适配问题、悬浮模式与主界面切换时的状态错位问题、Windows 窗口阴影导致的尺寸不一致问题等。

## 1.0.0

### Major Changes

- c3d3e7d: 发布 1.0.0 正式版，补齐模板能力的完整闭环，并对播放器、悬浮窗和桌面窗口体验做了一轮系统整理。

  新增模板管理与可视化编辑器：模板页现在支持创建、编辑、复制、删除、导入、导出和批量管理自定义映射模板；编辑器提供 88 键钢琴画布、键盘预览、全局/局部预览、开始编辑、清除映射、撤销/恢复和帮助文档弹窗。映射编辑支持点击琴键后按实体键绑定，重复按键会自动覆盖旧映射，`Esc`、`Backspace`、`Delete` 可清除当前映射，`Ctrl/Cmd + Z`、`Ctrl/Cmd + Shift + Z`、`Ctrl/Cmd + Y` 可撤销和恢复。打开模板、切换模板或加载草稿时会重置历史，选中音符会自动定位到可视区域，悬浮窗切换模板也会立即停止当前播放，确保后续播放始终使用当前模板。

  重构试听播放器前端架构，新增通用播放器核心包 `@strawberrybear/player`，由应用侧适配现有 MIDI/WebAudio 播放能力，主界面和悬浮窗共享进度条与播放控制组件。悬浮窗现在常显可拖动进度条，进入时窗口高度不再截断控制区，上一曲、下一曲、列表切歌和播放入口仍保留 3 秒倒计时逻辑。悬浮模式进入时会临时静音，悬浮期间仍可正常恢复或调整音量，退出时恢复进入悬浮前的主窗口音量状态。

  优化桌面端整体界面：macOS 主窗口采用沉浸式透明标题栏（声明式配置 `titleBarStyle: Overlay` + `hiddenTitle`），顶部区域升级为全局菜单条，保留系统三色按钮，同时在主界面和详情页持续展示 Logo、应用名称、悬浮模式入口和语言切换。菜单条改用官方 `data-tauri-drag-region` 处理窗口拖拽与双击缩放，空白区域可正常拖动。

  修复一系列悬浮模式切换问题：进入悬浮时先切换前端视图再调整窗口，消除主界面在缩小窗口中的闪现；进入悬浮自动选曲不再误打开主界面详情抽屉，悬浮模式仅读取列表播放、不影响主界面页面状态；退出悬浮时延迟补回 `FullSizeContentView` 并重新聚焦，修复退出后菜单条错位、以及页面需切换程序才能响应 hover 的问题。新增通用窗口状态快照机制（`window_state` 模块）：进入悬浮前快照窗口状态（含全屏），退出全屏动画结束后再变形为定宽浮窗，退出悬浮时还原窗口几何并恢复全屏，修复全屏下进入悬浮变成整屏宽、以及退出后丢失全屏状态的问题，悬浮窗与主窗口状态彻底隔离。

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
