/**
 * In-memory stand-in for the Firestore compat API used by data-layer.js.
 * Works in Node (require) and in the browser (window.FakeFirestore).
 * Test hooks: db.failWrites = Error  -> every write rejects with it
 *             db.hang = true         -> writes never settle (offline-like)
 * Batches over 500 operations are rejected, like the real SDK.
 */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.FakeFirestore = lib;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);

  function deepMerge(target, src) {
    const out = { ...target };
    for (const [k, v] of Object.entries(src)) {
      out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : clone(v);
    }
    return out;
  }

  function createFakeFirestore() {
    const store = new Map();
    const listeners = [];
    const db = { _store: store, failWrites: null, hang: false };

    const parent = (path) => path.slice(0, path.lastIndexOf('/'));
    const notify = () => listeners.slice().forEach((l) => l.fire());

    function docSnap(path) {
      const has = store.has(path);
      return {
        id: path.split('/').pop(),
        exists: has,
        data: () => (has ? clone(store.get(path)) : undefined),
        ref: docRef(path),
      };
    }

    function colSnap(path) {
      const docs = [...store.keys()].filter((k) => parent(k) === path).map(docSnap);
      return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
    }

    function guardWrite() {
      if (db.failWrites) return Promise.reject(db.failWrites);
      if (db.hang) return new Promise(() => {});
      return null;
    }

    function applySet(path, data, opts) {
      const cur = store.get(path) || {};
      if (opts && opts.mergeFields) {
        const next = { ...cur };
        opts.mergeFields.forEach((f) => { if (f in data) next[f] = clone(data[f]); });
        store.set(path, next);
      } else if (opts && opts.merge) {
        store.set(path, deepMerge(cur, data));
      } else {
        store.set(path, clone(data));
      }
    }

    function subscribe(read, cb) {
      const l = { fire: () => cb(read()) };
      listeners.push(l);
      Promise.resolve().then(() => { if (listeners.includes(l)) l.fire(); });
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    }

    function docRef(path) {
      return {
        id: path.split('/').pop(),
        path,
        get: () => Promise.resolve(docSnap(path)),
        set(data, opts) {
          const g = guardWrite();
          if (g) return g;
          applySet(path, data, opts);
          notify();
          return Promise.resolve();
        },
        delete() {
          const g = guardWrite();
          if (g) return g;
          store.delete(path);
          notify();
          return Promise.resolve();
        },
        collection: (name) => colRef(path + '/' + name),
        onSnapshot: (cb) => subscribe(() => docSnap(path), cb),
      };
    }

    function colRef(path) {
      return {
        path,
        doc: (id) => docRef(path + '/' + id),
        get: () => Promise.resolve(colSnap(path)),
        onSnapshot: (cb) => subscribe(() => colSnap(path), cb),
      };
    }

    db.collection = (name) => colRef(name);
    db.batch = () => {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push(() => applySet(ref.path, data, opts)),
        delete: (ref) => ops.push(() => store.delete(ref.path)),
        commit() {
          if (ops.length > 500) return Promise.reject(new Error('Firestore batch limit: max 500 operations'));
          const g = guardWrite();
          if (g) return g;
          ops.forEach((op) => op());
          notify();
          return Promise.resolve();
        },
      };
    };
    db.enablePersistence = () => Promise.resolve();
    db.terminate = () => Promise.resolve();
    db.clearPersistence = () => Promise.resolve();
    return db;
  }

  return { createFakeFirestore };
});
