import { io } from 'socket.io-client';
import { WORDS } from './words.js';

const CHUNK = 16 * 1024; // safe across browsers
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = o => JSON.stringify(o);

export function createNet(cb) {
  let sock = null, pc = null, dc = null, pcp = null, cur = null, relay = false, hasTurn = false, cid = null;
  const q = [], rx = new Map(), waits = new Map();

  async function servers() {
    let ice;
    try { ice = (await (await fetch('/api/ice')).json()).iceServers; }
    catch (e) { ice = [{ urls: 'stun:stun.l.google.com:19302' }]; }
    hasTurn = ice.some(x => [].concat(x.urls).some(u => String(u).startsWith('turn')));
    return ice;
  }
  function close() {
    const d = dc, p = pc; dc = pc = pcp = null;
    waits.forEach(r => r({ ok: false })); waits.clear();
    try { d && d.close(); } catch (e) {}
    try { p && p.close(); } catch (e) {}
  }
  function drop(k) {
    const r = rx.get(k);
    if (r) { try { r.w && r.w.abort(); } catch (e) {} rx.delete(k); }
  }
  const clearRx = () => [...rx.keys()].forEach(drop);

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
  // Both devices derive the same short phrase from the two DTLS fingerprints.
  // If a middleman tampered with the signaling, the phrases will differ.
  async function verify() {
    try {
      if (!crypto.subtle) return '';
      const g = d => ((d && d.sdp || '').match(/a=fingerprint:\S+ (\S+)/) || [])[1] || '';
      const a = [g(pc.localDescription), g(pc.remoteDescription)].sort().join('|');
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a)));
      return WORDS[h[0] % WORDS.length] + ' ' + WORDS[h[1] % WORDS.length] + ' ' + (h[2] % 90 + 10);
    } catch (e) { return ''; }
  }
  function setup(ch) {
    dc = ch; ch.binaryType = 'arraybuffer'; ch.bufferedAmountLowThreshold = 1 << 18;
    ch.onopen = async () => { const rt = await route(), v = await verify(); cb.state('open', rt, v); };
    ch.onclose = () => { if (dc === ch) cb.state('lost'); };
    ch.onmessage = e => onmsg(e.data);
  }
  function onmsg(d) {
    if (typeof d !== 'string') {
      const r = rx.get(cid);
      if (r && r.ok) {
        r.got += d.byteLength;
        if (r.w) r.chain = r.chain.then(() => r.w.write(d)); else r.parts.push(d);
        cb.recvProgress(cid, r.size ? Math.min(99, r.got / r.size * 100) : 0);
      }
      return;
    }
    let m; try { m = JSON.parse(d); } catch (e) { return; }
    const k = typeof m.k === 'string' ? m.k.slice(0, 64) : '';
    if (!k) return;
    if (m.t === 'meta') {
      const r = rx.get(k);
      if (r && r.ok && r.got <= r.size) { // same file again: carry on from what we have
        cid = k; dc.send(j({ t: 'accept', k, offset: r.got })); cb.recvResume(k, r.got);
      } else {
        drop(k); const size = Math.max(0, +m.size || 0);
        rx.set(k, { ok: false, got: 0, size, parts: [], w: null, chain: Promise.resolve() });
        cid = k; cb.recvStart({ k, name: String(m.name || 'file').slice(0, 200), size });
      }
    } else if (m.t === 'end') {
      const r = rx.get(k);
      if (r && r.ok) r.chain = r.chain.then(async () => {
        if (r.w) await r.w.close();
        cb.recvDone(k, r.w ? null : new Blob(r.parts)); rx.delete(k);
        dc && dc.send(j({ t: 'ack', id: m.id, k }));
      }).catch(() => { cb.recvCancel(k); rx.delete(k); });
    } else if (m.t === 'cancel') { drop(k); cb.recvCancel(k); }
    else if (m.t === 'ack') cb.ack(m.id);
    else if (m.t === 'accept' || m.t === 'decline') {
      const w = waits.get(k);
      if (w) { waits.delete(k); w(m.t === 'accept' ? { ok: true, offset: Math.max(0, +m.offset || 0) } : { ok: false, declined: true }); }
    }
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
      pc.onconnectionstatechange = () => {
        if (!pc) return;
        if (pc.connectionState === 'failed' && !relay && hasTurn) {
          relay = true; cb.error('Direct connection failed. Retrying through the relay.');
          close(); if (sock && cur) sock.emit('join', cur); return;
        }
        if (['failed', 'closed'].includes(pc.connectionState)) cb.state('lost');
      };
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
    sock.on('expired', () => { close(); q.length = 0; clearRx(); cur = null; cb.state('expired'); });
    sock.on('err', m => cb.error(m));
    sock.on('disconnect', reason => { close(); cb.state('lost'); if (reason === 'io server disconnect') sock.connect(); });
  }
  return {
    ensure(code) {
      if (!sock) start();
      if (code !== cur) { clearRx(); cur = code; if (sock.connected) sock.emit('join', code); }
    },
    reset(r) {
      relay = r; close(); q.length = 0;
      if (sock && cur && sock.connected) sock.emit('join', cur);
      cb.state('lost');
    },
    accept(k, ok, w) {
      const r = rx.get(k); if (!r || !dc) return;
      if (ok) { r.ok = true; r.w = w || null; dc.send(j({ t: 'accept', k, offset: 0 })); }
      else { rx.delete(k); dc.send(j({ t: 'decline', k })); }
    },
    drop,
    async send(id, k, file, ctl) {
      dc.send(j({ t: 'meta', id, k, name: file.name, size: file.size }));
      const ans = await new Promise(res => {
        waits.set(k, res);
        setTimeout(() => { if (waits.get(k) === res) { waits.delete(k); res({ ok: false }); } }, 120000);
      });
      if (!ans.ok) return ans.declined ? 'declined' : 'lost';
      for (let o = ans.offset || 0; o < file.size;) {
        while (ctl.paused() && !ctl.stop()) await sleep(100);
        if (ctl.stop()) { try { dc.send(j({ t: 'cancel', k })); } catch (e) {} return 'stopped'; }
        if (!dc || dc.readyState !== 'open') throw new Error('closed');
        if (dc.bufferedAmount > 1 << 20) await new Promise(r => dc.addEventListener('bufferedamountlow', r, { once: true }));
        const buf = await file.slice(o, o + CHUNK).arrayBuffer();
        dc.send(buf); o += buf.byteLength; cb.progress(id, o / file.size * 100);
      }
      dc.send(j({ t: 'end', id, k }));
      return 'done';
    }
  };
}
