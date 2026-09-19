<script setup lang="ts">
/**
 * @description: MIDI 项目列表页：搜索、本地分页、多选、导入导出与行操作
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { HTMLAttributes } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { open, save as saveDialog } from '@tauri-apps/plugin-dialog'
import {
  Copy,
  Download,
  FileArchive,
  FileMusic,
  FolderDown,
  ListPlus,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import { Button, Checkbox, Input, Modal, Pagination, Popover, Table, Tooltip } from 'antdv-next'
import type { PaginationProps, TableColumnsType } from 'antdv-next'
import { feedback as toast } from '@/lib/feedback'
import { useMidiProjectStore, type MidiProjectSummary } from '@/stores/midiProjects'
import {
  addProjectToLibrary,
  createProjectFromMidiFile,
  exportProjectAsMidi,
} from '@/features/midi-editor/projectIo'
import { formatDuration } from '@/views/MainWindow/FilesTab/utils'

const { t, locale } = useI18n()
const router = useRouter()
const projectStore = useMidiProjectStore()

/** 页大小持久化键。 */
const PAGE_SIZE_STORAGE_KEY = 'infinity-nikki-player.midi-project-page-size'
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 20, 50]
/** 名称在表格中最多展示 30 个字符。 */
const NAME_MAX_LENGTH = 30

const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(readPersistedPageSize())
/** 跨分页保留的勾选集合。 */
const selectedIds = ref<Set<string>>(new Set())
/** 表格上方页头与工具栏占用高度，用于表体滚动区计算。 */
const totalHeaderHeight = ref(260)
const openActionMenuId = ref<string | null>(null)
/** 行菜单里的异步操作进行中时禁用再次触发。 */
const busyProjectId = ref<string | null>(null)
const actionConfirm = ref<{
  open: boolean
  title: string
  content: string
  resolve: CallableFunction | null
}>({ open: false, title: '', content: '', resolve: null })
let actionConfirmPromise: Promise<boolean> | null = null

/**
 * @description: 读取合法的分页大小
 * @return {number} 白名单内的页大小
 */
function readPersistedPageSize(): number {
  const parsed = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
}

const filteredProjects = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return projectStore.projects
  return projectStore.projects.filter((project) => project.name.toLowerCase().includes(keyword))
})
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredProjects.value.length / pageSize.value))
)
const pagedProjects = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredProjects.value.slice(start, start + pageSize.value)
})
const selectedProjects = computed(() =>
  projectStore.projects.filter((project) => selectedIds.value.has(project.id))
)
const isCurrentPageAllSelected = computed(
  () =>
    pagedProjects.value.length > 0 &&
    pagedProjects.value.every((project) => selectedIds.value.has(project.id))
)
const dateFormatter = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' })
)

const columns = computed<TableColumnsType<MidiProjectSummary>>(() => [
  { key: 'selection', width: 48, fixed: 'left' },
  { key: 'name', title: t('midiEditor.name'), ellipsis: true },
  { key: 'tracks', title: t('midiEditor.tracks'), width: 90, align: 'right' },
  { key: 'notes', title: t('midiEditor.notes'), width: 100, align: 'right' },
  { key: 'duration', title: t('midiEditor.duration'), width: 100, align: 'right' },
  { key: 'updatedAt', title: t('midiEditor.updatedAt'), width: 170 },
  { key: 'actions', width: 64, align: 'right', fixed: 'right' },
])

/**
 * @description: 截断过长名称
 * @param {string} name 项目名
 * @return {string} 展示用名称
 */
function truncateName(name: string): string {
  const chars = Array.from(name)
  return chars.length <= NAME_MAX_LENGTH ? name : `${chars.slice(0, NAME_MAX_LENGTH).join('')}...`
}

/** Set 原地修改不触发依赖，统一替换为新 Set。 */
function setSelected(next: Set<string>): void {
  selectedIds.value = new Set(next)
}
function toggleSelection(id: string): void {
  const next = new Set(selectedIds.value)
  if (!next.delete(id)) next.add(id)
  setSelected(next)
}
function toggleCurrentPageSelection(): void {
  const next = new Set(selectedIds.value)
  const allSelected = isCurrentPageAllSelected.value
  for (const project of pagedProjects.value) {
    if (allSelected) next.delete(project.id)
    else next.add(project.id)
  }
  setSelected(next)
}
/** 删除或导入后移除已不存在的勾选项。 */
function pruneSelection(): void {
  const existing = new Set(projectStore.projects.map((project) => project.id))
  setSelected(new Set([...selectedIds.value].filter((id) => existing.has(id))))
}
function getRowProps(project: MidiProjectSummary): HTMLAttributes {
  return { onClick: () => toggleSelection(project.id) }
}
function getRowClassName(project: MidiProjectSummary): string {
  return selectedIds.value.has(project.id)
    ? 'project-table-row project-row-selected'
    : 'project-table-row'
}

function closeActionMenu(): void {
  openActionMenuId.value = null
}
function setActionMenuOpen(id: string, isOpen: boolean): void {
  openActionMenuId.value = isOpen ? id : null
}

function confirmAction(title: string, content: string): Promise<boolean> {
  if (actionConfirmPromise) return actionConfirmPromise
  actionConfirmPromise = new Promise((resolve) => {
    actionConfirm.value = { open: true, title, content, resolve }
  })
  return actionConfirmPromise
}
function resolveActionConfirm(value: boolean): void {
  const resolve = actionConfirm.value.resolve
  actionConfirm.value.open = false
  actionConfirm.value.resolve = null
  actionConfirmPromise = null
  resolve?.(value)
}

/**
 * @description: 统一包装行菜单里的异步动作：关闭菜单、标记忙碌、失败 toast
 * @param {string} id 项目 ID
 * @param {() => Promise<void>} task 实际动作
 * @param {string} failedKey 失败提示 i18n key
 * @return {Promise<void>}
 */
async function runRowAction(
  id: string,
  task: () => Promise<void>,
  failedKey: string
): Promise<void> {
  closeActionMenu()
  if (busyProjectId.value) return
  busyProjectId.value = id
  try {
    await task()
  } catch (error) {
    toast.error(t(failedKey), { description: String(error), richColors: true })
  } finally {
    busyProjectId.value = null
  }
}

function createBlankProject(): Promise<unknown> {
  return router.push({ name: 'midi-editor-create' })
}
function editProject(project: MidiProjectSummary): Promise<unknown> {
  closeActionMenu()
  return router.push({ name: 'midi-editor-edit', params: { id: project.id } })
}
function createFromProject(project: MidiProjectSummary): Promise<unknown> {
  closeActionMenu()
  return router.push({ name: 'midi-editor-create', query: { fromProject: project.id } })
}

async function deleteProject(project: MidiProjectSummary): Promise<void> {
  closeActionMenu()
  const confirmed = await confirmAction(
    t('actions.delete'),
    t('midiEditor.confirmDelete', { name: project.name })
  )
  if (!confirmed) return
  try {
    await projectStore.deleteProject(project.id)
    pruneSelection()
    toast.success(t('midiEditor.deleted'), { richColors: true })
  } catch (error) {
    toast.error(t('midiEditor.deleteFailed'), { description: String(error), richColors: true })
  }
}

async function deleteSelected(): Promise<void> {
  const projects = selectedProjects.value
  if (projects.length === 0) return
  const confirmed = await confirmAction(
    t('midiEditor.batchDelete'),
    t('midiEditor.confirmBatchDelete', { count: projects.length })
  )
  if (!confirmed) return
  try {
    for (const project of projects) await projectStore.deleteProject(project.id)
    selectedIds.value = new Set()
    toast.success(t('midiEditor.batchDeleted', { count: projects.length }), { richColors: true })
  } catch (error) {
    toast.error(t('midiEditor.deleteFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 导入 .json / .zip 项目或 .mid 文件；.mid 在前端解析后直接保存为新项目
 * @return {Promise<void>}
 */
async function importProjects(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'MIDI Project', extensions: ['json', 'zip', 'mid', 'midi'] }],
  })
  if (!selected || Array.isArray(selected)) return
  try {
    let count = 0
    if (/\.midi?$/i.test(selected)) {
      const project = await createProjectFromMidiFile(selected, (index) =>
        t('midiEditor.trackDefaultName', { index })
      )
      await projectStore.saveProject(project)
      count = 1
    } else {
      count = (await projectStore.importProjects(selected)).length
    }
    toast.success(t('midiEditor.imported'), {
      description: t('midiEditor.importedCount', { count }),
      richColors: true,
    })
  } catch (error) {
    toast.error(t('midiEditor.importFailed'), { description: String(error), richColors: true })
  }
}

async function exportProjectJson(project: MidiProjectSummary): Promise<void> {
  closeActionMenu()
  const target = await saveDialog({
    defaultPath: `${project.name}.json`,
    filters: [{ name: 'MIDI Project JSON', extensions: ['json'] }],
  })
  if (!target) return
  try {
    await projectStore.exportProject(project.id, target)
    toast.success(t('midiEditor.exported'), { richColors: true })
  } catch (error) {
    toast.error(t('midiEditor.exportFailed'), { description: String(error), richColors: true })
  }
}

function exportProjectMidi(project: MidiProjectSummary): Promise<void> {
  return runRowAction(
    project.id,
    async () => {
      const full = await projectStore.loadProject(project.id)
      if (await exportProjectAsMidi(full)) {
        toast.success(t('midiEditor.midiExported'), { richColors: true })
      }
    },
    'midiEditor.exportFailed'
  )
}

function addToLibrary(project: MidiProjectSummary): Promise<void> {
  return runRowAction(
    project.id,
    async () => {
      const full = await projectStore.loadProject(project.id)
      if (await addProjectToLibrary(full)) {
        toast.success(t('midiEditor.addedToLibrary'), { richColors: true })
      }
    },
    'midiEditor.addToLibraryFailed'
  )
}

async function exportSelected(): Promise<void> {
  const projects = selectedProjects.value
  if (projects.length === 0) return
  const target = await saveDialog({
    defaultPath: 'midi-projects.zip',
    filters: [{ name: 'MIDI Project ZIP', extensions: ['zip'] }],
  })
  if (!target) return
  try {
    await projectStore.exportProjectsArchive(
      projects.map((project) => project.id),
      target
    )
    toast.success(t('midiEditor.exported'), {
      description: t('midiEditor.exportedCount', { count: projects.length }),
      richColors: true,
    })
  } catch (error) {
    toast.error(t('midiEditor.exportFailed'), { description: String(error), richColors: true })
  }
}

function handlePageSizeUpdate(nextPageSize: number): void {
  if (!PAGE_SIZE_OPTIONS.includes(nextPageSize)) return
  currentPage.value = 1
  window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(nextPageSize))
}
const getPaginationTotal: PaginationProps['showTotal'] = (total, range) =>
  t('template.paginationTotal', { start: range[0], end: range[1], total })

watch(searchKeyword, () => {
  currentPage.value = 1
})
watch(totalPages, () => {
  currentPage.value = Math.min(currentPage.value, totalPages.value)
})
watch(() => projectStore.projects.map((project) => project.id).join(','), pruneSelection)

onMounted(() => {
  void projectStore.loadProjects().catch((error) => {
    toast.error(t('midiEditor.loadFailed'), { description: String(error), richColors: true })
  })
})
onBeforeUnmount(() => {
  resolveActionConfirm(false)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <section
      class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-primary/15 bg-white/75"
    >
      <div class="flex flex-wrap items-center gap-2 border-b border-primary/10 p-3">
        <div class="w-[220px] max-w-full">
          <Input
            v-model:value="searchKeyword"
            class="h-9 bg-white"
            allow-clear
            :placeholder="t('midiEditor.searchPlaceholder')"
          >
            <template #prefix>
              <Search class="size-4 text-muted-foreground" />
            </template>
          </Input>
        </div>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <Button
            v-if="selectedIds.size > 0"
            danger
            type="primary"
            size="small"
            @click="deleteSelected"
          >
            <template #icon>
              <Trash2 class="size-4" />
            </template>
            {{ t('midiEditor.batchDelete') }}
          </Button>
          <Button
            size="small"
            color="primary"
            variant="outlined"
            :disabled="selectedIds.size === 0"
            @click="exportSelected"
          >
            <template #icon>
              <FileArchive class="size-4" />
            </template>
            {{ t('midiEditor.batchExport') }}
          </Button>
          <Tooltip :title="t('midiEditor.importHint')">
            <Button
              size="small"
              color="primary"
              variant="outlined"
              @click="importProjects"
            >
              <template #icon>
                <FolderDown class="size-4" />
              </template>
              {{ t('midiEditor.importProject') }}
            </Button>
          </Tooltip>
          <Button
            type="primary"
            size="small"
            @click="createBlankProject"
          >
            <template #icon>
              <Plus class="size-4" />
            </template>
            {{ t('midiEditor.newProject') }}
          </Button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden">
        <Table
          :data-source="pagedProjects"
          :columns="columns"
          :pagination="false"
          :loading="projectStore.isLoading"
          :scroll="{ y: `calc(100vh - ${totalHeaderHeight}px)` }"
          :locale="{ emptyText: t('midiEditor.noProjects') }"
          :row-key="(project: MidiProjectSummary) => project.id"
          :row-class-name="getRowClassName"
          :on-row="getRowProps"
          size="small"
          class="project-table"
        >
          <template #headerCell="{ column }">
            <template v-if="column.key === 'selection'">
              <div class="flex items-center justify-center">
                <Checkbox
                  :checked="isCurrentPageAllSelected"
                  @change="toggleCurrentPageSelection"
                />
              </div>
            </template>
          </template>

          <template #bodyCell="{ column, record: project }">
            <template v-if="column.key === 'selection'">
              <div
                class="flex items-center justify-center"
                @click.stop
              >
                <Checkbox
                  :checked="selectedIds.has(project.id)"
                  @change="toggleSelection(project.id)"
                />
              </div>
            </template>
            <template v-else-if="column.key === 'name'">
              <Tooltip
                :title="project.name"
                placement="topLeft"
              >
                <span class="project-name-text">{{ truncateName(project.name) }}</span>
              </Tooltip>
            </template>
            <template v-else-if="column.key === 'tracks'">
              <span class="text-muted-foreground">{{ project.meta.trackCount }}</span>
            </template>
            <template v-else-if="column.key === 'notes'">
              <span class="text-muted-foreground">{{ project.meta.noteCount }}</span>
            </template>
            <template v-else-if="column.key === 'duration'">
              <span class="text-muted-foreground">{{ formatDuration(project.meta.durationMs) }}</span>
            </template>
            <template v-else-if="column.key === 'updatedAt'">
              <span class="text-muted-foreground">{{ dateFormatter.format(project.updatedAt) }}</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <div @click.stop>
                <Popover
                  trigger="click"
                  placement="bottomRight"
                  :open="openActionMenuId === project.id"
                  @update:open="setActionMenuOpen(project.id, $event)"
                >
                  <template #content>
                    <div class="flex flex-col">
                      <Button
                        type="text"
                        class="justify-start"
                        @click="editProject(project)"
                      >
                        <template #icon>
                          <Pencil class="size-4" />
                        </template>
                        {{ t('actions.edit') }}
                      </Button>
                      <Button
                        type="text"
                        class="justify-start"
                        @click="createFromProject(project)"
                      >
                        <template #icon>
                          <Copy class="size-4" />
                        </template>
                        {{ t('midiEditor.createFromProject') }}
                      </Button>
                      <Button
                        type="text"
                        class="justify-start"
                        @click="exportProjectJson(project)"
                      >
                        <template #icon>
                          <Download class="size-4" />
                        </template>
                        {{ t('midiEditor.exportProject') }}
                      </Button>
                      <Button
                        type="text"
                        class="justify-start"
                        :loading="busyProjectId === project.id"
                        @click="exportProjectMidi(project)"
                      >
                        <template #icon>
                          <FileMusic class="size-4" />
                        </template>
                        {{ t('midiEditor.exportMidi') }}
                      </Button>
                      <Button
                        type="text"
                        class="justify-start"
                        :loading="busyProjectId === project.id"
                        @click="addToLibrary(project)"
                      >
                        <template #icon>
                          <ListPlus class="size-4" />
                        </template>
                        {{ t('midiEditor.addToLibrary') }}
                      </Button>
                      <Button
                        type="text"
                        danger
                        class="justify-start"
                        @click="deleteProject(project)"
                      >
                        <template #icon>
                          <Trash2 class="size-4" />
                        </template>
                        {{ t('actions.delete') }}
                      </Button>
                    </div>
                  </template>
                  <Button
                    type="text"
                    color="primary"
                    variant="outlined"
                    class="project-action-btn"
                  >
                    <template #icon>
                      <MoreVertical class="project-action-icon" />
                    </template>
                  </Button>
                </Popover>
              </div>
            </template>
          </template>
        </Table>
      </div>

      <div class="border-t border-primary/10 px-3 py-2">
        <Pagination
          v-model:current="currentPage"
          v-model:page-size="pageSize"
          :total="filteredProjects.length"
          :page-size-options="PAGE_SIZE_OPTIONS"
          :show-total="getPaginationTotal"
          show-size-changer
          size="small"
          @update:page-size="handlePageSizeUpdate"
        />
      </div>
    </section>

    <Modal
      :open="actionConfirm.open"
      :title="actionConfirm.title"
      :footer="null"
      width="420"
      centered
      @cancel="resolveActionConfirm(false)"
    >
      <div class="text-sm leading-6 text-muted-foreground">
        {{ actionConfirm.content }}
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button
          size="small"
          color="primary"
          variant="outlined"
          @click="resolveActionConfirm(false)"
        >
          {{ t('actions.cancel') }}
        </Button>
        <Button
          type="primary"
          size="small"
          danger
          @click="resolveActionConfirm(true)"
        >
          {{ t('actions.delete') }}
        </Button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.project-table {
  @apply min-w-full;
}

.project-table :deep(.ant-table) {
  height: 100%;
}

.project-table :deep(.ant-table-container) {
  border-start-start-radius: 0;
  border-start-end-radius: 0;
}

.project-table :deep(.project-table-row) {
  cursor: pointer;
}

.project-table :deep(.project-table-row > td) {
  transition: background-color 0.2s ease;
}

.project-table :deep(.project-row-selected > td),
.project-table :deep(.project-row-selected:hover > td) {
  background: var(--bg-primary-15);
}

.project-table :deep(.project-table-row:hover > td) {
  background: var(--bg-primary-10);
}

.project-table :deep(.project-table-row:hover) .project-name-text {
  color: var(--color-primary);
}

.project-name-text {
  @apply block w-full max-w-full truncate font-medium text-foreground transition;
}

.project-action-btn {
  width: 32px;
  height: 32px;
}

.project-action-icon {
  width: 18px;
  height: 18px;
  stroke-width: 2.3;
}
</style>
