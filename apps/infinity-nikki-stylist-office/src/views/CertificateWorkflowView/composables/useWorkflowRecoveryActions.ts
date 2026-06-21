/**
 * @fileOverview 办理流程恢复操作
 * @description 为没有当前办理的步骤提供重新登记和登记历史入口。
 */
import { useRouter } from 'vue-router'
import { replaceActiveDraft } from '@/db/repositories/draftRepository'
import { createDefaultDraft } from '@/domain/draft/factory'
import { useDraftSessionStore } from '@/stores/draftSession'
import { useUiStore } from '@/stores/ui'

/**
 * @description: 获取流程恢复操作
 * @return {{ restartRegistration: () => Promise<void>; openRegistrationHistory: () => Promise<void> }} 操作集合
 */
export function useWorkflowRecoveryActions(): {
  restartRegistration: () => Promise<void>
  openRegistrationHistory: () => Promise<void>
} {
  const router = useRouter()
  const uiStore = useUiStore()
  const draftSession = useDraftSessionStore()

  /**
   * @description: 重新登记
   * @description 创建新的唯一办理草稿，直接进入身份登记页。
   * @return {Promise<void>} 无返回值
   */
  async function restartRegistration(): Promise<void> {
    const draft = createDefaultDraft(uiStore.uiLocale)
    await replaceActiveDraft(draft)
    draftSession.setLastKnownStage('registration')
    await router.push({ name: 'registration' })
  }

  /**
   * @description: 打开登记历史
   * @return {Promise<void>} 无返回值
   */
  async function openRegistrationHistory(): Promise<void> {
    await router.push({
      name: 'profile',
      query: {
        tab: 'certificates',
      },
    })
  }

  return {
    restartRegistration,
    openRegistrationHistory,
  }
}
