import './style.css';
import { createNet } from './net.js';
import { WORDS } from './words.js';
import { META } from './meta.js';


const gen=()=>{const a=new Uint32Array(3);crypto.getRandomValues(a);return WORDS[a[0]%WORDS.length]+'-'+WORDS[a[1]%WORDS.length]+'-'+(1000+a[2]%9000)};
const room={code:gen(),joined:false,route:'Direct',verify:''};
const S={files:[],max:2048,expiry:'1 hour',relay:false};
let seq=0,first=true;
const $=s=>document.querySelector(s),app=$('#app');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=b=>b>=1e9?(b/1e9).toFixed(1)+' GB':b>=1e6?(b/1e6).toFixed(1)+' MB':Math.max(1,Math.round(b/1e3))+' KB';
const lim=()=>S.max>=1000?(S.max/1024).toFixed(0)+' GB':S.max+' MB';
const say=t=>{$('#live').textContent=t};
const codeHtml=(c,cls='')=>`<div class="code ${cls}">${[...c].map((ch,i)=>`<span class="${/\d/.test(ch)?'d':''}" style="--i:${i}">${ch}</span>`).join('')}</div>`;

/* Reusable templates */
const textPage=(t,lead,secs,banner)=>`<section class="wrap narrow"><h1>${t}</h1><p class="lead">${lead}</p>${banner?`<p class="note">${banner}</p>`:''}${secs.map(([a,b])=>`<h2>${a}</h2><p>${b}</p>`).join('')}</section>`;
const faqPage=(t,lead,qs)=>`<section class="wrap narrow"><h1>${t}</h1><p class="lead">${lead}</p>${qs.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`;
const formPage=(t,lead,fields,btn,ok,kind='')=>`<section class="wrap narrow"><h1>${t}</h1><p class="lead">${lead}</p><form data-ok="${ok}" data-kind="${kind}">${kind?'<input class="vh" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">':''}${fields}<div class="row"><button class="btn p" type="submit">${btn}</button></div></form></section>`;
const field=(id,l,type='text',extra='')=>`<label for="${id}">${l}</label><input id="${id}" name="${id}" type="${type}" required ${extra}>`;
const DRAFT='Draft template. Have a lawyer review and adapt it before Sendit launches.';

const R={
home:()=>`<section class="wrap hero"><h1>Send a file to any device, on any network.</h1>
<p class="lead">Pair two devices with a short code. Sendit finds the fastest private route between them and cleans up after the transfer.</p>
${codeHtml(room.code)}<p class="mut">This is a room code. Share it, and the other device can join from anywhere.</p>
<div class="row"><a class="btn p" href="/workspace">Open workspace</a><a class="btn" href="/pair">Join with a code</a></div></section>
<section class="wrap"><h2>How a file finds its way</h2><ol class="steps">
<li><div><h3>Pair</h3><p>One device shows a code or link. The other enters it. Rooms close after a time you choose.</p></div></li>
<li><div><h3>Go direct</h3><p>Sendit tries a peer-to-peer WebRTC connection first, so files travel straight between the two devices.</p></div></li>
<li><div><h3>Relay if blocked</h3><p>If a firewall or mobile network blocks the direct route, the file goes through Sendit’s server relay instead, still end-to-end encrypted.</p></div></li>
<li><div><h3>Clean up</h3><p>Rooms close automatically and the server never stores your files, so there is nothing left to delete.</p></div></li></ol></section>
<section class="wrap"><h2>What you get</h2><dl class="feat">
<div><dt>Works across networks</dt><dd>Home Wi-Fi to office laptop, phone data to desktop. No shared network needed.</dd></div>
<div><dt>Private in transit</dt><dd>Transfers are encrypted end to end by WebRTC, even when a relay carries them.</dd></div>
<div><dt>Control of every transfer</dt><dd>Watch progress, pause, resume, cancel, or retry a dropped file and carry on where it stopped.</dd></div>
<div><dt>Links that expire</dt><dd>Rooms close automatically after an hour, and a code admits only two devices.</dd></div>
<div><dt>Any file, your limit</dt><dd>Send any file type. Set a size cap that fits your plan or your team.</dd></div></dl>
<div class="band"><h2>Try the workspace</h2><p>The preview simulates a transfer so you can see the full flow.</p><div class="row"><a class="btn p" href="/workspace">Open workspace</a><a class="btn" href="/waitlist">Get early access</a></div></div></section>`,

workspace:()=>{const j=room.joined;return `<section class="wrap"><h1>Workspace</h1>
<p class="note">Open Sendit on a second device and join with your room code. Files go straight between the two devices over an encrypted WebRTC connection.</p>
<div class="grid"><aside class="panel"><h2>Your room</h2>${j&&room.route==='Local'?'<p>Connected without the internet. Files go straight between the two devices.</p>':codeHtml(room.code,'sm')}
${j&&room.route==='Local'?'':'<div class="row"><button class="btn sm" data-act="copy" type="button">Copy invite link</button></div>'}
${j&&room.route==='Local'?'':'<img class="qr" id="qr" alt="QR code. Scan it with a phone camera to join this room." width="160" height="160">'}<ul class="dev"><li><span>This device</span><span class="ok">${navigator.onLine?'Online':'Offline'}</span></li><li><span>${j?'Other device':'Waiting for a device'}</span>${j?`<span class="ok">${room.route==='Relay'?'Via server relay, end-to-end encrypted':room.route==='Local'?'Local network, encrypted':'Direct, encrypted'}</span>`:'<span class="mut">Not joined</span>'}</li></ul>

${j&&room.verify?`<p class="note">Check that both devices show <b>${esc(room.verify)}</b>. If they differ, leave the room.</p>`:''}<label for="mx">Largest file</label><select id="mx"><option value="50">50 MB</option><option value="500">500 MB</option><option value="2048">2 GB</option></select>

<label class="chk" for="rl"><input id="rl" type="checkbox">Use the server relay only (slower, works on any network)</label></aside>
<div><h2 style="margin-top:0">Send files</h2>
${j?`<label class="drop" id="dz"><b>Drop files here</b> or choose them<input id="fi" type="file" multiple></label>`:`<p class="empty">Connect a second device to start sending. Share your room code, or open Pair on the other device.</p>`}
<ul id="q" aria-label="Transfers"></ul></div></div></section>`},

pair:()=>`<section class="wrap narrow"><h1>Connect a device</h1><p class="lead">Enter the code shown on the other device. Codes look like RIVER-MANGO-4821.</p>
<form id="pf"><label for="pc">Room code</label><input id="pc" value="${esc(new URLSearchParams(location.search).get('code')||'')}" autocomplete="off" autocapitalize="characters" placeholder="RIVER-MANGO-4821" required aria-describedby="pe"><p id="pe" class="bad" role="alert"></p>
<div class="row"><button class="btn p" type="submit">Join room</button></div></form>
<h2>Other ways to pair</h2><p>Scan the QR code shown in the <a href="/workspace">workspace</a>, or open an invite link. No internet? Use <a href="/offline">offline pairing</a>.</p></section>`,

about:()=>textPage('About Sendit','Sendit is a product of Markmix Digital, built by Lord Bismark.',[['Why it exists','Moving a file between two devices still means cables, chat apps that shrink it, or a shared network. Sendit makes it a code and a drop.'],['How it’s built','A real-time signaling service pairs devices, WebRTC carries the file, and an encrypted relay steps in when a direct route is blocked.'],['Who is behind it','Markmix Digital builds websites, runs online radio, and manages social media for its clients. Lord Bismark is the developer of Sendit.']]),
contact:()=>formPage('Contact','Questions, partnerships, or press. Tell us what you need.',field('n','Name')+field('e','Email','email')+`<label for="m">Message</label><textarea id="m" rows="5" required></textarea>`,'Send message','Thanks. Your message was sent to Markmix Digital.','contact'),
waitlist:()=>formPage('Get early access','Join the waitlist and we’ll invite you as Sendit opens up.',field('e','Email','email','autocomplete="email"'),'Join waitlist','You’re on the list. We’ll email you when early access opens.','waitlist'),
signin:()=>formPage('Sign in','You don’t need an account to send files. Accounts will add history and team limits.',field('e','Email','email','autocomplete="email"')+field('p','Password','password','autocomplete="current-password"'),'Sign in','Preview only: sign in is part of the production build.'),
faq:()=>faqPage('Questions','Short answers about how Sendit works.',[['Do both devices need the same Wi-Fi?','No. Devices pair with a code and connect across networks.'],['Can I use Sendit without internet?','Yes. On the Offline page, two devices on the same Wi-Fi or hotspot pair by scanning or pasting two short codes, with no server and no internet. Open Sendit once online on each device first so it is saved. Some guest Wi-Fi networks stop devices from seeing each other, and a phone hotspot is the usual fix.'],['Is it private?','Transfers are encrypted end to end between the two devices, on direct connections and through the server relay.'],['What if a direct connection fails?','Sendit switches to the server relay automatically. Files stay end-to-end encrypted, so the server cannot read them. The relay is slower, and you can force it with the relay-only option.'],['How big can a file be?','You set the limit: 50 MB, 500 MB, or 2 GB. Chrome and Edge on a computer save large files straight to disk. Other browsers hold them in memory, so very large files need a device with enough RAM.'],['How long are files kept?','Files are never stored on our servers. A received file stays in the other device’s browser until you save or remove it.'],['Do I need an account?','No. Accounts are optional.']]),
help:()=>textPage('Help','Everything you need to send your first file.',[['Send your first file','Open the workspace, share your code or invite link, and drop files once the other device joins.'],['Join from another device','Go to Pair, enter the code, and select Join room.'],['If a transfer stops','Select Retry. If the other device still has the part it received, Sendit continues from there. If it keeps failing, turn on relay only.'],['Without internet','Open Offline, choose Start on one device and Join on the other, then swap the two codes by scanning or pasting. Both devices need to be on the same Wi-Fi or hotspot.'],['Limits and expiry','Pick the largest file in the workspace. Rooms close automatically after an hour. Files over the limit are rejected before sending.']]),
privacy:()=>textPage('Privacy policy','How Sendit treats your data.',[['What we collect','Room codes and the connection details needed to pair two devices, your IP address (kept in memory for about a minute to limit abuse), and anything you submit through the contact or waitlist forms: name, email and message.'],['What we don’t keep','Files go from device to device and are never stored on our servers. If a direct route is blocked they pass through our server relay. They are encrypted end to end, so we cannot read them, and they are not stored.'],['How we use form data','Only to reply to you or to tell you when early access opens. It is stored in our database and may be emailed to the Sendit team.'],['Cookies and storage','Sendit sets no cookies. Your browser keeps your light or dark choice on your device.'],['Service providers','We use hosting, relay and email providers to run Sendit. They process data only to provide those services.'],['Children','Sendit is not directed at children under 13.'],['Your choices','Ask us to delete your waitlist or message data at any time through the contact page.']],DRAFT),
terms:()=>textPage('Terms of service','The rules for using Sendit.',[['Acceptable use','Don’t send unlawful content, malware, or files you have no right to share. Don’t try to disrupt the service or guess other people’s room codes.'],['Your files','You are responsible for what you send. Sendit does not store or review files, and the other device decides whether to accept them.'],['Availability','We aim for reliable transfers but can’t guarantee uninterrupted service. Rooms close automatically after a set time.'],['Limits','File size, room lifetime and rate limits may change as the service grows.'],['No warranty and liability','Sendit is provided as is. To the extent the law allows, Markmix Digital is not liable for lost or corrupted transfers.'],['Changes','We may update these terms. Continued use means you accept the new version.'],['Contact','Use the contact page for questions about these terms.']],DRAFT),
nf:()=>textPage('Page not found','That page doesn’t exist. Try the workspace or head home.',[])};

/* Transfers */
const lb={pending:'Incoming',queued:'Waiting',sending:'Sending',paused:'Paused',done:'Delivered',failed:'Failed',cancelled:'Cancelled'};
const btns=f=>f.dir==='in'?(f.status==='pending'?['accept|Accept','decline|Decline']:f.status==='sending'?[]:['remove|Remove']):f.status==='sending'?['pause|Pause','cancel|Cancel']:f.status==='paused'?['resume|Resume','cancel|Cancel']:f.status==='failed'?[...(f.over?[]:['resume|Retry']),'remove|Remove']:['remove|Remove'];
const li=f=>`<li data-id="${f.id}"><div class="nm"><b>${esc(f.name)}</b><span>${fmt(f.size)}</span></div><progress max="100" value="${f.pct}" aria-label="Progress for ${esc(f.name)}"></progress><div class="st"><span class="s-${f.status}">${esc(f.msg||lb[f.status])}</span><span class="sp"></span></div><div class="act">${f.url?`<a class="btn sm p" href="${f.url}" download="${esc(f.name)}">Save</a>`:''}${btns(f).map(b=>{const[a,l]=b.split('|');return `<button class="btn sm" type="button" data-act="${a}" data-id="${f.id}">${l}</button>`}).join('')}</div></li>`;
function qr(focusId){const u=$('#q');if(!u)return;u.innerHTML=S.files.length?S.files.map(li).join(''):'<li class="empty">Nothing queued yet.</li>';if(focusId){const b=u.querySelector(`li[data-id="${focusId}"] button`);b&&b.focus()}}
/* Network */
const WAIT='Waiting for the other device to accept';
const tok=()=>{const a=new Uint8Array(12);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,'0')).join('')};
const byTok=k=>S.files.find(x=>x.tok===k&&x.dir==='in');
const setPct=f=>{const l=document.querySelector(`li[data-id="${f.id}"]`);if(l){l.querySelector('progress').value=f.pct;l.querySelector('.sp').textContent=Math.round(f.pct)+'%'}};
const upd=(f,p)=>{if(f.msg===WAIT){f.msg='';qr(f.id)}f.pct=p;if(Math.floor(p)!==f.last){f.last=Math.floor(p);setPct(f)}};
const fail=(f,m)=>{f.status='failed';f.sent=0;f.msg=m;qr(f.id)};
const net=createNet({
 state(s,route,verify){
  if(s==='open'){room.joined=true;room.route=route;room.verify=verify||'';say('Device connected');if(location.pathname==='/offline'){go('/workspace');return}}
  else{if(room.joined)say('Device disconnected');room.joined=false;room.verify='';
   S.files=S.files.filter(f=>!(f.dir==='in'&&f.status==='pending'));
   S.files.forEach(f=>{if(f.status==='sending'||f.status==='paused'){f.status='failed';f.sent=0;f.msg=f.dir==='in'?'Connection lost. It continues if the sender retries.':'Connection lost. Retry continues the file.'}});
   if(s==='expired'){room.code=gen();say('The room expired. A new code was created.')}
   if(location.pathname==='/offline'&&(off.stage==='wait'||off.stage==='joined')){off.err='The connection didn’t start. Try again, and make sure both devices are on the same Wi-Fi or hotspot.';off.stage='choose';render(1)}}
  if(location.pathname==='/workspace')render(1)},
 error:m=>say(m),
 progress(id,p){const f=S.files.find(x=>x.id===id);f&&upd(f,p)},
 ack(id){const f=S.files.find(x=>x.id===id&&x.dir!=='in');if(f){f.status='done';f.pct=100;f.msg='';qr(f.id);say(f.name+' delivered')}},
 recvStart(i){const f={id:'r'+(++seq),tok:i.k,name:i.name,size:i.size,pct:0,status:'pending',dir:'in',msg:'Wants to send you this file'};S.files.push(f);qr();say('Incoming file: '+f.name)},
 recvResume(k){const f=byTok(k);if(f){f.status='sending';f.msg='Receiving';qr(f.id)}},
 recvProgress(k,p){const f=byTok(k);f&&upd(f,p)},
 recvDone(k,blob){const f=byTok(k);if(f){if(blob)f.url=URL.createObjectURL(blob);f.status='done';f.pct=100;f.msg=blob?'Received':'Saved to your device';qr(f.id);say(f.name+' received')}},
 recvCancel(k){const f=byTok(k);if(f){f.status='cancelled';f.msg='The sender cancelled';qr(f.id)}}
});
let pumping=false;
async function pump(){if(pumping)return;pumping=true;
 try{for(let f;f=S.files.find(x=>x.dir!=='in'&&x.status==='sending'&&!x.sent);){f.sent=1;f.msg=WAIT;qr(f.id);
  try{const r=await net.send(f.id,f.tok,f.file,{paused:()=>f.status==='paused',stop:()=>f.status==='cancelled'||!room.joined});
   if(f.msg===WAIT)f.msg='';
   if(r==='declined')fail(f,'The other device declined this file.');
   else if(r!=='done'&&f.status==='sending')fail(f,'No answer from the other device. Retry once it is back.')}
  catch(e){fail(f,'Connection dropped. Retry continues the file.')}}}
 finally{pumping=false}}
function add(list){[...list].forEach(x=>{const f={id:++seq,tok:tok(),name:x.name,size:x.size,pct:0,status:'sending',file:x};
 if(x.size/1e6>S.max){f.status='failed';f.over=1;f.msg=`Over the ${lim()} limit. Raise the limit or send a smaller file.`}
 else if(!room.joined){f.status='failed';f.msg='Not connected yet. Pair a device, then press Retry.'}
 S.files.push(f)});qr();say(list.length+' file(s) added');pump()}
async function accept(f){let w=null;
 if(window.showSaveFilePicker){try{w=await(await showSaveFilePicker({suggestedName:f.name})).createWritable()}catch(e){if(e.name==='AbortError')return}}
 f.status='sending';f.msg='Receiving';f.pct=0;qr(f.id);net.accept(f.tok,true,w)}
function act(a,id){const f=S.files.find(x=>x.id==id);if(!f)return;
 if(a==='accept'){accept(f);return}
 if(a==='decline'){net.accept(f.tok,false);f.status='cancelled';f.msg='Declined'}
 else if(a==='pause')f.status='paused';
 else if(a==='resume'){if(f.status==='failed')f.sent=0;f.status='sending';f.msg='';pump()}
 else if(a==='cancel'){f.status='cancelled';f.msg=''}
 else if(a==='remove'){if(f.url)URL.revokeObjectURL(f.url);if(f.dir==='in'&&f.status!=='done')net.drop(f.tok);S.files=S.files.filter(x=>x!==f)}
 qr(a==='remove'?0:id);say(a+' '+f.name)}
let qrFor='',qrUrl='';
function showQR(){const img=$('#qr');if(!img)return;if(qrFor===room.code){img.src=qrUrl;return}
 const c=room.code;import('qrcode').then(m=>(m.default||m).toDataURL(location.origin+'/pair?code='+c,{margin:1,width:240})).then(u=>{qrFor=c;qrUrl=u;const i=$('#qr');if(i)i.src=u}).catch(()=>{})}
async function takeShared(){try{const c=await caches.open('share'),files=[];
 for(const k of await c.keys()){const r=await c.match(k),b=await r.blob();files.push(new File([b],decodeURIComponent(r.headers.get('x-name')||'file'),{type:b.type}));await c.delete(k)}
 history.replaceState(null,'','/workspace');if(files.length)add(files)}catch(e){}}

/* Offline pairing */
const off={stage:'choose',offer:'',answer:'',qr:'',aqr:'',err:'',busy:false,scan:false};
let scanStop=()=>{};
R.offline=()=>{
 const err=off.err?`<p class="bad" role="alert">${esc(off.err)}</p>`:'';
 const scan=off.scan?`<div class="panel"><video id="ov" playsinline muted style="width:100%;max-width:24rem;border-radius:.5rem"></video><div class="row"><button class="btn" type="button" data-act="off-stop">Cancel scanning</button></div></div>`:'';
 const codeBox=(c,src,label)=>`<img class="qr" src="${src}" alt="QR code for ${label}" width="240" height="240"><label for="ot">Or copy this code</label><textarea id="ot" rows="4" readonly>${esc(c)}</textarea><div class="row"><button class="btn sm" type="button" data-act="off-copy">Copy code</button></div>`;
 const input=(btn,act)=>`<div class="row"><button class="btn p" type="button" data-act="off-scan">Scan with camera</button></div><label for="oc">Or paste the code here</label><textarea id="oc" rows="4"></textarea><div class="row"><button class="btn" type="button" data-act="${act}">${btn}</button></div>`;
 let body='';
 if(off.stage==='choose')body=`<div class="row"><button class="btn p" type="button" data-act="off-host">Start a connection on this device</button><button class="btn" type="button" data-act="off-join">Join a connection from another device</button></div>`;
 else if(off.stage==='host')body=`<h2>Step 1. Show this on the first device</h2><p>On the other device choose Join, then scan this QR code or enter the code.</p>${codeBox(off.offer,off.qr,'the first device')}<h2>Step 2. Enter the reply</h2><p>The other device then shows a reply code. Scan it or paste it here.</p>${input('Connect','off-finish')}`;
 else if(off.stage==='join')body=`<h2>Step 1. Enter the first device’s code</h2><p>Scan the QR code on the first device, or paste its code.</p>${input('Continue','off-answer')}`;
 else if(off.stage==='joined')body=`<h2>Step 2. Show this reply on the first device</h2><p>On the first device scan this QR code or paste the code. This page opens the workspace once you are connected.</p>${codeBox(off.answer,off.aqr,'the reply')}`;
 else body='<p role="status">Connecting…</p>';
 return `<section class="wrap narrow"><h1>Connect without internet</h1><p class="lead">Use this when both devices are on the same Wi-Fi or hotspot, even if it has no internet. No server is used.</p><p class="note">Open Sendit once with internet on each device first, so it is saved for offline use. Some public or guest Wi-Fi networks stop devices from reaching each other. If that happens, use one phone’s hotspot instead.</p>${err}${scan}${off.busy?'<p role="status">Working…</p>':body}${off.stage!=='choose'?'<div class="row"><button class="btn" type="button" data-act="off-reset">Start over</button></div>':''}</section>`};
const qrData=t=>import('qrcode').then(m=>(m.default||m).toDataURL(t,{margin:2,width:320,errorCorrectionLevel:'L'}));
async function grantIps(){try{(await navigator.mediaDevices.getUserMedia({video:true})).getTracks().forEach(t=>t.stop())}catch(e){}}
async function scanCode(){
 const jsQR=(await import('jsqr')).default;
 const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
 const v=$('#ov');v.srcObject=stream;await v.play();
 const c=document.createElement('canvas'),x=c.getContext('2d',{willReadFrequently:true});
 return new Promise(res=>{const done=r=>{stream.getTracks().forEach(t=>t.stop());res(r)};scanStop=()=>done(null);
  const tick=()=>{if(!$('#ov')){done(null);return}
   if(v.videoWidth){c.width=v.videoWidth;c.height=v.videoHeight;x.drawImage(v,0,0);const d=x.getImageData(0,0,c.width,c.height),r=jsQR(d.data,d.width,d.height);if(r&&r.data){done(r.data);return}}
   requestAnimationFrame(tick)};tick()})}
async function offUse(v){
 if(off.stage==='host'){await net.manualFinish(v);off.stage='wait'}
 else{off.busy=true;render(1);await grantIps();off.answer=await net.manualJoin(v);off.aqr=await qrData(off.answer);off.stage='joined';off.busy=false}}
async function offAct(a){
 off.err='';
 try{
  if(a==='reset'){net.manualStop();Object.assign(off,{stage:'choose',offer:'',answer:'',qr:'',aqr:'',scan:false,busy:false})}
  else if(a==='stop'){scanStop();off.scan=false}
  else if(a==='copy'){try{await navigator.clipboard.writeText(off.offer||off.answer)}catch(e){}say('Code copied');return}
  else if(a==='host'){off.busy=true;render(1);await grantIps();off.offer=await net.manualHost();off.qr=await qrData(off.offer);off.stage='host';off.busy=false}
  else if(a==='join'){off.stage='join'}
  else if(a==='scan'){off.scan=true;render(1);const v=await scanCode();off.scan=false;if(v)await offUse(v)}
  else if(a==='finish'||a==='answer'){await offUse($('#oc').value)}
 }catch(e){off.busy=false;off.scan=false;off.err=e&&e.name==='NotAllowedError'?'Camera permission was blocked. Paste the code instead.':'That code didn’t work. Check it and try again.'}
 render(1)}

/* Events */
app.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
if(a==='copy'){try{navigator.clipboard.writeText(location.origin+'/pair?code='+room.code)}catch(x){}say('Invite link copied')}
else if(a.startsWith('off-'))offAct(a.slice(4));else act(a,b.dataset.id)});
app.addEventListener('change',e=>{const t=e.target;
if(t.id==='mx')S.max=+t.value;if(t.id==='rl'){S.relay=t.checked;net.reset(S.relay);render(1)}
if(t.id==='fi'){add(t.files);t.value=''}});
app.addEventListener('dragover',e=>{const d=e.target.closest('#dz');if(d){e.preventDefault();d.classList.add('on')}});
app.addEventListener('dragleave',e=>{const d=e.target.closest('#dz');d&&d.classList.remove('on')});
app.addEventListener('drop',e=>{const d=e.target.closest('#dz');if(d){e.preventDefault();d.classList.remove('on');add(e.dataTransfer.files)}});
app.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;
if(f.id==='pf'){const v=$('#pc').value.toUpperCase().replace(/\s/g,'');const m=v.match(/^([A-Z]{3,8})-?([A-Z]{3,8})-?(\d{4})$/);
if(!m){$('#pe').textContent='That code isn’t valid. It has two words and four digits, like RIVER-MANGO-4821.';return}
room.code=m[1]+'-'+m[2]+'-'+m[3];go('/workspace');return}
const kind=f.dataset.kind;
if(!kind){f.outerHTML=`<p class="note" role="status">${esc(f.dataset.ok)}</p>`;return}
const btn=f.querySelector('button');btn.disabled=true;f.querySelector('.bad')?.remove();
try{const r=await fetch('/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});const d=await r.json().catch(()=>({}));
 if(r.ok){f.outerHTML=`<p class="note" role="status">${esc(f.dataset.ok)}</p>`}
 else{const m=d.error||'Something went wrong. Please try again.';btn.disabled=false;say(m);f.insertAdjacentHTML('beforeend',`<p class="bad" role="alert">${esc(m)}</p>`)}}
catch(x){btn.disabled=false;const m='Network error. Please try again.';say(m);f.insertAdjacentHTML('beforeend',`<p class="bad" role="alert">${m}</p>`)}});

/* Theme and routing */
function theme(set){const r=document.documentElement,d=set?set==='dark':r.dataset.theme==='dark';if(set){r.dataset.theme=set;try{localStorage.setItem('sendit-theme',set)}catch(e){}}
const b=$('#th');b.setAttribute('aria-pressed',d);b.textContent=d?'Light mode':'Dark mode';b.onclick=()=>theme(d?'light':'dark')}
function render(keep){const r=location.pathname.replace(/^\/|\/$/g,'')||'home';app.innerHTML=(Object.hasOwn(R,r)?R[r]:R.nf)();
document.querySelectorAll('nav[aria-label=Main] a').forEach(a=>a.pathname==='/'+r?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
if(r==='workspace'){net.ensure(room.code);qr();showQR();if(location.search.includes('shared=1'))takeShared();const m=$('#mx');if(m){m.value=S.max;$('#rl').checked=S.relay}}
if(!keep){{const mt=META['/'+(r==='home'?'':r)]||META['/404'];document.title=mt.title;const dm=document.querySelector('meta[name=description]');dm&&dm.setAttribute('content',mt.desc)}scrollTo(0,0);const h=app.querySelector('h1');if(h&&!first){h.tabIndex=-1;h.focus({preventScroll:true})}}first=false}
function go(p){if(p!==location.pathname+location.search)history.pushState(null,'',p);render()}
addEventListener('popstate',()=>render());
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="/"]');if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target||a.hasAttribute('download'))return;const p=a.getAttribute('href');if(p.startsWith('//'))return;e.preventDefault();go(p)});
theme();render();

if('serviceWorker' in navigator)addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});
 setTimeout(async()=>{try{await Promise.all([import('qrcode'),import('jsqr')]);await navigator.serviceWorker.ready;const c=await caches.open('sendit-v1');
  const urls=[...new Set(performance.getEntriesByType('resource').map(r=>r.name).filter(u=>u.startsWith(location.origin)&&!/\/(api|socket\.io)\//.test(u)))];
  for(const u of urls){try{await c.add(u)}catch(e){}}try{await c.add('/')}catch(e){}}catch(e){}},3000)});
