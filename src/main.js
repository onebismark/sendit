import './style.css';
import { createNet } from './net.js';


const W=['RIVER','MANGO','CEDAR','COBALT','AMBER','HARBOR','QUARTZ','MAPLE'];
const gen=()=>{const a=new Uint32Array(2);crypto.getRandomValues(a);return W[a[0]%W.length]+'-'+(1000+a[1]%9000)};
const room={code:gen(),joined:false,route:'Direct'};
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
const formPage=(t,lead,fields,btn,ok)=>`<section class="wrap narrow"><h1>${t}</h1><p class="lead">${lead}</p><form data-ok="${ok}">${fields}<div class="row"><button class="btn p" type="submit">${btn}</button></div></form></section>`;
const field=(id,l,type='text',extra='')=>`<label for="${id}">${l}</label><input id="${id}" name="${id}" type="${type}" required ${extra}>`;
const DRAFT='Draft template. Have a lawyer review and adapt it before Sendit launches.';

const R={
home:()=>`<section class="wrap hero"><h1>Send a file to any device, on any network.</h1>
<p class="lead">Pair two devices with a short code. Sendit finds the fastest private route between them and cleans up after the transfer.</p>
${codeHtml(room.code)}<p class="mut">This is a room code. Share it, and the other device can join from anywhere.</p>
<div class="row"><a class="btn p" href="#workspace">Open workspace</a><a class="btn" href="#pair">Join with a code</a></div></section>
<section class="wrap"><h2>How a file finds its way</h2><ol class="steps">
<li><div><h3>Pair</h3><p>One device shows a code or link. The other enters it. Rooms close after a time you choose.</p></div></li>
<li><div><h3>Go direct</h3><p>Sendit tries a peer-to-peer WebRTC connection first, so files travel straight between the two devices.</p></div></li>
<li><div><h3>Relay if blocked</h3><p>If a firewall or mobile network blocks the direct route, the file goes through an encrypted relay instead.</p></div></li>
<li><div><h3>Clean up</h3><p>Rooms close automatically and the server never stores your files, so there is nothing left to delete.</p></div></li></ol></section>
<section class="wrap"><h2>What you get</h2><dl class="feat">
<div><dt>Works across networks</dt><dd>Home Wi-Fi to office laptop, phone data to desktop. No shared network needed.</dd></div>
<div><dt>Private in transit</dt><dd>Transfers are encrypted end to end by WebRTC, even when a relay carries them.</dd></div>
<div><dt>Control of every transfer</dt><dd>Watch progress, pause, resume, cancel, or retry a dropped file.</dd></div>
<div><dt>Links that expire</dt><dd>Rooms close automatically after an hour, and a code admits only two devices.</dd></div>
<div><dt>Any file, your limit</dt><dd>Send any file type. Set a size cap that fits your plan or your team.</dd></div></dl>
<div class="band"><h2>Try the workspace</h2><p>The preview simulates a transfer so you can see the full flow.</p><div class="row"><a class="btn p" href="#workspace">Open workspace</a><a class="btn" href="#waitlist">Get early access</a></div></div></section>`,

workspace:()=>{const j=room.joined;return `<section class="wrap"><h1>Workspace</h1>
<p class="note">Open Sendit on a second device and join with your room code. Files go straight between the two devices over an encrypted WebRTC connection.</p>
<div class="grid"><aside class="panel"><h2>Your room</h2>${codeHtml(room.code,'sm')}
<div class="row"><button class="btn sm" data-act="copy" type="button">Copy invite link</button></div>
<ul class="dev"><li><span>This device</span><span class="ok">Online</span></li><li><span>${j?'Other device':'Waiting for a device'}</span>${j?`<span class="ok">${room.route==='Relay'?'Via relay, encrypted':'Direct, encrypted'}</span>`:'<span class="mut">Not joined</span>'}</li></ul>

<label for="mx">Largest file</label><select id="mx"><option value="50">50 MB</option><option value="500">500 MB</option><option value="2048">2 GB</option></select>

<label class="chk" for="rl"><input id="rl" type="checkbox">Relay only, skip direct connection</label></aside>
<div><h2 style="margin-top:0">Send files</h2>
${j?`<label class="drop" id="dz"><b>Drop files here</b> or choose them<input id="fi" type="file" multiple></label>`:`<p class="empty">Connect a second device to start sending. Share your room code, or open Pair on the other device.</p>`}
<ul id="q" aria-label="Transfers"></ul></div></div></section>`},

pair:()=>`<section class="wrap narrow"><h1>Connect a device</h1><p class="lead">Enter the code shown on the other device. Codes look like RIVER-4821.</p>
<form id="pf"><label for="pc">Room code</label><input id="pc" autocomplete="off" autocapitalize="characters" placeholder="RIVER-4821" required aria-describedby="pe"><p id="pe" class="bad" role="alert"></p>
<div class="row"><button class="btn p" type="submit">Join room</button></div></form>
<h2>Other ways to pair</h2><p>Open an invite link sent to you, or show your own code from the <a href="#workspace">workspace</a>. QR pairing is planned for the production build.</p></section>`,

about:()=>textPage('About Sendit','Sendit is a product of Markmix Digital, built by Lord Bismark.',[['Why it exists','Moving a file between two devices still means cables, chat apps that shrink it, or a shared network. Sendit makes it a code and a drop.'],['How it’s built','A real-time signaling service pairs devices, WebRTC carries the file, and an encrypted relay steps in when a direct route is blocked.'],['Who is behind it','Markmix Digital builds websites, runs online radio, and manages social media for its clients. Lord Bismark is the developer of Sendit.']]),
contact:()=>formPage('Contact','Questions, partnerships, or press. Tell us what you need.',field('n','Name')+field('e','Email','email')+`<label for="m">Message</label><textarea id="m" rows="5" required></textarea>`,'Send message','Preview only: nothing was sent. The production form delivers to Markmix Digital.'),
waitlist:()=>formPage('Get early access','Join the waitlist and we’ll invite you as Sendit opens up.',field('e','Email','email','autocomplete="email"'),'Join waitlist','Preview only: nothing was saved. The production form stores your email and confirms by message.'),
signin:()=>formPage('Sign in','You don’t need an account to send files. Accounts will add history and team limits.',field('e','Email','email','autocomplete="email"')+field('p','Password','password','autocomplete="current-password"'),'Sign in','Preview only: sign in is part of the production build.'),
faq:()=>faqPage('Questions','Short answers about how Sendit works.',[['Do both devices need the same Wi-Fi?','No. Devices pair with a code and connect across networks.'],['Is it private?','Transfers are encrypted end to end by WebRTC between the two devices, including when a relay carries them.'],['What if a direct connection fails?','Sendit switches to an encrypted relay automatically. You can also force the relay.'],['How big can a file be?','You set the limit: 50 MB, 500 MB, or 2 GB. Received files are held in the browser’s memory, so very large files need a device with enough RAM.'],['How long are files kept?','Files are never stored on our servers. A received file stays in the other device’s browser until you save or remove it.'],['Do I need an account?','No. Accounts are optional.']]),
help:()=>textPage('Help','Everything you need to send your first file.',[['Send your first file','Open the workspace, share your code or invite link, and drop files once the other device joins.'],['Join from another device','Go to Pair, enter the code, and select Join room.'],['If a transfer stops','Select Retry to send the file again. If it keeps failing, turn on relay only.'],['Limits and expiry','Pick the largest file in the workspace. Rooms close automatically after an hour. Files over the limit are rejected before sending.']]),
privacy:()=>textPage('Privacy policy','How Sendit treats your data.',[['What we collect','Room codes, connection metadata needed to pair devices, and the email you give us for the waitlist or an account.'],['What we don’t keep','Files go from device to device and are never stored on our servers. If a direct route is blocked they pass through an encrypted relay without being stored.'],['Your choices','Ask us to delete your waitlist or account data at any time through the contact page.']],DRAFT),
terms:()=>textPage('Terms of service','The rules for using Sendit.',[['Acceptable use','Don’t send unlawful content, malware, or files you have no right to share.'],['Availability','We aim for reliable transfers but can’t guarantee uninterrupted service.'],['Limits','File size, link lifetime, and rate limits may change as the service grows.']],DRAFT),
nf:()=>textPage('Page not found','That page doesn’t exist. Try the workspace or head home.',[])};

/* Transfers */
const lb={queued:'Waiting',sending:'Sending',paused:'Paused',done:'Delivered',failed:'Failed',cancelled:'Cancelled'};
const btns=f=>f.dir==='in'?(f.status==='done'?['remove|Remove']:[]):f.status==='sending'?['pause|Pause','cancel|Cancel']:f.status==='paused'?['resume|Resume','cancel|Cancel']:f.status==='failed'?[...(f.over?[]:['resume|Retry']),'remove|Remove']:['remove|Remove'];
const li=f=>`<li data-id="${f.id}"><div class="nm"><b>${esc(f.name)}</b><span>${fmt(f.size)}</span></div><progress max="100" value="${f.pct}" aria-label="Progress for ${esc(f.name)}"></progress><div class="st"><span class="s-${f.status}">${esc(f.msg||lb[f.status])}</span><span class="sp"></span></div><div class="act">${f.url?`<a class="btn sm p" href="${f.url}" download="${esc(f.name)}">Save</a>`:''}${btns(f).map(b=>{const[a,l]=b.split('|');return `<button class="btn sm" type="button" data-act="${a}" data-id="${f.id}">${l}</button>`}).join('')}</div></li>`;
function qr(focusId){const u=$('#q');if(!u)return;u.innerHTML=S.files.length?S.files.map(li).join(''):'<li class="empty">Nothing queued yet.</li>';if(focusId){const b=u.querySelector(`li[data-id="${focusId}"] button`);b&&b.focus()}}
/* Network */
const inb=new Map();
const setPct=f=>{const l=document.querySelector(`li[data-id="${f.id}"]`);if(l){l.querySelector('progress').value=f.pct;l.querySelector('.sp').textContent=Math.round(f.pct)+'%'}};
const upd=(f,p)=>{f.pct=p;if(Math.floor(p)!==f.last){f.last=Math.floor(p);setPct(f)}};
const net=createNet({
 state(s,route){
  if(s==='open'){room.joined=true;room.route=route;say('Device connected')}
  else{if(room.joined)say('Device disconnected');room.joined=false;
   S.files.forEach(f=>{if(f.dir!=='in'&&(f.status==='sending'||f.status==='paused')){f.status='failed';f.sent=0;f.msg='Connection lost. Retry sends the file again.'}});
   if(s==='expired'){room.code=gen();say('The room expired. A new code was created.')}}
  if(location.hash==='#workspace')render(1)},
 error:m=>say(m),
 progress(id,p){const f=S.files.find(x=>x.id===id);f&&upd(f,p)},
 ack(id){const f=S.files.find(x=>x.id===id&&x.dir!=='in');if(f){f.status='done';f.pct=100;f.msg='';qr(f.id);say(f.name+' delivered')}},
 recvStart(m){const f={id:'r'+(++seq),name:m.name,size:m.size,pct:0,status:'sending',dir:'in',msg:'Receiving'};inb.set(m.id,f);S.files.push(f);qr();say('Receiving '+f.name)},
 recvProgress(id,p){const f=inb.get(id);f&&upd(f,p)},
 recvDone(id,blob){const f=inb.get(id);if(f){f.url=URL.createObjectURL(blob);f.status='done';f.pct=100;f.msg='Received';inb.delete(id);qr(f.id);say(f.name+' received')}},
 recvCancel(id){const f=inb.get(id);if(f){f.status='cancelled';f.msg='';inb.delete(id);qr()}}
});
let pumping=false;
async function pump(){if(pumping)return;pumping=true;
 try{for(let f;f=S.files.find(x=>x.dir!=='in'&&x.status==='sending'&&!x.sent);){f.sent=1;
  try{const r=await net.send(f.id,f.file,{paused:()=>f.status==='paused',stop:()=>f.status==='cancelled'||!room.joined});
   if(r==='stopped'&&f.status==='sending'){f.status='failed';f.sent=0;f.msg='Not connected. Retry once the other device is back.';qr(f.id)}}
  catch(e){f.status='failed';f.sent=0;f.msg='Connection dropped. Retry sends the file again.';qr(f.id)}}}
 finally{pumping=false}}
function add(list){[...list].forEach(x=>{const f={id:++seq,name:x.name,size:x.size,pct:0,status:'sending',file:x};
 if(x.size/1e6>S.max){f.status='failed';f.over=1;f.msg=`Over the ${lim()} limit. Raise the limit or send a smaller file.`}S.files.push(f)});qr();say(list.length+' file(s) added');pump()}
function act(a,id){const f=S.files.find(x=>x.id==id);if(!f)return;
 if(a==='pause')f.status='paused';
 else if(a==='resume'){if(f.status==='failed'){f.pct=0;f.sent=0;f.last=-1}f.status='sending';f.msg='';pump()}
 else if(a==='cancel'){f.status='cancelled';f.msg=''}
 else if(a==='remove'){if(f.url)URL.revokeObjectURL(f.url);S.files=S.files.filter(x=>x!==f)}
 qr(a==='remove'?0:id);say(a+' '+f.name)}

/* Events */
app.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
if(a==='copy'){try{navigator.clipboard.writeText(location.origin+location.pathname+'#pair')}catch(x){}say('Invite link copied')}
else act(a,b.dataset.id)});
app.addEventListener('change',e=>{const t=e.target;
if(t.id==='mx')S.max=+t.value;if(t.id==='rl'){S.relay=t.checked;net.reset(S.relay);render(1)}
if(t.id==='fi'){add(t.files);t.value=''}});
app.addEventListener('dragover',e=>{const d=e.target.closest('#dz');if(d){e.preventDefault();d.classList.add('on')}});
app.addEventListener('dragleave',e=>{const d=e.target.closest('#dz');d&&d.classList.remove('on')});
app.addEventListener('drop',e=>{const d=e.target.closest('#dz');if(d){e.preventDefault();d.classList.remove('on');add(e.dataTransfer.files)}});
app.addEventListener('submit',e=>{e.preventDefault();const f=e.target;
if(f.id==='pf'){const v=$('#pc').value.toUpperCase().replace(/\s/g,'');const m=v.match(/^([A-Z]{3,8})-?(\d{4})$/);
if(!m){$('#pe').textContent='That code isn’t valid. Use letters, a hyphen, then four digits, like RIVER-4821.';return}
room.code=m[1]+'-'+m[2];location.hash='workspace';return}
f.outerHTML=`<p class="note" role="status">${esc(f.dataset.ok)}</p>`});

/* Theme and routing */
function theme(set){const r=document.documentElement,d=set?set==='dark':r.dataset.theme==='dark';if(set){r.dataset.theme=set;try{localStorage.setItem('sendit-theme',set)}catch(e){}}
const b=$('#th');b.setAttribute('aria-pressed',d);b.textContent=d?'Light mode':'Dark mode';b.onclick=()=>theme(d?'light':'dark')}
function render(keep){const r=location.hash.slice(1)||'home';app.innerHTML=(R[r]||R.nf)();
document.querySelectorAll('nav[aria-label=Main] a').forEach(a=>a.hash==='#'+r?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
if(r==='workspace'){net.ensure(room.code);qr();const m=$('#mx');if(m){m.value=S.max;$('#rl').checked=S.relay}}
if(!keep){document.title=(r==='home'?'Sendit – send files to any device':r[0].toUpperCase()+r.slice(1)+' – Sendit');scrollTo(0,0);const h=app.querySelector('h1');if(h&&!first){h.tabIndex=-1;h.focus({preventScroll:true})}}first=false}
addEventListener('hashchange',()=>render());
theme();render();
