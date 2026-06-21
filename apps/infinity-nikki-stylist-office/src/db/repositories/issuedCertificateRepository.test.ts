/**
 * @fileOverview 已签发证书仓储测试
 * @description 验证签发事务只写入证书快照，不长期保存大图，并能准备按需渲染输入。
 * @author strawberrybear
 * @date 2026-06-21
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stylistOfficeDb } from '@/db/database'
import { createDefaultDraft } from '@/domain/draft/factory'
import {
  deleteIssuedCertificate,
  issueCertificateFromDraft,
  prepareIssuedCertificateRenderInput,
} from './issuedCertificateRepository'
import type { CertificateDraft } from '@/domain/draft/types'
import type { IssuedCertificate } from '@/domain/certificate/types'

const templateManifest = {
  schemaVersion: '2026-06-20',
  templateId: 'template-miracle-continent-classic-001',
  name: {
    'zh-CN': '奇迹大陆协会经典证书',
  },
  baseSize: {
    width: 1672,
    height: 941,
  },
  localeImages: {
    'zh-CN': 'zh-CN.png',
    'zh-TW': 'zh-TW.png',
    'en-US': 'en-US.png',
    'ja-JP': 'ja-JP.png',
  },
  fields: [
    {
      id: 'avatar',
      kind: 'image',
      source: 'avatar',
      editable: true,
      editor: 'avatar',
      position: [115, 390],
      size: {
        width: 320,
        height: 320,
      },
      hitArea: {
        x: 105,
        y: 360,
        width: 350,
        height: 370,
      },
    },
  ],
}

function createProofingDraft(): CertificateDraft {
  return {
    ...createDefaultDraft('zh-CN'),
    id: 'draft-repository-test',
    stage: 'proofing',
    stylistName: '冰沙',
    titleId: 'windtime-collector',
    regionId: 'florawish',
    avatarId: 'avatar-default-nikki',
  }
}

describe('issued certificate repository', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', async () => {
      return new Response(JSON.stringify(templateManifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    await stylistOfficeDb.delete()
    await stylistOfficeDb.open()
  })

  afterEach(async () => {
    await stylistOfficeDb.delete()
    vi.unstubAllGlobals()
  })

  it('archives issued certificate metadata without storing generated PNG originals', async () => {
    const draft = createProofingDraft()

    await stylistOfficeDb.activeDraft.put(draft)

    const certificate = await issueCertificateFromDraft(draft.id, {
      now: () => new Date(2026, 5, 21, 9, 0, 0),
      randomCode: () => 'A8K3Q2',
    })

    expect(certificate.certificateNo).toBe('MC-FLW-A8K3Q2')
    expect(certificate.titleName).toBe('风旅拾光搭配师')
    expect(await stylistOfficeDb.issuedCertificates.get(certificate.id)).toMatchObject({
      id: certificate.id,
      certificateNo: 'MC-FLW-A8K3Q2',
    })
    expect(await stylistOfficeDb.certificateImages.count()).toBe(0)
    expect(await stylistOfficeDb.activeDraft.get(draft.id)).toBeUndefined()
  })

  it('retries formal number generation when a local certificate number already exists', async () => {
    const draft = createProofingDraft()
    const existingCertificate: IssuedCertificate = {
      id: 'issued-existing',
      certificateNo: 'MC-FLW-A8K3Q2',
      stylistName: '旧档案',
      titleId: 'wish-weaver',
      titleName: '心愿织光搭配师',
      regionId: 'florawish',
      regionCode: 'FLW',
      avatarId: 'avatar-default-nikki',
      certificateLocale: 'zh-CN',
      templateId: draft.templateId,
      catalogVersion: draft.catalogVersion,
      issuedDateText: '2026.06.20',
      issuedAt: new Date(2026, 5, 20).toISOString(),
    }
    const codeQueue = ['A8K3Q2', 'B8K3Q2']

    await stylistOfficeDb.issuedCertificates.put(existingCertificate)
    await stylistOfficeDb.activeDraft.put(draft)

    const certificate = await issueCertificateFromDraft(draft.id, {
      randomCode: () => codeQueue.shift() ?? 'C8K3Q2',
    })

    expect(certificate.certificateNo).toBe('MC-FLW-B8K3Q2')
    expect(await stylistOfficeDb.issuedCertificates.count()).toBe(2)
  })

  it('keeps the draft and writes no partial records when validation fails', async () => {
    const draft = createProofingDraft()
    draft.titleId = null

    await stylistOfficeDb.activeDraft.put(draft)

    await expect(issueCertificateFromDraft(draft.id)).rejects.toThrow('Certificate title not found')

    expect(await stylistOfficeDb.activeDraft.get(draft.id)).toBeDefined()
    expect(await stylistOfficeDb.issuedCertificates.count()).toBe(0)
    expect(await stylistOfficeDb.certificateImages.count()).toBe(0)
  })

  it('prepares render input from an issued certificate snapshot on demand', async () => {
    const draft = createProofingDraft()

    await stylistOfficeDb.activeDraft.put(draft)

    const certificate = await issueCertificateFromDraft(draft.id, {
      randomCode: () => 'A8K3Q2',
    })
    const preparedInput = await prepareIssuedCertificateRenderInput(certificate)

    expect(preparedInput.input).toMatchObject({
      templateImageSrc: '/template/templates/1/zh-CN.png',
      avatarIsCustom: false,
      fieldValues: {
        avatar: '',
        name: '冰沙',
        certificateNo: 'MC-FLW-A8K3Q2',
        title: '风旅拾光搭配师',
      },
    })
    expect(preparedInput.input.fieldValues.issuedDate).toMatch(/\d{4}\.\d{2}\.\d{2}/)
    preparedInput.cleanup()
  })

  it('deletes issued certificate history and legacy image records', async () => {
    const draft = createProofingDraft()

    await stylistOfficeDb.activeDraft.put(draft)

    const certificate = await issueCertificateFromDraft(draft.id, {
      randomCode: () => 'A8K3Q2',
    })

    await stylistOfficeDb.certificateImages.put({
      id: 'legacy-wide-image',
      certificateId: certificate.id,
      kind: 'wide',
      blob: new Blob(['legacy image'], { type: 'image/png' }),
      width: 3840,
      height: 2160,
    })

    await deleteIssuedCertificate(certificate.id)

    expect(await stylistOfficeDb.issuedCertificates.get(certificate.id)).toBeUndefined()
    expect(await stylistOfficeDb.certificateImages.count()).toBe(0)
  })
})
