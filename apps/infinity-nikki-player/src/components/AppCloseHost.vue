<script setup lang="ts">
/** 关闭选择与原生平台端口集中装配，普通页面无需了解托盘逻辑。 */
import { inject, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import {
  createAppCloseController,
  prepareAppQuit,
  type CloseChoice,
} from '@/features/app-close/controller'
import { APP_CLOSE_PLATFORM, tauriAppClose } from '@/platform/tauri/appClose'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { feedback } from '@/lib/feedback'
import CloseWindowPrompt from '@/components/CloseWindowPrompt.vue'
const props = defineProps<{ prepareQuitDisplay?: () => Promise<void> }>()
const settings = useSettingsStore()
const player = usePlayerStore()
const platform = inject(APP_CLOSE_PLATFORM, tauriAppClose)
const { t } = useI18n()
const open = ref(false)
// eslint-disable-next-line no-unused-vars -- 类型签名参数不参与运行时变量检查。
let resolve: ((choice: CloseChoice | null) => void) | undefined
let unlisten: (() => void) | undefined
let disposed = false
const controller = createAppCloseController({
  preferences: () => ({ action: settings.closeAction, confirmed: settings.closeActionConfirmed }),
  choose: () =>
    new Promise((done) => {
      resolve = done
      open.value = true
    }),
  remember: settings.setCloseAction,
  prepareQuit: async () => {
    // 迷你悬浮窗口先恢复正常尺寸，保存确认不能被小窗口裁掉。
    await props.prepareQuitDisplay?.()
    if (!(await prepareAppQuit())) return false
    await player.stopPreviewPlayback()
    await invoke('stop_playback')
    return true
  },
  hide: platform.hide,
  quit: platform.quit,
})
function choose(choice: CloseChoice | null): void {
  open.value = false
  resolve?.(choice)
  resolve = undefined
}
onMounted(async () => {
  try {
    const cleanup = await platform.listen((action) => {
      void controller
        .request(action)
        .catch((error) =>
          feedback.error(t('appSettings.closeFailed'), { description: String(error) })
        )
    })
    if (disposed) cleanup()
    else unlisten = cleanup
  } catch (error) {
    feedback.error(t('appSettings.closeFailed'), { description: String(error) })
  }
})
onBeforeUnmount(() => {
  disposed = true
  unlisten?.()
  choose(null)
})
</script>
<template>
  <CloseWindowPrompt :open="open" :initial-action="settings.closeAction" @choose="choose" />
</template>
