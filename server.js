import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { META } from './src/meta.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(dir, 'dist');
const TTL = (+process.env.ROOM_TTL_MIN || 60) * 60000;
const CODE = /^[A-Z]{3,8}-[A-Z]{3,8}-\d{4}$/;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use((q, r, n) => { r.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); n(); });
app.get('/healthz', (q, r) => r.send('ok'));

/* ICE servers. Options, in priority order:
   1. Cloudflare Realtime TURN (CF_TURN_KEY_ID and CF_TURN_API_TOKEN): short-lived credentials minted per request
   2. TURN_URL with TURN_SECRET (your own coturn) or TURN_USER and TURN_PASS (any hosted TURN service) */
const CF_ID = process.env.CF_TURN_KEY_ID, CF_TOKEN = process.env.CF_TURN_API_TOKEN;
async function cloudflareServers() {
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 7200 })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  // Browsers block port 53, so drop those URLs to avoid waiting for a timeout.
  return (Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers]).map(x => ({ ...x, urls: [].concat(x.urls).filter(u => !/:53(\?|$)/.test(u)) }));
}
const iceHits = new Map();
setInterval(() => iceHits.clear(), 60000);
app.get('/api/ice', async (q, r) => {
  const n = (iceHits.get(q.ip) || 0) + 1; iceHits.set(q.ip, n);
  if (n > 30) return r.status(429).json({ error: 'Too many requests.' });
  let s = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (CF_ID && CF_TOKEN) {
    try { s = await cloudflareServers(); } catch (e) { console.error('cloudflare turn:', e.message); }
  } else if (process.env.TURN_URL) {
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
const rooms = new Map();
const hits = new Map();
setInterval(() => hits.clear(), 60000);
const limited = s => {
  const ip = (s.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim() || s.handshake.address;
  const n = (hits.get(ip) || 0) + 1; hits.set(ip, n); return n > 30;
};
function leave(s) {
  const c = s.data.code; if (!c) return;
  s.leave(c); s.data.code = null;
  const r = rooms.get(c); if (!r) return;
  r.m.delete(s.id); io.to(c).emit('peer-left');
  if (!r.m.size) { clearTimeout(r.t); rooms.delete(c); }
}
function expire(c) { io.to(c).emit('expired'); io.in(c).disconnectSockets(true); rooms.delete(c); }
io.on('connection', s => {
  s.on('join', code => {
    if (typeof code !== 'string' || !CODE.test(code)) return s.emit('err', 'That room code is not valid.');
    if (limited(s)) return s.emit('err', 'Too many attempts. Wait a minute and try again.');
    leave(s);
    let r = rooms.get(code);
    if (!r) { r = { m: new Set(), t: setTimeout(() => expire(code), TTL) }; rooms.set(code, r); }
    if (r.m.size >= 2) return s.emit('err', 'That room is full.');
    r.m.add(s.id); s.data.code = code; s.join(code);
    if (r.m.size === 2) { const [a, b] = [...r.m]; io.to(a).emit('ready', { initiator: true }); io.to(b).emit('ready', { initiator: false }); }
  });
  s.on('signal', m => { if (s.data.code) s.to(s.data.code).emit('signal', m); });
  s.on('disconnect', () => leave(s));
});
http.listen(process.env.PORT || 3000, () => console.log('Sendit listening on', process.env.PORT || 3000));
