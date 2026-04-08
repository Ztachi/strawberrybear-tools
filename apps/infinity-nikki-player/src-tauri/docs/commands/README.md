# Tauri 命令索引

## 命令列表

所有命令通过 `invoke()` 从前端调用。

### 应用命令

| 命令                | 参数 | 返回值   | 功能                       |
| ------------------- | ---- | -------- | -------------------------- |
| `get_app_version`   | -    | `String` | 获取应用版本               |
| `get_system_locale` | -    | `String` | 获取系统语言（如 "zh-CN"） |

### MIDI 命令

| 命令              | 参数           | 返回值          | 功能               |
| ----------------- | -------------- | --------------- | ------------------ |
| `parse_midi_file` | `path: String` | `MidiInfo`      | 解析 MIDI 文件     |
| `extract_melody`  | `path: String` | `Vec<Note>`     | 提取旋律轨道       |
| `scan_folder`     | `path: String` | `Vec<MidiInfo>` | 扫描文件夹         |
| `read_midi_data`  | `path: String` | `Vec<u8>`       | 读取 MIDI 原始数据 |

### 播放命令

| 命令                 | 参数                             | 返回值          | 功能         |
| -------------------- | -------------------------------- | --------------- | ------------ |
| `start_playback`     | `midi_data: Vec<u8>, speed: f32` | `()`            | 开始播放     |
| `pause_playback`     | -                                | `()`            | 暂停播放     |
| `resume_playback`    | -                                | `()`            | 恢复播放     |
| `stop_playback`      | -                                | `()`            | 停止播放     |
| `get_playback_state` | -                                | `PlaybackState` | 获取播放状态 |
| `set_speed`          | `speed: f32`                     | `()`            | 设置播放速度 |

### 键盘日志命令

| 命令             | 参数 | 返回值             | 功能         |
| ---------------- | ---- | ------------------ | ------------ |
| `get_key_logs`   | -    | `Vec<KeyLogEntry>` | 获取键盘日志 |
| `clear_key_logs` | -    | `()`               | 清空键盘日志 |

### 模板命令

| 命令              | 参数                    | 返回值             | 功能         |
| ----------------- | ----------------------- | ------------------ | ------------ |
| `get_templates`   | -                       | `Vec<KeyTemplate>` | 获取模板列表 |
| `save_template`   | `template: KeyTemplate` | `()`               | 保存模板     |
| `delete_template` | `id: String`            | `()`               | 删除模板     |

### 窗口命令

| 命令                    | 参数 | 返回值 | 功能         |
| ----------------------- | ---- | ------ | ------------ |
| `create_overlay_window` | -    | `()`   | 创建悬浮窗口 |
| `close_overlay_window`  | -    | `()`   | 关闭悬浮窗口 |

### 辅助功能命令

| 命令                          | 参数 | 返回值 | 功能                 |
| ----------------------------- | ---- | ------ | -------------------- |
| `check_accessibility`         | -    | `bool` | 检查辅助功能权限     |
| `open_accessibility_settings` | -    | `()`   | 打开系统辅助功能设置 |

## 前端调用示例

```typescript
import { invoke } from '@tauri-apps/api/core'

// 获取系统语言
const locale = await invoke<string>('get_system_locale')

// 获取应用版本
const version = await invoke<string>('get_app_version')

// 开始播放
await invoke('start_playback', {
  midiData: midiBytes,
  speed: 1.0
})
```

## 命令注册位置

命令在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册：

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_app_version,
    commands::get_system_locale,
    commands::midi::parse_midi_file,
    // ... 更多命令
])
```
