/**
 * @fileOverview 正本签发领域工具测试
 * @description 覆盖正式编号格式、随机码映射和签发快照字段。
 * @author strawberrybear
 * @date 2026-06-21
 */
import { describe, expect, it } from 'vitest'
import { createDefaultDraft } from '@/domain/draft/factory'
import {
  buildCertificateRenderFieldValues,
  buildIssuedCertificateSnapshot,
  createCertificateRandomCode,
  formatIssuedCertificateNo,
  ISSUED_CERTIFICATE_NO_PATTERN,
  resolveIssuedCertificateDraftContext,
} from './issue'

describe('certificate issue helpers', () => {
  it('formats formal certificate numbers with region code and short random code', () => {
    const certificateNo = formatIssuedCertificateNo('flw', 'a8k3q2')

    expect(certificateNo).toBe('MC-FLW-A8K3Q2')
    expect(certificateNo).toMatch(ISSUED_CERTIFICATE_NO_PATTERN)
  })

  it('creates random codes from the non-confusing alphabet', () => {
    expect(createCertificateRandomCode(new Uint8Array([0, 1, 2, 3, 4, 31]))).toBe('ABCDE9')
  })

  it('builds immutable issued certificate snapshots and render fields', () => {
    const draft = {
      ...createDefaultDraft('en-US'),
      id: 'draft-issue-test',
      stage: 'proofing' as const,
      stylistName: 'Nikki',
      titleId: 'windtime-collector',
      regionId: 'florawish',
      avatarId: 'avatar-default-nikki',
      avatarTransform: {
        x: 12,
        y: -8,
        scale: 1.24,
      },
    }
    const context = resolveIssuedCertificateDraftContext(draft)
    const certificate = buildIssuedCertificateSnapshot({
      id: 'issued-1',
      certificateNo: 'MC-FLW-A8K3Q2',
      draft,
      context,
      issuedAt: new Date(2026, 5, 21, 10, 30, 0),
    })

    expect(certificate).toMatchObject({
      id: 'issued-1',
      certificateNo: 'MC-FLW-A8K3Q2',
      stylistName: 'Nikki',
      titleId: 'windtime-collector',
      titleName: 'Windborne Light Collector Stylist',
      regionId: 'florawish',
      regionCode: 'FLW',
      avatarId: 'avatar-default-nikki',
      avatarTransform: {
        x: 12,
        y: -8,
        scale: 1.24,
      },
      issuedDateText: '2026.06.21',
    })
    expect(buildCertificateRenderFieldValues(certificate)).toEqual({
      avatar: '',
      name: 'Nikki',
      certificateNo: 'MC-FLW-A8K3Q2',
      title: 'Windborne Light Collector Stylist',
      issuedDate: '2026.06.21',
      chairmanSignature: 'Tea Egg',
    })
  })

  it('falls back to template president name when draft signature is empty', () => {
    const draft = {
      ...createDefaultDraft('zh-CN'),
      id: 'draft-signature-fallback',
      stage: 'proofing' as const,
      stylistName: '冰沙',
      presidentSignature: '',
      titleId: 'windtime-collector',
      regionId: 'florawish',
      avatarId: 'avatar-default-nikki',
    }
    const context = resolveIssuedCertificateDraftContext(draft)
    const certificate = buildIssuedCertificateSnapshot({
      id: 'issued-signature-fallback',
      certificateNo: 'MC-FLW-A8K3Q2',
      draft,
      context,
      issuedAt: new Date(2026, 5, 21, 10, 30, 0),
    })

    expect(certificate.presidentSignature).toBe('茶叶蛋')
    expect(buildCertificateRenderFieldValues(certificate).chairmanSignature).toBe('茶叶蛋')
  })
})
