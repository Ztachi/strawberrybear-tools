<script setup lang="ts">
/**
 * @description: TemplateEditor - 模板管理页主体
 * @description 保留模板列表、工具栏、批量操作和分页等页面核心内容，并将重编辑区域委托给 TemplateEditorDrawer
 */
import { computed, ref, watch } from 'vue'
import type { HTMLAttributes } from 'vue'
import { useI18n } from 'vue-i18n'
import { open, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { feedback as toast } from '@/lib/feedback'
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
import { Button, Checkbox, Input, Modal, Pagination, Popover, Table, Tooltip } from 'antdv-next'
import type { PaginationProps, TableColumnsType } from 'antdv-next'
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
/** 模板名称在表格中最多展示 30 个字符，完整名称通过 Tooltip 查看。 */
const TEMPLATE_NAME_MAX_LENGTH = 30
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
/** 头部+表格头部高度 */
const totalHeaderHeight = ref(260)
/** 当前打开的表格行操作菜单模板 ID；受控关闭可避免进入抽屉后浮层残留。 */
const openActionMenuTemplateId = ref<string | null>(null)

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

/** 搜索后的模板列表，只按名称匹配，不暴露随机内部 ID。 */
const filteredTemplates = computed(() => {
  // 关键字统一 trim/lowercase，避免空格和大小写影响搜索结果。
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return settingsStore.templates
  return settingsStore.templates.filter((template) => template.name.toLowerCase().includes(keyword))
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

/** antdv 表格列定义；渲染内容放在插槽中，避免把业务操作函数塞进 columns。 */
const templateTableColumns = computed<TableColumnsType<KeyTemplate>>(() => [
  {
    key: 'selection',
    width: 48,
    fixed: 'left',
  },
  {
    key: 'name',
    title: t('template.name'),
    ellipsis: true,
  },
  {
    key: 'mappingTotal',
    title: t('template.mappingTotal'),
    width: 160,
  },
  {
    key: 'actions',
    width: 64,
    align: 'right',
    fixed: 'right',
  },
])

function getTruncatedTemplateName(name: string): string {
  const chars = Array.from(name)
  if (chars.length <= TEMPLATE_NAME_MAX_LENGTH) return name
  return `${chars.slice(0, TEMPLATE_NAME_MAX_LENGTH).join('')}...`
}

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
 * @description: 生成模板表格行事件
 * @param {KeyTemplate} template - 当前行模板
 * @return {HTMLAttributes} antdv-next Table 行属性
 */
function getTemplateRowProps(template: KeyTemplate): HTMLAttributes {
  return {
    onClick: () => toggleTemplateSelection(template.id),
  }
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
  closeTemplateActionMenu()
  await editorDrawerRef.value?.createFromTemplate(template)
}

/**
 * @description: 打开编辑抽屉
 * @param {KeyTemplate} template - 要编辑的模板
 * @return {Promise<void>} 无返回值
 */
async function editTemplate(template: KeyTemplate): Promise<void> {
  closeTemplateActionMenu()
  await editorDrawerRef.value?.editTemplate(template)
}

/**
 * @description: 删除单个模板
 * @param {KeyTemplate} template - 要删除的模板
 * @return {Promise<void>} 无返回值
 */
async function deleteTemplate(template: KeyTemplate): Promise<void> {
  closeTemplateActionMenu()
  const confirmed = await confirmTemplateAction(t('actions.delete'), t('template.confirmDelete'))
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

  const confirmed = await confirmTemplateAction(
    t('template.batchDelete'),
    t('template.confirmBatchDelete', { count: templates.length })
  )
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
  closeTemplateActionMenu()
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
 * @description: 关闭模板行操作菜单
 * @return {void}
 */
function closeTemplateActionMenu(): void {
  openActionMenuTemplateId.value = null
}

/**
 * @description: 更新指定模板行操作菜单打开状态
 * @param {string} templateId - 模板 ID
 * @param {boolean} open - 是否打开
 * @return {void}
 */
function setTemplateActionMenuOpen(templateId: string, open: boolean): void {
  // 同一时间只保留一个行菜单，选择任意操作后由动作函数主动关闭。
  openActionMenuTemplateId.value = open ? templateId : null
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
/**
 * @description: 处理分页大小更新
 * @param {number} nextPageSize - 新分页大小
 * @return {void}
 */
function handlePageSizeUpdate(nextPageSize: number): void {
  // 页大小来自 Pagination，但仍需验证，防止非法值进入分页计算。
  if (!PAGE_SIZE_OPTIONS.includes(nextPageSize)) return
  // 页大小变化后回到第一页，避免用户停留在新页大小下不存在的页码。
  currentPage.value = 1
  persistPageSize(nextPageSize)
}

/**
 * @description: 生成分页总数文案
 * @param {number} total - 总数量
 * @param {[number, number]} range - 当前页展示范围
 * @return {string} 分页总数文案
 */
const getTemplatePaginationTotal: PaginationProps['showTotal'] = (total, range) =>
  t('template.paginationTotal', { start: range[0], end: range[1], total })

/**
 * @description: 生成模板表格行样式
 * @param {KeyTemplate} template - 当前行模板
 * @return {string} 当前模板行高亮类名
 */
function getTemplateRowClassName(template: KeyTemplate): string {
  const classNames = ['template-table-row']
  if (template.is_builtin) classNames.push('template-row-builtin')
  if (selectedTemplateIds.value.has(template.id)) classNames.push('template-row-selected')
  return classNames.join(' ')
}

function confirmTemplateAction(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title,
      content,
      okText: t('actions.delete'),
      cancelText: t('actions.cancel'),
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
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
  <div class="template-editor-root flex h-full min-h-0 flex-col">
    <section
      class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-primary/15 bg-white/75"
    >
      <div class="flex flex-wrap items-center gap-2 border-b border-primary/10 p-3">
        <div class="w-[320px] max-w-full">
          <Input
            v-model:value="searchKeyword"
            class="h-9 bg-white"
            :placeholder="t('template.searchPlaceholder')"
          >
            <template #prefix>
              <Search class="size-4 text-muted-foreground" />
            </template>
          </Input>
        </div>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <Button
            v-if="selectedTemplateIds.size > 0"
            danger
            type="primary"
            size="small"
            @click="deleteSelectedTemplates"
          >
            <template #icon>
              <Trash2 class="size-4" />
            </template>
            {{ t('template.batchDelete') }}
          </Button>
          <Button
            size="small"
            color="primary"
            variant="outlined"
            :disabled="selectedTemplateIds.size === 0"
            @click="exportSelectedTemplates"
          >
            <template #icon>
              <FileArchive class="size-4" />
            </template>
            {{ t('template.batchExport') }}
          </Button>
          <Button size="small" color="primary" variant="outlined" @click="importTemplate">
            <template #icon>
              <FolderDown class="size-4" />
            </template>
            {{ t('template.importTemplate') }}
          </Button>
          <Button type="primary" size="small" @click="createBlankTemplate">
            <template #icon>
              <Plus class="size-4" />
            </template>
            {{ t('template.blankTemplate') }}
          </Button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden">
        <Table
          :data-source="pagedTemplates"
          :columns="templateTableColumns"
          :pagination="false"
          :scroll="{ y: `calc(100vh - ${totalHeaderHeight}px)` }"
          :locale="{ emptyText: t('template.noTemplates') }"
          :row-key="(template: KeyTemplate) => template.id"
          :row-class-name="getTemplateRowClassName"
          :on-row="getTemplateRowProps"
          size="small"
          class="template-table"
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

          <template #bodyCell="{ column, record: template }">
            <template v-if="column.key === 'selection'">
              <div class="flex items-center justify-center" @click.stop>
                <Checkbox
                  :checked="selectedTemplateIds.has(template.id)"
                  @change="toggleTemplateSelection(template.id)"
                />
              </div>
            </template>

            <template v-else-if="column.key === 'name'">
              <div class="min-w-0">
                <Tooltip :title="template.name" placement="topLeft">
                  <span class="template-name-text">
                    {{ getTruncatedTemplateName(template.name) }}
                  </span>
                </Tooltip>
              </div>
            </template>

            <template v-else-if="column.key === 'mappingTotal'">
              <span class="text-muted-foreground">
                {{ t('template.mappingCount', { count: template.mappings.length }) }}
              </span>
            </template>

            <template v-else-if="column.key === 'actions'">
              <div @click.stop>
                <Popover
                  trigger="click"
                  placement="bottomRight"
                  :open="openActionMenuTemplateId === template.id"
                  @update:open="setTemplateActionMenuOpen(template.id, $event)"
                >
                  <template #content>
                    <div class="flex flex-col">
                      <Button type="text" class="justify-start" @click="editTemplate(template)">
                        <template #icon>
                          <Pencil class="size-4" />
                        </template>
                        {{ t('actions.edit') }}
                      </Button>
                      <Button
                        type="text"
                        class="justify-start"
                        @click="createFromTemplate(template)"
                      >
                        <template #icon>
                          <Copy class="size-4" />
                        </template>
                        {{ t('template.createFromTemplateShort') }}
                      </Button>
                      <Button type="text" class="justify-start" @click="exportTemplate(template)">
                        <template #icon>
                          <Download class="size-4" />
                        </template>
                        {{ t('template.exportTemplate') }}
                      </Button>
                      <Button
                        type="text"
                        danger
                        class="justify-start"
                        @click="deleteTemplate(template)"
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
                    class="template-action-btn"
                  >
                    <template #icon>
                      <MoreVertical class="template-action-icon" />
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
          :total="filteredTemplates.length"
          :page-size-options="PAGE_SIZE_OPTIONS"
          :show-total="getTemplatePaginationTotal"
          show-size-changer
          size="small"
          @update:page-size="handlePageSizeUpdate"
        />
      </div>
    </section>

    <TemplateEditorDrawer ref="editorDrawerRef" @saved="pruneSelection" />
  </div>
</template>

<style scoped>

.template-table {
  @apply min-w-full;
}

.template-table :deep(.ant-table) {
  height: 100%;
}

.template-table :deep(.ant-table-container) {
  border-start-start-radius: 0;
  border-start-end-radius: 0;
}

.template-table :deep(.template-table-row) {
  cursor: pointer;
}

.template-table :deep(.template-table-row > td) {
  transition: background-color 0.2s ease;
}

.template-table :deep(.template-row-builtin > td) {
  background: rgba(255, 255, 255, 0.42);
}

.template-table :deep(.template-row-selected > td) {
  background: var(--bg-primary-15);
}

.template-table :deep(.template-table-row:hover > td) {
  background: var(--bg-primary-10);
}

.template-table :deep(.template-row-selected:hover > td) {
  background: var(--bg-primary-15);
}

.template-table :deep(.template-table-row:hover) .template-name-text {
  color: var(--color-primary);
}

.template-name-text {
  @apply block w-full max-w-full truncate font-medium text-foreground transition;
}

.template-action-btn {
  width: 32px;
  height: 32px;
}

.template-action-icon {
  width: 18px;
  height: 18px;
  stroke-width: 2.3;
}
</style>
