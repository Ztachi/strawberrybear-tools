//! 更新日志的安装身份、升级区间和独立已读记录；沿用 Tauri Store 与 semver。

use crate::updater::{self, InstallReceipt};
use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "release-notes.json";
const SEEN_KEY: &str = "highestSeenVersion";
const CATALOG: &str = include_str!("../../../src/const/release-notes.json");

/// 旧设置是否存在必须在原生启动时确定，不能被首屏初始化保存新设置的时序影响。
struct ProfilePresence(Result<bool, String>);

/// 初始化安装身份快照；app 为原生句柄，不触碰设置内容和已读记录。
pub fn initialize<R: Runtime>(app: &AppHandle<R>) {
    app.manage(ProfilePresence(
        app.path()
            .app_data_dir()
            .map(|directory| directory.join("settings.json").exists())
            .map_err(|e| format!("读取应用数据目录失败：{e}")),
    ));
}

#[derive(Deserialize)]
struct ReleaseEntry {
    version: String,
}

/// 只有主窗口消费自动提示；历史目录也以实际运行版本为上限。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNotesLaunch {
    current_version: String,
    history_versions: Vec<String>,
    update_versions: Vec<String>,
}

/// 从目录和持久化身份计算范围；不推测旧版用户实际使用过哪个版本。
///
/// current 为实际运行版本，seen 为最高已读版本，legacy 表示已有设置，receipt 为上次安装记录。
/// 返回全部历史和本次升级范围；没有旧身份的首次安装不提示。
fn resolve_launch(
    current: &str,
    seen: Option<&str>,
    legacy: bool,
    receipt: Option<&InstallReceipt>,
    catalog: &str,
) -> Result<ReleaseNotesLaunch, String> {
    let current_version = Version::parse(current).map_err(|e| format!("应用版本无效：{e}"))?;
    let entries: Vec<ReleaseEntry> =
        serde_json::from_str(catalog).map_err(|e| format!("更新日志目录无效：{e}"))?;
    let mut versions: Vec<Version> = entries
        .into_iter()
        .map(|entry| Version::parse(&entry.version))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("日志版本无效：{e}"))?;
    versions.retain(|version| version <= &current_version);
    versions.sort_by(|a, b| b.cmp(a));

    // 已读高水位优先于安装记录；降级再升级不能把已经展示过的版本重复弹出。
    let previous = seen
        .and_then(|value| Version::parse(value).ok())
        .or_else(|| {
            receipt
                .filter(|value| value.outcome == "applied" && value.target_version == current)
                .and_then(|value| Version::parse(&value.from_version).ok())
                .filter(|value| value < &current_version)
        });
    let update_versions = match previous {
        Some(previous) => versions
            .iter()
            .filter(|version| *version > &previous)
            .map(ToString::to_string)
            .collect(),
        // 旧版没有版本追踪，手动覆盖安装时只展示当前版本，避免把全部历史当成更新。
        None if legacy => versions
            .iter()
            .filter(|version| *version == &current_version)
            .map(ToString::to_string)
            .collect(),
        None => Vec::new(),
    };
    Ok(ReleaseNotesLaunch {
        current_version: current.into(),
        history_versions: versions.iter().map(ToString::to_string).collect(),
        update_versions,
    })
}

/// 读取安装身份和已读区间，不在读取时修改状态。
///
/// app 为主应用句柄；存储故障不影响读取随包提供的完整历史。
#[tauri::command]
pub fn get_release_notes_launch(app: AppHandle) -> Result<ReleaseNotesLaunch, String> {
    // 日志内容本身离线可用；磁盘故障不能让“关于”中的完整历史也失效。
    let seen = match app.store(STORE_FILE) {
        Ok(store) => store
            .get(SEEN_KEY)
            .and_then(|value| value.as_str().map(str::to_owned)),
        Err(error) => {
            log::warn!("读取日志已读记录失败，保留离线目录：{error}");
            None
        }
    };
    let legacy = match &app.state::<ProfilePresence>().0 {
        Ok(exists) => *exists,
        Err(error) => {
            log::warn!("读取旧版安装身份失败，不推测升级来源：{error}");
            false
        }
    };
    let snapshot = updater::snapshot(&app);
    let mut launch = resolve_launch(
        &app.package_info().version.to_string(),
        seen.as_deref(),
        legacy,
        snapshot.last_install.as_ref(),
        CATALOG,
    )?;
    // 日常开发不消耗正式安装的已读状态，也不自动弹历史公告。
    if cfg!(debug_assertions) {
        launch.update_versions.clear();
    }
    Ok(launch)
}

/// 当前版本已进入首屏后建立已读基线，不接受前端指定任意版本。
///
/// app 为应用句柄；成功返回 ()，写盘失败保留错误给启动调用者。
#[tauri::command]
pub fn acknowledge_release_notes(app: AppHandle) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    acknowledge_version(
        &app,
        std::path::Path::new(STORE_FILE),
        &app.package_info().version,
    )
}

/// 显式保存最高已读版本；测试使用临时路径，避免污染真实应用数据。
///
/// app 为 Store 宿主，path 为记录路径，current 为运行版本；失败时返回存储错误。
fn acknowledge_version<R: Runtime>(
    app: &AppHandle<R>,
    path: &std::path::Path,
    current: &Version,
) -> Result<(), String> {
    let store = app
        .store(path)
        .map_err(|e| format!("打开日志记录失败：{e}"))?;
    let previous = store.get(SEEN_KEY).and_then(|value| {
        value
            .as_str()
            .and_then(|version| Version::parse(version).ok())
    });
    if previous.is_some_and(|version| &version >= current) {
        return Ok(());
    }
    store.set(SEEN_KEY, serde_json::json!(current.to_string()));
    store
        .save()
        .map_err(|e| format!("保存日志已读版本失败：{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const VERSIONS: &str = r#"[{"version":"1.10.0"},{"version":"1.3.0"},{"version":"1.2.1"},{"version":"1.2.0"},{"version":"1.0.1"},{"version":"1.0.0"}]"#;

    #[test]
    fn skipped_versions_are_included_but_previous_and_future_versions_are_not() {
        let launch = resolve_launch("1.3.0", Some("1.0.0"), true, None, VERSIONS).unwrap();
        assert_eq!(launch.update_versions, ["1.3.0", "1.2.1", "1.2.0", "1.0.1"]);
        assert!(!launch.history_versions.contains(&"1.10.0".into()));
        let launch = resolve_launch("1.10.0", Some("1.3.0"), true, None, VERSIONS).unwrap();
        assert_eq!(launch.update_versions, ["1.10.0"]);
    }

    #[test]
    fn first_install_and_repeated_launch_are_quiet() {
        assert!(resolve_launch("1.3.0", None, false, None, VERSIONS)
            .unwrap()
            .update_versions
            .is_empty());
        assert!(resolve_launch("1.3.0", Some("1.3.0"), true, None, VERSIONS)
            .unwrap()
            .update_versions
            .is_empty());
    }

    #[test]
    fn unknown_legacy_and_corrupt_marker_show_only_current_version() {
        for seen in [None, Some("broken")] {
            assert_eq!(
                resolve_launch("1.3.0", seen, true, None, VERSIONS)
                    .unwrap()
                    .update_versions,
                ["1.3.0"]
            );
        }
    }

    #[test]
    fn applied_receipt_identifies_legacy_upgrade_but_stale_receipt_does_not() {
        let mut receipt = InstallReceipt {
            from_version: "1.0.0".into(),
            target_version: "1.3.0".into(),
            executable_path: String::new(),
            attempted_at: 0,
            outcome: "applied".into(),
        };
        assert_eq!(
            resolve_launch("1.3.0", None, true, Some(&receipt), VERSIONS)
                .unwrap()
                .update_versions
                .len(),
            4
        );
        receipt.target_version = "1.2.1".into();
        assert_eq!(
            resolve_launch("1.3.0", None, true, Some(&receipt), VERSIONS)
                .unwrap()
                .update_versions,
            ["1.3.0"]
        );
    }

    #[test]
    fn downgrade_and_return_to_seen_version_do_not_repeat_notice() {
        for current in ["1.2.1", "1.3.0"] {
            assert!(resolve_launch(current, Some("1.3.0"), true, None, VERSIONS)
                .unwrap()
                .update_versions
                .is_empty());
        }
    }

    #[test]
    fn seen_version_is_saved_to_disk_and_downgrade_does_not_replace_it() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("release-notes.json");
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_store::Builder::new().build())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        acknowledge_version(app.handle(), &path, &Version::parse("1.3.0").unwrap()).unwrap();
        acknowledge_version(app.handle(), &path, &Version::parse("1.2.0").unwrap()).unwrap();
        let saved: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(saved[SEEN_KEY], "1.3.0");
        assert!(
            resolve_launch("1.3.0", saved[SEEN_KEY].as_str(), true, None, VERSIONS)
                .unwrap()
                .update_versions
                .is_empty()
        );
    }
}
