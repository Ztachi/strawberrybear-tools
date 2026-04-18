/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 20:17:54
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 20:17:55
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/lib/github.ts
 * @Description:
 */
/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:20:52
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:20:53
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/lib/github.ts
 * @Description:
 */
/**
 * @fileOverview GitHub 词库同步服务
 * @description 通过 GitHub Contents API 拉取词库并解析为内部数据结构
 * @author strawberrybear
 * @date 2026-04-18
 */

import type { RiskLevel, WordEntry } from '../types'

const DEFAULT_GITHUB_REPO_URL = 'https://github.com/konsheng/Sensitive-lexicon'
const DEFAULT_VOCABULARY_PATH = 'Vocabulary'

interface GithubFileInfo {
  name: string
  download_url: string
  type: 'file' | 'dir'
}

interface GithubSourceSpec {
  owner: string
  repo: string
  path: string
}

interface InferredFromFilename {
  category: RiskLevel | null
  riskType: string | null
}

/**
 * @description: 根据文件名推断风险等级
 * @param {string} filename - 文件名（含 .txt 后缀）
 * @return {RiskLevel} 推断的风险等级
 */
function inferFromFilename(filename: string): InferredFromFilename {
  const HIGH_KEYWORDS = ['暴恐', '反动', '政治', '涉枪', 'gfw', 'GFW', '新思想', '反华']
  const LOW_KEYWORDS = ['广告', '其他', '补充', '零时', '网易', '民生']

  const name = filename.toLowerCase()

  const highMatch = HIGH_KEYWORDS.find(
    (kw) => filename.includes(kw) || name.includes(kw.toLowerCase())
  )
  if (highMatch) {
    return { category: 'high', riskType: highMatch }
  }

  const lowMatch = LOW_KEYWORDS.find((kw) => filename.includes(kw))
  if (lowMatch) {
    return { category: 'low', riskType: lowMatch }
  }

  return { category: null, riskType: null }
}

/**
 * @description: 将“等级”字段映射为内部 RiskLevel 枚举
 * @param {string} rawLevel - 原始等级值（如 high/高/1 等）
 * @return {RiskLevel | null} 识别成功返回枚举，否则返回 null
 */
function mapLevelToRisk(rawLevel: string): RiskLevel | null {
  const normalized = rawLevel.trim().toLowerCase()
  if (!normalized) return null

  const HIGH_LEVELS = ['high', 'h', '1', '高', '高风险', '严重', 'critical']
  const MEDIUM_LEVELS = ['medium', 'mid', 'm', '2', '中', '中风险', '一般']
  const LOW_LEVELS = ['low', 'l', '3', '低', '低风险', '轻微']

  if (HIGH_LEVELS.includes(normalized)) return 'high'
  if (MEDIUM_LEVELS.includes(normalized)) return 'medium'
  if (LOW_LEVELS.includes(normalized)) return 'low'
  return null
}

/**
 * @description: 解析一行词条，支持“词语|等级|类型”格式
 * @param {string} line - 原始行文本
 * @return {{ word: string; level: RiskLevel | null; riskType: string | null }} 解析结果
 */
function parseLineEntry(line: string): {
  word: string
  level: RiskLevel | null
  riskType: string | null
} {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return { word: '', level: null, riskType: null }
  }

  const parts = trimmed.split('|').map((part) => part.trim())
  if (parts.length >= 2) {
    return {
      word: parts[0],
      level: mapLevelToRisk(parts[1]),
      riskType: parts[2] || null,
    }
  }

  return {
    word: trimmed,
    level: null,
    riskType: null,
  }
}

/**
 * @description: 将 .txt 文件内容解析为 WordEntry 列表
 * @param {string} filename - 来源文件名，用于推断风险等级
 * @param {string} content - 文件原始文本内容（每行一个词）
 * @param {string} lexiconId - 所属词汇库 ID
 * @return {WordEntry[]} 解析后的词条列表
 */
export function parseLexicon(filename: string, content: string, lexiconId: string): WordEntry[] {
  const inferred = inferFromFilename(filename)
  const entries: WordEntry[] = []

  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const parsed = parseLineEntry(line)
    if (!parsed.word) continue

    // 先用文件名判定；未命中时回退到行内“词语|等级|类型”的等级字段，再兜底 medium
    const category = inferred.category ?? parsed.level ?? 'medium'
    const riskType = inferred.riskType ?? parsed.riskType ?? '其他'

    entries.push({
      id: `${lexiconId}::${filename}::${parsed.word}`,
      lexiconId,
      word: parsed.word,
      category,
      riskType,
      source: filename,
    })
  }

  return entries
}

function normalizeGithubAddress(address: string): GithubSourceSpec {
  const trimmed = address.trim()

  const apiMatch = trimmed.match(
    /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/
  )
  if (apiMatch) {
    return {
      owner: apiMatch[1],
      repo: apiMatch[2],
      path: decodeURIComponent(apiMatch[3]),
    }
  }

  const url = new URL(trimmed)
  if (url.hostname !== 'github.com') {
    throw new Error('仅支持 GitHub 地址')
  }

  const segs = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (segs.length < 2) {
    throw new Error('GitHub 地址格式不正确')
  }

  const owner = segs[0]
  const repo = segs[1]

  let path = DEFAULT_VOCABULARY_PATH
  const treeIdx = segs.indexOf('tree')
  if (treeIdx >= 0 && segs.length > treeIdx + 3) {
    path = segs.slice(treeIdx + 3).join('/')
  }

  return { owner, repo, path }
}

/**
 * @description: 从 GitHub Contents API 获取指定目录下的 .txt 文件列表
 * @param {string} address - GitHub 仓库地址或 contents API 地址
 * @return {Promise<GithubFileInfo[]>} 文件信息列表
 */
export async function fetchFileListByAddress(address: string): Promise<GithubFileInfo[]> {
  const spec = normalizeGithubAddress(address)
  const encodedPath = encodeURIComponent(spec.path).replace(/%2F/g, '/')
  const apiUrl = `https://api.github.com/repos/${spec.owner}/${spec.repo}/contents/${encodedPath}`

  const resp = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })

  if (!resp.ok) {
    throw new Error(`GitHub API 请求失败: ${resp.status} ${resp.statusText}`)
  }

  const data = (await resp.json()) as GithubFileInfo[]
  return data.filter((f) => f.type === 'file' && f.name.endsWith('.txt'))
}

/**
 * @description: 下载单个词库文件的文本内容
 * @param {string} downloadUrl - 文件的 raw 下载地址
 * @return {Promise<string>} 文件文本内容
 */
export async function fetchFileContent(downloadUrl: string): Promise<string> {
  const resp = await fetch(downloadUrl)
  if (!resp.ok) {
    throw new Error(`下载失败: ${downloadUrl} (${resp.status})`)
  }
  return resp.text()
}

/**
 * @description: 从 GitHub 拉取词库并解析
 * @param {string} lexiconId - 所属词汇库 ID
 * @param {string} address - GitHub 仓库地址或 contents API 地址
 * @param {(current: number, total: number) => void} onProgress - 进度回调（可选）
 * @return {Promise<WordEntry[]>} 所有词条
 */
export async function fetchAllWords(
  lexiconId: string,
  address = DEFAULT_GITHUB_REPO_URL,
  onProgress?: (current: number, total: number) => void
): Promise<WordEntry[]> {
  const files = await fetchFileListByAddress(address)
  const allEntries: WordEntry[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const content = await fetchFileContent(file.download_url)
    const entries = parseLexicon(file.name, content, lexiconId)
    allEntries.push(...entries)
    onProgress?.(i + 1, files.length)
  }

  return allEntries
}

export const GITHUB_DEFAULT_SOURCE_URL = DEFAULT_GITHUB_REPO_URL
