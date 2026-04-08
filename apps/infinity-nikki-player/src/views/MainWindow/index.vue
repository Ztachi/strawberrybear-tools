<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui'
import { AlertCircle, Monitor, Music, LayoutGrid, FileText, Upload, Folder } from 'lucide-vue-next'
import FilesTab from './FilesTab/index.vue'
import TemplatesTab from './TemplatesTab/index.vue'
import LogsTab from './LogsTab/index.vue'

const { t } = useI18n()
const playerStore = usePlayerStore()
const activeTab = ref('files')

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
  await playerStore.loadTemplates()
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
    await invoke('create_overlay_window')
  } catch (e) {
    console.error('创建悬浮窗口失败:', e)
  }
}
</script>

<template>
  <div class="main-window bg-gradient-warm">
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
        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="content">
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
            <TabsTrigger value="logs" class="tab-trigger">
              <FileText :size="16" />
              {{ t('tabs.logs') }}
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

        <!-- 日志 Tab -->
        <TabsContent value="logs" class="tab-content flex-1">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </main>
  </div>
</template>

<style scoped>
.main-window {
  @apply h-screen flex flex-col text-foreground overflow-hidden;
}

.header {
  background: var(--bg-white-80);
  backdrop-filter: blur(20px);
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
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%) !important;
  color: var(--color-foreground) !important;
}

.content {
  @apply flex-1 p-6 overflow-auto;
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

.tab-trigger {
  @apply inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium;
  color: var(--color-primary);
  transition: all 0.2s;
}

.tab-trigger[data-state='active'] {
  color: var(--color-foreground);
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
