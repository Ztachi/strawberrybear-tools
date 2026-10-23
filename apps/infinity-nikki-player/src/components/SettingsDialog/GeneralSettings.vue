<script setup lang="ts">
/** 常规设置直接复用现有 Store 与界面偏好，保存失败保留原值。 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Checkbox, Radio, RadioGroup, Select, Switch, Tooltip } from 'antdv-next'
import { CircleAlert } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { SUPPORTED_LOCALES, isSupportedLocale } from '@/i18n'
import { useMidiEditorPreferences } from '@/features/midi-editor/preferences'
import { usePianoWorkspacePreferences } from '@/composables/usePianoWorkspacePreferences'
import type { DataPreferences } from '@/lib/dataManagement'
import { feedback } from '@/lib/feedback'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'

const props = defineProps<{ preferences: DataPreferences; saving: boolean; loaded: boolean }>()
const emit = defineEmits<{ preferences: [patch: Partial<DataPreferences>] }>()
const { t } = useI18n()
const settings = useSettingsStore()
const editor = useMidiEditorPreferences()
const workspace = usePianoWorkspacePreferences(false)
const busy = ref(false)
const startupOptions = computed(() =>
  (['launchOnStartup', 'silentStartup', 'autoCheckUpdates'] as const).filter(
    (key) => key !== 'silentStartup' || props.preferences.launchOnStartup
  )
)
const displayOptions = computed(
  () =>
    [
      { key: 'showOtherTracks', checked: workspace.value.showOtherTracks },
      { key: 'showVelocity', checked: editor.showVelocity.value },
      { key: 'dimUnplayable', checked: editor.dimUnplayable.value },
    ] as const
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
function setDisplay(
  key: 'showOtherTracks' | 'showVelocity' | 'dimUnplayable',
  checked: boolean
): void {
  if (key === 'showOtherTracks') workspace.value = { ...workspace.value, showOtherTracks: checked }
  else editor[key].value = checked
}
</script>
<template>
  <div class="space-y-3">
    <SettingsGroup :title="t('dataManagement.general.application')">
      <SettingsRow :title="t('appSettings.language')">
        <template #title>
          <label for="settings-language">{{ t('appSettings.language') }}</label>
        </template>
        <Select
          id="settings-language"
          :value="settings.locale"
          :options="SUPPORTED_LOCALES"
          :aria-label="t('appSettings.language')"
          :disabled="busy"
          class="w-36"
          @update:value="language"
        />
      </SettingsRow>
      <SettingsRow :title="t('appSettings.closeBehavior')">
        <template #details>
          <RadioGroup
            :value="settings.closeAction"
            :disabled="busy"
            class="flex flex-wrap gap-x-4 gap-y-2"
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
        </template>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup :title="t('dataManagement.general.startup')">
      <SettingsRow
        v-for="key in startupOptions"
        :key="key"
        :title="t(`dataManagement.preferences.${key}`)"
        :description="t(`dataManagement.hints.${key}`)"
      >
        <Switch
          :checked="preferences[key]"
          :disabled="saving || !loaded"
          :aria-label="t(`dataManagement.preferences.${key}`)"
          @update:checked="emit('preferences', { [key]: Boolean($event) })"
        />
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup :title="t('dataManagement.general.editor')">
      <SettingsRow
        v-for="option in displayOptions"
        :key="option.key"
        :title="t(`dataManagement.display.${option.key}`)"
      >
        <Switch
          :checked="option.checked"
          :aria-label="t(`dataManagement.display.${option.key}`)"
          @update:checked="setDisplay(option.key, Boolean($event))"
        />
      </SettingsRow>
    </SettingsGroup>
  </div>
</template>
