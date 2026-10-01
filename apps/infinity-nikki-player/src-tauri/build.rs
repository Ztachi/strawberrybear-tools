fn main() {
    let windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");

    // Tauri 的资源清单仅链接应用 bin，库测试程序缺少 Common Controls v6 会在启动时
    // 因 TaskDialogIndirect 入口不存在退出。交给 MSVC 链接器为所有链接产物嵌入相同依赖。
    let mut attributes = tauri_build::Attributes::new();
    if windows_msvc {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
        // 取消资源中的默认清单，避免与链接器生成的清单重复。
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    }
    tauri_build::try_build(attributes).expect("Tauri 构建配置失败");
}
