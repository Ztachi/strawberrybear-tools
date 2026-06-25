/**
 * @fileOverview 草稿工厂测试
 * @description 验证默认草稿字段和历史草稿兼容补全。
 * @author strawberrybear
 * @date 2026-06-25
 */
import { describe, expect, it } from 'vitest'
import { createDefaultDraft, normalizeDraft } from './factory'
import type { CertificateDraft } from './types'

describe('draft factory', () => {
  it('creates default draft with image signature selected', () => {
    const draft = createDefaultDraft('zh-CN')

    expect(draft.presidentSignature).toBe('')
    expect(draft.signatureMode).toBe('image')
    expect(draft.signatureImageId).toBe('signature-classic-001')
  })

  it('normalizes legacy drafts without president signature to image signature', () => {
    const legacyDraft = {
      ...createDefaultDraft('zh-CN'),
      id: 'legacy-draft',
      presidentSignature: undefined,
      signatureMode: undefined,
      signatureImageId: undefined,
    } as unknown as CertificateDraft

    const normalized = normalizeDraft(legacyDraft, 'zh-CN')

    expect(normalized.presidentSignature).toBe('')
    expect(normalized.signatureMode).toBe('image')
    expect(normalized.signatureImageId).toBe('signature-classic-001')
  })

  it('normalizes legacy drafts with president signature to text signature', () => {
    const legacyDraft = {
      ...createDefaultDraft('zh-CN'),
      id: 'legacy-text-signature-draft',
      presidentSignature: '茶叶蛋',
      signatureMode: undefined,
      signatureImageId: undefined,
    } as unknown as CertificateDraft

    const normalized = normalizeDraft(legacyDraft, 'zh-CN')

    expect(normalized.presidentSignature).toBe('茶叶蛋')
    expect(normalized.signatureMode).toBe('text')
    expect(normalized.signatureImageId).toBe('signature-classic-001')
  })
})
