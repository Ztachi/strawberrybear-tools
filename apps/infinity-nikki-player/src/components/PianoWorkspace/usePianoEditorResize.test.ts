import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer } from 'vue'
import type { App } from 'vue'
import { usePianoEditorResize } from './usePianoEditorResize'

interface HostNode {
  children: HostNode[]
}
const node = (): HostNode => ({ children: [] })
const renderer = createRenderer<HostNode, HostNode>({
  createElement: node,
  createText: node,
  createComment: node,
  insert: (child, parent) => {
    parent.children.push(child)
  },
  remove: () => {},
  patchProp: () => {},
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null,
})

let app: App<HostNode>
let controller: ReturnType<typeof usePianoEditorResize>
let windowEvents: EventTarget
let captured: Set<number>
const close = vi.fn()

function pointer(pointerId: number, clientY: number): PointerEvent {
  return { pointerId, clientY, button: 0, preventDefault: vi.fn() } as unknown as PointerEvent
}

function key(keyName: string, shiftKey = false): KeyboardEvent {
  return { key: keyName, shiftKey, preventDefault: vi.fn() } as unknown as KeyboardEvent
}

beforeEach(() => {
  close.mockClear()
  windowEvents = new EventTarget()
  captured = new Set()
  vi.stubGlobal('window', windowEvents)
  app = renderer.createApp({
    setup() {
      controller = usePianoEditorResize(close)
      return () => null
    },
  })
  app.mount(node())
  controller.containerRef.value = { clientHeight: 500 } as HTMLElement
  controller.handleRef.value = {
    setPointerCapture: (id: number) => {
      captured.add(id)
    },
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => {
      captured.delete(id)
    },
  } as unknown as HTMLElement
})
afterEach(() => {
  app.unmount()
  vi.unstubAllGlobals()
})

describe('piano editor height handle', () => {
  it('resizes upward, ignores other pointers and releases capture on cancellation', () => {
    controller.begin(pointer(1, 200))
    expect(captured.has(1)).toBe(true)
    controller.move(pointer(2, 100))
    expect(controller.heightPercent.value).toBe(55)
    controller.move(pointer(1, 100))
    expect(controller.heightPercent.value).toBe(75)
    controller.move(pointer(1, -1000))
    expect(controller.heightPercent.value).toBe(82)
    controller.end()
    expect(captured.size).toBe(0)
    controller.move(pointer(1, 400))
    expect(controller.heightPercent.value).toBe(82)
  })

  it('supports keyboard increments, bounds and close without trapping unrelated keys', () => {
    controller.onKeydown(key('ArrowUp', true))
    expect(controller.heightPercent.value).toBe(65)
    controller.onKeydown(key('Home'))
    controller.onKeydown(key('ArrowDown'))
    expect(controller.heightPercent.value).toBe(25)
    controller.onKeydown(key('End'))
    expect(controller.heightPercent.value).toBe(82)
    controller.onKeydown(key('Escape'))
    expect(close).toHaveBeenCalledOnce()
    const unrelated = key('Tab')
    controller.onKeydown(unrelated)
    expect(unrelated.preventDefault).not.toHaveBeenCalled()
  })

  it('releases a captured pointer when the window loses focus', () => {
    controller.begin(pointer(1, 200))
    windowEvents.dispatchEvent(new Event('blur'))
    expect(captured.size).toBe(0)
    controller.move(pointer(1, 100))
    expect(controller.heightPercent.value).toBe(55)
  })
})
