<script setup lang="ts">
/**
 * @description: 主窗口组件
 * @description 包含正常模式和悬浮模式两种 UI 状态，提供文件/文件夹导入、拖拽导入、标签页切换等功能
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { toast } from 'vue-sonner'
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

/** 当前激活的标签页 @return {string} */
const activeTab = ref('files')

/** 是否显示拖拽覆盖层 @return {boolean} */
const isDragOverlayVisible = ref(false)

/** 拖拽中的文件/目录数量 @return {number} */
const dragItemCount = ref(0)

/** 拖拽进入深度计数（用于处理嵌套拖拽） */
let dragEnterDepth = 0

/** DOM 拖拽事件解绑函数 */
let removeDomDragListeners: (() => void) | null = null

/**
 * @description: DataTransferItem 扩展接口
 * 用于访问 webkitGetAsEntry 方法
 */
interface DataTransferItemWithEntry {
  kind: string
  webkitGetAsEntry?: () => FileSystemEntry | null
}

/**
 * @description: 拖拽文件结果
 * @interface DroppedFilesResult
 */
interface DroppedFilesResult {
  /** 文件列表 */
  files: File[]
  /** 是否包含目录 */
  containsDirectory: boolean
}

/**
 * @description: 从路径中提取文件名
 * @param {string} path - 文件路径
 * @return {string} 文件名
 */
function getPathBasename(path: string) {
  return path.split(/[/\\]/).pop() || path
}

/**
 * @description: 设置拖拽覆盖层显示状态
 * @param {boolean} visible - 是否显示
 */
function setDragOverlayVisible(visible: boolean) {
  isDragOverlayVisible.value = visible
  if (!visible) {
    dragItemCount.value = 0
  }
}

/**
 * @description: 检查文件名是否为 MIDI 文件
 * @param {string} filename - 文件名
 * @return {boolean} 是否为 MIDI 文件
 */
function isMidiFilename(filename: string) {
  return /\.(mid|midi)$/i.test(filename)
}

/**
 * @description: 将 File 对象转换为 Uint8Array
 * @param {File} file - 文件对象
 * @return Promise 字节数组
 */
function readFileAsUint8Array(file: File) {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

/**
 * @description: 读取 FileSystemFileEntry 为 File 对象
 * @param {FileSystemFileEntry} entry - 文件系统条目
 * @return Promise File 对象
 */
function readFileEntry(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

/**
 * @description: 递归读取目录中的所有条目
 * @param {FileSystemDirectoryEntry} directory - 目录条目
 * @return Promise 所有条目列表
 */
async function readAllDirectoryEntries(directory: FileSystemDirectoryEntry) {
  const reader = directory.createReader()
  const entries: FileSystemEntry[] = []

  // 循环读取直到没有更多条目
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })

    if (batch.length === 0) break
    entries.push(...batch)
  }

  return entries
}

/**
 * @description: 从 FileSystemEntry 递归收集所有文件
 * @param {FileSystemEntry} entry - 文件系统条目
 * @return Promise 文件列表
 */
async function collectFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await readFileEntry(entry as FileSystemFileEntry)]
  }

  if (entry.isDirectory) {
    const files: File[] = []
    const entries = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry)
    for (const child of entries) {
      files.push(...(await collectFilesFromEntry(child)))
    }
    return files
  }

  return []
}

/**
 * @description: 从 DataTransfer 获取拖拽的文件
 * @param {DataTransfer | null} dataTransfer - 拖拽数据
 * @return Promise 拖拽结果
 */
async function getDroppedFiles(dataTransfer: DataTransfer | null): Promise<DroppedFilesResult> {
  if (!dataTransfer) {
    return {
      files: [],
      containsDirectory: false,
    }
  }

  // 筛选文件类型的条目
  const entryItems = Array.from(dataTransfer.items).filter(
    (item) => item.kind === 'file'
  ) as DataTransferItemWithEntry[]

  const filesFromEntries: File[] = []
  let containsDirectory = false

  // 必须同步收集所有 entry，await 之后 DataTransferItem 引用会失效
  const entries: FileSystemEntry[] = []
  for (const item of entryItems) {
    const entry = item.webkitGetAsEntry?.()
    if (!entry) continue
    if (entry.isDirectory) {
      containsDirectory = true
    }
    entries.push(entry)
  }

  // 递归收集所有文件
  for (const entry of entries) {
    filesFromEntries.push(...(await collectFilesFromEntry(entry)))
  }

  if (filesFromEntries.length > 0) {
    return {
      files: filesFromEntries,
      containsDirectory,
    }
  }

  // 回退：使用 File API
  return {
    files: Array.from(dataTransfer.files),
    containsDirectory: false,
  }
}

/**
 * @description: 格式化无效文件的描述文本
 * @param {string[]} paths - 无效文件路径列表
 * @return {string} 格式化后的描述
 */
function formatInvalidDropDescription(paths: string[]) {
  const preview = paths.slice(0, 3).map(getPathBasename).join(', ')
  const suffix = paths.length > 3 ? '...' : ''
  const baseMessage = t('dragdrop.invalidDescription')

  return preview ? `${baseMessage} (${preview}${suffix})` : baseMessage
}

/**
 * @description: 处理导入的文件路径
 * @param {string[]} paths - 文件路径列表
 */
async function handleImportPaths(paths: string[]) {
  const result = await playerStore.importPaths(paths)

  if (result.invalidPaths.length > 0) {
    toast.error(t('dragdrop.invalidTitle'), {
      description: formatInvalidDropDescription(result.invalidPaths),
      richColors: true,
    })
  }
}

/**
 * @description: 处理拖拽的文件
 * @param {File[]} files - 文件列表
 * @param {Object} options - 选项
 * @param {boolean} [options.autoSelect] - 是否自动选中（单文件时）
 */
async function handleDroppedFiles(files: File[], options: { autoSelect?: boolean } = {}) {
  const midiFiles = files.filter((file) => isMidiFilename(file.name))
  const invalidFiles = files.filter((file) => !isMidiFilename(file.name)).map((file) => file.name)
  // 只有恰好 1 个 MIDI 文件时才自动进入详情
  const shouldAutoSelect = (options.autoSelect ?? true) && midiFiles.length === 1

  // 导入 MIDI 文件
  for (const file of midiFiles) {
    const bytes = await readFileAsUint8Array(file)
    await playerStore.importMidiBuffer(file.name, bytes, { autoSelect: shouldAutoSelect })
  }

  // 提示无效文件
  if (invalidFiles.length > 0) {
    toast.error(t('dragdrop.invalidTitle'), {
      description: formatInvalidDropDescription(invalidFiles),
      richColors: true,
    })
  }
}

/**
 * @description: 绑定 DOM 拖拽事件
 * @return {() => void} 解绑函数
 */
function bindDomDragEvents() {
  const dragOptions = { capture: true }

  /** 处理 dragenter 事件 */
  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragEnterDepth += 1
    dragItemCount.value = event.dataTransfer?.items.length || event.dataTransfer?.files.length || 0
    setDragOverlayVisible(true)
  }

  /** 处理 dragover 事件 */
  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
      dragItemCount.value = event.dataTransfer.items.length || event.dataTransfer.files.length || 0
    }
    setDragOverlayVisible(true)
  }

  /** 处理 dragleave 事件 */
  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragEnterDepth = Math.max(0, dragEnterDepth - 1)

    if (dragEnterDepth === 0) {
      setDragOverlayVisible(false)
    }
  }

  /** 处理 drop 事件 */
  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragEnterDepth = 0
    setDragOverlayVisible(false)

    void getDroppedFiles(event.dataTransfer).then((result) => {
      if (result.files.length === 0) return
      void handleDroppedFiles(result.files)
    })
  }

  // 绑定事件
  window.addEventListener('dragenter', handleDragEnter, dragOptions)
  window.addEventListener('dragover', handleDragOver, dragOptions)
  window.addEventListener('dragleave', handleDragLeave, dragOptions)
  window.addEventListener('drop', handleDrop, dragOptions)

  // 返回解绑函数
  return () => {
    window.removeEventListener('dragenter', handleDragEnter, dragOptions)
    window.removeEventListener('dragover', handleDragOver, dragOptions)
    window.removeEventListener('dragleave', handleDragLeave, dragOptions)
    window.removeEventListener('drop', handleDrop, dragOptions)
  }
}

/**
 * @description: 切换语言
 * @param {'zh-CN' | 'en-US'} targetLocale - 目标语言
 */
function switchLocale(targetLocale: 'zh-CN' | 'en-US') {
  settingsStore.setLocale(targetLocale)
}

/**
 * @description: 打开辅助功能权限设置
 */
async function openAccessibilitySettings() {
  try {
    await invoke('open_accessibility_settings')
  } catch {
    // 备用方案：直接打开系统偏好设置
    window.open('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }
}

/** 组件挂载时初始化 */
onMounted(async () => {
  // 检查辅助功能权限
  await playerStore.checkAccessibility()
  // 加载设置
  await settingsStore.loadSettings()
  // 加载 MIDI 库
  await playerStore.loadMidiLibrary()
  // 绑定拖拽事件
  removeDomDragListeners = bindDomDragEvents()
})

/** 组件卸载时清理 */
onUnmounted(() => {
  if (removeDomDragListeners) {
    removeDomDragListeners()
    removeDomDragListeners = null
  }
})

/**
 * @description: 选择文件导入
 * 使用系统文件对话框选择 MIDI 文件
 */
async function selectFile() {
  const selected = await open({
    multiple: true,
    filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }],
  })
  if (selected) {
    const files = Array.isArray(selected) ? selected : [selected]
    await handleImportPaths(files)
    // 多个文件时关闭详情
    if (files.length > 1) {
      playerStore.closeDetail()
    }
  }
}

/**
 * @description: 选择文件夹导入
 * 扫描文件夹中的所有 MIDI 文件
 */
async function selectFolder() {
  const selected = await open({
    directory: true,
  })
  if (selected) {
    await handleImportPaths([selected as string])
  }
}

/**
 * @description: 进入悬浮模式
 * 切换到紧凑的悬浮窗口模式
 */
async function enterOverlayMode() {
  try {
    // 如果没有选中 MIDI，自动选中第一个
    if (!playerStore.currentMidi && playerStore.midiLibrary.length > 0) {
      playerStore.selectMidi(playerStore.midiLibrary[0])
    }
    // 停止预览播放
    playerStore.stopPreviewPlayback()
    playerStore.setPreviewTime(0)
    // 保存进入前的播放模式，退出时恢复
    settingsStore.modeBeforeOverlay = settingsStore.playMode
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
    <!-- 拖拽覆盖层 -->
    <div v-if="isDragOverlayVisible && !settingsStore.isOverlayMode" class="drag-overlay">
      <div class="drag-overlay-card">
        <div class="drag-overlay-icon">
          <Upload :size="28" />
        </div>
        <p class="drag-overlay-title">
          {{ t('dragdrop.title') }}
        </p>
        <p class="drag-overlay-hint">
          {{ t('dragdrop.hint') }}
        </p>
        <p class="drag-overlay-hint">
          {{ t('dragdrop.folderHint') }}
        </p>
        <!-- 拖拽计数 -->
        <p v-if="dragItemCount > 0" class="drag-overlay-count">
          {{ dragItemCount }}
        </p>
      </div>
    </div>

    <!-- 悬浮模式内容 -->
    <template v-if="settingsStore.isOverlayMode">
      <OverlayView />
    </template>

    <!-- 正常模式内容 -->
    <template v-else>
      <!-- 顶部导航栏 -->
      <header class="header">
        <div class="header-content">
          <!-- Logo 和标题 -->
          <div class="logo-section">
            <img src="@/assets/images/logo.png" alt="logo" class="logo-icon" />
            <h1 class="title">
              {{ t('app.title') }}
            </h1>
          </div>

          <div class="header-actions">
            <!-- 辅助功能权限提示（未授权时显示） -->
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

            <!-- 悬浮模式按钮 -->
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
              <!-- 标签列表 -->
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
  opacity: 0.3;
}

.main-window.overlay-mode {
  @apply overflow-visible;
  background: transparent;
}

.main-window.overlay-mode::before {
  display: none;
}

/* 拖拽覆盖层 */
.drag-overlay {
  @apply absolute inset-0 flex items-center justify-center p-6;
  z-index: 40;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(14px);
  pointer-events: none;
}

.drag-overlay-card {
  @apply w-full max-w-lg rounded-[28px] px-8 py-10 text-center;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 245, 249, 0.98) 100%);
  border: 2px dashed var(--border-primary);
  box-shadow: 0 24px 80px rgba(201, 67, 127, 0.16);
}

.drag-overlay-icon {
  @apply mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-white);
  box-shadow: var(--shadow-pink-sm);
}

.drag-overlay-title {
  @apply text-xl font-semibold;
  color: var(--color-foreground);
}

.drag-overlay-hint {
  @apply mt-2 text-sm leading-6;
  color: var(--color-muted-dark);
}

.drag-overlay-count {
  @apply mt-5 inline-flex min-w-10 items-center justify-center rounded-full px-3 py-1 text-sm font-semibold;
  background: var(--bg-primary-15);
  color: var(--color-primary);
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
