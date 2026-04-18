/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:20:49
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:20:50
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/lib/aho-corasick.ts
 * @Description:
 */
/**
 * @fileOverview Aho-Corasick 多模式字符串匹配算法
 * @description 构建失配指针自动机，支持在文本中同时匹配多个模式串，时间复杂度 O(n+m+z)
 * @author strawberrybear
 * @date 2026-04-18
 */

import type { MatchPosition, RiskLevel } from '../types'

/** Trie 节点 */
interface AcNode {
  /** 子节点映射：字符 → 节点索引 */
  children: Map<string, number>
  /** 失配指针（BFS 阶段填充） */
  fail: number
  /** 若该节点为模式串末尾，存储对应词条信息 */
  output: Array<{ word: string; category: RiskLevel; riskType: string }> | null
}

/**
 * @description: Aho-Corasick 自动机
 */
export class AhoCorasick {
  private nodes: AcNode[] = []
  private built = false

  constructor() {
    this.nodes.push(this.newNode())
  }

  private newNode(): AcNode {
    return { children: new Map(), fail: 0, output: null }
  }

  /**
   * @description: 向 Trie 中插入一个模式串
   * @param {string} word - 要插入的词
   * @param {RiskLevel} category - 风险等级
   * @return {void}
   */
  insert(word: string, category: RiskLevel, riskType: string): void {
    let cur = 0
    for (const ch of word) {
      if (!this.nodes[cur].children.has(ch)) {
        this.nodes[cur].children.set(ch, this.nodes.length)
        this.nodes.push(this.newNode())
      }
      cur = this.nodes[cur].children.get(ch)!
    }
    if (!this.nodes[cur].output) {
      this.nodes[cur].output = []
    }
    this.nodes[cur].output!.push({ word, category, riskType })
  }

  /**
   * @description: BFS 构建失配指针（build 后才能 search）
   * @return {void}
   */
  build(): void {
    const queue: number[] = []
    const root = this.nodes[0]

    for (const [, childIdx] of root.children) {
      this.nodes[childIdx].fail = 0
      queue.push(childIdx)
    }

    while (queue.length > 0) {
      const cur = queue.shift()!
      const curNode = this.nodes[cur]

      for (const [ch, childIdx] of curNode.children) {
        const childNode = this.nodes[childIdx]

        let failState = curNode.fail
        while (failState !== 0 && !this.nodes[failState].children.has(ch)) {
          failState = this.nodes[failState].fail
        }

        childNode.fail = this.nodes[failState].children.get(ch) ?? 0
        if (childNode.fail === childIdx) childNode.fail = 0

        // 合并失配链上的 output
        const failOutput = this.nodes[childNode.fail].output
        if (failOutput) {
          childNode.output = [...(childNode.output ?? []), ...failOutput]
        }

        queue.push(childIdx)
      }
    }

    this.built = true
  }

  /**
   * @description: 在文本中搜索所有模式串，返回所有命中位置
   * @param {string} text - 待扫描文本
   * @return {MatchPosition[]} 命中位置列表（按 start 升序）
   */
  search(text: string): MatchPosition[] {
    if (!this.built) {
      throw new Error('AhoCorasick: call build() before search()')
    }

    const results: MatchPosition[] = []
    let cur = 0

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]

      while (cur !== 0 && !this.nodes[cur].children.has(ch)) {
        cur = this.nodes[cur].fail
      }

      cur = this.nodes[cur].children.get(ch) ?? 0

      if (this.nodes[cur].output) {
        for (const { word, category, riskType } of this.nodes[cur].output!) {
          results.push({
            start: i - word.length + 1,
            end: i + 1,
            word,
            category,
            riskType,
          })
        }
      }
    }

    return results.sort((a, b) => a.start - b.start)
  }
}
