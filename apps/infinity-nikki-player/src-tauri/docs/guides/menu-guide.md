# 菜单配置指南

## 概述

Infinity Nikki Player 使用自定义 Tauri 菜单，支持 macOS 系统语言检测和国际化。

## 菜单结构

```
AppMenu
├── InfinityNikkiPlayer / 无限暖暖自动演奏
│   ├── About / 关于
│   ├── ─────────────
│   ├── Hide / 隐藏
│   └── Quit / 退出
├── File / 文件
│   └── Close / 关闭
├── Edit / 编辑
│   ├── Undo / 撤销
│   ├── Redo / 重做
│   ├── ─────────────
│   ├── Cut / 剪切
│   ├── Copy / 复制
│   ├── Paste / 粘贴
│   └── Select All / 全选
├── Window / 窗口
│   ├── Minimize / 最小化
│   ├── Zoom / 缩放
│   ├── ─────────────
│   └── Full Screen / 全屏幕
└── Help / 帮助
    └── About / 关于
```

## 系统语言检测

通过 `get_system_lang()` 函数读取 macOS 系统语言：

```rust
fn get_system_lang() -> String {
    if let Ok(output) = std::process::Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // 提取第一个语言代码（最高优先级）
        if let Some(start) = stdout.find('"') {
            if let Some(end) = stdout[start + 1..].find('"') {
                let lang = &stdout[start + 1..start + 1 + end];
                let lang = lang.trim();
                if lang.starts_with("zh") {
                    return "zh_CN".to_string();
                }
                if lang.starts_with("en") {
                    return "en_US".to_string();
                }
            }
        }
    }
    "en_US".to_string()
}
```

## 动态菜单创建

在 `.setup()` 闭包中根据 `is_zh` 创建对应语言的菜单：

```rust
.setup(move |app| {
    let menu = if is_zh {
        // 中文菜单
        tauri::menu::Menu::with_items(app, &[
            &tauri::menu::Submenu::with_items(app, "无限暖暖自动演奏", true, &[
                &tauri::menu::MenuItem::with_id(app, "about", "关于", true, None::<&str>)?,
                // ...
            ])?,
            // ...
        ])?
    } else {
        // 英文菜单
        tauri::menu::Menu::with_items(app, &[
            &tauri::menu::Submenu::with_items(app, "InfinityNikkiPlayer", true, &[
                &tauri::menu::MenuItem::with_id(app, "about", "About", true, None::<&str>)?,
                // ...
            ])?,
            // ...
        ])?
    };

    app.set_menu(menu)?;
    Ok(())
})
```

## 菜单事件处理

使用 `on_menu_event()` 处理菜单点击：

```rust
app.on_menu_event(move |app_handle, event| {
    let id = event.id().as_ref();
    match id {
        "quit" => {
            app_handle.exit(0);
        }
        "hide" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                window.hide().ok();
            }
        }
        "close" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                window.close().ok();
            }
        }
        "minimize" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                window.minimize().ok();
            }
        }
        "zoom" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                if window.is_maximized().unwrap_or(false) {
                    window.unmaximize().ok();
                } else {
                    window.maximize().ok();
                }
            }
        }
        "fullscreen" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let is_fullscreen = window.is_fullscreen().unwrap_or(false);
                window.set_fullscreen(!is_fullscreen).ok();
            }
        }
        _ => {}
    }
});
```

## 窗口标题国际化

根据系统语言动态设置窗口标题：

```rust
let window_title = if is_zh { "无限暖暖自动演奏" } else { "InfinityNikkiPlayer" };
if let Some(window) = app.get_webview_window("main") {
    if let Err(e) = window.set_title(window_title) {
        log::error!("Failed to set window title: {}", e);
    }
}
```

## 关键 API

| API                               | 说明                |
| --------------------------------- | ------------------- |
| `Menu::with_items()`              | 创建菜单            |
| `Submenu::with_items()`           | 创建子菜单          |
| `MenuItem::with_id()`             | 创建菜单项（带 ID） |
| `PredefinedMenuItem::separator()` | 创建分隔线          |
| `app.set_menu()`                  | 应用菜单            |
| `app.on_menu_event()`             | 菜单事件处理        |

## 注意事项

1. `MenuItem::with_id()` 需要 5 个参数，最后一个是加速键（`None::<&str>`）
2. `PredefinedMenuItem::separator()` 不是 `MenuItem::separator()`
3. 菜单创建和事件处理都在 `.setup()` 闭包中完成
4. `is_zh` 变量需要 `move` 闭包捕获
