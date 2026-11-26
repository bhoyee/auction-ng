/* global self, Response */
// Network only: never cache staff pages, passes, API responses or credentials.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pickup is offline</title><body><h1>Reconnect to use Pickup</h1><p>Check-in and collection require a connection. No items have been marked collected.</p><a href="/pickup/desk">Try again</a></body></html>',
          {
            status: 503,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          },
        ),
    ),
  );
});
