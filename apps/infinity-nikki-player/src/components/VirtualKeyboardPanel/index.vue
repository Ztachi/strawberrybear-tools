<script setup lang="ts">
/**
 * @description: 通用虚拟键盘面板
 * @description 统一承载模板发音、键盘模拟、模板选择、播放高亮和按键日志。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Switch, Tooltip } from 'antdv-next'
import { HelpCircle } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import KeyboardPreview from '@/components/KeyboardPreview/index.vue'
import { mappingKeyToCode } from '@/components/KeyboardPreview/constants'
import { KeyboardMapper } from '@/lib/keyboardMapper'
import type { KeyLogEntry } from '@/lib/keyboardMapper'
import { playNote } from '@/lib/midiPlayer'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

/** 当前面板持有的键盘映射器，负责播放高亮、日志和键盘模拟副作用。 */
const keyboardMapper = ref<KeyboardMapper | null>(null)
/** 当前页面会话内的按键日志，离开页面后自然重置。 */
const keyLog = ref<KeyLogEntry[]>([])
/** immediate watcher 首次执行只初始化页面，不应误触发全局播放过滤重排。 */
let hasInitializedTemplate = false

/** 当前模板的物理按键 code 到音高映射，用于虚拟键盘标签和点击试听。 */
const keyCodeToPitch = computed<Map<string, number>>(() => {
  const map = new Map<string, number>()
  const template = settingsStore.getCurrentTemplate()
  if (!template) return map
  for (const mapping of template.mappings) {
    map.set(mappingKeyToCode(mapping.key), mapping.pitch)
  }
  return map
})

/** 当前正在播放的音符对应的虚拟键盘高亮集合。 */
const activeKeys = computed<Set<string>>(() => {
  if (settingsStore.playMode !== 'piano' || !keyboardMapper.value) {
    return new Set()
  }
  const codes = new Set<string>()
  for (const note of playerStore.activeNotes) {
    const result = keyboardMapper.value.mapPitch(note.pitch)
    if (result) codes.add(result.code)
  }
  return codes
})

/**
 * @description: 初始化或更新键盘映射器模板。
 * @return {void} 无返回值
 */
function initKeyboardMapper(): void {
  const template = settingsStore.getCurrentTemplate()
  if (!template) return
  if (!keyboardMapper.value) {
    keyboardMapper.value = new KeyboardMapper()
    keyboardMapper.value.setKeyLogCallback((entry: KeyLogEntry) => {
      keyLog.value = [...keyLog.value, entry]
    })
    keyboardMapper.value.setKeyboardSimCallback((action: string, key: string) => {
      if (
        (settingsStore.enableKeyboardSim || settingsStore.isOverlayMode) &&
        settingsStore.playMode === 'piano'
      ) {
        const command = action === 'press' ? 'simulate_key_down' : 'simulate_key_up'
        invoke(command, { key }).catch(console.error)
      }
    })
  }
  keyboardMapper.value.setTemplate(template)
}

/**
 * @description: 获取章节化按键日志。
 * @return {ReturnType<KeyboardMapper['getKeyLogByChapters']>} 章节化日志
 */
function getKeyLogByChapters() {
  return keyboardMapper.value?.getKeyLogByChapters() ?? []
}

/**
 * @description: 清空当前页面会话的按键日志。
 * @return {void} 无返回值
 */
function clearKeyLog(): void {
  keyboardMapper.value?.clearKeyLog()
  keyLog.value = []
}

/**
 * @description: 点击虚拟键盘时按当前模板试听对应音高。
 * @param {string} code - 物理键盘 code
 * @return {void} 无返回值
 */
function handleKeyClick(code: string): void {
  const pitch = keyCodeToPitch.value.get(code)
  if (pitch !== undefined) {
    playNote(pitch, 80, 0.5)
  }
}

/**
 * @description: 切换模板发音模式。
 * @param {unknown} isPiano - Switch 发出的选中值
 * @return {void} 无返回值
 */
function handleModeSwitch(isPiano: unknown): void {
  void settingsStore.setPlayMode(isPiano === true ? 'piano' : 'auto')
  if (playerStore.isPreviewPlaying) {
    playerStore.applyPlayModeFilter()
  }
}

watch(
  () => settingsStore.currentTemplateId,
  () => {
    // 模板变更会改变按键语义，必须先释放旧状态，避免日志和模拟按键继承旧模板。
    keyboardMapper.value?.reset()
    keyLog.value = []
    initKeyboardMapper()
    if (hasInitializedTemplate && playerStore.isPreviewPlaying) {
      playerStore.applyPlayModeFilter()
    }
    hasInitializedTemplate = true
  },
  { immediate: true }
)

watch(
  () => [playerStore.activeNotes, settingsStore.playMode] as const,
  ([notes]) => {
    if (!keyboardMapper.value || settingsStore.playMode !== 'piano') {
      keyboardMapper.value?.clearKeyState(playerStore.previewCurrentTime)
      return
    }
    if (notes.length === 0) {
      keyboardMapper.value.clearKeyState(playerStore.previewCurrentTime)
    } else {
      keyboardMapper.value.setActiveNotes(notes, playerStore.previewCurrentTime)
    }
  }
)

onBeforeUnmount(() => {
  // 离开页面时主动释放可能仍处于按下态的模拟键，避免真实键盘输入残留。
  keyboardMapper.value?.clearKeyState(playerStore.previewCurrentTime)
})
</script>

<template>
  <KeyboardPreview
    class="h-full w-full"
    :active-keys="activeKeys"
    :key-log="keyLog"
    :get-key-log-by-chapters="getKeyLogByChapters"
    :clear-key-log="clearKeyLog"
    :key-code-to-pitch="keyCodeToPitch"
    vertical-align="top"
    @key-click="handleKeyClick"
  >
    <template #toolbarLeft>
      <div class="keyboard-mode-controls">
        <div class="mode-toggle">
          <Switch
            :checked="settingsStore.playMode === 'piano'"
            @update:checked="handleModeSwitch"
          />
          <span class="mode-label">{{ t('player.pianoMode') }}</span>
        </div>
        <div class="mode-toggle">
          <Switch
            :checked="settingsStore.enableKeyboardSim"
            :disabled="settingsStore.playMode !== 'piano'"
            @update:checked="(v) => settingsStore.setEnableKeyboardSim(!!v)"
          />
          <span class="mode-label" :class="{ disabled: settingsStore.playMode !== 'piano' }">
            {{ t('player.keyboardSim') }}
          </span>
          <Tooltip :title="t('player.keyboardSimTip')">
            <HelpCircle class="help-icon" />
          </Tooltip>
        </div>
        <KeyTemplateSelect class="min-w-[168px] max-w-[240px] flex-1" />
      </div>
    </template>
  </KeyboardPreview>
</template>

<style scoped>
.keyboard-mode-controls {
  @apply flex min-w-0 flex-wrap items-center gap-4;
}

.mode-toggle {
  @apply flex items-center gap-2;
}

.mode-label {
  @apply whitespace-nowrap text-xs;
  color: var(--color-muted-dark);
}

.mode-label.disabled {
  opacity: 0.5;
}

.help-icon {
  width: 14px;
  height: 14px;
  color: var(--color-muted);
}
</style>
