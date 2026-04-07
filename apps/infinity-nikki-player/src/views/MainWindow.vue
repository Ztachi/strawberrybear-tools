<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui'
import { Card, CardContent } from '@/components/ui'
import MidiList from '@/components/MidiList.vue'
import PlayerControls from '@/components/PlayerControls.vue'
import TemplateEditor from '@/components/TemplateEditor.vue'
import KeyLogPanel from '@/components/KeyLogPanel.vue'

const { t, locale } = useI18n()
const playerStore = usePlayerStore()
const activeTab = ref('files')

/** 切换语言 */
function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
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
    <!-- 顶部导航栏 - 玻璃态 -->
    <header class="header glass">
      <div class="header-content">
        <div class="logo-section">
          <div class="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="url(#logoGradient)" />
              <path
                d="M8 12L11 15L16 9"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <defs>
                <linearGradient id="logoGradient" x1="0" y1="0" x2="24" y2="24">
                  <stop stop-color="#F7C0C1" />
                  <stop offset="1" stop-color="#f9d5d7" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 class="title">
            {{ t('app.title') }}
          </h1>
        </div>

        <div class="header-actions">
          <Button variant="ghost" size="sm" class="lang-btn" @click="toggleLocale">
            <span class="lang-text">{{ locale === 'zh-CN' ? 'EN' : '中文' }}</span>
          </Button>
          <Button variant="default" size="sm" class="overlay-btn" @click="enterOverlayMode">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
            {{ t('app.overlayMode') }}
          </Button>
        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="content">
      <Tabs v-model="activeTab" class="tabs-container">
        <!-- 玻璃态标签栏 -->
        <TabsList class="tabs-list glass">
          <TabsTrigger value="files" class="tab-trigger">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            {{ t('tabs.files') }}
          </TabsTrigger>
          <TabsTrigger value="templates" class="tab-trigger">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
            {{ t('tabs.templates') }}
          </TabsTrigger>
          <TabsTrigger value="logs" class="tab-trigger">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
              <path d="M10 9H8" />
            </svg>
            {{ t('tabs.logs') }}
          </TabsTrigger>
        </TabsList>

        <!-- 文件 Tab -->
        <TabsContent value="files" class="tab-content">
          <!-- 操作按钮组 -->
          <div class="action-cards">
            <button class="action-card glass" @click="selectFile">
              <div class="action-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <span class="action-text">{{ t('actions.selectFile') }}</span>
            </button>
            <button class="action-card glass" @click="selectFolder">
              <div class="action-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  />
                </svg>
              </div>
              <span class="action-text">{{ t('actions.selectFolder') }}</span>
            </button>
          </div>

          <!-- MIDI 列表 -->
          <MidiList
            :list="playerStore.midiList"
            :current="playerStore.currentMidi"
            @select="(m) => playerStore.parseMidi(m.filename)"
          />

          <!-- 当前文件信息 -->
          <Card v-if="playerStore.currentMidi" class="current-file-card glass">
            <CardContent class="card-content">
              <div class="file-header">
                <div class="file-icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <h3 class="file-name truncate">
                  {{ playerStore.currentMidi.filename }}
                </h3>
              </div>
              <div class="file-stats">
                <div class="stat">
                  <span class="stat-label">{{ t('midi.duration') }}</span>
                  <span
                    class="stat-value"
                    >{{ formatDuration(playerStore.currentMidi.duration_ms) }}</span
                  >
                </div>
                <div class="stat">
                  <span class="stat-label">{{ t('midi.tracks') }}</span>
                  <span class="stat-value">{{ playerStore.currentMidi.track_count }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">{{ t('midi.melodyNotes') }}</span>
                  <span class="stat-value highlight">{{ playerStore.melody.length }}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 播放控制 -->
          <PlayerControls v-if="playerStore.currentMidi" />
        </TabsContent>

        <!-- 模板 Tab -->
        <TabsContent value="templates" class="tab-content">
          <TemplateEditor />
        </TabsContent>

        <!-- 日志 Tab -->
        <TabsContent value="logs" class="tab-content">
          <KeyLogPanel />
        </TabsContent>
      </Tabs>
    </main>
  </div>
</template>

<style scoped>
.main-window {
  @apply h-screen flex flex-col bg-background text-foreground overflow-hidden;
  background:
    radial-gradient(ellipse at top left, rgba(247, 192, 193, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at bottom right, rgba(245, 184, 192, 0.05) 0%, transparent 50%),
    hsl(var(--background));
}

.header {
  @apply border-0 border-b border-white/5;
  background: rgba(15, 15, 20, 0.7) !important;
}

.header-content {
  @apply flex items-center justify-between px-6 py-4;
}

.logo-section {
  @apply flex items-center gap-3;
}

.logo-icon {
  @apply w-10 h-10 rounded-xl flex items-center justify-center;
  background: linear-gradient(135deg, #f7c0c1 0%, #f9d5d7 100%);
}

.title {
  @apply text-xl font-semibold text-white;
  letter-spacing: -0.02em;
}

.header-actions {
  @apply flex items-center gap-2;
}

.lang-btn {
  @apply text-white/70 hover:text-white;
}

.overlay-btn {
  @apply gap-2;
  background: linear-gradient(135deg, #f7c0c1 0%, #f5b8c0 100%) !important;
  @apply text-gray-900 font-medium;
}

.overlay-btn:hover {
  @apply opacity-90;
}

.content {
  @apply flex-1 overflow-auto px-6 py-6;
}

.tabs-container {
  @apply h-full flex flex-col;
}

.tabs-list {
  @apply inline-flex h-12 items-center justify-start rounded-xl p-1;
  background: rgba(20, 20, 25, 0.6) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
}

.tab-trigger {
  @apply inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium;
  @apply text-white/60 transition-all duration-200;
}

.tab-trigger[data-state='active'] {
  @apply text-white;
  background: rgba(247, 192, 193, 0.15) !important;
  box-shadow: 0 0 20px rgba(247, 192, 193, 0.1);
}

.tab-trigger:hover:not([data-state='active']) {
  @apply text-white/80;
}

.tab-content {
  @apply mt-6 flex-1;
  animation: fadeIn 0.2s ease-out;
}

.action-cards {
  @apply grid grid-cols-2 gap-4 mb-6;
}

.action-card {
  @apply flex flex-col items-center justify-center gap-3 p-6 rounded-2xl;
  @apply text-white/80 hover:text-white transition-all duration-200;
  background: rgba(20, 20, 25, 0.5) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
}

.action-card:hover {
  background: rgba(30, 30, 35, 0.6) !important;
  border-color: rgba(247, 192, 193, 0.2) !important;
  transform: translateY(-2px);
}

.action-icon {
  @apply w-12 h-12 rounded-xl flex items-center justify-center;
  background: rgba(247, 192, 193, 0.1);
  color: #f7c0c1;
}

.action-text {
  @apply text-sm font-medium;
}

.current-file-card {
  @apply mb-6;
  background: rgba(20, 20, 25, 0.5) !important;
  border: 1px solid rgba(247, 192, 193, 0.15) !important;
}

.card-content {
  @apply p-5;
}

.file-header {
  @apply flex items-center gap-3 mb-4;
}

.file-icon {
  @apply w-10 h-10 rounded-xl flex items-center justify-center;
  background: rgba(247, 192, 193, 0.15);
  color: #f7c0c1;
}

.file-name {
  @apply text-base font-semibold text-white flex-1;
}

.file-stats {
  @apply grid grid-cols-3 gap-4;
}

.stat {
  @apply flex flex-col gap-1;
}

.stat-label {
  @apply text-xs text-white/50;
}

.stat-value {
  @apply text-lg font-semibold text-white;
}

.stat-value.highlight {
  color: #f7c0c1;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
