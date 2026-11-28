// Keeps Sendit usable offline after one visit, and receives files shared into Sendit from other apps.
const C = 'sendit-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method === 'POST' && u.pathname === '/share') {
    e.respondWith((async () => {
      try {
        const fd = await r.formData();
        const c = await caches.open('share'); let i = 0;
        for (const f of fd.getAll('files')) {
          if (f && f.name !== undefined) await c.put('/share-file/' + (i++), new Response(f, { headers: { 'x-name': encodeURIComponent(f.name), 'content-type': f.type || 'application/octet-stream' } }));
        }
      } catch (x) {}
      return Response.redirect('/workspace?shared=1', 303);
    })());
    return;
  }
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/socket.io/')) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(r);
      if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(C).then(c => c.put(r.mode === 'navigate' ? '/' : r, copy)).catch(() => {}); }
      return res;
    } catch (x) {
      const c = await caches.open(C);
      return (await c.match(r)) || (r.mode === 'navigate' ? await c.match('/') : undefined) || Response.error();
    }
  })());
});
