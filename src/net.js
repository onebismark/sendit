import { io } from 'socket.io-client';

const CHUNK = 16 * 1024; // safe across browsers
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = o => JSON.stringify(o);

export function createNet(cb) {
  let sock = null, pc = null, dc = null, pcp = null, cur = null, relay = false, ice = null, cid = null;
  const q = [], rx = new Map();

  async function servers() {
    if (!ice) {
      try { ice = (await (await fetch('/api/ice')).json()).iceServers; }
      catch (e) { ice = [{ urls: 'stun:stun.l.google.com:19302' }]; }
    }
    return ice;
  }
  function close() {
    const d = dc, p = pc; dc = pc = pcp = null; rx.clear();
    try { d && d.close(); } catch (e) {}
    try { p && p.close(); } catch (e) {}
  }
  async function route() {
    try {
      const st = await pc.getStats(); let r = 'Direct';
      st.forEach(s => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated) {
          const l = st.get(s.localCandidateId);
          if (l && l.candidateType === 'relay') r = 'Relay';
        }
      });
      return r;
    } catch (e) { return 'Direct'; }
  }
  function setup(ch) {
    dc = ch; ch.binaryType = 'arraybuffer'; ch.bufferedAmountLowThreshold = 1 << 18;
    ch.onopen = async () => cb.state('open', await route());
    ch.onclose = () => { if (dc === ch) cb.state('lost'); };
    ch.onmessage = e => onmsg(e.data);
  }
  function onmsg(d) {
    if (typeof d !== 'string') {
      const r = rx.get(cid);
      if (r) { r.got += d.byteLength; r.parts.push(d); cb.recvProgress(cid, r.size ? Math.min(99, r.got / r.size * 100) : 0); }
      return;
    }
    let m; try { m = JSON.parse(d); } catch (e) { return; }
    if (m.t === 'meta') {
      const info = { id: m.id, name: String(m.name || 'file').slice(0, 200), size: Math.max(0, +m.size || 0) };
      cid = m.id; rx.set(m.id, { parts: [], got: 0, size: info.size }); cb.recvStart(info);
    } else if (m.t === 'end') {
      const r = rx.get(m.id);
      if (r) { cb.recvDone(m.id, new Blob(r.parts)); rx.delete(m.id); dc && dc.send(j({ t: 'ack', id: m.id })); }
    } else if (m.t === 'cancel') { rx.delete(m.id); cb.recvCancel(m.id); }
    else if (m.t === 'ack') cb.ack(m.id);
  }
  async function handle(m) {
    await pcp; if (!pc) return;
    try {
      if (m.d) {
        await pc.setRemoteDescription(m.d);
        if (m.d.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); sock.emit('signal', { d: pc.localDescription }); }
      } else if (m.c) await pc.addIceCandidate(m.c);
    } catch (e) {}
  }
  function peer(init) {
    close();
    pcp = servers().then(async s => {
      pc = new RTCPeerConnection({ iceServers: s, iceTransportPolicy: relay ? 'relay' : 'all' });
      pc.onicecandidate = e => e.candidate && sock.emit('signal', { c: e.candidate });
      pc.onconnectionstatechange = () => { if (pc && ['failed', 'closed'].includes(pc.connectionState)) cb.state('lost'); };
      if (init) {
        setup(pc.createDataChannel('files'));
        await pc.setLocalDescription(await pc.createOffer());
        sock.emit('signal', { d: pc.localDescription });
      } else pc.ondatachannel = e => setup(e.channel);
    });
    pcp.then(() => q.splice(0).forEach(handle));
  }
  function start() {
    sock = io();
    sock.on('connect', () => cur && sock.emit('join', cur));
    sock.on('ready', m => peer(m.initiator));
    sock.on('signal', m => (pcp ? handle(m) : q.push(m)));
    sock.on('peer-left', () => { close(); q.length = 0; cb.state('lost'); });
    sock.on('expired', () => { close(); q.length = 0; cur = null; cb.state('expired'); });
    sock.on('err', m => cb.error(m));
    sock.on('disconnect', reason => { close(); cb.state('lost'); if (reason === 'io server disconnect') sock.connect(); });
  }
  return {
    ensure(code) {
      if (!sock) start();
      if (code !== cur) { cur = code; if (sock.connected) sock.emit('join', code); }
    },
    reset(r) {
      relay = r; close(); q.length = 0;
      if (sock && cur && sock.connected) sock.emit('join', cur);
      cb.state('lost');
    },
    async send(id, file, ctl) {
      dc.send(j({ t: 'meta', id, name: file.name, size: file.size }));
      for (let o = 0; o < file.size;) {
        while (ctl.paused() && !ctl.stop()) await sleep(100);
        if (ctl.stop()) { try { dc.send(j({ t: 'cancel', id })); } catch (e) {} return 'stopped'; }
        if (!dc || dc.readyState !== 'open') throw new Error('closed');
        if (dc.bufferedAmount > 1 << 20) await new Promise(r => dc.addEventListener('bufferedamountlow', r, { once: true }));
        const buf = await file.slice(o, o + CHUNK).arrayBuffer();
        dc.send(buf); o += buf.byteLength; cb.progress(id, o / file.size * 100);
      }
      dc.send(j({ t: 'end', id }));
      return 'done';
    }
  };
}
