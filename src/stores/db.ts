/**
 * 存储层 — 基于 IndexedDB 的零依赖封装。
 *
 * 所有读写均为异步，对外暴露与调用方约定一致的接口：
 *   getAll<T>(store) → T[]
 *   put<T>(store, item) → void   （按 id 覆盖写）
 *   add<T>(store, item) → void   （按 id 新增，重复则报错）
 *   del(store, id)   → void
 */

import { version } from '@/../package.json'

const DB_NAME = 'hobby-earn-db'
const DB_VERSION = 1
const STORES = [
  'members',
  'orders',
  'prices',
  'discounts',
  'memberTypes',
  'exclusiveGroups',
  'categories',
  'limitGroups',
] as const

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
  return dbPromise
}

/**
 * 递归剥离 undefined，避免 IndexedDB structured clone 在部分实现下抛 DataCloneError。
 * 同时把 NaN 也剔除（NaN 无法被索引/序列化稳定保存）。
 */
function sanitize<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => sanitize(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined && !(typeof v === 'number' && Number.isNaN(v))) out[k] = sanitize(v)
    }
    return out as T
  }
  return value
}

/**
 * 在单个事务中执行一个请求并返回其结果。
 * 请求被同步创建并注册回调，事务不会提前提交，确保可靠。
 */
function run<T>(
  store: string,
  mode: IDBTransactionMode,
  exec: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const os = tx.objectStore(store)
        const req = exec(os)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'))
      }),
  )
}

export function getAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, 'readonly', (os) => os.getAll() as IDBRequest<T[]>)
}

export function put<T>(store: string, item: T): Promise<void> {
  return run(store, 'readwrite', (os) => os.put(sanitize(item))).then(() => undefined)
}

export function add<T extends { id: string }>(store: string, item: T): Promise<void> {
  return run(store, 'readwrite', (os) => os.add(sanitize(item))).then(() => undefined)
}

export function del(store: string, id: string): Promise<void> {
  return run(store, 'readwrite', (os) => os.delete(id)).then(() => undefined)
}

export function clear(): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES as unknown as string[], 'readwrite')
        for (const name of STORES) tx.objectStore(name).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 清空失败'))
      }),
  )
}

/** 备份文件结构 */
export interface BackupData {
  app: 'hobby-earn'
  version: string
  exportedAt: string
  stores: Record<string, unknown[]>
}

/** 导出全部业务数据为备份对象 */
export async function exportAll(): Promise<BackupData> {
  const stores: Record<string, unknown[]> = {}
  for (const s of STORES) stores[s] = await getAll(s)
  return { app: 'hobby-earn', version, exportedAt: new Date().toISOString(), stores }
}

/** 清空单个对象仓库（用于导入覆盖前清理） */
export function clearStore(store: string): Promise<void> {
  return run(store, 'readwrite', (os) => os.clear()).then(() => undefined)
}

/**
 * 导入备份数据：按 store 覆盖写入（先清空该 store 再批量 put）。
 * 校验文件来源，结构不符直接抛错。
 */
export async function importAll(data: BackupData): Promise<void> {
  if (data?.app !== 'hobby-earn' || !data.stores) throw new Error('备份文件格式不支持')
  for (const s of STORES) {
    const items = (data.stores[s] ?? []) as Array<Record<string, unknown> & { id: string }>
    await clearStore(s)
    for (const it of items) await put(s, it)
  }
}

/** 稳定序列化（排序键），用于判断两条记录内容是否一致（忽略 key 顺序） */
function stabilize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stabilize)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort())
      o[k] = stabilize((v as Record<string, unknown>)[k])
    return o
  }
  return v
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(stabilize(a)) === JSON.stringify(stabilize(b))
}

/** 单条冲突：同一 id 在内置库与导入数据中均存在且内容不同 */
export interface MergeConflict {
  store: string
  id: string
}

/** 检测导入数据与当前库之间的冲突（不写入）。返回所有冲突项。 */
export async function detectMergeConflicts(data: BackupData): Promise<MergeConflict[]> {
  if (data?.app !== 'hobby-earn' || !data.stores) throw new Error('备份文件格式不支持')
  const conflicts: MergeConflict[] = []
  for (const s of STORES) {
    const importedById = new Map(
      ((data.stores[s] ?? []) as Array<Record<string, unknown> & { id: string }>).map((it) => [it.id, it]),
    )
    const builtinItems = await getAll<Record<string, unknown> & { id: string }>(s)
    for (const b of builtinItems) {
      const imp = importedById.get(b.id)
      if (imp && !deepEqual(b, imp)) conflicts.push({ store: s, id: b.id })
    }
  }
  return conflicts
}

export interface MergeOptions {
  /** true=完全覆盖（清空后写入导入，等同旧导入行为）；false=半保留合并 */
  overwrite: boolean
  /** 半保留合并时，冲突项以哪侧为准：'builtin' 跳过导入冲突项；'imported' 用导入覆盖 */
  base: 'builtin' | 'imported'
}

/**
 * 合并导入数据到当前库。
 * - overwrite：清空每个 store 后写入导入，丢弃内置独有数据（强行覆盖）。
 * - 半保留合并：遍历导入项，无冲突（内置无此 id 或内容相同）的项写入；冲突项按 base 决定保留哪侧；
 *   内置独有项始终保留（不删除）。
 */
export async function mergeAll(data: BackupData, opts: MergeOptions): Promise<void> {
  if (data?.app !== 'hobby-earn' || !data.stores) throw new Error('备份文件格式不支持')
  for (const s of STORES) {
    const importedItems = (data.stores[s] ?? []) as Array<Record<string, unknown> & { id: string }>
    if (opts.overwrite) {
      await clearStore(s)
      for (const it of importedItems) await put(s, it)
      continue
    }
    const importedById = new Map(importedItems.map((it) => [it.id, it]))
    const builtinItems = await getAll<Record<string, unknown> & { id: string }>(s)
    const builtinById = new Map(builtinItems.map((it) => [it.id, it]))
    for (const [id, imp] of importedById) {
      const built = builtinById.get(id)
      const isConflict = built !== undefined && !deepEqual(built, imp)
      if (isConflict) {
        if (opts.base === 'imported') await put(s, imp)
        // base === 'builtin'：保留内置，跳过导入冲突项（不写入）
      } else {
        await put(s, imp) // 新增或无变化项，合并进来
      }
    }
    // 内置独有项无需处理，保持保留
  }
}
