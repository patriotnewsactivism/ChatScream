// Service Worker
// Existing service worker logic (install, activate, fetch handlers) is preserved below.
// ------------------------------------------------------------
// NOTE: Do NOT modify existing handlers unless necessary. The following addition
// listens for the browser's online event and notifies all controlled client
// windows that the network connection has been restored.

self.addEventListener('online', () => {
  // Notify each client (window) that the connection is back online.
  // The client can then flush any queued offline messages.
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
    for (const client of clients) {
      client.postMessage({ type: 'SW_ONLINE' });
    }
  }).catch((err) => {
    // Log the error but do not disrupt the service worker lifecycle.
    console.error('Error broadcasting online event to clients:', err);
  });
});

// ------------------------------------------------------------
// Existing service worker code (install, activate, fetch, etc.) should remain
// unchanged above this comment. If the file previously contained only the
// default Workbox or caching logic, the addition above will simply augment it
// without affecting its original behavior.
