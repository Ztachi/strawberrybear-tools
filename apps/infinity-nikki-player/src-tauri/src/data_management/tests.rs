//! 用隔离临时目录验证真实归档、恢复事务和失败回滚，不访问用户资料。

use super::*;
use std::io::Cursor;
use tauri::test::{mock_builder, mock_context, noop_assets};
use tempfile::tempdir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

const MIDI: &[u8] = b"MThd\0\0\0\x06\0\0\0\x01\x01\xe0MTrk\0\0\0\x04\0\xff\x2f\0";

fn template() -> serde_json::Value {
    serde_json::json!({ "id": "custom-one", "name": "测试模板", "is_builtin": false, "mappings": [] })
}

fn drafts() -> HashMap<String, String> {
    HashMap::from([(
        "infinity-nikki-player.template-draft.create".into(),
        template().to_string(),
    )])
}

fn put(root: &Path, path: &str, bytes: &[u8]) {
    let path = root.join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}

fn populate(root: &Path) {
    put(root, "midi_library/歌曲.mid", MIDI);
    let config = crate::commands::midi::MidiConfig {
        filename: "歌曲.mid".into(),
        title: Some("保留标题".into()),
        disabled_tracks: vec![1],
        added_at: Some(123),
        ..Default::default()
    };
    put(
        root,
        "midi_library/歌曲.mid.midi-config",
        &serde_json::to_vec(&config).unwrap(),
    );
    put(root, "song_lists/list-one.json", &serde_json::to_vec(&serde_json::json!({ "id": "list-one", "name": "歌单", "description": "说明", "cover_filename": "list-one.png", "song_filenames": ["歌曲.mid"], "created_at": 1, "updated_at": 2 })).unwrap());
    put(root, "song_list_covers/list-one.png", "封面".as_bytes());
    put(
        root,
        "templates/custom-one.json",
        &serde_json::to_vec(&template()).unwrap(),
    );
    put(root, "templates/.defaults_seeded", b"seeded");
    let project = serde_json::json!({ "schemaVersion": 1, "id": "project-one", "name": "工程", "createdAt": 11, "updatedAt": 22, "document": {}, "extensions": { "keyboardRecording": { "template": template() } } });
    put(
        root,
        "midi_projects/project-one.json",
        &serde_json::to_vec(&project).unwrap(),
    );
    put(
        root,
        "midi_projects/drafts/edit-project-one.json",
        &serde_json::to_vec(&project).unwrap(),
    );
    put(root, "settings.json", "不可上传的设备设置".as_bytes());
    put(root, "cloud-sync.json", "不可上传的凭据".as_bytes());
    put(root, "updater-state.json", "本机安装记录".as_bytes());
}

#[test]
fn local_and_cloud_archives_preserve_identity_and_exclude_device_data() {
    let root = tempdir().unwrap();
    populate(root.path());
    let (local, summary) = archive::build(
        root.path(),
        "1.3.3",
        "测试电脑",
        SnapshotKind::Local,
        drafts(),
    )
    .unwrap();
    let unpacked = archive::read(&local, false).unwrap();
    assert_eq!(summary, unpacked.summary);
    assert_eq!(
        summary.counts,
        SnapshotCounts {
            midi: 1,
            song_lists: 1,
            templates: 1,
            projects: 1,
            drafts: 2
        }
    );
    assert_eq!(unpacked.drafts, drafts());
    assert!(unpacked.files.contains_key("templates/.defaults_seeded"));
    assert!(unpacked
        .files
        .contains_key("midi_projects/drafts/edit-project-one.json"));
    assert_eq!(unpacked.files["midi_library/歌曲.mid"], MIDI);
    for name in ["settings.json", "cloud-sync.json", "updater-state.json"] {
        assert!(!unpacked.files.contains_key(name));
    }
    let (cloud, summary) = archive::build(
        root.path(),
        "1.3.3",
        "测试电脑",
        SnapshotKind::Cloud,
        HashMap::new(),
    )
    .unwrap();
    assert_eq!(summary.counts.drafts, 0);
    let unpacked = archive::read(&cloud, true).unwrap();
    assert!(unpacked.drafts.is_empty());
    assert!(!unpacked.files.keys().any(|path| path.contains("drafts")));
    assert!(archive::read(&local, true).is_err());
}

#[test]
fn draft_whitelist_rejects_private_storage_and_invalid_values() {
    assert!(archive::validate_template_drafts(&HashMap::from([(
        "设备身份".into(),
        template().to_string()
    )]))
    .is_err());
    assert!(archive::validate_template_drafts(&HashMap::from([(
        "infinity-nikki-player.template-draft.edit.".into(),
        template().to_string()
    )]))
    .is_err());
    assert!(archive::validate_template_drafts(&HashMap::from([(
        "infinity-nikki-player.template-draft.create".into(),
        "[]".into()
    )]))
    .is_err());
    assert!(archive::validate_template_drafts(&drafts()).is_ok());
    let mut incomplete = template();
    incomplete["name"] = "".into();
    assert!(archive::validate_template_drafts(&HashMap::from([(
        "infinity-nikki-player.template-draft.create".into(),
        incomplete.to_string()
    )]))
    .is_ok());
}

#[test]
fn malicious_archive_paths_and_unlisted_files_are_rejected() {
    for path in [
        "content/../settings.json",
        "content/midi_projects/../settings.json",
        "content\\templates\\one.json",
        "content/settings.json",
        "/absolute.json",
    ] {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file(path, SimpleFileOptions::default()).unwrap();
        zip.write_all(b"{}").unwrap();
        let bytes = zip.finish().unwrap().into_inner();
        assert!(archive::read(&bytes, false).is_err(), "拒绝路径：{path}");
    }
}

#[test]
fn backup_retention_removes_old_archives_only_after_new_backup_is_saved() {
    let root = tempdir().unwrap();
    populate(root.path());
    let mut first = create_backup_at(root.path(), "1.3.3", drafts(), 2).unwrap();
    first.created_at = 1;
    write_json(
        &root
            .path()
            .join(BACKUP_DIR)
            .join(format!("{}.json", first.id)),
        &first,
    )
    .unwrap();
    let mut second = create_backup_at(root.path(), "1.3.3", drafts(), 2).unwrap();
    second.created_at = 2;
    write_json(
        &root
            .path()
            .join(BACKUP_DIR)
            .join(format!("{}.json", second.id)),
        &second,
    )
    .unwrap();
    let third = create_backup_at(root.path(), "1.3.3", drafts(), 2).unwrap();
    let backups = list_backups_at(root.path()).unwrap();
    assert_eq!(backups.len(), 2);
    assert_eq!(backups[0].id, third.id);
    assert_eq!(backups[1].id, second.id);
    assert!(!root
        .path()
        .join(BACKUP_DIR)
        .join(format!("{}.zip", first.id))
        .exists());
    assert!(delete_backup_at(root.path(), "../settings").is_err());
}

fn empty_stage(root: &Path) -> PathBuf {
    let stage = root.join(".data-staging/new");
    for name in CONTENT_DIRS {
        fs::create_dir_all(stage.join("content").join(name)).unwrap();
    }
    stage
}

#[test]
fn complete_restore_replaces_saved_data_and_activity_drafts_together() {
    let root = tempdir().unwrap();
    let config = tempdir().unwrap();
    populate(root.path());
    let stage = empty_stage(root.path());
    put(
        &stage.join("content"),
        "templates/new.json",
        "新内容".as_bytes(),
    );
    apply_transaction(
        config.path(),
        root.path(),
        &stage,
        CONTENT_DIRS.iter().map(|name| name.to_string()).collect(),
        &HashMap::new(),
        None,
    )
    .unwrap();
    assert!(!root.path().join("templates/custom-one.json").exists());
    assert_eq!(
        fs::read(root.path().join("templates/new.json")).unwrap(),
        "新内容".as_bytes()
    );
    assert!(!root
        .path()
        .join("midi_projects/drafts/edit-project-one.json")
        .exists());
    assert_eq!(
        fs::read(root.path().join("settings.json")).unwrap(),
        "不可上传的设备设置".as_bytes()
    );
    assert_eq!(
        fs::read(config.path().join(PENDING_DRAFTS_FILE)).unwrap(),
        b"{}"
    );
    assert!(!config.path().join(TRANSACTION_FILE).exists());
}

#[test]
fn failed_directory_commit_rolls_back_every_already_replaced_directory() {
    let root = tempdir().unwrap();
    let config = tempdir().unwrap();
    populate(root.path());
    write_json(&config.path().join(PENDING_DRAFTS_FILE), &drafts()).unwrap();
    let original_pending = fs::read(config.path().join(PENDING_DRAFTS_FILE)).unwrap();
    let stage = empty_stage(root.path());
    fs::remove_dir_all(stage.join("content/midi_projects")).unwrap();
    assert!(apply_transaction(
        config.path(),
        root.path(),
        &stage,
        CONTENT_DIRS.iter().map(|name| name.to_string()).collect(),
        &HashMap::new(),
        None
    )
    .is_err());
    assert_eq!(
        fs::read(root.path().join("midi_library/歌曲.mid")).unwrap(),
        MIDI
    );
    assert!(root.path().join("templates/custom-one.json").exists());
    assert!(root
        .path()
        .join("midi_projects/drafts/edit-project-one.json")
        .exists());
    assert_eq!(
        fs::read(config.path().join(PENDING_DRAFTS_FILE)).unwrap(),
        original_pending
    );
}

#[test]
fn interrupted_restore_recovers_pointer_and_pending_drafts_before_startup() {
    let root = tempdir().unwrap();
    let config = tempdir().unwrap();
    let original_pending = serde_json::to_vec(&drafts()).unwrap();
    let original_pointer = serde_json::to_vec(&DataPointer {
        path: root.path().into(),
    })
    .unwrap();
    let stage = empty_stage(root.path());
    let rollback = root.path().join(".data-staging/rollback");
    put(&rollback, "templates/original.json", "旧内容".as_bytes());
    put(root.path(), "templates/replaced.json", "新内容".as_bytes());
    put(config.path(), PENDING_DRAFTS_FILE, b"{}");
    put(config.path(), POINTER_FILE, "错误的新指针".as_bytes());
    let transaction = RestoreTransaction {
        target: root.path().into(),
        stage,
        rollback,
        directories: vec!["templates".into(), "midi_library".into()],
        previous: vec!["templates".into()],
        pending_original: Some(original_pending.clone()),
        pointer_original: Some(original_pointer.clone()),
        update_pointer: true,
        committed: false,
    };
    write_json(&config.path().join(TRANSACTION_FILE), &transaction).unwrap();
    recover_transaction(config.path()).unwrap();
    assert!(root.path().join("templates/original.json").exists());
    assert!(!root.path().join("templates/replaced.json").exists());
    assert_eq!(
        fs::read(config.path().join(PENDING_DRAFTS_FILE)).unwrap(),
        original_pending
    );
    assert_eq!(
        fs::read(config.path().join(POINTER_FILE)).unwrap(),
        original_pointer
    );
}

#[test]
fn committed_journal_keeps_new_data_and_finishes_cleanup() {
    let root = tempdir().unwrap();
    let config = tempdir().unwrap();
    let stage = empty_stage(root.path());
    let rollback = root.path().join(".data-staging/rollback");
    put(&rollback, "templates/old.json", "旧内容".as_bytes());
    put(root.path(), "templates/new.json", "新内容".as_bytes());
    let transaction = RestoreTransaction {
        target: root.path().into(),
        stage,
        rollback,
        directories: vec!["templates".into()],
        previous: vec!["templates".into()],
        pending_original: None,
        pointer_original: None,
        update_pointer: false,
        committed: true,
    };
    write_json(&config.path().join(TRANSACTION_FILE), &transaction).unwrap();
    recover_transaction(config.path()).unwrap();
    assert_eq!(
        fs::read(root.path().join("templates/new.json")).unwrap(),
        "新内容".as_bytes()
    );
    assert!(!root.path().join("templates/old.json").exists());
}

#[test]
fn content_generation_excludes_drafts_and_frozen_state_rejects_old_writes() {
    let root = tempdir().unwrap();
    let state = Arc::new(DataManagement::new(
        root.path().into(),
        root.path().join(TRANSACTION_FILE),
    ));
    let app = mock_builder()
        .manage(state.clone())
        .build(mock_context(noop_assets()))
        .unwrap();
    with_data_write(app.handle(), true, || Ok(())).unwrap();
    assert_eq!(change_generation(app.handle()), 1);
    with_data_write(app.handle(), false, || Ok(())).unwrap();
    assert_eq!(change_generation(app.handle()), 1);
    state.frozen.store(true, Ordering::Release);
    assert!(with_data_write::<_, ()>(app.handle(), true, || {
        panic!("冻结后不应继续执行旧写入")
    })
    .is_err());
    assert_eq!(change_generation(app.handle()), 1);
}

#[test]
fn data_mutation_and_snapshot_share_one_lock() {
    let root = tempdir().unwrap();
    let state = Arc::new(DataManagement::new(
        root.path().into(),
        root.path().join(TRANSACTION_FILE),
    ));
    let app = mock_builder()
        .manage(state)
        .build(mock_context(noop_assets()))
        .unwrap();
    let handle = app.handle().clone();
    let (entered_tx, entered_rx) = std::sync::mpsc::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let writer = std::thread::spawn(move || {
        with_data_write(&handle, true, || {
            put(
                &data_dir(&handle)?,
                "templates/custom-one.json",
                &template().to_string().into_bytes(),
            );
            entered_tx.send(()).unwrap();
            release_rx.recv().unwrap();
            Ok(())
        })
    });
    entered_rx.recv().unwrap();
    let handle = app.handle().clone();
    let (snapshot_tx, snapshot_rx) = std::sync::mpsc::channel();
    let snapshot = std::thread::spawn(move || {
        snapshot_tx
            .send(build_cloud_snapshot_with_generation(&handle))
            .unwrap();
    });
    assert!(snapshot_rx.recv_timeout(Duration::from_millis(30)).is_err());
    release_tx.send(()).unwrap();
    writer.join().unwrap().unwrap();
    let (_, _, generation, _) = snapshot_rx.recv().unwrap().unwrap();
    assert_eq!(generation, 1);
    snapshot.join().unwrap();
}

#[test]
fn captured_bytes_stay_immutable_when_editing_continues_during_compression() {
    let root = tempdir().unwrap();
    populate(root.path());
    let captured = archive::capture(
        root.path(),
        "1.3.3",
        "测试电脑",
        SnapshotKind::Cloud,
        HashMap::new(),
    )
    .unwrap();
    fs::remove_file(root.path().join("templates/custom-one.json")).unwrap();
    let (bytes, _) = archive::encode(captured).unwrap();
    let contents = archive::read(&bytes, true).unwrap();
    assert!(contents.files.contains_key("templates/custom-one.json"));
}

#[test]
fn inaccessible_data_root_is_never_recreated_by_business_writes() {
    let root = tempdir().unwrap();
    let missing = root.path().join("已拔出的磁盘/资料");
    assert!(require_available_root(&missing)
        .unwrap_err()
        .contains("不会创建空资料库"));
    assert!(!missing.exists());
}

#[test]
fn migration_copies_backups_and_content_without_removing_source_or_system_settings() {
    let source = tempdir().unwrap();
    let target = tempdir().unwrap();
    let config = tempdir().unwrap();
    populate(source.path());
    create_backup_at(source.path(), "1.3.3", drafts(), 10).unwrap();
    let stage = target.path().join(".data-staging/migration");
    let directories: Vec<_> = CONTENT_DIRS
        .iter()
        .copied()
        .chain([BACKUP_DIR])
        .map(String::from)
        .collect();
    for name in &directories {
        copy_directory(&source.path().join(name), &stage.join("content").join(name)).unwrap();
    }
    apply_transaction(
        config.path(),
        target.path(),
        &stage,
        directories,
        &drafts(),
        Some(target.path()),
    )
    .unwrap();
    assert_eq!(
        fs::read(source.path().join("midi_library/歌曲.mid")).unwrap(),
        MIDI
    );
    assert_eq!(
        fs::read(target.path().join("midi_library/歌曲.mid")).unwrap(),
        MIDI
    );
    assert!(source.path().join("settings.json").exists());
    assert!(!target.path().join("settings.json").exists());
    assert_eq!(list_backups_at(source.path()).unwrap().len(), 1);
    assert_eq!(list_backups_at(target.path()).unwrap().len(), 1);
    assert_eq!(
        resolve_data_root(source.path(), config.path()).unwrap(),
        target.path()
    );
    let pending: HashMap<String, String> =
        serde_json::from_slice(&fs::read(config.path().join(PENDING_DRAFTS_FILE)).unwrap())
            .unwrap();
    assert_eq!(pending, drafts());
}

#[cfg(unix)]
#[test]
fn linked_content_directory_is_rejected_instead_of_copying_external_files() {
    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    put(outside.path(), "private.mid", MIDI);
    std::os::unix::fs::symlink(outside.path(), root.path().join("midi_library")).unwrap();
    assert!(archive::capture(
        root.path(),
        "1.3.3",
        "测试电脑",
        SnapshotKind::Local,
        HashMap::new()
    )
    .is_err());
}

#[test]
fn returning_to_default_preserves_its_old_library_and_backup_history() {
    let source = tempdir().unwrap();
    let target = tempdir().unwrap();
    let config = tempdir().unwrap();
    populate(source.path());
    populate(target.path());
    let mut old_template = template();
    old_template["name"] = "默认目录独有的旧模板".into();
    let old_bytes = serde_json::to_vec(&old_template).unwrap();
    put(target.path(), "templates/custom-one.json", &old_bytes);
    let historical = create_backup_at(target.path(), "1.3.3", drafts(), 10).unwrap();
    let historical_bytes = fs::read(
        target
            .path()
            .join(BACKUP_DIR)
            .join(format!("{}.zip", historical.id)),
    )
    .unwrap();
    let stage = target.path().join(".data-staging/return-default");
    let directories: Vec<String> = CONTENT_DIRS
        .iter()
        .copied()
        .chain([BACKUP_DIR])
        .map(String::from)
        .collect();
    for name in &directories {
        copy_directory(&source.path().join(name), &stage.join("content").join(name)).unwrap();
    }
    let safety =
        preserve_default_destination(target.path(), &stage.join("content"), "1.3.3").unwrap();
    apply_transaction(
        config.path(),
        target.path(),
        &stage,
        directories,
        &drafts(),
        Some(target.path()),
    )
    .unwrap();
    assert_eq!(
        fs::read(target.path().join("templates/custom-one.json")).unwrap(),
        serde_json::to_vec(&template()).unwrap()
    );
    let safety_bytes = fs::read(
        target
            .path()
            .join(BACKUP_DIR)
            .join(format!("{}.zip", safety.id)),
    )
    .unwrap();
    let restored = archive::read(&safety_bytes, false).unwrap();
    assert_eq!(restored.files["templates/custom-one.json"], old_bytes);
    assert_eq!(
        fs::read(
            target
                .path()
                .join(BACKUP_DIR)
                .join(format!("{}.zip", historical.id))
        )
        .unwrap(),
        historical_bytes
    );
    assert_eq!(list_backups_at(target.path()).unwrap().len(), 2);
}

#[test]
fn backup_merge_conflict_never_overwrites_either_copy() {
    let source = tempdir().unwrap();
    let staged = tempdir().unwrap();
    put(source.path(), "same.zip", b"old-backup");
    put(staged.path(), "same.zip", b"new-backup");
    assert!(copy_directory(source.path(), staged.path())
        .unwrap_err()
        .contains("同名冲突"));
    assert_eq!(
        fs::read(source.path().join("same.zip")).unwrap(),
        b"old-backup"
    );
    assert_eq!(
        fs::read(staged.path().join("same.zip")).unwrap(),
        b"new-backup"
    );
}

#[test]
fn archive_rejects_case_collisions_and_windows_device_names() {
    for names in [
        vec!["content/midi_library/A.mid", "content/midi_library/a.mid"],
        vec!["content/midi_library/CON.mid"],
        vec!["content/song_list_covers/LPT1.png"],
        vec!["content/midi_library/COM9.mid"],
    ] {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        for name in names {
            zip.start_file(name, SimpleFileOptions::default()).unwrap();
            zip.write_all(MIDI).unwrap();
        }
        let bytes = zip.finish().unwrap().into_inner();
        let error = archive::read(&bytes, false).err().unwrap();
        assert!(error.contains("重复路径") || error.contains("不允许恢复"));
    }
}

#[test]
fn cloud_fingerprint_is_stable_across_snapshot_times_and_ignores_local_drafts() {
    let root = tempdir().unwrap();
    populate(root.path());
    let first = archive::capture(
        root.path(),
        "1.3.3",
        "测试电脑",
        SnapshotKind::Cloud,
        HashMap::new(),
    )
    .unwrap();
    let expected = archive::content_fingerprint(&first);
    let mut later = archive::capture(
        root.path(),
        "1.3.4",
        "另一台电脑",
        SnapshotKind::Cloud,
        HashMap::new(),
    )
    .unwrap();
    later.summary.created_at += 10_000;
    assert_eq!(expected, archive::content_fingerprint(&later));
    put(root.path(), "midi_projects/drafts/new.json", b"{}");
    let draft_changed = archive::capture(
        root.path(),
        "1.3.3",
        "测试电脑",
        SnapshotKind::Cloud,
        HashMap::new(),
    )
    .unwrap();
    assert_eq!(expected, archive::content_fingerprint(&draft_changed));
    fs::remove_file(root.path().join("templates/custom-one.json")).unwrap();
    let changed = archive::capture(
        root.path(),
        "1.3.3",
        "测试电脑",
        SnapshotKind::Cloud,
        HashMap::new(),
    )
    .unwrap();
    assert_ne!(expected, archive::content_fingerprint(&changed));
}

#[test]
fn migration_verification_rejects_same_length_corruption_and_space_shortage() {
    let root = tempdir().unwrap();
    put(root.path(), "source.bin", &vec![42u8; 150_000]);
    let mut bad = vec![42u8; 150_000];
    bad[100_000] = 0;
    put(root.path(), "copied.bin", &bad);
    assert!(!files_equal(
        &root.path().join("source.bin"),
        &root.path().join("copied.bin")
    )
    .unwrap());
    fs::copy(
        root.path().join("source.bin"),
        root.path().join("copied.bin"),
    )
    .unwrap();
    assert!(files_equal(
        &root.path().join("source.bin"),
        &root.path().join("copied.bin")
    )
    .unwrap());
    assert!(require_space(1024, 2048, root.path())
        .unwrap_err()
        .contains("空间不足"));
    assert!(require_space(2048, 2048, root.path()).is_ok());
}

#[test]
fn rollback_failure_freezes_new_writes_even_if_memory_flag_is_reset() {
    let root = tempdir().unwrap();
    let config = tempdir().unwrap();
    populate(root.path());
    let state = Arc::new(DataManagement::new(
        root.path().into(),
        config.path().join(TRANSACTION_FILE),
    ));
    let app = mock_builder()
        .manage(state.clone())
        .build(mock_context(noop_assets()))
        .unwrap();
    let stage = root.path().join(".data-staging/broken");
    // 模拟暂存内容被外部改成文件；下一目录缺失触发提交失败，回滚目录时再发生真实错误。
    put(&stage, "content/midi_library", b"not a directory");
    let failure = with_data_write(app.handle(), false, || {
        apply_transaction(
            config.path(),
            root.path(),
            &stage,
            vec!["midi_library".into(), "templates".into()],
            &HashMap::new(),
            None,
        )
    })
    .unwrap_err();
    assert!(failure.contains("自动回滚失败"));
    assert!(config.path().join(TRANSACTION_FILE).exists());
    assert!(data_operation_requires_restart(app.handle()));
    assert!(state.frozen.load(Ordering::Acquire));
    state.frozen.store(false, Ordering::Release);
    let write = with_data_write(app.handle(), true, || {
        put(root.path(), "midi_projects/new-after-failure.json", b"{}");
        Ok(())
    });
    assert!(write.is_err());
    assert!(!root
        .path()
        .join("midi_projects/new-after-failure.json")
        .exists());
    // 修复阻塞条件后，下一次启动恢复仍可找回原资料；运行中的界面继续保持锁定。
    fs::remove_file(root.path().join("midi_library")).unwrap();
    recover_transaction(config.path()).unwrap();
    assert_eq!(
        fs::read(root.path().join("midi_library/歌曲.mid")).unwrap(),
        MIDI
    );
    assert!(root.path().join("templates/custom-one.json").exists());
    assert!(data_operation_requires_restart(app.handle()));
}

#[test]
fn opening_an_unavailable_data_location_never_creates_an_empty_library() {
    let root = tempdir().unwrap();
    let missing = root.path().join("offline-data");
    assert!(ensure_location_exists(&missing, "data").is_err());
    assert!(!missing.exists());
    let cache = root.path().join("cache");
    ensure_location_exists(&cache, "cache").unwrap();
    assert!(cache.is_dir());
}

#[test]
fn frozen_binary_export_cannot_overwrite_restored_library_files() {
    let root = tempdir().unwrap();
    let state = Arc::new(DataManagement::new(
        root.path().into(),
        root.path().join(TRANSACTION_FILE),
    ));
    let app = mock_builder()
        .manage(state.clone())
        .build(mock_context(noop_assets()))
        .unwrap();
    put(root.path(), "midi_library/song.mid", MIDI);
    state.frozen.store(true, Ordering::Release);
    let result = crate::commands::midi_projects::save_binary_file(
        app.handle().clone(),
        root.path()
            .join("midi_library/song.mid")
            .to_string_lossy()
            .into(),
        b"old editor bytes".to_vec(),
    );
    assert!(result.is_err());
    assert_eq!(
        fs::read(root.path().join("midi_library/song.mid")).unwrap(),
        MIDI
    );
    assert_eq!(change_generation(app.handle()), 0);
}
