<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-17 10:55:52
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-06-06 22:06:45
 * @FilePath: \strawberrybear-tools\apps\infinity-nikki-player\src\components\AboutDialog\index.vue
 * @Description: 关于对话框组件
-->
<script setup lang="ts">
/**
 * @description: 关于对话框组件
 * @description 监听 Tauri 菜单的 show_about 事件显示，包含应用图标、版本号和更新操作
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { ScrollText, FileDown } from 'lucide-vue-next'
import appLogo from '@/assets/images/logo.png'
import { Button, Modal } from 'antdv-next'
import AppUpdateStatus from '@/components/AppUpdateStatus.vue'
import { useAppUpdater } from '@/composables/useAppUpdater'
import { useReleaseNotes } from '@/composables/useReleaseNotes'
import { feedback } from '@/lib/feedback'
import { useMainWindowUiStore, type FloatingActionRegistration } from '@/stores/mainWindowUi'

const props = defineProps<{ embedded?: boolean }>()
const { t } = useI18n()
const ui = useMainWindowUiStore()
const updater = useAppUpdater()
const releaseNotes = useReleaseNotes()
const aboutBody = ref<HTMLElement | null>(null)
let backToTop: FloatingActionRegistration | undefined

/** 对话框打开状态 @return {boolean} */
const isOpen = ref(false)
watch(isOpen, (open) => {
  // 内嵌内容由设置的滚动区承载，不占用独立弹窗的全局回到顶部入口。
  if (props.embedded) return
  backToTop?.()
  backToTop = open ? ui.registerBackToTop(() => aboutBody.value?.scrollTo({ top: 0, behavior: 'smooth' })) : undefined
})

/** 应用版本号 @return {string} */
const version = ref('')

/** 事件监听取消函数 */
let unlisten: (() => void) | undefined

/**
 * @description: 显示关于对话框
 * 首次打开时获取应用版本号
 */
async function show() {
  if (!version.value) {
    version.value = await getVersion()
  }
  isOpen.value = true
}

/** @return 打开完整日志；读取故障通过全局通知反馈，关于弹窗保持可操作。 */
async function showReleaseNotes(): Promise<void> {
  try {
    await releaseNotes.showHistory()
  } catch (error: unknown) {
    feedback.error(t('releaseNotes.loadFailed'), { description: String(error) })
  }
}

/** 组件挂载时监听 show_about 事件 */
onMounted(async () => {
  if (props.embedded) await show()
  else unlisten = await listen('show_about', () => show())
})

/** 组件卸载时取消事件监听 */
onUnmounted(() => {
  unlisten?.()
  backToTop?.()
})
</script>

<template>
  <component
    :is="embedded ? 'section' : Modal"
    v-bind="embedded ? { class: 'embedded-about' } : { open: isOpen, 'onUpdate:open': (value: boolean) => isOpen = value, footer: null, width: 'min(440px, calc(100vw - 32px))', centered: true, rootClass: 'about-modal-root' }"
  >
    <div data-text-selectable class="about-card">
      <div class="about-header">
        <div class="about-icon">
          <img :src="appLogo" class="about-icon-img" :alt="t('app.title')" />
        </div>
        <h2 v-if="!embedded" class="about-app-name">
          {{ t('app.title') }}
        </h2>
        <p class="about-current-version">
          {{ t('about.currentVersion') }}<span class="ml-2 tabular-nums">v{{ version }}</span>
        </p>
      </div>
      <div
        ref="aboutBody"
        class="about-body"
        @scroll="backToTop?.setVisible((aboutBody?.scrollTop ?? 0) > 200)"
      >
        <div class="about-actions">
          <AppUpdateStatus :version="version" presentation="action" />
          <Button size="small" class="about-release-notes" @click="showReleaseNotes">
            <template #icon>
              <ScrollText :size="14" :stroke-width="2" aria-hidden="true" />
            </template>
            {{ t('releaseNotes.title') }}
          </Button>
          <Button size="small" @click="updater.exportDiagnostics">
            <template #icon>
              <FileDown :size="14" :stroke-width="2" aria-hidden="true" />
            </template>
            {{ t('updater.exportDiagnostics') }}
          </Button>
        </div>
      </div>
    </div>
  </component>
</template>

<style scoped>
.about-card {
  @apply flex flex-col gap-4;
}
.about-header {
  @apply flex flex-col items-center gap-3;
}
.about-icon {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 18px;
  overflow: hidden;
}
.about-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.about-app-name {
  @apply m-0 text-base font-semibold;
}
.about-current-version {
  margin: 0;
  color: var(--color-muted-dark);
  font-size: 13px;
}
.about-actions {
  @apply flex flex-wrap items-center justify-center gap-2;
}
.embedded-about .about-header {
  align-items: flex-start;
}
.embedded-about .about-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
}
.embedded-about .about-actions {
  justify-content: flex-start;
}
</style>
