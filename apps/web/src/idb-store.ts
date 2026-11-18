/** SaveStore em IndexedDB (funciona na página e no Worker). Mesmo contrato do MemoryStore. */
import type { SaveStore } from '@sm/core';

const DB = 'soccer-manager';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? req.error);
        };
      }),
  );
}

export class IdbStore implements SaveStore {
  async get(key: string): Promise<string | null> {
    return (await run<string | undefined>('readonly', (s) => s.get(key) as IDBRequest<string | undefined>)) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    await run('readwrite', (s) => s.put(value, key));
  }
  async delete(key: string): Promise<void> {
    await run('readwrite', (s) => s.delete(key));
  }
}
