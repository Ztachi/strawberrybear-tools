import { sound } from '@pixi/sound'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { loadSettings, saveSettings, type SettingsRecord } from '@/db/database'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<SettingsRecord>({
    id: 'settings',
    volume: 0.75,
    muted: false,
    locale: 'zh-CN',
    tutorialCompleted: false,
    keys: { left: 'KeyA', right: 'KeyL', launch: 'Space' },
  })
  let initialized = false

  /** @description 加载设置并开始持久化监听 @return {Promise<void>} 初始化完成 */
  async function init(): Promise<void> {
    settings.value = await loadSettings()
    applyAudio()
    if (initialized) return
    initialized = true
    watch(
      settings,
      async (value) => {
        applyAudio()
        await saveSettings(value)
      },
      { deep: true }
    )
  }

  /** @description 应用全局音量和静音状态 @return {void} */
  function applyAudio(): void {
    sound.volumeAll = settings.value.volume
    settings.value.muted ? sound.muteAll() : sound.unmuteAll()
  }

  /** @description 切换统一静音 @return {void} */
  function toggleMuted(): void {
    settings.value.muted = !settings.value.muted
  }

  return { settings, init, toggleMuted }
})
