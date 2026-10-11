<script setup lang="ts">
/** 设置与帮助共用目录文档，常规选项修改即保存，关于复用更新和联系操作。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Modal,
  Form,
  FormItem,
  Select,
  RadioGroup,
  Radio,
  Checkbox,
  Tooltip,
} from 'antdv-next'
import { SlidersHorizontal, BadgeInfo, CircleAlert } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { SUPPORTED_LOCALES, isSupportedLocale } from '@/i18n'
import { feedback } from '@/lib/feedback'
import AboutDialog from '@/components/AboutDialog/index.vue'
import SectionDocument from '@/components/SectionDocument.vue'
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{ initialCategory?: string; navigationKey?: number }>(), {
  initialCategory: 'general',
})
const { t } = useI18n()
const settings = useSettingsStore()
const busy = ref(false)
const documentReady = ref(false)
// 首次定位等框架入场结束，避免缩放动画让 Anchor 计算到错误的章节位置。
watch(open, (value) => {
  if (!value) documentReady.value = false
})
function afterOpenChange(value: boolean): void {
  documentReady.value = value && open.value
}
const categories = computed(() =>
  ['general', 'about'].map((key) => ({
    key,
    href: `#app-settings-${key}`,
    title: t(`appSettings.${key}`),
  }))
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
    destroy-on-hidden
    width="min(780px, calc(100vw - 32px))"
    :styles="{ body: { height: 'min(72vh, 640px)', overflow: 'hidden' } }"
    :after-open-change="afterOpenChange"
    root-class="app-settings-modal"
  >
    <SectionDocument
      :items="categories"
      :contents-label="t('appSettings.contents')"
      :show-contents-title="false"
      :initial-href="open && documentReady ? `#app-settings-${props.initialCategory}` : undefined"
      :navigation-key="props.navigationKey"
    >
      <template #item="{ item }">
        <span class="flex items-center gap-2">
          <component
            :is="item.key === 'general' ? SlidersHorizontal : BadgeInfo"
            class="size-4 shrink-0"
            :stroke-width="2"
            aria-hidden="true"
          />
          {{ item.title }}
        </span>
      </template>
      <section
        id="app-settings-general"
        class="scroll-mt-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-4"
        aria-labelledby="app-settings-general-title"
      >
        <h3
          id="app-settings-general-title"
          class="m-0 mb-4 flex items-center gap-2 text-sm font-semibold"
        >
          <SlidersHorizontal
            class="size-4 shrink-0 text-primary"
            :stroke-width="2"
            aria-hidden="true"
          />
          {{ t('appSettings.general') }}
        </h3>
        <Form layout="vertical">
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
          <FormItem :label="t('appSettings.closeBehavior')" class="mb-0">
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
            <div class="mt-3 flex items-center gap-1.5">
              <Checkbox
                :checked="!settings.closeActionConfirmed"
                :disabled="busy"
                @update:checked="save(() => settings.setCloseAction(settings.closeAction, !$event))"
              >
                {{ t('appSettings.askClose') }}
              </Checkbox>
              <Tooltip :title="t('appSettings.closeHint')" :trigger="['hover', 'focus']">
                <button
                  type="button"
                  class="nikki-icon-button flex size-4 shrink-0 items-center justify-center rounded p-0"
                  :aria-label="t('appSettings.closeHintLabel')"
                >
                  <CircleAlert :size="14" :stroke-width="2" aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </FormItem>
        </Form>
      </section>
      <!-- 末节至少占一屏，保证目录定位能将“关于”标题滚到顶部并同步高亮。 -->
      <section
        id="app-settings-about"
        class="mt-3 min-h-full scroll-mt-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-4"
        aria-labelledby="app-settings-about-title"
      >
        <h3
          id="app-settings-about-title"
          class="m-0 mb-4 flex items-center gap-2 text-sm font-semibold"
        >
          <BadgeInfo class="size-4 shrink-0 text-primary" :stroke-width="2" aria-hidden="true" />
          {{ t('appSettings.about') }}
        </h3>
        <AboutDialog embedded />
      </section>
    </SectionDocument>
  </Modal>
</template>
