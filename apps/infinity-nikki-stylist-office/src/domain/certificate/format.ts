/**
 * @fileOverview 证书展示格式化工具
 * @description 集中维护校样编号、签发日期和证书动态值格式，避免页面重复拼接。
 * @author strawberrybear
 * @date 2026-06-20
 */
import type { RegionOption } from '@/domain/catalog/types'

/**
 * @description: 格式化校样证书编号
 * @description 正式编号在签发阶段再编录，核对页只展示地区前缀和待编录占位。
 * @param {RegionOption | undefined} region - 当前登记地区
 * @param {string} pendingText - 当前语言下的待编录文案
 * @return {string} 校样证书编号
 */
export function formatPendingCertificateNo(
  region: RegionOption | undefined,
  pendingText: string
): string {
  return `MC-${region?.code ?? '---'}-${pendingText}`
}

/**
 * @description: 格式化证书日期
 * @description 证书图上只显示日期值，月份和日期补零保证版式宽度稳定。
 * @param {Date} date - 要格式化的日期
 * @return {string} `yyyy.MM.dd` 日期字符串
 */
export function formatCertificateDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}.${month}.${day}`
}
