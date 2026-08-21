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
const STORES = ['members', 'orders', 'prices', 'discounts'] as const

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
  return run(store, 'readwrite', (os) => os.put(item)).then(() => undefined)
}

export function add<T extends { id: string }>(store: string, item: T): Promise<void> {
  return run(store, 'readwrite', (os) => os.add(item)).then(() => undefined)
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
