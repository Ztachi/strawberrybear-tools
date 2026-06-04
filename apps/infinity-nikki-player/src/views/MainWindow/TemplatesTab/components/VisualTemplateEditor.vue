<script setup lang="ts">
/**
 * @description: VisualTemplateEditor - Canvas 钢琴模板编辑器
 * @description 使用 Canvas 绘制 88 键钢琴，支持固定键宽编辑、全局预览、点按发音、键盘捕获映射和映射高亮
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { feedback as toast } from '@/lib/feedback'
import { Button, Popover } from 'antdv-next'
import { HelpCircle } from 'lucide-vue-next'
import { playNote } from '@/lib/midiPlayer'
import type { KeyMapping } from '@/types'
import {
  isBlackKey,
  isExcludedCaptureKey,
  normalizeMappingKeyFromEvent,
  pitchToNoteName,
  setMappingForPitch,
  SUPPORTED_MAPPING_KEYS,
  TEMPLATE_MAX_PITCH,
  TEMPLATE_MIN_PITCH,
} from '@/lib/templateKeys'

/**
 * @description: Canvas 琴键矩形
 * @description 保存每个 MIDI 音高在当前 Canvas 模式下的命中区域和黑白键信息
 */
interface PianoKeyRect {
  /** MIDI 音高 */
  pitch: number
  /** Canvas 逻辑坐标 x */
  x: number
  /** Canvas 逻辑坐标 y */
  y: number
  /** 琴键宽度 */
  width: number
  /** 琴键高度 */
  height: number
  /** 是否为黑键 */
  black: boolean
}

/**
 * @description: 组件属性
 * @param {KeyMapping[]} mappings - 当前模板映射列表
 */
const props = defineProps<{
  mappings: KeyMapping[]
}>()

/**
 * @description: 组件事件
 * @param {KeyMapping[]} update:mappings - 映射列表变更事件
 */
const emit = defineEmits<{
  'update:mappings': [mappings: KeyMapping[]]
}>()

const { t } = useI18n()
/** Canvas 元素引用 */
const canvasRef = ref<HTMLCanvasElement | null>(null)
/** 横向滚动容器引用 */
const scrollRef = ref<HTMLDivElement | null>(null)
/** 编辑器模式：edit 为固定键宽编辑，overview 为 88 键缩放预览 */
const mode = ref<'edit' | 'overview'>('edit')
/** 当前选中的 MIDI 音高 */
const selectedPitch = ref(60)
/** 当前处于键盘捕获映射状态的音高；null 表示未捕获 */
const capturingPitch = ref<number | null>(null)
/** 点击琴键发音时的短暂高亮集合 */
const activePitches = ref(new Set<number>())
/** 物理键盘按下后命中已有映射的按键集合，用于全局预览高亮 */
const pressedMappedKeys = ref(new Set<string>())
/** Canvas CSS 逻辑宽度，不含设备像素比 */
const canvasWidth = ref(0)
/** 当前绘制模式下所有琴键的 Canvas 命中区域 */
const keyRects = ref<PianoKeyRect[]>([])
/** 是否正在拖拽横向滚动 */
const isDragging = ref(false)
/** 拖拽开始时的屏幕 x 坐标 */
const dragStartX = ref(0)
/** 拖拽开始时滚动容器的 scrollLeft */
const dragStartScrollLeft = ref(0)
let resizeObserver: ResizeObserver | null = null

/** 编辑模式白键固定宽度，保证局部编辑时琴键可点选 */
const WHITE_KEY_WIDTH = 38
/** 编辑模式白键固定高度 */
const WHITE_KEY_HEIGHT = 174
/** 编辑模式黑键固定宽度 */
const BLACK_KEY_WIDTH = 24
/** 编辑模式黑键固定高度 */
const BLACK_KEY_HEIGHT = 106
/** 全局预览模式 Canvas 高度 */
const OVERVIEW_HEIGHT = 132

/** 88 键钢琴覆盖的所有 MIDI 音高 */
const allPitches = Array.from(
  { length: TEMPLATE_MAX_PITCH - TEMPLATE_MIN_PITCH + 1 },
  (_, index) => TEMPLATE_MIN_PITCH + index
)
/** 白键音高列表，用于计算横向布局宽度和黑键相对位置 */
const whitePitches = allPitches.filter((pitch) => !isBlackKey(pitch))

/** 当前选中音高对应的映射 */
const selectedMapping = computed(() =>
  props.mappings.find((mapping) => mapping.pitch === selectedPitch.value)
)
/** 当前选中音高是否处于映射捕获状态 */
const isCapturingSelected = computed(() => capturingPitch.value === selectedPitch.value)
/** 当前选中音高的音名 */
const selectedNoteName = computed(() => pitchToNoteName(selectedPitch.value))
/** 当前模板映射数量文案 */
const mappingSummary = computed(() => {
  const count = props.mappings.length
  return t('template.mappingCount', { count })
})
const supportedKeySummary = computed(() => SUPPORTED_MAPPING_KEYS.join(', '))

/**
 * @description: 获取指定音高的映射按键
 * @param {number} pitch - MIDI 音高
 * @return {string | null} 映射按键；未映射时返回 null
 */
function getMappingKey(pitch: number): string | null {
  return props.mappings.find((mapping) => mapping.pitch === pitch)?.key ?? null
}

/**
 * @description: 获取 Canvas 逻辑宽度
 * @description 编辑模式按白键固定宽度展开，预览模式按容器宽度压缩到一屏
 * @return {number} Canvas CSS 逻辑宽度
 */
function getContentWidth(): number {
  if (mode.value === 'overview') {
    // 全局预览需要填满当前容器；720 是窄窗口兜底宽度，避免键位压得不可读。
    return Math.max(scrollRef.value?.clientWidth ?? 0, 720)
  }
  // 编辑模式保持固定白键宽度，让用户能精确点击单个琴键。
  return whitePitches.length * WHITE_KEY_WIDTH
}

/**
 * @description: 获取 Canvas 逻辑高度
 * @return {number} 当前模式下的 Canvas CSS 逻辑高度
 */
function getCanvasHeight(): number {
  // 预览模式降低高度，让 88 键一屏查看；编辑模式保留足够点击面积。
  return mode.value === 'overview' ? OVERVIEW_HEIGHT : WHITE_KEY_HEIGHT
}

/**
 * @description: 根据容器和设备像素比设置 Canvas 尺寸
 * @return {void}
 */
function setCanvasSize() {
  // Canvas 尚未挂载时不能访问上下文，直接等待下一轮 resize/mount。
  const canvas = canvasRef.value
  if (!canvas) return

  // CSS 逻辑尺寸用于布局和命中计算。
  const width = getContentWidth()
  const height = getCanvasHeight()
  // 真实像素尺寸乘设备像素比，避免 Retina 屏 Canvas 模糊。
  const ratio = window.devicePixelRatio || 1
  canvasWidth.value = width
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.width = Math.floor(width * ratio)
  canvas.height = Math.floor(height * ratio)
  // 尺寸变化后必须重绘，否则 Canvas 会被浏览器清空。
  drawCanvas()
}

/**
 * @description: 获取白键在白键列表中的索引
 * @param {number} pitch - MIDI 音高
 * @return {number} 白键索引；非白键时返回 -1
 */
function getWhiteKeyIndex(pitch: number): number {
  return whitePitches.indexOf(pitch)
}

/**
 * @description: 获取某个音高前方白键数量
 * @description 黑键水平位置基于其前方白键边界计算
 * @param {number} pitch - MIDI 音高
 * @return {number} 该音高之前的白键数量
 */
function getWhiteKeyIndexBefore(pitch: number): number {
  return whitePitches.filter((whitePitch) => whitePitch < pitch).length
}

/**
 * @description: 构建当前 Canvas 模式下所有琴键矩形
 * @description 先生成白键再生成黑键，方便绘制和命中时按黑键优先处理
 * @param {number} width - Canvas 逻辑宽度
 * @param {number} height - Canvas 逻辑高度
 * @return {PianoKeyRect[]} 琴键矩形列表
 */
function buildRects(width: number, height: number): PianoKeyRect[] {
  // 当前模式下的白键宽度：编辑模式固定，预览模式按容器均分。
  const whiteWidth = width / whitePitches.length
  // 预览模式黑键随白键缩放，同时设置最小宽度保证可见。
  const blackWidth = mode.value === 'overview' ? Math.max(8, whiteWidth * 0.62) : BLACK_KEY_WIDTH
  // 黑键高度按白键高度缩放，编辑模式使用固定高度保证观感稳定。
  const blackHeight = mode.value === 'overview' ? height * 0.62 : BLACK_KEY_HEIGHT
  // rects 既用于绘制也用于鼠标命中检测，因此必须保存完整几何信息。
  const rects: PianoKeyRect[] = []

  for (const pitch of whitePitches) {
    // 白键从左到右连续排列，x 坐标由白键索引决定。
    rects.push({
      pitch,
      x: getWhiteKeyIndex(pitch) * whiteWidth,
      y: 0,
      width: whiteWidth,
      height,
      black: false,
    })
  }

  for (const pitch of allPitches.filter(isBlackKey)) {
    // 黑键位于其前方白键边界附近，因此用“前方白键数量”定位。
    const whiteIndexBefore = getWhiteKeyIndexBefore(pitch)
    rects.push({
      pitch,
      // 减去半个黑键宽度，让黑键中心对齐两个白键之间的缝。
      x: whiteIndexBefore * whiteWidth - blackWidth / 2,
      y: 0,
      width: blackWidth,
      height: blackHeight,
      black: true,
    })
  }

  return rects
}

/**
 * @description: 绘制圆角填充矩形
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
 * @param {number} x - 左上角 x 坐标
 * @param {number} y - 左上角 y 坐标
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {number} radius - 圆角半径
 * @return {void}
 */
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  // 每次绘制圆角矩形都从新路径开始，避免承接上一个 key 的路径。
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fill()
}

/**
 * @description: 重绘完整钢琴 Canvas
 * @description 每次映射、选中状态、捕获状态或模式变化时全量重绘，避免 DOM 琴键数量过多
 * @return {void}
 */
function drawCanvas() {
  // Canvas 未挂载或上下文不可用时直接跳过，避免初始化阶段报错。
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 重新设置 transform，避免多次 resize 后设备像素比被重复叠乘。
  const ratio = window.devicePixelRatio || 1
  const width = canvasWidth.value
  const height = getCanvasHeight()
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  // 全量清理上一帧内容，避免映射 badge 或高亮残留。
  ctx.clearRect(0, 0, width, height)
  // 先铺底色，保证透明背景下黑白键对比稳定。
  ctx.fillStyle = '#fff7f8'
  ctx.fillRect(0, 0, width, height)

  // 每次绘制前重算矩形，保证滚动/缩放/容器变化后命中区域同步。
  const rects = buildRects(width, height)
  keyRects.value = rects

  // 白键先绘制、黑键后绘制，保持真实钢琴的覆盖关系。
  for (const rect of rects.filter((item) => !item.black)) {
    drawKey(ctx, rect)
  }
  for (const rect of rects.filter((item) => item.black)) {
    drawKey(ctx, rect)
  }
}

/**
 * @description: 绘制单个琴键
 * @description 根据选中、捕获、点击发音和物理键盘按下状态决定高亮样式
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
 * @param {PianoKeyRect} rect - 琴键矩形信息
 * @return {void}
 */
function drawKey(ctx: CanvasRenderingContext2D, rect: PianoKeyRect) {
  // 映射按键用于绘制 badge，也用于判断物理键按下时是否需要高亮。
  const mappingKey = getMappingKey(rect.pitch)
  // selected 表示用户当前正在查看/操作的琴键。
  const selected = selectedPitch.value === rect.pitch
  // capturing 表示当前琴键正在等待用户按下物理键完成映射。
  const capturing = capturingPitch.value === rect.pitch
  // active 表示用户刚点击琴键发音，需要短暂视觉反馈。
  const active = activePitches.value.has(rect.pitch)
  // mappedPressed 表示用户按下了已映射的物理键，需要反向高亮对应琴键。
  const mappedPressed = mappingKey ? pressedMappedKeys.value.has(mappingKey) : false
  // 任意一种交互状态都应该让琴键进入高亮态。
  const isHighlighted = selected || capturing || active || mappedPressed

  // 保存上下文状态，避免字体、颜色和线宽影响后续琴键。
  ctx.save()
  if (rect.black) {
    // 黑键用深色底；交互高亮时使用品牌粉色。
    ctx.fillStyle = isHighlighted ? '#f7a5b0' : '#3d3030'
    fillRoundRect(ctx, rect.x, rect.y, rect.width, rect.height, 5)
    // 捕获状态使用更醒目的边框，帮助用户确认哪个琴键正在等待映射。
    ctx.strokeStyle = capturing ? '#f43f5e' : '#5a4646'
    ctx.lineWidth = capturing ? 3 : 1
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
    ctx.fillStyle = '#ffffff'
  } else {
    // 白键保持浅色底；交互高亮时用浅粉底色。
    ctx.fillStyle = isHighlighted ? '#ffe2e8' : '#ffffff'
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    // 捕获状态同样加强边框，和黑键保持一致语义。
    ctx.strokeStyle = capturing ? '#f43f5e' : '#f4c4cb'
    ctx.lineWidth = capturing ? 3 : 1
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
    ctx.fillStyle = '#4a3f3f'
  }

  // 黑白键音名上下错开，密集预览时不会糊成一条直线。
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${mode.value === 'overview' ? 9 : 10}px sans-serif`
  const noteLabelY = rect.black ? (mode.value === 'overview' ? 13 : 16) : mode.value === 'overview' ? 28 : 32
  ctx.fillText(pitchToNoteName(rect.pitch), rect.x + rect.width / 2, noteLabelY)

  if (mappingKey) {
    // 映射 badge 靠近琴键底部；黑键高度更短，需要单独调整 y 坐标。
    const badgeY = rect.black ? rect.height - 18 : rect.height - 24
    // badge 宽度随 F10/F12 这类较长文本扩展，但不能超过琴键宽度。
    const badgeWidth = Math.min(rect.width - 6, Math.max(18, mappingKey.length * 8 + 8))
    ctx.fillStyle = rect.black ? 'rgba(255,255,255,0.92)' : '#f7c0c1'
    fillRoundRect(ctx, rect.x + (rect.width - badgeWidth) / 2, badgeY - 9, badgeWidth, 18, 9)
    ctx.fillStyle = '#4a3f3f'
    ctx.font = '11px sans-serif'
    ctx.fillText(mappingKey, rect.x + rect.width / 2, badgeY)
  }

  if (capturing) {
    // 捕获状态底部画一条状态条，避免只靠边框在密集琴键中不明显。
    ctx.fillStyle = '#f43f5e'
    fillRoundRect(ctx, rect.x + 4, rect.height - 8, rect.width - 8, 4, 2)
  }

  // 恢复 Canvas 上下文，确保下一颗琴键从干净状态绘制。
  ctx.restore()
}

/**
 * @description: 根据指针事件获取命中的音高
 * @description 黑键覆盖在白键上方，因此命中判断必须先查黑键，再查白键
 * @param {PointerEvent} event - 指针事件
 * @return {number | null} 命中的 MIDI 音高；未命中返回 null
 */
function getPointerPitch(event: PointerEvent): number | null {
  // Canvas 尚未挂载时没有可计算的命中区域。
  const canvas = canvasRef.value
  if (!canvas) return null
  // client 坐标转换为 Canvas CSS 逻辑坐标；绘制和命中都使用同一坐标系。
  const bounds = canvas.getBoundingClientRect()
  const x = event.clientX - bounds.left
  const y = event.clientY - bounds.top
  // 黑键覆盖在白键上方，必须优先命中黑键，否则黑键区域会被白键抢走。
  const blackHit = keyRects.value
    .filter((rect) => rect.black)
    .find((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height)
  if (blackHit) return blackHit.pitch
  // 黑键未命中时再查白键。
  const whiteHit = keyRects.value
    .filter((rect) => !rect.black)
    .find((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height)
  return whiteHit?.pitch ?? null
}

/**
 * @description: 短暂高亮指定音高
 * @param {number} pitch - MIDI 音高
 * @return {void}
 */
function flashPitch(pitch: number) {
  // 使用新 Set 触发 Vue 响应式更新。
  const next = new Set(activePitches.value)
  next.add(pitch)
  activePitches.value = next
  window.setTimeout(() => {
    // 延迟清理也使用新 Set，避免原地修改导致视图不更新。
    const current = new Set(activePitches.value)
    current.delete(pitch)
    activePitches.value = current
  }, 220)
}

/**
 * @description: 播放指定音高并同步 Canvas 高亮
 * @param {number} pitch - MIDI 音高
 * @return {Promise<void>} 无返回值
 */
async function previewPitch(pitch: number) {
  // 先高亮再发音，即使音频初始化稍慢也能马上给用户反馈。
  flashPitch(pitch)
  await playNote(pitch, 88, 0.55)
}

/**
 * @description: 记录拖拽开始状态
 * @param {PointerEvent} event - 指针按下事件
 * @return {void}
 */
function handlePointerDown(event: PointerEvent) {
  // 未挂载 Canvas 时忽略指针事件。
  if (!canvasRef.value) return
  // 记录拖拽起点，用于 pointermove 中换算横向滚动距离。
  isDragging.value = true
  dragStartX.value = event.clientX
  dragStartScrollLeft.value = scrollRef.value?.scrollLeft ?? 0
  // 捕获指针，避免拖动过程中鼠标离开 Canvas 导致 pointerup 丢失。
  canvasRef.value.setPointerCapture(event.pointerId)
}

/**
 * @description: 处理编辑模式下的横向拖拽滚动
 * @param {PointerEvent} event - 指针移动事件
 * @return {void}
 */
function handlePointerMove(event: PointerEvent) {
  // 只有编辑模式需要横向拖拽；预览模式已经缩放到一屏。
  if (!isDragging.value || !scrollRef.value || mode.value === 'overview') return
  // 鼠标向右拖时内容向左回滚，因此 scrollLeft 使用反向距离。
  const distance = event.clientX - dragStartX.value
  // 小于 3px 的移动视为点击抖动，避免误触发滚动。
  if (Math.abs(distance) > 3) {
    scrollRef.value.scrollLeft = dragStartScrollLeft.value - distance
  }
}

/**
 * @description: 处理琴键点击或拖拽结束
 * @description 非拖拽点击会选中并播放琴键；切换琴键时会退出之前的映射捕获状态
 * @param {PointerEvent} event - 指针释放事件
 * @return {void}
 */
function handlePointerUp(event: PointerEvent) {
  // 释放时先尝试解析当前指针命中的琴键。
  const pitch = getPointerPitch(event)
  // scrollLeft 实际变化超过阈值时视为拖拽，不触发琴键点击。
  const wasDrag =
    mode.value === 'edit' && Math.abs((scrollRef.value?.scrollLeft ?? 0) - dragStartScrollLeft.value) > 4
  isDragging.value = false

  if (!wasDrag && pitch !== null) {
    // 切换到其他琴键时退出之前的映射等待状态，保证只能有一个琴键处于捕获状态。
    if (capturingPitch.value !== null && capturingPitch.value !== pitch) {
      capturingPitch.value = null
    }
    selectedPitch.value = pitch
    void previewPitch(pitch)
  }
}

/**
 * @description: 切换当前选中琴键的映射捕获状态
 * @return {void}
 */
function toggleCapture() {
  // 再次点击“退出映射”时取消当前捕获。
  if (capturingPitch.value === selectedPitch.value) {
    capturingPitch.value = null
    return
  }
  // 进入捕获前直接覆盖旧捕获状态，保证全局只有一个等待映射的琴键。
  capturingPitch.value = selectedPitch.value
}

/**
 * @description: 清除当前选中琴键映射
 * @return {void}
 */
function clearSelectedMapping() {
  // 清除逻辑交给统一工具函数，确保清除后仍会顺手归一化旧数据。
  emit('update:mappings', setMappingForPitch(props.mappings, selectedPitch.value, null))
}

/**
 * @description: 判断键盘事件目标是否为可编辑元素
 * @description 非捕获状态下忽略输入框内的按键，避免用户编辑模板名称时触发钢琴预览
 * @param {EventTarget | null} target - 事件目标
 * @return {boolean} true 表示目标是可编辑元素
 */
function isEditableEventTarget(target: EventTarget | null): boolean {
  // 非 HTMLElement 没有 input/contentEditable 语义，直接视为不可编辑目标。
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

/**
 * @description: 处理全局键盘按下
 * @description 捕获状态下写入映射；非捕获状态下仅用于已有映射的预览高亮和发音
 * @param {KeyboardEvent} event - 键盘按下事件
 * @return {void}
 */
function handleKeyDown(event: KeyboardEvent) {
  // 非捕获状态下，用户在输入框里打字不应触发钢琴发音或映射预览。
  if (capturingPitch.value === null && isEditableEventTarget(event.target)) return

  // 先归一化按键，后续捕获和预览共用同一个键名。
  const normalized = normalizeMappingKeyFromEvent(event)
  // 非捕获状态下，如果物理键已有映射，就找到对应琴键用于预览高亮。
  const pressedMappedPitch = normalized
    ? props.mappings.find((mapping) => mapping.key === normalized)?.pitch
    : undefined

  if (capturingPitch.value !== null) {
    // 捕获期间阻止按键继续冒泡，避免触发页面快捷键或输入到其他控件。
    event.preventDefault()
    event.stopPropagation()

    // Escape 只取消当前捕获，不改动现有映射。
    if (event.key === 'Escape') {
      capturingPitch.value = null
      return
    }

    // Backspace/Delete 在捕获状态下作为清除当前琴键映射的快捷键。
    if (event.key === 'Backspace' || event.key === 'Delete') {
      emit('update:mappings', setMappingForPitch(props.mappings, capturingPitch.value, null))
      capturingPitch.value = null
      return
    }

    if (!normalized || isExcludedCaptureKey(event)) {
      // 无法归一化或明确排除的键不进入模板，防止保存后运行时无法模拟。
      toast.warning(t('template.unsupportedKey'), { description: event.key, richColors: true })
      return
    }

    // 捕获成功后立即退出捕获状态，确保同一时间只有一个琴键等待映射。
    emit('update:mappings', setMappingForPitch(props.mappings, capturingPitch.value, normalized))
    selectedPitch.value = capturingPitch.value
    capturingPitch.value = null
    return
  }

  if (normalized && pressedMappedPitch !== undefined) {
    // 使用新 Set 触发 Vue 响应式更新，驱动 Canvas 反向高亮。
    const next = new Set(pressedMappedKeys.value)
    next.add(normalized)
    pressedMappedKeys.value = next
    selectedPitch.value = pressedMappedPitch
    void previewPitch(pressedMappedPitch)
  }
}

/**
 * @description: 处理全局键盘释放
 * @param {KeyboardEvent} event - 键盘释放事件
 * @return {void}
 */
function handleKeyUp(event: KeyboardEvent) {
  // 释放时同样归一化，和 keydown 中保存到 Set 的键名保持一致。
  const normalized = normalizeMappingKeyFromEvent(event)
  if (!normalized) return
  // 使用新 Set 移除按键，触发 Canvas 去除高亮。
  const next = new Set(pressedMappedKeys.value)
  next.delete(normalized)
  pressedMappedKeys.value = next
}

/**
 * @description: 切换编辑模式和全局预览模式
 * @description 切换模式时退出映射捕获状态，并在下一帧重新计算 Canvas 尺寸
 * @return {void}
 */
function toggleMode() {
  // edit/overview 互斥切换，保持操作语义明确。
  mode.value = mode.value === 'edit' ? 'overview' : 'edit'
  // 模式切换会改变键位尺寸，等待映射状态需要取消，避免目标区域变化后误映射。
  capturingPitch.value = null
  // DOM 尺寸在下一帧才稳定，因此延后重算 Canvas。
  void nextTick(() => {
    setCanvasSize()
    scrollPitchIntoView(selectedPitch.value)
  })
}

function scrollPitchIntoView(pitch: number) {
  if (!scrollRef.value || mode.value !== 'edit') return
  const whiteIndex = getWhiteKeyIndex(isBlackKey(pitch) ? pitch - 1 : pitch)
  if (whiteIndex < 0) return
  const targetLeft = whiteIndex * WHITE_KEY_WIDTH - scrollRef.value.clientWidth / 2 + WHITE_KEY_WIDTH
  scrollRef.value.scrollLeft = Math.max(0, targetLeft)
}

// Canvas 的可视状态完全由映射、选中音高、捕获音高、临时高亮和模式共同决定。
watch(
  () => [props.mappings, selectedPitch.value, capturingPitch.value, activePitches.value, pressedMappedKeys.value, mode.value],
  () => drawCanvas(),
  { deep: true }
)

onMounted(() => {
  resizeObserver = new ResizeObserver(() => setCanvasSize())
  if (scrollRef.value) {
    resizeObserver.observe(scrollRef.value)
  }
  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('keyup', handleKeyUp, true)
  void nextTick(() => {
    setCanvasSize()
    scrollPitchIntoView(60)
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('keyup', handleKeyUp, true)
})
</script>

<template>
  <div class="visual-template-editor">
    <div class="editor-status-row">
      <div class="editor-status-main">
        <span class="selected-note">{{ selectedNoteName }}</span>
        <span class="selected-mapping">
          {{ selectedMapping?.key || t('template.unmapped') }}
        </span>
        <Popover placement="bottom">
          <template #content>
            <div class="key-help-content">
              <p class="font-medium text-foreground">
                {{ t('template.supportedKeys') }}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ supportedKeySummary }}
              </p>
              <p class="mt-3 font-medium text-foreground">
                {{ t('template.unsupportedKeys') }}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t('template.unsupportedKeysDescription') }}
              </p>
            </div>
          </template>
          <Button type="text" class="key-help-btn nikki-outline-btn">
            <template #icon>
              <HelpCircle class="key-help-icon" />
            </template>
          </Button>
        </Popover>
        <span class="mapping-summary">{{ mappingSummary }}</span>
      </div>
      <div class="editor-status-badges">
        <span
          v-if="isCapturingSelected"
          class="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600"
        >
          {{ t('template.mappingActive') }}
        </span>
      </div>
    </div>

    <div
      ref="scrollRef"
      class="min-h-0 overflow-x-auto rounded-lg border border-primary bg-white"
      :class="mode === 'overview' ? 'overflow-hidden' : ''"
    >
      <canvas
        ref="canvasRef"
        class="block cursor-pointer select-none"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="isDragging = false"
      />
    </div>

    <div class="editor-actions">
      <Button size="small" class="nikki-outline-btn" @click="toggleMode">
        {{ mode === 'edit' ? t('template.overviewMode') : t('template.exitOverview') }}
      </Button>
      <Button
        size="small"
        class="nikki-outline-btn"
        :disabled="!selectedMapping"
        @click="clearSelectedMapping"
      >
        {{ t('template.clearMapping') }}
      </Button>
      <Button type="primary" size="small" class="nikki-primary-btn" @click="toggleCapture">
        {{ isCapturingSelected ? t('template.exitMapping') : t('template.mapSelected') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.visual-template-editor {
  @apply flex min-h-0 flex-col gap-3 rounded-xl border border-primary/20 bg-white/70 p-3;
}

.editor-status-row {
  @apply flex items-center justify-center;
}

.editor-status-main {
  @apply flex flex-wrap items-center justify-center gap-3 text-center;
}

.selected-note {
  @apply text-2xl font-semibold text-foreground;
}

.selected-mapping {
  @apply rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-muted-foreground;
}

.mapping-summary {
  @apply text-sm font-medium text-muted-foreground;
}

.editor-status-badges {
  @apply flex items-center justify-center;
}

.key-help-btn {
  width: 28px;
  height: 28px;
  border-radius: 999px;
}

.key-help-icon {
  width: 18px;
  height: 18px;
  stroke-width: 2.3;
}

.key-help-content {
  max-width: 420px;
  line-height: 1.55;
}

.editor-actions {
  @apply flex flex-wrap items-center justify-center gap-2;
}

canvas {
  touch-action: none;
}
</style>
