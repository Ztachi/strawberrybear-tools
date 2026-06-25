/**
 * @fileOverview 自定义素材裁剪配置测试
 * @description 验证签章裁剪比例始终来自签章源素材尺寸，而不是头像字段比例。
 * @author strawberrybear
 * @date 2026-06-25
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIGNATURE_CROP_ASPECT_RATIO,
  resolveCustomAssetCropAspectRatio,
  resolveCustomAssetOutputSize,
} from './crop'
import type { CertificateTemplateManifest } from '@/domain/template/types'

const manifest = {
  schemaVersion: '2026-06-20',
  templateId: 'template-test',
  name: {
    'zh-CN': '测试模板',
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
      position: [138, 396],
      size: {
        width: 286,
        height: 308,
      },
      hitArea: {
        x: 124,
        y: 364,
        width: 326,
        height: 366,
      },
    },
    {
      id: 'chairmanSignature',
      kind: 'signature',
      source: 'presidentSignature',
      editable: true,
      editor: 'signature',
      position: [1100, 830],
      size: {
        width: 201,
        height: 67,
      },
      signatureImageSourceSize: {
        width: 2172,
        height: 724,
      },
      hitArea: {
        x: 1090,
        y: 820,
        width: 220,
        height: 60,
      },
      textStyle: {
        fontSize: 38,
        fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif",
        fontWeight: 650,
        color: '#7a5135',
        align: 'left',
        lineHeight: 1.1,
      },
    },
  ],
} satisfies CertificateTemplateManifest

describe('custom asset crop config', () => {
  it('uses avatar field size for custom avatar crop ratio', () => {
    expect(resolveCustomAssetCropAspectRatio(manifest, 'avatar')).toBeCloseTo(286 / 308)
  })

  it('uses signature source size for custom signature crop ratio', () => {
    expect(resolveCustomAssetCropAspectRatio(manifest, 'signature')).toBe(2172 / 724)
  })

  it('falls back to the signature source ratio when the signature field is missing', () => {
    expect(resolveCustomAssetCropAspectRatio({ ...manifest, fields: [] }, 'signature')).toBe(
      DEFAULT_SIGNATURE_CROP_ASPECT_RATIO
    )
  })

  it('exports signature crops with the expected 3:1 output size', () => {
    expect(resolveCustomAssetOutputSize(2172 / 724)).toEqual({
      width: 1024,
      height: 341,
    })
  })
})
