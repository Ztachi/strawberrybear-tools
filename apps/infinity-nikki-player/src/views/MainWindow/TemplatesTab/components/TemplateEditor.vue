<script setup lang="ts">
/**
 * @description: TemplateEditor - 模板管理页主体
 * @description 保留模板列表、工具栏、批量操作和分页等页面核心内容，并将重编辑区域委托给 TemplateEditorDrawer
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { confirm, open, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'vue-sonner'
import {
  Copy,
  Download,
  FileArchive,
  FolderDown,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import {
  Button,
  Input,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { useSettingsStore } from '@/stores/settings'
import type { KeyTemplate } from '@/types'
import TemplateEditorDrawer from './TemplateEditorDrawer.vue'

const { t } = useI18n()
const settingsStore = useSettingsStore()

/** 模板页页大小持久化键，避免刷新后丢失用户常用分页密度。 */
const PAGE_SIZE_STORAGE_KEY = 'infinity-nikki-player.template-page-size'
/** 默认分页大小，首次打开或本地缓存非法时使用。 */
const DEFAULT_PAGE_SIZE = 10
/** 可选分页大小，列表本地渲染，不需要请求后端分页。 */
const PAGE_SIZE_OPTIONS = [10, 20, 50]

/** 搜索关键字，只按模板名称本地过滤。 */
const searchKeyword = ref('')
/** 当前页码，使用 1-based 方便直接交给分页组件展示。 */
const currentPage = ref(1)
/** 每页数量，从 localStorage 读取并做白名单校验。 */
const pageSize = ref(readPersistedPageSize())
/** 被勾选模板 ID 集合，跨分页保留选择。 */
const selectedTemplateIds = ref<Set<string>>(new Set())
/** 模板编辑抽屉实例，负责编辑、草稿和未保存离开确认。 */
const editorDrawerRef = ref<InstanceType<typeof TemplateEditorDrawer> | null>(null)

/**
 * @description: 从本地存储读取分页大小
 * @return {number} 合法分页大小
 */
function readPersistedPageSize(): number {
  // localStorage 可能为空、被用户手动改坏或来自旧版本，必须先转数字再做白名单。
  const parsed = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
  // 只接受预设值，避免异常页大小撑破表格布局或导致分页计算不可控。
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
}

/**
 * @description: 持久化分页大小
 * @param {number} nextPageSize - 新分页大小
 * @return {void}
 */
function persistPageSize(nextPageSize: number): void {
  // 页大小来自 Pagination，但仍然白名单过滤，保证持久化值一定能被下次读取。
  if (!PAGE_SIZE_OPTIONS.includes(nextPageSize)) return
  window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(nextPageSize))
}

/** 模板列表展示顺序：按用户看到的模板名称排序。 */
const sortedTemplates = computed(() =>
  [...settingsStore.templates].sort((a, b) => a.name.localeCompare(b.name))
)

/** 搜索后的模板列表，只按名称匹配，不暴露随机内部 ID。 */
const filteredTemplates = computed(() => {
  // 关键字统一 trim/lowercase，避免空格和大小写影响搜索结果。
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return sortedTemplates.value
  return sortedTemplates.value.filter((template) => template.name.toLowerCase().includes(keyword))
})

/** 总页数，至少为 1，避免空列表时页码越界。 */
const totalPages = computed(() => Math.max(1, Math.ceil(filteredTemplates.value.length / pageSize.value)))

/** 当前页模板数据。 */
const pagedTemplates = computed(() => {
  // currentPage 是 1-based，切片起点需要转换为 0-based。
  const start = (currentPage.value - 1) * pageSize.value
  return filteredTemplates.value.slice(start, start + pageSize.value)
})

/** 当前勾选的模板对象。 */
const selectedTemplates = computed(() =>
  settingsStore.templates.filter((template) => selectedTemplateIds.value.has(template.id))
)

/** 当前页是否全部被勾选。 */
const isCurrentPageAllSelected = computed(() => {
  // 空页不能算全选，否则搜索无结果时复选框会出现误导状态。
  if (pagedTemplates.value.length === 0) return false
  return pagedTemplates.value.every((template) => selectedTemplateIds.value.has(template.id))
})

/**
 * @description: 设置勾选集合
 * @param {Set<string>} nextSelected - 新勾选集合
 * @return {void}
 */
function setSelectedTemplateIds(nextSelected: Set<string>): void {
  // Set 原地修改不会稳定触发 Vue 依赖，必须替换为新 Set。
  selectedTemplateIds.value = new Set(nextSelected)
}

/**
 * @description: 切换单个模板勾选状态
 * @param {string} templateId - 模板 ID
 * @return {void}
 */
function toggleTemplateSelection(templateId: string): void {
  const nextSelected = new Set(selectedTemplateIds.value)
  // 已选中则移除，未选中则加入，保持跨分页选择。
  if (nextSelected.has(templateId)) {
    nextSelected.delete(templateId)
  } else {
    nextSelected.add(templateId)
  }
  setSelectedTemplateIds(nextSelected)
}

/**
 * @description: 切换当前页全选状态
 * @return {void}
 */
function toggleCurrentPageSelection(): void {
  const nextSelected = new Set(selectedTemplateIds.value)
  if (isCurrentPageAllSelected.value) {
    // 当前页全选时再次点击只取消当前页，不影响其他分页已选模板。
    pagedTemplates.value.forEach((template) => nextSelected.delete(template.id))
  } else {
    // 当前页未全选时补齐当前页所有模板。
    pagedTemplates.value.forEach((template) => nextSelected.add(template.id))
  }
  setSelectedTemplateIds(nextSelected)
}

/**
 * @description: 清理不存在模板的勾选状态
 * @return {void}
 */
function pruneSelection(): void {
  const existingIds = new Set(settingsStore.templates.map((template) => template.id))
  const nextSelected = new Set<string>()
  for (const templateId of selectedTemplateIds.value) {
    // 删除或导入刷新后，已不存在的 ID 必须移除，避免批量操作传入悬空 ID。
    if (existingIds.has(templateId)) nextSelected.add(templateId)
  }
  setSelectedTemplateIds(nextSelected)
}

/**
 * @description: 选择当前应用使用的模板
 * @param {KeyTemplate} template - 要选择的模板
 * @return {Promise<void>} 无返回值
 */
async function selectTemplate(template: KeyTemplate): Promise<void> {
  // 选择模板会持久化 current_template_id，供播放页和悬浮模式复用。
  await settingsStore.selectTemplate(template.id)
}

/**
 * @description: 打开空白新建抽屉
 * @return {Promise<void>} 无返回值
 */
async function createBlankTemplate(): Promise<void> {
  await editorDrawerRef.value?.createBlankTemplate()
}

/**
 * @description: 打开基于模板新增抽屉
 * @param {KeyTemplate} template - 被复制的模板
 * @return {Promise<void>} 无返回值
 */
async function createFromTemplate(template: KeyTemplate): Promise<void> {
  await editorDrawerRef.value?.createFromTemplate(template)
}

/**
 * @description: 打开编辑抽屉
 * @param {KeyTemplate} template - 要编辑的模板
 * @return {Promise<void>} 无返回值
 */
async function editTemplate(template: KeyTemplate): Promise<void> {
  await editorDrawerRef.value?.editTemplate(template)
}

/**
 * @description: 删除单个模板
 * @param {KeyTemplate} template - 要删除的模板
 * @return {Promise<void>} 无返回值
 */
async function deleteTemplate(template: KeyTemplate): Promise<void> {
  const confirmed = await confirm(t('template.confirmDelete'), {
    title: t('actions.delete'),
    kind: 'warning',
  })
  if (!confirmed) return

  try {
    // 删除后 store 会刷新模板列表，并在删除当前模板时回退到第一个可用模板。
    await settingsStore.deleteTemplate(template.id)
    // 删除成功后清理勾选，避免批量操作继续引用不存在模板。
    pruneSelection()
    toast.success(t('template.deleted'), { richColors: true })
  } catch (error) {
    // 后端可能因为文件权限失败，统一用 toast 告知。
    toast.error(t('template.deleteFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 批量删除已选模板
 * @return {Promise<void>} 无返回值
 */
async function deleteSelectedTemplates(): Promise<void> {
  const templates = selectedTemplates.value
  if (templates.length === 0) return

  const confirmed = await confirm(t('template.confirmBatchDelete', { count: templates.length }), {
    title: t('template.batchDelete'),
    kind: 'warning',
  })
  if (!confirmed) return

  try {
    for (const template of templates) {
      // 逐个调用现有删除命令，复用后端当前模板回退逻辑。
      await settingsStore.deleteTemplate(template.id)
    }
    // 删除完成后统一清空选择，避免跨分页残留。
    selectedTemplateIds.value = new Set()
    toast.success(t('template.batchDeleted', { count: templates.length }), { richColors: true })
  } catch (error) {
    toast.error(t('template.deleteFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 从本地 JSON 或 ZIP 文件导入模板
 * @return {Promise<void>} 无返回值
 */
async function importTemplate(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Template', extensions: ['json', 'zip'] }],
  })
  // 用户取消文件选择时 selected 为空；multiple=false 下数组属于防御分支。
  if (!selected || Array.isArray(selected)) return

  try {
    // 后端负责根据扩展名解析 JSON/ZIP、校验、名称唯一和生成不冲突 ID。
    const templates = await settingsStore.importTemplate(selected)
    toast.success(t('template.imported'), {
      description: t('template.importedCount', { count: templates.length }),
      richColors: true,
    })
  } catch (error) {
    // JSON/ZIP 格式错误、重名、非法按键或文件读取失败都会在这里反馈。
    toast.error(t('template.importFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 导出指定模板到本地 JSON 文件
 * @param {KeyTemplate} template - 要导出的模板
 * @return {Promise<void>} 无返回值
 */
async function exportTemplate(template: KeyTemplate): Promise<void> {
  const target = await saveDialog({
    defaultPath: `${template.name || template.id}.json`,
    filters: [{ name: 'Template JSON', extensions: ['json'] }],
  })
  // 用户取消保存时不调用后端写文件。
  if (!target) return

  try {
    // 导出由后端读取模板目录中的真实 JSON，避免前端缓存和文件内容不一致。
    await settingsStore.exportTemplate(template.id, target)
    toast.success(t('template.exported'), { richColors: true })
  } catch (error) {
    // 保存路径权限或模板读取失败都需要展示给用户。
    toast.error(t('template.exportFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 批量导出已选模板为 ZIP
 * @return {Promise<void>} 无返回值
 */
async function exportSelectedTemplates(): Promise<void> {
  const templates = selectedTemplates.value
  if (templates.length === 0) return

  const target = await saveDialog({
    defaultPath: 'templates.zip',
    filters: [{ name: 'Template ZIP', extensions: ['zip'] }],
  })
  if (!target) return

  try {
    // 批量导出使用 ID 列表交给后端读取真实模板文件，避免导出前端缓存。
    await settingsStore.exportTemplatesArchive(
      templates.map((template) => template.id),
      target
    )
    toast.success(t('template.exported'), {
      description: t('template.exportedCount', { count: templates.length }),
      richColors: true,
    })
  } catch (error) {
    toast.error(t('template.exportFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 切换页码
 * @param {number} nextPage - 新页码
 * @return {void}
 */
function changePage(nextPage: number): void {
  // 页码由 Pagination 组件保护，这里仍然夹取一次作为业务防线。
  currentPage.value = Math.min(Math.max(1, nextPage), totalPages.value)
}

/**
 * @description: 切换分页大小
 * @param {number} nextPageSize - 新分页大小
 * @return {void}
 */
function changePageSize(nextPageSize: number): void {
  // 页大小来自 Pagination，但仍需验证，防止非法值进入分页计算。
  if (!PAGE_SIZE_OPTIONS.includes(nextPageSize)) return
  pageSize.value = nextPageSize
  currentPage.value = 1
  persistPageSize(nextPageSize)
}

watch(searchKeyword, () => {
  // 搜索条件变化后回到第一页，避免当前页超过过滤后的总页数。
  currentPage.value = 1
})

watch(totalPages, () => {
  // 删除、导入或搜索可能让当前页越界，需要自动夹到合法范围。
  currentPage.value = Math.min(currentPage.value, totalPages.value)
})

watch(
  () => settingsStore.templates.map((template) => template.id).join(','),
  () => {
    // 模板列表刷新后移除已不存在的勾选项。
    pruneSelection()
  }
)

defineExpose({
  /**
   * @description: 暴露给父组件的离开守卫
   * @param {'close' | 'jump'} context - 离开场景
   * @return {Promise<boolean>} true 表示允许离开模板页
   */
  confirmLeaveIfNeeded(context: 'close' | 'jump' = 'close'): Promise<boolean> {
    // 未打开编辑抽屉时没有编辑状态，父级可以直接离开。
    return editorDrawerRef.value?.confirmLeaveIfNeeded(context) ?? Promise.resolve(true)
  },
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <section
      class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-primary/15 bg-white/75"
    >
      <div class="flex flex-wrap items-center gap-2 border-b border-primary/10 p-3">
        <div class="relative w-[320px] max-w-full">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="searchKeyword"
            class="h-9 bg-white pl-9"
            :placeholder="t('template.searchPlaceholder')"
          />
        </div>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <Button
            v-if="selectedTemplateIds.size > 0"
            variant="destructive"
            size="sm"
            @click="deleteSelectedTemplates"
          >
            <Trash2 class="size-4" />
            {{ t('template.batchDelete') }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="selectedTemplateIds.size === 0"
            @click="exportSelectedTemplates"
          >
            <FileArchive class="size-4" />
            {{ t('template.batchExport') }}
          </Button>
          <Button variant="outline" size="sm" @click="importTemplate">
            <FolderDown class="size-4" />
            {{ t('template.importTemplate') }}
          </Button>
          <Button size="sm" @click="createBlankTemplate">
            <Plus class="size-4" />
            {{ t('template.blankTemplate') }}
          </Button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader class="sticky top-0 z-[1] bg-white/95">
            <TableRow>
              <TableHead class="w-12">
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  :checked="isCurrentPageAllSelected"
                  @change="toggleCurrentPageSelection"
                />
              </TableHead>
              <TableHead>{{ t('template.name') }}</TableHead>
              <TableHead class="w-40">
                {{ t('template.mappingTotal') }}
              </TableHead>
              <TableHead class="w-16 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="template in pagedTemplates"
              :key="template.id"
              :data-state="settingsStore.currentTemplateId === template.id ? 'selected' : undefined"
            >
              <TableCell>
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  :checked="selectedTemplateIds.has(template.id)"
                  @change="toggleTemplateSelection(template.id)"
                />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  class="max-w-[520px] truncate text-left font-medium text-foreground hover:text-primary"
                  @click="selectTemplate(template)"
                >
                  {{ template.name }}
                </button>
                <p
                  v-if="settingsStore.currentTemplateId === template.id"
                  class="mt-1 text-xs text-primary"
                >
                  {{ t('template.currentTemplate') }}
                </p>
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ t('template.mappingCount', { count: template.mappings.length }) }}
              </TableCell>
              <TableCell class="text-right">
                <Popover>
                  <PopoverTrigger as-child>
                    <Button variant="ghost" size="icon" class="size-8">
                      <MoreVertical class="size-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-44 p-1" align="end">
                    <button class="menu-action" @click="selectTemplate(template)">
                      {{ t('template.useTemplate') }}
                    </button>
                    <button class="menu-action" @click="editTemplate(template)">
                      <Pencil class="size-4" />
                      {{ t('actions.edit') }}
                    </button>
                    <button class="menu-action" @click="createFromTemplate(template)">
                      <Copy class="size-4" />
                      {{ t('template.createFromTemplateShort') }}
                    </button>
                    <button class="menu-action" @click="exportTemplate(template)">
                      <Download class="size-4" />
                      {{ t('template.exportTemplate') }}
                    </button>
                    <button class="menu-action text-destructive" @click="deleteTemplate(template)">
                      <Trash2 class="size-4" />
                      {{ t('actions.delete') }}
                    </button>
                  </PopoverContent>
                </Popover>
              </TableCell>
            </TableRow>
            <TableRow v-if="pagedTemplates.length === 0">
              <TableCell colspan="4" class="py-16 text-center text-muted-foreground">
                {{ t('template.noTemplates') }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Pagination
        :page="currentPage"
        :page-size="pageSize"
        :total="filteredTemplates.length"
        :page-size-options="PAGE_SIZE_OPTIONS"
        @update:page="changePage"
        @update:page-size="changePageSize"
      />
    </section>

    <TemplateEditorDrawer ref="editorDrawerRef" @saved="pruneSelection" />
  </div>
</template>

<style scoped>
.menu-action {
  @apply flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-primary/10;
}
</style>
