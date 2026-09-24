/* sw.js —— Service Worker：预缓存 app shell + vendor 库，cache-first
 * 注意：仅预缓存清单内资源走缓存，其余请求直连网络（避免旧文件长期滞留）。
 * 更新应用文件后须 bump CACHE 版本号，旧缓存才会被清除。 */
var CACHE = 'accounting-v9';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/money.js',
  './js/db.js',
  './js/ui.js',
  './js/stats.js',
  './js/loader.js',
  './js/page-entries.js',
  './js/page-add.js',
  './js/page-statement.js',
  './js/page-debts.js',
  './js/app.js',
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
