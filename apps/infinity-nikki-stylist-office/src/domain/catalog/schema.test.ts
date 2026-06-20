/**
 * @fileOverview 协会资料库校验测试
 * @description 确认本地 seed 与后续远程 manifest 使用同一套 schema 约束。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { describe, expect, it } from 'vitest'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'

/** 地区常量必须完整支持资料库声明的语言，不能只依赖回退展示。 */
const REQUIRED_REGION_LOCALES = associationCatalogSeed.locales

describe('association catalog seed', () => {
  it('keeps the local seed aligned with the manifest contract', () => {
    expect(associationCatalogSeed.catalogId).toBe('miraland-stylist-office')
    expect(associationCatalogSeed.titleOptions).toHaveLength(8)
    expect(associationCatalogSeed.regions).toHaveLength(40)
    expect(associationCatalogSeed.regions[0]).toMatchObject({
      number: '001',
      code: 'FLW',
      name: { 'zh-CN': '花愿镇' },
    })
    expect(associationCatalogSeed.templates[0]?.baseSize).toEqual({ width: 3840, height: 2160 })
  })

  it('keeps region identifiers, numbers, codes, and Chinese names unique', () => {
    const regions = associationCatalogSeed.regions

    expect(new Set(regions.map((region) => region.id)).size).toBe(regions.length)
    expect(new Set(regions.map((region) => region.number)).size).toBe(regions.length)
    expect(new Set(regions.map((region) => region.code)).size).toBe(regions.length)
    expect(new Set(regions.map((region) => region.name['zh-CN'])).size).toBe(regions.length)
  })

  it('provides localized region names for every supported locale', () => {
    for (const region of associationCatalogSeed.regions) {
      for (const locale of REQUIRED_REGION_LOCALES) {
        expect(region.name[locale], `${region.id} should include ${locale}`).toBeTruthy()
      }
    }
  })
})
