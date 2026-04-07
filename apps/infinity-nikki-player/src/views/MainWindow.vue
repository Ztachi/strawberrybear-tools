<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import MidiList from '@/components/MidiList.vue'
import PlayerControls from '@/components/PlayerControls.vue'
import TemplateEditor from '@/components/TemplateEditor.vue'
import KeyLogPanel from '@/components/KeyLogPanel.vue'

const playerStore = usePlayerStore()
const activeTab = ref<'files' | 'templates' | 'logs'>('files')
const currentLang = ref('zh-CN')

/** 切换语言 */
function toggleLocale() {
  currentLang.value = currentLang.value === 'zh-CN' ? 'en-US' : 'zh-CN'
}

onMounted(async () => {
  await playerStore.loadTemplates()
})

/** 选择 MIDI 文件 */
async function selectFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }],
  })
  if (selected) {
    await playerStore.parseMidi(selected as string)
  }
}

/** 选择文件夹 */
async function selectFolder() {
  const selected = await open({
    directory: true,
  })
  if (selected) {
    await playerStore.scanFolder(selected as string)
  }
}

/** 进入悬浮模式 */
async function enterOverlayMode() {
  try {
    await invoke('create_overlay_window')
  } catch (e) {
    console.error('创建悬浮窗口失败:', e)
  }
}

/** 格式化时长 */
function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="main-window">
    <!-- 顶部栏 -->
    <header class="header" style="background-color: #F7C0C1;">
      <div class="header-left">
        <h1 class="title">无限暖暖自动演奏</h1>
      </div>
      <div class="header-right">
        <button class="btn-lang" @click="toggleLocale">
          {{ currentLang === 'zh-CN' ? 'EN' : '中文' }}
        </button>
        <button class="btn-secondary" @click="enterOverlayMode">进入悬浮模式</button>
      </div>
    </header>

    <!-- 标签页 -->
    <nav class="tabs">
      <button
        v-for="tab in ['files', 'templates', 'logs'] as const"
        :key="tab"
        :class="['tab', { active: activeTab === tab }]"
        @click="activeTab = tab"
      >
        {{ tab === 'files' ? '文件' : tab === 'templates' ? '模板' : '日志' }}
      </button>
    </nav>

    <!-- 内容区 -->
    <main class="content">
      <!-- 文件 Tab -->
      <div v-if="activeTab === 'files'" class="tab-content">
        <!-- 操作按钮 -->
        <div class="file-actions">
          <button class="btn-primary" @click="selectFile">选择 MIDI 文件</button>
          <button class="btn-secondary" @click="selectFolder">选择文件夹</button>
        </div>

        <!-- MIDI 列表 -->
        <MidiList
          :list="playerStore.midiList"
          :current="playerStore.currentMidi"
          @select="(m) => playerStore.parseMidi(m.filename)"
        />

        <!-- 当前文件信息 -->
        <div v-if="playerStore.currentMidi" class="current-file">
          <h3>当前文件: {{ playerStore.currentMidi.filename }}</h3>
          <p>时长: {{ formatDuration(playerStore.currentMidi.duration_ms) }}</p>
          <p>音轨数: {{ playerStore.currentMidi.track_count }}</p>
          <p>旋律音符数: {{ playerStore.melody.length }}</p>
        </div>

        <!-- 播放控制 -->
        <PlayerControls v-if="playerStore.currentMidi" />
      </div>

      <!-- 模板 Tab -->
      <div v-else-if="activeTab === 'templates'" class="tab-content">
        <TemplateEditor />
      </div>

      <!-- 日志 Tab -->
      <div v-else-if="activeTab === 'logs'" class="tab-content">
        <KeyLogPanel />
      </div>
    </main>
  </div>
</template>

<style scoped>
.main-window {
  @apply h-screen flex flex-col bg-gray-900 text-white;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background-color: #F7C0C1;
  border-bottom: 1px solid #f9a8d4;
}

.header-left {
  @apply flex items-center gap-3;
}

.title {
  @apply text-xl font-bold;
}

.header-right {
  @apply flex items-center gap-2;
}

.btn-lang {
  @apply px-3 py-1.5 text-sm rounded border border-pink-400/50
         text-pink-400 hover:bg-pink-400/20 transition-colors;
}

.tabs {
  @apply flex border-b border-gray-700;
}

.tab {
  @apply px-6 py-3 text-gray-400 hover:text-white transition-colors;
}

.tab.active {
  @apply text-white border-b-2 border-pink-400;
}

.content {
  @apply flex-1 overflow-auto p-4;
}

.tab-content {
  @apply space-y-4;
}

.file-actions {
  @apply flex gap-4;
}

.btn-primary {
  @apply px-4 py-2 bg-pink-400 rounded hover:bg-pink-500 transition-colors;
}

.btn-secondary {
  @apply px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors;
}

.current-file {
  @apply p-4 bg-gray-800 rounded-lg;
}

.current-file h3 {
  @apply text-lg font-semibold mb-2 truncate;
}

.current-file p {
  @apply text-sm text-gray-400;
}
</style>
