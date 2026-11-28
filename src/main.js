import './style.css';
import { createNet } from './net.js';
import { WORDS } from './words.js';
import { META } from './meta.js';

const S={files:[],relay:false};
let seq=0,first=true,txT=0;
const $=s=>document.querySelector(s),app=$('#app');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=b=>b>=1e9?(b/1e9).toFixed(1)+' GB':b>=1e6?(b/1e6).toFixed(1)+' MB':Math.max(1,Math.round(b/1e3))+' KB';
const say=t=>{$('#live').textContent=t};
const gen=()=>{const a=new Uint32Array(2);crypto.getRandomValues(a);return WORDS[a[0]%WORDS.length]+'-'+(1000+a[1]%9000)};
const room={code:gen(),own:true,active:false,req:false,auto:false,joined:false,route:'Direct',verify:'',status:'',log:[],text:''};
function logStatus(t){room.status=t;room.log.push(new Date().toLocaleTimeString()+'  '+t);if(room.log.length>14)room.log.shift();const e=$('#st');if(e)e.textContent=t;const l=$('#lg');if(l)l.textContent=room.log.join('\n')}
const ui={mode:new URLSearchParams(location.search).get('mode')==='local'?'local':'cloud',tab:'send',enter:false,err:'',ec:'',dot:{recv:0,text:false}};
const off={stage:'idle',out:'',outQr:'',kind:'',err:'',busy:false,stream:null,scanning:false,paste:''};
const onHome=()=>location.pathname==='/'||location.pathname==='/workspace';
const WIFI='M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',UP='M12 16V4m0 0L7 9m5-5 5 5M4 20h16',LOCK='M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z',QRI='M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v7h-3M14 20h.01',TICK='M20 6 9 17l-5-5';
const ic=d=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const codeHtml=(c,cls='')=>`<div class="code ${cls}">${[...c].map((ch,i)=>`<span class="${/\d/.test(ch)?'d':''}" style="--i:${i}">${ch}</span>`).join('')}</div>`;

/* Reusable templates */
const textPage=(t,lead,secs,banner)=>`<section class="wrap narrow"><h1>${t}</h1><p class="lead">${lead}</p>${banner?`<p class="note">${banner}</p>`:''}${secs.map(([a,b])=>`<h2>${a}</h2><p>${b}</p>`).join('')}</section>`;
const faqPage=(t,lead,qs)=>`<section class="wrap narrow"><h1>${t}</h1><p class="lead">${lead}</p>${qs.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`;
const formPage=(t,lead,fields,btn,ok,kind='')=>`<section class="wrap narrow"><h1>${t}</h1><p class="lead">${lead}</p><form data-ok="${ok}" data-kind="${kind}">${kind?'<input class="vh" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">':''}${fields}<div class="row"><button class="btn p" type="submit">${btn}</button></div></form></section>`;
const field=(id,l,type='text',extra='')=>`<label for="${id}">${l}</label><input id="${id}" name="${id}" type="${type}" required ${extra}>`;
const DRAFT='Draft template. Have a lawyer review and adapt it before Sendit launches.';

const R={
about:()=>textPage('About Sendit','Sendit is a product of Markmix Digital, built by Lord Bismark.',[['Why it exists','Moving a file between two devices still means cables, chat apps that shrink it, or a shared network. Sendit makes it a code and a drop.'],['How it’s built','A real-time signaling service pairs devices, WebRTC carries the file, and an encrypted relay steps in when a direct route is blocked.'],['Who is behind it','Markmix Digital builds websites, runs online radio, and manages social media for its clients. Lord Bismark is the developer of Sendit.']]),
contact:()=>formPage('Contact','Questions, partnerships, or press. Tell us what you need.',field('n','Name')+field('e','Email','email')+`<label for="m">Message</label><textarea id="m" rows="5" required></textarea>`,'Send message','Thanks. Your message was sent to Markmix Digital.','contact'),
waitlist:()=>formPage('Get early access','Join the waitlist and we’ll invite you as Sendit opens up.',field('e','Email','email','autocomplete="email"'),'Join waitlist','You’re on the list. We’ll email you when early access opens.','waitlist'),
signin:()=>formPage('Sign in','You don’t need an account to send files. Accounts will add history and team limits.',field('e','Email','email','autocomplete="email"')+field('p','Password','password','autocomplete="current-password"'),'Sign in','Preview only: sign in is part of the production build.'),
faq:()=>faqPage('Questions','Short answers about how Sendit works.',[['Do both devices need the same Wi-Fi?','No. Devices pair with a code and connect across networks.'],['Can a stranger join my room?','No. Every new device has to be approved by the device that made the code. You tap Allow or Deny. After that, each file still asks for Accept unless you turn on automatic accepting.'],['Can I use Sendit without internet?','Yes. Choose Same network, create a local invitation on one device, and scan or paste it on the other. Then show the reply back to the first device. No server and no internet are used. Open Sendit once online on each device first so it is saved. Some guest Wi-Fi networks stop devices from seeing each other, and a phone hotspot is the usual fix.'],['Is it private?','Transfers are encrypted end to end between the two devices, on direct connections and through the server relay.'],['What if a direct connection fails?','Sendit switches to the server relay automatically. Files stay end-to-end encrypted, so the server cannot read them. The relay is slower, and you can force it with the relay-only option.'],['Is there a file size limit?','Sendit sets none. Chrome and Edge on a computer save large files straight to disk. Other browsers hold a received file in memory, so a very large file can fail on a phone.'],['Can I share text too?','Yes. Open the Text tab, type or paste, and it appears on the connected device as you type.'],['How long are files kept?','Files are never stored on our servers. A received file stays in the other device’s browser until you save or remove it.'],['Do I need an account?','No. Accounts are optional.']]),
help:()=>textPage('Help','Everything you need to send your first file.',[['Send your first file','Open the workspace, share your code or invite link, and drop files once the other device joins.'],['Join from another device','Go to Pair, enter the code, and select Join room.'],['If a transfer stops','Select Retry. If the other device still has the part it received, Sendit continues from there. If it keeps failing, turn on relay only.'],['Without internet','Choose Same network on the main page. Create a local invitation on one device and scan or paste it on the other, then show the reply back to the first device. Both devices need to be on the same Wi-Fi or hotspot.'],['Sharing text','Open the Text tab on either device. What you type or paste appears on the other device as you type.'],['Rooms','A room closes automatically after an hour, or after 10 minutes if nobody joins. Make a new code at any time.']]),
privacy:()=>textPage('Privacy policy','How Sendit treats your data.',[['What we collect','Room codes and the connection details needed to pair two devices, your IP address (kept in memory for about a minute to limit abuse), and anything you submit through the contact or waitlist forms: name, email and message.'],['What we don’t keep','Files go from device to device and are never stored on our servers. If a direct route is blocked they pass through our server relay. They are encrypted end to end, so we cannot read them, and they are not stored.'],['How we use form data','Only to reply to you or to tell you when early access opens. It is stored in our database and may be emailed to the Sendit team.'],['Cookies and storage','Sendit sets no cookies. Your browser keeps your light or dark choice on your device.'],['Service providers','We use hosting, relay and email providers to run Sendit. They process data only to provide those services.'],['Children','Sendit is not directed at children under 13.'],['Your choices','Ask us to delete your waitlist or message data at any time through the contact page.']],DRAFT),
terms:()=>textPage('Terms of service','The rules for using Sendit.',[['Acceptable use','Don’t send unlawful content, malware, or files you have no right to share. Don’t try to disrupt the service or guess other people’s room codes.'],['Your files','You are responsible for what you send. Sendit does not store or review files, and the other device decides whether to accept them.'],['Availability','We aim for reliable transfers but can’t guarantee uninterrupted service. Rooms close automatically after a set time.'],['Limits','File size, room lifetime and rate limits may change as the service grows.'],['No warranty and liability','Sendit is provided as is. To the extent the law allows, Markmix Digital is not liable for lost or corrupted transfers.'],['Changes','We may update these terms. Continued use means you accept the new version.'],['Contact','Use the contact page for questions about these terms.']],DRAFT),
nf:()=>textPage('Page not found','That page doesn’t exist. Try the workspace or head home.',[])};


/* Main page: cloud sharing (default) and same network */
const ART='<svg class="art" viewBox="0 0 320 180" role="img" aria-label="A laptop sending a file to a phone"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><rect x="20" y="30" width="120" height="85" rx="8"/><path d="M8 125h144"/><rect x="236" y="22" width="52" height="100" rx="10"/></g><path class="dash" d="M150 74q40-34 80 0" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linecap="round"/><rect x="176" y="40" width="26" height="32" rx="4" fill="none" stroke="var(--acc)" stroke-width="3"/><path d="M182 52h14M182 60h14" stroke="var(--acc)" stroke-width="2.5" stroke-linecap="round"/><text x="80" y="160" text-anchor="middle" fill="var(--mut)" font-size="12">Laptop</text><text x="262" y="160" text-anchor="middle" fill="var(--mut)" font-size="12">Phone</text></svg>';
const NOTES=`<div class="notes"><div><h3>${ic(WIFI)}Works across networks</h3><p>Home Wi-Fi, office or mobile data. No shared network needed.</p></div><div><h3>${ic(LOCK)}Private by default</h3><p>Files are encrypted in transit and go from device to device. Nothing is kept on our server.</p></div><div><h3>${ic(TICK)}Automatic cleanup</h3><p>Rooms close on their own, and there are no stored files to delete.</p></div></div>`;
const REQ='<details class="req"><summary>Offline pairing &amp; network requirements</summary><ul><li>Both devices must be on the same Wi-Fi or hotspot. A phone hotspot with mobile data off works.</li><li>Open Sendit once with internet on each device first, so it is saved for offline use.</li><li>Allow the camera if you want to scan codes. It also helps the two devices find each other.</li><li>Some guest or public Wi-Fi stops devices from reaching each other. Use a phone hotspot instead.</li><li>Keep both devices open until the transfer finishes.</li></ul></details>';
function pill(){
 if(room.joined)return['Connected','ok'];
 if(ui.mode==='local')return[off.stage==='idle'?'Ready to pair':'Waiting for the other device','wait'];
 return room.active?['Waiting for a device','wait']:['Ready to pair',''];
}
function cloudPanel(){
 const j=room.joined;
 const head='<div class="ph"><h2>Pair devices</h2><span class="badge">ENCRYPTED</span></div><p class="mut small">Connect any phone, tablet or computer with one private code.</p>';
 let b;
 if(!room.active&&!ui.enter){
  b=`<div class="devrow"><span class="dv" aria-hidden="true">${ic(QRI)}</span><div><b>This device</b><div class="mut small">Not paired yet</div></div></div><button class="btn p wide" type="button" data-act="create">${ic(QRI)}Create code</button><button class="btn wide" type="button" data-act="enter">Enter code</button><p class="mut small">Codes expire automatically, and every new device needs your approval.</p>`;
 }else if(ui.enter&&!room.active){
  b=`<label for="ec">Room code</label><input id="ec" value="${esc(ui.ec)}" placeholder="FAITH-4821" autocomplete="off" autocapitalize="characters" aria-describedby="ee"><p id="ee" class="bad" role="alert">${esc(ui.err)}</p><div class="row"><button class="btn p" type="button" data-act="join-code">Join room</button><button class="btn" type="button" data-act="enter-cancel">Cancel</button></div>`;
 }else{
  const dev=j?'Paired · '+(room.route==='Relay'?'via server relay':room.route==='Local'?'same network':'direct'):(room.status||'Connecting…');
  b=`<div class="devrow"><span class="dv" aria-hidden="true">${ic(QRI)}</span><div><b>This device</b><div class="mut small" id="st">${esc(dev)}</div></div></div>`
  +(j?`<p class="mut small">Room ${esc(room.code)}</p>`:room.own?`${codeHtml(room.code,'sm')}<img class="qr" id="qr" alt="QR code. Scan it with a phone camera to join this room." width="160" height="160"><div class="row"><button class="btn sm" type="button" data-act="copy">Copy invite link</button></div>`:`<p>Joining room <b>${esc(room.code)}</b>…</p>`)
  +(room.req?`<div class="note" role="alertdialog" aria-label="A device wants to join"><b>A device wants to join this room.</b><label class="chk" for="au"><input id="au" type="checkbox" ${room.auto?'checked':''}>Accept files from it automatically (files over 200 MB still ask)</label><div class="row"><button class="btn p sm" data-act="allow" type="button">Allow</button><button class="btn sm" data-act="deny" type="button">Deny</button></div></div>`:'')
  +(j&&room.verify?`<p class="note">Check that both devices show <b>${esc(room.verify)}</b>. If they differ, disconnect.</p>`:'')
  +(j?`<label class="chk" for="au"><input id="au" type="checkbox" ${room.auto?'checked':''}>Accept files automatically on this connection (files over 200 MB still ask)</label>`:'')
  +`<label class="chk" for="rl"><input id="rl" type="checkbox" ${S.relay?'checked':''}>Use the server relay only (slower, works on any network)</label><details><summary>Connection details</summary><pre id="lg">${esc(room.log.join('\n'))}</pre></details><div class="row"><button class="btn" type="button" data-act="leave">${j?'Disconnect':'Cancel'}</button></div>`;
 }
 return `<aside class="panel" aria-label="Pair devices">${head}${b}</aside>`;
}
function localPanel(){
 const paired=room.joined;
 const err=off.err?`<p class="bad" role="alert">${esc(off.err)}</p>`:'';
 const cam=off.stream?'<video id="ov" playsinline muted style="width:100%;max-width:22rem;border-radius:.6rem;background:#000;margin:.5rem 0"></video>':'';
 const box=off.out?`<img class="qr" src="${off.outQr}" alt="QR code of the ${off.kind}" width="240" height="240"><label for="ot">Pairing text</label><textarea id="ot" rows="3" readonly>${esc(off.out)}</textarea><div class="row"><button class="btn sm" type="button" data-act="off-copy">Copy</button><a class="btn sm" download="sendit-${off.kind}.txt" href="data:text/plain;charset=utf-8,${encodeURIComponent(off.out)}">Save as file</a></div>`:'';
 let c1;
 if(paired)c1=`<p><b>Paired.</b> ${room.route==='Local'?'You are connected on the same network.':'You are connected through a room code.'}</p><div class="row"><button class="btn" type="button" data-act="leave">Disconnect</button></div>`;
 else if(off.busy)c1='<p role="status">Working…</p>';
 else if(off.stage==='idle')c1=`<h3>1. Invite a device</h3><button class="btn p" type="button" data-act="off-create">${ic(WIFI)}Create local invitation</button>`;
 else if(off.stage==='host')c1=`<h3>1. Show this invitation</h3><p class="mut small">Point the other device’s camera at it, or send it the text or file. Then show it the reply that appears.</p>${box}${cam}`;
 else if(off.stage==='reply')c1=`<h3>Show this reply</h3><p class="mut small">Hold it up to the first device’s camera, or send it the text or file. This page connects as soon as it accepts.</p>${box}`;
 else c1='<p role="status">Connecting…</p>';
 const c2=paired?'':`<h3>2. Exchange invitation &amp; reply</h3><label for="oc" class="mut small">Invitation or reply from the other device</label><textarea id="oc" rows="4" placeholder="Paste pairing text">${esc(off.paste)}</textarea><div class="row"><button class="btn p" type="button" data-act="off-accept">${ic(TICK)}Accept pairing</button><label class="btn" for="opf">${ic(UP)}Open pairing file</label><input class="vh" id="opf" type="file" accept=".txt,.sendit,text/plain"><button class="btn" type="button" data-act="off-scan">Scan with camera</button></div>${off.stage==='host'?'':cam}`;
 const reset=!paired&&off.stage!=='idle'?'<div class="row"><button class="btn" type="button" data-act="off-reset">Start over</button></div>':'';
 return `<aside class="panel" aria-label="Nearby devices"><div class="ph"><h2>${ic(WIFI)}Nearby devices</h2><span class="pill ${paired?'ok':''}">${paired?'Paired':'Not paired'}</span></div><p class="mut small">Same Wi-Fi or hotspot · No mobile data · No cloud uploads</p>${err}<div class="cols"><div>${c1}${reset}</div><div>${c2}</div></div></aside>`;
}
R.home=()=>{
 const local=ui.mode==='local',[pt,pc]=pill(),t=ui.tab;
 const seg=`<div class="bar2"><div class="seg" role="group" aria-label="Sharing mode"><button type="button" class="${local?'':'on'}" aria-pressed="${!local}" data-act="mode-cloud">${ic(UP)}Cloud sharing</button><button type="button" class="${local?'on':''}" aria-pressed="${local}" data-act="mode-local">${ic(WIFI)}Same network</button></div><span class="mut">Local or across networks</span></div>`;
 const hero=`<div class="hero2"><div><p class="eyebrow">${local?'SHARE NEARBY':'SHARE ANYWHERE'}</p><h1>Send files between devices.<br><span class="acc">${local?'No internet needed.':'Any network.'}</span></h1><p class="lead">${local?'Connect on the same Wi-Fi or hotspot. Pair locally and send directly, without uploading your files.':'Pair with a secure code, QR or link and move files privately, even when your devices are on different networks.'}</p></div>${ART}</div>`;
 const tab=(k,l,dot)=>`<button type="button" role="tab" id="tb-${k}" aria-selected="${t===k}" class="${t===k?'on':''}" data-act="tab-${k}">${l}${dot}</button>`;
 const tabs=`<div class="tabs" role="tablist" aria-label="Share">${tab('send','Send','')}${tab('recv','Receive',`<i class="dot" id="dr" ${ui.dot.recv?'':'hidden'}></i>`)}${tab('text','Text',`<i class="dot" id="dt" ${ui.dot.text?'':'hidden'}></i>`)}<span class="pill ${pc}" id="pl" role="status">${esc(pt)}</span></div>`;
 const send=`<div role="tabpanel" aria-labelledby="tb-send" ${t==='send'?'':'hidden'}><label class="drop" id="dz"><span class="upi">${ic(UP)}</span><b>Drop files here to send</b><span class="mut">${room.joined?'Connected. Files send straight away.':'No need to pair first. We create a secure code automatically.'}</span><span class="btn p">Choose files</span><input id="fi" type="file" multiple></label><p class="mut small">Any file type</p><ul id="q" class="flist" aria-label="Files you are sending"></ul></div>`;
 const recv=`<div role="tabpanel" aria-labelledby="tb-recv" ${t==='recv'?'':'hidden'}><ul id="rq" class="flist" aria-label="Incoming files"></ul></div>`;
 const text=`<div role="tabpanel" aria-labelledby="tb-text" ${t==='text'?'':'hidden'}><label for="tx" class="vh">Shared text</label><textarea id="tx" rows="8" maxlength="20000" placeholder="Type or paste text here. It appears on the other device as you type.">${esc(room.text)}</textarea><div class="row"><button class="btn sm" type="button" data-act="text-copy">Copy</button><button class="btn sm" type="button" data-act="text-clear">Clear</button><span class="mut small">${room.joined?'Live on the connected device':'Connect a device to share this text live'}</span></div></div>`;
 const share=`<section class="panel share" aria-label="Share files and text">${tabs}<div class="pb">${send}${recv}${text}</div></section>`;
 return `<section class="wrap">${seg}${hero}<div class="g2">${share}${local?localPanel():cloudPanel()}</div>${local?REQ:''}<section class="sess" aria-labelledby="sh"><h2 id="sh">${local?'Received locally':'Session files'} <span class="cnt" id="sc">0 available</span></h2><ul id="sf" class="flist"></ul></section>${NOTES}</section>`};

/* Transfers */
const lb={pending:'Incoming',queued:'Waiting for a device',sending:'Sending',paused:'Paused',done:'Delivered',failed:'Failed',cancelled:'Cancelled'};
const btns=f=>f.dir==='in'?(f.status==='pending'?['accept|Accept','decline|Decline']:f.status==='sending'?[]:['remove|Remove']):f.status==='sending'?['pause|Pause','cancel|Cancel']:f.status==='paused'?['resume|Resume','cancel|Cancel']:f.status==='queued'?['cancel|Cancel']:f.status==='failed'?['resume|Retry','remove|Remove']:['remove|Remove'];
const li=f=>`<li data-id="${f.id}"><div class="nm"><b>${esc(f.name)}</b><span>${fmt(f.size)}</span></div><progress max="100" value="${f.pct}" aria-label="Progress for ${esc(f.name)}"></progress><div class="st"><span class="s-${f.status}">${esc(f.msg||lb[f.status])}</span><span class="sp"></span></div><div class="act">${f.url?`<a class="btn sm p" href="${f.url}" download="${esc(f.name)}">Save</a>`:''}${btns(f).map(b=>{const[a,l]=b.split('|');return `<button class="btn sm" type="button" data-act="${a}" data-id="${f.id}">${l}</button>`}).join('')}</div></li>`;
function qr(focusId){
 const out=$('#q'),inc=$('#rq'),sf=$('#sf');if(!out&&!inc&&!sf)return;
 const o=S.files.filter(f=>f.dir!=='in'),i=S.files.filter(f=>f.dir==='in'&&f.status!=='done'),d=S.files.filter(f=>f.dir==='in'&&f.status==='done');
 if(out)out.innerHTML=o.length?o.map(li).join(''):'<li class="empty">Nothing to send yet.</li>';
 if(inc)inc.innerHTML=i.length?i.map(li).join(''):'<li class="empty">Incoming files appear here. You choose whether to accept each one.</li>';
 if(sf)sf.innerHTML=d.length?d.map(li).join(''):'<li class="empty">Pair a device or choose files to begin.</li>';
 const c=$('#sc');if(c)c.textContent=d.length+' available';
 if(focusId){const b=document.querySelector(`li[data-id="${focusId}"] button`);b&&b.focus()}
}

/* Network */
const WAIT='Waiting for the other device to accept';
const tok=()=>{const a=new Uint8Array(12);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,'0')).join('')};
const byTok=k=>S.files.find(x=>x.tok===k&&x.dir==='in');
const setPct=f=>{const l=document.querySelector(`li[data-id="${f.id}"]`);if(l){l.querySelector('progress').value=f.pct;l.querySelector('.sp').textContent=Math.round(f.pct)+'%'}};
const upd=(f,p)=>{if(f.msg===WAIT){f.msg='';qr(f.id)}f.pct=p;if(Math.floor(p)!==f.last){f.last=Math.floor(p);setPct(f)}};
const fail=(f,m)=>{f.status='failed';f.sent=0;f.msg=m;qr(f.id)};
const updTabs=()=>{const a=$('#dr'),b=$('#dt');if(a)a.hidden=!ui.dot.recv;if(b)b.hidden=!ui.dot.text};
const net=createNet({
 state(s,route,verify){
  if(s==='open'){
   room.joined=true;room.route=route;room.verify=verify||'';say('Device connected');
   if(route==='Local'){off.stage='idle';off.out='';off.paste='';camOff()}
   S.files.forEach(f=>{if(f.status==='queued'){f.status='sending';f.msg=''}});pump();
   if(room.text)net.sendText(room.text);
  }else{
   if(room.joined)say('Device disconnected');room.joined=false;room.verify='';
   S.files=S.files.filter(f=>!(f.dir==='in'&&f.status==='pending'));
   S.files.forEach(f=>{if(f.status==='sending'||f.status==='paused'){f.status='failed';f.sent=0;f.msg=f.dir==='in'?'Connection lost. It continues if the sender retries.':'Connection lost. Retry continues the file.'}});
   if(s==='expired'){room.code=gen();room.own=true;room.auto=false;say('The room expired. A new code was created.')}
   if(route==='left'){room.auto=false;room.req=false}
   if((off.stage==='wait'||off.stage==='reply')&&ui.mode==='local'){off.err='The connection didn’t start. Try again, and make sure both devices are on the same Wi-Fi or hotspot.';off.stage='idle';off.out=''}
  }
  if(onHome())render(1)},
 error:m=>{say(m);logStatus(m)},
 status:logStatus,
 joinRequest(){room.req=true;say('A device wants to join. Allow or deny.');logStatus('A device wants to join your room.');if(onHome())render(1)},
 joinCancel(){room.req=false;logStatus('The device that asked to join gave up.');if(onHome())render(1)},
 taken(){room.code=gen();room.own=true;if(onHome())render(1)},
 text(v){room.text=v;const ta=$('#tx');if(ta&&ta.value!==v){const s=ta.selectionStart;ta.value=v;try{ta.setSelectionRange(s,s)}catch(e){}}if(ui.tab!=='text'){ui.dot.text=true;updTabs()}},
 progress(id,p){const f=S.files.find(x=>x.id===id);f&&upd(f,p)},
 ack(id){const f=S.files.find(x=>x.id===id&&x.dir!=='in');if(f){f.status='done';f.pct=100;f.msg='';qr(f.id);say(f.name+' delivered')}},
 recvStart(i){
  const f={id:'r'+(++seq),tok:i.k,name:i.name,size:i.size,pct:0,status:'pending',dir:'in',msg:'Wants to send you this file'};
  S.files.push(f);
  if(room.auto&&i.size<200e6){f.status='sending';f.msg='Receiving';net.accept(f.tok,true,null)}
  if(ui.tab==='send'&&onHome()){ui.tab='recv';render(1)}else{if(ui.tab!=='recv'){ui.dot.recv=1;updTabs()}qr()}
  say('Incoming file: '+f.name)},
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
function add(list){
 let created=false;
 [...list].forEach(x=>{const f={id:++seq,tok:tok(),name:x.name,size:x.size,pct:0,status:'sending',file:x};
  if(!room.joined){f.status='queued';f.msg='Waiting for a device to connect'}
  S.files.push(f)});
 // dropping files first is fine: the pairing code is created automatically
 if(!room.joined&&ui.mode==='cloud'&&!room.active){room.active=true;created=true}
 ui.tab='send';say(list.length+' file(s) added');
 if(created)render(1);else{qr();if(!$('#q'))render(1)}
 pump()}
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
 history.replaceState(null,'','/');if(files.length)add(files)}catch(e){}}
function leave(){room.code=gen();room.own=true;room.active=false;room.req=false;room.auto=false;room.status='';room.log=[];off.stage='idle';off.out='';off.paste='';camOff();net.leave();render(1)}
function joinCode(){
 const el=$('#ec'),raw=el?el.value:ui.ec;ui.ec=raw;
 const m=String(raw).toUpperCase().replace(/\s/g,'').match(/^([A-Z]{3,8})-?(\d{4})$/);
 if(!m){ui.err='That code isn’t valid. It is one word, a hyphen and four digits, like FAITH-4821.';render(1);return}
 room.code=m[1]+'-'+m[2];room.own=false;room.active=true;ui.enter=false;ui.err='';render(1)}

/* Same network: pair with two codes, no server and no internet */
const qrData=t=>import('qrcode').then(x=>(x.default||x).toDataURL(t,{margin:2,width:320,errorCorrectionLevel:'L'}));
async function getCam(){if(off.stream)return true;try{off.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});return true}catch(e){off.stream=null;return false}}
function camOff(){if(off.stream)off.stream.getTracks().forEach(t=>t.stop());off.stream=null;off.scanning=false}
function attachCam(){const v=$('#ov');if(v&&off.stream&&v.srcObject!==off.stream){v.srcObject=off.stream;const p=v.play();p&&p.catch&&p.catch(()=>{})}}
async function scanLoop(){
 if(off.scanning||!off.stream)return;off.scanning=true;
 const jsQR=(await import('jsqr')).default,c=document.createElement('canvas'),x=c.getContext('2d',{willReadFrequently:true});let last=0;
 const tick=t=>{if(!off.scanning||!off.stream)return;const v=$('#ov');
  if(v&&v.videoWidth&&t-last>150){last=t;const k=Math.min(1,640/v.videoWidth);c.width=Math.round(v.videoWidth*k);c.height=Math.round(v.videoHeight*k);x.drawImage(v,0,0,c.width,c.height);
   const d=x.getImageData(0,0,c.width,c.height),r=jsQR(d.data,d.width,d.height);if(r&&r.data&&r.data.length>40){off.scanning=false;offUse(r.data);return}}
  requestAnimationFrame(tick)};
 requestAnimationFrame(tick)}
async function offUse(v){
 off.err='';
 try{
  const r=await net.manualAccept(String(v).trim());
  camOff();off.paste='';
  if(r==='done'){off.stage='wait';off.out=''}
  else{off.out=r;off.outQr=await qrData(r);off.kind='reply';off.stage='reply'}
 }catch(e){off.err='That pairing text didn’t work. Check it and try again.';if(off.stream)setTimeout(scanLoop,600)}
 off.busy=false;render(1)}
async function offAct(a){
 off.err='';
 try{
  if(a==='reset'){net.manualStop();camOff();Object.assign(off,{stage:'idle',out:'',outQr:'',kind:'',paste:'',busy:false})}
  else if(a==='copy'){try{await navigator.clipboard.writeText(off.out)}catch(e){}say('Pairing text copied');return}
  else if(a==='create'){off.busy=true;render(1);await getCam();off.out=await net.manualHost();off.outQr=await qrData(off.out);off.kind='invitation';off.stage='host';off.busy=false;render(1);scanLoop();return}
  else if(a==='scan'){if(!(await getCam()))off.err='The camera is not available. Paste the pairing text or open a pairing file instead.';render(1);scanLoop();return}
  else if(a==='accept'){if(!off.paste.trim())off.err='Paste the pairing text first, or open a pairing file.';else{off.busy=true;render(1);await offUse(off.paste);return}}
 }catch(e){off.busy=false;off.err='Something went wrong. Start over and try again.'}
 render(1)}

/* Events */
function setMode(m){if(ui.mode===m)return;ui.mode=m;if(m==='cloud')camOff();history.replaceState(null,'',m==='local'?'/?mode=local':'/');render(1)}
app.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
 if(a==='copy'){try{navigator.clipboard.writeText(location.origin+'/pair?code='+room.code)}catch(x){}say('Invite link copied')}
 else if(a==='allow'||a==='deny'){room.req=false;net.allow(a==='allow');say(a==='allow'?'Device allowed':'Device denied');render(1)}
 else if(a.startsWith('off-'))offAct(a.slice(4));
 else if(a==='mode-cloud'||a==='mode-local')setMode(a==='mode-local'?'local':'cloud');
 else if(a.startsWith('tab-')){ui.tab=a.slice(4);if(ui.tab==='recv')ui.dot.recv=0;if(ui.tab==='text')ui.dot.text=false;render(1)}
 else if(a==='create'){ui.enter=false;room.active=true;render(1)}
 else if(a==='enter'){ui.enter=true;ui.err='';render(1);const i=$('#ec');i&&i.focus&&i.focus()}
 else if(a==='enter-cancel'){ui.enter=false;render(1)}
 else if(a==='join-code')joinCode();
 else if(a==='leave')leave();
 else if(a==='text-copy'){try{navigator.clipboard.writeText(room.text)}catch(x){}say('Text copied')}
 else if(a==='text-clear'){room.text='';const ta=$('#tx');if(ta)ta.value='';net.sendText('')}
 else act(a,b.dataset.id)});
app.addEventListener('change',e=>{const t=e.target;
 if(t.id==='au')room.auto=t.checked;
 if(t.id==='rl'){S.relay=t.checked;net.reset(S.relay);render(1)}
 if(t.id==='fi'){add(t.files);t.value=''}
 if(t.id==='opf'&&t.files&&t.files[0]){const f=t.files[0];t.value='';off.busy=true;render(1);f.text().then(offUse)}});
app.addEventListener('input',e=>{const t=e.target;
 if(t.id==='tx'){room.text=t.value;clearTimeout(txT);txT=setTimeout(()=>net.sendText(room.text),120)}
 else if(t.id==='oc')off.paste=t.value;
 else if(t.id==='ec')ui.ec=t.value});
app.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='ec'){e.preventDefault();joinCode()}});
app.addEventListener('dragover',e=>{const d=e.target.closest('#dz');if(d){e.preventDefault();d.classList.add('on')}});
app.addEventListener('dragleave',e=>{const d=e.target.closest('#dz');d&&d.classList.remove('on')});
app.addEventListener('drop',e=>{const d=e.target.closest('#dz');if(d){e.preventDefault();d.classList.remove('on');add(e.dataTransfer.files)}});
app.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;
if(f.id==='pf'){const v=$('#pc').value.toUpperCase().replace(/\s/g,'');const m=v.match(/^([A-Z]{3,8})-?(\d{4})$/);
if(!m){$('#pe').textContent='That code isn’t valid. It is one word, a hyphen and four digits, like FAITH-4821.';return}
room.code=m[1]+'-'+m[2];room.own=false;go('/workspace');return}
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
function render(keep){
 let r=location.pathname.replace(/^\/|\/$/g,'')||'home';
 if(r==='workspace')r='home';
 if(r==='offline'){ui.mode='local';history.replaceState(null,'','/?mode=local');r='home'}
 if(r==='pair'){
  const c=(new URLSearchParams(location.search).get('code')||'').toUpperCase().match(/^([A-Z]{3,8})-(\d{4})$/);
  if(c){room.code=c[0];room.own=false;room.active=true}else ui.enter=true;
  ui.mode='cloud';history.replaceState(null,'','/');r='home'}
 const ae=typeof document.activeElement!=='undefined'?document.activeElement:null,fid=ae&&ae.id,ss=ae&&ae.selectionStart,se=ae&&ae.selectionEnd;
 app.innerHTML=(Object.hasOwn(R,r)?R[r]:R.nf)();
 document.querySelectorAll('nav[aria-label=Main] a').forEach(a=>a.pathname===(r==='home'?'/':'/'+r)?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
 if(r==='home'){
  if(ui.mode==='cloud'&&room.active)net.ensure(room.code,room.own);
  qr();if(ui.mode==='cloud'&&room.active&&room.own&&!room.joined)showQR();
  if(location.search.includes('shared=1'))takeShared();
  attachCam();
 }else if(off.stream)camOff();
 if(keep&&fid&&['tx','oc','ec'].includes(fid)){const e=document.getElementById(fid);if(e){e.focus();try{e.setSelectionRange(ss,se)}catch(x){}}}
 if(!keep){const mt=META['/'+(r==='home'?'':r)]||META['/404'];document.title=mt.title;const dm=document.querySelector('meta[name=description]');dm&&dm.setAttribute('content',mt.desc);scrollTo(0,0);const h=app.querySelector('h1');if(h&&!first){h.tabIndex=-1;h.focus({preventScroll:true})}}
 first=false}
function go(p){if(p!==location.pathname+location.search)history.pushState(null,'',p);render()}
addEventListener('popstate',()=>render());
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="/"]');if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target||a.hasAttribute('download'))return;const p=a.getAttribute('href');if(p.startsWith('//'))return;e.preventDefault();go(p)});
theme();render();

if('serviceWorker' in navigator)addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});
 setTimeout(async()=>{try{await Promise.all([import('qrcode'),import('jsqr')]);await navigator.serviceWorker.ready;const c=await caches.open('sendit-v1');
  const urls=[...new Set(performance.getEntriesByType('resource').map(r=>r.name).filter(u=>u.startsWith(location.origin)&&!/\/(api|socket\.io)\//.test(u)))];
  for(const u of urls){try{await c.add(u)}catch(e){}}try{await c.add('/')}catch(e){}}catch(e){}},3000)});
