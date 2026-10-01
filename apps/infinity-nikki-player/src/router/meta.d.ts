import 'vue-router'

declare module 'vue-router' {
  /** 主窗口路由的标准缓存与独立编辑会话声明。 */
  interface RouteMeta {
    /** 页面离开后是否由 Vue KeepAlive 保留实例。 */
    keepAlive?: boolean
    /** 页面是否需要在编辑器独立窗口存在期间临时保活。 */
    detachableEditor?: boolean
  }
}
