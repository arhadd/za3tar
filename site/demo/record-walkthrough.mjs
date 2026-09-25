import { chromium } from "playwright";
const W=1440,H=900;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:W,height:H}, recordVideo:{ dir:"video", size:{width:W,height:H} } });
const p = await ctx.newPage();
const log=[];
await p.goto("http://127.0.0.1:1420/"); await p.waitForTimeout(1200);

// overlay: cursor + caption + intro/outro cards
await p.addStyleTag({content:`
#zc{position:fixed;z-index:99999;width:22px;height:22px;pointer-events:none;transition:left .55s cubic-bezier(.2,.8,.2,1),top .55s cubic-bezier(.2,.8,.2,1);left:720px;top:450px}
#zc svg{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
#zc.dn{transform:scale(.85)}
#zcap{position:fixed;z-index:99998;left:50%;bottom:34px;transform:translateX(-50%) translateY(12px);background:#0B1710;color:#F2EEE2;font:500 18px/1.35 Archivo,ui-sans-serif,system-ui,sans-serif;padding:12px 18px;border-radius:8px;max-width:760px;text-align:center;opacity:0;transition:opacity .35s,transform .35s;pointer-events:none;letter-spacing:-.01em}
#zcap.on{opacity:1;transform:translateX(-50%) translateY(0)}
#zcard{position:fixed;inset:0;z-index:99997;background:#F2EEE2;color:#0B1710;display:flex;flex-direction:column;justify-content:center;padding:0 120px;font-family:Archivo,ui-sans-serif,system-ui,sans-serif;opacity:1;transition:opacity .6s;pointer-events:none}
#zcard.off{opacity:0}
#zcard h1{font-size:76px;font-weight:800;font-stretch:88%;letter-spacing:-.035em;line-height:.96;margin:0 0 22px;max-width:14ch}
#zcard p{font-size:24px;color:rgba(11,23,16,.66);margin:0;max-width:34ch;line-height:1.4}
#zcard .wm{position:absolute;left:120px;top:64px;font-size:22px;font-weight:700;font-stretch:78%}
`});
await p.evaluate(()=>{
  const c=document.createElement('div'); c.id='zc'; c.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8.5-6.2 1.3L9.5 20z" fill="#0B1710" stroke="#F2EEE2" stroke-width="1.4" stroke-linejoin="round"/></svg>'; document.body.appendChild(c);
  const cap=document.createElement('div'); cap.id='zcap'; document.body.appendChild(cap);
  const card=document.createElement('div'); card.id='zcard'; card.innerHTML='<div class="wm">za3tar</div><h1>The meeting is not done when the notes arrive.</h1><p>Za3tar records without a bot, understands Arabic and English the way you spoke them, and turns what was said into work.</p>'; document.body.appendChild(card);
});
const sleep=ms=>p.waitForTimeout(ms);
async function cap(t,ms=2600){ await p.evaluate(t=>{const c=document.getElementById('zcap'); c.textContent=t; c.classList.add('on');},t); await sleep(ms); }
async function capOff(){ await p.evaluate(()=>document.getElementById('zcap').classList.remove('on')); }
async function moveTo(loc){ const bb=await loc.boundingBox(); if(!bb) throw new Error('no box'); const x=bb.x+Math.min(bb.width/2,140), y=bb.y+bb.height/2; await p.evaluate(([x,y])=>{const c=document.getElementById('zc'); c.style.left=x+'px'; c.style.top=y+'px';},[x,y]); await sleep(650); return {x,y}; }
async function click(loc,label){ const {x,y}=await moveTo(loc); await p.evaluate(()=>document.getElementById('zc').classList.add('dn')); await p.mouse.click(x,y); await sleep(140); await p.evaluate(()=>document.getElementById('zc').classList.remove('dn')); log.push('clicked '+label); await sleep(500); }
const btn=(re)=>p.getByRole('button',{name:re}).first();

// intro
await sleep(3400);
await p.evaluate(()=>document.getElementById('zcard').classList.add('off')); await sleep(800);

// 1 workspaces
await cap('Your meetings, in one place. Split by workspace so contexts never mix.',2400);
await click(btn(/^Madar$/),'Madar');
await cap('Each workspace keeps its own meetings, people and decisions.',2200); await capOff();

// 2 open a meeting
await click(btn(/Madar — onboarding kickoff/),'meeting');
await cap('Open a meeting. Notes first, then decisions and actions. The transcript waits behind a toggle.',3600);
log.push('meeting buttons: '+JSON.stringify(await p.getByRole('button').allInnerTexts()));
await p.mouse.wheel(0,420); await sleep(900);
await cap('Decisions and actions with owners and dates. Nothing invented that was not said.',3000);
const tr=p.getByRole('button',{name:/show transcript/i}).first();
if(await tr.count()){ await click(tr,'transcript'); await cap('Arabic stays Arabic. English stays English. Names and terms stay natural.',3400); await p.mouse.wheel(0,260); await sleep(1200); await p.mouse.wheel(0,-900); await sleep(600); }
await capOff();

// 3 follow-up draft
const wa=p.getByRole('button',{name:/WhatsApp follow-up/i}).first();
if(await wa.count()){ await moveTo(wa); await click(wa,'whatsapp'); await sleep(700); await cap('Draft the follow-up in the meeting’s own language mix. Nothing sends without you.',3600); await capOff(); }

// 4 people / decisions / follow-ups
await click(btn(/^People/),'people');
await cap('People become records: who they are, and what is still open with each of them.',3200); await capOff();
await click(btn(/^Decisions/),'decisions');
await cap('Decisions are records too: proposed, confirmed, or superseded.',3000); await capOff();
await click(btn(/^Follow-ups/),'followups');
await cap('Follow-ups across every meeting. What is overdue, and who owns it.',3000); await capOff();

// 5 record
await click(btn(/^Personal$/),'personal');
await click(btn(/^Meetings/),'meetings');
await click(btn(/^Record$/),'record');
await cap('Record without a bot in the call. Your mic and their side, as two tracks.',4200);
await capOff(); await sleep(400);
await click(btn(/^Stop/),'stop');
await cap('Stop, and Za3tar does the rest.',2200);
await sleep(1800);
log.push('after stop: '+JSON.stringify(await p.getByRole('button').allInnerTexts()));
await p.mouse.wheel(0,260); await sleep(900);
await cap('Notes, decisions, actions. A minute after the call ends.',3400); await capOff();
log.push('final: '+JSON.stringify(await p.getByRole('button').allInnerTexts()));

// outro
await p.evaluate(()=>{const c=document.getElementById('zcard'); c.innerHTML='<div class="wm">za3tar</div><h1>Record. Understand. Follow through.</h1><p>za3tar.ai</p>'; c.classList.remove('off');});
await sleep(3800);
await ctx.close(); await b.close();
console.log(log.join('\n'));
