import type { Dataset } from "./types";

const DB_NAME = "independent-games-db";
const STORE_NAME = "cache";
const DB_VERSION = 1;
const DATASET_KEY = "dataset";

const memory = new Map<string, unknown>();
let database: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (!database) {
    database = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  return database;
}

function read<T>(store: IDBObjectStore, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

function write(store: IDBObjectStore, key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export async function readDatasetCache(): Promise<Dataset | null> {
  const db = await openDatabase();
  if (!db) return (memory.get(DATASET_KEY) as Dataset | undefined) ?? null;

  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    return await read<Dataset>(transaction.objectStore(STORE_NAME), DATASET_KEY);
  } catch {
    return null;
  }
}

export async function writeDatasetCache(dataset: Dataset): Promise<void> {
  memory.set(DATASET_KEY, dataset);
  const db = await openDatabase();
  if (!db) return;

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    await write(transaction.objectStore(STORE_NAME), DATASET_KEY, dataset);
  } catch {
    // Cache failures are not fatal: the dataset still lives in memory.
  }
}
