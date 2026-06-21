/**
 * @fileOverview 证书模板 manifest 校验测试
 * @description 确认模板 1 通过模板包入口读取，并按入口相对解析语言底图。
 * @author strawberrybear
 * @date 2026-06-20
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTemplateField, loadBuiltinTemplatePackage, resolveTemplateAssetUrl } from './registry'

describe('certificate template manifest', () => {
  const manifestJson = JSON.stringify({
    schemaVersion: '2026-06-20',
    templateId: 'template-miracle-continent-classic-001',
    name: {
      'zh-CN': '奇迹大陆协会经典证书',
      'zh-TW': '奇蹟大陸協會經典證書',
      'en-US': 'Miracle Continent Association Classic Certificate',
      'ja-JP': '奇跡大陸協会クラシック証書',
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
        imageMask: {
          shape: 'roundedArch',
          borderRadius: '50% 50% 0 0',
        },
        customImageScale: 0.84,
        hitArea: {
          x: 105,
          y: 360,
          width: 350,
          height: 370,
        },
      },
      {
        id: 'name',
        kind: 'text',
        source: 'stylistName',
        editable: true,
        editor: 'name',
        position: [565, 410],
        hitArea: {
          x: 560,
          y: 405,
          width: 440,
          height: 40,
        },
        textStyle: {
          fontSize: 30,
          fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif",
          fontWeight: 760,
          color: '#354a84',
          align: 'left',
          lineHeight: 1.1,
        },
      },
      {
        id: 'certificateNo',
        kind: 'text',
        source: 'certificateNo',
        editable: true,
        editor: 'region',
        position: [650, 466],
        hitArea: {
          x: 640,
          y: 455,
          width: 390,
          height: 40,
        },
        textStyle: {
          fontSize: 22,
          fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif",
          fontWeight: 620,
          color: '#5c4639',
          align: 'left',
          lineHeight: 1.1,
        },
      },
      {
        id: 'title',
        kind: 'text',
        source: 'selectedTitleName',
        editable: true,
        editor: 'title',
        position: [435, 785],
        contentWidth: 250,
        hitArea: {
          x: 342,
          y: 780,
          width: 370,
          height: 52,
        },
        textStyle: {
          fontSize: 28,
          fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif",
          fontWeight: 650,
          color: '#7a5135',
          align: 'left',
          lineHeight: 1.1,
        },
      },
      {
        id: 'issuedDate',
        kind: 'text',
        source: 'today',
        editable: false,
        position: [1098, 890],
        hitArea: {
          x: 1072,
          y: 858,
          width: 180,
          height: 36,
        },
        textStyle: {
          fontSize: 24,
          fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif",
          fontWeight: 560,
          color: '#5c4639',
          align: 'left',
          lineHeight: 1.1,
        },
      },
    ],
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const manifestUrl = '/template/templates/1/manifest.json'

      if (!url.endsWith(manifestUrl)) {
        return new Response('', { status: 404 })
      }

      return new Response(manifestJson, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads template 1 from one public entry and resolves locale images relatively', async () => {
    const templatePackage = await loadBuiltinTemplatePackage(
      'template-miracle-continent-classic-001'
    )

    expect(templatePackage.rootUrl).toBe('/template/templates/1/')
    expect(templatePackage.manifest.baseSize).toEqual({ width: 1672, height: 941 })
    expect(templatePackage.manifest.localeImages).toMatchObject({
      'zh-CN': 'zh-CN.png',
      'zh-TW': 'zh-TW.png',
      'en-US': 'en-US.png',
      'ja-JP': 'ja-JP.png',
    })
    expect(templatePackage.imageSources).toMatchObject({
      'zh-CN': '/template/templates/1/zh-CN.png',
      'zh-TW': '/template/templates/1/zh-TW.png',
      'en-US': '/template/templates/1/en-US.png',
      'ja-JP': '/template/templates/1/ja-JP.png',
    })
  })

  it('declares editable fields and unified coordinates', async () => {
    const templatePackage = await loadBuiltinTemplatePackage(
      'template-miracle-continent-classic-001'
    )
    const avatarField = getTemplateField(templatePackage.manifest, 'avatar')
    const nameField = getTemplateField(templatePackage.manifest, 'name')
    const certificateNoField = getTemplateField(templatePackage.manifest, 'certificateNo')
    const titleField = getTemplateField(templatePackage.manifest, 'title')
    const issuedDateField = getTemplateField(templatePackage.manifest, 'issuedDate')

    expect(avatarField).toMatchObject({
      editable: true,
      editor: 'avatar',
      imageMask: {
        shape: 'roundedArch',
      },
      customImageScale: 0.84,
    })
    expect(nameField).toMatchObject({
      editable: true,
      editor: 'name',
      position: [565, 410],
    })
    expect(certificateNoField).toMatchObject({
      editable: true,
      editor: 'region',
      position: [650, 466],
    })
    expect(titleField).toMatchObject({
      editable: true,
      editor: 'title',
      position: [435, 785],
      contentWidth: 250,
    })
    expect(issuedDateField).toMatchObject({
      editable: false,
      source: 'today',
    })
  })

  it('keeps external absolute asset paths untouched', () => {
    expect(resolveTemplateAssetUrl('https://example.com/templates/1/', 'zh-CN.png')).toBe(
      'https://example.com/templates/1/zh-CN.png'
    )
    expect(resolveTemplateAssetUrl('/template/templates/1/', 'blob:avatar')).toBe('blob:avatar')
  })
})
