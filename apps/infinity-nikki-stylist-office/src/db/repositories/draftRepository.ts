/**
 * @fileOverview 草稿仓储
 * @description 封装唯一办理草稿的 IndexedDB 读写入口，避免页面直接操作 Dexie 表。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { stylistOfficeDb } from '@/db/database'
import { DEFAULT_UI_LOCALE } from '@/i18n'
import { normalizeDraft } from '@/domain/draft/factory'
import type { CertificateDraft } from '@/domain/draft/types'

/** 页面局部保存时允许修改的草稿字段。 */
export type ActiveDraftPatch = Partial<Omit<CertificateDraft, 'id' | 'createdAt'>>

/**
 * @description: 获取当前唯一办理草稿
 * @description MVP 同一时间只允许一份草稿，因此始终返回更新时间最新的一条。
 * @return {Promise<CertificateDraft | undefined>} 当前草稿，不存在时返回 undefined
 */
export async function getActiveDraft(): Promise<CertificateDraft | undefined> {
  const drafts = await stylistOfficeDb.activeDraft.orderBy('updatedAt').reverse().toArray()
  const activeDraft = drafts[0]

  // 兼容开发阶段旧结构草稿，避免新增字段后页面刷新出现空值。
  return activeDraft ? normalizeDraft(activeDraft, DEFAULT_UI_LOCALE) : undefined
}

/**
 * @description: 保存唯一办理草稿
 * @description 写入前清空旧草稿，保证多页面误操作也不会留下第二份办理档案。
 * @param {CertificateDraft} draft - 待保存的草稿
 * @return {Promise<void>} 无返回值
 */
export async function replaceActiveDraft(draft: CertificateDraft): Promise<void> {
  await stylistOfficeDb.transaction('rw', stylistOfficeDb.activeDraft, async () => {
    // 先清空再写入，可以从数据层保证“同一设备只有一份正在办理”。
    await stylistOfficeDb.activeDraft.clear()
    await stylistOfficeDb.activeDraft.put(draft)
  })
}

/**
 * @description: 局部更新当前办理草稿
 * @description 每次用户确认性操作后直接写入 Dexie，并返回最新草稿给页面同步。
 * @param {ActiveDraftPatch} patch - 要覆盖的草稿字段
 * @return {Promise<CertificateDraft | undefined>} 更新后的草稿，不存在草稿时返回 undefined
 */
export async function updateActiveDraft(
  patch: ActiveDraftPatch
): Promise<CertificateDraft | undefined> {
  const activeDraft = await getActiveDraft()

  if (!activeDraft) {
    return undefined
  }

  const updatedDraft: CertificateDraft = {
    ...activeDraft,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  await replaceActiveDraft(updatedDraft)
  return updatedDraft
}

/**
 * @description: 删除当前办理草稿
 * @description 取消办理或正式签发成功后调用，正式证书和自定义素材不受影响。
 * @return {Promise<void>} 无返回值
 */
export async function clearActiveDraft(): Promise<void> {
  await stylistOfficeDb.activeDraft.clear()
}
