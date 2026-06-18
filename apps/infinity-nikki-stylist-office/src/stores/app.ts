/**
 * @fileOverview 应用运行状态
 * @description 保存当前路由名称等轻量运行态，便于顶部栏和页面壳做响应式展示。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    /** 当前路由名称，刷新后不需要恢复，因此不持久化。 */
    currentRouteName: 'home',
  }),
  actions: {
    /**
     * @description: 记录当前路由名称
     * @param {string} routeName - Vue Router 路由名
     * @return {void} 无返回值
     */
    setCurrentRouteName(routeName: string): void {
      this.currentRouteName = routeName
    },
  },
})
