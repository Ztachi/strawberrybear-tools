<script setup lang="ts">
/**
 * @description: 主窗口 - 包含正常模式和悬浮模式
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui'
import { AlertCircle, Monitor, Music, LayoutGrid, Upload, Folder } from 'lucide-vue-next'
import { SUPPORTED_LOCALES } from '@/i18n'
import ScrollableContainer from '@/components/ScrollableContainer.vue'
import FilesTab from './FilesTab/index.vue'
import TemplatesTab from './TemplatesTab/index.vue'
import OverlayView from './OverlayView.vue'

const { t, locale } = useI18n()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const activeTab = ref('files')

/** 切换语言 */
function switchLocale(targetLocale: 'zh-CN' | 'en-US') {
  settingsStore.setLocale(targetLocale)
}

/** 跳转到辅助功能权限设置 */
async function openAccessibilitySettings() {
  try {
    await invoke('open_accessibility_settings')
  } catch {
    window.open('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }
}

onMounted(async () => {
  await playerStore.checkAccessibility()
  await settingsStore.loadSettings()
  await playerStore.loadMidiLibrary()
})

/** 选择文件导入 */
async function selectFile() {
  const selected = await open({
    multiple: true,
    filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }],
  })
  if (selected) {
    const files = Array.isArray(selected) ? selected : [selected]
    for (const file of files) {
      await playerStore.importMidi(file)
    }
  }
}

/** 选择文件夹导入 */
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
    // 如果没有选中 MIDI，自动选中第一个
    if (!playerStore.currentMidi && playerStore.midiLibrary.length > 0) {
      playerStore.selectMidi(playerStore.midiLibrary[0])
    }
    // 停止播放
    playerStore.stopPreviewPlayback()
    playerStore.setPreviewTime(0)
    // 启用悬浮模式
    settingsStore.isOverlayMode = true
    settingsStore.setPlayMode('piano')
    // 调用 Rust 命令修改窗口
    await invoke('enter_overlay_mode')
  } catch (e) {
    console.error('进入悬浮模式失败:', e)
  }
}
</script>

<template>
  <div class="main-window" :class="{ 'overlay-mode': settingsStore.isOverlayMode }">
    <!-- 悬浮模式内容 -->
    <template v-if="settingsStore.isOverlayMode">
      <OverlayView />
    </template>

    <!-- 正常模式内容 -->
    <template v-else>
      <!-- 顶部导航栏 -->
      <header class="header">
        <div class="header-content">
          <div class="logo-section">
            <img src="@/assets/images/logo.png" alt="logo" class="logo-icon" />
            <h1 class="title">
              {{ t('app.title') }}
            </h1>
          </div>

          <div class="header-actions">
            <!-- 辅助功能权限提示 -->
            <Button
              v-if="!playerStore.hasAccessibility"
              variant="destructive"
              size="sm"
              class="access-btn"
              @click="openAccessibilitySettings"
            >
              <AlertCircle :size="14" />
              {{ t('permissions.required') }}
            </Button>

            <Button variant="default" size="sm" class="overlay-btn" @click="enterOverlayMode">
              <Monitor :size="16" />
              {{ t('app.overlayMode') }}
            </Button>

            <!-- 语言切换 -->
            <div class="locale-switch">
              <button
                v-for="loc in SUPPORTED_LOCALES"
                :key="loc.value"
                class="locale-btn"
                :class="{ active: locale === loc.value }"
                @click="switchLocale(loc.value)"
              >
                {{ loc.label }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- 主内容区 -->
      <main class="content">
        <ScrollableContainer>
          <Tabs v-model="activeTab" class="tabs-container has-[.empty-state]:h-full">
            <!-- 标签栏 + 操作按钮 -->
            <div class="tabs-header sticky top-0 z-10">
              <TabsList class="tabs-list">
                <TabsTrigger value="files" class="tab-trigger">
                  <Music :size="16" />
                  {{ t('tabs.files') }}
                </TabsTrigger>
                <TabsTrigger value="templates" class="tab-trigger">
                  <LayoutGrid :size="16" />
                  {{ t('tabs.templates') }}
                </TabsTrigger>
              </TabsList>

              <!-- 文件操作按钮 -->
              <div class="file-actions">
                <Button variant="outline" size="sm" @click="selectFile">
                  <Upload :size="16" />
                  {{ t('actions.selectFile') }}
                </Button>
                <Button variant="outline" size="sm" @click="selectFolder">
                  <Folder :size="16" />
                  {{ t('actions.selectFolder') }}
                </Button>
              </div>
            </div>

            <!-- 文件 Tab -->
            <TabsContent value="files" class="tab-content flex-1">
              <FilesTab />
            </TabsContent>

            <!-- 模板 Tab -->
            <TabsContent value="templates" class="tab-content flex-1">
              <TemplatesTab />
            </TabsContent>
          </Tabs>
        </ScrollableContainer>
      </main>
    </template>
  </div>
</template>

<style scoped>
.main-window {
  @apply h-screen flex flex-col text-foreground overflow-hidden relative;
  background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--bg-white-95) 50%, var(--color-primary-light) 100%);
}

.main-window::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: url('@/assets/images/bg.jpeg') no-repeat center center/cover;
  opacity: 0.2;
}

.main-window.overlay-mode {
  @apply overflow-visible;
  background: transparent;
}

.main-window.overlay-mode::before {
  display: none;
}

/* 顶部导航栏 */
.header {
  background: var(--bg-white-40);
  backdrop-filter: blur(30px);
  border-bottom: 1px solid var(--border-primary-10);
}

.header-content {
  @apply flex items-center justify-between px-6 py-4;
}

.logo-section {
  @apply flex items-center gap-3;
}

.logo-icon {
  @apply w-10 h-10 rounded-xl flex items-center justify-center;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
  color: white;
}

.title {
  @apply text-xl font-semibold;
  color: var(--color-foreground);
  letter-spacing: -0.02em;
}

.header-actions {
  @apply flex items-center gap-2;
}

.locale-switch {
  @apply flex items-center gap-1 p-1 rounded-lg;
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
}

.locale-btn {
  @apply px-2 py-1 text-xs font-medium rounded-md transition-all;
  color: var(--color-muted);
}

.locale-btn:hover {
  color: var(--color-foreground);
}

.locale-btn.active {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: white;
}

.access-btn {
  @apply gap-1.5;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.overlay-btn {
  @apply gap-2 font-medium;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-white);
}

.content {
  @apply flex-1 p-0 overflow-hidden;
}

.tabs-container {
  @apply flex flex-col;
}

.tabs-list {
  @apply inline-flex h-10 items-center justify-start rounded-2xl p-1;
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-20);
}

.tabs-header {
  @apply flex items-center justify-between gap-4;
}

.file-actions {
  @apply flex items-center gap-2;
}

.file-actions :deep(button) {
  background: var(--bg-white-80) !important;
  border: 1px solid var(--border-primary) !important;
  color: var(--color-primary) !important;
  font-weight: 500;
  transition: all 0.2s;
}

.file-actions :deep(button:hover) {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%) !important;
  color: white !important;
  border-color: transparent !important;
  box-shadow: var(--shadow-pink-sm);
}

.tab-trigger {
  @apply inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium;
  color: var(--color-primary);
  transition: all 0.2s;
}

.tab-trigger[data-state='active'] {
  color: var(--color-white);
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%) !important;
  box-shadow: 0 2px 8px var(--bg-primary-15);
}

.tab-trigger:hover:not([data-state='active']) {
  color: var(--color-secondary);
  background: var(--bg-primary-10);
}

.tab-content {
  @apply flex-1 h-full;
  animation: fadeIn 0.2s ease-out;
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
