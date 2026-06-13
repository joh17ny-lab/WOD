/* ============================================================================
   WODBook PWA — all app logic in one file.
   Data persists in localStorage. No backend, works offline.
   ========================================================================== */

/* ---------------------------- Storage layer ----------------------------- */
const DB = {
  KEY: 'wodbook.v1',
  data: { wods: [], lifts: [] },
  load(){
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)) || this.data; }
    catch(e){}
    if(!this.data.wods) this.data.wods = [];
    if(!this.data.lifts) this.data.lifts = [];
  },
  save(){ localStorage.setItem(this.KEY, JSON.stringify(this.data)); },
  // WODs
  addWod(w){ w.id = uid(); w.createdAt = Date.now(); this.data.wods.push(w); this.save(); },
  updateWod(id, patch){ const w=this.data.wods.find(x=>x.id===id); if(w){Object.assign(w,patch); this.save();} },
  deleteWod(id){ this.data.wods = this.data.wods.filter(x=>x.id!==id); this.save(); },
  wodsSorted(){ return [...this.data.wods].sort((a,b)=> b.date - a.date); },
  // Lifts
  addLift(l){ l.id = uid(); l.createdAt = Date.now(); this.data.lifts.push(l); this.save(); },
  deleteLift(id){ this.data.lifts = this.data.lifts.filter(x=>x.id!==id); this.save(); },
};

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ------------------------------ Seed data ------------------------------- */
const WOD_TYPES = [
  {k:'For Time', ph:'mm:ss', ic:'⏱'},
  {k:'AMRAP', ph:'rounds + reps', ic:'🔁'},
  {k:'EMOM', ph:'completed?', ic:'⏲'},
  {k:'Rounds', ph:'rounds', ic:'🔄'},
  {k:'Load', ph:'weight', ic:'🏋️'},
  {k:'Distance', ph:'meters', ic:'🏃'},
  {k:'Other', ph:'result', ic:'▦'},
];
function typeIcon(k){ return (WOD_TYPES.find(t=>t.k===k)||{ic:'▦'}).ic; }
function typePlaceholder(k){ return (WOD_TYPES.find(t=>t.k===k)||{ph:'result'}).ph; }

const BENCHMARKS = [
  {name:'Fran', cat:'The Girls', type:'For Time', desc:'21-15-9 reps for time:\n• Thrusters (95/65 lb)\n• Pull-ups'},
  {name:'Grace', cat:'The Girls', type:'For Time', desc:'30 Clean & Jerks (135/95 lb) for time.'},
  {name:'Isabel', cat:'The Girls', type:'For Time', desc:'30 Snatches (135/95 lb) for time.'},
  {name:'Helen', cat:'The Girls', type:'For Time', desc:'3 rounds for time:\n• 400 m run\n• 21 KB swings (1.5/1 pood)\n• 12 pull-ups'},
  {name:'Cindy', cat:'The Girls', type:'AMRAP', desc:'AMRAP in 20 min:\n• 5 pull-ups\n• 10 push-ups\n• 15 air squats'},
  {name:'Annie', cat:'The Girls', type:'For Time', desc:'50-40-30-20-10 reps for time:\n• Double-unders\n• Sit-ups'},
  {name:'Diane', cat:'The Girls', type:'For Time', desc:'21-15-9 reps for time:\n• Deadlifts (225/155 lb)\n• Handstand push-ups'},
  {name:'Karen', cat:'The Girls', type:'For Time', desc:'150 wall-ball shots (20/14 lb) for time.'},
  {name:'Elizabeth', cat:'The Girls', type:'For Time', desc:'21-15-9 reps for time:\n• Cleans (135/95 lb)\n• Ring dips'},
  {name:'Jackie', cat:'The Girls', type:'For Time', desc:'For time:\n• 1000 m row\n• 50 thrusters (45/35 lb)\n• 30 pull-ups'},
  {name:'Murph', cat:'Hero WODs', type:'For Time', desc:'For time (with 20/14 lb vest):\n• 1 mile run\n• 100 pull-ups\n• 200 push-ups\n• 300 air squats\n• 1 mile run'},
  {name:'DT', cat:'Hero WODs', type:'For Time', desc:'5 rounds for time (155/105 lb):\n• 12 deadlifts\n• 9 hang power cleans\n• 6 push jerks'},
  {name:'Chad', cat:'Hero WODs', type:'For Time', desc:'1000 box step-ups (20" box, 45/35 lb ruck) for time.'},
  {name:'JT', cat:'Hero WODs', type:'For Time', desc:'21-15-9 reps for time:\n• Handstand push-ups\n• Ring dips\n• Push-ups'},
  {name:'Michael', cat:'Hero WODs', type:'For Time', desc:'3 rounds for time:\n• 800 m run\n• 50 back extensions\n• 50 sit-ups'},
  {name:'The Seven', cat:'Hero WODs', type:'For Time', desc:'7 rounds for time:\n• 7 HSPU\n• 7 thrusters (135/95)\n• 7 KB swings (2/1.5 pood)\n• 7 deadlifts (245/165)\n• 7 burpees\n• 7 KTE\n• 7 pull-ups'},
];

const COMMON_LIFTS = ['Back Squat','Front Squat','Overhead Squat','Deadlift','Bench Press','Strict Press','Push Press','Push Jerk','Clean','Power Clean','Clean & Jerk','Snatch','Power Snatch','Thruster'];

const MOVEMENTS = [
  {n:'Thruster',c:'Weightlifting',a:'THR',s:'Front squat into a push press in one fluid motion.'},
  {n:'Clean',c:'Weightlifting',a:'CLN',s:'Pull the bar from the floor to the front-rack in a squat.'},
  {n:'Snatch',c:'Weightlifting',a:'SN',s:'Pull the bar from the floor to overhead in one motion.'},
  {n:'Deadlift',c:'Weightlifting',a:'DL',s:'Lift the bar from the floor to the hips with a flat back.'},
  {n:'Clean & Jerk',c:'Weightlifting',a:'C&J',s:'A clean immediately followed by a jerk overhead.'},
  {n:'Overhead Squat',c:'Weightlifting',a:'OHS',s:'Squat with the bar held locked out overhead.'},
  {n:'Push Press',c:'Weightlifting',a:'PP',s:'Press the bar overhead using a slight dip-and-drive.'},
  {n:'Pull-up',c:'Gymnastics',a:'PU',s:'Pull chin over the bar from a dead hang.'},
  {n:'Toes-to-Bar',c:'Gymnastics',a:'T2B',s:'Raise toes to touch the bar while hanging.'},
  {n:'Handstand Push-up',c:'Gymnastics',a:'HSPU',s:'Press from a handstand until arms lock out.'},
  {n:'Muscle-up',c:'Gymnastics',a:'MU',s:'Transition from a pull-up to a dip above the rings/bar.'},
  {n:'Ring Dip',c:'Gymnastics',a:'RD',s:'Dip on rings until shoulders pass below elbows.'},
  {n:'Air Squat',c:'Gymnastics',a:'AS',s:'Bodyweight squat below parallel.'},
  {n:'Row',c:'Cardio / Mono',a:'ROW',s:'Erg rowing for distance or calories.'},
  {n:'Double-under',c:'Cardio / Mono',a:'DU',s:'Jump rope passing twice per jump.'},
  {n:'Run',c:'Cardio / Mono',a:'RUN',s:'Running for distance, typically 200–800 m intervals.'},
  {n:'Assault Bike',c:'Cardio / Mono',a:'BIKE',s:'Fan bike for calories or distance.'},
  {n:'Sit-up',c:'Core',a:'SU',s:'Anchored or AbMat sit-up for the core.'},
  {n:'Hollow Hold',c:'Core',a:'HH',s:'Isometric hold with lower back pressed to the floor.'},
  {n:'Kettlebell Swing',c:'Accessory',a:'KBS',s:'Hip-driven swing of a kettlebell to eye level or overhead.'},
  {n:'Wall Ball',c:'Accessory',a:'WB',s:'Squat and throw a medicine ball to a target.'},
  {n:'Box Jump',c:'Accessory',a:'BJ',s:'Jump onto a box and stand to full extension.'},
];

/* ------------------------------ Utilities ------------------------------- */
const $ = (id)=>document.getElementById(id);
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function mmss(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
function fmtDate(ts){ return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
function fmtDateFull(ts){ return new Date(ts).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }
function todayISO(){ const d=new Date(); d.setHours(12,0,0,0); return d.toISOString().slice(0,10); }
function isoToTs(iso){ const d=new Date(iso+'T12:00:00'); return d.getTime(); }
function tsToISO(ts){ const d=new Date(ts); d.setHours(12,0,0,0); return d.toISOString().slice(0,10); }
function e1rm(weight, reps){ return reps<=1 ? weight : Math.round(weight*(1+reps/30)); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),1800); }
function buzz(ms){ if(navigator.vibrate) try{navigator.vibrate(ms);}catch(e){} }

/* Simple responsive line chart returning an inline SVG string.
   pts = [{x:timestamp, y:number}] sorted by x ascending. */
function lineChartSVG(pts){
  if(pts.length<2) return '';
  const W=320, H=150, pad=24;
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs)||1;
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const spanX=(maxX-minX)||1, spanY=(maxY-minY)||1;
  const X=v=> pad + (v-minX)/spanX*(W-pad*2);
  const Y=v=> (H-pad) - (v-minY)/spanY*(H-pad*2);
  const d = pts.map((p,i)=> (i?'L':'M')+X(p.x).toFixed(1)+' '+Y(p.y).toFixed(1)).join(' ');
  const dots = pts.map(p=>`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="#e87a4c"/>`).join('');
  return `<svg class="line" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <text x="${pad}" y="14" fill="#8d9bb0" font-size="11">${maxY}</text>
    <text x="${pad}" y="${H-6}" fill="#8d9bb0" font-size="11">${minY}</text>
    <path d="${d}" fill="none" stroke="#e87a4c" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}</svg>`;
}

/* ------------------------------ Router ---------------------------------- */
const TABS = [
  {id:'log', title:'Log', ic:'📋'},
  {id:'bench', title:'Benchmarks', ic:'⭐'},
  {id:'lifts', title:'Lifts', ic:'🏋️'},
  {id:'timer', title:'Timer', ic:'⏱'},
  {id:'cal', title:'Calendar', ic:'📅'},
  {id:'more', title:'More', ic:'⋯'},
];
let current = 'log';

function renderTabbar(){
  $('tabbar').innerHTML = TABS.map(t=>`
    <button data-tab="${t.id}" class="${t.id===current?'active':''}">
      <span class="ic">${t.ic}</span><span>${t.title}</span>
    </button>`).join('');
  $('tabbar').querySelectorAll('button').forEach(b=>{
    b.onclick = ()=>{ if(current==='timer' && Timer.running){ if(!confirm('Leave the running timer?')) return; }
      go(b.dataset.tab); };
  });
}
function go(tab){ current = tab; renderTabbar(); render(); }

function render(){
  const t = TABS.find(t=>t.id===current);
  $('screenTitle').textContent = t.title;
  $('topActions').innerHTML = '';
  const fns = {log:Screens.log, bench:Screens.bench, lifts:Screens.lifts, timer:Screens.timer, cal:Screens.cal, more:Screens.more};
  fns[current]();
}

/* ------------------------------- Sheet ---------------------------------- */
const Sheet = {
  open(title, html, onOpen){
    $('sheetTitle').textContent = title;
    $('sheetBody').innerHTML = html;
    $('sheetBg').classList.add('show');
    $('sheet').classList.add('show');
    if(onOpen) onOpen();
  },
  close(){ $('sheetBg').classList.remove('show'); $('sheet').classList.remove('show'); }
};
$('sheetClose').onclick = ()=>Sheet.close();
$('sheetBg').onclick = ()=>Sheet.close();

/* ------------------------------ Screens --------------------------------- */
const Screens = {};

/* ---- LOG / HISTORY ---- */
Screens.log = function(){
  $('topActions').innerHTML = `<button class="iconbtn" id="addWod">＋</button>`;
  $('addWod').onclick = ()=>editWod(null);
  const wods = DB.wodsSorted();
  let html = `<input class="input" id="wodSearch" placeholder="Search workouts" style="margin-bottom:12px">`;
  if(!wods.length){
    html += `<div class="empty"><div class="ic">📋</div><p>No workouts yet.<br>Tap ＋ to log your first WOD.</p></div>`;
  } else {
    html += `<div class="swipe-hint">Tap a workout to edit · long-press to delete</div><div class="list" id="wodList"></div>`;
  }
  $('screen').innerHTML = html;
  const listEl = $('wodList');
  function paint(filter){
    if(!listEl) return;
    const f = (filter||'').toLowerCase();
    const items = wods.filter(w=> !f || (w.title+w.details+w.notes).toLowerCase().includes(f));
    listEl.innerHTML = items.map(w=>`
      <div class="item" data-id="${w.id}">
        <div class="lead">${typeIcon(w.type)}</div>
        <div class="grow">
          <div class="title">${esc(w.title)}</div>
          <div class="sub">${esc(w.type)}${w.result?' · '+esc(w.result):''}</div>
        </div>
        <div class="trail">
          ${w.rxd?'<span class="pill">RX</span><br>':''}
          <span class="tag">${fmtDate(w.date)}</span>
        </div>
      </div>`).join('') || `<div class="empty"><p>No matches.</p></div>`;
    bindLongPress(listEl, '.item', (el)=>{
      const id = el.dataset.id;
      if(confirm('Delete this workout?')){ DB.deleteWod(id); render(); }
    }, (el)=> editWod(el.dataset.id));
  }
  paint('');
  if($('wodSearch')) $('wodSearch').oninput = (e)=>paint(e.target.value);
};

function editWod(id, prefill){
  const w = id ? DB.data.wods.find(x=>x.id===id) : null;
  const base = w || prefill || {title:'',type:'For Time',details:'',result:'',rxd:false,notes:'',date:isoToTs(todayISO())};
  const segTypes = WOD_TYPES.map(t=>`<button data-t="${t.k}" class="${t.k===base.type?'active':''}">${t.k}</button>`).join('');
  Sheet.open(id?'Edit WOD':'New WOD', `
    <label class="field"><span>Title</span><input class="input" id="f_title" value="${esc(base.title)}" placeholder="e.g. Fran"></label>
    <label class="field"><span>Type</span></label>
    <div class="seg" id="f_typeSeg" style="margin-bottom:12px">${segTypes}</div>
    <label class="field"><span>Description / movements</span><textarea class="input" id="f_details" placeholder="21-15-9 thrusters & pull-ups…">${esc(base.details)}</textarea></label>
    <label class="field"><span>Result (<span id="f_ph">${typePlaceholder(base.type)}</span>)</span><input class="input" id="f_result" value="${esc(base.result)}"></label>
    <div class="toggle card" style="margin-bottom:12px"><span>Performed as prescribed (RX)</span><button class="switch ${base.rxd?'on':''}" id="f_rx"></button></div>
    <label class="field"><span>Date</span><input class="input" type="date" id="f_date" value="${tsToISO(base.date)}"></label>
    <label class="field"><span>Notes</span><textarea class="input" id="f_notes" placeholder="How did it feel?">${esc(base.notes)}</textarea></label>
    <button class="btn primary block" id="f_save">${id?'Save Changes':'Save Workout'}</button>
    ${id?'<button class="btn danger block" id="f_del" style="margin-top:10px">Delete</button>':''}
  `, ()=>{
    let type = base.type, rxd = !!base.rxd;
    const seg = $('f_typeSeg');
    seg.querySelectorAll('button').forEach(b=> b.onclick=()=>{
      type=b.dataset.t; seg.querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
      $('f_ph').textContent = typePlaceholder(type);
    });
    $('f_rx').onclick = (e)=>{ rxd=!rxd; e.target.classList.toggle('on', rxd); };
    $('f_save').onclick = ()=>{
      const title = $('f_title').value.trim();
      if(!title){ toast('Title required'); return; }
      const rec = {
        title, type, details:$('f_details').value.trim(), result:$('f_result').value.trim(),
        rxd, notes:$('f_notes').value.trim(), date:isoToTs($('f_date').value||todayISO()),
        benchmarkName: base.benchmarkName||null
      };
      if(id) DB.updateWod(id, rec); else DB.addWod(rec);
      Sheet.close(); render(); toast('Saved');
    };
    if(id) $('f_del').onclick = ()=>{ if(confirm('Delete this workout?')){ DB.deleteWod(id); Sheet.close(); render(); } };
  });
}

/* ---- BENCHMARKS ---- */
Screens.bench = function(){
  const cats = ['The Girls','Hero WODs'];
  let html='';
  cats.forEach(cat=>{
    html += `<div class="sectiontitle">${cat==='The Girls'?'⭐ ':'🛡 '}${cat}</div><div class="list">`;
    BENCHMARKS.filter(b=>b.cat===cat).forEach(b=>{
      html += `<div class="item" data-name="${esc(b.name)}">
        <div class="lead">${cat==='The Girls'?'⭐':'🛡'}</div>
        <div class="grow"><div class="title">${esc(b.name)}</div><div class="sub">${esc(b.type)}</div></div>
        <div class="trail tag">›</div></div>`;
    });
    html += `</div>`;
  });
  $('screen').innerHTML = html;
  $('screen').querySelectorAll('.item').forEach(el=> el.onclick=()=>benchDetail(el.dataset.name));
};

function parseTimeToSec(s){
  if(!s) return null;
  const p = s.split(':');
  if(p.length===2){ const m=parseFloat(p[0]), sec=parseFloat(p[1]); if(!isNaN(m)&&!isNaN(sec)) return m*60+sec; }
  const n = parseFloat(s); return isNaN(n)?null:n;
}
function benchDetail(name){
  const b = BENCHMARKS.find(x=>x.name===name);
  const attempts = DB.data.wods.filter(w=>w.benchmarkName===name).sort((a,c)=>c.date-a.date);
  let best=null;
  const scored = attempts.filter(a=>a.result);
  if(scored.length){
    if(b.type==='For Time'){ best = scored.reduce((m,a)=> (parseTimeToSec(a.result)??1e9) < (parseTimeToSec(m.result)??1e9)?a:m ); }
    else best = scored[0];
  }
  Sheet.open(b.name, `
    <div class="card"><h3>Workout</h3><div style="white-space:pre-wrap">${esc(b.desc)}</div>
      <div class="tag" style="margin-top:8px">Type: ${esc(b.type)}</div></div>
    ${best?`<div class="card"><h3>🏆 Personal Best</h3>
      <div class="big" style="font-size:22px">${esc(best.result)}</div>
      <div class="tag">${fmtDateFull(best.date)} ${best.rxd?'· RX':''}</div></div>`:''}
    <button class="btn primary block" id="b_log">＋ Log Attempt</button>
    <div class="sectiontitle">History (${attempts.length})</div>
    <div class="list" id="b_hist">${attempts.length?attempts.map(a=>`
      <div class="item"><div class="grow"><div class="title">${esc(a.result||'—')}</div>
        <div class="sub">${fmtDateFull(a.date)}</div></div>
        ${a.rxd?'<span class="pill">RX</span>':''}</div>`).join(''):'<div class="empty"><p>No attempts logged yet.</p></div>'}</div>
  `, ()=>{
    $('b_log').onclick = ()=>{ Sheet.close(); editWod(null, {
      title:b.name, type:b.type, details:b.desc, result:'', rxd:false, notes:'', date:isoToTs(todayISO()), benchmarkName:b.name
    }); };
  });
}

/* ---- LIFTS ---- */
Screens.lifts = function(){
  $('topActions').innerHTML = `<button class="iconbtn" id="addLift">＋</button>`;
  $('addLift').onclick = ()=>editLift(null);
  const names = [...new Set(DB.data.lifts.map(l=>l.name))].sort();
  if(!names.length){
    $('screen').innerHTML = `<div class="empty"><div class="ic">🏋️</div><p>No lifts tracked.<br>Tap ＋ to log a max.</p></div>`;
    return;
  }
  let html = `<div class="list">`;
  names.forEach(n=>{
    const entries = DB.data.lifts.filter(l=>l.name===n);
    const best = entries.reduce((m,l)=> e1rm(l.weight,l.reps)>e1rm(m.weight,m.reps)?l:m);
    html += `<div class="item" data-name="${esc(n)}">
      <div class="lead">🏋️</div>
      <div class="grow"><div class="title">${esc(n)}</div>
        <div class="sub">best e1RM ${e1rm(best.weight,best.reps)} ${esc(best.unit)}</div></div>
      <div class="trail"><div class="big">${best.weight}${esc(best.unit)}</div><div class="tag">×${best.reps}</div></div></div>`;
  });
  html += `</div>`;
  $('screen').innerHTML = html;
  $('screen').querySelectorAll('.item').forEach(el=> el.onclick=()=>liftDetail(el.dataset.name));
};

function liftDetail(name){
  const entries = DB.data.lifts.filter(l=>l.name===name).sort((a,b)=>a.date-b.date);
  const chart = entries.length>1 ? lineChartSVG(entries.map(e=>({x:e.date, y:e1rm(e.weight,e.reps)}))) : '';
  Sheet.open(name, `
    <button class="btn primary block" id="l_add">＋ Log Max for ${esc(name)}</button>
    ${chart?`<div class="card"><h3>Estimated 1RM over time</h3>${chart}</div>`:''}
    <div class="sectiontitle">Entries</div>
    <div class="list">${[...entries].reverse().map(e=>`
      <div class="item" data-id="${e.id}">
        <div class="grow"><div class="title">${e.weight} ${esc(e.unit)} × ${e.reps}</div>
          <div class="sub">${e.reps>1?'est. 1RM '+e1rm(e.weight,e.reps)+' '+esc(e.unit)+' · ':''}${fmtDateFull(e.date)}</div>
          ${e.notes?`<div class="sub">${esc(e.notes)}</div>`:''}</div></div>`).join('')}</div>
  `, ()=>{
    $('l_add').onclick = ()=>{ Sheet.close(); editLift(name); };
    bindLongPress($('sheetBody'), '.item[data-id]', (el)=>{
      if(confirm('Delete this entry?')){ DB.deleteLift(el.dataset.id); Sheet.close(); render(); }
    });
  });
}

function editLift(presetName){
  const liftOpts = COMMON_LIFTS.map(l=>`<option ${l===presetName?'selected':''}>${l}</option>`).join('');
  Sheet.open('Log Max', `
    ${presetName?`<label class="field"><span>Lift</span><input class="input" value="${esc(presetName)}" disabled></label>`:`
    <label class="field"><span>Lift</span><select class="input" id="l_name">${liftOpts}<option value="__custom">Custom…</option></select></label>
    <label class="field" id="l_customWrap" style="display:none"><span>Custom lift name</span><input class="input" id="l_custom" placeholder="Lift name"></label>`}
    <div class="row" style="gap:10px">
      <label class="field" style="flex:1"><span>Weight</span><input class="input" id="l_weight" type="number" inputmode="decimal" placeholder="0"></label>
      <label class="field" style="width:110px"><span>Unit</span>
        <div class="seg" id="l_unit"><button data-u="lb" class="active">lb</button><button data-u="kg">kg</button></div></label>
    </div>
    <div class="stepper card"><span>Reps</span><div class="ctl"><button id="l_rm">−</button><span class="big" id="l_reps">1</span><button id="l_rp">＋</button></div></div>
    <div class="tag" id="l_e1rm" style="margin:8px 0"></div>
    <label class="field"><span>Date</span><input class="input" type="date" id="l_date" value="${todayISO()}"></label>
    <label class="field"><span>Notes</span><input class="input" id="l_notes" placeholder="Optional"></label>
    <button class="btn primary block" id="l_save">Save</button>
  `, ()=>{
    let unit='lb', reps=1;
    if(!presetName){
      $('l_name').onchange = ()=> $('l_customWrap').style.display = $('l_name').value==='__custom'?'block':'none';
    }
    $('l_unit').querySelectorAll('button').forEach(b=> b.onclick=()=>{ unit=b.dataset.u; $('l_unit').querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); upd(); });
    const upd = ()=>{ const w=parseFloat($('l_weight').value); $('l_e1rm').textContent = (reps>1 && w)?`Estimated 1RM: ${e1rm(w,reps)} ${unit}`:''; };
    $('l_rm').onclick=()=>{ reps=Math.max(1,reps-1); $('l_reps').textContent=reps; upd(); };
    $('l_rp').onclick=()=>{ reps=Math.min(20,reps+1); $('l_reps').textContent=reps; upd(); };
    $('l_weight').oninput = upd;
    $('l_save').onclick = ()=>{
      let name = presetName;
      if(!name){ name = $('l_name').value==='__custom' ? $('l_custom').value.trim() : $('l_name').value; }
      const weight = parseFloat($('l_weight').value);
      if(!name || isNaN(weight)){ toast('Lift and weight required'); return; }
      DB.addLift({name, weight, unit, reps, date:isoToTs($('l_date').value||todayISO()), notes:$('l_notes').value.trim()});
      Sheet.close(); render(); toast('Saved');
    };
  });
}

/* ---- CALENDAR ---- */
let calMonth = (()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let calSel = todayISO();
Screens.cal = function(){
  const y=calMonth.getFullYear(), m=calMonth.getMonth();
  const first = new Date(y,m,1), startDow = first.getDay();
  const days = new Date(y,m+1,0).getDate();
  const monthName = calMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const wodDays = new Set(DB.data.wods.map(w=> tsToISO(w.date)));
  const dows = ['S','M','T','W','T','F','S'];
  let cells = '';
  for(let i=0;i<startDow;i++) cells += `<div class="cal-cell muted"></div>`;
  for(let d=1;d<=days;d++){
    const iso = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = iso===todayISO(), isSel = iso===calSel, has = wodDays.has(iso);
    cells += `<div class="cal-cell ${isSel?'sel':''} ${isToday?'today':''}" data-iso="${iso}">${d}${has?'<span class="dot"></span>':''}</div>`;
  }
  const selWods = DB.wodsSorted().filter(w=> tsToISO(w.date)===calSel);
  $('screen').innerHTML = `
    <div class="card">
      <div class="cal-head">
        <button class="iconbtn" id="cal_prev">‹</button>
        <div class="big">${monthName}</div>
        <button class="iconbtn" id="cal_next">›</button>
      </div>
      <div class="cal-grid">${dows.map(d=>`<div class="dow">${d}</div>`).join('')}${cells}</div>
    </div>
    <div class="sectiontitle">${fmtDateFull(isoToTs(calSel))}</div>
    <div class="list" id="cal_list">${selWods.length?selWods.map(w=>`
      <div class="item" data-id="${w.id}"><div class="lead">${typeIcon(w.type)}</div>
        <div class="grow"><div class="title">${esc(w.title)}</div><div class="sub">${esc(w.type)}${w.result?' · '+esc(w.result):''}</div></div>
        ${w.rxd?'<span class="pill">RX</span>':''}</div>`).join(''):'<div class="empty"><p>No workouts this day.</p></div>'}</div>`;
  $('cal_prev').onclick=()=>{ calMonth=new Date(y,m-1,1); render(); };
  $('cal_next').onclick=()=>{ calMonth=new Date(y,m+1,1); render(); };
  $('screen').querySelectorAll('.cal-cell[data-iso]').forEach(c=> c.onclick=()=>{ calSel=c.dataset.iso; render(); });
  $('cal_list').querySelectorAll('.item[data-id]').forEach(el=> el.onclick=()=>editWod(el.dataset.id));
};

/* ---- MORE: progress + movements + backup ---- */
Screens.more = function(){
  $('screen').innerHTML = `
    <div class="list">
      <div class="item" id="m_prog"><div class="lead">📈</div><div class="grow"><div class="title">Progress & Charts</div><div class="sub">Volume + lift maxes</div></div><div class="trail tag">›</div></div>
      <div class="item" id="m_mov"><div class="lead">📚</div><div class="grow"><div class="title">Movement Library</div><div class="sub">Reference & abbreviations</div></div><div class="trail tag">›</div></div>
      <div class="item" id="m_backup"><div class="lead">💾</div><div class="grow"><div class="title">Backup & Restore</div><div class="sub">Export / import your data</div></div><div class="trail tag">›</div></div>
    </div>
    <div class="sectiontitle">About</div>
    <div class="card"><div class="tag">WODBook · installs to your home screen. Data is stored on this device only — use Backup to move it or keep it safe.</div></div>`;
  $('m_prog').onclick = progressSheet;
  $('m_mov').onclick = movementsSheet;
  $('m_backup').onclick = backupSheet;
};

function progressSheet(){
  const wods = DB.data.wods, lifts = DB.data.lifts;
  // workouts per month (last 6)
  const buckets = {};
  wods.forEach(w=>{ const d=new Date(w.date); const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; buckets[k]=(buckets[k]||0)+1; });
  const keys = Object.keys(buckets).sort().slice(-6);
  const max = Math.max(1,...keys.map(k=>buckets[k]));
  const bars = keys.length? `<div class="bars">${keys.map(k=>{
    const h = Math.round(buckets[k]/max*130);
    const lbl = new Date(k+'-01').toLocaleDateString(undefined,{month:'short'});
    return `<div class="b"><div class="val">${buckets[k]}</div><div class="bar" style="height:${h}px"></div><div class="lbl">${lbl}</div></div>`;
  }).join('')}</div>` : '<div class="empty"><p>Log workouts to see volume.</p></div>';
  const names = [...new Set(lifts.map(l=>l.name))].slice(0,6);
  const liftBest = names.map(n=>{ const e=lifts.filter(l=>l.name===n); const b=e.reduce((m,l)=>e1rm(l.weight,l.reps)>e1rm(m.weight,m.reps)?l:m); return {n, v:e1rm(b.weight,b.reps), u:b.unit}; });
  const lmax = Math.max(1,...liftBest.map(x=>x.v));
  const liftBars = liftBest.length? liftBest.map(x=>`
    <div style="margin:8px 0"><div class="row between"><span>${esc(x.n)}</span><span class="tag">${x.v} ${esc(x.u)}</span></div>
    <div style="height:10px;background:var(--card2);border-radius:6px;overflow:hidden;margin-top:4px"><div style="height:100%;width:${Math.round(x.v/lmax*100)}%;background:var(--accent)"></div></div></div>
  `).join('') : '<div class="empty"><p>Log lift maxes to track strength.</p></div>';
  const thisMonth = wods.filter(w=>{ const d=new Date(w.date), n=new Date(); return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); }).length;
  Sheet.open('Progress', `
    <div class="stat-grid" style="margin-bottom:12px">
      <div class="stat"><div class="n">${wods.length}</div><div class="l">Workouts</div></div>
      <div class="stat"><div class="n">${thisMonth}</div><div class="l">This Month</div></div>
      <div class="stat"><div class="n">${names.length}</div><div class="l">Lifts</div></div>
    </div>
    <div class="card"><h3>Workouts per Month</h3>${bars}</div>
    <div class="card"><h3>Lift Maxes (e1RM)</h3>${liftBars}</div>`);
}

function movementsSheet(){
  const cats = ['Weightlifting','Gymnastics','Cardio / Mono','Core','Accessory'];
  Sheet.open('Movement Library', `
    <input class="input" id="mv_search" placeholder="Search movements" style="margin-bottom:12px">
    <div id="mv_list"></div>`, ()=>{
    function paint(f){
      f=(f||'').toLowerCase();
      $('mv_list').innerHTML = cats.map(c=>{
        const items = MOVEMENTS.filter(m=>m.c===c && (!f || (m.n+m.a).toLowerCase().includes(f)));
        if(!items.length) return '';
        return `<div class="sectiontitle">${esc(c)}</div>` + items.map(m=>`
          <div class="card" style="padding:12px"><div class="row between"><span class="big">${esc(m.n)}</span><span class="pill ghost">${esc(m.a)}</span></div>
          <div class="tag" style="margin-top:4px">${esc(m.s)}</div></div>`).join('');
      }).join('');
    }
    paint('');
    $('mv_search').oninput = (e)=>paint(e.target.value);
  });
}

function backupSheet(){
  Sheet.open('Backup & Restore', `
    <div class="card"><h3>Export</h3><div class="tag" style="margin-bottom:10px">Download a JSON file with all your workouts and lifts. Keep it safe or send it to another device.</div>
      <button class="btn primary block" id="bk_export">Download Backup</button></div>
    <div class="card"><h3>Import</h3><div class="tag" style="margin-bottom:10px">Load a backup file. This <b>replaces</b> current data on this device.</div>
      <input type="file" id="bk_file" accept="application/json" class="input"></div>`, ()=>{
    $('bk_export').onclick = ()=>{
      const blob = new Blob([JSON.stringify(DB.data,null,2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `wodbook-backup-${todayISO()}.json`;
      a.click();
      toast('Backup downloaded');
    };
    $('bk_file').onchange = (e)=>{
      const file = e.target.files[0]; if(!file) return;
      const r = new FileReader();
      r.onload = ()=>{ try{
        const obj = JSON.parse(r.result);
        if(!obj.wods||!obj.lifts) throw 0;
        if(confirm('Replace all data on this device with the backup?')){
          DB.data = {wods:obj.wods, lifts:obj.lifts}; DB.save(); Sheet.close(); render(); toast('Data restored');
        }
      }catch(err){ toast('Invalid backup file'); } };
      r.readAsText(file);
    };
  });
}

/* ------------------------------ Timer ----------------------------------- */
const Timer = {
  mode:'For Time', running:false, phase:'idle', elapsed:0, display:0, round:0,
  splits:[], iv:null, lastBeep:-1,
  cfg:{ amrap:12*60, emomIv:60, emomR:10, work:20, rest:10, tabataR:8 },

  total(){ const c=this.cfg;
    return this.mode==='For Time'?0
      : this.mode==='AMRAP'?c.amrap
      : this.mode==='EMOM'?c.emomIv*c.emomR
      : (c.work+c.rest)*c.tabataR; },

  start(){
    if(this.running) return;
    if(this.phase==='idle'||this.phase==='finished') this.reset(true);
    Sound.unlock();
    this.running=true;
    this.phase = this.mode==='Tabata'?'work':'running';
    this.round = (this.mode==='For Time'||this.mode==='AMRAP')?0:1;
    this.tick0(); buzz(30);
    this.iv = setInterval(()=>this.tick(), 1000);
    Screens.timer();
  },
  pause(){ this.running=false; clearInterval(this.iv); this.iv=null; Screens.timer(); },
  reset(keep){ clearInterval(this.iv); this.iv=null; this.running=false; this.elapsed=0; this.round=0; this.splits=[]; this.lastBeep=-1; this.phase='idle';
    const c=this.cfg;
    this.display = this.mode==='AMRAP'?c.amrap : this.mode==='EMOM'?c.emomIv : this.mode==='Tabata'?c.work : 0;
    if(!keep) {} Screens.timer(); },
  tick0(){ const c=this.cfg;
    this.display = this.mode==='For Time'?0 : this.mode==='AMRAP'?c.amrap : this.mode==='EMOM'?c.emomIv : c.work; },
  markRound(){ if(this.mode==='For Time'&&this.running){ this.splits.push(this.elapsed); buzz(20); Sound.beep(); Screens.timer(); } },

  tick(){
    this.elapsed++;
    const c=this.cfg;
    if(this.mode==='For Time'){ this.display=this.elapsed; }
    else if(this.mode==='AMRAP'){ const r=Math.max(0,c.amrap-this.elapsed); this.display=r;
      if(r<=3&&r>=1&&r!==this.lastBeep){ this.lastBeep=r; Sound.beep(); buzz(20); }
      if(r===0) return this.finish(); }
    else if(this.mode==='EMOM'){ const into=(this.elapsed-1)%c.emomIv; this.display=c.emomIv-into;
      this.round=Math.min(c.emomR, Math.floor((this.elapsed-1)/c.emomIv)+1);
      if(into===0){ Sound.beep(); buzz(40); }
      if(this.elapsed>=this.total()) return this.finish(); }
    else { // Tabata
      const cyc=c.work+c.rest, into=(this.elapsed-1)%cyc;
      this.round=Math.min(c.tabataR, Math.floor((this.elapsed-1)/cyc)+1);
      if(into<c.work){ this.phase='work'; this.display=c.work-into; }
      else { this.phase='rest'; this.display=cyc-into; }
      if(into===0||into===c.work){ Sound.beep(); buzz(40); }
      if(this.elapsed>=this.total()) return this.finish();
    }
    this.updateClock();
  },
  finish(){ this.pause(); this.phase='finished'; Sound.finish(); buzz([80,60,120]); Screens.timer();
    setTimeout(()=>{ if(confirm('Workout done — log this result?')){
      go('log'); editWod(null, {title:this.mode, type:this.resultType(), result:this.resultStr(), details:'', rxd:false, notes:'', date:isoToTs(todayISO())});
    }}, 400);
  },
  resultStr(){ const c=this.cfg;
    return this.mode==='For Time'?mmss(this.elapsed)
      : this.mode==='AMRAP'?`${mmss(c.amrap)} AMRAP`
      : this.mode==='EMOM'?`${c.emomR} rounds EMOM`
      : `${c.tabataR} × ${c.work}/${c.rest}s`; },
  resultType(){ return this.mode==='For Time'?'For Time':this.mode==='AMRAP'?'AMRAP':this.mode==='EMOM'?'EMOM':'Other'; },
  updateClock(){ const el=$('tm_clock'); if(el){ el.textContent=mmss(this.display); el.className='clock '+(this.phase==='work'?'work':this.phase==='rest'?'rest':this.phase==='finished'?'done':''); }
    const ph=$('tm_phase'); if(ph) ph.textContent=this.phaseLabel();
    const rd=$('tm_round'); if(rd) rd.textContent=this.roundLabel(); },
  phaseLabel(){ return this.phase==='work'?'WORK':this.phase==='rest'?'REST':this.phase==='finished'?('DONE — '+this.resultStr()):(this.mode==='For Time'&&this.running?'GO':''); },
  roundLabel(){ const c=this.cfg;
    if(this.mode==='EMOM') return `Round ${this.round} / ${c.emomR}`;
    if(this.mode==='Tabata') return `Round ${this.round} / ${c.tabataR}`;
    return ''; },
};

Screens.timer = function(){
  const t=Timer, c=t.cfg;
  const modes=['For Time','AMRAP','EMOM','Tabata'];
  const blurbs={'For Time':'Count up. Tap “Round” to record splits.','AMRAP':'Count down from a set duration.','EMOM':'Every minute on the minute for N rounds.','Tabata':'Work / rest intervals repeated for N rounds.'};
  let cfgHtml='';
  if(t.mode==='AMRAP') cfgHtml = stepperRow('Duration', mmss(c.amrap), 'amrapDn','amrapUp');
  if(t.mode==='EMOM') cfgHtml = stepperRow('Interval', c.emomIv+'s','emomIvDn','emomIvUp')+stepperRow('Rounds', c.emomR,'emomRDn','emomRUp');
  if(t.mode==='Tabata') cfgHtml = stepperRow('Work', c.work+'s','workDn','workUp')+stepperRow('Rest', c.rest+'s','restDn','restUp')+stepperRow('Rounds', c.tabataR,'tabRDn','tabRUp');

  let splitsHtml='';
  if(t.mode==='For Time'&&t.splits.length) splitsHtml = `<div class="splits">${t.splits.map((s,i)=>`<div class="s"><div class="k">R${i+1}</div><div class="v">${mmss(s)}</div></div>`).join('')}</div>`;

  const disabled = t.running?'style="opacity:.5;pointer-events:none"':'';
  $('screen').innerHTML = `
    <div class="seg" ${disabled} id="tm_modes" style="margin-bottom:12px">${modes.map(m=>`<button data-m="${m}" class="${m===t.mode?'active':''}">${m}</button>`).join('')}</div>
    <div class="card" ${disabled}><div class="tag" style="margin-bottom:6px">${blurbs[t.mode]}</div>${cfgHtml||'<div class="tag">Stopwatch — no setup needed.</div>'}</div>
    <div style="margin:24px 0 6px"><div class="clock ${t.phase==='work'?'work':t.phase==='rest'?'rest':t.phase==='finished'?'done':''}" id="tm_clock">${mmss(t.display)}</div>
      <div class="phase" id="tm_phase">${t.phaseLabel()}</div></div>
    <div class="big" style="text-align:center" id="tm_round">${t.roundLabel()}</div>
    ${splitsHtml}
    <div class="timer-controls">
      <button class="btn" id="tm_reset">Reset</button>
      ${t.mode==='For Time'&&t.running?'<button class="btn" id="tm_round_btn">Round</button>':''}
      <button class="btn ${t.running?'':'primary'}" id="tm_go">${t.running?'Pause':'Start'}</button>
    </div>`;

  if(!t.running){
    $('tm_modes').querySelectorAll('button').forEach(b=> b.onclick=()=>{ t.mode=b.dataset.m; t.reset(true); });
    bindStep('amrapDn',()=>c.amrap=Math.max(30,c.amrap-30)); bindStep('amrapUp',()=>c.amrap+=30);
    bindStep('emomIvDn',()=>c.emomIv=Math.max(10,c.emomIv-5)); bindStep('emomIvUp',()=>c.emomIv+=5);
    bindStep('emomRDn',()=>c.emomR=Math.max(1,c.emomR-1)); bindStep('emomRUp',()=>c.emomR++);
    bindStep('workDn',()=>c.work=Math.max(5,c.work-5)); bindStep('workUp',()=>c.work+=5);
    bindStep('restDn',()=>c.rest=Math.max(5,c.rest-5)); bindStep('restUp',()=>c.rest+=5);
    bindStep('tabRDn',()=>c.tabataR=Math.max(1,c.tabataR-1)); bindStep('tabRUp',()=>c.tabataR++);
  }
  $('tm_reset').onclick=()=>t.reset(true);
  $('tm_go').onclick=()=> t.running? t.pause() : t.start();
  if($('tm_round_btn')) $('tm_round_btn').onclick=()=>t.markRound();
  function bindStep(id,fn){ const el=$(id); if(el) el.onclick=()=>{ fn(); t.reset(true); }; }
};
function stepperRow(label,val,dnId,upId){
  return `<div class="stepper"><span>${label}</span><div class="ctl"><button id="${dnId}">−</button><span class="big">${val}</span><button id="${upId}">＋</button></div></div>`;
}

/* ------------------------------ Sound ----------------------------------- */
const Sound = {
  ctx:null,
  unlock(){ if(!this.ctx){ try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
    if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); },
  tone(freq,dur,vol){ if(!this.ctx) return; const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.frequency.value=freq; o.type='sine'; g.gain.value=vol||0.2; o.connect(g); g.connect(this.ctx.destination);
    const t=this.ctx.currentTime; o.start(t); g.gain.setValueAtTime(vol||0.2,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.stop(t+dur); },
  beep(){ this.unlock(); this.tone(880,0.15); },
  finish(){ this.unlock(); this.tone(660,0.18); setTimeout(()=>this.tone(990,0.35),180); }
};

/* --------------------------- Interactions ------------------------------- */
function bindLongPress(container, sel, onLong, onTap){
  if(!container) return;
  container.querySelectorAll(sel).forEach(el=>{
    let timer=null, longed=false;
    const start=()=>{ longed=false; timer=setTimeout(()=>{ longed=true; buzz(30); onLong(el); },550); };
    const cancel=()=>{ clearTimeout(timer); };
    el.addEventListener('touchstart',start,{passive:true});
    el.addEventListener('touchend',()=>{ cancel(); if(!longed && onTap) onTap(el); });
    el.addEventListener('touchmove',cancel,{passive:true});
    el.addEventListener('click',()=>{ if(onTap && !('ontouchstart' in window)) onTap(el); });
  });
}

/* ------------------------------- Boot ----------------------------------- */
DB.load();
renderTabbar();
render();
