//! 钢琴工作区独立窗口的首次展示，不参与播放器或按键调度。

/// 展示后立即重绘原生宿主视图，让 Tao 在首次 drawRect 中应用交通灯 inset。
/// WKWebView 的首次绘制不保证触发宿主 drawRect，不能依赖用户调整尺寸补做布局。
#[tauri::command]
pub async fn show_piano_editor(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "piano-editor" {
        return Err("Only the piano editor may show itself".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            let result = (|| {
                target.show().map_err(|error| error.to_string())?;
                #[cfg(target_os = "macos")]
                #[allow(deprecated)]
                // 沿用项目现有 cocoa 依赖，范围限定在原生视图重绘。
                {
                    use cocoa::{appkit::NSView, base::id};
                    let view = target.ns_view().map_err(|error| error.to_string())?;
                    if !view.is_null() {
                        // SAFETY: Tauri 拥有此 NSView；仅在 AppKit 主线程同步重绘，不跨线程保存指针。
                        unsafe {
                            (view as id).display_();
                        }
                    }
                }
                Ok(())
            })();
            let _ = send.send(result);
        })
        .map_err(|error| error.to_string())?;
    receive.await.map_err(|error| error.to_string())?
}
