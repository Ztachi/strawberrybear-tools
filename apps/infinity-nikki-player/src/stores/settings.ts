/**
 * @description: 应用设置 Store - 管理语言、当前模板 ID 等全局设置
 * 注意：模板列表独立从后端加载，不再保存在 settings.json 中
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { saveSettings, loadSettings as loadSettingsApi } from '@/lib/settings'
import { invoke } from '@tauri-apps/api/core'
import type { KeyTemplate } from '@/types'
import i18n from '@/i18n'
import type { LocaleType } from '@/i18n'

export const useSettingsStore = defineStore('settings', () => {
  // 当前语言
  const locale = ref<LocaleType>('en-US')

  // 当前模板 ID
  const currentTemplateId = ref<string | null>(null)

  // 演奏模式：'auto' | 'piano'
  const playMode = ref<'auto' | 'piano'>('auto')

  // 模板列表（从后端加载）
  const templates = ref<KeyTemplate[]>([])

  /** 从后端加载所有模板 */
  async function loadTemplatesFromBackend(): Promise<KeyTemplate[]> {
    return await invoke<KeyTemplate[]>('get_templates')
  }

  /** 加载设置 */
  async function loadSettings() {
    try {
      const settings = await loadSettingsApi()

      // 设置语言 - 如果没有保存过，使用系统语言
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

      // 从后端加载模板
      templates.value = await loadTemplatesFromBackend()

      // 设置当前模板
      if (settings.current_template_id) {
        currentTemplateId.value = settings.current_template_id
      } else if (templates.value.length > 0) {
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

  /** 保存设置 */
  async function persistSettings() {
    await saveSettings({
      locale: locale.value,
      current_template_id: currentTemplateId.value,
      play_mode: playMode.value,
    })
  }

  /** 设置演奏模式 */
  async function setPlayMode(mode: 'auto' | 'piano') {
    playMode.value = mode
    await persistSettings()
  }

  /** 切换语言 */
  async function setLocale(newLocale: LocaleType) {
    locale.value = newLocale
    i18n.global.locale.value = newLocale
    await persistSettings()
  }

  /** 选择模板 */
  async function selectTemplate(templateId: string) {
    currentTemplateId.value = templateId
    await persistSettings()
  }

  /** 获取当前模板 */
  function getCurrentTemplate(): KeyTemplate | null {
    return templates.value.find((t) => t.id === currentTemplateId.value) || null
  }

  /** 刷新模板列表（从后端重新加载） */
  async function refreshTemplates() {
    templates.value = await loadTemplatesFromBackend()
    // 确保当前模板 ID 仍然有效
    if (currentTemplateId.value && !templates.value.find((t) => t.id === currentTemplateId.value)) {
      currentTemplateId.value = templates.value[0]?.id || null
    }
  }

  /** 保存模板到后端 */
  async function saveTemplate(template: KeyTemplate) {
    await invoke('save_template', { template })
    await refreshTemplates()
  }

  /** 删除模板 */
  async function deleteTemplate(templateId: string) {
    await invoke('delete_template', { templateId })
    await refreshTemplates()
    if (currentTemplateId.value === templateId) {
      currentTemplateId.value = templates.value[0]?.id || null
      await persistSettings()
    }
  }

  /** 重命名模板 */
  async function renameTemplate(templateId: string, newName: string) {
    await invoke('rename_template', { templateId, newName })
    await refreshTemplates()
  }

  return {
    // 状态
    locale,
    currentTemplateId,
    playMode,
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
  }
})
