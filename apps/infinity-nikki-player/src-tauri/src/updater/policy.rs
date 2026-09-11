//! 更新源、版本选择与重试策略；不包含文件替换或签名算法。

use semver::Version;
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri_plugin_updater::{Error, Update};

pub const RELEASE_ROOT: &str = "https://github.com/Ztachi/strawberrybear-tools/releases";
pub const PROXY_PREFIX: &str = "https://gh-proxy.com/";
pub const CHECK_TIMEOUT: Duration = Duration::from_secs(8);
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
pub const READ_TIMEOUT: Duration = Duration::from_secs(30);
pub const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(30 * 60);
pub const RETRY_DELAY: Duration = Duration::from_secs(2);
pub const RESUME_COOLDOWN_MS: u64 = 5 * 60 * 1000;
pub const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

/// 标识清单或下载线路；检查结果按版本选择，下载顺序始终独立地保持代理优先。
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    Mirror,
    Github,
}

impl Source {
    /// 返回播放器专属的固定清单入口。
    pub fn endpoint(self) -> String {
        match self {
            Self::Mirror => format!("{PROXY_PREFIX}{RELEASE_ROOT}/download/infinity-nikki-player-updates/latest-cn.json"),
            Self::Github => format!("{RELEASE_ROOT}/download/infinity-nikki-player-updates/latest.json"),
        }
    }
}

/// 原生层错误契约；界面根据 code 翻译，具体原因保留在本地日志。
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateError {
    pub stage: String,
    pub code: String,
    pub message: String,
    pub source: Option<Source>,
}

impl UpdateError {
    /// 将底层错误转换成可稳定消费的分类。
    pub fn new(stage: &str, code: &str, message: impl ToString, source: Option<Source>) -> Self {
        Self {
            stage: stage.into(),
            code: code.into(),
            message: message.to_string(),
            source,
        }
    }

    /// 只对网络错误重试；签名、格式及本地安装错误不能盲目重试。
    pub fn from_plugin(stage: &str, error: &Error, source: Source) -> Self {
        let code = match error {
            Error::Reqwest(e) if e.is_timeout() => "timeout",
            // 下载正文截断也可能被 Reqwest 标为 decode；只有清单阶段按解析错误处理。
            Error::Reqwest(e) if stage == "check" && e.is_decode() => "invalidManifest",
            Error::Reqwest(_) | Error::Network(_) => "network",
            Error::Minisign(_) | Error::Base64(_) | Error::SignatureUtf8(_) => "signature",
            Error::TargetNotFound(_)
            | Error::TargetsNotFound(_)
            | Error::UnsupportedArch
            | Error::UnsupportedOs => "unsupportedPlatform",
            Error::Serialization(_) | Error::Semver(_) | Error::ReleaseNotFound => {
                "invalidManifest"
            }
            _ => "operationFailed",
        };
        let phase = if stage == "check" { "检查" } else { "下载" };
        Self::new(
            stage,
            code,
            format!("更新{phase}阶段失败：{error}"),
            Some(source),
        )
    }

    pub fn retryable(&self) -> bool {
        matches!(self.code.as_str(), "network" | "timeout")
    }
}

/// 两个来源独立检查后按版本排序；有效的无更新结果也是一次成功检查。
pub fn select_update(
    results: Vec<Result<Option<Update>, UpdateError>>,
) -> Result<Option<Update>, UpdateError> {
    let mut any_valid = false;
    let mut selected: Option<(Version, Update)> = None;
    let mut failure = UpdateError::new("check", "network", "所有更新源均不可用", None);
    for result in results {
        match result {
            Ok(update) => {
                if let Some(update) = update {
                    let version = match Version::parse(&update.version) {
                        Ok(version) => version,
                        Err(error) => {
                            failure = UpdateError::new("check", "invalidManifest", error, None);
                            continue;
                        }
                    };
                    if selected
                        .as_ref()
                        .is_none_or(|(current, _)| version > *current)
                    {
                        selected = Some((version, update));
                    }
                }
                any_valid = true;
            }
            Err(error) => {
                log::warn!("更新源检查失败：{}", error.message);
                failure = error;
            }
        }
    }
    if any_valid {
        Ok(selected.map(|(_, update)| update))
    } else {
        Err(failure)
    }
}

/// 只允许同一仓库、同一版本 tag 的资产换源，避免使用过期清单中的另一份安装包。
pub fn download_urls(url: &str, version: &str) -> Result<[String; 2], UpdateError> {
    let original = url.strip_prefix(PROXY_PREFIX).unwrap_or(url);
    let parsed = reqwest::Url::parse(original)
        .map_err(|e| UpdateError::new("check", "invalidManifest", e, None))?;
    let expected =
        format!("/Ztachi/strawberrybear-tools/releases/download/infinity-nikki-player@v{version}/");
    // GitHub 官方 action 会编码 tag 中的 @；不能对整个 URL 随意做字符串替换。
    let path = parsed.path().replace("%40", "@");
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !path.starts_with(&expected)
        || path[expected.len()..].is_empty()
        || path[expected.len()..].contains('/')
    {
        return Err(UpdateError::new(
            "check",
            "invalidManifest",
            "更新包地址与应用版本不匹配",
            None,
        ));
    }
    Ok([format!("{PROXY_PREFIX}{original}"), original.into()])
}

/// 使用真实应用版本核对上次安装；更高版本也意味着升级已经生效。
pub fn installation_applied(current: &str, target: &str) -> bool {
    match (Version::parse(current), Version::parse(target)) {
        (Ok(current), Ok(target)) => current >= target,
        _ => false,
    }
}

/// 毫秒时间戳只用于日志和节流，不参与版本比较。
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_switch_keeps_exact_version_and_asset() {
        let original = format!("{RELEASE_ROOT}/download/infinity-nikki-player%40v1.2.3/app.exe");
        assert_eq!(
            download_urls(&format!("{PROXY_PREFIX}{original}"), "1.2.3").unwrap(),
            [format!("{PROXY_PREFIX}{original}"), original]
        );
        for bad in [
            format!("{RELEASE_ROOT}/download/infinity-nikki-player@v1.2.2/app.exe"),
            "https://example.com/app.exe".into(),
            format!("{RELEASE_ROOT}/latest/download/app.exe"),
        ] {
            assert!(download_urls(&bad, "1.2.3").is_err());
        }
    }

    #[test]
    fn failure_is_not_reported_as_latest() {
        assert!(select_update(vec![Err(UpdateError::new(
            "check", "network", "断网", None
        ))])
        .is_err());
        assert!(select_update(vec![
            Err(UpdateError::new("check", "network", "断网", None)),
            Ok(None)
        ])
        .unwrap()
        .is_none());
    }

    #[test]
    fn restart_confirmation_uses_semver() {
        assert!(installation_applied("1.10.0", "1.2.0"));
        assert!(installation_applied("1.2.0", "1.2.0"));
        assert!(!installation_applied("1.1.4", "1.2.0"));
        assert!(!installation_applied("$(MARKETING_VERSION)", "1.2.0"));
    }
}
