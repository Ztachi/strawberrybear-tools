/** 离线用户日志门禁：正式版本必须有目录、中英文重心和合法日期，不能漏写再打包。 */
/* global console, process */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

/**
 * @param {string} current 当前打包版本
 * @param {object[]} releases 版本目录，按最新到最旧排列
 * @param {Record<string, object>} translations 每个语言的日志资源
 * @return {void} 校验成功；缺失或非法数据抛出明确错误。
 */
export function validateReleaseNotes(current, releases, translations) {
  if (!releases.some((release) => release.version === current))
    throw new Error(`缺少 ${current} 面向用户的更新日志，请先补齐中英文内容和发布日期`)
  const ids = new Set()
  const versions = new Set()
  for (const [index, release] of releases.entries()) {
    if (!semver.valid(release.version) || versions.has(release.version) || ids.has(release.id))
      throw new Error(`更新日志版本或标识无效、重复：${release.version}`)
    if (!/^v\d+_\d+_\d+(?:_[a-zA-Z0-9_]+)?$/.test(release.id ?? ''))
      throw new Error(`日志标识不能包含 i18n 路径分隔符：${release.id}`)
    const date = new Date(`${release.date}T00:00:00Z`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(release.date ?? '') ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== release.date
    )
      throw new Error(`更新日志日期无效：${release.version}`)
    if (index > 0 && !semver.gt(releases[index - 1].version, release.version))
      throw new Error('更新日志必须按 SemVer 从新到旧排序')
    ids.add(release.id)
    versions.add(release.version)
    for (const [locale, entries] of Object.entries(translations)) {
      const entry = entries[release.id]
      if (
        !entry ||
        typeof entry.title !== 'string' ||
        !entry.title.trim() ||
        !Array.isArray(entry.highlights) ||
        !entry.highlights.length ||
        entry.highlights.some((item) => typeof item !== 'string' || !item.trim())
      )
        throw new Error(`缺少 ${release.version} 的 ${locale} 用户日志重心或正文`)
    }
  }
}

/** @param {string} root app 目录 @return {void} 读取真实文件并校验，供构建和发版共用。 */
export function checkReleaseNotes(root = join(dirname(fileURLToPath(import.meta.url)), '..')) {
  const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
  validateReleaseNotes(read('package.json').version, read('src/const/release-notes.json'), {
    'zh-CN': read('src/i18n/locales/release-notes/zh-CN.json'),
    'en-US': read('src/i18n/locales/release-notes/en-US.json'),
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkReleaseNotes()
  console.log('面向用户的中英文更新日志校验通过')
}
