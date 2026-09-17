//! 钢琴独立窗口的原生冒烟宿主，不调用应用 run()，不装配音频、文件扫描或键盘模拟。
//! 先启动 `pnpm dev --port 1432`，再执行 `cargo run --example piano_editor_smoke`。
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// 读取真实子 WebView 的可见内容，由事件返回测试主窗口。
#[tauri::command]
async fn smoke_probe(app: AppHandle) -> Result<(), String> {
    let child = app
        .get_webview_window("piano-editor")
        .ok_or("Missing editor window")?;
    child
        .eval(
            r#"window.__TAURI__.event.emitTo('main', 'piano-native-probe', {
      song: document.querySelector('.detached-song-title')?.textContent?.trim(),
      track: document.querySelector('.detail-piano-editor .piano-roll-slot-title')?.textContent?.trim(),
      zoom: document.querySelector('.ant-slider [role=slider]')?.getAttribute('aria-valuenow')
    })"#,
        )
        .map_err(|error| error.to_string())
}

/// 独立窗口包含总览，选轨操作也发生在同一子窗口内。
#[tauri::command]
async fn smoke_select_track(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("piano-editor")
        .ok_or("Missing editor window")?
        .eval(r#"document.querySelector('.detail-piano-roll .pr-track[data-track-id="2"] .pr-track-select')?.click()"#)
        .map_err(|error| error.to_string())
}

/// 调用原生 close，而不是模拟工具栏点击，验证 closeRequested 与还原链路。
#[tauri::command]
async fn smoke_close_editor(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("piano-editor")
        .ok_or("Missing editor window")?
        .close()
        .map_err(|error| error.to_string())
}

/// 记录原生验收结果并退出当前测试进程，不操作用户已运行的播放器。
#[tauri::command]
async fn smoke_finish(app: AppHandle, result: String) -> Result<(), String> {
    println!("PIANO_EDITOR_SMOKE: {result}");
    let success = result == "ok" && app.get_webview_window("piano-editor").is_none();
    app.exit(if success { 0 } else { 1 });
    Ok(())
}

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().build.dev_url = Some("http://localhost:1432".parse().expect("test URL"));
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            smoke_probe,
            smoke_select_track,
            smoke_close_editor,
            smoke_finish
        ])
        .setup(|app| {
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("tests/browser/midi-detail-page.html?nativeSmoke=1".into()),
            )
            .title("Piano editor isolated smoke test")
            .inner_size(1100.0, 850.0)
            .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(45));
                eprintln!("PIANO_EDITOR_SMOKE: timeout");
                handle.exit(2);
            });
            Ok(())
        })
        .run(context)
        .expect("run isolated piano editor smoke test");
}
