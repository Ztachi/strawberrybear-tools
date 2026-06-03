<script setup lang="ts">
/**
 * @description: TemplateEditor - 自定义模板管理组件
 * @description 提供模板选择、空白新建、复制内置模板、编辑、删除、导入和导出入口，并将映射编辑委托给 Canvas 钢琴编辑器
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { confirm, open, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'vue-sonner'
import { Copy, Download, FilePlus, FolderDown, Pencil, Plus, Save, Trash2, X } from 'lucide-vue-next'
import { Badge, Button, Input } from '@/components/ui'
import { useSettingsStore } from '@/stores/settings'
import type { KeyTemplate } from '@/types'
import { normalizeTemplateMappings } from '@/lib/templateKeys'
import VisualTemplateEditor from './VisualTemplateEditor.vue'

const { t } = useI18n()
const settingsStore = useSettingsStore()

/** 当前正在编辑的自定义模板；为 null 时显示空状态 */
const editingTemplate = ref<KeyTemplate | null>(null)
/** 编辑来源模板 ID；null 表示新建或复制模板，用于判断是否存在未保存改动 */
const editingSourceId = ref<string | null>(null)

/** 模板列表展示顺序：内置模板优先，其余按显示名称排序 */
const sortedTemplates = computed(() =>
  [...settingsStore.templates].sort((a, b) => {
    // 内置模板优先展示，方便用户先从默认布局复制。
    if (a.is_builtin !== b.is_builtin) return a.is_builtin ? -1 : 1
    // 同一分组内按用户看到的显示名排序，而不是按内部 id 排序。
    return getTemplateDisplayName(a).localeCompare(getTemplateDisplayName(b))
  })
)
/** 当前已选择模板，主要用于复制模板入口和列表选中态 */
const activeTemplate = computed(
  () => settingsStore.templates.find((template) => template.id === settingsStore.currentTemplateId) ?? null
)
/** 当前编辑内容是否相对源模板发生变化 */
const isDirty = computed(() => {
  // 没有打开编辑器时不展示未保存状态。
  if (!editingTemplate.value) return false
  // 复制或空白新建没有源模板，天然属于未保存状态。
  const source = settingsStore.templates.find((template) => template.id === editingSourceId.value)
  if (!source) return true
  // 模板对象字段较少，直接序列化比较可以稳定覆盖名称和映射变化。
  return JSON.stringify(source) !== JSON.stringify(editingTemplate.value)
})

/**
 * @description: 获取模板显示名称
 * @description 内置模板优先使用国际化名称，自定义模板直接使用用户保存的名称
 * @param {KeyTemplate} template - 模板对象
 * @return {string} 模板展示名称
 */
function getTemplateDisplayName(template: KeyTemplate): string {
  // 自定义模板名称由用户定义，不走内置模板翻译表。
  if (!template.is_builtin) return template.name
  const key = `template.builtinNames.${template.id}` as any
  const translated = t(key)
  // vue-i18n 找不到 key 时会返回 key 本身，因此要排除这种情况。
  return translated && translated !== key ? translated : template.name
}

/**
 * @description: 创建自定义模板 ID
 * @return {string} 基于时间戳的自定义模板 ID
 */
function createTemplateId(): string {
  return `custom-${Date.now()}`
}

/**
 * @description: 创建空白模板并进入编辑态
 * @return {void}
 */
function createBlankTemplate() {
  // 空白模板不是从已有模板编辑，因此没有源 ID。
  editingSourceId.value = null
  editingTemplate.value = {
    id: createTemplateId(),
    name: t('template.newTemplate'),
    is_builtin: false,
    mappings: [],
  }
}

/**
 * @description: 复制模板并进入自定义模板编辑态
 * @description 内置模板不可直接编辑，因此内置模板的“编辑”行为也会走复制流程
 * @param {KeyTemplate} template - 被复制的模板
 * @return {void}
 */
function cloneTemplate(template: KeyTemplate) {
  // 复制模板保存为新 ID，避免修改或覆盖原模板。
  editingSourceId.value = null
  editingTemplate.value = {
    id: createTemplateId(),
    name: t('template.copyName', { name: getTemplateDisplayName(template) }),
    is_builtin: false,
    // 复制时同步清理旧数据，保证进入编辑器的映射已经满足前端规则。
    mappings: normalizeTemplateMappings(template.mappings),
  }
}

/**
 * @description: 编辑已有自定义模板
 * @description 如果传入内置模板，则自动复制为新的自定义模板，避免覆盖内置映射
 * @param {KeyTemplate} template - 要编辑的模板
 * @return {void}
 */
function editTemplate(template: KeyTemplate) {
  if (template.is_builtin) {
    // 内置模板只读，用户点击编辑时实际创建一份可编辑副本。
    cloneTemplate(template)
    return
  }
  // 记录源模板 ID，用于比较未保存状态和删除当前编辑模板时关闭编辑器。
  editingSourceId.value = template.id
  // 深拷贝后编辑，避免用户未保存时直接修改 Pinia 中的模板列表。
  editingTemplate.value = JSON.parse(JSON.stringify(template))
  // 打开编辑器时归一化，防止旧模板 JSON 中的非法映射进入 Canvas。
  editingTemplate.value!.mappings = normalizeTemplateMappings(editingTemplate.value!.mappings)
}

/**
 * @description: 取消当前编辑并回到空状态
 * @return {void}
 */
function cancelEdit() {
  // 同时清理编辑内容和源 ID，确保下一次新建/复制不会误判 dirty 状态。
  editingSourceId.value = null
  editingTemplate.value = null
}

/**
 * @description: 选择当前应用使用的模板
 * @param {KeyTemplate} template - 要选择的模板
 * @return {Promise<void>} 无返回值
 */
async function selectTemplate(template: KeyTemplate) {
  // 选择模板会持久化 current_template_id，供播放页和悬浮模式复用。
  await settingsStore.selectTemplate(template.id)
}

/**
 * @description: 保存当前编辑模板
 * @description 保存前会去除名称首尾空格、强制标记为自定义模板，并归一化映射列表
 * @return {Promise<void>} 无返回值
 */
async function saveEditingTemplate() {
  // 防御式判断：空状态点击保存不做任何事。
  if (!editingTemplate.value) return
  // 保存前构造新对象，避免在校验失败时修改编辑中的响应式对象。
  const template = {
    ...editingTemplate.value,
    // 名称首尾空格不应持久化。
    name: editingTemplate.value.name.trim(),
    // 前端永远只保存自定义模板，内置模板保护由前后端共同保证。
    is_builtin: false,
    // 保存前再次归一化，避免 Canvas 外部或导入旧数据留下非法映射。
    mappings: normalizeTemplateMappings(editingTemplate.value.mappings),
  }

  if (!template.name) {
    // 空名称会导致模板列表不可读，直接阻止保存。
    toast.error(t('template.nameRequired'), { richColors: true })
    return
  }

  try {
    // 保存成功后会刷新模板列表并自动选择该模板。
    await settingsStore.saveTemplate(template)
    toast.success(t('template.saved'), { richColors: true })
    cancelEdit()
  } catch (error) {
    // 后端还会做 ID、内置覆盖和按键白名单校验，错误需要透传给用户。
    toast.error(t('template.saveFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 删除自定义模板
 * @description 内置模板在前端和后端都不可删除；删除当前编辑模板时会同步关闭编辑器
 * @param {KeyTemplate} template - 要删除的模板
 * @return {Promise<void>} 无返回值
 */
async function deleteTemplate(template: KeyTemplate) {
  // 内置模板删除入口不会展示，这里再做一次防御。
  if (template.is_builtin) return
  // 删除是不可逆文件操作，必须二次确认。
  const confirmed = await confirm(t('template.confirmDelete'), {
    title: t('actions.delete'),
    kind: 'warning',
  })
  if (!confirmed) return

  try {
    // 删除后 store 会刷新模板列表，并在删除当前模板时回退到第一个可用模板。
    await settingsStore.deleteTemplate(template.id)
    if (editingSourceId.value === template.id) {
      // 如果正在编辑被删除的模板，需要关闭编辑器，避免继续保存已删除 ID。
      cancelEdit()
    }
    toast.success(t('template.deleted'), { richColors: true })
  } catch (error) {
    // 后端可能因为文件权限或模板保护失败，统一用 toast 告知。
    toast.error(t('template.deleteFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 从本地 JSON 文件导入模板
 * @description 后端负责解析、校验和冲突 ID 重命名，导入成功后自动选中新模板
 * @return {Promise<void>} 无返回值
 */
async function importTemplate() {
  // 只允许选择单个 JSON 文件，模板合并和冲突处理交给后端。
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Template JSON', extensions: ['json'] }],
  })
  // 用户取消文件选择时 selected 为空；multiple=false 下数组属于防御分支。
  if (!selected || Array.isArray(selected)) return

  try {
    // 后端负责解析、校验、生成不冲突 ID，并返回实际保存的模板。
    const template = await settingsStore.importTemplate(selected)
    toast.success(t('template.imported'), { description: template.name, richColors: true })
  } catch (error) {
    // JSON 格式错误、非法按键或文件读取失败都会在这里反馈。
    toast.error(t('template.importFailed'), { description: String(error), richColors: true })
  }
}

/**
 * @description: 导出指定模板到本地 JSON 文件
 * @param {KeyTemplate} template - 要导出的模板
 * @return {Promise<void>} 无返回值
 */
async function exportTemplate(template: KeyTemplate) {
  // 默认文件名使用展示名称，用户仍可在系统保存对话框中修改。
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

// 如果当前选择的是自定义模板，首次进入页面时直接打开编辑器，减少二次点击。
watch(
  () => activeTemplate.value?.id,
  () => {
    if (!editingTemplate.value && activeTemplate.value && !activeTemplate.value.is_builtin) {
      editTemplate(activeTemplate.value)
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-foreground">
          {{ t('template.title') }}
        </h2>
        <p class="text-sm text-muted-foreground">
          {{ t('template.description') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" @click="importTemplate">
          <FolderDown class="size-4" />
          {{ t('template.importTemplate') }}
        </Button>
        <Button variant="outline" size="sm" @click="createBlankTemplate">
          <Plus class="size-4" />
          {{ t('template.blankTemplate') }}
        </Button>
        <Button v-if="activeTemplate" size="sm" @click="cloneTemplate(activeTemplate)">
          <Copy class="size-4" />
          {{ t('template.copyTemplate') }}
        </Button>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-4">
      <aside class="min-h-0 overflow-y-auto rounded-xl border border-primary/15 bg-white/70 p-3">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-medium text-foreground">{{ t('template.templateList') }}</span>
          <Badge variant="secondary">
            {{ sortedTemplates.length }}
          </Badge>
        </div>
        <div class="flex flex-col gap-2">
          <button
            v-for="template in sortedTemplates"
            :key="template.id"
            type="button"
            class="rounded-lg border p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
            :class="
              settingsStore.currentTemplateId === template.id
                ? 'border-primary bg-primary/10'
                : 'border-primary/10 bg-white/60'
            "
            @click="selectTemplate(template)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-foreground">
                  {{ getTemplateDisplayName(template) }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ t('template.mappingCount', { count: template.mappings.length }) }}
                </p>
              </div>
              <Badge variant="secondary">
                {{ template.is_builtin ? t('template.builtin') : t('template.custom') }}
              </Badge>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2"
                @click.stop="cloneTemplate(template)"
              >
                <Copy class="size-3.5" />
              </Button>
              <Button
                v-if="!template.is_builtin"
                variant="ghost"
                size="sm"
                class="h-7 px-2"
                @click.stop="editTemplate(template)"
              >
                <Pencil class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2"
                @click.stop="exportTemplate(template)"
              >
                <Download class="size-3.5" />
              </Button>
              <Button
                v-if="!template.is_builtin"
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-destructive hover:text-destructive"
                @click.stop="deleteTemplate(template)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </button>
        </div>
      </aside>

      <section
        class="flex min-h-0 flex-col gap-3 overflow-hidden rounded-xl border border-primary/15 bg-white/70 p-4"
      >
        <template v-if="editingTemplate">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div class="min-w-[240px] flex-1">
              <label class="mb-1 block text-xs font-medium text-muted-foreground">
                {{ t('template.name') }}
              </label>
              <Input v-model="editingTemplate.name" class="h-9 bg-white" />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Badge v-if="isDirty" variant="secondary">
                {{ t('template.unsaved') }}
              </Badge>
              <Button variant="outline" size="sm" @click="cancelEdit">
                <X class="size-4" />
                {{ t('actions.cancel') }}
              </Button>
              <Button size="sm" @click="saveEditingTemplate">
                <Save class="size-4" />
                {{ t('actions.save') }}
              </Button>
            </div>
          </div>

          <VisualTemplateEditor
            :mappings="editingTemplate.mappings"
            class="min-h-0 flex-1"
            @update:mappings="editingTemplate.mappings = $event"
          />
        </template>

        <div
          v-else
          class="flex h-full min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-primary/20 bg-primary/5 text-center"
        >
          <FilePlus class="mb-3 size-10 text-primary" />
          <p class="text-sm font-medium text-foreground">
            {{ t('template.emptyEditor') }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ t('template.emptyEditorTip') }}
          </p>
          <Button class="mt-4" size="sm" @click="createBlankTemplate">
            <Plus class="size-4" />
            {{ t('template.blankTemplate') }}
          </Button>
        </div>
      </section>
    </div>
  </div>
</template>
