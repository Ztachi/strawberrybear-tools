/**
 * @fileOverview 返回顶部运行态
 * @description 记录当前页面滚动控制范围和全局 FAB 可见性，DOM 监听由 composable 管理。
 * @author strawberrybear
 * @date 2026-06-19
 */
import { defineStore } from 'pinia'

export const useScrollTopStore = defineStore('scrollTop', {
  state: () => ({
    /** 已注册的滚动控制范围，后注册者优先成为当前活动范围。 */
    scopeStack: [] as string[],
    /** 当前活动范围是否需要展示返回顶部 FAB。 */
    isBackTopVisible: false,
    /** 返回顶部请求序号，hook 监听它来触发自己的滚动容器回到顶部。 */
    scrollTopRequestId: 0,
  }),
  getters: {
    /** 当前活动滚动控制范围。 */
    activeScopeId: (state): string | null => state.scopeStack.at(-1) ?? null,
  },
  actions: {
    /**
     * @description: 注册滚动控制范围
     * @param {string} scopeId - 控制范围 ID
     * @return {void} 无返回值
     */
    registerScope(scopeId: string): void {
      this.scopeStack = [...this.scopeStack.filter((id) => id !== scopeId), scopeId]
      this.isBackTopVisible = false
    },
    /**
     * @description: 注销滚动控制范围
     * @param {string} scopeId - 控制范围 ID
     * @return {void} 无返回值
     */
    unregisterScope(scopeId: string): void {
      this.scopeStack = this.scopeStack.filter((id) => id !== scopeId)
      this.isBackTopVisible = false
    },
    /**
     * @description: 更新返回顶部按钮可见性
     * @param {string} scopeId - 发起更新的控制范围 ID
     * @param {boolean} visible - 是否展示按钮
     * @return {void} 无返回值
     */
    setBackTopVisible(scopeId: string, visible: boolean): void {
      if (this.activeScopeId !== scopeId) {
        return
      }

      this.isBackTopVisible = visible
    },
    /**
     * @description: 发起返回顶部请求
     * @return {void} 无返回值
     */
    requestScrollTop(): void {
      this.scrollTopRequestId += 1
    },
  },
})
