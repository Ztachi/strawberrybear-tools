/**
 * @fileOverview 返回顶部控制 hook
 * @description 页面用它登记自己的滚动容器、展示阈值，并响应全局 FAB 的返回顶部请求。
 * @author strawberrybear
 * @date 2026-06-19
 */
import { computed, onBeforeUnmount, onMounted, ref, unref, watch, type Ref } from 'vue'
import { useScrollTopStore } from '@/stores/scrollTop'

type ScrollTopBehavior = 'auto' | 'instant' | 'smooth'

export interface ScrollTopControlOptions {
  /** 滚动容器；不传时使用 window。 */
  target?: Ref<HTMLElement | null>
  /** 滚动超过多少像素展示返回顶部按钮。 */
  threshold?: number | Ref<number>
  /** 返回顶部滚动行为。 */
  behavior?: ScrollTopBehavior
  /** 调试和页面覆盖用的稳定作用域 ID。 */
  scopeId?: string
}

let scrollTopScopeSeed = 0

/**
 * @description: 注册页面返回顶部控制
 * @description hook 内部只管理当前页面的滚动监听，显示状态通过 Pinia 通知全局 FAB。
 * @param {ScrollTopControlOptions} [options] - 控制选项
 * @return {{ scopeId: string; updateBackTopVisible: () => void }} 控制句柄
 */
export function useScrollTopControl(options: ScrollTopControlOptions = {}): {
  scopeId: string
  updateBackTopVisible: () => void
} {
  const store = useScrollTopStore()
  const scopeId = options.scopeId ?? `scroll-top-scope-${++scrollTopScopeSeed}`
  const target = computed(() => options.target?.value ?? window)
  const cleanup = ref<(() => void) | null>(null)

  /**
   * @description: 判断滚动目标是否是 window
   * @param {Window | HTMLElement} currentTarget - 当前滚动目标
   * @return {boolean} 是否是 window
   */
  function isWindowTarget(currentTarget: Window | HTMLElement): currentTarget is Window {
    return currentTarget === window
  }

  /**
   * @description: 读取当前滚动距离
   * @return {number} 滚动顶部距离
   */
  function getScrollTop(): number {
    const currentTarget = target.value

    if (isWindowTarget(currentTarget)) {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
    }

    return currentTarget.scrollTop
  }

  /**
   * @description: 滚动当前容器到顶部
   * @return {void} 无返回值
   */
  function scrollToTop(): void {
    const currentTarget = target.value
    const behavior = options.behavior ?? 'smooth'

    if (isWindowTarget(currentTarget)) {
      window.scrollTo({ top: 0, behavior })
      return
    }

    currentTarget.scrollTo({ top: 0, behavior })
  }

  /**
   * @description: 根据阈值刷新 FAB 可见性
   * @return {void} 无返回值
   */
  function updateBackTopVisible(): void {
    store.setBackTopVisible(scopeId, getScrollTop() > (unref(options.threshold) ?? 240))
  }

  /**
   * @description: 绑定当前滚动容器监听
   * @return {void} 无返回值
   */
  function bindScrollTarget(): void {
    cleanup.value?.()

    const currentTarget = target.value
    const listenerTarget: Window | HTMLElement = currentTarget
    listenerTarget.addEventListener('scroll', updateBackTopVisible, { passive: true })
    cleanup.value = () => listenerTarget.removeEventListener('scroll', updateBackTopVisible)
    updateBackTopVisible()
  }

  onMounted(() => {
    store.registerScope(scopeId)
    bindScrollTarget()
  })

  onBeforeUnmount(() => {
    cleanup.value?.()
    cleanup.value = null
    store.unregisterScope(scopeId)
  })

  watch(
    () => options.target?.value,
    () => {
      if (store.activeScopeId === scopeId) {
        bindScrollTarget()
      }
    }
  )

  watch(
    () => unref(options.threshold),
    () => updateBackTopVisible()
  )

  watch(
    () => store.scrollTopRequestId,
    () => {
      if (store.activeScopeId === scopeId) {
        scrollToTop()
      }
    }
  )

  return {
    scopeId,
    updateBackTopVisible,
  }
}
