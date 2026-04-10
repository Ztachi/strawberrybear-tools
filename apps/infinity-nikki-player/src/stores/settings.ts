/**
 * @description: 应用设置 Store - 管理语言、模板等全局设置
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  saveSettings,
  loadSettings as loadSettingsApi,
  type AppSettings,
  type TemplateData,
} from '@/lib/settings'
import { invoke } from '@tauri-apps/api/core'
import type { KeyTemplate } from '@/types'
import i18n from '@/i18n'
import type { LocaleType } from '@/i18n'

export const useSettingsStore = defineStore('settings', () => {
  // 当前语言
  const locale = ref<string>('en-US')

  // 当前模板 ID
  const currentTemplateId = ref<string | null>(null)

  // 模板列表
  const templates = ref<KeyTemplate[]>([])

  /** 从后端加载内置模板 */
  async function loadBuiltinTemplates(): Promise<KeyTemplate[]> {
    return await invoke<KeyTemplate[]>('get_templates')
  }

  /** 加载设置 */
  async function loadSettings() {
    try {
      const settings = await loadSettingsApi()

      // 设置语言 - 如果没有保存过，使用系统语言
      if (settings.locale) {
        locale.value = settings.locale
        i18n.global.locale.value = settings.locale
      } else {
        // 首次运行，使用系统语言（从后端获取）
        const systemLocale = await invoke<string>('get_system_locale')
        const loc: LocaleType = systemLocale.startsWith('zh') ? 'zh-CN' : 'en-US'
        locale.value = loc
        i18n.global.locale.value = loc
      }

      // 如果设置中有模板数据，直接使用
      if (settings.templates && settings.templates.length > 0) {
        templates.value = settings.templates.map((t) => ({
          id: t.id,
          name: t.name,
          is_builtin: t.is_builtin,
          mappings: t.mappings.map((m) => ({ pitch: m.pitch, key: m.key })),
        }))
      } else {
        // 否则从后端加载内置模板
        templates.value = await loadBuiltinTemplates()
      }

      // 设置当前模板
      if (settings.current_template_id) {
        currentTemplateId.value = settings.current_template_id
      } else if (templates.value.length > 0) {
        currentTemplateId.value = templates.value[0].id
      }
    } catch (e) {
      console.error('加载设置失败:', e)
      // 失败时加载内置模板，并使用系统语言
      const systemLocale = await invoke<string>('get_system_locale')
      const loc: LocaleType = systemLocale.startsWith('zh') ? 'zh-CN' : 'en-US'
      locale.value = loc
      i18n.global.locale.value = loc

      templates.value = await loadBuiltinTemplates()
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
      templates: templates.value.map((t) => ({
        id: t.id,
        name: t.name,
        is_builtin: t.is_builtin,
        mappings: t.mappings.map((m) => ({ pitch: m.pitch, key: m.key })),
      })),
    })
  }

  /** 切换语言 */
  async function setLocale(newLocale: string) {
    locale.value = newLocale
    i18n.global.locale.value = newLocale
    await persistSettings()
  }

  /** 选择模板 */
  async function selectTemplate(templateId: string) {
    const template = templates.value.find((t) => t.id === templateId)
    if (template) {
      currentTemplateId.value = templateId
      await persistSettings()
    }
  }

  /** 获取当前模板 */
  function getCurrentTemplate(): KeyTemplate | null {
    return templates.value.find((t) => t.id === currentTemplateId.value) || null
  }

  /** 添加/更新模板 */
  async function saveTemplate(template: KeyTemplate) {
    const index = templates.value.findIndex((t) => t.id === template.id)
    if (index >= 0) {
      templates.value[index] = template
    } else {
      templates.value.push(template)
    }
    await persistSettings()
  }

  /** 删除模板 */
  async function deleteTemplate(templateId: string) {
    templates.value = templates.value.filter((t) => t.id !== templateId)
    if (currentTemplateId.value === templateId) {
      currentTemplateId.value = templates.value[0]?.id || null
    }
    await persistSettings()
  }

  return {
    // 状态
    locale,
    currentTemplateId,
    templates,
    // 方法
    loadSettings,
    setLocale,
    selectTemplate,
    getCurrentTemplate,
    saveTemplate,
    deleteTemplate,
  }
})
