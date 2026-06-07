<script setup lang="ts">
// MIDI 详情面板组件 - 展示 MIDI 文件的详细信息，包括播放器、模板选择、键盘预览和钢琴卷帘
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { KeyboardMapper } from '@/lib/keyboardMapper'
import { playNote } from '@/lib/midiPlayer'
import { mappingKeyToCode } from '@/components/KeyboardPreview/constants'
import type { KeyLogEntry } from '@/lib/keyboardMapper'
import PreviewPlayer from '@/components/PreviewPlayer/index.vue'
import KeyboardPreview from '@/components/KeyboardPreview/index.vue'
import KeyTemplateSelect from '@/components/KeyTemplateSelect.vue'
import PianoRoll from '@strawberrybear/piano-roll'
import { Music, Music2, Monitor } from 'lucide-vue-next'
import { Button, Tooltip } from 'antdv-next'
import type { TrackInfo } from '@/types'

const { t } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()

// 键盘映射器实例（用于管理按键日志和键盘模拟）
const keyboardMapper = ref<KeyboardMapper | null>(null) as any

// 按键日志（响应式）- 必须放在 watch 之前定义
const keyLog = ref<KeyLogEntry[]>([])

// 初始化键盘映射器 - 创建键盘映射器实例，设置日志回调和键盘模拟回调
function initKeyboardMapper() {
  const template = settingsStore.getCurrentTemplate()
  if (template) {
    if (!keyboardMapper.value) {
      keyboardMapper.value = new KeyboardMapper()
      // 设置日志回调，实时更新日志
      keyboardMapper.value.setKeyLogCallback((entry: KeyLogEntry) => {
        keyLog.value = [...keyLog.value, entry]
      })
      // 设置键盘模拟回调（仅在模板演奏+键盘模拟模式下生效，悬浮模式强制启用）
      keyboardMapper.value.setKeyboardSimCallback((action: string, key: string) => {
        if (
          (settingsStore.enableKeyboardSim || settingsStore.isOverlayMode) &&
          settingsStore.playMode === 'piano'
        ) {
          if (action === 'press') {
            invoke('simulate_key_down', { key }).catch(console.error)
          } else {
            invoke('simulate_key_up', { key }).catch(console.error)
          }
        }
      })
    }
    keyboardMapper.value.setTemplate(template)
  }
}

// 监听模板变化 - 切换模板时停止播放、重置映射器并重新初始化
watch(
  () => settingsStore.currentTemplateId,
  () => {
    // 切换模板时停止播放，让用户重新开始
    if (playerStore.isPreviewPlaying) {
      void playerStore.stopPreviewPlayback()
    }
    // 重置 keyboardMapper（包括清空日志）
    if (keyboardMapper.value) {
      keyboardMapper.value.reset()
      // 清空本地日志
      keyLog.value = []
    }
    initKeyboardMapper()
  },
  { immediate: true }
)

// 监听活跃音符变化 - 将活跃音符同步到 KeyboardMapper，用于同步键盘高亮（仅在模板演奏模式下执行）
watch(
  () => playerStore.activeNotes,
  (notes) => {
    // 非模板演奏模式不处理
    if (settingsStore.playMode !== 'piano') return
    if (!keyboardMapper.value) return
    if (notes.length === 0) {
      // 空音符时也要清空按键状态，避免残留
      keyboardMapper.value.clearKeyState(playerStore.previewCurrentTime)
    } else {
      keyboardMapper.value.setActiveNotes(notes, playerStore.previewCurrentTime)
    }
  }
)

// 监听当前 MIDI 变化 - 切换歌曲时重置映射器
watch(
  () => playerStore.currentMidi?.filename,
  () => {
    if (keyboardMapper.value) {
      keyboardMapper.value.reset()
    }
    keyLog.value = [] // 清空日志
    initKeyboardMapper()
  }
)

// 当前激活的按键集合 - 根据当前活跃音符和模板映射计算激活的按键（仅在模板演奏模式下显示）
const activeKeys = computed<Set<string>>(() => {
  // 非模板演奏模式不显示按键状态
  if (settingsStore.playMode !== 'piano') {
    return new Set()
  }
  if (!keyboardMapper.value) {
    return new Set()
  }
  // 从 midiPlayer 传来的活跃音符（已经过过滤和映射）
  const notes = playerStore.activeNotes
  // 转换为键盘 code 集合
  const codes = new Set<string>()
  for (const note of notes) {
    // 使用 keyboardMapper 将 pitch 映射到键盘 code
    const result = keyboardMapper.value.mapPitch(note.pitch)
    if (result) {
      codes.add(result.code)
    }
  }
  return codes
})

// 获取章节化的按键日志
function getKeyLogByChapters() {
  return keyboardMapper.value?.getKeyLogByChapters() ?? []
}

// 清空按键日志
function handleClearKeyLog() {
  keyboardMapper.value?.clearKeyLog()
  keyLog.value = []
}

// 切换音轨启用状态
function handleToggleTrack(trackIndex: number) {
  playerStore.toggleTrack(trackIndex)
}

// 按键代码到音符号的映射 - 用于点击键盘按键时发音
const keyCodeToPitch = computed<Map<string, number>>(() => {
  const map = new Map<string, number>()
  const template = settingsStore.getCurrentTemplate()
  if (template) {
    for (const mapping of template.mappings) {
      // 将模板的按键名称（如 "Q"）转换为键盘 code（如 "KeyQ"）
      const code = mappingKeyToCode(mapping.key)
      map.set(code, mapping.pitch)
    }
  }
  return map
})

// 点击键盘按键发音
function handleKeyClick(code: string) {
  const pitch = keyCodeToPitch.value.get(code)
  if (pitch !== undefined) {
    playNote(pitch, 80, 0.5) // 力度 80，持续 0.5 秒
  }
}

// 带翻译名称的音轨列表 - 将音轨信息中的名称字段替换为国际化后的名称
const translatedTracks = computed<TrackInfo[]>(() => {
  return playerStore.tracks.map((track) => {
    if (track.name.includes('|percussion')) {
      // 打击乐器音轨使用特殊翻译
      return { ...track, name: t('midi.percussionTrack') }
    }
    // 普通音轨：数字 + i18n
    return { ...track, name: `${t('midi.trackIndex', { n: Number(track.name) })}` }
  })
})

// 进入悬浮模式 - 将窗口转换为悬浮模式，启用透明背景和置顶
async function enterOverlayMode() {
  try {
    // 确保当前 MIDI 已选中（详情页本身就是选中状态）
    if (!playerStore.currentMidi && playerStore.midiLibrary.length > 0) {
      playerStore.selectMidi(playerStore.midiLibrary[0])
    }
    // 停止播放
    void playerStore.stopPreviewPlayback()
    playerStore.setPreviewTime(0)
    // 保存进入前的播放模式，退出时恢复
    settingsStore.modeBeforeOverlay = settingsStore.playMode
    settingsStore.setPlayMode('piano')
    // 调用 Rust 命令修改窗口
    await invoke('enter_overlay_mode')
    // Rust 已保存主窗口状态并调整尺寸后，再切换前端悬浮 UI。
    settingsStore.isOverlayMode = true
  } catch (e) {
    settingsStore.setPlayMode(settingsStore.modeBeforeOverlay)
    settingsStore.isOverlayMode = false
    console.error('进入悬浮模式失败:', e)
  }
}
</script>

<template>
  <div class="midi-detail">
    <!-- 顶部区域：左侧播放器 + 右侧键盘预览 -->
    <div class="detail-header">
      <!-- 左侧：播放器 + 模板选择 -->
      <div class="left-section">
        <!-- 预览播放器 -->
        <div class="preview-section">
          <PreviewPlayer />
        </div>

        <!-- 模板选择区 -->
        <div class="template-section">
          <!-- 模板下拉选择器 -->
          <KeyTemplateSelect class="flex-1 w-1" />

          <!-- 进入悬浮模式按钮 -->
          <Tooltip :title="t('app.overlayMode')">
            <Button type="primary" class="overlay-btn" @click="enterOverlayMode">
              <template #icon>
                <Monitor class="overlay-btn-icon" />
              </template>
            </Button>
          </Tooltip>
        </div>
      </div>

      <!-- 右侧：键盘预览 -->
      <div class="keyboard-section">
        <KeyboardPreview
          :active-keys="activeKeys"
          :key-log="keyLog"
          :get-key-log-by-chapters="getKeyLogByChapters"
          :clear-key-log="handleClearKeyLog"
          :key-code-to-pitch="keyCodeToPitch"
          @key-click="handleKeyClick"
        />
      </div>
    </div>

    <!-- 音轨列表区域 -->
    <div class="tracks-section">
      <div class="section-header">
        <div class="section-title-group">
          <h3 class="section-title">
            {{ t('midi.trackList') }}
          </h3>
          <div class="section-stats">
            <!-- 音轨数统计 -->
            <span class="stat">
              <Music :size="14" class="text-success" />
              <span class="stat-value">{{ playerStore.currentMidi?.track_count }}</span>
              <span class="stat-label">{{ t('midi.tracks') }}</span>
            </span>
            <!-- 旋律音符数统计 -->
            <span class="stat">
              <Music2 :size="14" class="text-success" />
              <span class="stat-value">{{ playerStore.melody.length }}</span>
              <span class="stat-label">{{ t('midi.melodyNotes') }}</span>
            </span>
          </div>
        </div>
      </div>

      <div class="tracks-scroll">
        <!-- 钢琴卷帘组件 -->
        <PianoRoll
          :key="playerStore.currentMidi?.filename || 'empty'"
          :notes="playerStore.currentMidi?.events || []"
          :duration="playerStore.previewDuration"
          :ticks-per-beat="playerStore.currentMidi?.ticks_per_beat || 480"
          :tempo="playerStore.currentMidi?.tempo || 500000"
          :tracks="translatedTracks"
          :disabled-tracks="playerStore.disabledTracks"
          :disabled-tracks-version="playerStore.disabledTracksVersion"
          :current-time="playerStore.previewCurrentTime"
          @toggle="handleToggleTrack"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.midi-detail {
  @apply flex h-full min-h-0 w-full flex-col gap-6 overflow-hidden px-5;
}

.detail-header {
  @apply flex shrink-0 gap-4;
}

.left-section {
  @apply flex flex-col gap-4 flex-1;
}

.preview-section {
  @apply p-4 rounded-2xl;
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
}

.template-section {
  @apply flex items-center gap-2 px-1;
}

.overlay-btn {
  @apply h-10 w-10 rounded-xl;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  border-color: transparent;
  color: var(--color-white);
}

.overlay-btn-icon {
  width: 20px;
  height: 20px;
  stroke-width: 2.35;
}

.keyboard-section {
  @apply flex min-w-0 flex-1 items-center justify-center;
}

.tracks-section {
  @apply flex min-h-0 flex-1 flex-col gap-3;
}

.section-header {
  @apply flex shrink-0 items-center;
}

.tracks-scroll {
  @apply min-h-0 flex-1 overflow-x-hidden overflow-y-scroll;
  scrollbar-gutter: stable;
}

.section-title-group {
  @apply flex items-center gap-4;
}

.section-title {
  @apply text-sm font-medium;
  color: var(--color-muted-dark);
}

.section-stats {
  @apply flex items-center gap-3;
}

.stat {
  @apply flex items-center gap-1;
}

.stat-value {
  @apply text-sm font-medium;
  color: var(--color-primary);
}

.stat-label {
  @apply text-xs;
  color: var(--color-muted);
}
</style>
