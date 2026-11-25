const CACHE = "walking-bible-v12";
const CDN_HOST = "cdn.jsdelivr.net";
const CDN_PATHS = ["/gh/orioncactus/pretendard@", "/npm/@supabase/supabase-js@"];
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/src/night.svg?v=2"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch("/", { cache: "no-store" });
    const html = await page.clone().text();
    await cache.put("/", page);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\?v=\d+)"/g)].map((m) => new URL(m[1], self.location.origin).href);
    await cache.addAll([...new Set([...SHELL.slice(1), ...assets])]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fromNetwork(request, key) {
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(CACHE);
    cache.put(key || request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const local = url.origin === self.location.origin;

  if (request.mode === "navigate" && local) {
    event.respondWith(fromNetwork(request, "/").catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }
  if (local && url.pathname.startsWith("/api/")) return;
  if (!local && !(url.host === CDN_HOST && CDN_PATHS.some((path) => url.pathname.startsWith(path)))) return;
  if (local && url.pathname === "/sw.js") return;

  event.respondWith((async () => {
    const hit = await caches.match(request);
    if (hit) return hit;
    return fromNetwork(request);
  })());
});
