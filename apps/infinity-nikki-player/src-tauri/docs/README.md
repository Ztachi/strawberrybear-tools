# Tauri 后端设计文档

## 概述

本文档描述 Infinity Nikki Player 的 Tauri/Rust 后端设计决策、架构和模块说明。

## 目录结构

```
src-tauri/
├── docs/                      # 文档目录
│   ├── README.md            # 文档索引（本文件）
│   ├── architecture/         # 架构文档
│   │   ├── README.md        # 架构概述
│   │   └── module-map.md    # 模块关系图
│   ├── commands/             # 命令文档
│   │   └── README.md        # Tauri 命令索引
│   └── guides/               # 开发指南
│       ├── README.md        # 指南索引
│       └── menu-guide.md    # 菜单配置指南
├── src/                      # 源代码
│   ├── lib.rs              # 主入口、菜单配置
│   ├── main.rs             # 程序入口
│   ├── commands/           # Tauri 命令
│   ├── midi/               # MIDI 处理
│   ├── keyboard/           # 键盘模拟
│   └── types.rs            # 共享类型
└── Cargo.toml              # 依赖配置
```

## 技术栈

| 技术                | 版本   | 说明                |
| ------------------- | ------ | ------------------- |
| Tauri               | 2.x    | 桌面应用框架        |
| Rust                | stable | 系统编程语言        |
| midly               | 0.5    | MIDI 文件解析       |
| enigo               | 0.3    | 跨平台键盘/鼠标模拟 |
| tauri-plugin-shell  | 2      | Shell 命令执行      |
| tauri-plugin-dialog | 2      | 原生对话框          |

## 核心模块

### commands/

Tauri 命令层，负责与前端通信。

| 模块           | 功能                         |
| -------------- | ---------------------------- |
| `mod.rs`       | 命令注册、应用版本、系统语言 |
| `midi.rs`      | MIDI 文件解析、扫描          |
| `player.rs`    | 播放控制                     |
| `keyboard.rs`  | 键盘日志                     |
| `templates.rs` | 模板管理                     |
| `window.rs`    | 窗口管理                     |

### midi/

MIDI 文件处理核心逻辑。

### keyboard/

键盘事件模拟，调用 enigo 库实现自动演奏。

## 相关文档

- [架构概述](./architecture/README.md)
- [命令索引](./commands/README.md)
- [开发指南](./guides/README.md)
