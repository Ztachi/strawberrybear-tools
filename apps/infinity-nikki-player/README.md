# Infinity Nikki Player

无限暖暖自动演奏工具 - 基于 Tauri v2 + Vue 3 的跨平台桌面应用

> **规范参考**：本项目遵循 strawberrybear-tools 仓库规范，详见 [AGENT.md](../../docs/AGENT.md) 和 [I18N.md](../../docs/I18N.md)

## 技术栈

| 分类               | 技术                                            |
| ------------------ | ----------------------------------------------- |
| **前端框架**       | Vue 3 + TypeScript + Vite ^8.0.5                |
| **样式方案**       | Tailwind CSS v3 + CSS Variables                 |
| **后端框架**       | Tauri v2 + Rust                                 |
| **状态管理**       | Pinia ^3.0.1                                    |
| **国际化**         | vue-i18n ^10.0.5                                |
| **UI 组件库**      | antdv-next 1.3.3                                |
| **音频播放**       | Tone.js + midi-player-js + soundfont-player     |
| **钢琴卷帘**       | @strawberrybear/piano-roll (workspace)          |
| **Rust MIDI 解析** | midly                                           |
| **Rust 键盘模拟**  | enigo                                           |
| **反馈提示**       | `src/lib/feedback.ts` + antdv-next notification |
| **窗口抽屉**       | antdv-next Drawer                               |

## 安装

详细安装说明请查看 [用户指南](docs/USER_GUIDE.md)。

### macOS 安装

1. 下载最新的 `.dmg` 文件
2. 打开 DMG，将 **InfinityNikkiPlayer.app** 拖入 Applications 文件夹
3. 首次打开时如果提示"无法验证开发者"：
   - 前往 **系统设置 → 隐私与安全性**
   - 滚动到底部，点击 **"仍要打开"**
4. 之后即可正常运行

> 如果提示"文件已损坏"，在终端执行：
>
> ```bash
> sudo xattr -rd com.apple.quarantine /Applications/InfinityNikkiPlayer.app
> ```

### Windows 安装

1. 下载 `.exe` 安装包，双击运行即可
2. **重要**：安装完成后，右键点击应用快捷方式 → 属性 → 兼容性 → 勾选"以管理员身份运行此程序"

---

## 开发

```bash
# 安装依赖（需在根目录执行）
pnpm install

# 开发模式启动（热重载）
pnpm --filter @strawberrybear/infinity-nikki-player dev

# 或使用 tauri 内置开发命令
pnpm tauri:dev

# 构建并启动（直接打包并运行 release 版本）
pnpm nikki

# 清理 Rust 编译缓存
pnpm clean

# 类型检查
pnpm --filter @strawberrybear/infinity-nikki-player type-check

# Lint 检查
pnpm --filter @strawberrybear/infinity-nikki-player lint

# 前端构建
pnpm --filter @strawberrybear/infinity-nikki-player build

# Tauri 应用构建
pnpm --filter @strawberrybear/infinity-nikki-player tauri build
```

---

## 核心功能

### MIDI 文件管理

- **导入方式**：支持文件选择器、文件夹批量导入、拖拽导入
- **文件存储**：MIDI 文件自动复制到应用数据目录的 `midi_library` 文件夹
- **信息缓存**：自动缓存文件时长、音轨数、旋律音符数等配置信息，加速下次加载
- **支持格式**：`.mid`、`.midi`

### 自建歌单

- **完整 CRUD**：支持创建、编辑、复制、删除、导入、导出歌单
- **封面设置**：为每个歌单设置自定义封面
- **歌曲管理**：在歌单中自由增删 MIDI 曲目
- **自动同步**：删除 MIDI 文件时自动从所有歌单中移除对应条目
- **大列表优化**：启用虚拟滚动以保持流畅

### 在线 MIDI 曲库

- **应用内浏览**：无需离开应用即可浏览与导入更多乐谱
- **试听预览**：在导入前可以试听曲库中的 MIDI

### 播放模式控制

- **四种模式**：顺序、随机、单曲循环、列表循环
- **模式持久化**：选择自动保存，下次启动沿用
- **主窗口与悬浮窗统一**：同一控件在两处共享

### 音轨管理

- **音轨屏蔽**：支持屏蔽/启用特定音轨（如打击乐器音轨）
- **屏蔽持久化**：音轨屏蔽状态保存在应用配置中，下次打开自动恢复
- **音轨识别**：自动识别 MIDI Channel 9 打击乐器音轨

### 预览播放

- **音频引擎**：基于 Tone.js + soundfont-player 的钢琴音色播放
- **两种模式**：
  - **自动演奏（Auto）**：播放 MIDI 所有音符，不做任何过滤
  - **模板发音（Piano）**：仅播放模板定义的音高，按智能音高适配算法映射
- **试听控制**：播放/暂停/停止、进度拖拽、上一曲/下一曲、音量调节、静音切换
- **播放速度**：支持调节播放倍速
- **实时高亮**：钢琴卷帘显示当前播放位置

### 键盘模拟

- **平台支持**：Mac/Windows 双平台
- **权限要求**：需要 macOS 辅助功能权限（Windows 无特殊要求）
- **实时日志**：显示按键按下/释放的实时日志（最多 50 条）
- **按键预览**：可视化键盘布局，实时高亮当前激活的按键
- **模板化映射**：基于模板的音高到键盘按键映射
- **自动获取游戏帧数（beta）**：在悬浮窗打开"自动 FPS"开关后，应用会在演奏前检测游戏帧数并据此调整按键的持续和间隔，减少断音；也可手动指定帧数

### 悬浮模式

- **窗口特性**：透明背景、可拖拽、可悬浮于游戏窗口上方
- **迷你播放器**：紧凑的悬浮条，显示当前曲目和播放控制
- **常显进度条**：进入悬浮窗后，进度条始终可见、可拖动
- **定位当前播放**：悬浮窗新增"定位当前播放歌曲"快捷按钮
- **展开面板**：点击展开后显示完整播放列表
- **倒计时播放**：进入悬浮模式后 3 秒倒计时开始播放，便于切换到游戏窗口
- **状态隔离**：进入与退出悬浮时窗口状态彻底隔离，悬浮模式仅读取列表播放、不影响主界面页面状态
- **独立音量**：悬浮层有独立的音量控制，与主窗口音量互不影响

### 智能音高适配算法

- **量化到白键**：将任意音高量化到最近的白键（C 大调音阶）
- **模板匹配**：在模板定义的音高中查找完全匹配项
- **近似映射**：无完全匹配时，选择模板中最接近的音高
- **目的**：确保任意 MIDI 都能在有限的键盘映射上播放

---

## 主题色

| 用途     | 色值                  |
| -------- | --------------------- |
| 主色调   | `#F7C0C1`（淡粉色）   |
| 悬停态   | `#F5AAB8`             |
| 按下态   | `#E98CA2`             |
| 布局背景 | `#FFF7FA`             |
| 容器背景 | `#FFFFFF` / `#FFF9FC` |
| 边框色   | `#F3CAD0`             |

主题通过 `src/theme/infinityNikkiTheme.ts` 注入 antdv-next `ConfigProvider`，并继续保留 Tailwind v3 与项目 CSS 变量，用于业务组件里的原子类和既有自定义视觉。

---

## 国际化

本项目已完成中英文国际化适配：

| 语言 | 代码    | 说明                           |
| ---- | ------- | ------------------------------ |
| 中文 | `zh-CN` | 默认语言，根据系统语言自动选择 |
| 英文 | `en-US` | 可选语言                       |

**国际化文件位置**：`src/i18n/locales/`

---

## 演奏模式详解

### Auto 模式（自动演奏）

- 播放 MIDI 文件中的所有音符
- 不应用任何音高过滤或映射
- 适用于测试 MIDI 文件的完整内容

### Piano 模式（模板发音）

- 仅播放模板定义的音高
- 启用智能音高适配算法，将任意音高映射到模板音高
- 可选开启键盘模拟，真实模拟键盘输入到游戏
- 适用于实际游戏演奏

### 键盘模拟使用步骤

1. 在详情页或悬浮层选择模板
2. 切换到 **Piano 模式**
3. 开启 **键盘模拟** 开关
4. 点击 **悬浮模式** 进入悬浮层
5. 选择曲目，点击播放（3 秒倒计时）
6. 快速切换到游戏窗口
7. 应用会自动模拟键盘输入

---

## 目录结构

```
infinity-nikki-player/
├── src/                          # Vue 前端源码
│   ├── assets/                   # 静态资源
│   ├── components/               # 公共组件
│   │   ├── AboutDialog/          # 关于对话框
│   │   ├── AppUpdateButton.vue   # 更新入口
│   │   ├── FloatingActionGroup.vue  # 浮动操作按钮组
│   │   ├── GlobalMusicPlayer/    # 全局音乐播放器
│   │   ├── GlobalPlayerBar/      # 全局播放条
│   │   ├── HeaderNavigation/     # 顶部导航
│   │   ├── KeyboardPreview/      # 键盘预览与日志
│   │   ├── KeyTemplateSelect.vue # 模板选择器
│   │   ├── MarqueeText.vue       # 跑马灯文字
│   │   ├── MusicPlayerCore/      # 播放核心
│   │   ├── PlaybackModeControl.vue  # 播放模式控件
│   │   ├── PlayerControls/       # 播放控制
│   │   ├── PlayQueueDrawer/      # 播放列表面板
│   │   ├── PreviewPlayer/        # 预览播放器
│   │   └── ScrollableContainer.vue
│   ├── views/
│   │   └── MainWindow/           # 主窗口
│   │       ├── FilesTab/         # 文件 Tab（含自建歌单）
│   │       │   ├── components/   # SongListSidebar / SongCollectionView / CoverCropperModal 等
│   │       │   └── pages/        # AllSongsPage / SongListDetailPage / SongListEditPage 等
│   │       ├── OnlineLibraryTab/ # 在线 MIDI 曲库
│   │       ├── TemplatesTab/     # 模板 Tab
│   │       ├── LogsTab/          # 按键日志 Tab
│   │       ├── components/       # AppHeader / OverlayFpsControl
│   │       ├── OverlayView.vue   # 悬浮模式视图
│   │       └── index.vue
│   ├── stores/                   # Pinia 状态
│   │   ├── player.ts             # 播放器状态
│   │   ├── settings.ts           # 应用设置
│   │   ├── songLists.ts          # 自建歌单
│   │   ├── mainWindowUi.ts       # 主窗口 UI 状态
│   │   └── onlineMidiLibrary.ts  # 在线曲库
│   ├── lib/                      # 业务逻辑
│   │   ├── feedback.ts           # antdv-next 反馈封装
│   │   ├── midiPlayer.ts         # 音频播放器
│   │   ├── midiDisplay.ts        # MIDI 显示工具
│   │   ├── keyboardMapper.ts     # 键盘映射器
│   │   ├── keyboardTiming.ts     # 按键时序
│   │   ├── frameRateCapture.ts   # 帧率采集封装
│   │   ├── onlineMidiLibraryApi.ts  # 在线曲库接口
│   │   ├── settings.ts           # 设置持久化
│   │   ├── templateKeys.ts       # 模板按键工具
│   │   └── templatePianoEditor.ts
│   ├── features/                 # 业务特性
│   │   └── player/midiPreview.ts
│   ├── bootstrap/                # 应用启动
│   │   ├── createAppContext.ts
│   │   └── bindAppContextStores.ts
│   ├── composables/              # 组合式 API
│   │   └── useAppUpdater.ts
│   ├── router/                   # 路由
│   ├── theme/                    # 主题
│   │   └── infinityNikkiTheme.ts
│   ├── i18n/                     # 国际化
│   ├── types/                    # TypeScript 类型
│   ├── App.vue
│   ├── main.ts
│   └── style.css
│
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── commands/             # Tauri 命令
│   │   │   ├── midi.rs
│   │   │   ├── player.rs
│   │   │   ├── keyboard.rs
│   │   │   ├── templates.rs
│   │   │   ├── settings.rs
│   │   │   ├── song_lists.rs     # 自建歌单
│   │   │   ├── online_midi_library.rs  # 在线曲库
│   │   │   ├── frame_rate.rs     # 帧率采集
│   │   │   ├── window.rs
│   │   │   ├── window_controls.rs
│   │   │   └── mod.rs
│   │   ├── midi/                 # MIDI 解析
│   │   ├── keyboard/             # 键盘模拟
│   │   ├── window_state.rs       # 窗口状态快照
│   │   ├── lib.rs
│   │   ├── main.rs
│   │   └── types.rs
│   ├── templates/                # 内置键盘映射模板
│   ├── midi/                     # 捆绑的示例 MIDI 文件
│   ├── presentmon/               # Windows 帧率采集工具
│   ├── icons/                    # 应用图标
│   ├── tauri.conf.json
│   └── Cargo.toml
│
├── docs/                         # 文档
│   ├── design/                   # 设计文档
│   ├── error/                    # 错误追踪
│   └── USER_GUIDE.md             # 用户指南
│
├── scripts/                      # 构建脚本
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── CHANGELOG.md
```

---

## 文档索引

| 文档                                   | 说明                |
| -------------------------------------- | ------------------- |
| [用户指南](docs/USER_GUIDE.md)         | 安装与使用说明      |
| [设计文档](docs/design/README.md)      | UI 组件、主题规范   |
| [UI 组件指南](docs/design/ui-guide.md) | antdv-next 组件使用 |
| [错误文档](docs/error/README.md)       | 问题追踪            |

---

## 常见问题

### macOS 提示"无法验证开发者"

进入 **系统设置 → 隐私与安全性**，滚动到底部点击 **"仍要打开"**。

### macOS 提示"文件已损坏"

执行：`sudo xattr -rd com.apple.quarantine /Applications/InfinityNikkiPlayer.app`

### 键盘模拟不工作

1. 确认已开启 **Piano 模式**
2. 确认已开启 **键盘模拟** 开关
3. 进入 **系统设置 → 隐私与安全性 → 辅助功能**，确认应用已获许访问

### Windows 以管理员运行

右键快捷方式 → 属性 → 兼容性 → 勾选"以管理员身份运行此程序"

### 悬浮模式说明

悬浮模式窗口透明背景，可悬浮于游戏窗口上方。进入后有 3 秒倒计时，建议提前切换到游戏窗口。

### 自建歌单相关

- **删除 MIDI 后能否恢复**：删除 MIDI 时会自动从所有歌单中移除对应条目，该操作不可撤销；如需保留请先导出歌单备份。
- **歌单导入/导出格式**：支持 JSON 格式的单歌单导出与整套歌单导出，导入时会按同名规则覆盖已有歌单。

### 自动获取游戏帧数

- **开关位置**：悬浮窗中的 FPS 控件（标注 beta）。
- **开启效果**：应用会在演奏前检测游戏帧数并据此调整按键的持续和间隔，减少断音。
- **macOS 行为**：暂不支持自动检测，会保持固定时序，仍可手动指定 FPS。
- **不影响手动 FPS**：关闭自动 FPS 后，可手动在输入框中指定帧数并按回车生效。

### 在线曲库

- **找不到想用的乐谱**：在线曲库由后端服务提供，如遇空目录或加载失败，请稍后重试或前往本地导入。

---

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)
