/**
 * @fileOverview 应用设置状态管理
 * @description 使用 Pinia 管理的设置状态，包含语言、当前模板 ID、演奏模式等功能
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { saveSettings, loadSettings as loadSettingsApi } from '@/lib/settings'
import { invoke } from '@tauri-apps/api/core'
import type { KeyTemplate } from '@/types'
import i18n from '@/i18n'
import type { LocaleType } from '@/i18n'

/**
 * @description: 设置 Store - 管理所有应用设置
 * @return {Object} 返回设置状态管理对象
 */
export const useSettingsStore = defineStore('settings', () => {
  // ============================================
  // 状态定义
  // ============================================

  /** 当前语言 */
  const locale = ref<LocaleType>('en-US')

  /** 当前模板 ID */
  const currentTemplateId = ref<string | null>(null)

  /** 演奏模式：'auto' | 'piano' */
  const playMode = ref<'auto' | 'piano'>('auto')

  /** 是否启用键盘模拟 */
  const enableKeyboardSim = ref(false)

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
      if (settings.locale && (settings.locale === 'zh-CN' || settings.locale === 'en-US')) {
        locale.value = settings.locale
        i18n.global.locale.value = settings.locale
      } else {
        // 首次运行，使用系统语言（从后端获取）
        const systemLocale = await invoke<string>('get_system_locale')
        const loc: LocaleType = systemLocale.startsWith('zh') ? 'zh-CN' : 'en-US'
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
      // 失败时使用系统语言
      const systemLocale = await invoke<string>('get_system_locale')
      const loc: LocaleType = systemLocale.startsWith('zh') ? 'zh-CN' : 'en-US'
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
    })
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
    deleteTemplate,
    renameTemplate,
    setPlayMode,
    setEnableKeyboardSim,
  }
})
