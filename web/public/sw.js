/* RootGraph Service Worker：离线可用 + 在线自动更新（stale-while-revalidate） */
// 数据大改后升版本号：浏览器检测到 sw.js 变化→装新 SW→activate 时删除旧缓存（见下方 keys 过滤）
const CACHE = 'rootgraph-v6';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 数据/静态资源：缓存优先 + 后台刷新（离线可学，在线时数据自动更新）
  if (url.pathname.startsWith('/data/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      }),
    );
    return;
  }

  // 页面：网络优先（保证新版本立即可见），离线时回退缓存
  if (req.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html'))),
    );
  }
});
