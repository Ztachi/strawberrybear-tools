/** @fileOverview 应用稳定常量的统一出口。 */
import releases from './release-notes.json'

/** 日志目录元数据；文案通过 id 对应 i18n，避免版本号中的点被当作路径。 */
export interface ReleaseNote {
  version: string
  date: string
  id: string
}

/**
 * 来源：本应用 CHANGELOG.md 与 GitHub Releases，2026-10-04 复核。
 * 日期采用实际 published_at 的 UTC+8 日历日；不使用提交或 tag 创建时间。
 * https://github.com/Ztachi/strawberrybear-tools/releases
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = releases
