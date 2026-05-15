// ChatScream Service Worker — UNREGISTER SELF
// Silently unregisters and clears caches on activate.
// Does NOT navigate/reload clients — that causes infinite reload loops.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.registration.unregister())
    // No client.navigate() — that causes the infinite reload loop
  );
});
