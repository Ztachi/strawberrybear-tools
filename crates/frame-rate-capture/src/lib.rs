//! 进程帧率采集公共库。
//!
//! Windows 第一版通过 PresentMon console 读取目标进程的帧呈现 CSV；其他平台走同一门面接口，
//! 但返回 `UnsupportedPlatform`，便于后续替换为平台专用 provider。

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// 默认无限暖暖游戏进程名，优先使用真正的 UE 渲染进程。
pub const DEFAULT_NIKKI_PROCESS_NAMES: &[&str] =
    &["X6Game-Win64-Shipping.exe", "InfinityNikki.exe"];

/// 默认稳定采样窗口，单位毫秒。
pub const DEFAULT_SAMPLE_WINDOW_MS: u64 = 2_000;
/// 默认稳定值所需最少样本数。
pub const DEFAULT_MIN_STABLE_SAMPLES: usize = 8;
/// FPS 样本允许的最低值，过滤进程启动/卡死期间的异常间隔。
pub const MIN_REASONABLE_FPS: f64 = 5.0;
/// FPS 样本允许的最高值，过滤 PresentMon 偶发零间隔噪声。
pub const MAX_REASONABLE_FPS: f64 = 1_000.0;
/// 稳定值抖动阈值：标准差 / 平均 FPS。
pub const DEFAULT_STABLE_JITTER_RATIO: f64 = 0.08;

/// 帧率采集状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaptureStatus {
    /// 当前平台没有可用 provider。
    UnsupportedPlatform,
    /// 尚未开始采集。
    Idle,
    /// 正在启动采集进程或初始化 provider。
    Starting,
    /// 正在采集帧率。
    Capturing,
    /// 找不到 PresentMon 可执行文件。
    PresentMonMissing,
    /// 目标游戏进程尚未产生可采样帧。
    TargetNotFound,
    /// 权限不足，Windows 上通常需要管理员或 Performance Log Users 权限。
    PermissionDenied,
    /// 采集过程出现其他错误。
    Error,
}

/// 帧率数据来源。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FrameRateSource {
    /// Intel PresentMon / ETW provider。
    PresentMon,
    /// 当前平台没有实现自动采集。
    Unsupported,
}

/// 进程选择策略。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TargetProcessSelector {
    /// 通过一组进程名过滤采样。
    ProcessNames(Vec<String>),
    /// 使用当前前台窗口进程。
    ForegroundWindow,
}

impl Default for TargetProcessSelector {
    fn default() -> Self {
        Self::ProcessNames(
            DEFAULT_NIKKI_PROCESS_NAMES
                .iter()
                .map(|name| (*name).to_string())
                .collect(),
        )
    }
}

/// 稳定帧率结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StableFps {
    /// 四舍五入后的 FPS，业务层用它生成按键时序。
    pub fps: u32,
    /// 采样窗口内的平均 FPS。
    pub average_fps: f64,
    /// 采样窗口内 FPS 标准差。
    pub jitter: f64,
    /// 本次稳定判断使用的样本数。
    pub sample_count: usize,
    /// 0-1 的稳定置信度，越接近 1 抖动越小。
    pub confidence: f64,
}

/// 当前帧率快照。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameRateSnapshot {
    /// 当前采集状态。
    pub status: CaptureStatus,
    /// 最新单帧推导 FPS。
    pub current_fps: Option<f64>,
    /// 最近窗口内稳定 FPS。
    pub stable_fps: Option<StableFps>,
    /// 最近窗口内样本数量。
    pub sample_count: usize,
    /// 数据来源。
    pub source: FrameRateSource,
    /// 当前命中的目标进程名。
    pub target_process: Option<String>,
    /// 最近样本更新时间戳，Unix 毫秒。
    pub updated_at_ms: Option<u64>,
    /// 面向调用方的状态说明。
    pub message: Option<String>,
}

impl FrameRateSnapshot {
    /// 创建无样本快照。
    pub fn empty(status: CaptureStatus, source: FrameRateSource, message: Option<String>) -> Self {
        Self {
            status,
            current_fps: None,
            stable_fps: None,
            sample_count: 0,
            source,
            target_process: None,
            updated_at_ms: None,
            message,
        }
    }
}

/// 平台采集能力。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameRateCaptureCapability {
    /// 当前运行平台。
    pub platform: String,
    /// 是否已有自动采集 provider。
    pub supported: bool,
    /// provider 名称。
    pub provider: String,
    /// UI 是否可以尝试自动采集。
    pub auto_capture_available: bool,
    /// 能力说明。
    pub message: String,
}

/// 帧率采集配置。
#[derive(Debug, Clone)]
pub struct FrameRateCaptureOptions {
    /// 目标进程选择策略。
    pub target: TargetProcessSelector,
    /// 显式 PresentMon 可执行文件路径。
    pub presentmon_executable: Option<PathBuf>,
    /// 额外搜索 PresentMon 的目录。
    pub presentmon_search_dirs: Vec<PathBuf>,
    /// 稳定采样窗口，单位毫秒。
    pub sample_window_ms: u64,
    /// 稳定值所需最少样本数。
    pub min_stable_samples: usize,
    /// 稳定抖动阈值。
    pub stable_jitter_ratio: f64,
}

impl Default for FrameRateCaptureOptions {
    fn default() -> Self {
        Self {
            target: TargetProcessSelector::default(),
            presentmon_executable: None,
            presentmon_search_dirs: Vec::new(),
            sample_window_ms: DEFAULT_SAMPLE_WINDOW_MS,
            min_stable_samples: DEFAULT_MIN_STABLE_SAMPLES,
            stable_jitter_ratio: DEFAULT_STABLE_JITTER_RATIO,
        }
    }
}

/// provider 运行错误。
#[derive(Debug, Clone)]
pub struct FrameRateError {
    /// 错误对应的采集状态。
    pub status: CaptureStatus,
    /// 错误说明。
    pub message: String,
}

impl FrameRateError {
    /// 创建 provider 错误。
    pub fn new(status: CaptureStatus, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for FrameRateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for FrameRateError {}

/// provider 门面，业务侧只依赖这一组方法。
pub trait FrameRateProvider: Send {
    /// 启动采集。
    fn start(&mut self) -> Result<(), FrameRateError>;
    /// 停止采集并释放资源。
    fn stop(&mut self);
    /// 获取当前快照。
    fn snapshot(&mut self) -> FrameRateSnapshot;
}

/// 帧率采集门面。
pub struct FrameRateCapture {
    provider: Box<dyn FrameRateProvider>,
}

impl FrameRateCapture {
    /// 根据当前平台创建 provider。
    pub fn new(options: FrameRateCaptureOptions) -> Self {
        Self {
            provider: create_platform_provider(options),
        }
    }

    /// 返回当前平台能力。
    pub fn capability() -> FrameRateCaptureCapability {
        platform_capability()
    }

    /// 启动采集。
    pub fn start(&mut self) -> Result<(), FrameRateError> {
        self.provider.start()
    }

    /// 停止采集。
    pub fn stop(&mut self) {
        self.provider.stop();
    }

    /// 获取当前快照。
    pub fn snapshot(&mut self) -> FrameRateSnapshot {
        self.provider.snapshot()
    }
}

/// 单个 FPS 样本。
#[derive(Debug, Clone)]
pub struct FrameRateSample {
    /// 样本时间戳，Unix 毫秒。
    pub timestamp_ms: u64,
    /// 单帧间隔推导出的 FPS。
    pub fps: f64,
    /// 采样所属进程名。
    pub process_name: Option<String>,
}

/// 稳定采样器。
#[derive(Debug)]
pub struct FrameRateSampler {
    samples: VecDeque<FrameRateSample>,
    window_ms: u64,
    min_stable_samples: usize,
    stable_jitter_ratio: f64,
}

impl FrameRateSampler {
    /// 创建采样器。
    pub fn new(window_ms: u64, min_stable_samples: usize, stable_jitter_ratio: f64) -> Self {
        Self {
            samples: VecDeque::new(),
            window_ms,
            min_stable_samples,
            stable_jitter_ratio,
        }
    }

    /// 记录一次 PresentMon 帧间隔。
    pub fn record_frame_interval(
        &mut self,
        interval_ms: f64,
        process_name: Option<String>,
    ) -> Option<FrameRateSample> {
        if !interval_ms.is_finite() || interval_ms <= 0.0 {
            return None;
        }

        let fps = 1_000.0 / interval_ms;
        if !(MIN_REASONABLE_FPS..=MAX_REASONABLE_FPS).contains(&fps) {
            return None;
        }

        let sample = FrameRateSample {
            timestamp_ms: now_ms(),
            fps,
            process_name,
        };
        self.samples.push_back(sample.clone());
        self.trim_old_samples(sample.timestamp_ms);
        Some(sample)
    }

    /// 清空当前窗口内的所有样本，用于播放前重新锁定 FPS。
    pub fn clear(&mut self) {
        self.samples.clear();
    }

    /// 生成快照。
    pub fn snapshot(
        &mut self,
        status: CaptureStatus,
        source: FrameRateSource,
        message: Option<String>,
    ) -> FrameRateSnapshot {
        let now = now_ms();
        self.trim_old_samples(now);

        let current = self.samples.back();
        let stable_fps = self.calculate_stable_fps();

        FrameRateSnapshot {
            status,
            current_fps: current.map(|sample| round_one(sample.fps)),
            stable_fps,
            sample_count: self.samples.len(),
            source,
            target_process: current.and_then(|sample| sample.process_name.clone()),
            updated_at_ms: current.map(|sample| sample.timestamp_ms),
            message,
        }
    }

    fn trim_old_samples(&mut self, now: u64) {
        while let Some(front) = self.samples.front() {
            if now.saturating_sub(front.timestamp_ms) <= self.window_ms {
                break;
            }
            self.samples.pop_front();
        }
    }

    fn calculate_stable_fps(&self) -> Option<StableFps> {
        if self.samples.len() < self.min_stable_samples {
            return None;
        }

        let sample_count = self.samples.len();
        let average_fps =
            self.samples.iter().map(|sample| sample.fps).sum::<f64>() / sample_count as f64;
        if !average_fps.is_finite() || average_fps <= 0.0 {
            return None;
        }

        let variance = self
            .samples
            .iter()
            .map(|sample| {
                let delta = sample.fps - average_fps;
                delta * delta
            })
            .sum::<f64>()
            / sample_count as f64;
        let jitter = variance.sqrt();
        let jitter_ratio = jitter / average_fps;
        if jitter_ratio > self.stable_jitter_ratio {
            return None;
        }

        let confidence = (1.0 - jitter_ratio / self.stable_jitter_ratio).clamp(0.0, 1.0);
        Some(StableFps {
            fps: average_fps.round().clamp(1.0, MAX_REASONABLE_FPS) as u32,
            average_fps: round_one(average_fps),
            jitter: round_one(jitter),
            sample_count,
            confidence: round_two(confidence),
        })
    }
}

impl Default for FrameRateSampler {
    fn default() -> Self {
        Self::new(
            DEFAULT_SAMPLE_WINDOW_MS,
            DEFAULT_MIN_STABLE_SAMPLES,
            DEFAULT_STABLE_JITTER_RATIO,
        )
    }
}

/// PresentMon CSV 解析器。
#[derive(Debug, Clone)]
pub struct PresentMonCsvParser {
    application_index: Option<usize>,
    between_presents_index: Option<usize>,
    between_display_index: Option<usize>,
}

impl PresentMonCsvParser {
    /// 从 CSV header 创建解析器。
    pub fn from_header(header: &str) -> Option<Self> {
        let fields = split_csv_line(header);
        if fields.is_empty() {
            return None;
        }

        let application_index = find_header_index(&fields, &["Application"]);
        let between_presents_index = find_header_index(&fields, &["MsBetweenPresents"]);
        let between_display_index = find_header_index(&fields, &["MsBetweenDisplayChange"]);

        if between_presents_index.is_none() && between_display_index.is_none() {
            return None;
        }

        Some(Self {
            application_index,
            between_presents_index,
            between_display_index,
        })
    }

    /// 解析单行 CSV 帧数据，返回进程名与帧间隔毫秒。
    pub fn parse_frame(&self, row: &str) -> Option<PresentMonFrame> {
        let fields = split_csv_line(row);
        let interval_index = self.between_presents_index.or(self.between_display_index)?;
        let interval = fields.get(interval_index)?.trim().parse::<f64>().ok()?;

        let application = self
            .application_index
            .and_then(|index| fields.get(index))
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        Some(PresentMonFrame {
            application,
            interval_ms: interval,
        })
    }
}

/// PresentMon 单帧解析结果。
#[derive(Debug, Clone, PartialEq)]
pub struct PresentMonFrame {
    /// 应用/进程名。
    pub application: Option<String>,
    /// 帧间隔毫秒。
    pub interval_ms: f64,
}

fn find_header_index(fields: &[String], candidates: &[&str]) -> Option<usize> {
    fields.iter().position(|field| {
        let normalized = field.trim().replace([' ', '\u{feff}'], "");
        candidates
            .iter()
            .any(|candidate| normalized.eq_ignore_ascii_case(candidate))
    })
}

fn split_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' if in_quotes && chars.peek() == Some(&'"') => {
                current.push('"');
                chars.next();
            }
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    fields.push(current.trim().to_string());
    fields
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn round_one(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn round_two(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::path::Path;
    use std::process::{Child, Command, Stdio};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    /// Windows PresentMon provider。
    pub struct PresentMonProvider {
        options: FrameRateCaptureOptions,
        child: Option<Child>,
        sampler: Arc<Mutex<FrameRateSampler>>,
        status: Arc<Mutex<CaptureStatus>>,
        message: Arc<Mutex<Option<String>>>,
    }

    impl PresentMonProvider {
        pub fn new(options: FrameRateCaptureOptions) -> Self {
            let sampler = FrameRateSampler::new(
                options.sample_window_ms,
                options.min_stable_samples,
                options.stable_jitter_ratio,
            );
            Self {
                options,
                child: None,
                sampler: Arc::new(Mutex::new(sampler)),
                status: Arc::new(Mutex::new(CaptureStatus::Idle)),
                message: Arc::new(Mutex::new(None)),
            }
        }

        fn set_status(&self, status: CaptureStatus, message: Option<String>) {
            if let Ok(mut current_status) = self.status.lock() {
                *current_status = status;
            }
            if let Ok(mut current_message) = self.message.lock() {
                *current_message = message;
            }
        }

        fn find_presentmon(&self) -> Option<PathBuf> {
            if let Some(path) = &self.options.presentmon_executable {
                if is_presentmon_executable(path) {
                    return Some(path.clone());
                }
            }

            if let Ok(path) = std::env::var("PRESENTMON_PATH") {
                let path = PathBuf::from(path);
                if is_presentmon_executable(&path) {
                    return Some(path);
                }
            }

            for dir in &self.options.presentmon_search_dirs {
                if let Some(path) = find_presentmon_in_dir(dir) {
                    return Some(path);
                }
            }

            std::env::var_os("PATH").and_then(|paths| {
                std::env::split_paths(&paths).find_map(|dir| find_presentmon_in_dir(&dir))
            })
        }

        fn target_process_names(&self) -> Vec<String> {
            let mut names = match &self.options.target {
                TargetProcessSelector::ProcessNames(names) => names.clone(),
                TargetProcessSelector::ForegroundWindow => foreground_process_name()
                    .filter(|name| should_use_foreground_process(name))
                    .into_iter()
                    .collect(),
            };

            if matches!(&self.options.target, TargetProcessSelector::ProcessNames(_)) {
                if let Some(name) = foreground_process_name()
                    .filter(|name| should_use_foreground_process(name))
                    .filter(|name| !names.iter().any(|known| known.eq_ignore_ascii_case(name)))
                {
                    names.push(name);
                }
            }

            names
        }
    }

    impl FrameRateProvider for PresentMonProvider {
        fn start(&mut self) -> Result<(), FrameRateError> {
            self.cleanup_finished_child();
            if self.child.is_some() {
                if let Ok(mut sampler) = self.sampler.lock() {
                    sampler.clear();
                }
                return Ok(());
            }

            self.set_status(CaptureStatus::Starting, None);
            let presentmon = match self.find_presentmon() {
                Some(path) => path,
                None => {
                    let message = "未找到 PresentMon，可将 PresentMon*.exe 放入应用资源 presentmon 目录，或通过 PRESENTMON_PATH 指定。".to_string();
                    self.set_status(CaptureStatus::PresentMonMissing, Some(message.clone()));
                    return Err(FrameRateError::new(
                        CaptureStatus::PresentMonMissing,
                        message,
                    ));
                }
            };

            let mut command = Command::new(&presentmon);
            command
                .arg("--output_stdout")
                .arg("--no_csv")
                .arg("--no_console_stats")
                .arg("--exclude_dropped")
                .arg("--session_name")
                .arg("InfinityNikkiPlayerFps")
                .arg("--stop_existing_session")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .stdin(Stdio::null());

            for process_name in self.target_process_names() {
                command.arg("--process_name").arg(process_name);
            }

            let mut child = command.spawn().map_err(|error| {
                let message = format!("启动 PresentMon 失败: {}", error);
                self.set_status(CaptureStatus::Error, Some(message.clone()));
                FrameRateError::new(CaptureStatus::Error, message)
            })?;

            let stdout = child.stdout.take().ok_or_else(|| {
                let message = "PresentMon stdout 不可用，无法读取帧率数据。".to_string();
                self.set_status(CaptureStatus::Error, Some(message.clone()));
                FrameRateError::new(CaptureStatus::Error, message)
            })?;
            let stderr = child.stderr.take();

            let sampler = Arc::clone(&self.sampler);
            let status = Arc::clone(&self.status);
            let message = Arc::clone(&self.message);
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                let mut parser: Option<PresentMonCsvParser> = None;

                for line in reader.lines() {
                    let Ok(line) = line else {
                        set_shared_status(
                            &status,
                            &message,
                            CaptureStatus::Error,
                            Some("读取 PresentMon 输出失败。".to_string()),
                        );
                        break;
                    };
                    if line.trim().is_empty() {
                        continue;
                    }

                    if parser.is_none() {
                        parser = PresentMonCsvParser::from_header(&line);
                        continue;
                    }

                    if let Some(frame) =
                        parser.as_ref().and_then(|parser| parser.parse_frame(&line))
                    {
                        if let Ok(mut sampler) = sampler.lock() {
                            sampler.record_frame_interval(frame.interval_ms, frame.application);
                        }
                        set_shared_status(&status, &message, CaptureStatus::Capturing, None);
                    }
                }
            });

            if let Some(stderr) = stderr {
                let status = Arc::clone(&self.status);
                let message = Arc::clone(&self.message);
                thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().map_while(Result::ok) {
                        if let Some((next_status, next_message)) = classify_presentmon_stderr(&line)
                        {
                            set_shared_status(&status, &message, next_status, Some(next_message));
                        }
                    }
                });
            }

            self.child = Some(child);
            self.set_status(CaptureStatus::Capturing, None);
            Ok(())
        }

        fn stop(&mut self) {
            if let Some(mut child) = self.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            self.set_status(CaptureStatus::Idle, None);
        }

        fn snapshot(&mut self) -> FrameRateSnapshot {
            self.cleanup_finished_child();
            let status = self
                .status
                .lock()
                .map(|status| status.clone())
                .unwrap_or(CaptureStatus::Error);
            let message = self.message.lock().ok().and_then(|message| message.clone());

            let mut snapshot = self
                .sampler
                .lock()
                .map(|mut sampler| {
                    sampler.snapshot(status.clone(), FrameRateSource::PresentMon, message.clone())
                })
                .unwrap_or_else(|_| {
                    FrameRateSnapshot::empty(
                        CaptureStatus::Error,
                        FrameRateSource::PresentMon,
                        Some("读取 FPS 采样器失败。".to_string()),
                    )
                });

            if snapshot.status == CaptureStatus::Capturing && snapshot.sample_count == 0 {
                snapshot.status = CaptureStatus::TargetNotFound;
                snapshot.message = Some("正在等待无限暖暖游戏进程产生帧数据。".to_string());
            }
            snapshot
        }
    }

    impl PresentMonProvider {
        fn cleanup_finished_child(&mut self) {
            let exit_status = self
                .child
                .as_mut()
                .and_then(|child| child.try_wait().ok().flatten());

            if let Some(exit_status) = exit_status {
                self.child = None;
                let should_replace_status = self
                    .status
                    .lock()
                    .map(|status| {
                        let current_status = status.clone();
                        matches!(
                            current_status,
                            CaptureStatus::Starting | CaptureStatus::Capturing
                        )
                    })
                    .unwrap_or(true);
                if should_replace_status {
                    self.set_status(
                        CaptureStatus::Error,
                        Some(format!("PresentMon 已退出: {}", exit_status)),
                    );
                }
            }
        }
    }

    impl Drop for PresentMonProvider {
        fn drop(&mut self) {
            self.stop();
        }
    }

    fn is_presentmon_executable(path: &Path) -> bool {
        path.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| {
                    let lower = name.to_ascii_lowercase();
                    lower.starts_with("presentmon") && lower.ends_with(".exe")
                })
                .unwrap_or(false)
    }

    fn find_presentmon_in_dir(dir: &Path) -> Option<PathBuf> {
        let entries = std::fs::read_dir(dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if is_presentmon_executable(&path) {
                return Some(path);
            }
        }
        None
    }

    fn set_shared_status(
        status: &Arc<Mutex<CaptureStatus>>,
        message: &Arc<Mutex<Option<String>>>,
        next_status: CaptureStatus,
        next_message: Option<String>,
    ) {
        if let Ok(mut status) = status.lock() {
            *status = next_status;
        }
        if let Ok(mut message) = message.lock() {
            *message = next_message;
        }
    }

    fn classify_presentmon_stderr(line: &str) -> Option<(CaptureStatus, String)> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }

        let lower = trimmed.to_ascii_lowercase();
        if lower.contains("access is denied")
            || lower.contains("access denied")
            || lower.contains("administrator")
            || lower.contains("privilege")
            || lower.contains("elevat")
        {
            return Some((
                CaptureStatus::PermissionDenied,
                format!("PresentMon 权限不足: {}", trimmed),
            ));
        }

        if lower.contains("error") || lower.contains("failed") || lower.contains("failure") {
            return Some((
                CaptureStatus::Error,
                format!("PresentMon 错误: {}", trimmed),
            ));
        }

        None
    }

    fn foreground_process_name() -> Option<String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }

            let mut process_id = 0;
            GetWindowThreadProcessId(hwnd, &mut process_id);
            if process_id == 0 {
                return None;
            }

            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
            if handle.is_null() {
                return None;
            }

            let mut buffer = vec![0u16; 32_768];
            let mut size = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                buffer.as_mut_ptr(),
                &mut size,
            );
            let _ = CloseHandle(handle);
            if ok == 0 || size == 0 {
                return None;
            }

            let path = String::from_utf16_lossy(&buffer[..size as usize]);
            Path::new(&path)
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.to_string())
        }
    }

    fn should_use_foreground_process(process_name: &str) -> bool {
        let lower = process_name.to_ascii_lowercase();
        if lower.starts_with("presentmon") {
            return false;
        }

        let current_exe_name = std::env::current_exe()
            .ok()
            .and_then(|path| path.file_name().map(|name| name.to_owned()))
            .and_then(|name| name.to_str().map(|name| name.to_ascii_lowercase()));

        current_exe_name
            .map(|current| current != lower)
            .unwrap_or(true)
    }

    pub fn create_provider(options: FrameRateCaptureOptions) -> Box<dyn FrameRateProvider> {
        Box::new(PresentMonProvider::new(options))
    }

    pub fn capability() -> FrameRateCaptureCapability {
        FrameRateCaptureCapability {
            platform: "windows".to_string(),
            supported: true,
            provider: "presentmon".to_string(),
            auto_capture_available: true,
            message: "Windows 支持通过 PresentMon/ETW 自动采集游戏进程 FPS。".to_string(),
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::*;

    /// 非 Windows 平台保留统一 provider 接口，但第一版不实现自动采集。
    pub struct UnsupportedProvider {
        snapshot: FrameRateSnapshot,
    }

    impl UnsupportedProvider {
        pub fn new() -> Self {
            Self {
                snapshot: FrameRateSnapshot::empty(
                    CaptureStatus::UnsupportedPlatform,
                    FrameRateSource::Unsupported,
                    Some("当前平台暂不支持自动 FPS 获取，请使用手动 FPS。".to_string()),
                ),
            }
        }
    }

    impl FrameRateProvider for UnsupportedProvider {
        fn start(&mut self) -> Result<(), FrameRateError> {
            Err(FrameRateError::new(
                CaptureStatus::UnsupportedPlatform,
                "当前平台暂不支持自动 FPS 获取，请使用手动 FPS。",
            ))
        }

        fn stop(&mut self) {}

        fn snapshot(&mut self) -> FrameRateSnapshot {
            self.snapshot.clone()
        }
    }

    pub fn create_provider(_options: FrameRateCaptureOptions) -> Box<dyn FrameRateProvider> {
        Box::new(UnsupportedProvider::new())
    }

    pub fn capability() -> FrameRateCaptureCapability {
        FrameRateCaptureCapability {
            platform: std::env::consts::OS.to_string(),
            supported: false,
            provider: "unsupported".to_string(),
            auto_capture_available: false,
            message: "第一版自动 FPS 仅支持 Windows；当前平台保留入口并使用手动 FPS。".to_string(),
        }
    }
}

fn create_platform_provider(options: FrameRateCaptureOptions) -> Box<dyn FrameRateProvider> {
    platform::create_provider(options)
}

fn platform_capability() -> FrameRateCaptureCapability {
    platform::capability()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_presentmon_v2_csv_line() {
        let header = "Application,ProcessID,MsBetweenPresents,MsBetweenDisplayChange";
        let parser = PresentMonCsvParser::from_header(header).expect("parser");
        let frame = parser
            .parse_frame("X6Game-Win64-Shipping.exe,1234,16.67,16.66")
            .expect("frame");

        assert_eq!(
            frame.application.as_deref(),
            Some("X6Game-Win64-Shipping.exe")
        );
        assert!((frame.interval_ms - 16.67).abs() < f64::EPSILON);
    }

    #[test]
    fn parses_quoted_csv_fields() {
        let header = "\"Application\",ProcessID,\"MsBetweenPresents\"";
        let parser = PresentMonCsvParser::from_header(header).expect("parser");
        let frame = parser
            .parse_frame("\"X6Game-Win64-Shipping.exe\",1234,33.33")
            .expect("frame");

        assert_eq!(
            frame.application.as_deref(),
            Some("X6Game-Win64-Shipping.exe")
        );
        assert!((frame.interval_ms - 33.33).abs() < f64::EPSILON);
    }

    #[test]
    fn calculates_stable_fps() {
        let mut sampler = FrameRateSampler::new(10_000, 8, DEFAULT_STABLE_JITTER_RATIO);
        for _ in 0..10 {
            sampler.record_frame_interval(16.67, Some("game.exe".to_string()));
        }

        let snapshot =
            sampler.snapshot(CaptureStatus::Capturing, FrameRateSource::PresentMon, None);
        let stable = snapshot.stable_fps.expect("stable fps");
        assert_eq!(stable.fps, 60);
        assert_eq!(snapshot.sample_count, 10);
    }

    #[test]
    fn rejects_unstable_fps() {
        let mut sampler = FrameRateSampler::new(10_000, 4, DEFAULT_STABLE_JITTER_RATIO);
        for interval in [16.67, 16.67, 33.33, 8.33] {
            sampler.record_frame_interval(interval, None);
        }

        let snapshot =
            sampler.snapshot(CaptureStatus::Capturing, FrameRateSource::PresentMon, None);
        assert!(snapshot.stable_fps.is_none());
    }

    #[test]
    fn clears_samples_before_new_lock_window() {
        let mut sampler = FrameRateSampler::new(10_000, 4, DEFAULT_STABLE_JITTER_RATIO);
        for _ in 0..4 {
            sampler.record_frame_interval(16.67, None);
        }

        sampler.clear();

        let snapshot =
            sampler.snapshot(CaptureStatus::Capturing, FrameRateSource::PresentMon, None);
        assert_eq!(snapshot.sample_count, 0);
        assert!(snapshot.stable_fps.is_none());
    }

    #[test]
    fn unsupported_platform_has_manual_fallback_state() {
        #[cfg(not(target_os = "windows"))]
        {
            let mut capture = FrameRateCapture::new(FrameRateCaptureOptions::default());
            assert!(capture.start().is_err());
            let snapshot = capture.snapshot();
            assert_eq!(snapshot.status, CaptureStatus::UnsupportedPlatform);
            assert_eq!(snapshot.source, FrameRateSource::Unsupported);
        }
    }
}
