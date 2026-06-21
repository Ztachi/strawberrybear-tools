/**
 * @fileOverview 临时导航意图
 * @description 保存跨页面跳转后只消费一次的弹层动作，避免用 URL query 反复触发弹窗。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { defineStore } from 'pinia'
import type { CustomAssetKind } from '@/domain/assets/types'

/** 办理流程页面名。 */
export type WorkflowRouteName = 'registration' | 'proofing'

export const useNavigationIntentStore = defineStore('navigationIntent', {
  state: () => ({
    /** 到个人中心后自动打开的登记详情 ID。 */
    profileIssuedDetailId: null as string | null,
    /** 从自定义资料返回后需要重新打开头像选择层的流程页。 */
    reopenAvatarPickerFor: null as WorkflowRouteName | null,
    /** 自定义资料页保存后返回的流程页。 */
    customAssetReturnTo: null as WorkflowRouteName | null,
    /** 自定义资料页打开时的素材类型。 */
    customAssetKind: null as CustomAssetKind | null,
    /** 自定义头像裁剪时参考的模板 ID。 */
    customAssetTemplateId: null as string | null,
  }),
  actions: {
    /**
     * @description: 请求个人中心打开登记详情
     * @param {string} certificateId - 已签发证书 ID
     * @return {void} 无返回值
     */
    requestProfileIssuedDetail(certificateId: string): void {
      this.profileIssuedDetailId = certificateId
    },
    /**
     * @description: 消费登记详情打开请求
     * @return {string | null} 证书 ID
     */
    consumeProfileIssuedDetail(): string | null {
      const certificateId = this.profileIssuedDetailId
      this.profileIssuedDetailId = null

      return certificateId
    },
    /**
     * @description: 请求打开自定义素材页
     * @param {WorkflowRouteName} returnTo - 保存后返回流程页
     * @param {CustomAssetKind} kind - 素材类型
     * @param {string} [templateId] - 当前模板 ID
     * @return {void} 无返回值
     */
    requestCustomAssetFlow(
      returnTo: WorkflowRouteName,
      kind: CustomAssetKind,
      templateId?: string
    ): void {
      this.customAssetReturnTo = returnTo
      this.customAssetKind = kind
      this.customAssetTemplateId = templateId ?? null
    },
    /**
     * @description: 清除自定义素材来源
     * @return {void} 无返回值
     */
    clearCustomAssetFlow(): void {
      this.customAssetReturnTo = null
      this.customAssetKind = null
      this.customAssetTemplateId = null
    },
    /**
     * @description: 请求流程页重新打开头像选择层
     * @param {WorkflowRouteName} routeName - 目标流程页
     * @return {void} 无返回值
     */
    requestAvatarPicker(routeName: WorkflowRouteName): void {
      this.reopenAvatarPickerFor = routeName
    },
    /**
     * @description: 消费头像选择层打开请求
     * @param {WorkflowRouteName} routeName - 当前流程页
     * @return {boolean} 是否需要打开
     */
    consumeAvatarPicker(routeName: WorkflowRouteName): boolean {
      if (this.reopenAvatarPickerFor !== routeName) {
        return false
      }

      this.reopenAvatarPickerFor = null
      return true
    },
  },
})
