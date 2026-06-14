<script setup lang="ts">
/**
 * @description: 主窗口组件
 * @description 包含正常模式和悬浮模式两种 UI 状态，提供文件/文件夹导入、拖拽导入、标签页切换等功能
 */
import { computed, nextTick, onMounted, onUnmounted, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, isNavigationFailure, useRoute, useRouter } from 'vue-router'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useSongListStore } from '@/stores/songLists'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { feedback as toast } from '@/lib/feedback'
import { Upload } from 'lucide-vue-next'
import type { RouteLocationRaw } from 'vue-router'
import FloatingActionGroup from '@/components/FloatingActionGroup.vue'
import OverlayView from './OverlayView.vue'
import AppHeader from './components/AppHeader/index.vue'
import GlobalMusicPlayer from '@/components/GlobalMusicPlayer/index.vue'
import { isSupportedLocale } from '@/i18n'
import { midiImportActionsKey } from './importActions'
import SongListSidebar from './FilesTab/components/SongListSidebar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const mainWindowUiStore = useMainWindowUiStore()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const songListStore = useSongListStore()

/** 主窗口支持的页签路由值。 */
type MainWindowTab = 'files' | 'templates' | 'online'

/** 当前激活的标签页由路由决定，避免刷新后回到默认文件页。 */
const activeTab = computed<MainWindowTab>(() => {
  // 未知路径会被 router 重定向；重定向完成前按文件页渲染，保持首屏稳定。
  if (route.path.startsWith('/templates')) return 'templates'
  if (route.path.startsWith('/online-library')) return 'online'
  return 'files'
})

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
  // 导入会打开 MIDI 详情；如果仍停留在模板页，用户会误以为无响应，因此导入前必须先切回文件页。
  const canImport = await ensureFilesTabForImport()
  if (!canImport) return

  const result = await playerStore.importPaths(paths)
  const shouldOpenDetail =
    result.importedFiles === 1 && result.scannedFolders === 0 && playerStore.lastImportedMidi

  if (result.invalidPaths.length > 0) {
    toast.error(t('dragdrop.invalidTitle'), {
      description: formatInvalidDropDescription(result.invalidPaths),
      richColors: true,
    })
  }

  if (shouldOpenDetail && playerStore.lastImportedMidi) {
    await router.push({
      name: 'files-midi-detail',
      params: { filename: playerStore.lastImportedMidi.filename },
      query: route.query,
    })
    playerStore.clearLastImportedMidi()
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

  if (midiFiles.length > 0) {
    // 拖拽导入同样会触发详情打开，必须先通过模板编辑离开守卫并切回文件页。
    const canImport = await ensureFilesTabForImport()
    if (!canImport) return
  }

  playerStore.clearLastImportedMidi()

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

  if (shouldAutoSelect && playerStore.lastImportedMidi) {
    await router.push({
      name: 'files-midi-detail',
      params: { filename: playerStore.lastImportedMidi.filename },
      query: route.query,
    })
    playerStore.clearLastImportedMidi()
  }
}

/**
 * @description: 确保导入 MIDI 前切换到文件 Tab
 * @description 如果模板抽屉存在未保存改动，会先弹出保存/丢弃/取消确认
 * @return {Promise<boolean>} true 表示允许继续导入
 */
async function ensureFilesTabForImport(): Promise<boolean> {
  // 已经在文件页时不需要询问模板页，避免无关编辑状态影响文件页重复导入。
  if (activeTab.value === 'files') return true

  // 路由离开守卫会处理模板编辑页的未保存确认。
  const failure = await router.push({ name: 'files-all', query: route.query })
  return !isNavigationFailure(failure)
}

/**
 * @description: 处理主标签页切换
 * @param {string | number} nextTab - 目标标签页值
 * @param {RouteLocationRaw} [targetRoute] - 可选目标路由
 * @return {Promise<boolean>} 是否完成导航
 */
async function handleMainNavigate(
  nextTab: string | number,
  targetRoute?: RouteLocationRaw
): Promise<boolean> {
  const normalizedNextTab = String(nextTab) as MainWindowTab
  // 左侧菜单只会发出已声明的页签值；这里防御无效值，避免错误 URL 污染应用状态。
  if (!['files', 'templates', 'online'].includes(normalizedNextTab)) return false
  const routeTarget =
    targetRoute ??
    ({
      name:
        normalizedNextTab === 'files'
          ? 'files-all'
          : normalizedNextTab === 'templates'
            ? 'templates'
            : 'online-library',
      query: route.query,
    } as RouteLocationRaw)

  if (normalizedNextTab === activeTab.value && !targetRoute) return true

  // 路由离开守卫会处理模板编辑页的未保存确认。
  await router.push(routeTarget)
  return true
}

/**
 * @description: 绑定 DOM 拖拽事件
 * @return {() => void} 解绑函数
 */
function bindDomDragEvents() {
  const dragOptions = { capture: true }

  function shouldSkipMidiDrag(): boolean {
    return document.querySelector('.cover-cropper-modal-root') !== null
  }

  /** 处理 dragenter 事件 */
  const handleDragEnter = (event: DragEvent) => {
    if (shouldSkipMidiDrag()) return
    event.preventDefault()
    event.stopPropagation()
    dragEnterDepth += 1
    dragItemCount.value = event.dataTransfer?.items.length || event.dataTransfer?.files.length || 0
    setDragOverlayVisible(true)
  }

  /** 处理 dragover 事件 */
  const handleDragOver = (event: DragEvent) => {
    if (shouldSkipMidiDrag()) return
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
    if (shouldSkipMidiDrag()) return
    event.preventDefault()
    event.stopPropagation()
    dragEnterDepth = Math.max(0, dragEnterDepth - 1)

    if (dragEnterDepth === 0) {
      setDragOverlayVisible(false)
    }
  }

  /** 处理 drop 事件 */
  const handleDrop = (event: DragEvent) => {
    if (shouldSkipMidiDrag()) return
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
 * @param {string} targetLocale - Header 语言切换按钮发出的目标语言
 */
function switchLocale(targetLocale: string) {
  if (!isSupportedLocale(targetLocale)) {
    console.warn('忽略不支持的语言切换请求:', targetLocale)
    return
  }

  settingsStore.setLocale(targetLocale)
}

function refreshWindow(): void {
  window.location.reload()
}

/**
 * @description: 打开帮助/关于对话框
 */
async function openHelp() {
  await emit('show_about')
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
  // settings 中的播放列表模式需要同步到公共播放器状态机，后续队列调度都以它为准。
  playerStore.applyPlaylistPlaybackMode()
  // 如果用户在悬浮窗口中刷新页面，前端状态会重建；这里从 Rust 侧持久化快照恢复悬浮 UI。
  settingsStore.isOverlayMode = await invoke<boolean>('has_saved_overlay_window_state')
  // 加载歌单和 MIDI 库后恢复上次预览选中与播放作用域。
  await Promise.all([songListStore.loadSongLists(), playerStore.loadMidiLibrary()])
  await playerStore.restoreInitialPreviewSelection()
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
      await router.push({ name: 'files-all', query: route.query })
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
    // 没有选中 MIDI 时自动选中第一首，仅用于悬浮列表展示与播放，不打开主界面详情页
    if (!playerStore.currentMidi && playerStore.midiLibrary.length > 0) {
      await playerStore.selectMidiInQueue(playerStore.midiLibrary[0], playerStore.midiLibrary, {
        id: 'all',
        title: t('songList.allSongs'),
      })
    }
    // 停止预览播放
    void playerStore.stopPreviewPlayback()
    playerStore.setPreviewTime(0)
    // 保存进入前的播放模式，退出时恢复
    settingsStore.modeBeforeOverlay = settingsStore.playMode
    settingsStore.setPlayMode('piano')
    // 先切换前端悬浮视图并等待渲染完成，再调整原生窗口尺寸/装饰，
    // 避免缩小后的窗口里短暂闪现主界面布局（顺序颠倒会导致主界面被挤在悬浮窗里闪烁）
    settingsStore.isOverlayMode = true
    await nextTick()
    await invoke('enter_overlay_mode')
  } catch (e) {
    settingsStore.setPlayMode(settingsStore.modeBeforeOverlay)
    settingsStore.isOverlayMode = false
    console.error('进入悬浮模式失败:', e)
  }
}

provide(midiImportActionsKey, {
  selectFile,
  selectFolder,
})
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

    <!-- 正常模式内容：用 v-show 保留 DOM 和滚动状态，避免退出悬浮后页面重新创建 -->
    <div v-show="!settingsStore.isOverlayMode" class="normal-mode-shell">
      <AppHeader
        :title="t('app.title')"
        :has-accessibility="playerStore.hasAccessibility"
        @open-accessibility-settings="openAccessibilitySettings"
        @enter-overlay-mode="enterOverlayMode"
        @switch-locale="switchLocale"
        @open-help="openHelp"
      />

      <!-- 主内容区 -->
      <main id="main-window-body" class="content">
        <div id="main-window-portal-root" class="content-portal-root" />
        <div class="main-content-shell">
          <SongListSidebar :request-navigate="handleMainNavigate" />

          <section class="route-content">
            <section class="route-page-stage">
              <RouterView v-slot="{ Component, route: pageRoute }">
                <Transition name="main-page">
                  <section :key="pageRoute.fullPath" class="route-page-host">
                    <component :is="Component" />
                  </section>
                </Transition>
              </RouterView>
            </section>

            <GlobalMusicPlayer />
          </section>
        </div>

        <FloatingActionGroup
          :show-back-to-top="mainWindowUiStore.canBackToTop"
          :show-locate-current="mainWindowUiStore.canLocateCurrent"
          :back-to-top-title="t('actions.backToTop')"
          :locate-current-title="t('overlay.locateCurrent')"
          :refresh-title="t('actions.refresh')"
          @back-to-top="mainWindowUiStore.triggerBackToTop"
          @locate-current="mainWindowUiStore.triggerLocateCurrent"
          @refresh="refreshWindow"
        />
      </main>
    </div>
  </div>
</template>

<style scoped>
.main-window {
  @apply h-screen flex flex-col text-foreground overflow-hidden relative;
  --global-menu-height: 46px;
  border-radius: var(--radius);
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
  @apply overflow-hidden;
  border-radius: 16px;
  background: transparent;
}

.main-window.overlay-mode::before {
  display: none;
}

.normal-mode-shell {
  @apply flex h-full min-h-0 flex-col;
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

.header-btn-icon {
  width: 17px;
  height: 17px;
  stroke-width: 2.25;
}

.content {
  @apply relative flex-1 p-0 overflow-hidden min-h-0;
}

.content-portal-root {
  @apply absolute inset-0 z-40 pointer-events-none;
}

.content-portal-root :global(.ant-drawer-root),
.content-portal-root :global(.ant-drawer-mask),
.content-portal-root :global(.ant-drawer-wrap),
.content-portal-root :global(.ant-drawer-content-wrapper),
.content-portal-root :global(.ant-dropdown),
.content-portal-root :global(.ant-popover),
.content-portal-root :global(.ant-tooltip),
.content-portal-root :global(.ant-modal-root) {
  pointer-events: auto;
}

.main-content-shell {
  @apply flex h-full min-h-0 gap-2 px-2 pb-2;
}

.route-content {
  @apply flex min-h-0 min-w-0 flex-1 flex-col gap-2;
}

.route-page-stage {
  @apply relative min-h-0 flex-1 overflow-hidden;
}

.route-page-host {
  @apply absolute inset-0 overflow-hidden rounded-2xl p-4;
  background: var(--bg-white-50);
  border: 1px solid var(--border-primary-15);
}

.main-page-enter-active,
.main-page-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.main-page-enter-active {
  z-index: 2;
}

.main-page-leave-active {
  z-index: 1;
  pointer-events: none;
}

.main-page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.main-page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
