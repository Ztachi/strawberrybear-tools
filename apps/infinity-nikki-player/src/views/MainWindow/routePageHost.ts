import { defineComponent, h, ref, type Component, type PropType } from 'vue'

/** 页面向宿主公开的离开确认；普通浏览页面可以不提供。 */
export interface RoutePageLeaveGuard {
  confirmLeaveIfNeeded?: () => Promise<boolean>
}

/**
 * 创建具名页面宿主，保留 KeepAlive 缓存身份并转发真实页面的编辑确认。
 * @param name 用于缓存白名单匹配的稳定组件名
 * @returns 拥有单根节点与离开确认接口的宿主
 */
export function createRoutePageHost(name: string) {
  return defineComponent({
    name,
    props: {
      page: { type: [Object, Function] as PropType<Component>, required: true },
      editor: Boolean,
    },
    setup(props, { expose }) {
      const page = ref<RoutePageLeaveGuard | null>(null)
      expose({
        // ref 属于宿主而非页面，必须显式转发，不能让缓存包装层吞掉编辑确认。
        confirmLeaveIfNeeded: () => page.value?.confirmLeaveIfNeeded?.() ?? Promise.resolve(true),
      })
      return () =>
        h('section', { class: ['route-page-host', { 'route-page-host--editor': props.editor }] }, [
          h(props.page, { ref: page }),
        ])
    },
  })
}
