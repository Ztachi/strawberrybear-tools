import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'

interface ResizeSession {
  pointerId: number
  startY: number
  height: number
  containerHeight: number
}

interface PianoEditorResize {
  heightPercent: Ref<number>
  handleRef: Ref<HTMLElement | null>
  containerRef: Ref<HTMLElement | null>
  begin: (event: PointerEvent) => void
  move: (event: PointerEvent) => void
  end: () => void
  onKeydown: (event: KeyboardEvent) => void
}

/**
 * @description: 管理单轨浮层的顶部高度手柄。只持有用户尺寸选择，实际窗口限制交给 CSS。
 * @param {() => void} close Escape 的关闭动作，不处理主卷轴的事件或滚动
 * @param {number} initialPercent 初始高度百分比（编辑模式给详情面板更多空间）
 * @return {PianoEditorResize} 模板引用、尺寸状态与指针/键盘动作
 */
export function usePianoEditorResize(close: () => void, initialPercent = 55): PianoEditorResize {
  const heightPercent = ref(initialPercent)
  const handleRef = ref<HTMLElement | null>(null)
  const containerRef = ref<HTMLElement | null>(null)
  let session: ResizeSession | null = null

  function begin(event: PointerEvent): void {
    if (event.button !== 0 || session) return
    const containerHeight = containerRef.value?.clientHeight ?? 0
    if (containerHeight <= 0) return
    session = {
      pointerId: event.pointerId,
      startY: event.clientY,
      height: heightPercent.value,
      containerHeight,
    }
    handleRef.value?.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function move(event: PointerEvent): void {
    if (!session || session.pointerId !== event.pointerId) return
    heightPercent.value = Math.max(
      25,
      Math.min(
        82,
        session.height + ((session.startY - event.clientY) / session.containerHeight) * 100
      )
    )
  }

  function end(): void {
    const previous = session
    session = null
    if (previous && handleRef.value?.hasPointerCapture(previous.pointerId)) {
      handleRef.value.releasePointerCapture(previous.pointerId)
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 5
    if (event.key === 'ArrowUp') heightPercent.value = Math.min(82, heightPercent.value + step)
    else if (event.key === 'ArrowDown')
      heightPercent.value = Math.max(25, heightPercent.value - step)
    else if (event.key === 'Home') heightPercent.value = 25
    else if (event.key === 'End') heightPercent.value = 82
    else if (event.key === 'Escape') close()
    else return
    event.preventDefault()
  }

  onMounted(() => window.addEventListener('blur', end))
  onBeforeUnmount(() => {
    end()
    window.removeEventListener('blur', end)
  })
  return { heightPercent, handleRef, containerRef, begin, move, end, onKeydown }
}
