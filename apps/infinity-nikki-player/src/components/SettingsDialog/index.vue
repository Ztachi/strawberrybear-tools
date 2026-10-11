<script setup lang="ts">
/** 分类设置复用现有设置 Store、更新控制器和关于内容，修改即保存。 */
import { computed, h, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Modal,
  Menu,
  Form,
  FormItem,
  Select,
  RadioGroup,
  Radio,
  Checkbox,
  InputNumber,
} from 'antdv-next'
import { Settings, Music2, RefreshCw, Info } from 'lucide-vue-next'
import { getVersion } from '@tauri-apps/api/app'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { SUPPORTED_LOCALES, isSupportedLocale } from '@/i18n'
import { feedback } from '@/lib/feedback'
import AboutDialog from '@/components/AboutDialog/index.vue'
import AppUpdateStatus from '@/components/AppUpdateStatus.vue'
import type { PlaybackMode } from '@strawberrybear/player'
import { MIN_PLAYBACK_FPS, MAX_PLAYBACK_FPS } from '@/lib/keyboardTiming'
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{ initialCategory?: string }>(), {
  initialCategory: 'general',
})
const { t } = useI18n()
const settings = useSettingsStore()
const player = usePlayerStore()
const category = ref('general')
const busy = ref(false)
const version = ref('')
const categories = computed(() =>
  [
    { key: 'general', icon: Settings },
    { key: 'playback', icon: Music2 },
    { key: 'updates', icon: RefreshCw },
    { key: 'about', icon: Info },
  ].map((item) => ({
    key: item.key,
    label: t(`appSettings.${item.key}`),
    icon: () => h(item.icon, { size: 16 }),
  }))
)
const playbackOptions = computed(() =>
  ['sequential', 'shuffle', 'repeat-one', 'repeat-all'].map((value) => ({
    value,
    label: t(`overlay.playbackModes.${value}`),
  }))
)
watch(open, async (value) => {
  if (!value) return
  category.value = props.initialCategory
  try {
    version.value = await getVersion()
  } catch (error) {
    feedback.error(t('appSettings.saveFailed'), { description: String(error) })
  }
})
// 系统“关于”菜单也能在已打开的设置中定位分类。
watch(
  () => props.initialCategory,
  (value) => {
    if (open.value) category.value = value
  }
)
async function save(change: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await change()
  } catch (error) {
    feedback.error(t('appSettings.saveFailed'), { description: String(error) })
  } finally {
    busy.value = false
  }
}
function language(value: unknown): void {
  if (typeof value === 'string' && isSupportedLocale(value))
    void save(() => settings.setLocale(value))
}
function order(value: unknown): void {
  void save(async () => {
    await settings.setPlaylistPlaybackMode(value as PlaybackMode)
    player.applyPlaylistPlaybackMode()
  })
}
function closeAction(value: unknown): void {
  if (value === 'tray' || value === 'quit') void save(() => settings.setCloseAction(value))
}
</script>
<template>
  <Modal
    v-model:open="open"
    :title="t('appSettings.title')"
    :footer="null"
    centered
    width="min(780px, calc(100vw - 32px))"
    :styles="{ body: { padding: 0 } }"
    root-class="app-settings-modal"
  >
    <div class="settings-layout flex min-h-[360px] max-h-[calc(100dvh-160px)] overflow-hidden">
      <Menu
        class="settings-menu w-40 shrink-0"
        mode="inline"
        :items="categories"
        :selected-keys="[category]"
        @click="category = String($event.key)"
      />
      <div class="settings-body min-w-0 flex-1 overflow-y-auto p-5" data-text-selectable>
        <Form v-if="category === 'general'" layout="vertical">
          <FormItem :label="t('appSettings.language')" html-for="settings-language">
            <Select
              id="settings-language"
              :value="settings.locale"
              :options="SUPPORTED_LOCALES"
              :aria-label="t('appSettings.language')"
              :disabled="busy"
              class="w-full max-w-64"
              @update:value="language"
            />
          </FormItem>
          <FormItem :label="t('appSettings.closeBehavior')">
            <RadioGroup
              :value="settings.closeAction"
              :disabled="busy"
              class="flex flex-col gap-3"
              @update:value="closeAction"
            >
              <Radio value="tray">
                {{ t('appSettings.tray') }}
              </Radio>
              <Radio value="quit">
                {{ t('appSettings.quit') }}
              </Radio>
            </RadioGroup>
            <p class="mt-3 text-sm text-muted-foreground">
              {{ t('appSettings.closeHint') }}
            </p>
            <Checkbox
              :checked="!settings.closeActionConfirmed"
              :disabled="busy"
              @update:checked="save(() => settings.setCloseAction(settings.closeAction, !$event))"
            >
              {{ t('appSettings.askClose') }}
            </Checkbox>
          </FormItem>
        </Form>
        <Form v-else-if="category === 'playback'" layout="vertical">
          <FormItem :label="t('appSettings.playbackMode')" html-for="settings-playback-order">
            <Select
              id="settings-playback-order"
              :value="settings.playlistPlaybackMode"
              :options="playbackOptions"
              :disabled="busy"
              @update:value="order"
            />
          </FormItem>
          <FormItem :label="t('appSettings.fps')" html-for="settings-fps">
            <InputNumber
              id="settings-fps"
              :value="settings.manualFps"
              :min="MIN_PLAYBACK_FPS"
              :max="MAX_PLAYBACK_FPS"
              :precision="0"
              :disabled="busy"
              @update:value="save(() => settings.setManualFps(Number($event)))"
            />
            <p class="mt-3 text-sm text-muted-foreground">
              {{ t('appSettings.fpsHint') }}
            </p>
            <Checkbox
              :checked="settings.autoFpsEnabled"
              :disabled="busy"
              @update:checked="save(() => settings.setAutoFpsEnabled($event))"
            >
              {{ t('appSettings.autoFps') }}
            </Checkbox>
          </FormItem>
        </Form>
        <div v-else-if="category === 'updates'" class="space-y-4">
          <h3 class="text-base font-semibold">
            {{ t('appSettings.updates') }}
          </h3>
          <AppUpdateStatus :version="version" />
          <p class="text-muted-foreground">
            {{ t('appSettings.updateHint') }}
          </p>
        </div>
        <AboutDialog v-else embedded />
      </div>
    </div>
  </Modal>
</template>
<style scoped>
@media (max-width: 560px) {
  .settings-layout {
    flex-direction: column;
  }
  /* Menu 的根节点经过框架内部转发；从本组件布局节点深选才能命中。 */
  .settings-layout :deep(.settings-menu) {
    width: 100%;
    display: flex;
    overflow-x: auto;
    border-inline-end: 0;
    flex-shrink: 0;
  }
  .settings-layout :deep(.settings-menu .ant-menu-item) {
    flex-shrink: 0;
    width: auto;
    padding-inline: 12px !important;
  }
  .settings-body {
    padding: 16px;
  }
}
</style>
