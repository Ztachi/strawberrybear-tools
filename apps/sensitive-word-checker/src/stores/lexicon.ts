/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 20:18:49
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 20:18:50
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/stores/lexicon.ts
 * @Description:
 */
/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:21:33
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:21:33
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/stores/lexicon.ts
 * @Description:
 */
/**
 * @fileOverview 词库状态管理 Store
 * @description 管理多词汇库的 CRUD、同步、启用状态与扫描词条聚合
 * @author strawberrybear
 * @date 2026-04-18
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  appendWordsForLexicon,
  clearAllWords,
  deleteLexicon,
  getAllLexicons,
  getAllWords,
  putLexicon,
  setWordsForLexicon,
} from '../lib/db'
import { fetchAllWords, GITHUB_DEFAULT_SOURCE_URL, parseLexicon } from '../lib/github'
import type { LexiconSource, WordEntry } from '../types'

export const DEFAULT_LEXICON_ID = 'default-sensitive-lexicon'
export const DEFAULT_LEXICON_NAME = 'Sensitive-lexicon'
export const IMPORTED_LEXICON_ID = 'local-imported-lexicon'
export const IMPORTED_LEXICON_NAME = '自己导入'

function nowIso(): string {
  return new Date().toISOString()
}

function sortLexicons(lexicons: LexiconSource[]): LexiconSource[] {
  return [...lexicons].sort((a, b) => {
    if (a.id === DEFAULT_LEXICON_ID) return -1
    if (b.id === DEFAULT_LEXICON_ID) return 1
    if (a.id === IMPORTED_LEXICON_ID) return -1
    if (b.id === IMPORTED_LEXICON_ID) return 1
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export const useLexiconStore = defineStore('lexicon', () => {
  const lexicons = ref<LexiconSource[]>([])
  const allWords = ref<WordEntry[]>([])
  const isLoading = ref(false)
  const syncingId = ref<string | null>(null)
  const syncProgress = ref({ current: 0, total: 0 })
  const error = ref<string | null>(null)

  const activeLexiconIds = computed(() => {
    return new Set(lexicons.value.filter((item) => item.enabled).map((item) => item.id))
  })

  const words = computed(() =>
    allWords.value.filter((w) => activeLexiconIds.value.has(w.lexiconId))
  )
  const wordCount = computed(() => words.value.length)
  const isLoaded = computed(() => words.value.length > 0)

  const lastUpdated = computed(() => {
    const latest = lexicons.value
      .map((item) => item.lastUpdated)
      .filter((item): item is string => Boolean(item))
      .sort()
      .at(-1)
    return latest ?? null
  })

  function ensureDefaultLexicon(existing: LexiconSource[]): LexiconSource[] {
    const found = existing.find((item) => item.id === DEFAULT_LEXICON_ID)
    if (found) {
      const merged: LexiconSource = {
        ...found,
        name: DEFAULT_LEXICON_NAME,
        url: GITHUB_DEFAULT_SOURCE_URL,
        kind: 'github',
        isFixed: true,
      }
      return existing.map((item) => (item.id === DEFAULT_LEXICON_ID ? merged : item))
    }

    return [
      ...existing,
      {
        id: DEFAULT_LEXICON_ID,
        name: DEFAULT_LEXICON_NAME,
        url: GITHUB_DEFAULT_SOURCE_URL,
        kind: 'github',
        enabled: true,
        syncStatus: 'never',
        lastUpdated: null,
        createdAt: nowIso(),
        isFixed: true,
      },
    ]
  }

  async function reload(): Promise<void> {
    const [dbLexicons, dbWords] = await Promise.all([getAllLexicons(), getAllWords()])
    const withDefault = ensureDefaultLexicon(dbLexicons)
    console.log(
      '[reload] dbWords.length:',
      dbWords.length,
      '| lexicons:',
      withDefault.filter((i) => i.enabled).map((i) => ({ id: i.id, enabled: i.enabled }))
    )

    const hasChanged =
      withDefault.length !== dbLexicons.length ||
      withDefault.some((item, index) => JSON.stringify(item) !== JSON.stringify(dbLexicons[index]))

    if (hasChanged) {
      await Promise.all(withDefault.map((item) => putLexicon(item)))
    }

    lexicons.value = sortLexicons(withDefault)
    allWords.value = dbWords
  }

  async function loadFromDB(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      await reload()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      isLoading.value = false
    }
  }

  function assertUnique(name: string, url: string, excludeId?: string): void {
    const normalizedName = name.trim().toLowerCase()
    const normalizedUrl = url.trim().toLowerCase()

    const dupName = lexicons.value.find(
      (item) => item.id !== excludeId && item.name.trim().toLowerCase() === normalizedName
    )
    if (dupName) {
      throw new Error('词汇库名称已存在')
    }

    const dupUrl = lexicons.value.find(
      (item) =>
        item.id !== excludeId &&
        item.kind === 'github' &&
        item.url.trim().toLowerCase() === normalizedUrl
    )
    if (dupUrl) {
      throw new Error('词汇库地址已存在')
    }
  }

  async function addLexicon(name: string, url: string): Promise<void> {
    const trimmedName = name.trim()
    const trimmedUrl = url.trim()

    if (!trimmedName) throw new Error('名称不能为空')
    if (!trimmedUrl) throw new Error('地址不能为空')

    assertUnique(trimmedName, trimmedUrl)

    const lexicon: LexiconSource = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      url: trimmedUrl,
      kind: 'github',
      enabled: true,
      syncStatus: 'never',
      lastUpdated: null,
      createdAt: nowIso(),
    }

    await putLexicon(lexicon)
    lexicons.value = sortLexicons([...lexicons.value, lexicon])
  }

  async function updateLexicon(id: string, name: string, url: string): Promise<void> {
    const target = lexicons.value.find((item) => item.id === id)
    if (!target) throw new Error('词汇库不存在')
    if (target.id === DEFAULT_LEXICON_ID || target.id === IMPORTED_LEXICON_ID) {
      throw new Error('系统词汇库不可编辑')
    }

    const trimmedName = name.trim()
    const trimmedUrl = url.trim()

    if (!trimmedName) throw new Error('名称不能为空')
    if (!trimmedUrl) throw new Error('地址不能为空')

    assertUnique(trimmedName, trimmedUrl, id)

    const updated: LexiconSource = {
      ...target,
      name: trimmedName,
      url: trimmedUrl,
    }

    await putLexicon(updated)
    lexicons.value = sortLexicons(lexicons.value.map((item) => (item.id === id ? updated : item)))
  }

  async function toggleLexiconEnabled(id: string): Promise<void> {
    const target = lexicons.value.find((item) => item.id === id)
    if (!target) return

    const updated: LexiconSource = { ...target, enabled: !target.enabled }
    await putLexicon(updated)
    lexicons.value = sortLexicons(lexicons.value.map((item) => (item.id === id ? updated : item)))
  }

  async function removeLexicon(id: string): Promise<void> {
    if (id === DEFAULT_LEXICON_ID) {
      throw new Error('默认词汇库不可删除')
    }

    await deleteLexicon(id)
    lexicons.value = sortLexicons(lexicons.value.filter((item) => item.id !== id))
    allWords.value = allWords.value.filter((item) => item.lexiconId !== id)
  }

  async function syncLexicon(id: string): Promise<number> {
    const target = lexicons.value.find((item) => item.id === id)
    if (!target) throw new Error('词汇库不存在')
    if (target.kind !== 'github') throw new Error('该词汇库不支持同步')

    syncingId.value = id
    syncProgress.value = { current: 0, total: 0 }
    error.value = null

    try {
      const entries = await fetchAllWords(target.id, target.url, (current, total) => {
        syncProgress.value = { current, total }
      })

      // 按 ID 去重，避免 IndexedDB put 时因 ID 冲突覆盖导致数据丢失
      const uniqueEntries = Array.from(new Map(entries.map((e) => [e.id, e])).values())

      await setWordsForLexicon(target.id, uniqueEntries)

      const updated: LexiconSource = {
        ...target,
        syncStatus: 'success',
        lastUpdated: nowIso(),
      }
      await putLexicon(updated)

      lexicons.value = sortLexicons(lexicons.value.map((item) => (item.id === id ? updated : item)))
      allWords.value = [...allWords.value.filter((w) => w.lexiconId !== id), ...uniqueEntries]
      return uniqueEntries.length
    } catch (err) {
      const updated: LexiconSource = {
        ...target,
        syncStatus: 'failed',
      }
      await putLexicon(updated)
      lexicons.value = sortLexicons(lexicons.value.map((item) => (item.id === id ? updated : item)))

      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      syncingId.value = null
      syncProgress.value = { current: 0, total: 0 }
    }
  }

  async function clearAllLexicons(): Promise<void> {
    await clearAllWords()
    allWords.value = []
  }

  async function importLocalLexicon(file: File): Promise<number> {
    isLoading.value = true
    error.value = null

    try {
      const content = await file.text()
      const parsed = parseLexicon(file.name, content, IMPORTED_LEXICON_ID)

      let importedLexicon = lexicons.value.find((item) => item.id === IMPORTED_LEXICON_ID)
      if (!importedLexicon) {
        importedLexicon = {
          id: IMPORTED_LEXICON_ID,
          name: IMPORTED_LEXICON_NAME,
          url: '',
          kind: 'imported',
          enabled: true,
          syncStatus: 'success',
          lastUpdated: nowIso(),
          createdAt: nowIso(),
          isFixed: true,
        }
      } else {
        importedLexicon = {
          ...importedLexicon,
          syncStatus: 'success',
          lastUpdated: nowIso(),
        }
      }

      const appended = await appendWordsForLexicon(IMPORTED_LEXICON_ID, parsed)
      await putLexicon(importedLexicon)

      await reload()
      return appended
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    lexicons,
    words,
    allWords,
    wordCount,
    isLoaded,
    isLoading,
    syncingId,
    syncProgress,
    error,
    lastUpdated,
    loadFromDB,
    addLexicon,
    updateLexicon,
    toggleLexiconEnabled,
    removeLexicon,
    syncLexicon,
    importLocalLexicon,
    clearAllLexicons,
    DEFAULT_LEXICON_ID,
    IMPORTED_LEXICON_ID,
  }
})
