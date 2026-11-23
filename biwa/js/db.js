// 端末内の保存（IndexedDB）。本の情報(books)と本文(contents)を分けて保存する。
const DB_NAME = "hanabiwa-bunko";
const VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("books")) db.createObjectStore("books", { keyPath: "id" });
        if (!db.objectStoreNames.contains("contents")) db.createObjectStore("contents", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("保存に失敗しました（容量不足の可能性があります）"));
  });
}

export const db = {
  allBooks: () => run("books", "readonly", (s) => s.getAll()),
  getBook: (id) => run("books", "readonly", (s) => s.get(id)),
  putBook: (b) => run("books", "readwrite", (s) => s.put(b)),
  getContent: (id) => run("contents", "readonly", (s) => s.get(id)),
  putContent: (c) => run("contents", "readwrite", (s) => s.put(c)),
  allContents: () => run("contents", "readonly", (s) => s.getAll()),
  async deleteBook(id) {
    await run("books", "readwrite", (s) => s.delete(id));
    await run("contents", "readwrite", (s) => s.delete(id));
  },
  async clearAll() {
    await run("books", "readwrite", (s) => s.clear());
    await run("contents", "readwrite", (s) => s.clear());
  },
};

// ブラウザに「消さないで」とお願いしておく（対応ブラウザのみ）
export function requestPersist() {
  try { navigator.storage?.persist?.(); } catch { /* noop */ }
}
