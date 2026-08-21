/**
 * 存储层 — 基于 IndexedDB 的零依赖封装。
 *
 * 所有读写均为异步，对外暴露与调用方约定一致的接口：
 *   getAll<T>(store) → T[]
 *   put<T>(store, item) → void   （按 id 覆盖写）
 *   add<T>(store, item) → void   （按 id 新增，重复则报错）
 *   del(store, id)   → void
 */

const DB_NAME = 'hobby-earn-db'
const DB_VERSION = 1
const STORES = ['members', 'orders', 'prices', 'discounts', 'memberTypes'] as const

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
