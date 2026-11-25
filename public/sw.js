// Receives files shared into Sendit from other apps (Web Share Target) and hands them to the page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.pathname === '/share') {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const c = await caches.open('share'); let i = 0;
        for (const f of fd.getAll('files')) {
          if (f && f.name !== undefined) await c.put('/share-file/' + (i++), new Response(f, { headers: { 'x-name': encodeURIComponent(f.name), 'content-type': f.type || 'application/octet-stream' } }));
        }
      } catch (x) {}
      return Response.redirect('/workspace?shared=1', 303);
    })());
  }
});
