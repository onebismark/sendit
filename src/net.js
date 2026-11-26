import { io } from 'socket.io-client';
import { WORDS } from './words.js';

const CHUNK = 16 * 1024, WIN = 16;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = o => JSON.stringify(o);
const b64 = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const phrase = h => WORDS[h[0] % WORDS.length] + ' ' + WORDS[h[1] % WORDS.length] + ' ' + (h[2] % 90 + 10);
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

// Offline pairing codes: the session description, compressed and made URL-safe.
async function zip(str) {
  if (typeof CompressionStream === 'undefined') return 'r.' + b64(new TextEncoder().encode(str));
  return 'z.' + b64(new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()));
}
async function unzip(s) {
  s = s.replace(/\s+/g, ''); const bytes = unb64(s.slice(2));
  if (s.startsWith('r.')) return new TextDecoder().decode(bytes);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
}

export function createNet(cb) {
  let sock = null, pc = null, dc = null, pcp = null, cur = null, cid = null, fb = null;
  let relayOnly = false, manual = false, transport = 'direct';
  let rkey = null, rpriv = null, rpub = null, rready = null, rq = Promise.resolve(), txq = Promise.resolve();
  let sctr = 0, rctr = 0, dirMe = 1, infl = 0, wake = null;
  const q = [], rx = new Map(), waits = new Map();

  async function servers() {
    try { return (await (await fetch('/api/ice')).json()).iceServers || []; }
    catch (e) { return [{ urls: 'stun:stun.l.google.com:19302' }]; }
  }
  function close() {
    clearTimeout(fb);
    const d = dc, p = pc; dc = pc = pcp = null;
    waits.forEach(r => r({ ok: false })); waits.clear();
    try { d && d.close(); } catch (e) {}
    try { p && p.close(); } catch (e) {}
  }
  function endRelay() {
    transport = 'direct'; rkey = null; sctr = rctr = 0; infl = 0;
    if (wake) { const w = wake; wake = null; w(); }
    waits.forEach(r => r({ ok: false })); waits.clear();
  }
  function drop(k) { const r = rx.get(k); if (r) { try { r.w && r.w.abort(); } catch (e) {} rx.delete(k); } }
  const clearRx = () => [...rx.keys()].forEach(drop);
  const alive = () => transport === 'relay' ? !!(sock && sock.connected && rkey) : !!(dc && dc.readyState === 'open');

  /* Sending: direct data channel, or the server relay with end-to-end encryption */
  async function enc(d) {
    const s = typeof d === 'string', data = s ? new TextEncoder().encode(d) : new Uint8Array(d);
    const iv = new Uint8Array(12); iv[0] = dirMe; new DataView(iv.buffer).setUint32(8, sctr++);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rkey, data));
    const o = new Uint8Array(13 + ct.length); o[0] = s ? 1 : 0; o.set(iv, 1); o.set(ct, 13);
    return o.buffer;
  }
  function tx(d) {
    if (transport !== 'relay') { dc.send(d); return Promise.resolve(); }
    const p = txq.then(async () => {
      const b = await enc(d);
      while (infl >= WIN) await new Promise(r => { wake = r; });
      infl++; sock.emit('relay', b, () => { infl--; if (wake) { const w = wake; wake = null; w(); } });
    });
    txq = p.catch(() => {}); return p;
  }
  function onrelay(buf) {
    rq = rq.then(async () => {
      try {
        const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset);
        if (u[1] !== (dirMe === 1 ? 2 : 1) || dv.getUint32(9) !== rctr) throw new Error('order');
        rctr++;
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(1, 13) }, rkey, u.slice(13));
        onmsg(u[0] ? new TextDecoder().decode(pt) : pt);
      } catch (e) {
        cb.error('The relay data was altered or out of order. Disconnecting.');
        endRelay(); cb.state('lost'); if (sock && cur) sock.emit('join', cur);
      }
    });
  }
  function relayStart() {
    if (manual) return;
    close(); transport = 'relay'; sctr = rctr = 0; rkey = null;
    rready = (async () => {
      const kp = await crypto.subtle.generateKey(ECDH, false, ['deriveKey']);
      rpriv = kp.privateKey; rpub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      sock.emit('signal', { k: b64(rpub) });
    })();
  }
  async function peerKey(s) {
    await rready;
    const pk = await crypto.subtle.importKey('raw', unb64(s), ECDH, false, []);
    rkey = await crypto.subtle.deriveKey({ name: 'ECDH', public: pk }, rpriv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const mine = b64(rpub); dirMe = mine < s ? 1 : 2;
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode([mine, s].sort().join('|'))));
    cb.state('open', 'Relay', phrase(h));
  }

  /* Direct connection */
  async function route() {
    try {
      const st = await pc.getStats(); let r = 'Direct';
      st.forEach(s => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated) {
          const l = st.get(s.localCandidateId); if (l && l.candidateType === 'relay') r = 'Relay';
        }
      });
      return r;
    } catch (e) { return 'Direct'; }
  }
  async function verify() {
    try {
      if (!crypto.subtle) return '';
      const g = d => ((d && d.sdp || '').match(/a=fingerprint:\S+ (\S+)/) || [])[1] || '';
      const a = [g(pc.localDescription), g(pc.remoteDescription)].sort().join('|');
      return phrase(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a))));
    } catch (e) { return ''; }
  }
  function setup(ch) {
    dc = ch; ch.binaryType = 'arraybuffer'; ch.bufferedAmountLowThreshold = 1 << 18;
    ch.onopen = async () => { clearTimeout(fb); cb.state('open', manual ? 'Local' : await route(), await verify()); };
    ch.onclose = () => { if (dc === ch) { manual = false; cb.state('lost'); } };
    ch.onmessage = e => onmsg(e.data);
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
  function fallback(why) { cb.error(why); relayStart(); }
  function peer(init) {
    close();
    fb = setTimeout(() => { if (transport === 'direct' && !(dc && dc.readyState === 'open')) fallback('Direct connection not possible. Using the server relay.'); }, 10000);
    pcp = servers().then(async s => {
      pc = new RTCPeerConnection({ iceServers: s });
      pc.onicecandidate = e => e.candidate && sock.emit('signal', { c: e.candidate });
      pc.onconnectionstatechange = () => { if (pc && pc.connectionState === 'failed') { cb.state('lost'); fallback('Direct connection failed. Using the server relay.'); } };
      if (init) {
        setup(pc.createDataChannel('files'));
        await pc.setLocalDescription(await pc.createOffer());
        sock.emit('signal', { d: pc.localDescription });
      } else pc.ondatachannel = e => setup(e.channel);
    });
    pcp.then(() => q.splice(0).forEach(handle));
  }

  /* Messages (same for both transports) */
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
      if (r && r.ok && r.got <= r.size) { cid = k; tx(j({ t: 'accept', k, offset: r.got })).catch(() => {}); cb.recvResume(k, r.got); }
      else {
        drop(k); const size = Math.max(0, +m.size || 0);
        rx.set(k, { ok: false, got: 0, size, parts: [], w: null, chain: Promise.resolve() });
        cid = k; cb.recvStart({ k, name: String(m.name || 'file').slice(0, 200), size });
      }
    } else if (m.t === 'end') {
      const r = rx.get(k);
      if (r && r.ok) r.chain = r.chain.then(async () => {
        if (r.w) await r.w.close();
        cb.recvDone(k, r.w ? null : new Blob(r.parts)); rx.delete(k);
        tx(j({ t: 'ack', id: m.id, k })).catch(() => {});
      }).catch(() => { cb.recvCancel(k); rx.delete(k); });
    } else if (m.t === 'cancel') { drop(k); cb.recvCancel(k); }
    else if (m.t === 'ack') cb.ack(m.id);
    else if (m.t === 'accept' || m.t === 'decline') {
      const w = waits.get(k);
      if (w) { waits.delete(k); w(m.t === 'accept' ? { ok: true, offset: Math.max(0, +m.offset || 0) } : { ok: false, declined: true }); }
    }
  }

  function start() {
    sock = io();
    sock.on('connect', () => cur && !manual && sock.emit('join', cur));
    sock.on('ready', m => { if (manual) return; endRelay(); if (relayOnly) relayStart(); else peer(m.initiator); });
    sock.on('signal', m => {
      if (manual) return;
      if (m.k) { (async () => { if (transport !== 'relay') relayStart(); await peerKey(m.k); })().catch(() => {}); return; }
      pcp ? handle(m) : q.push(m);
    });
    sock.on('relay', b => { if (!manual && transport === 'relay' && rkey) onrelay(b); });
    sock.on('peer-left', () => { if (manual) return; close(); endRelay(); q.length = 0; cb.state('lost'); });
    sock.on('expired', () => { if (manual) return; close(); endRelay(); q.length = 0; clearRx(); cur = null; cb.state('expired'); });
    sock.on('err', m => cb.error(m));
    sock.on('disconnect', reason => { if (manual) return; close(); endRelay(); cb.state('lost'); if (reason === 'io server disconnect') sock.connect(); });
  }
  const gathered = () => new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const f = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', f); res(); } };
    pc.addEventListener('icegatheringstatechange', f); setTimeout(res, 4000);
  });
  function mpc() {
    close(); endRelay(); manual = true;
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.onconnectionstatechange = () => { if (pc && pc.connectionState === 'failed') { manual = false; cb.state('lost'); } };
  }

  return {
    ensure(code) {
      if (manual) return;
      if (!sock) start();
      if (code !== cur) { clearRx(); cur = code; if (sock.connected) sock.emit('join', code); }
    },
    reset(r) {
      if (manual) return;
      relayOnly = r; close(); endRelay(); q.length = 0;
      if (sock && cur && sock.connected) sock.emit('join', cur);
      cb.state('lost');
    },
    /* Offline pairing: no server, no internet. Devices swap two short codes. */
    async manualHost() { mpc(); setup(pc.createDataChannel('files')); await pc.setLocalDescription(await pc.createOffer()); await gathered(); return zip(j(pc.localDescription)); },
    async manualFinish(code) { await pc.setRemoteDescription(JSON.parse(await unzip(code))); },
    async manualJoin(code) {
      const d = JSON.parse(await unzip(code)); mpc(); pc.ondatachannel = e => setup(e.channel);
      await pc.setRemoteDescription(d); await pc.setLocalDescription(await pc.createAnswer()); await gathered();
      return zip(j(pc.localDescription));
    },
    manualStop() { manual = false; close(); },
    accept(k, ok, w) {
      const r = rx.get(k); if (!r || !alive()) return;
      if (ok) { r.ok = true; r.w = w || null; tx(j({ t: 'accept', k, offset: 0 })).catch(() => {}); }
      else { rx.delete(k); tx(j({ t: 'decline', k })).catch(() => {}); }
    },
    drop,
    async send(id, k, file, ctl) {
      await tx(j({ t: 'meta', id, k, name: file.name, size: file.size }));
      const ans = await new Promise(res => {
        waits.set(k, res);
        setTimeout(() => { if (waits.get(k) === res) { waits.delete(k); res({ ok: false }); } }, 120000);
      });
      if (!ans.ok) return ans.declined ? 'declined' : 'lost';
      for (let o = ans.offset || 0; o < file.size;) {
        while (ctl.paused() && !ctl.stop()) await sleep(100);
        if (ctl.stop()) { try { await tx(j({ t: 'cancel', k })); } catch (e) {} return 'stopped'; }
        if (!alive()) throw new Error('closed');
        if (transport === 'direct' && dc.bufferedAmount > 1 << 20) await new Promise(r => { dc.addEventListener('bufferedamountlow', r, { once: true }); dc.addEventListener('close', r, { once: true }); });
        const buf = await file.slice(o, o + CHUNK).arrayBuffer();
        await tx(buf); o += buf.byteLength; cb.progress(id, o / file.size * 100);
      }
      await tx(j({ t: 'end', id, k }));
      return 'done';
    }
  };
}
