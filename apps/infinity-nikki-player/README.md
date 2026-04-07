# Infinity Nikki Player

无限暖暖自动演奏工具 - 基于 Tauri v2 + Vue 3 的跨平台桌面应用

> **规范参考**：本项目遵循 strawberrybear-tools 仓库规范，详见 [AGENT.md](../../docs/AGENT.md) 和 [I18N.md](../../docs/I18N.md)

## 技术栈

- **前端**: Vue 3 + TypeScript + Vite 8 + Tailwind CSS v3
- **后端**: Tauri v2 + Rust
- **状态管理**: Pinia
- **国际化**: vue-i18n
- **MIDI 解析**: midly
- **键盘模拟**: enigo

## 开发

```bash
# 安装依赖（需在根目录执行）
pnpm install

# 开发模式
pnpm --filter @strawberrybear/infinity-nikki-player dev

# 类型检查
pnpm --filter @strawberrybear/infinity-nikki-player type-check

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

## 主题色

- 主色调: `#F7C0C1`（淡粉色）
- 适配游戏《无限暖暖》的清新可爱风格

## 国际化

本项目已完成中英文国际化适配：

- 中文（zh-CN）：默认语言
- 英文（en-US）：可选

所有用户可见文本均使用 `vue-i18n` 管理，翻译文件位于 `src/i18n/` 目录。
