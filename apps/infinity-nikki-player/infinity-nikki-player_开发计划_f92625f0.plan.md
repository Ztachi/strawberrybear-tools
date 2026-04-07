---
name: infinity-nikki-player 开发计划
overview: 在 strawberrybear-tools monorepo 的 `apps/infinity-nikki-player` 目录下，创建基于 Tauri v2 + Vue 3 + TypeScript + Tailwind CSS 的跨平台（Mac + Windows）自动按键演奏工具。核心功能包括：MIDI 文件解析与单旋律提取、键盘映射模板管理、多窗口管理（主窗口 + overlay 悬浮窗口）、全局键盘模拟、按键日志（因 Mac 无限暖暖未推出，用于验证按键映射是否正确）。
todos:
  - id: init
    content: 项目初始化：创建 apps/infinity-nikki-player 目录结构和基础配置文件
    status: completed
  - id: tauri-config
    content: 配置 Tauri v2 多窗口（main + overlay）
    status: completed
  - id: rust-midi
    content: Rust 后端：MIDI 解析模块（midly）
    status: completed
  - id: rust-melody
    content: Rust 后端：单旋律提取算法
    status: completed
  - id: rust-keyboard
    content: Rust 后端：键盘模拟模块（enigo）
    status: completed
  - id: rust-commands
    content: Rust 后端：Tauri commands 暴露给前端
    status: completed
  - id: rust-log
    content: Rust 后端：按键日志记录
    status: completed
  - id: vue-entry
    content: Vue 前端：入口和 window label 路由
    status: completed
  - id: vue-main
    content: Vue 前端：主窗口视图（含按键日志 Tab）
    status: completed
  - id: vue-overlay
    content: Vue 前端：悬浮窗口视图（含按键日志展开面板）
    status: completed
  - id: vue-player
    content: Vue 前端：播放控制和状态管理
    status: completed
  - id: vue-template
    content: Vue 前端：映射模板管理
    status: completed
  - id: permissions
    content: Mac Accessibility 权限处理
    status: completed
  - id: verify-build
    content: 验证构建和运行
    status: completed
isProject: false
---

# infinity-nikki-player 开发计划

## 项目定位

- **项目路径**：`apps/infinity-nikki-player`
- **包名**：`@strawberrybear/infinity-nikki-player`
- **技术栈**：Tauri v2 (v2.10.3) + Vue 3 + TypeScript + Vite 8.0.5 + Tailwind CSS v4.2.2 + midly + enigo
- **目标平台**：Mac + Windows

### 技术栈版本确认（2026-04-07）

| 库/工具         | 版本   | 说明                                |
| --------------- | ------ | ----------------------------------- |
| Vite            | 8.0.5  | 最新稳定版，基于 Rust Rolldown 打包 |
| Tailwind CSS    | 4.2.2  | 最新稳定版，CSS 优先配置方式        |
| Tauri           | 2.10.3 | 最新稳定版                          |
| tauri-cli       | 2.10.1 | Tauri 命令行工具                    |
| @tauri-apps/cli | 2.10.1 | JavaScript CLI                      |
| Vue             | 3.5.x  | 组合式 API                          |
| midly           | 0.5    | MIDI 解析                           |
| enigo           | 0.3    | 跨平台键盘模拟                      |

---

## 一、项目初始化

### 1.1 目录结构

```
apps/infinity-nikki-player/
├── src/                          # Vue 前端源码
│   ├── main.ts                   # Vue 入口（根据 window label 切换模式）
│   ├── App.vue                   # 根组件
│   ├── components/               # 公共组件
│   │   ├── MidiList.vue         # MIDI 文件列表
│   │   ├── TemplateEditor.vue    # 映射模板编辑器
│   │   ├── PlayerControls.vue    # 播放控制组件
│   │   └── KeyLogPanel.vue        # 按键日志面板
│   ├── views/                    # 视图（按 window label 切换）
│   │   ├── MainWindow.vue        # 主窗口视图
│   │   └── OverlayWindow.vue     # 悬浮窗口视图
│   ├── stores/                   # 状态管理（pinia）
│   │   └── player.ts             # 播放器状态
│   ├── types/                    # TypeScript 类型定义
│   │   └── index.ts              # 共享类型
│   ├── utils/                    # 工具函数
│   │   └── midi.ts               # MIDI 解析辅助
│   └── style.css                 # Tailwind CSS v4 入口（@import "tailwindcss"）
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── lib.rs                # Tauri 入口
│   │   ├── commands/             # Tauri commands
│   │   │   ├── midi.rs           # MIDI 解析命令
│   │   │   ├── player.rs         # 播放控制命令
│   │   │   ├── keyboard.rs       # 键盘模拟命令
│   │   │   └── window.rs         # 窗口管理命令
│   │   ├── midi/                 # MIDI 解析模块
│   │   │   ├── parser.rs         # midly 封装
│   │   │   └── melody.rs         # 单旋律提取
│   │   ├── keyboard/             # 键盘模拟模块
│   │   │   └── simulator.rs      # enigo 封装
│   │   └── types.rs              # Rust 端类型
│   ├── Cargo.toml                # Rust 依赖
│   ├── tauri.conf.json           # Tauri 配置
│   └── capabilities/             # 权限配置
│       └── default.json
├── index.html                    # Vite 入口
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.node.json
```

### 1.2 关键配置文件

**package.json**：

```json
{
  "name": "@strawberrybear/infinity-nikki-player",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "type-check": "vue-tsc --noEmit"
  },
  "dependencies": {
    "vue": "^3.5.13",
    "pinia": "^3.0.1",
    "@tauri-apps/api": "^2.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@vitejs/plugin-vue": "^5.2.1",
    "@vue/tsconfig": "^0.7.0",
    "typescript": "~5.7.2",
    "vite": "^8.0.5",
    "vue-tsc": "^2.2.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}
```

**src-tauri/Cargo.toml**：

```toml
[package]
name = "infinity-nikki-player"
version = "0.0.1"

[lib]
name = "infinity_nikki_player_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
midly = "0.5"
enigo = "0.3"
tokio = { version = "1", features = ["sync", "time", "rt"] }
log = "0.4"
env_logger = "0.11"
anyhow = "1"
thiserror = "2"
parking_lot = "0.12"

[target."cfg(target_os = \"macos\")".dependencies]
cocoa = "0.26"
```

---

## 二、Tauri 多窗口配置

### 2.1 tauri.conf.json 核心配置

```json
{
  "$schema": "https://schema.tauri.app/config/2.0.0",
  "productName": "InfinityNikkiPlayer",
  "version": "0.0.1",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist",
    "devtools": true
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "label": "main",
        "title": "无限暖暖自动演奏",
        "width": 960,
        "height": 640,
        "minWidth": 800,
        "minHeight": 500,
        "center": true,
        "resizable": true,
        "decorations": true,
        "visible": true
      }
    ],
    "security": {
      "csp": null,
      "capabilities": ["default"]
    }
  }
}
```

### 2.2 悬浮窗口动态创建

通过 `WebviewWindowBuilder` 动态创建 overlay 窗口：

```rust
// src-tauri/src/commands/window.rs
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
async fn create_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    let overlay = WebviewWindowBuilder::new(
        &app,
        "overlay",
        WebviewUrl::App("index.html".into()),
    )
    .title("Overlay")
    .inner_size(320.0, 68.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible(false)
    .resizable(false)
    .focusable(true)
    .build()
    .map_err(|e| e.to_string())?;

    overlay.show().map_err(|e| e.to_string())?;
    Ok(())
}
```

### 2.3 Capabilities 权限配置

**src-tauri/capabilities/default.json**：

```json
{
  "$schema": "https://schema.tauri.app/config/2.0.0",
  "identifier": "default",
  "description": "Default capabilities for main and overlay windows",
  "windows": ["main", "overlay"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-create",
    "core:window:allow-close",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-size",
    "core:window:allow-start-dragging",
    "core:window:allow-set-focus",
    "shell:allow-open"
  ]
}
```

---

## 三、Rust 后端模块设计

### 3.1 MIDI 解析模块

**src-tauri/src/midi/parser.rs**：

```rust
// 使用 midly 解析 MIDI 文件
import midly::{ Midi, Smf };
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiInfo {
    pub filename: String,
    pub duration_ms: u64,
    pub track_count: usize,
    pub ticks_per_beat: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteEvent {
    pub pitch: u8,      // 音高 0-127
    pub velocity: u8,  // 力度 0-127
    pub start_tick: u32,
    pub end_tick: u32,
    pub channel: u8,
}

pub fn parse_midi_file(path: &str) -> Result<(MidiInfo, Vec<NoteEvent>), String> {
    // 实现 MIDI 解析逻辑
}
```

### 3.2 单旋律提取算法

**src-tauri/src/midi/melody.rs**：

```rust
// 优先策略：取最高音轨或同一时刻最高音
pub fn extract_melody(events: &[NoteEvent]) -> Vec<NoteEvent> {
    // 1. 按 tick 分组
    // 2. 每个时刻只保留最高音（忽略和弦和低音）
    // 3. 过滤掉鼓轨（channel 9）
    // 4. 返回按时间排序的旋律事件序列
}
```

### 3.3 键盘模拟模块

**src-tauri/src/keyboard/simulator.rs**：

```rust
// 使用 enigo 进行全局键盘模拟
use enigo::{Enigo, Keyboard, Settings, Direction};
use std::sync::Mutex;

pub struct KeySimulator {
    enigo: Mutex<Enigo>,
}

impl KeySimulator {
    pub fn new() -> Result<Self, String> { ... }

    pub fn press_key(&self, key: char) -> Result<(), String> { ... }

    pub fn release_key(&self, key: char) -> Result<(), String> { ... }
}
```

### 3.4 Tauri Commands 导出

**src-tauri/src/commands/mod.rs**：

```rust
pub mod midi;
pub mod player;
pub mod keyboard;
pub mod window;

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
```

---

## 四、Vue 前端模块设计

### 4.1 入口根据 window label 切换

**src/main.ts**：

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

const app = createApp(App)
app.use(createPinia())

// 读取当前 window label
const params = new URLSearchParams(window.location.search)
const windowLabel = params.get('windowLabel') || 'main'

// 将 label 注入到 provide
app.provide('windowLabel', windowLabel)

app.mount('#app')
```

### 4.2 根组件根据 label 渲染不同视图

**src/App.vue**：

```vue
<script setup lang="ts">
import { inject } from 'vue'
import MainWindow from './views/MainWindow.vue'
import OverlayWindow from './views/OverlayWindow.vue'

const windowLabel = inject<string>('windowLabel', 'main')
</script>

<template>
  <MainWindow v-if="windowLabel === 'main'" />
  <OverlayWindow v-else-if="windowLabel === 'overlay'" />
</template>
```

### 4.3 主窗口视图

**src/views/MainWindow.vue**：

- 拖拽区域：点击或拖拽 MIDI 文件
- 文件夹选择：点击按钮选择文件夹，扫描 .mid 文件
- MIDI 列表：显示文件名、时长、音轨数
- 模板管理：内置 + 自定义映射模板
- 播放控制：播放/暂停/停止、调速
- 进入悬浮模式按钮

### 4.4 悬浮窗口视图

**src/views/OverlayWindow.vue**：

- 极简模式（默认）：MIDI 名称 + 播放/暂停 + 调速 + 展开/收起 + 关闭
- 展开模式：显示进度、当前模板选择
- 拖拽区域：使用 `data-tauri-drag-region`

---

## 五、播放流程设计

### 5.1 播放状态机

```
[Idle] --play--> [Playing] --pause--> [Paused]
                   ^                      |
                   |-------resume---------+
                   |
              --stop---> [Idle]
```

### 5.2 播放流程

1. 用户选择 MIDI 文件 → 调用 `parse_midi` 获取信息
2. 用户选择模板 → 调用 `set_template` 设置映射
3. 用户点击播放 → 调用 `start_playback`，传递 speed（1.0 = 原速）
4. Rust 后端启动 tokio 异步任务：
   - 按 tick 顺序处理 NoteEvent
   - 将 pitch 转换为 key（根据模板）
   - 计算延迟时间（tick → 毫秒，考虑 speed）
   - 调用 `enigo.key_click()` 模拟按键
5. 支持 `pause_playback`、`resume_playback`、`stop_playback`

---

## 六、映射模板设计

### 6.1 内置模板

```typescript
// 内置钢琴音色映射（C4-C5 音高）
const PIANO_TEMPLATE = {
  name: '钢琴映射',
  mappings: {
    60: 'a', 61: 'w', 62: 's', 63: 'e', 64: 'd',
    65: 'f', 66: 't', 67: 'g', 68: 'y', 69: 'h',
    70: 'u', 71: 'j', 72: 'k'
  }
}

// 游戏常用键位映射
const GAME_TEMPLATE = {
  name: '游戏键位',
  mappings: {
    60: 'z', 62: 'x', 64: 'c', 65: 'v',
    67: 'b', 69: 'n', 71: 'm'
  }
}
```

### 6.2 用户自定义模板

- 支持新增/编辑/删除模板
- 保存到 `tauri::AppHandle` 的 app_data_dir
- JSON 文件格式存储

---

## 七、Mac Accessibility 权限

### 7.1 启动时检测权限

在 `lib.rs` 的 `setup` 中检测 Accessibility 权限：

```rust
use std::process::Command;

fn check_accessibility_permissions() -> bool {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to return UI elements enabled"])
            .output();
        // 检查输出
    }
    #[cfg(not(target_os = "macos"))]
    true
}
```

### 7.2 权限申请提示

Rust 端返回错误，前端弹出提示引导用户到系统设置开启权限。

---

## 八、Tailwind CSS v4 配置

### 8.1 配置文件

Tailwind CSS v4 使用 CSS 优先配置，无需 `tailwind.config.js`。

**src/style.css**：

```css
@import "tailwindcss";

@theme {
  /* 自定义主题变量 */
  --color-primary: #6366f1;
  --color-secondary: #8b5cf6;
}
```

### 8.2 Vite 配置

**vite.config.ts**：

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
})
```

---

## 九、按键日志系统

### 9.1 设计背景

由于无限暖暖游戏在 Mac 上尚未推出，按键日志用于验证 MIDI 音符到键盘按键的映射是否正确转换。用户可以通过日志实时观察每个音符对应的按键操作。

### 9.2 按键日志数据结构

**TypeScript 类型**：

```typescript
// src/types/index.ts
export interface KeyLogEntry {
  id: number           // 递增 ID
  timestamp: number    // Unix 时间戳（毫秒）
  pitch: number        // MIDI 音高 (0-127)
  pitchName: string    // 音高名称（如 "C4", "D#5"）
  mappedKey: string    // 映射后的按键（如 "Z", "X"）
  velocity: number    // 力度 (0-127)
  action: 'press' | 'release'  // 按键动作
}
```

### 9.3 Rust 端日志记录

**src-tauri/src/keyboard/simulator.rs**：

```rust
use parking_lot::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

static LOG_COUNTER: AtomicU64 = AtomicU64::new(0);

pub struct KeySimulator {
    enigo: Mutex<enigo::Enigo>,
    log_entries: Mutex<Vec<KeyLogEntry>>,  // 内存中的日志
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyLogEntry {
    pub id: u64,
    pub timestamp: u64,
    pub pitch: u8,
    pub pitch_name: String,
    pub mapped_key: String,
    pub velocity: u8,
    pub action: String,
}

impl KeySimulator {
    pub fn press_key(&self, pitch: u8, mapped_key: &str, velocity: u8) -> Result<(), String> {
        // ... enigo 按键按下逻辑

        // 记录日志
        let entry = KeyLogEntry {
            id: LOG_COUNTER.fetch_add(1, Ordering::Relaxed),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            pitch,
            pitch_name: pitch_to_name(pitch),
            mapped_key: mapped_key.to_string(),
            velocity,
            action: "press".to_string(),
        };

        let mut logs = self.log_entries.lock();
        logs.push(entry);
        // 保持最多 50 条
        if logs.len() > 50 {
            logs.remove(0);
        }

        Ok(())
    }
}
```

### 9.4 前端日志展示

#### 9.4.1 主窗口日志 Tab

**src/components/KeyLogPanel.vue**：

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlayerStore } from '@/stores/player'

const playerStore = usePlayerStore()

/** 音高编号转音名 */
const pitchToName = (pitch: number) => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  const note = notes[pitch % 12]
  return `${note}${octave}`
}
</script>

<template>
  <div class="key-log-panel">
    <div class="log-header">
      <span>按键日志</span>
      <button @click="playerStore.clearLogs()">清空</button>
    </div>
    <div class="log-list">
      <div
        v-for="entry in playerStore.keyLogs"
        :key="entry.id"
        class="log-entry"
      >
        <span class="time">{{ new Date(entry.timestamp).toLocaleTimeString() }}</span>
        <span class="pitch">{{ pitchToName(entry.pitch) }}</span>
        <span class="arrow">-&gt;</span>
        <span class="key">{{ entry.mappedKey }}</span>
        <span class="action" :class="entry.action">{{ entry.action }}</span>
      </div>
      <div v-if="playerStore.keyLogs.length === 0" class="empty">
        暂无按键日志
      </div>
    </div>
  </div>
</template>
```

#### 9.4.2 悬浮窗口展开模式日志

**src/views/OverlayWindow.vue**（展开模式下）：

```vue
<!-- 展开模式下的精简日志（最近 5 条） -->
<div v-if="isExpanded" class="overlay-expanded">
  <!-- 进度条、模板选择等 -->
  <div class="mini-log">
    <div
      v-for="entry in playerStore.keyLogs.slice(-5)"
      :key="entry.id"
      class="mini-log-entry"
    >
      {{ entry.mappedKey }}
    </div>
  </div>
</div>
```

### 9.5 Pinia Store 扩展

**src/stores/player.ts**：

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { KeyLogEntry, MidiInfo, PlaybackState } from '@/types'

export const usePlayerStore = defineStore('player', () => {
  // 按键日志（最多 50 条）
  const keyLogs = ref<KeyLogEntry[]>([])

  // 添加日志（由 Rust 端事件推送）
  const addKeyLog = (entry: KeyLogEntry) => {
    keyLogs.value.push(entry)
    if (keyLogs.value.length > 50) {
      keyLogs.value.shift()
    }
  }

  // 清空日志
  const clearLogs = () => {
    keyLogs.value = []
    invoke('clear_key_logs')
  }

  return { keyLogs, addKeyLog, clearLogs }
})
```

### 9.6 Tauri 命令

```rust
// src-tauri/src/commands/keyboard.rs

#[tauri::command]
fn get_key_logs(state: State<'_, AppState>) -> Vec<KeyLogEntry> {
    state.keyboard_simulator.get_logs()
}

#[tauri::command]
fn clear_key_logs(state: State<'_, AppState>) {
    state.keyboard_simulator.clear_logs()
}
```

---

## 十、Monorepo 架构适配

### 10.1 现有 Monorepo 配置

项目使用 `turbo` 管理多应用构建，详细信息见根目录配置文件：

| 配置文件                        | 说明                          |
| ------------------------------- | ----------------------------- |
| `turbo.json`                    | turbo 任务流水线配置          |
| `package.json`                  | 根 workspace 配置             |
| `.changeset/config.json`        | changeset 发版配置            |
| `.github/workflows/ci.yml`      | Node.js CI（构建 + 类型检查） |
| `.github/workflows/release.yml` | 发版 workflow                 |

### 10.2 Tauri 应用特殊性

**问题**：现有 CI 只安装 Node.js，无法构建 Tauri 应用（需要 Rust 工具链）。

**解决方案**：Tauri 构建通过 `@tauri-apps/cli` 的 `build` 命令执行，它会自动调用 cargo 构建 Rust 后端。

### 10.3 新增 Tauri 构建 Workflow

需要在 `.github/workflows/` 下新增 `tauri-ci.yml`：

```yaml
name: Tauri CI

on:
  push:
    branches: [main]
    paths:
      - 'apps/infinity-nikki-player/**'
  pull_request:
    branches: [main]
    paths:
      - 'apps/infinity-nikki-player/**'

jobs:
  tauri-build:
    timeout-minutes: 60
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: ubuntu-24.04
            args: --target x86_64-unknown-linux-gnu
          - os: macos-latest
            args: ''  # 默认 arm64-apple-darwin
          - os: windows-latest
            args: ''  # 默认 x86_64-pc-windows-msvc

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '24'

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install pnpm
        run: npm install -g pnpm@10

      - name: Install frontend deps
        run: pnpm install --frozen-lockfile

      - name: Build Tauri app
        run: pnpm --filter @strawberrybear/infinity-nikki-player tauri build ${{ matrix.args }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: infinity-nikki-player-${{ matrix.os }}
          path: apps/infinity-nikki-player/src-tauri/target/release/bundle/**
```

### 10.4 打包产物

Tauri 构建后的产物位于 `src-tauri/target/release/bundle/`：

| 平台    | 产物                           |
| ------- | ------------------------------ |
| macOS   | `.app` + `.dmg`（可选）        |
| Windows | `.exe`（NSIS 安装包）或 `.msi` |

### 10.5 发版流程适配

现有 `release.yml` 已支持多应用发版。Tauri 应用发版时：

1. **changeset 文件**（手动创建 `.changeset/xxx.md`）：

   ```markdown
   ---
   "@strawberrybear/infinity-nikki-player": minor
   ---

   添加自动演奏功能
   ```

2. **自动触发**：
   - `pnpm ci:version` 更新版本号
   - Tauri CI 构建产物
   - GitHub Release 包含 `.tar.gz` 压缩包

### 10.6 常用命令

```bash
# 单独开发
pnpm --filter @strawberrybear/infinity-nikki-player dev

# 单独构建
pnpm --filter @strawberrybear/infinity-nikki-player build
pnpm --filter @strawberrybear/infinity-nikki-player tauri build

# 类型检查
pnpm --filter @strawberrybear/infinity-nikki-player type-check

# 全量构建
pnpm build
```

---

## 十一、开发阶段划分

### Phase 1：项目搭建（约 2 小时）

- 创建目录结构
- 配置 Tauri v2 + Vue 3 + Tailwind v4
- 验证多窗口基本功能（main + overlay）
- 配置 Vite 8.0.5 和 Tailwind CSS v4.2.2
- 新增 Tauri CI workflow

### Phase 2：MIDI 解析（约 3 小时）

- Rust 端：midly 解析（midly 0.5）
- 单旋律提取算法
- 前端：文件选择 + 信息展示
- Rust → 前端的事件推送（音符解析结果）

### Phase 3：键盘模拟（约 2 小时）

- enigo 全局键盘模拟（enigo 0.3）
- 播放控制（播放/暂停/停止）
- 速度调节（0.5x - 2.0x）

### Phase 4：按键日志系统（约 2 小时）

- Rust 端内存日志存储（最多 50 条）
- Tauri 事件推送日志到前端
- 前端：主窗口日志 Tab + 悬浮窗口展开面板

### Phase 5：悬浮窗口（约 2 小时）

- Overlay 窗口动态创建/关闭
- 极简/展开模式切换
- `data-tauri-drag-region` 拖拽
- 窗口置顶（alwaysOnTop）

### Phase 6：模板管理（约 2 小时）

- 内置模板（钢琴映射、游戏键位）
- 用户自定义模板 CRUD
- 模板持久化（JSON 存储到 app_data_dir）

### Phase 7：跨平台适配（约 2 小时）

- Mac Accessibility 权限检测与提示
- Windows 平台测试
- Tauri CI workflow 验证
- GitHub Release 打包测试

---

## 十二、关键注意事项

### 12.1 Tauri v2 多窗口 URL 传递

悬浮窗口创建时通过 URL 参数传递 `windowLabel`：

```rust
WebviewUrl::App("index.html?windowLabel=overlay".into())
```

前端 `main.ts` 解析参数：

```typescript
const params = new URLSearchParams(window.location.search)
const windowLabel = params.get('windowLabel') || 'main'
```

### 12.2 Tailwind CSS v4 迁移要点

v4 使用 CSS 优先配置，废弃了 `tailwind.config.js`。所有主题变量通过 `@theme` 在 CSS 中定义：

```css
@import "tailwindcss";

@theme {
  --color-primary: #6366f1;
}
```

### 12.3 enigo 跨平台注意事项

| 平台    | 特殊配置                |
| ------- | ----------------------- |
| macOS   | 需要 Accessibility 权限 |
| Windows | 需要启用"允许辅助功能"  |
| Linux   | 可能需要 `xdotool`      |

### 12.4 midly 解析 MIDI 时区

`midly` 库解析 SMF 格式时，时间单位为 ticks，需结合 `ticks_per_beat` 转换为实际时间：

```rust
let duration_ms = (ticks as f64 / ticks_per_beat as f64) * 500.0; // 假设 120 BPM
```
