import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { META } from './src/meta.js';
import { attachSignaling } from './signaling.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(dir, 'dist');
const TTL = (+process.env.ROOM_TTL_MIN || 60) * 60000;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use((q, r, n) => { r.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); n(); });
app.get('/healthz', (q, r) => r.send('ok'));

/* Optional TURN relay. Sendit works without it: if a direct connection fails, files go through the server relay below. */
const iceHits = new Map();
setInterval(() => iceHits.clear(), 60000);
app.get('/api/ice', (q, r) => {
  const n = (iceHits.get(q.ip) || 0) + 1; iceHits.set(q.ip, n);
  if (n > 30) return r.status(429).json({ error: 'Too many requests.' });
  const s = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    const urls = process.env.TURN_URL.split(',').map(x => x.trim());
    if (process.env.TURN_SECRET) {
      const user = String(Math.floor(Date.now() / 1000) + 3600);
      s.push({ urls, username: user, credential: crypto.createHmac('sha1', process.env.TURN_SECRET).update(user).digest('base64') });
    } else s.push({ urls, username: process.env.TURN_USER, credential: process.env.TURN_PASS });
  }
  r.set('Cache-Control', 'no-store').json({ iceServers: s });
});

/* Contact and waitlist forms: saved to Postgres and/or emailed through Resend. */
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined })
  : null;
if (pool) pool.query(`create table if not exists submissions(id serial primary key, kind text not null, name text, email text not null, message text, created_at timestamptz not null default now())`).catch(e => console.error('db init', e.message));
const mailOn = !!(process.env.RESEND_API_KEY && process.env.CONTACT_TO);
async function notify(s) {
  if (!mailOn) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'Sendit <onboarding@resend.dev>', to: [process.env.CONTACT_TO], reply_to: s.email, subject: `Sendit ${s.kind}: ${s.name || s.email}`, text: `${s.name || ''}\n${s.email}\n\n${s.message || ''}` })
  });
  return r.ok;
}
const formHits = new Map();
setInterval(() => formHits.clear(), 60000);
for (const kind of ['contact', 'waitlist']) {
  app.post('/api/' + kind, async (q, r) => {
    const n = (formHits.get(q.ip) || 0) + 1; formHits.set(q.ip, n);
    if (n > 5) return r.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    const b = q.body || {};
    if (b.website) return r.json({ ok: true }); // honeypot
    const s = { kind, name: String(b.n || '').trim().slice(0, 100), email: String(b.e || '').trim().slice(0, 200), message: String(b.m || '').trim().slice(0, 3000) };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email) || (kind === 'contact' && !s.message)) return r.status(400).json({ error: 'Please check your details and try again.' });
    if (!pool && !mailOn) return r.status(503).json({ error: 'This form is not set up yet. Please try again later.' });
    let ok = false;
    try { if (pool) { await pool.query('insert into submissions(kind,name,email,message) values($1,$2,$3,$4)', [s.kind, s.name, s.email, s.message]); ok = true; } } catch (e) { console.error('db', e.message); }
    try { if (await notify(s)) ok = true; } catch (e) { console.error('mail', e.message); }
    ok ? r.json({ ok: true }) : r.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
}
app.post('/share', (q, r) => r.redirect(303, '/workspace')); // fallback when the service worker is not active

/* Pages: per-route title, description and social tags are injected into the HTML. */
const site = q => process.env.SITE_URL || `${q.protocol}://${q.get('host')}`;
app.get('/robots.txt', (q, r) => r.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${site(q)}/sitemap.xml\n`));
app.get('/sitemap.xml', (q, r) => {
  const urls = Object.keys(META).filter(p => p !== '/404').map(p => `<url><loc>${site(q)}${p === '/' ? '' : p}</loc></url>`).join('');
  r.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});
app.use(express.static(dist, { index: false }));
let html = ''; try { html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8'); } catch (e) {}
app.get('*', (q, r) => {
  const p = q.path.replace(/\/+$/, '') || '/';
  const m = META[p], mm = m || META['/404'], base = site(q);
  const tags = `<link rel="canonical" href="${base}${p === '/' ? '' : p}"><meta property="og:type" content="website"><meta property="og:site_name" content="Sendit"><meta property="og:title" content="${mm.title}"><meta property="og:description" content="${mm.desc}"><meta property="og:url" content="${base}${p === '/' ? '' : p}"><meta property="og:image" content="${base}/og.png"><meta name="twitter:card" content="summary_large_image">${m ? '' : '<meta name="robots" content="noindex">'}`;
  const out = html.replace(/<title>.*?<\/title>/, `<title>${mm.title}</title>`).replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${mm.desc}">`).replace('<!--HEAD-->', m ? tags : tags.replace(/<link rel="canonical"[^>]*>/, ''));
  r.status(m ? 200 : 404).type('html').send(out);
});

/* Signaling */
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 1e5 });
attachSignaling(io, { ttl: TTL, wait: (+process.env.ROOM_WAIT_MIN || 10) * 60000 });
http.listen(process.env.PORT || 3000, () => console.log('Sendit listening on', process.env.PORT || 3000));
