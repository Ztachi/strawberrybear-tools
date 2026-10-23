<script setup lang="ts">
/** 关于以应用身份、更新、项目链接与支持信息分组，更新继续复用唯一状态机。 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Button, Modal } from 'antdv-next'
import { ExternalLink, Github, ScrollText } from 'lucide-vue-next'
import AppUpdateStatus from '@/components/AppUpdateStatus.vue'
import AppContact from '@/components/AppContact.vue'
import SettingsGroup from '@/components/SettingsDialog/SettingsGroup.vue'
import { useReleaseNotes } from '@/composables/useReleaseNotes'
import { useAppUpdater } from '@/composables/useAppUpdater'
import { useMainWindowUiStore, type FloatingActionRegistration } from '@/stores/mainWindowUi'
import { feedback } from '@/lib/feedback'
import appLogo from '@/assets/images/logo.png'

const props = defineProps<{ embedded?: boolean }>()
const { t } = useI18n()
const releaseNotes = useReleaseNotes()
const updater = useAppUpdater()
const ui = useMainWindowUiStore()
const isOpen = ref(false)
const version = ref('')
const aboutBody = ref<HTMLElement | null>(null)
let unlisten: (() => void) | undefined
let backToTop: FloatingActionRegistration | undefined
watch(isOpen, (value) => {
  if (props.embedded) return
  backToTop?.()
  backToTop = value
    ? ui.registerBackToTop(() => aboutBody.value?.scrollTo({ top: 0, behavior: 'smooth' }))
    : undefined
})
const links = [
  { key: 'website', icon: ExternalLink, url: 'https://ztachi.com/tools/infinity-nikki-player' },
  {
    key: 'source',
    icon: Github,
    url: 'https://github.com/Ztachi/strawberrybear-tools/tree/main/apps/infinity-nikki-player',
  },
]
async function show(): Promise<void> {
  if (!version.value) version.value = await getVersion()
  isOpen.value = true
}
async function showReleaseNotes(): Promise<void> {
  try {
    await releaseNotes.showHistory()
  } catch (error) {
    feedback.error(t('releaseNotes.loadFailed'), { description: String(error) })
  }
}
async function openLink(url: string): Promise<void> {
  try {
    await invoke('open_url', { url })
  } catch (error) {
    feedback.error(t('dataManagement.operationFailed'), { description: String(error) })
  }
}
onMounted(async () => {
  if (props.embedded) await show()
  else
    unlisten = await listen('show_about', () => {
      void show()
    })
})
onUnmounted(() => {
  unlisten?.()
  backToTop?.()
})
</script>
<template>
  <component
    :is="embedded ? 'section' : Modal"
    v-bind="
      embedded
        ? { class: 'embedded-about' }
        : {
          open: isOpen,
          'onUpdate:open': (value: boolean) => (isOpen = value),
          footer: null,
          width: 'min(520px, calc(100vw - 32px))',
          centered: true,
          rootClass: 'about-modal-root',
        }
    "
  >
    <div
      data-text-selectable
      class="about-card flex min-h-0 flex-col gap-3"
      :style="embedded ? undefined : { height: 'min(72vh, 640px)' }"
    >
      <div
        class="about-header flex shrink-0 flex-wrap items-center gap-4 rounded-xl border border-primary/15 bg-primary/[0.035] p-4"
      >
        <div class="about-icon size-14 shrink-0 overflow-hidden rounded-2xl">
          <img :src="appLogo" class="size-full object-cover" :alt="t('app.title')" />
        </div>
        <div class="min-w-0 flex-1 basis-32">
          <h2 class="about-app-name m-0 text-base font-semibold leading-6">
            {{ t('app.title') }}
          </h2>
          <p
            class="about-current-version mb-0 mt-1 text-xs tabular-nums text-[var(--color-muted-dark)]"
          >
            v{{ version }}
          </p>
        </div>
        <AppUpdateStatus :version="version" presentation="action" />
      </div>
      <div
        ref="aboutBody"
        class="about-body min-h-0 space-y-3"
        :style="embedded ? undefined : { overflowY: 'auto', flex: '1 1 auto' }"
        @scroll="backToTop?.setVisible((aboutBody?.scrollTop ?? 0) > 200)"
      >
        <SettingsGroup :title="t('dataManagement.about.version')">
          <div class="about-actions flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0 flex-1 basis-44 text-xs text-[var(--color-muted-dark)]">
              {{ t('about.currentVersion') }} v{{ version }}
              <p v-if="updater.state.value.targetVersion" class="mb-0 mt-1">
                {{
                  t('dataManagement.about.newVersion', { version: updater.state.value.targetVersion })
                }}
              </p>
              <p
                v-if="updater.state.value.targetVersion && updater.state.value.releaseSummary?.trim()"
                class="about-release-summary mb-0 mt-2 line-clamp-3 whitespace-pre-line break-words"
              >
                {{ updater.state.value.releaseSummary.trim() }}
              </p>
            </div>
            <Button size="small" class="about-release-notes" @click="showReleaseNotes">
              <template #icon>
                <ScrollText :size="14" :stroke-width="2" aria-hidden="true" /> </template
              >{{ t('releaseNotes.title') }}
            </Button>
          </div>
        </SettingsGroup>
        <SettingsGroup :title="t('dataManagement.about.links')">
          <div class="flex flex-wrap gap-2">
            <Button v-for="link in links" :key="link.key" size="small" @click="openLink(link.url)">
              <template #icon>
                <component
                  :is="link.icon"
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                /> </template
              >{{ t(`dataManagement.about.${link.key}`) }}
            </Button>
          </div>
        </SettingsGroup>
        <SettingsGroup :title="t('dataManagement.about.contact')">
          <AppContact :show-header="false" />
        </SettingsGroup>
      </div>
    </div>
  </component>
</template>
