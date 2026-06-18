/**
 * @fileOverview 协会资料库校验测试
 * @description 确认本地 seed 与后续远程 manifest 使用同一套 schema 约束。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { describe, expect, it } from 'vitest'
import { associationCatalogSeed } from '@/data/associationCatalog.seed'

describe('association catalog seed', () => {
  it('keeps the local seed aligned with the manifest contract', () => {
    expect(associationCatalogSeed.catalogId).toBe('miraland-stylist-office')
    expect(associationCatalogSeed.titleOptions).toHaveLength(8)
    expect(associationCatalogSeed.templates[0]?.baseSize).toEqual({ width: 3840, height: 2160 })
  })
})
