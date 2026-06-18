/**
 * @fileOverview 草稿仓储
 * @description 封装唯一办理草稿的 IndexedDB 读写入口，避免页面直接操作 Dexie 表。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { stylistOfficeDb } from '@/db/database'
import type { CertificateDraft } from '@/domain/draft/types'

/**
 * @description: 获取当前唯一办理草稿
 * @description MVP 同一时间只允许一份草稿，因此始终返回更新时间最新的一条。
 * @return {Promise<CertificateDraft | undefined>} 当前草稿，不存在时返回 undefined
 */
export async function getActiveDraft(): Promise<CertificateDraft | undefined> {
  const drafts = await stylistOfficeDb.activeDraft.orderBy('updatedAt').reverse().toArray()
  return drafts[0]
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
 * @description: 删除当前办理草稿
 * @description 取消办理或正式签发成功后调用，正式证书和自定义素材不受影响。
 * @return {Promise<void>} 无返回值
 */
export async function clearActiveDraft(): Promise<void> {
  await stylistOfficeDb.activeDraft.clear()
}
