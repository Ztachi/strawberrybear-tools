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
  },
  persist: {
    key: 'stylist-office-draft-session',
    pick: ['lastKnownStage'],
  },
})
