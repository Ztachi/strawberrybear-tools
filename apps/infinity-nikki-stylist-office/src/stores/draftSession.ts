/**
 * @fileOverview 草稿会话状态
 * @description 仅保存轻量页面会话线索，完整草稿字段和素材必须写入 Dexie。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { defineStore } from 'pinia'
import type { DraftStage } from '@/domain/draft/types'

export const useDraftSessionStore = defineStore('draftSession', {
  state: () => ({
    /** 最近一次已知草稿阶段，只用于首页按钮文案和跳转提示。 */
    lastKnownStage: null as DraftStage | null,
    /** 本次页面会话内的流程重置版本，用于通知流程壳重置可达步骤和重挂载子页。 */
    resetVersion: 0,
  }),
  actions: {
    /**
     * @description: 记录最近草稿阶段
     * @param {DraftStage} stage - 草稿阶段
     * @return {void} 无返回值
     */
    setLastKnownStage(stage: DraftStage): void {
      this.lastKnownStage = stage
    },
    /**
     * @description: 清除草稿会话线索
     * @return {void} 无返回值
     */
    clearSession(): void {
      this.lastKnownStage = null
    },
    /**
     * @description: 标记办理流程已重新开始
     * @description 不持久化版本号，只用于当前页面会话内刷新流程壳状态。
     * @return {void} 无返回值
     */
    markWorkflowReset(): void {
      this.resetVersion += 1
    },
  },
  persist: {
    key: 'stylist-office-draft-session',
    pick: ['lastKnownStage'],
  },
})
