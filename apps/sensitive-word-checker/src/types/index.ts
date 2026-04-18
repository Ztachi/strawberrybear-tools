/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:20:49
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:20:49
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/types/index.ts
 * @Description:
 */
/**
 * @fileOverview 全局类型定义
 * @description 敏感词检测工具的核心数据结构与类型
 * @author strawberrybear
 * @date 2026-04-18
 */

/** 风险等级 */
export type RiskLevel = 'high' | 'medium' | 'low'

/** 词汇库类型 */
export type LexiconKind = 'github' | 'imported'

/** 同步状态 */
export type LexiconSyncStatus = 'success' | 'failed' | 'never'

/** 词汇库记录 */
export interface LexiconSource {
  id: string
  name: string
  url: string
  kind: LexiconKind
  enabled: boolean
  syncStatus: LexiconSyncStatus
  lastUpdated: string | null
  createdAt: string
  isFixed?: boolean
}

/**
 * @description: 敏感词条目
 */
export interface WordEntry {
  /** 词条唯一 ID */
  id: string
  /** 所属词汇库 ID */
  lexiconId: string
  /** 敏感词内容 */
  word: string
  /** 风险等级 */
  category: RiskLevel
  /** 风险类型（如 政治/广告/其他） */
  riskType?: string
  /** 来源文件名（可选，用于溯源） */
  source?: string
}

/**
 * @description: 扫描命中的位置信息
 */
export interface MatchPosition {
  /** 命中词在原文中的起始位置（0-based） */
  start: number
  /** 命中词在原文中的结束位置（不含） */
  end: number
  /** 命中的敏感词内容 */
  word: string
  /** 风险等级 */
  category: RiskLevel
  /** 风险类型 */
  riskType?: string
}

/**
 * @description: 扫描结果
 */
export interface ScanResult {
  /** 原始文本 */
  originalText: string
  /** 所有命中位置列表（按 start 升序） */
  matches: MatchPosition[]
  /** 各等级命中数量 */
  summary: Record<RiskLevel, number>
}

/**
 * @description: 用户设置
 */
export interface Settings {
  /** 是否区分大小写（默认：false） */
  caseSensitive: boolean
  /** 是否忽略标点符号（默认：false） */
  ignorePunctuation: boolean
}

/**
 * @description: IndexedDB meta 数据
 */
export interface LexiconMeta {
  /** 版本标识（最后同步时间戳） */
  version: number
  /** 最后更新时间 ISO 字符串 */
  lastUpdated: string
  /** 词条总数 */
  wordCount: number
}

/**
 * @description: Web Worker 入站消息
 */
export interface ScanWorkerInput {
  text: string
  words: WordEntry[]
  settings: Settings
}

/**
 * @description: Web Worker 出站消息
 */
export type ScanWorkerOutput =
  | { type: 'result'; matches: MatchPosition[] }
  | { type: 'error'; message: string }
