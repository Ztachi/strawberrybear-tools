/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:21:11
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:21:12
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/workers/scanner.worker.ts
 * @Description:
 */
/**
 * @fileOverview 扫描任务 Web Worker
 * @description 接收文本和词库，在独立线程中执行 Aho-Corasick 扫描，返回命中结果，避免 UI 阻塞
 * @author strawberrybear
 * @date 2026-04-18
 */

import { AhoCorasick } from '../lib/aho-corasick'
import type { MatchPosition, ScanWorkerInput, ScanWorkerOutput, WordEntry } from '../types'

/** 最小词长阈值：单字匹配误报率极高，过滤掉 */
const MIN_WORD_LENGTH = 2

/**
 * @description: 贪心最长非重叠匹配去重
 * @description 同一起始位置优先保留最长匹配；已被覆盖的位置跳过
 * @param {MatchPosition[]} matches - AC 自动机返回的全部匹配（含重叠）
 * @return {MatchPosition[]} 去重后的非重叠最长匹配列表
 */
function greedyLongest(matches: MatchPosition[]): MatchPosition[] {
  // 同起始位置：end 越大（词越长）越靠前
  const sorted = [...matches].sort((a, b) =>
    a.start !== b.start ? a.start - b.start : b.end - a.end
  )

  const result: MatchPosition[] = []
  let cursor = 0

  for (const match of sorted) {
    if (match.start >= cursor) {
      result.push(match)
      cursor = match.end
    }
  }

  return result
}

/**
 * @description: 对文本进行预处理（根据设置忽略标点/大小写）
 * @param {string} text - 原始文本
 * @param {boolean} caseSensitive - 是否区分大小写
 * @param {boolean} ignorePunctuation - 是否忽略标点
 * @return {string} 处理后的文本（与原文等长，替换字符不影响位置计算）
 */
function preprocessText(text: string, caseSensitive: boolean, ignorePunctuation: boolean): string {
  let result = caseSensitive ? text : text.toLowerCase()
  if (ignorePunctuation) {
    // 将标点替换为空格（保持长度一致以确保位置正确）
    result = result.replace(/[\p{P}\p{S}]/gu, ' ')
  }
  return result
}

/**
 * @description: 对词条进行预处理（与文本处理保持一致）
 * @param {WordEntry[]} words - 原始词条列表
 * @param {boolean} caseSensitive - 是否区分大小写
 * @param {boolean} ignorePunctuation - 是否忽略标点
 * @return {WordEntry[]} 处理后的词条列表
 */
function preprocessWords(
  words: WordEntry[],
  caseSensitive: boolean,
  ignorePunctuation: boolean
): WordEntry[] {
  return words.map((entry) => {
    let word = caseSensitive ? entry.word : entry.word.toLowerCase()
    if (ignorePunctuation) {
      word = word.replace(/[\p{P}\p{S}]/gu, ' ')
    }
    return { ...entry, word }
  })
}

self.onmessage = (event: MessageEvent<ScanWorkerInput>) => {
  const { text, words, settings } = event.data

  try {
    if (!text.trim() || words.length === 0) {
      const output: ScanWorkerOutput = { type: 'result', matches: [] }
      self.postMessage(output)
      return
    }

    const processedText = preprocessText(text, settings.caseSensitive, settings.ignorePunctuation)
    const processedWords = preprocessWords(
      words,
      settings.caseSensitive,
      settings.ignorePunctuation
    )

    const ac = new AhoCorasick()
    for (const entry of processedWords) {
      // 过滤单字词，避免误报
      if (entry.word && entry.word.length >= MIN_WORD_LENGTH) {
        ac.insert(entry.word, entry.category, entry.riskType ?? '其他')
      }
    }
    ac.build()

    // 贪心最长非重叠去重：确保"习近平"(高风险)优先于"习近"(低风险)
    const rawMatches = ac.search(processedText)
    const matches = greedyLongest(rawMatches)

    const output: ScanWorkerOutput = { type: 'result', matches }
    self.postMessage(output)
  } catch (err) {
    const output: ScanWorkerOutput = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(output)
  }
}
