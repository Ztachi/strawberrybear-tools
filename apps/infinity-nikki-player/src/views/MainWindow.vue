<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui'
import { AlertCircle, Monitor, Music, LayoutGrid, FileText, Upload, Folder } from 'lucide-vue-next'
import MidiLibrary from '@/components/MidiLibrary.vue'
import MidiDetail from '@/components/MidiDetail.vue'
import TemplateEditor from '@/components/TemplateEditor.vue'
import KeyLogPanel from '@/components/KeyLogPanel.vue'

const { t, locale } = useI18n()
const playerStore = usePlayerStore()
const activeTab = ref('files')

/** 切换语言 */
function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
}

/** 跳转到辅助功能权限设置 */
async function openAccessibilitySettings() {
  try {
    // macOS 打开系统偏好设置
    await invoke('open_accessibility_settings')
  } catch {
    // fallback: 打开通用辅助功能 URL
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

          <Button variant="ghost" size="sm" class="lang-btn" @click="toggleLocale">
            {{ locale === 'zh-CN' ? 'EN' : '中文' }}
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
      <Tabs v-model="activeTab" class="tabs-container">
        <!-- 标签栏 -->
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

        <!-- 文件 Tab -->
        <TabsContent value="files" class="tab-content">
          <!-- 操作按钮组 -->
          <div class="action-cards">
            <button class="action-card" @click="selectFile">
              <div class="action-icon">
                <Upload :size="24" />
              </div>
              <span class="action-text">{{ t('actions.selectFile') }}</span>
            </button>
            <button class="action-card" @click="selectFolder">
              <div class="action-icon">
                <Folder :size="24" />
              </div>
              <span class="action-text">{{ t('actions.selectFolder') }}</span>
            </button>
          </div>

          <!-- MIDI 库列表 -->
          <MidiLibrary />
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

    <!-- MIDI 详情 Drawer -->
    <Drawer v-model:open="playerStore.showDetail">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{{ playerStore.currentMidi?.filename }}</DrawerTitle>
          <DrawerDescription>{{ t('midi.melodyInfo') }}</DrawerDescription>
        </DrawerHeader>
        <MidiDetail v-if="playerStore.currentMidi" />
      </DrawerContent>
    </Drawer>
  </div>
</template>

<style scoped>
.main-window {
  @apply h-screen flex flex-col text-foreground overflow-hidden;
}

.header {
  @apply bg-white/80 backdrop-blur-xl border-b border-pink-100;
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
  color: white;
}

.title {
  @apply text-xl font-semibold;
  color: #4a3f3f;
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

.lang-btn {
  @apply text-pink-400 hover:text-pink-500;
}

.overlay-btn {
  @apply gap-2;
  background: linear-gradient(135deg, #f7c0c1 0%, #f5b8c0 100%) !important;
  @apply text-pink-900 font-medium;
}

.content {
  @apply flex-1 p-6;
}

.tabs-container {
  @apply h-full flex flex-col;
}

.tabs-list {
  @apply inline-flex h-12 items-center justify-start rounded-2xl p-1;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(247, 192, 193, 0.2);
}

.tab-trigger {
  @apply inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium;
  @apply text-pink-400 transition-all duration-200;
}

.tab-trigger[data-state='active'] {
  @apply text-pink-900;
  background: linear-gradient(135deg, #f7c0c1 0%, #f5b8c0 100%) !important;
  box-shadow: 0 2px 8px rgba(247, 192, 193, 0.3);
}

.tab-trigger:hover:not([data-state='active']) {
  @apply text-pink-500;
  background: rgba(247, 192, 193, 0.1);
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
  @apply text-pink-600 transition-all duration-200;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(247, 192, 193, 0.2);
  box-shadow: 0 2px 12px rgba(247, 192, 193, 0.1);
}

.action-card:hover {
  border-color: rgba(247, 192, 193, 0.4);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(247, 192, 193, 0.15);
}

.action-icon {
  @apply w-12 h-12 rounded-xl flex items-center justify-center;
  background: rgba(247, 192, 193, 0.15);
  color: #f7c0c1;
}

.action-text {
  @apply text-sm font-medium;
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
