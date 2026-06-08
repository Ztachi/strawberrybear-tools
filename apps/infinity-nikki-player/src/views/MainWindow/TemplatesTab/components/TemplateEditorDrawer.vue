<script setup lang="ts">
/**
 * @description: TemplateEditorDrawer - 模板编辑抽屉
 * @description 对齐 MIDI 详情抽屉交互，负责模板名称、Canvas 映射、草稿和未保存离开确认
 */
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { feedback as toast } from '@/lib/feedback'
import { Save, X } from 'lucide-vue-next'
import { Button, Drawer, Input, Modal, Tag, TypographyText } from 'antdv-next'
import { useSettingsStore } from '@/stores/settings'
import { getContentDrawerRootStyle, getMainWindowPopupContainer } from '@/theme/infinityNikkiTheme'
import type { KeyTemplate } from '@/types'
import { normalizeTemplateMappings } from '@/lib/templateKeys'
import VisualTemplateEditor from './VisualTemplateEditor.vue'

const { t } = useI18n()
const settingsStore = useSettingsStore()

/** 新建/基于此新增模板共用草稿持久化键。 */
const CREATE_TEMPLATE_DRAFT_KEY = 'infinity-nikki-player.template-draft.create'
/** 旧版新建模板草稿持久化键，用于兼容升级前残留草稿。 */
const LEGACY_NEW_TEMPLATE_DRAFT_KEY = 'infinity-nikki-player.new-template-draft'
/** 编辑模板草稿持久化键前缀；完整 key 使用打开编辑时的模板名称。 */
const EDIT_TEMPLATE_DRAFT_KEY_PREFIX = 'infinity-nikki-player.template-draft.edit.'
/** 模板草稿自动保存间隔，单位毫秒。 */
const DRAFT_AUTOSAVE_INTERVAL_MS = 15_000
/** 模板名称最多展示和保存 30 个字符。 */
const TEMPLATE_NAME_MAX_LENGTH = 30
/** 模板名称需要能直接作为 Windows/macOS 文件名主体。 */
const TEMPLATE_FILE_NAME_PATTERN =
  /^(?!(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$)(?!.*[<>:"/\\|?*])(?!.*[ .]$).{1,30}$/i

/**
 * @description: 抽屉编辑模式
 */
type EditorMode = 'create' | 'edit' | 'duplicate'

/**
 * @description: 离开抽屉或页面时用户选择的动作
 */
type LeaveDecision = 'save' | 'discard' | 'cancel'

/**
 * @description: 发现草稿时用户选择的动作
 */
type DraftDecision = 'load' | 'discard' | 'cancel'

/**
 * @description: 离开确认结果回调
 */
type LeaveDecisionResolver = {
  /**
   * @description: 接收用户在离开确认中的选择
   * @param {LeaveDecision} args.0 - 用户选择
   * @return {void}
   */
  // eslint-disable-next-line no-unused-vars
  (...args: [LeaveDecision]): void
}

/**
 * @description: promise 化确认框状态
 */
interface LeaveConfirmState {
  /** 是否显示确认框 */
  open: boolean
  /** 触发确认的场景，用于切换按钮文案 */
  context: 'close' | 'jump'
  /** 等待用户选择的 resolver */
  resolve: LeaveDecisionResolver | null
}

/**
 * @description: 模板编辑抽屉事件
 */
const emit = defineEmits<{
  /** 保存后通知父级刷新依赖状态 */
  saved: []
}>()

/** 抽屉是否打开，关闭动作统一走 dirty guard。 */
const isDrawerOpen = ref(false)
/** 当前编辑器模式，决定保存后是新增、编辑还是基于副本新增。 */
const editorMode = ref<EditorMode>('create')
/** 当前正在编辑的模板副本；始终不直接修改 Pinia 列表中的对象。 */
const editingTemplate = ref<KeyTemplate | null>(null)
/** 抽屉打开时的稳定序列化快照，用于判断是否真的改动。 */
const initialEditorSnapshot = ref('')
/** 当前编辑会话使用的草稿持久化键。 */
const activeDraftKey = ref('')
/** 草稿自动保存计时器句柄。 */
let draftTimer: ReturnType<typeof window.setInterval> | null = null
/** promise 化三选离开确认状态。 */
const leaveConfirm = ref<LeaveConfirmState>({
  open: false,
  context: 'close',
  resolve: null,
})

/** 抽屉标题根据编辑模式展示。 */
const drawerTitle = computed(() => {
  if (editorMode.value === 'edit') return t('template.editTemplate')
  if (editorMode.value === 'duplicate') return t('template.createFromTemplate')
  return t('template.createTemplate')
})

/**
 * @description: 创建自定义模板 ID
 * @return {string} 基于时间戳的自定义模板 ID
 */
function createTemplateId(): string {
  // 前端 ID 只作为临时候选；后端保存时还会校验安全字符和名称唯一性。
  return `custom-${Date.now()}`
}

/**
 * @description: 深拷贝模板并归一化映射
 * @param {KeyTemplate} template - 原始模板
 * @return {KeyTemplate} 可安全编辑的模板副本
 */
function cloneEditableTemplate(template: KeyTemplate): KeyTemplate {
  // JSON 深拷贝足够覆盖模板的纯数据结构，避免编辑时污染 Pinia 原始列表。
  const cloned: KeyTemplate = JSON.parse(JSON.stringify(template))
  // 映射进入编辑器前先清理，防止旧 JSON 中的重复键影响 Canvas 状态。
  cloned.mappings = normalizeTemplateMappings(cloned.mappings)
  return cloned
}

/**
 * @description: 稳定序列化模板
 * @description 对名称和映射做归一化，避免无意义顺序或空格触发脏检查
 * @param {KeyTemplate | null} template - 待序列化模板
 * @return {string} 稳定 JSON 字符串
 */
function serializeTemplate(template: KeyTemplate | null): string {
  // 空编辑器没有变更面，直接返回空串参与比对。
  if (!template) return ''
  // 构造规范对象，确保“名称首尾空格”和“映射顺序”不会制造假 dirty。
  const normalized: KeyTemplate = {
    id: template.id,
    name: template.name.trim(),
    is_builtin: false,
    mappings: normalizeTemplateMappings(template.mappings),
  }
  // 模板对象字段固定，JSON.stringify 足够作为稳定快照。
  return JSON.stringify(normalized)
}

/**
 * @description: 编辑模式草稿 key 中的模板名称片段
 * @param {string} name - 模板名称
 * @return {string} 可安全拼接到 localStorage key 的名称
 */
function encodeDraftName(name: string): string {
  return encodeURIComponent(name.trim())
}

/**
 * @description: 读取编辑模板对应的草稿 key
 * @param {string} templateName - 打开编辑时的模板名称
 * @return {string} localStorage 草稿 key
 */
function getEditTemplateDraftKey(templateName: string): string {
  return `${EDIT_TEMPLATE_DRAFT_KEY_PREFIX}${encodeDraftName(templateName)}`
}

/**
 * @description: 当前模式是否属于新建模板生命周期
 * @return {boolean} true 表示 create 或 duplicate
 */
function isCreateLikeMode(): boolean {
  return editorMode.value === 'create' || editorMode.value === 'duplicate'
}

/**
 * @description: 判断模板名称是否与其他模板重复
 * @param {KeyTemplate} template - 待保存模板
 * @return {boolean} true 表示存在重复名称
 */
function hasDuplicateTemplateName(template: KeyTemplate): boolean {
  const name = template.name.trim()
  // 空名称由 nameRequired 单独提示，这里只负责重复校验。
  if (!name) return false
  return settingsStore.templates.some((item) => {
    // 编辑已有模板时，当前模板自身不参与重复名称比较。
    if (item.id === template.id) return false
    // 名称唯一规则按 trim 后原样比较，不额外做大小写折叠。
    return item.name.trim() === name
  })
}

/**
 * @description: 判断模板名称是否可作为跨平台文件名
 * @param {string} name - 模板名称
 * @return {boolean} true 表示符合 Windows/macOS 文件名规范
 */
function isValidTemplateFileName(name: string): boolean {
  return (
    TEMPLATE_FILE_NAME_PATTERN.test(name) &&
    !Array.from(name).some((char) => char.charCodeAt(0) < 32)
  )
}

/**
 * @description: 当前编辑器是否有真实未保存改动
 * @return {boolean} true 表示需要离开确认
 */
function hasEditorChanges(): boolean {
  // 抽屉关闭或没有编辑对象时，不应阻止 Tab 切换和 MIDI 导入。
  if (!isDrawerOpen.value || !editingTemplate.value) return false
  // 序列化比对只关注持久化字段，避免响应式代理和对象引用影响结果。
  return serializeTemplate(editingTemplate.value) !== initialEditorSnapshot.value
}

/**
 * @description: 打开抽屉并初始化编辑快照
 * @param {KeyTemplate} template - 要编辑的模板副本
 * @param {EditorMode} mode - 编辑模式
 * @return {void}
 */
function openEditor(
  template: KeyTemplate,
  mode: EditorMode,
  options: { draftKey?: string; baselineTemplate?: KeyTemplate } = {}
): void {
  // 模式先写入，后续保存逻辑和草稿逻辑都依赖这个状态判断。
  editorMode.value = mode
  activeDraftKey.value =
    options.draftKey ??
    (mode === 'edit' ? getEditTemplateDraftKey(template.name) : CREATE_TEMPLATE_DRAFT_KEY)
  // 编辑对象永远是副本，避免用户未保存时改变列表显示。
  editingTemplate.value = cloneEditableTemplate(template)
  // 默认模板也可编辑，但保存后统一视为普通用户模板。
  editingTemplate.value.is_builtin = false
  // 初始快照在抽屉打开前写入，用于关闭和 Tab 切换时判断 dirty。
  initialEditorSnapshot.value = serializeTemplate(options.baselineTemplate ?? editingTemplate.value)
  // 打开抽屉后才启动草稿计时，避免关闭状态写入空草稿。
  isDrawerOpen.value = true
  restartDraftAutosave()
}

/**
 * @description: 按草稿 key 读取模板草稿
 * @param {string} draftKey - localStorage 草稿 key
 * @return {KeyTemplate | null} 草稿模板或 null
 */
function readTemplateDraft(draftKey: string): KeyTemplate | null {
  const rawDraft = window.localStorage.getItem(draftKey)
  if (!rawDraft) return null
  try {
    const draft = JSON.parse(rawDraft) as KeyTemplate
    return {
      ...draft,
      is_builtin: false,
      mappings: normalizeTemplateMappings(draft.mappings ?? []),
    }
  } catch {
    clearTemplateDraft(draftKey)
    return null
  }
}

/**
 * @description: 读取新建/基于新增模板草稿，兼容旧版草稿 key
 * @return {KeyTemplate | null} 草稿模板或 null
 */
function readCreateTemplateDraft(): KeyTemplate | null {
  const draft = readTemplateDraft(CREATE_TEMPLATE_DRAFT_KEY)
  if (draft) return draft

  const legacyDraft = readTemplateDraft(LEGACY_NEW_TEMPLATE_DRAFT_KEY)
  if (legacyDraft) {
    window.localStorage.setItem(CREATE_TEMPLATE_DRAFT_KEY, serializeTemplate(legacyDraft))
    clearTemplateDraft(LEGACY_NEW_TEMPLATE_DRAFT_KEY)
    return legacyDraft
  }

  return null
}

/**
 * @description: 删除指定模板草稿
 * @param {string} draftKey - localStorage 草稿 key
 * @return {void}
 */
function clearTemplateDraft(draftKey: string): void {
  window.localStorage.removeItem(draftKey)
}

/**
 * @description: 删除新建/基于新增模板草稿
 * @return {void}
 */
function clearCreateTemplateDraft(): void {
  clearTemplateDraft(CREATE_TEMPLATE_DRAFT_KEY)
  clearTemplateDraft(LEGACY_NEW_TEMPLATE_DRAFT_KEY)
}

/**
 * @description: 写入当前编辑会话对应草稿
 * @return {void}
 */
function writeCurrentTemplateDraft(): void {
  if (!activeDraftKey.value || !editingTemplate.value || !hasEditorChanges()) return
  window.localStorage.setItem(activeDraftKey.value, serializeTemplate(editingTemplate.value))
}

/**
 * @description: 创建空白模板并打开抽屉
 * @return {Promise<void>} 无返回值
 */
async function createBlankTemplate(): Promise<void> {
  // 先检查未保存编辑器，避免用户通过“新增”覆盖当前抽屉状态。
  if (!(await confirmLeaveIfNeeded('close'))) return

  const draft = readCreateTemplateDraft()
  if (draft) {
    const draftDecision = await confirmLoadDraft()
    if (draftDecision === 'cancel') return
    if (draftDecision === 'load') {
      openEditor(draft, 'create', { draftKey: CREATE_TEMPLATE_DRAFT_KEY })
      return
    }
    // 只有用户明确点击丢弃草稿时才清理，Esc/蒙层关闭会保留草稿并中止进入编辑器。
    clearCreateTemplateDraft()
  }

  openEditor(
    {
      id: createTemplateId(),
      name: t('template.newTemplate'),
      is_builtin: false,
      mappings: [],
    },
    'create',
    { draftKey: CREATE_TEMPLATE_DRAFT_KEY }
  )
}

function confirmLoadDraft(): Promise<DraftDecision> {
  return new Promise((resolve) => {
    const modal = Modal.confirm({
      title: t('template.draftFound'),
      content: t('template.loadDraftPrompt'),
      okText: t('template.loadDraft'),
      cancelText: t('actions.cancel'),
      centered: true,
      footer: () => [
        h(
          Button,
          {
            key: 'cancel',
            size: 'small',
            color: 'primary',
            variant: 'outlined',
            onClick: () => {
              modal.destroy()
              resolve('cancel')
            },
          },
          () => t('actions.cancel')
        ),
        h(
          Button,
          {
            key: 'discard',
            size: 'small',
            color: 'primary',
            variant: 'outlined',
            onClick: () => {
              modal.destroy()
              resolve('discard')
            },
          },
          () => t('template.discardDraft')
        ),
        h(
          Button,
          {
            key: 'load',
            type: 'primary',
            size: 'small',
            onClick: () => {
              modal.destroy()
              resolve('load')
            },
          },
          () => t('template.loadDraft')
        ),
      ],
      onOk: () => {
        resolve('load')
      },
      onCancel: () => {
        resolve('cancel')
      },
    })
  })
}

/**
 * @description: 基于现有模板创建新模板
 * @param {KeyTemplate} template - 被复制的模板
 * @return {Promise<void>} 无返回值
 */
async function createFromTemplate(template: KeyTemplate): Promise<void> {
  // 切换编辑目标前必须先处理当前未保存内容，保证同一时间只有一个抽屉编辑上下文。
  if (!(await confirmLeaveIfNeeded('close'))) return

  const draft = readCreateTemplateDraft()
  if (draft) {
    const draftDecision = await confirmLoadDraft()
    if (draftDecision === 'cancel') return
    if (draftDecision === 'load') {
      openEditor(draft, 'duplicate', { draftKey: CREATE_TEMPLATE_DRAFT_KEY })
      return
    }
    clearCreateTemplateDraft()
  }

  openEditor(
    {
      id: createTemplateId(),
      name: t('template.copyName', { name: template.name }),
      is_builtin: false,
      mappings: normalizeTemplateMappings(template.mappings),
    },
    'duplicate',
    { draftKey: CREATE_TEMPLATE_DRAFT_KEY }
  )
}

/**
 * @description: 编辑已有模板
 * @param {KeyTemplate} template - 要编辑的模板
 * @return {Promise<void>} 无返回值
 */
async function editTemplate(template: KeyTemplate): Promise<void> {
  // 打开另一条模板前先处理当前抽屉未保存内容。
  if (!(await confirmLeaveIfNeeded('close'))) return
  const draftKey = getEditTemplateDraftKey(template.name)
  const draft = readTemplateDraft(draftKey)
  if (draft) {
    const draftDecision = await confirmLoadDraft()
    if (draftDecision === 'cancel') return
    if (draftDecision === 'load') {
      openEditor(draft, 'edit', { draftKey, baselineTemplate: template })
      return
    }
    clearTemplateDraft(draftKey)
  }
  openEditor(template, 'edit', { draftKey })
}

/**
 * @description: 保存当前编辑模板
 * @return {Promise<boolean>} true 表示保存成功
 */
async function saveEditingTemplate(): Promise<boolean> {
  // 防御式判断：空状态点击保存不做任何事，并告诉调用方没有完成保存。
  if (!editingTemplate.value) return false
  const previousDraftKey = activeDraftKey.value
  const rawTemplateName = editingTemplate.value.name
  const template: KeyTemplate = {
    ...editingTemplate.value,
    // 名称首尾空格不应持久化。
    name: editingTemplate.value.name.trim(),
    // 默认模板保存后也作为普通模板处理，避免继续出现差异化 UI。
    is_builtin: false,
    // 保存前再次归一化，避免 Canvas 外部或导入旧数据留下非法映射。
    mappings: normalizeTemplateMappings(editingTemplate.value.mappings),
  }

  if (!template.name) {
    // 空名称会导致模板列表不可读，直接阻止保存。
    toast.error(t('template.nameRequired'), { richColors: true })
    return false
  }
  if (!isValidTemplateFileName(rawTemplateName)) {
    // 模板名称会用于导出文件名，保存前先按跨平台文件名规范拦截。
    toast.error(t('template.nameInvalid'), { richColors: true })
    return false
  }
  if (hasDuplicateTemplateName(template)) {
    // 名称唯一先在前端即时提示，后端仍会作为最终安全边界。
    toast.error(t('template.nameDuplicated'), { richColors: true })
    return false
  }

  try {
    // 保存成功后会刷新模板列表并自动选择该模板。
    await settingsStore.saveTemplate(template)
    toast.success(t('template.saved'), { richColors: true })
    if (previousDraftKey) clearTemplateDraft(previousDraftKey)
    if (isCreateLikeMode()) clearCreateTemplateDraft()
    // 新建和基于新增保存后正式进入编辑态，后续草稿按模板名称隔离。
    editorMode.value = 'edit'
    activeDraftKey.value = getEditTemplateDraftKey(template.name)
    // 保存后的当前内容就是新基线，避免保存并继续编辑时仍显示 dirty。
    editingTemplate.value = cloneEditableTemplate(template)
    initialEditorSnapshot.value = serializeTemplate(editingTemplate.value)
    emit('saved')
    return true
  } catch (error) {
    // 后端还会做 ID、名称唯一和按键白名单校验，错误需要透传给用户。
    toast.error(t('template.saveFailed'), { description: String(error), richColors: true })
    return false
  }
}

/**
 * @description: 保存当前编辑模板并关闭抽屉
 * @return {Promise<void>} 无返回值
 */
async function saveAndCloseEditor(): Promise<void> {
  const saved = await saveEditingTemplate()
  if (!saved) return
  closeEditorWithoutPrompt()
}

/**
 * @description: 保存当前编辑模板但保持抽屉打开
 * @return {Promise<void>} 无返回值
 */
async function saveAndKeepEditing(): Promise<void> {
  await saveEditingTemplate()
}

/**
 * @description: 不弹确认直接关闭抽屉并清理编辑状态
 * @return {void}
 */
function closeEditorWithoutPrompt(): void {
  // 关闭前停止草稿计时器，避免抽屉已关闭但定时器继续写 localStorage。
  stopDraftAutosave()
  // 清理编辑对象和快照，下一次打开会重新建立独立上下文。
  editingTemplate.value = null
  initialEditorSnapshot.value = ''
  activeDraftKey.value = ''
  isDrawerOpen.value = false
}

/**
 * @description: 处理 Drawer open 状态变更
 * @param {boolean} nextOpen - 目标打开状态
 * @return {Promise<void>} 无返回值
 */
async function handleDrawerOpenChange(nextOpen: boolean): Promise<void> {
  if (nextOpen) {
    // 抽屉只能通过新增/编辑入口打开，外部 open=true 仅同步状态。
    isDrawerOpen.value = true
    return
  }
  // 用户点遮罩或系统触发关闭时，必须走统一未保存守卫。
  await confirmLeaveIfNeeded('close')
}

/**
 * @description: 展示离开确认框并返回用户选择
 * @param {'close' | 'jump'} context - 触发确认的场景
 * @return {Promise<LeaveDecision>} 用户选择
 */
function requestLeaveDecision(context: 'close' | 'jump'): Promise<LeaveDecision> {
  return new Promise((resolve) => {
    // 同一时间只允许一个离开确认，新的请求复用当前确认状态。
    leaveConfirm.value = {
      open: true,
      context,
      resolve,
    }
  })
}

/**
 * @description: 完成离开确认
 * @param {LeaveDecision} decision - 用户选择
 * @return {void}
 */
function resolveLeaveDecision(decision: LeaveDecision): void {
  const resolve = leaveConfirm.value.resolve
  // 先关闭弹窗，避免保存过程中弹窗遮挡错误 toast。
  leaveConfirm.value.open = false
  leaveConfirm.value.resolve = null
  // resolver 可能因为组件卸载已被清理，调用前需要判空。
  if (resolve) resolve(decision)
}

/**
 * @description: 如有未保存改动则确认是否允许离开
 * @param {'close' | 'jump'} context - 离开场景
 * @return {Promise<boolean>} true 表示允许继续离开
 */
async function confirmLeaveIfNeeded(context: 'close' | 'jump' = 'close'): Promise<boolean> {
  // 没有真实改动时不弹窗，避免无意义阻塞导入和 Tab 切换。
  if (!hasEditorChanges()) {
    // 离开动作本身仍然要清理抽屉，否则切页或导入后编辑器会继续覆盖新页面。
    if (isDrawerOpen.value) closeEditorWithoutPrompt()
    return true
  }

  // 离开类动作先落一份草稿，再询问用户要保存、丢弃还是取消。
  writeCurrentTemplateDraft()

  const decision = await requestLeaveDecision(context)
  if (decision === 'cancel') {
    // 取消表示完全中止外部动作，例如不切页、不导入 MIDI。
    return false
  }
  if (decision === 'discard') {
    // 直接离开只丢弃当前编辑状态；新建草稿仍保留，方便下次恢复。
    closeEditorWithoutPrompt()
    return true
  }

  // 保存并离开必须等待后端成功；失败时保持当前页面和抽屉，避免数据丢失。
  const saved = await saveEditingTemplate()
  if (saved) closeEditorWithoutPrompt()
  return saved
}

/**
 * @description: 判断刷新前是否需要阻止整页卸载
 * @return {boolean} true 表示模板抽屉存在未保存改动
 */
function hasPendingChanges(): boolean {
  // 刷新保护必须复用编辑器原有 dirty 判断，避免主窗口维护第二套模板差异状态。
  return hasEditorChanges()
}

/**
 * @description: 刷新前同步写入当前模板草稿
 * @return {void}
 */
function writePendingDraft(): void {
  // 只有真实 dirty 时才写草稿，避免普通刷新把空编辑器状态覆盖到 localStorage。
  if (!hasEditorChanges()) return
  writeCurrentTemplateDraft()
}

/**
 * @description: 停止草稿自动保存
 * @return {void}
 */
function stopDraftAutosave(): void {
  if (!draftTimer) return
  // 清理旧计时器，避免重复打开抽屉后产生多个 autosave。
  window.clearInterval(draftTimer)
  draftTimer = null
}

/**
 * @description: 重启草稿自动保存
 * @return {void}
 */
function restartDraftAutosave(): void {
  // 每次打开或切换模式都先清理旧计时器，保证最多只有一个草稿任务。
  stopDraftAutosave()
  if (!activeDraftKey.value) return
  // 模板每 15 秒保存一次草稿，避免频繁写 localStorage 影响交互。
  draftTimer = window.setInterval(writeCurrentTemplateDraft, DRAFT_AUTOSAVE_INTERVAL_MS)
}

/**
 * @description: 判断是否为保存快捷键
 * @param {KeyboardEvent} event - 键盘事件
 * @return {boolean} true 表示 Ctrl/Cmd+S
 */
function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
}

/**
 * @description: 处理模板编辑抽屉保存快捷键
 * @param {KeyboardEvent} event - 键盘事件
 * @return {void}
 */
function handleSaveShortcut(event: KeyboardEvent): void {
  if (!isDrawerOpen.value || !editingTemplate.value || !isSaveShortcut(event)) return
  event.preventDefault()
  event.stopPropagation()
  void saveAndKeepEditing()
}

onMounted(() => {
  window.addEventListener('keydown', handleSaveShortcut)
})

onBeforeUnmount(() => {
  // 组件销毁时停止草稿定时器，避免后台继续写入。
  stopDraftAutosave()
  // 如果确认框还在等待，按取消处理，避免父级 await 永久挂起。
  resolveLeaveDecision('cancel')
  window.removeEventListener('keydown', handleSaveShortcut)
})

defineExpose({
  createBlankTemplate,
  createFromTemplate,
  editTemplate,
  confirmLeaveIfNeeded,
  hasPendingChanges,
  writePendingDraft,
})
</script>

<template>
  <Drawer
    :open="isDrawerOpen"
    placement="left"
    size="100%"
    root-class="content-area-drawer template-editor-drawer"
    :closable="false"
    :get-container="getMainWindowPopupContainer"
    :root-style="getContentDrawerRootStyle()"
    @update:open="handleDrawerOpenChange"
  >
    <template #title>
      <div>
        <h2 class="text-base font-semibold text-foreground">
          {{ drawerTitle }}
        </h2>
      </div>
    </template>
    <template #extra>
      <div class="flex shrink-0 items-center gap-2">
        <Tag v-if="hasEditorChanges()" color="pink">
          {{ t('template.unsaved') }}
        </Tag>
        <Button
          size="small"
          color="primary"
          variant="outlined"
          @click="handleDrawerOpenChange(false)"
        >
          <template #icon>
            <X class="size-4" />
          </template>
          {{ t('actions.cancel') }}
        </Button>
        <Button size="small" color="primary" variant="outlined" @click="saveAndKeepEditing">
          <template #icon>
            <Save class="size-4" />
          </template>
          {{ t('template.save') }}
        </Button>
        <Button type="primary" size="small" @click="saveAndCloseEditor">
          <template #icon>
            <Save class="size-4" />
          </template>
          {{ t('template.saveAndExit') }}
        </Button>
      </div>
    </template>

    <template v-if="editingTemplate">
      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div class="max-w-xl">
          <TypographyText class="mb-1 block text-xs font-medium text-muted-foreground">
            {{ t('template.name') }}
          </TypographyText>
          <Input
            v-model:value="editingTemplate.name"
            class="h-9 bg-white"
            allow-clear
            show-count
            :maxlength="TEMPLATE_NAME_MAX_LENGTH"
          />
        </div>

        <VisualTemplateEditor
          :mappings="editingTemplate.mappings"
          class="shrink-0"
          @update:mappings="editingTemplate.mappings = $event"
        />
      </div>
    </template>
  </Drawer>

  <Modal
    :open="leaveConfirm.open"
    :title="t('template.leaveConfirmTitle')"
    :footer="null"
    width="420"
    @cancel="resolveLeaveDecision('cancel')"
  >
    <div class="text-sm leading-6 text-muted-foreground">
      {{
        leaveConfirm.context === 'jump'
          ? t('template.leaveConfirmJumpDescription')
          : t('template.leaveConfirmCloseDescription')
      }}
    </div>
    <div class="mt-4 flex flex-wrap justify-end gap-2">
      <Button
        type="text"
        size="small"
        color="primary"
        variant="outlined"
        @click="resolveLeaveDecision('cancel')"
      >
        {{ t('actions.cancel') }}
      </Button>
      <Button
        size="small"
        color="primary"
        variant="outlined"
        @click="resolveLeaveDecision('discard')"
      >
        {{ t('template.discardAndExit') }}
      </Button>
      <Button type="primary" size="small" @click="resolveLeaveDecision('save')">
        {{ leaveConfirm.context === 'jump' ? t('template.saveAndJump') : t('template.saveAndExit') }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
:deep(.template-editor-drawer .ant-drawer-content) {
  background: var(--bg-white-95);
}

:deep(.template-editor-drawer .ant-drawer-header) {
  border-bottom-color: var(--border-primary-15);
}

:deep(.template-editor-drawer .ant-drawer-body) {
  display: flex;
  min-height: 0;
  padding: 0;
}
</style>
