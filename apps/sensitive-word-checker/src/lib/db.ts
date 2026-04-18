/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 20:18:17
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 20:18:18
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/lib/db.ts
 * @Description:
 */
/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:20:50
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:20:52
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/lib/db.ts
 * @Description:
 */
/**
 * @fileOverview IndexedDB 服务
 * @description 管理词汇库与词条持久化，支持多词汇库 CRUD 和按词汇库独立存储
 * @author strawberrybear
 * @date 2026-04-18
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { LexiconMeta, LexiconSource, WordEntry } from '../types'

const DB_NAME = 'sensitive-word-checker'
const DB_VERSION = 2
const STORE_WORDS = 'words'
const STORE_META = 'meta'
const STORE_LEXICONS = 'lexicons'

interface SensitiveDBSchema {
  words: {
    key: string
    value: WordEntry
    indexes: {
      'by-category': string
      'by-lexicon-id': string
    }
  }
  meta: {
    key: string
    value: LexiconMeta
  }
  lexicons: {
    key: string
    value: LexiconSource
  }
}

type SensitiveDB = IDBPDatabase<SensitiveDBSchema>

let dbPromise: Promise<SensitiveDB> | null = null

function getDB(): Promise<SensitiveDB> {
  if (!dbPromise) {
    dbPromise = openDB<SensitiveDBSchema>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains(STORE_WORDS)) {
          const wordStore = db.createObjectStore(STORE_WORDS, { keyPath: 'id' })
          wordStore.createIndex('by-category', 'category', { unique: false })
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META)
        }

        if (oldVersion < 2) {
          const wordStore = transaction.objectStore(STORE_WORDS)
          if (!wordStore.indexNames.contains('by-lexicon-id')) {
            wordStore.createIndex('by-lexicon-id', 'lexiconId', { unique: false })
          }

          if (!db.objectStoreNames.contains(STORE_LEXICONS)) {
            db.createObjectStore(STORE_LEXICONS, { keyPath: 'id' })
          }

          // 将旧版本词条补齐 lexiconId 字段，避免索引为空导致后续无法按词库管理
          let cursor = await wordStore.openCursor()
          while (cursor) {
            const value = cursor.value as WordEntry
            if (!value.lexiconId) {
              const migrated: WordEntry = {
                ...value,
                lexiconId: 'default-sensitive-lexicon',
              }
              await cursor.update(migrated)
            }
            cursor = await cursor.continue()
          }
        }
      },
    })
  }
  return dbPromise
}

export async function getAllWords(): Promise<WordEntry[]> {
  const db = await getDB()
  return db.getAll(STORE_WORDS)
}

export async function getWordsByLexiconId(lexiconId: string): Promise<WordEntry[]> {
  const db = await getDB()
  return db.getAllFromIndex(STORE_WORDS, 'by-lexicon-id', lexiconId)
}

export async function setWordsForLexicon(lexiconId: string, entries: WordEntry[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE_WORDS, 'readwrite')
  const index = tx.store.index('by-lexicon-id')
  const keys = await index.getAllKeys(lexiconId)
  for (const key of keys) {
    await tx.store.delete(key)
  }
  for (const entry of entries) {
    await tx.store.put(entry)
  }
  await tx.done
}

export async function appendWordsForLexicon(
  lexiconId: string,
  entries: WordEntry[]
): Promise<number> {
  const db = await getDB()
  const tx = db.transaction(STORE_WORDS, 'readwrite')

  const existing = await tx.store.index('by-lexicon-id').getAll(lexiconId)
  const existingIds = new Set(existing.map((item) => item.id))

  let appended = 0
  for (const entry of entries) {
    if (!existingIds.has(entry.id)) {
      await tx.store.put(entry)
      appended += 1
    }
  }

  await tx.done
  return appended
}

export async function deleteWordsByLexiconId(lexiconId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE_WORDS, 'readwrite')
  const index = tx.store.index('by-lexicon-id')
  const keys = await index.getAllKeys(lexiconId)
  for (const key of keys) {
    await tx.store.delete(key)
  }
  await tx.done
}

export async function getAllLexicons(): Promise<LexiconSource[]> {
  const db = await getDB()
  return db.getAll(STORE_LEXICONS)
}

export async function putLexicon(lexicon: LexiconSource): Promise<void> {
  const db = await getDB()
  await db.put(STORE_LEXICONS, lexicon)
}

export async function deleteLexicon(lexiconId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([STORE_LEXICONS, STORE_WORDS], 'readwrite')
  await tx.objectStore(STORE_LEXICONS).delete(lexiconId)

  const wordStore = tx.objectStore(STORE_WORDS)
  const keys = await wordStore.index('by-lexicon-id').getAllKeys(lexiconId)
  for (const key of keys) {
    await wordStore.delete(key)
  }

  await tx.done
}

export async function getMeta(): Promise<LexiconMeta | undefined> {
  const db = await getDB()
  return db.get(STORE_META, 'main') as Promise<LexiconMeta | undefined>
}

export async function setMeta(meta: LexiconMeta): Promise<void> {
  const db = await getDB()
  await db.put(STORE_META, meta, 'main')
}
