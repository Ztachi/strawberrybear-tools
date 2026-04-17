# Infinity Nikki Player

无限暖暖自动演奏工具 - 基于 Tauri v2 + Vue 3 的跨平台桌面应用

> **规范参考**：本项目遵循 strawberrybear-tools 仓库规范，详见 [AGENT.md](../../docs/AGENT.md) 和 [I18N.md](../../docs/I18N.md)

## 技术栈

- **前端**: Vue 3 + TypeScript + Vite 8 + Tailwind CSS v3
- **后端**: Tauri v2 + Rust
- **状态管理**: Pinia
- **国际化**: vue-i18n
- **UI 组件**: shadcn-vue
- **MIDI 解析**: midly
- **键盘模拟**: enigo

## 安装

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

下载 `.exe` 安装包，双击运行即可。

---

## 开发

```bash
# 安装依赖（需在根目录执行）
pnpm install

# 开发模式
pnpm nikki

# 清理缓存并开发（Rust/配置/新增组件后使用）
pnpm nikki:clean

# 类型检查
pnpm --filter @strawberrybear/infinity-nikki-player type-check

# Lint 检查
pnpm --filter @strawberrybear/infinity-nikki-player lint

# 构建
pnpm --filter @strawberrybear/infinity-nikki-player build
pnpm --filter @strawberrybear/infinity-nikki-player tauri build
```

## 功能

- MIDI 文件解析与单旋律提取
- 键盘映射模板管理（支持自定义模板）
- 多窗口支持（主窗口 + 悬浮 overlay）
- 全局键盘模拟（支持 Mac/Windows）
- 按键日志记录（实时调试映射）
- 中英文国际化支持

## 主题色

- 主色调: `#F7C0C1`（淡粉色）
- 适配游戏《无限暖暖》的清新可爱风格

## 国际化

本项目已完成中英文国际化适配：

- 中文（zh-CN）：默认语言
- 英文（en-US）：可选

所有用户可见文本均使用 `vue-i18n` 管理，翻译文件位于 `src/i18n/` 目录。

## 文档索引

| 文档                                   | 说明                |
| -------------------------------------- | ------------------- |
| [设计文档](docs/design/README.md)      | UI 组件、主题规范   |
| [UI 组件指南](docs/design/ui-guide.md) | shadcn-vue 组件使用 |
| [错误文档](docs/error/README.md)       | 问题追踪            |

### 目录结构

```
docs/
├── design/                    # 设计文档
│   ├── README.md              # 设计索引
│   ├── ui-guide.md            # UI 组件使用指南
│   └── theme.md               # 主题和样式规范
└── error/                     # 错误文档
    ├── README.md
    └── ISSUE-001-*.md
```
