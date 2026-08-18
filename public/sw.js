// Synapse Notes Service Worker (v1.0.0)
const CACHE_NAME = "synapse-notes-v1";
const STATIC_ASSETS = [
  "/",
  "/login",
  "/manifest.json",
  "/favicon.ico",
  "/favicon.png",
  "/synapse-logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Install: pre-cache critical app shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("PWA pre-cache warning:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up outdated caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy:
// 1. Static assets & fonts: Cache-first with network fallback
// 2. API / Navigation requests: Network-first with cache fallback
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass non-GET requests and chrome-extension / MCP urls
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // Static assets & CDN fonts: Cache-First
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // If both fail, return empty or fallback
          return caches.match("/");
        });
      })
    );
    return;
  }

  // Navigation & Page API requests: Network-First with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Cache page HTML for offline access
            if (request.mode === "navigate" || url.pathname.startsWith("/notebook/")) {
              cache.put(request, responseToCache);
            }
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        
        // If navigating to notebook while offline, fallback to root/cached page
        if (request.mode === "navigate") {
          const fallback = await caches.match("/");
          if (fallback) return fallback;
        }

        return new Response(JSON.stringify({ error: "Offline mode", offline: true }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      })
  );
});
