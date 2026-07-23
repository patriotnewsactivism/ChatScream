// ChatScream Service Worker v3 â NUCLEAR UNREGISTER
// Strategy: install immediately, activate immediately, nuke all caches, unregister.
// Never navigate/reload clients. Never intercept fetch. Pure cleanup.

const SW_VERSION = 'v3';

self.addEventListener('install', (event) => {
  // Skip waiting so this SW activates immediately (replaces any old SW fast)
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Delete all caches
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));

      // 2. Claim all clients so we control them immediately
      await self.clients.claim();

      // 3. Unregister self â we don't want a SW at all
      await self.registration.unregister();

      // 4. Tell each client to reload ONCE using a postMessage
      //    The client checks a localStorage flag to prevent loop
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_ACTIVATED_RELOAD', version: SW_VERSION });
      });
    })()
  );
});

// Do NOT intercept fetch â we want the browser to go direct to network always
