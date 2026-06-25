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
  it('creates default draft with empty president signature', () => {
    const draft = createDefaultDraft('zh-CN')

    expect(draft.presidentSignature).toBe('')
  })

  it('normalizes legacy drafts without president signature', () => {
    const legacyDraft = {
      ...createDefaultDraft('zh-CN'),
      id: 'legacy-draft',
      presidentSignature: undefined,
    } as unknown as CertificateDraft

    const normalized = normalizeDraft(legacyDraft, 'zh-CN')

    expect(normalized.presidentSignature).toBe('')
  })
})
