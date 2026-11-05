/* رفيق القرآن — web version offline copy (registered by js/shell.js on the web only; the phone app loads from the APK).
   Every page and file is kept in a cache: pages open instantly and work with no internet. Each open also fetches a
   fresh copy in the background (stale-while-revalidate), so a new deploy shows up on the next open.
   VERSION is replaced by scripts/deploy-web.mjs on every deploy → the old cache is dropped. Google sign-in / Drive and
   EveryAyah audio are other sites: never cached, always from the network. */
const VERSION = "20261105124433";
const CACHE = "rafiq-" + VERSION;
const CORE = [
  "./", "index.html", "tafsir.html", "hifz.html", "privacy.html", "manifest.webmanifest",
  "js/shell.js", "js/native.js", "js/cloud.js", "js/web-config.js", "js/hifz-nav.js", "js/hifz-tajweed.js",
  "css/hifz-theme.css", "css/rafiq-fonts.css",
  "fonts/amiri-arabic-400-normal.woff2", "fonts/amiri-arabic-700-normal.woff2",
  "fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2", "fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2",
  "fonts/ibm-plex-sans-arabic-latin-400-normal.woff2", "fonts/ibm-plex-sans-arabic-latin-600-normal.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-192.png", "icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith("rafiq-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;           // Google, EveryAyah: network only
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const key = url.pathname.endsWith("/") ? new URL("./", location.href).href : req.url.split("#")[0].split("?")[0];
    const hit = await c.match(key);
    const fresh = fetch(req).then((res) => { if (res.ok && res.type === "basic") c.put(key, res.clone()); return res; });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }               // cached copy now, refresh in background
    return fresh;
  }));
});
