/* eslint-disable vue/one-component-per-file -- 多个页面替身仅用于同一宿主的组件集成测试。 */
import { describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, shallowRef } from 'vue'
import { createRoutePageHost, type RoutePageLeaveGuard } from './routePageHost'

interface HostNode {
  parent: HostNode | null
  children: HostNode[]
}
const node = (): HostNode => ({ parent: null, children: [] })
const renderer = createRenderer<HostNode, HostNode>({
  createElement: node,
  createText: node,
  createComment: node,
  insert(child, parent) {
    child.parent = parent
    parent.children.push(child)
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
  },
  patchProp() {},
  setText() {},
  setElementText() {},
  parentNode: (child) => child.parent,
  nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
})

describe('缓存路由宿主的安装保护', () => {
  it('从 RouterView 的 VNode 转发真实页面确认，页面替换后不引用旧编辑器', async () => {
    const confirm = vi.fn(async () => false)
    const editor = defineComponent({
      setup(_, { expose }) {
        expose({ confirmLeaveIfNeeded: confirm })
        return () => h('div')
      },
    })
    const browser = defineComponent({ setup: () => () => h('div') })
    const page = shallowRef(editor)
    const host = shallowRef<RoutePageLeaveGuard | null>(null)
    const Host = createRoutePageHost('CachedRoutePageHost')
    const app = renderer.createApp({
      setup: () => () => h(Host, { page: h(page.value), ref: host }),
    })
    app.mount(node())
    try {
      expect(await host.value?.confirmLeaveIfNeeded?.()).toBe(false)
      expect(confirm).toHaveBeenCalledOnce()
      page.value = browser
      await nextTick()
      expect(await host.value?.confirmLeaveIfNeeded?.()).toBe(true)
      expect(confirm).toHaveBeenCalledOnce()
    } finally {
      app.unmount()
    }
  })

  it('保存异常传递给更新器，不允许包装层静默放行', async () => {
    const Page = defineComponent({
      setup(_, { expose }) {
        expose({
          confirmLeaveIfNeeded: async () => {
            throw new Error('保存失败')
          },
        })
        return () => h('div')
      },
    })
    const app = renderer.createApp(createRoutePageHost('DefaultRoutePageHost'), { page: h(Page) })
    const host = app.mount(node()) as RoutePageLeaveGuard
    try {
      await expect(host.confirmLeaveIfNeeded?.()).rejects.toThrow('保存失败')
    } finally {
      app.unmount()
    }
  })
})
