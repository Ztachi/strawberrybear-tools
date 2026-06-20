/**
 * @fileOverview 证书格式化工具测试
 * @description 覆盖校样编号和证书日期格式，避免页面组件重复拼接。
 * @author strawberrybear
 * @date 2026-06-20
 */
import { describe, expect, it } from 'vitest'
import { formatCertificateDate, formatPendingCertificateNo } from './format'
import type { RegionOption } from '@/domain/catalog/types'

const region: RegionOption = {
  id: 'florawish',
  number: '001',
  code: 'FLW',
  name: {
    'zh-CN': '花愿镇',
  },
}

describe('certificate format helpers', () => {
  it('formats pending certificate numbers from region code', () => {
    expect(formatPendingCertificateNo(region, '待编录')).toBe('MC-FLW-待编录')
    expect(formatPendingCertificateNo(undefined, 'Pending')).toBe('MC-----Pending')
  })

  it('formats certificate dates as yyyy.MM.dd', () => {
    expect(formatCertificateDate(new Date(2026, 5, 20))).toBe('2026.06.20')
    expect(formatCertificateDate(new Date(2026, 0, 3))).toBe('2026.01.03')
  })
})
