import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(dir, 'dist');
const TTL = (+process.env.ROOM_TTL_MIN || 60) * 60000;

const app = express();
app.disable('x-powered-by');
app.use((q, r, n) => { r.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); n(); });
app.get('/healthz', (q, r) => r.send('ok'));
app.get('/api/ice', (q, r) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) iceServers.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER, credential: process.env.TURN_PASS });
  r.set('Cache-Control', 'no-store').json({ iceServers });
});
app.use(express.static(dist));
app.get('*', (q, r) => r.sendFile(path.join(dist, 'index.html')));

const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 1e5 });
const rooms = new Map(); // code -> { m: Set<socketId>, t: Timeout }
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
function expire(c) {
  io.to(c).emit('expired');
  io.in(c).disconnectSockets(true);
  rooms.delete(c);
}

io.on('connection', s => {
  s.on('join', code => {
    if (typeof code !== 'string' || !/^[A-Z]{3,8}-\d{4}$/.test(code)) return s.emit('err', 'That room code is not valid.');
    if (limited(s)) return s.emit('err', 'Too many attempts. Wait a minute and try again.');
    leave(s);
    let r = rooms.get(code);
    if (!r) { r = { m: new Set(), t: setTimeout(() => expire(code), TTL) }; rooms.set(code, r); }
    if (r.m.size >= 2) return s.emit('err', 'That room is full.');
    r.m.add(s.id); s.data.code = code; s.join(code);
    if (r.m.size === 2) {
      const [a, b] = [...r.m];
      io.to(a).emit('ready', { initiator: true });
      io.to(b).emit('ready', { initiator: false });
    }
  });
  s.on('signal', m => { if (s.data.code) s.to(s.data.code).emit('signal', m); });
  s.on('disconnect', () => leave(s));
});

http.listen(process.env.PORT || 3000, () => console.log('Sendit listening on', process.env.PORT || 3000));
