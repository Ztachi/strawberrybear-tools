/**
 * @description: Tauri 官方自动更新状态与操作
 */
import { computed, markRaw, ref, shallowRef } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { feedback as toast } from '@/lib/feedback'
import { i18n } from '@/i18n'

/** GitHub Releases 页面地址，用于手动打开版本发布页。 */
const GITHUB_RELEASES_URL = 'https://github.com/Ztachi/strawberrybear-tools/releases'

/** 是否正在向 Tauri updater 查询新版本。 */
const isChecking = ref(false)
/** 是否正在下载更新包。 */
const isDownloading = ref(false)
/** 是否正在安装更新包。 */
const isInstalling = ref(false)
/** 当前已下载字节数，用于计算下载进度。 */
const downloadedBytes = ref(0)
/** 更新包总字节数；插件未返回长度时为 null。 */
const contentLength = ref<number | null>(null)
/** 当前可用更新对象；使用 shallowRef 避免代理 Tauri 插件返回的实例方法。 */
const availableUpdate = shallowRef<Update | null>(null)
/** 最近一次真实下载安装失败信息；静默检查失败不写入该状态。 */
const lastError = ref<string | null>(null)
/** 是否启用更新调试模式；显式调用 useAppUpdater(true) 后开启。 */
const isMockMode = ref(false)

/** 模拟更新包总字节数，用于驱动下载进度条。 */
const MOCK_CONTENT_LENGTH = 10_000_000
/** 模拟下载每次推进的字节数。 */
const MOCK_PROGRESS_STEP = 1_250_000
/** 模拟下载每一段进度之间的等待时间。 */
const MOCK_STEP_DELAY_MS = 220
/** 模拟安装阶段等待时间。 */
const MOCK_INSTALL_DELAY_MS = 900

/** 是否存在可安装更新。 */
const hasUpdate = computed(() => availableUpdate.value !== null)
/** 当前下载进度百分比；无法获取总长度时返回 null。 */
const progress = computed(() => {
  if (!contentLength.value || contentLength.value <= 0) return null
  return Math.min(100, Math.round((downloadedBytes.value / contentLength.value) * 100))
})
/** 更新流程是否正在执行，供按钮禁用和 loading 状态复用。 */
const isBusy = computed(() => isChecking.value || isDownloading.value || isInstalling.value)

/**
 * @description: 读取当前 i18n 实例中的更新相关文案
 * @param {string} key - i18n 文案 key
 * @param {Record<string, unknown>} params - 文案插值参数
 * @return {string} 本地化后的文案
 */
function t(key: string, params?: Record<string, unknown>) {
  return i18n.global.t(key, params ?? {})
}

/**
 * @description: 将未知错误转换为可展示/记录的字符串
 * @param {unknown} error - 任意异常对象
 * @return {string} 错误消息
 */
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @description: 同步 Tauri updater 下载事件到响应式进度状态
 * @param {DownloadEvent} event - Tauri updater 下载事件
 */
function updateDownloadProgress(event: DownloadEvent) {
  if (event.event === 'Started') {
    // 下载开始时重置字节计数，避免沿用上一次更新残留进度。
    downloadedBytes.value = 0
    // contentLength 可能缺失，缺失时 UI 显示通用 downloading 文案而不是百分比。
    contentLength.value = event.data.contentLength ?? null
    return
  }

  if (event.event === 'Progress') {
    // Tauri 只返回本次 chunk 大小，需要累加成总下载量。
    downloadedBytes.value += event.data.chunkLength
    return
  }

  if (event.event === 'Finished' && contentLength.value) {
    // 结束事件兜底拉满进度，避免最后一个 chunk 四舍五入后停在 99%。
    downloadedBytes.value = contentLength.value
  }
}

/**
 * @description: 等待指定毫秒数，用于模拟下载和安装过程
 * @param {number} ms - 等待时长
 * @return {Promise<void>} 延迟完成 Promise
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * @description: 创建调试用模拟更新对象
 * @return {Update} 可走完整下载/安装视觉流程的模拟更新
 */
function createMockUpdate(): Update {
  return {
    version: 'mock-0.0.1',
    currentVersion: 'mock-current',
    date: new Date().toISOString(),
    body: 'Mock update for UI preview.',
    /**
     * @description: 模拟 Tauri updater 的下载与安装事件序列
     * @param {(event: DownloadEvent) => void} onEvent - 下载事件回调
     */
    async downloadAndInstall(onEvent?: (event: DownloadEvent) => void) {
      // 先发送 Started 事件，让按钮切到可显示百分比的下载状态。
      onEvent?.({
        event: 'Started',
        data: { contentLength: MOCK_CONTENT_LENGTH },
      })

      for (
        let downloaded = MOCK_PROGRESS_STEP;
        downloaded <= MOCK_CONTENT_LENGTH;
        downloaded += MOCK_PROGRESS_STEP
      ) {
        // 每一段等待后再发送 Progress，模拟真实网络下载的渐进过程。
        await wait(MOCK_STEP_DELAY_MS)
        onEvent?.({
          event: 'Progress',
          data: { chunkLength: MOCK_PROGRESS_STEP },
        })
      }

      // 发送 Finished 事件，驱动进度条稳定到 100%。
      await wait(MOCK_STEP_DELAY_MS)
      onEvent?.({
        event: 'Finished',
        data: {},
      })
      // 保留一小段安装等待，让 UI 能展示 installing 状态。
      await wait(MOCK_INSTALL_DELAY_MS)
    },
  } as Update
}

/**
 * @description: 获取应用更新状态和操作
 * @param {boolean} mock - 是否启用更新调试模式，显式传 true 时不触发真实更新/重启
 * @return {object} 更新状态与操作方法
 */
export function useAppUpdater(mock = false) {
  if (mock) {
    // mock 是模块级开关，任意入口启用后，所有共享按钮和弹窗都看到同一套模拟状态。
    isMockMode.value = true
  }

  /**
   * @description: 检查是否存在可用更新
   * @param {{ notifyNoUpdate?: boolean; silent?: boolean }} options - 检查提示策略
   * @return {Promise<Update | null>} 可用更新对象；无更新或静默失败时返回 null
   */
  async function checkUpdate(options: { notifyNoUpdate?: boolean; silent?: boolean } = {}) {
    // 避免重复点击或启动阶段重复调用造成并发检查。
    if (isChecking.value) return availableUpdate.value

    // 进入检查态前清理上一次错误，保证 UI 只展示当前流程状态。
    isChecking.value = true
    lastError.value = null

    try {
      // mock 模式不访问网络和 Tauri updater，直接生成可安装的模拟更新对象。
      const update = isMockMode.value ? createMockUpdate() : await check()
      // Tauri Update 对象包含方法，使用 markRaw 避免 Vue 代理破坏插件实例行为。
      availableUpdate.value = update ? markRaw(update) : null

      if (update) {
        // 检查到更新时清理历史错误，避免旧错误影响当前更新入口。
        lastError.value = null
      }

      if (update && !options.silent) {
        // 非静默检查需要主动提示用户发现新版本。
        toast.info(t('updater.availableTitle'), {
          description: t('updater.availableDescription', { version: update.version }),
        })
      }

      if (!update && options.notifyNoUpdate) {
        // 手动检查无更新时给出正向反馈，静默启动检查不打扰用户。
        toast.success(t('updater.noUpdateTitle'), {
          description: t('updater.noUpdateDescription'),
        })
      }

      return update
    } catch (error) {
      const message = getErrorMessage(error)
      console.warn('[updater] check failed:', message, error)

      if (!options.silent) {
        // updater 检查失败通常来自网络或发布源不可达，面向用户按“暂无更新”降级展示。
        toast.info(t('updater.noUpdateTitle'), {
          description: t('updater.noUpdateDescription'),
        })
      }

      // 静默检查失败不把错误暴露到 UI，避免启动时出现不必要的红色状态。
      availableUpdate.value = null
      lastError.value = null
      return null
    } finally {
      // 无论成功、失败还是提前返回，都必须退出检查态。
      isChecking.value = false
    }
  }

  /**
   * @description: 下载并安装当前可用更新
   * @return {Promise<void>} 下载、安装或模拟流程完成后的 Promise
   */
  async function downloadAndInstallUpdate() {
    // 没有可用更新或已有更新流程时直接忽略，避免重复安装。
    if (!availableUpdate.value || isBusy.value) return

    // 进入下载态前重置进度和错误，确保按钮展示从 0 开始的当前流程。
    isDownloading.value = true
    lastError.value = null
    downloadedBytes.value = 0
    contentLength.value = null

    try {
      // 真实和 mock 更新都复用同一个下载事件处理，保证 UI 流程一致。
      await availableUpdate.value.downloadAndInstall(updateDownloadProgress)
      // 插件下载完成后切换到安装态，按钮文案从 downloading 变为 installing。
      isDownloading.value = false
      isInstalling.value = true
      toast.success(t('updater.installedTitle'), {
        description: t('updater.relaunching'),
      })
      if (isMockMode.value) {
        // mock 模式只演示安装状态，不重启应用。
        await wait(MOCK_INSTALL_DELAY_MS)
        return
      }
      // 真实安装完成后重启应用，让新版本生效。
      await relaunch()
    } catch (error) {
      const message = getErrorMessage(error)
      console.error('[updater] install failed:', error)
      // 下载安装失败需要保留错误，供后续 UI 或调试读取。
      lastError.value = message
      toast.error(t('updater.installFailed'), {
        description: t('updater.installFailedDescription'),
        richColors: true,
      })
    } finally {
      // 安装流程结束后统一复位忙碌状态，mock 和真实失败都能恢复按钮。
      isDownloading.value = false
      isInstalling.value = false
    }
  }

  /**
   * @description: 打开 GitHub Releases 页面
   * @return {Promise<void>} 打开系统浏览器完成后的 Promise
   */
  async function openReleasePage() {
    // 统一走 Rust open_url，避免 WebView 内部导航离开应用。
    await invoke('open_url', { url: GITHUB_RELEASES_URL })
  }

  return {
    availableUpdate,
    contentLength,
    downloadedBytes,
    hasUpdate,
    isBusy,
    isChecking,
    isDownloading,
    isInstalling,
    isMockMode,
    lastError,
    progress,
    checkUpdate,
    downloadAndInstallUpdate,
    openReleasePage,
  }
}
