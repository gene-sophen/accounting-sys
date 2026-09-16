/* db.js —— IndexedDB 轻量 Promise 封装
 * stores: bill_sets(id,name,created_at)
 *         entries(id,set_id,date,vehicle,qty_ml,price_fen,note,created_at) index: set_id
 *         settings(key,value) —— 各类记忆
 */
(function (global) {
  'use strict';

  var DB_NAME = 'accounting-db';
  var DB_VERSION = 1;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('bill_sets')) {
          db.createObjectStore('bill_sets', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('entries')) {
          var st = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
          st.createIndex('set_id', 'set_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(storeNames, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(storeNames, mode);
        var result;
        Promise.resolve(fn(t)).then(function (r) { result = r; });
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  var DB = {
    // ---- bill_sets ----
    addSet: function (name) {
      return tx(['bill_sets'], 'readwrite', function (t) {
        return reqToPromise(t.objectStore('bill_sets').add({ name: name, created_at: Date.now() }));
      });
    },
    updateSet: function (id, name) {
      return tx(['bill_sets'], 'readwrite', function (t) {
        var st = t.objectStore('bill_sets');
        return reqToPromise(st.get(id)).then(function (row) {
          if (!row) return;
          row.name = name;
          return reqToPromise(st.put(row));
        });
      });
    },
    deleteSet: function (id) {
      // 级联删除该集全部条目及相关设置
      return tx(['bill_sets', 'entries', 'settings'], 'readwrite', function (t) {
        t.objectStore('bill_sets').delete(id);
        var idx = t.objectStore('entries').index('set_id');
        return reqToPromise(idx.getAll(IDBKeyRange.only(id))).then(function (rows) {
          var st = t.objectStore('entries');
          rows.forEach(function (r) { st.delete(r.id); });
          var sst = t.objectStore('settings');
          ['layout:' + id, 'format:' + id, 'doc:' + id, 'cols:' + id + ':date', 'cols:' + id + ':vehicle']
            .forEach(function (k) { sst.delete(k); });
        });
      });
    },
    listSets: function () {
      return tx(['bill_sets'], 'readonly', function (t) {
        return reqToPromise(t.objectStore('bill_sets').getAll());
      }).then(function (rows) {
        rows.sort(function (a, b) { return a.created_at - b.created_at; });
        return rows;
      });
    },

    // ---- entries ----
    addEntry: function (entry) {
      entry.created_at = Date.now();
      if (entry.note == null) entry.note = '';
      return tx(['entries'], 'readwrite', function (t) {
        return reqToPromise(t.objectStore('entries').add(entry));
      });
    },
    updateEntry: function (entry) {
      return tx(['entries'], 'readwrite', function (t) {
        return reqToPromise(t.objectStore('entries').put(entry));
      });
    },
    deleteEntry: function (id) {
      return tx(['entries'], 'readwrite', function (t) {
        t.objectStore('entries').delete(id);
      });
    },
    listEntries: function (setId) {
      return tx(['entries'], 'readonly', function (t) {
        return reqToPromise(t.objectStore('entries').index('set_id').getAll(IDBKeyRange.only(setId)));
      }).then(function (rows) {
        // 同分组内按录入时间排序，保证顺序稳定
        rows.sort(function (a, b) { return (a.created_at - b.created_at) || (a.id - b.id); });
        return rows;
      });
    },

    // ---- settings ----
    getSetting: function (key) {
      return tx(['settings'], 'readonly', function (t) {
        return reqToPromise(t.objectStore('settings').get(key));
      }).then(function (row) { return row ? row.value : undefined; });
    },
    setSetting: function (key, value) {
      return tx(['settings'], 'readwrite', function (t) {
        t.objectStore('settings').put({ key: key, value: value });
      });
    }
  };

  global.DB = DB;
})(window);
