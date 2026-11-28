// Room pairing and relay for Sendit. Takes any Socket.IO server object, so it can be tested without a network.
const CODE = /^[A-Z]{3,8}-\d{4}$/;

export function attachSignaling(io, { ttl, wait }) {
  // room: { m: Set(socketId) approved members, owner: socketId|null, dev: owner device token,
  //         ok: Set(device tokens the owner approved), pending: {id, dev}|null, t: timer }
  const rooms = new Map(), hits = new Map(), fails = new Map();
  setInterval(() => hits.clear(), 60000);
  setInterval(() => fails.clear(), 300000);
  const ipOf = s => (s.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim() || s.handshake.address;
  const limited = s => { const ip = ipOf(s), n = (hits.get(ip) || 0) + 1; hits.set(ip, n); return n > 30; };
  const failed = s => { const ip = ipOf(s); fails.set(ip, (fails.get(ip) || 0) + 1); };
  const blocked = s => (fails.get(ipOf(s)) || 0) >= 8;

  // A room nobody has joined closes after `wait`; a room with two devices closes after `ttl`.
  function arm(c) {
    const r = rooms.get(c); if (!r) return;
    clearTimeout(r.t); r.t = setTimeout(() => expire(c), r.m.size >= 2 ? ttl : wait);
  }
  function expire(c) { io.to(c).emit('expired'); io.in(c).disconnectSockets(true); rooms.delete(c); }
  function admit(c, s) {
    const r = rooms.get(c);
    r.m.add(s.id); r.pending = null; s.data.code = c; s.data.pend = null; s.join(c);
    s.emit('joined', { n: r.m.size });
    if (r.m.size === 2) { const [a, b] = [...r.m]; io.to(a).emit('ready', { initiator: true }); io.to(b).emit('ready', { initiator: false }); }
    arm(c);
  }
  function leave(s) {
    const p = s.data.pend;
    if (p) {
      const r = rooms.get(p);
      if (r && r.pending && r.pending.id === s.id) { r.pending = null; if (r.owner) io.to(r.owner).emit('join-cancel'); }
      s.data.pend = null;
    }
    const c = s.data.code; if (!c) return;
    s.leave(c); s.data.code = null;
    const r = rooms.get(c); if (!r) return;
    r.m.delete(s.id); if (r.owner === s.id) r.owner = null;
    io.to(c).emit('peer-left');
    if (!r.m.size) { clearTimeout(r.t); rooms.delete(c); } else arm(c);
  }

  io.on('connection', s => {
    s.on('join', m => {
      const code = m && m.code, create = !!(m && m.create), dev = typeof (m && m.dev) === 'string' ? m.dev.slice(0, 32) : '';
      if (typeof code !== 'string' || !CODE.test(code)) return s.emit('err', 'That room code is not valid.');
      if (limited(s)) return s.emit('err', 'Too many attempts. Wait a minute and try again.');
      if (blocked(s)) return s.emit('err', 'Too many wrong codes. Wait a few minutes and try again.');
      leave(s);
      let r = rooms.get(code);
      if (!r) {
        if (!create) { failed(s); return s.emit('err', 'That code is not active. Check it and try again.'); }
        r = { m: new Set(), owner: null, dev, ok: new Set(), pending: null, t: null }; rooms.set(code, r);
      }
      if (create) { // the device that made the code
        if (r.dev !== dev) return s.emit('taken');
        r.owner = s.id; return admit(code, s);
      }
      // a device joining someone else's code needs the owner's approval
      if (r.m.size >= 2) return s.emit('err', 'That room is full.');
      if (dev && r.ok.has(dev)) return admit(code, s);
      if (!r.owner) return s.emit('err', 'The other device is not online right now.');
      if (r.pending) return s.emit('err', 'Someone else is asking to join. Try again in a moment.');
      r.pending = { id: s.id, dev }; s.data.pend = code;
      s.emit('joined', { n: 1, pending: true });
      io.to(r.owner).emit('join-request');
    });
    s.on('allow', ok => {
      const c = s.data.code, r = c && rooms.get(c);
      if (!r || r.owner !== s.id || !r.pending) return;
      const g = io.sockets.sockets.get(r.pending.id), dev = r.pending.dev; r.pending = null;
      if (!g) return;
      g.data.pend = null;
      if (ok) { if (dev) r.ok.add(dev); admit(c, g); } else g.emit('err', 'The other device declined the connection.');
    });
    s.on('signal', m => { if (s.data.code) s.to(s.data.code).emit('signal', m); });
    // Server relay: forwards end-to-end encrypted chunks between the two devices. The server cannot read them.
    s.on('relay', (d, ack) => { if (s.data.code && d) s.to(s.data.code).emit('relay', d); if (typeof ack === 'function') ack(); });
    s.on('bye', () => leave(s));
    s.on('disconnect', () => leave(s));
  });
}
