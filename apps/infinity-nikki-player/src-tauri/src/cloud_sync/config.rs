//! 云同步配置与系统凭据分离保存，配置写入失败时保留旧凭据引用。

use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

const SERVICE: &str = "com.strawberrybear.infinity-nikki-player.cloud-sync";
pub const DEFAULT_ROOT: &str = "infinity-nikki-player-sync";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Webdav,
    S3,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WebdavConfig {
    pub preset: String,
    pub base_url: String,
    pub username: String,
    pub remote_root: String,
    pub profile: String,
    pub has_password: bool,
}

impl Default for WebdavConfig {
    fn default() -> Self {
        Self {
            preset: "custom".into(),
            base_url: String::new(),
            username: String::new(),
            remote_root: DEFAULT_ROOT.into(),
            profile: "default".into(),
            has_password: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct S3Config {
    pub preset: String,
    pub region: String,
    pub bucket: String,
    pub access_key_id: String,
    pub endpoint: String,
    pub remote_root: String,
    pub profile: String,
    pub has_secret_key: bool,
}

impl Default for S3Config {
    fn default() -> Self {
        Self {
            preset: "aws-s3".into(),
            region: String::new(),
            bucket: String::new(),
            access_key_id: String::new(),
            endpoint: String::new(),
            remote_root: DEFAULT_ROOT.into(),
            profile: "default".into(),
            has_secret_key: false,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CloudSyncConfig {
    pub provider: Provider,
    pub enabled: bool,
    pub auto_upload: bool,
    pub webdav: WebdavConfig,
    pub s3: S3Config,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SecretAction {
    #[default]
    Keep,
    Replace,
    Clear,
}

/// 明确区分保留、替换和清除，空白输入不会意外删除已保存密码。
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretUpdate {
    pub action: SecretAction,
    pub value: Option<String>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct StoredConfig {
    pub config: CloudSyncConfig,
    pub password_id: Option<String>,
    pub secret_key_id: Option<String>,
    pub last_sync_at: Option<u64>,
    pub last_error: Option<String>,
}

pub(super) trait CredentialStore: Send + Sync {
    fn get(&self, id: &str) -> Result<String, String>;
    fn set(&self, id: &str, value: &str) -> Result<(), String>;
    fn delete(&self, id: &str) -> Result<(), String>;
}

pub(super) struct SystemCredentials;

impl CredentialStore for SystemCredentials {
    fn get(&self, id: &str) -> Result<String, String> {
        keyring::Entry::new(SERVICE, id)
            .and_then(|entry| entry.get_password())
            .map_err(|_| "无法读取系统凭据，请解锁系统钥匙串或重新填写密码".into())
    }

    fn set(&self, id: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, id)
            .and_then(|entry| entry.set_password(value))
            .map_err(|_| "无法保存系统凭据，请检查系统钥匙串权限".into())
    }

    fn delete(&self, id: &str) -> Result<(), String> {
        match keyring::Entry::new(SERVICE, id).and_then(|entry| entry.delete_credential()) {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("无法清理旧系统凭据".into()),
        }
    }
}

impl StoredConfig {
    pub fn public_config(&self) -> CloudSyncConfig {
        let mut config = self.config.clone();
        config.webdav.has_password = self.password_id.is_some();
        config.s3.has_secret_key = self.secret_key_id.is_some();
        config
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        match fs::read(path) {
            Ok(bytes) => {
                serde_json::from_slice(&bytes).map_err(|_| "云同步配置损坏，请检查配置文件".into())
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(_) => Err("读取云同步配置失败".into()),
        }
    }
}

pub(super) fn atomic_save(path: &Path, stored: &StoredConfig) -> Result<(), String> {
    let parent = path.parent().ok_or("云同步配置目录无效")?;
    fs::create_dir_all(parent).map_err(|_| "创建云同步配置目录失败")?;
    let temporary = parent.join(format!(".cloud-sync-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        use std::io::Write;
        let bytes = serde_json::to_vec_pretty(stored).map_err(|_| "序列化云同步配置失败")?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "创建云同步配置文件失败")?;
        file.write_all(&bytes).map_err(|_| "写入云同步配置失败")?;
        file.sync_all().map_err(|_| "保存云同步配置失败")?;
        fs::rename(&temporary, path).map_err(|_| "替换云同步配置失败")?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

/// 先创建新凭据，再提交配置引用；提交失败只删除新条目，不修改旧条目。
pub(super) fn save_transaction(
    path: &Path,
    old: &StoredConfig,
    config: CloudSyncConfig,
    password: &SecretUpdate,
    secret_key: &SecretUpdate,
    credentials: &dyn CredentialStore,
) -> Result<StoredConfig, String> {
    let config = normalize(config)?;
    if config.enabled {
        validate_active(&config)?;
    }
    let mut next = old.clone();
    next.config = config;
    next.last_error = None;
    let mut created = Vec::new();
    let result = (|| {
        next.password_id = stage_secret(&old.password_id, password, credentials, &mut created)?;
        next.secret_key_id =
            stage_secret(&old.secret_key_id, secret_key, credentials, &mut created)?;
        if next.config.enabled {
            let present = match next.config.provider {
                Provider::Webdav => next.password_id.is_some(),
                Provider::S3 => next.secret_key_id.is_some(),
            };
            if !present {
                return Err("请填写云同步密码或访问密钥".into());
            }
        }
        next.config.webdav.has_password = next.password_id.is_some();
        next.config.s3.has_secret_key = next.secret_key_id.is_some();
        atomic_save(path, &next)?;
        Ok(())
    })();
    if let Err(error) = result {
        for id in created {
            let _ = credentials.delete(&id);
        }
        return Err(error);
    }
    for (previous, current) in [
        (&old.password_id, &next.password_id),
        (&old.secret_key_id, &next.secret_key_id),
    ] {
        if previous != current {
            if let Some(id) = previous {
                if credentials.delete(id).is_err() {
                    log::warn!("云同步旧凭据未能清理");
                }
            }
        }
    }
    Ok(next)
}

fn stage_secret(
    old: &Option<String>,
    update: &SecretUpdate,
    credentials: &dyn CredentialStore,
    created: &mut Vec<String>,
) -> Result<Option<String>, String> {
    match update.action {
        SecretAction::Keep => Ok(old.clone()),
        SecretAction::Clear => Ok(None),
        SecretAction::Replace => {
            let value = update
                .value
                .as_deref()
                .filter(|value| !value.is_empty())
                .ok_or("密码或访问密钥不能为空")?;
            let id = uuid::Uuid::new_v4().to_string();
            credentials.set(&id, value)?;
            created.push(id.clone());
            Ok(Some(id))
        }
    }
}

pub(super) fn resolve_secret(
    reference: &Option<String>,
    update: &SecretUpdate,
    credentials: &dyn CredentialStore,
) -> Result<String, String> {
    match update.action {
        SecretAction::Keep => reference
            .as_deref()
            .ok_or_else(|| "请填写密码或访问密钥".to_owned())
            .and_then(|id| credentials.get(id)),
        SecretAction::Clear => Err("请填写密码或访问密钥".into()),
        SecretAction::Replace => update
            .value
            .clone()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "密码或访问密钥不能为空".into()),
    }
}

pub(super) fn normalize(mut config: CloudSyncConfig) -> Result<CloudSyncConfig, String> {
    config.webdav.base_url = config.webdav.base_url.trim().to_owned();
    config.webdav.username = config.webdav.username.trim().to_owned();
    config.s3.region = config.s3.region.trim().to_owned();
    config.s3.bucket = config.s3.bucket.trim().to_owned();
    config.s3.access_key_id = config.s3.access_key_id.trim().to_owned();
    config.s3.endpoint = config.s3.endpoint.trim().to_owned();
    for (root, profile) in [
        (&mut config.webdav.remote_root, &mut config.webdav.profile),
        (&mut config.s3.remote_root, &mut config.s3.profile),
    ] {
        *root = root.trim().trim_matches('/').to_owned();
        *profile = profile.trim().to_owned();
        if root.is_empty() {
            *root = DEFAULT_ROOT.into();
        }
        if profile.is_empty() {
            *profile = "default".into();
        }
        validate_path(root, true)?;
        validate_path(profile, false)?;
    }
    if !config.enabled {
        config.auto_upload = false;
    }
    Ok(config)
}

pub(super) fn validate_active(config: &CloudSyncConfig) -> Result<(), String> {
    match config.provider {
        Provider::Webdav => {
            validate_url(&config.webdav.base_url)?;
            if config.webdav.username.is_empty() {
                return Err("WebDAV 账号不能为空".into());
            }
        }
        Provider::S3 => {
            if config.s3.region.is_empty()
                || config.s3.bucket.is_empty()
                || config.s3.access_key_id.is_empty()
            {
                return Err("请填写 S3 区域、存储桶和访问密钥标识".into());
            }
            if !config.s3.endpoint.is_empty() {
                validate_url(&config.s3.endpoint)?;
            }
        }
    }
    Ok(())
}

pub(super) fn validate_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "云服务地址无效")?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("请填写不含账号、密码、查询参数的 HTTP 或 HTTPS 地址".into());
    }
    Ok(url)
}

fn validate_path(value: &str, nested: bool) -> Result<(), String> {
    if value.len() > 512
        || value.contains('\\')
        || value.chars().any(char::is_control)
        || (!nested && value.contains('/'))
        || value
            .split('/')
            .any(|part| part.is_empty() || matches!(part, "." | ".."))
    {
        return Err("远端目录或配置名称无效，请勿包含空路径、反斜杠或上级目录".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashMap, sync::Mutex};
    #[derive(Default)]
    struct MemoryCredentials(Mutex<HashMap<String, String>>);
    impl CredentialStore for MemoryCredentials {
        fn get(&self, id: &str) -> Result<String, String> {
            self.0
                .lock()
                .unwrap()
                .get(id)
                .cloned()
                .ok_or("凭据不存在".into())
        }
        fn set(&self, id: &str, value: &str) -> Result<(), String> {
            self.0.lock().unwrap().insert(id.into(), value.into());
            Ok(())
        }
        fn delete(&self, id: &str) -> Result<(), String> {
            self.0.lock().unwrap().remove(id);
            Ok(())
        }
    }
    fn replace(value: &str) -> SecretUpdate {
        SecretUpdate {
            action: SecretAction::Replace,
            value: Some(value.into()),
        }
    }

    #[test]
    fn secret_is_never_serialized_and_keep_replace_clear_are_explicit() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cloud-sync.json");
        let credentials = MemoryCredentials::default();
        let old = StoredConfig::default();
        let saved = save_transaction(
            &path,
            &old,
            old.config.clone(),
            &replace("私有密码"),
            &SecretUpdate::default(),
            &credentials,
        )
        .unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains("私有密码"));
        assert!(saved.public_config().webdav.has_password);
        let kept = save_transaction(
            &path,
            &saved,
            saved.config.clone(),
            &SecretUpdate::default(),
            &SecretUpdate::default(),
            &credentials,
        )
        .unwrap();
        assert_eq!(kept.password_id, saved.password_id);
        let replaced = save_transaction(
            &path,
            &kept,
            kept.config.clone(),
            &replace("新密码"),
            &SecretUpdate::default(),
            &credentials,
        )
        .unwrap();
        assert!(!credentials
            .0
            .lock()
            .unwrap()
            .contains_key(saved.password_id.as_ref().unwrap()));
        let cleared = save_transaction(
            &path,
            &replaced,
            replaced.config.clone(),
            &SecretUpdate {
                action: SecretAction::Clear,
                value: None,
            },
            &SecretUpdate::default(),
            &credentials,
        )
        .unwrap();
        assert!(!cleared.public_config().webdav.has_password);
        assert!(credentials.0.lock().unwrap().is_empty());
    }

    #[test]
    fn failed_config_commit_keeps_old_credentials_and_removes_staged_entries() {
        let dir = tempfile::tempdir().unwrap();
        let credentials = MemoryCredentials::default();
        credentials.set("old", "原密码").unwrap();
        let old = StoredConfig {
            password_id: Some("old".into()),
            ..Default::default()
        };
        assert!(save_transaction(
            dir.path(),
            &old,
            old.config.clone(),
            &replace("新密码"),
            &SecretUpdate::default(),
            &credentials
        )
        .is_err());
        assert_eq!(credentials.0.lock().unwrap().len(), 1);
        assert_eq!(credentials.get("old").unwrap(), "原密码");
    }

    #[test]
    fn normalizes_defaults_and_rejects_traversal_or_credential_urls() {
        let mut config = CloudSyncConfig::default();
        config.webdav.remote_root.clear();
        assert_eq!(
            normalize(config.clone()).unwrap().webdav.remote_root,
            DEFAULT_ROOT
        );
        config.webdav.profile = "../错误".into();
        assert!(normalize(config).is_err());
        assert!(validate_url("https://user:password@example.com/").is_err());
        assert!(validate_url("https://example.com/?token=secret").is_err());
        assert!(validate_url("https://example.com/dav/").is_ok());
    }
}
