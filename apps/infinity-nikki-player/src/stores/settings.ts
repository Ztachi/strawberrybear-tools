/**
 * @fileOverview 应用设置状态管理
 * @description 使用 Pinia 管理的设置状态，包含语言、当前模板 ID、演奏模式等功能
 */
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import { saveSettings, loadSettings as loadSettingsApi } from '@/lib/settings'
import { invoke } from '@tauri-apps/api/core'
import type { KeyTemplate } from '@/types'
import i18n, { DEFAULT_LOCALE, getPreferredLocale, isSupportedLocale } from '@/i18n'
import type { LocaleType } from '@/i18n'
import { isPlaybackMode, type PlaybackMode } from '@strawberrybear/player'
import { DEFAULT_PLAYBACK_FPS } from '@/lib/keyboardTiming'

/**
 * @description: 设置 Store - 管理所有应用设置
 * @return {Object} 返回设置状态管理对象
 */
export const useSettingsStore = defineStore('settings', () => {
  // ============================================
  // 状态定义
  // ============================================

  /** 当前语言 */
  const locale = ref<LocaleType>(DEFAULT_LOCALE)

  /** 当前模板 ID */
  const currentTemplateId = ref<string | null>(null)

  /** 演奏模式：'auto' | 'piano' */
  const playMode = ref<'auto' | 'piano'>('auto')

  /** 是否启用键盘模拟 */
  const enableKeyboardSim = ref(false)

  /** 是否启用自动 FPS 获取 */
  const autoFpsEnabled = ref(false)

  /** 手动 FPS，自动获取不可用时作为兜底 */
  const manualFps = ref(DEFAULT_PLAYBACK_FPS)

  /** 最近一次自动检测 FPS，仅用于 UI 展示回填 */
  const lastDetectedFps = ref<number | null>(null)

  /** 播放列表调度模式，独立于自动演奏/模板发音模式。 */
  const playlistPlaybackMode = ref<PlaybackMode>('sequential')

  /** 歌单侧栏是否收起 */
  const songListSidebarCollapsed = ref(false)

  /** 上次预览选中的 MIDI 文件名 */
  const lastPreviewFilename = ref<string | null>(null)

  /** 上次预览队列来源 ID，例如 all 或 song-list:<id> */
  const lastPreviewSourceId = ref<string | null>(null)

  /** 是否处于悬浮模式 */
  const isOverlayMode = ref(false)

  /** 进入悬浮模式前保存的 playMode，退出时恢复 */
  const modeBeforeOverlay = ref<'auto' | 'piano'>('auto')

  /** 模板列表（从后端加载） */
  const templates = ref<KeyTemplate[]>([])

  // ============================================
  // 方法
  // ============================================

  /**
   * @description: 从后端加载所有模板
   * @return Promise 模板列表
   */
  async function loadTemplatesFromBackend(): Promise<KeyTemplate[]> {
    return await invoke<KeyTemplate[]>('get_templates')
  }

  /**
   * @description: 加载设置
   * @description 从 Rust 后端加载保存的设置，并初始化语言和模板
   * @return Promise
   */
  async function loadSettings() {
    try {
      // 从后端加载设置
      const settings = await loadSettingsApi()

      // 设置语言
      if (settings.locale && isSupportedLocale(settings.locale)) {
        locale.value = settings.locale
        i18n.global.locale.value = settings.locale
      } else {
        // 首次运行时只使用已注册的系统语言包；未命中统一回退英文。
        const loc = await getPreferredLocale()
        locale.value = loc
        i18n.global.locale.value = loc
      }

      // 设置演奏模式
      if (settings.play_mode === 'auto' || settings.play_mode === 'piano') {
        playMode.value = settings.play_mode
      }

      // 设置键盘模拟（需要 play_mode 为 piano 时才生效）
      if (settings.enable_keyboard_sim === true && playMode.value === 'piano') {
        enableKeyboardSim.value = true
      } else {
        enableKeyboardSim.value = false
      }

      // 设置 FPS 获取策略；自动获取是测试功能，默认关闭，只有显式 true 才启用。
      autoFpsEnabled.value = settings.auto_fps_enabled === true
      manualFps.value = normalizeFps(settings.manual_fps)
      lastDetectedFps.value =
        typeof settings.last_detected_fps === 'number'
          ? normalizeFps(settings.last_detected_fps)
          : null
      // 旧配置没有播放列表模式时默认顺序播放，符合“只播放一轮列表”的默认体验。
      playlistPlaybackMode.value = isPlaybackMode(settings.playlist_playback_mode)
        ? settings.playlist_playback_mode
        : 'sequential'
      songListSidebarCollapsed.value = settings.song_list_sidebar_collapsed === true
      lastPreviewFilename.value = settings.last_preview_filename ?? null
      lastPreviewSourceId.value = settings.last_preview_source_id ?? null

      // 从后端加载模板
      templates.value = await loadTemplatesFromBackend()

      // 设置当前模板
      if (settings.current_template_id) {
        currentTemplateId.value = settings.current_template_id
      } else if (templates.value.length > 0) {
        // 默认选择第一个模板
        currentTemplateId.value = templates.value[0].id
      }
    } catch (e) {
      console.error('加载设置失败:', e)
      // 失败时仍按统一语言解析策略初始化，避免把中英判断散落在 store 中。
      const loc = await getPreferredLocale()
      locale.value = loc
      i18n.global.locale.value = loc

      // 仍然尝试加载模板
      templates.value = await loadTemplatesFromBackend()
      if (templates.value.length > 0) {
        currentTemplateId.value = templates.value[0].id
      }
    }
  }

  /**
   * @description: 保存设置
   * @description 将当前设置持久化到 Rust 后端
   * @return Promise
   */
  async function persistSettings() {
    await saveSettings({
      locale: locale.value,
      current_template_id: currentTemplateId.value,
      play_mode: playMode.value,
      enable_keyboard_sim: enableKeyboardSim.value,
      auto_fps_enabled: autoFpsEnabled.value,
      manual_fps: manualFps.value,
      last_detected_fps: lastDetectedFps.value,
      playlist_playback_mode: playlistPlaybackMode.value,
      song_list_sidebar_collapsed: songListSidebarCollapsed.value,
      last_preview_filename: lastPreviewFilename.value,
      last_preview_source_id: lastPreviewSourceId.value,
    })
  }

  /**
   * @description: 归一化 FPS，避免异常设置影响按键时序计算
   * @param {number | undefined | null} fps - 待归一化 FPS
   * @return {number} 可用于播放策略的 FPS
   */
  function normalizeFps(fps: number | undefined | null): number {
    if (typeof fps !== 'number' || !Number.isFinite(fps)) return DEFAULT_PLAYBACK_FPS
    return Math.min(360, Math.max(15, Math.round(fps)))
  }

  /**
   * @description: 设置键盘模拟开关
   * @description 只有在模板演奏模式下才能开启键盘模拟
   * @param {boolean} enabled - 是否启用
   * @return Promise
   */
  async function setEnableKeyboardSim(enabled: boolean) {
    if (enabled && playMode.value !== 'piano') return
    enableKeyboardSim.value = enabled
    await persistSettings()
  }

  /**
   * @description: 设置自动 FPS 获取开关
   * @param {boolean} enabled - 是否启用自动 FPS
   * @return Promise
   */
  async function setAutoFpsEnabled(enabled: boolean) {
    autoFpsEnabled.value = enabled
    if (!enabled) {
      manualFps.value = DEFAULT_PLAYBACK_FPS
    }
    await persistSettings()
  }

  /**
   * @description: 设置手动 FPS
   * @param {number} fps - 用户输入的手动 FPS
   * @return Promise
   */
  async function setManualFps(fps: number) {
    manualFps.value = normalizeFps(fps)
    await persistSettings()
  }

  /**
   * @description: 保存最近一次自动检测 FPS
   * @param {number | null} fps - 自动检测 FPS
   * @return Promise
   */
  async function setLastDetectedFps(fps: number | null) {
    lastDetectedFps.value = fps === null ? null : normalizeFps(fps)
    await persistSettings()
  }

  /**
   * @description: 设置播放列表调度模式
   * @param {PlaybackMode} mode - 播放列表调度模式
   * @return {Promise<void>} 无返回值
   */
  async function setPlaylistPlaybackMode(mode: PlaybackMode) {
    playlistPlaybackMode.value = mode
    await persistSettings()
  }

  /**
   * @description: 设置歌单侧栏收起状态
   * @param {boolean} collapsed - 是否收起
   * @return {Promise<void>} 无返回值
   */
  async function setSongListSidebarCollapsed(collapsed: boolean) {
    songListSidebarCollapsed.value = collapsed
    await persistSettings()
  }

  /**
   * @description: 保存上次预览选中项和播放来源
   * @param {string | null} filename - MIDI 文件名
   * @param {string | null} sourceId - 来源 ID
   * @return {Promise<void>} 无返回值
   */
  async function setLastPreviewSelection(filename: string | null, sourceId: string | null) {
    lastPreviewFilename.value = filename
    lastPreviewSourceId.value = sourceId
    await persistSettings()
  }

  /**
   * @description: 设置演奏模式
   * @param {'auto' | 'piano'} mode - 演奏模式
   * @return Promise
   */
  async function setPlayMode(mode: 'auto' | 'piano') {
    playMode.value = mode
    await persistSettings()
  }

  /**
   * @description: 切换语言
   * @param {LocaleType} newLocale - 新的语言代码
   * @return Promise
   */
  async function setLocale(newLocale: LocaleType) {
    locale.value = newLocale
    i18n.global.locale.value = newLocale
    await persistSettings()
  }

  /**
   * @description: 选择模板
   * @param {string} templateId - 模板 ID
   * @return Promise
   */
  async function selectTemplate(templateId: string) {
    currentTemplateId.value = templateId
    await persistSettings()
  }

  /**
   * @description: 获取当前模板
   * @return {KeyTemplate | null} 当前模板或 null
   */
  function getCurrentTemplate(): KeyTemplate | null {
    return templates.value.find((t) => t.id === currentTemplateId.value) || null
  }

  /**
   * @description: 刷新模板列表
   * @description 从后端重新加载模板列表，并确保当前模板 ID 仍然有效
   * @return Promise
   */
  async function refreshTemplates() {
    templates.value = await loadTemplatesFromBackend()
    // 确保当前模板 ID 仍然有效
    if (currentTemplateId.value && !templates.value.find((t) => t.id === currentTemplateId.value)) {
      currentTemplateId.value = templates.value[0]?.id || null
      await persistSettings()
    }
  }

  /**
   * @description: 保存模板到后端
   * @param {KeyTemplate} template - 模板数据
   * @return Promise
   */
  async function saveTemplate(template: KeyTemplate) {
    await invoke('save_template', { template })
    await refreshTemplates()
    currentTemplateId.value = template.id
    await persistSettings()
  }

  /**
   * @description: 导入模板 JSON 或 ZIP 文件
   * @param {string} sourcePath - 模板文件路径
   * @return {Promise<KeyTemplate[]>} 导入后的模板列表
   */
  async function importTemplate(sourcePath: string): Promise<KeyTemplate[]> {
    // 后端会根据扩展名解析 JSON 或 ZIP，并为每个模板生成不冲突的自定义 ID。
    const templates = await invoke<KeyTemplate[]>('import_template', { sourcePath })
    await refreshTemplates()
    // 批量导入后选中最后一个模板，符合“刚导入的内容可立即使用”的反馈预期。
    const lastTemplate = templates[templates.length - 1]
    if (lastTemplate) {
      currentTemplateId.value = lastTemplate.id
      await persistSettings()
    }
    return templates
  }

  /**
   * @description: 导出模板 JSON 文件
   * @param {string} templateId - 模板 ID
   * @param {string} targetPath - 导出路径
   * @return Promise
   */
  async function exportTemplate(templateId: string, targetPath: string) {
    await invoke('export_template', { templateId, targetPath })
  }

  /**
   * @description: 批量导出模板 ZIP 文件
   * @param {string[]} templateIds - 模板 ID 列表
   * @param {string} targetPath - 导出 ZIP 路径
   * @return Promise
   */
  async function exportTemplatesArchive(templateIds: string[], targetPath: string) {
    // 批量导出只传 ID，后端读取模板目录真实文件，避免导出前端缓存中的旧数据。
    await invoke('export_templates_archive', { templateIds, targetPath })
  }

  /**
   * @description: 删除模板
   * @param {string} templateId - 模板 ID
   * @return Promise
   */
  async function deleteTemplate(templateId: string) {
    await invoke('delete_template', { templateId })
    await refreshTemplates()
    // 如果删除的是当前模板，切换到第一个
    if (currentTemplateId.value === templateId) {
      currentTemplateId.value = templates.value[0]?.id || null
      await persistSettings()
    }
  }

  /**
   * @description: 重命名模板
   * @param {string} templateId - 模板 ID
   * @param {string} newName - 新名称
   * @return Promise
   */
  async function renameTemplate(templateId: string, newName: string) {
    await invoke('rename_template', { templateId, newName })
    await refreshTemplates()
  }

  // ============================================
  // 返回
  // ============================================

  return {
    // 状态
    locale,
    currentTemplateId,
    playMode,
    enableKeyboardSim,
    autoFpsEnabled,
    manualFps,
    lastDetectedFps,
    playlistPlaybackMode,
    songListSidebarCollapsed,
    lastPreviewFilename,
    lastPreviewSourceId,
    isOverlayMode,
    modeBeforeOverlay,
    templates,
    // 方法
    loadSettings,
    setLocale,
    selectTemplate,
    getCurrentTemplate,
    refreshTemplates,
    saveTemplate,
    importTemplate,
    exportTemplate,
    exportTemplatesArchive,
    deleteTemplate,
    renameTemplate,
    setPlayMode,
    setEnableKeyboardSim,
    setAutoFpsEnabled,
    setManualFps,
    setLastDetectedFps,
    setPlaylistPlaybackMode,
    setSongListSidebarCollapsed,
    setLastPreviewSelection,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot))
}
