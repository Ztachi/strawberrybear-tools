<script setup lang="ts">
/** 设置只编排三个连续章节，目录与滚动继续交给共用 SectionDocument。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Alert, Button, Modal } from 'antdv-next'
import { BadgeInfo, Database, SlidersHorizontal } from 'lucide-vue-next'
import {
  dataManagement,
  DEFAULT_DATA_PREFERENCES,
  type DataPreferences,
} from '@/lib/dataManagement'
import { feedback } from '@/lib/feedback'
import AboutDialog from '@/components/AboutDialog/index.vue'
import SectionDocument from '@/components/SectionDocument.vue'
import GeneralSettings from './GeneralSettings.vue'
import DataSettings from './DataSettings.vue'

const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{ initialCategory?: string; navigationKey?: number }>(), {
  initialCategory: 'general',
})
const { t } = useI18n()
const documentReady = ref(false)
const preferences = ref<DataPreferences>({ ...DEFAULT_DATA_PREFERENCES })
const loaded = ref(false)
const saving = ref(false)
const loadError = ref('')
const dataSettings = ref<InstanceType<typeof DataSettings> | null>(null)
const closing = ref(false)
const categoryIcons = { general: SlidersHorizontal, data: Database, about: BadgeInfo }
const categories = computed(() =>
  ['general', 'data', 'about'].map((key) => ({
    key,
    href: `#app-settings-${key}`,
    title: key === 'data' ? t('dataManagement.title') : t(`appSettings.${key}`),
  }))
)

async function loadPreferences(): Promise<void> {
  loaded.value = false
  loadError.value = ''
  try {
    preferences.value = await dataManagement.getPreferences()
    loaded.value = true
  } catch (error) {
    loadError.value = String(error)
  }
}
watch(
  open,
  (value) => {
    if (!value) documentReady.value = false
    else void loadPreferences()
  },
  { immediate: true }
)
function afterOpenChange(value: boolean): void {
  documentReady.value = value && open.value
}
async function savePreferences(patch: Partial<DataPreferences>): Promise<boolean> {
  if (saving.value || !loaded.value) return false
  saving.value = true
  const next = { ...preferences.value, ...patch }
  try {
    await dataManagement.savePreferences(next)
    preferences.value = next
    return true
  } catch (error) {
    feedback.error(t('appSettings.saveFailed'), { description: String(error) })
    return false
  } finally {
    saving.value = false
  }
}
async function changeOpen(value: boolean): Promise<void> {
  if (value) {
    open.value = true
    return
  }
  if (closing.value || saving.value) return
  closing.value = true
  try {
    if ((await dataSettings.value?.canClose()) ?? true) open.value = false
  } finally {
    closing.value = false
  }
}
</script>
<template>
  <Modal
    :open="open"
    :title="t('appSettings.title')"
    :footer="null"
    centered
    destroy-on-hidden
    width="min(780px, calc(100vw - 32px))"
    :styles="{ body: { height: 'min(72vh, 640px)', overflow: 'hidden' } }"
    :after-open-change="afterOpenChange"
    root-class="app-settings-modal"
    @update:open="changeOpen"
  >
    <SectionDocument
      :items="categories"
      :contents-label="t('appSettings.contents')"
      :show-contents-title="false"
      :initial-href="open && documentReady ? `#app-settings-${props.initialCategory}` : undefined"
      :navigation-key="props.navigationKey"
    >
      <template #item="{ item }">
        <span class="flex items-center gap-2"
          ><component
            :is="categoryIcons[item.key as keyof typeof categoryIcons]"
            class="size-4 shrink-0"
            :stroke-width="2"
            aria-hidden="true"
          />{{ item.title }}</span
        >
      </template>
      <Alert
        v-if="loadError"
        type="error"
        show-icon
        class="mb-3"
        :title="t('dataManagement.loadFailed')"
        :description="loadError"
      >
        <template #action>
          <Button size="small" @click="loadPreferences">
            {{ t('dataManagement.retry') }}
          </Button>
        </template>
      </Alert>
      <section
        v-for="category in categories"
        :id="`app-settings-${category.key}`"
        :key="category.key"
        class="mb-6 scroll-mt-2 last:mb-0"
        :aria-labelledby="`app-settings-${category.key}-title`"
      >
        <h3
          :id="`app-settings-${category.key}-title`"
          class="m-0 mb-3 flex items-center gap-2 text-sm font-semibold"
        >
          <component
            :is="categoryIcons[category.key as keyof typeof categoryIcons]"
            class="size-4 shrink-0 text-primary"
            :stroke-width="2"
            aria-hidden="true"
          />{{ category.title }}
        </h3>
        <GeneralSettings
          v-if="category.key === 'general'"
          :preferences="preferences"
          :saving="saving"
          :loaded="loaded"
          @preferences="savePreferences"
        />
        <DataSettings
          v-else-if="category.key === 'data'"
          :ref="
            (instance) => {
              dataSettings = instance as InstanceType<typeof DataSettings> | null
            }
          "
          :preferences="preferences"
          :saving="saving"
          :loaded="loaded"
          :save-preferences="savePreferences"
          @preferences="savePreferences"
        />
        <AboutDialog v-else embedded />
      </section>
    </SectionDocument>
  </Modal>
</template>
