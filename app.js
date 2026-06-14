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

/* --------------------------- Per-user settings -------------------------- */
const Settings = {
  KEY:'wodbook.settings.v1',
  _cache:null,
  defaults:{ sound:true, vibrate:true, flash:true, keepAwake:true, leadIn:10, units:'lb',
             name:'', bodyweight:null, dob:'', box:'' },
  get(){
    if(this._cache) return this._cache;
    let s={};
    try{ s = JSON.parse(localStorage.getItem(this.KEY)) || {}; }catch(e){}
    this._cache = Object.assign({}, this.defaults, s);
    return this._cache;
  },
  set(patch){
    this._cache = Object.assign({}, this.get(), patch);
    localStorage.setItem(this.KEY, JSON.stringify(this._cache));
    return this._cache;
  }
};

/* ---------------------- Keep screen awake (Wake Lock) ------------------- */
const Wake = {
  lock:null,
  async on(){
    if(Settings.get().keepAwake===false) return;
    try{
      if('wakeLock' in navigator && !this.lock){
        this.lock = await navigator.wakeLock.request('screen');
        this.lock.addEventListener('release', ()=>{ this.lock=null; });
      }
    }catch(e){ this.lock=null; }
  },
  async off(){
    try{ if(this.lock){ await this.lock.release(); this.lock=null; } }catch(e){ this.lock=null; }
  }
};
// Re-acquire the lock if iOS drops it when returning to the app mid-timer.
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && Timer.running) Wake.on();
});

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
  {id:'log', title:'Workouts', ic:'📋'},
  {id:'lifts', title:'Lifts', ic:'🏋️'},
  {id:'timer', title:'Timer', ic:'⏱'},
  {id:'cal', title:'Calendar', ic:'📅'},
  {id:'more', title:'More', ic:'⋯'},
];
// Sub-view within the Workouts tab: 'log' (history) or 'bench' (benchmarks).
let workoutsView = 'log';
let current = 'log';

function renderTabbar(){
  $('tabbar').innerHTML = TABS.map(t=>`
    <button data-tab="${t.id}" class="${t.id===current?'active':''}">
      <span class="ic">${t.ic}</span><span>${t.title}</span>
    </button>`).join('');
  $('tabbar').querySelectorAll('button').forEach(b=>{
    onTapSafe(b, ()=>{ if(current==='timer' && Timer.running){ if(!confirm('Leave the running timer?')) return; }
      go(b.dataset.tab); });
  });
}
function go(tab){ current = tab; renderTabbar(); render(); }

function render(){
  const t = TABS.find(t=>t.id===current);
  $('screenTitle').textContent = t.title;
  $('topActions').innerHTML = '';
  if(current!=='timer'){ document.body.classList.remove('timer-active','timer-running'); }
  const fns = {log:Screens.workouts, lifts:Screens.lifts, timer:Screens.timer, cal:Screens.cal, more:Screens.more};
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

/* ---- WORKOUTS (Log history + Benchmarks in one tab) ---- */
Screens.workouts = function(){
  // A segmented control switches between "My Log" and "Benchmarks".
  const seg = `<div class="seg" id="wk_seg" style="margin-bottom:12px">
      <button data-v="log" class="${workoutsView==='log'?'active':''}">My Log</button>
      <button data-v="bench" class="${workoutsView==='bench'?'active':''}">Benchmarks</button>
    </div>`;

  if(workoutsView==='log'){
    $('topActions').innerHTML = `<button class="iconbtn" id="addWod">＋</button>`;
  } else {
    $('topActions').innerHTML = '';
  }

  $('screen').innerHTML = seg + `<div id="wk_body"></div>`;
  $('wk_seg').querySelectorAll('button').forEach(b=> onTapSafe(b, ()=>{ workoutsView=b.dataset.v; render(); }));

  if(workoutsView==='log') renderLogBody();
  else renderBenchBody();

  if($('addWod')) onTapSafe($('addWod'), ()=>editWod(null));
};

function renderLogBody(){
  const wods = DB.wodsSorted();
  let html = `<input class="input" id="wodSearch" placeholder="Search workouts" style="margin-bottom:12px">`;
  if(!wods.length){
    html += `<div class="empty"><div class="ic">📋</div><p>No workouts yet.<br>Tap ＋ to log your first WOD.</p></div>`;
  } else {
    html += `<div class="swipe-hint">Tap a workout to edit · long-press to delete</div><div class="list" id="wodList"></div>`;
  }
  $('wk_body').innerHTML = html;
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
}

function renderBenchBody(){
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
  $('wk_body').innerHTML = html;
  bindLongPress($('wk_body'), '.item[data-name]', null, (el)=>benchDetail(el.dataset.name));
}

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

/* ---- BENCHMARKS helpers (rendered inside the Workouts tab) ---- */
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
  bindLongPress($('screen'), '.item[data-name]', null, (el)=>liftDetail(el.dataset.name));
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
  const defUnit = Settings.get().units==='kg'?'kg':'lb';
  Sheet.open('Log Max', `
    ${presetName?`<label class="field"><span>Lift</span><input class="input" value="${esc(presetName)}" disabled></label>`:`
    <label class="field"><span>Lift</span><select class="input" id="l_name">${liftOpts}<option value="__custom">Custom…</option></select></label>
    <label class="field" id="l_customWrap" style="display:none"><span>Custom lift name</span><input class="input" id="l_custom" placeholder="Lift name"></label>`}
    <div class="row" style="gap:10px">
      <label class="field" style="flex:1"><span>Weight</span><input class="input" id="l_weight" type="number" inputmode="decimal" placeholder="0"></label>
      <label class="field" style="width:110px"><span>Unit</span>
        <div class="seg" id="l_unit"><button data-u="lb" class="${defUnit==='lb'?'active':''}">lb</button><button data-u="kg" class="${defUnit==='kg'?'active':''}">kg</button></div></label>
    </div>
    <div class="stepper card"><span>Reps</span><div class="ctl"><button id="l_rm">−</button><span class="big" id="l_reps">1</span><button id="l_rp">＋</button></div></div>
    <div class="tag" id="l_e1rm" style="margin:8px 0"></div>
    <label class="field"><span>Date</span><input class="input" type="date" id="l_date" value="${todayISO()}"></label>
    <label class="field"><span>Notes</span><input class="input" id="l_notes" placeholder="Optional"></label>
    <button class="btn primary block" id="l_save">Save</button>
  `, ()=>{
    let unit=defUnit, reps=1;
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
  onTapSafe($('cal_prev'), ()=>{ calMonth=new Date(y,m-1,1); render(); });
  onTapSafe($('cal_next'), ()=>{ calMonth=new Date(y,m+1,1); render(); });
  $('screen').querySelectorAll('.cal-cell[data-iso]').forEach(c=> onTapSafe(c, ()=>{ calSel=c.dataset.iso; render(); }));
  bindLongPress($('cal_list'), '.item[data-id]', null, (el)=>editWod(el.dataset.id));
};

/* ---- MORE: progress + movements + backup ---- */
Screens.more = function(){
  const s = Settings.get();
  $('screen').innerHTML = `
    <div class="list">
      <div class="item" id="m_settings"><div class="lead">⚙️</div><div class="grow"><div class="title">Settings</div><div class="sub">Sound, vibration, units, name</div></div><div class="trail tag">›</div></div>
      <div class="item" id="m_prog"><div class="lead">📈</div><div class="grow"><div class="title">Progress & Charts</div><div class="sub">Volume + lift maxes</div></div><div class="trail tag">›</div></div>
      <div class="item" id="m_mov"><div class="lead">📚</div><div class="grow"><div class="title">Movement Library</div><div class="sub">Reference & abbreviations</div></div><div class="trail tag">›</div></div>
      <div class="item" id="m_import"><div class="lead">📥</div><div class="grow"><div class="title">Import from myWOD</div><div class="sub">Load a .mywod backup file</div></div><div class="trail tag">›</div></div>
      <div class="item" id="m_backup"><div class="lead">💾</div><div class="grow"><div class="title">Backup & Restore</div><div class="sub">Export / import your data</div></div><div class="trail tag">›</div></div>
    </div>
    <div class="sectiontitle">About</div>
    <div class="card"><div class="tag">WODBook${s.name?(' · '+esc(s.name)):''} · installs to your home screen. Data is stored on this device only — use Backup to move it or keep it safe.</div></div>`;
  onTapSafe($('m_settings'), settingsSheet);
  onTapSafe($('m_prog'), progressSheet);
  onTapSafe($('m_mov'), movementsSheet);
  onTapSafe($('m_import'), importMywodSheet);
  onTapSafe($('m_backup'), backupSheet);
};

function settingsSheet(){
  const s = Settings.get();
  const sw = (on)=>`switch ${on?'on':''}`;
  Sheet.open('Settings', `
    <div class="sectiontitle">Profile</div>
    <label class="field"><span>Name</span>
      <input class="input" id="st_name" value="${esc(s.name||'')}" placeholder="Your name"></label>
    <div class="row" style="gap:10px">
      <label class="field" style="flex:1"><span>Bodyweight (${esc(s.units||'lb')})</span>
        <input class="input" id="st_bw" type="number" inputmode="decimal" value="${s.bodyweight!=null?s.bodyweight:''}" placeholder="—"></label>
      <label class="field" style="flex:1"><span>Box / Gym</span>
        <input class="input" id="st_box" value="${esc(s.box||'')}" placeholder="Optional"></label>
    </div>

    <div class="sectiontitle">Timer cues</div>
    <div class="card">
      <div class="toggle" style="margin-bottom:14px"><span>Sound</span><button class="${sw(s.sound!==false)}" id="st_sound"></button></div>
      <div class="toggle" style="margin-bottom:14px"><span>Vibration</span><button class="${sw(s.vibrate!==false)}" id="st_vib"></button></div>
      <div class="toggle" style="margin-bottom:14px"><span>Screen flash</span><button class="${sw(s.flash!==false)}" id="st_flash"></button></div>
      <div class="toggle"><span>Keep screen awake</span><button class="${sw(s.keepAwake!==false)}" id="st_wake"></button></div>
    </div>

    <div class="sectiontitle">Defaults</div>
    <div class="card">
      <div class="stepper"><span>Lead-in countdown</span><div class="ctl"><button id="st_leadDn">−</button><span class="big" id="st_lead">${s.leadIn|0}s</span><button id="st_leadUp">＋</button></div></div>
      <label class="field" style="margin-top:10px"><span>Default weight unit</span>
        <div class="seg" id="st_units"><button data-u="lb" class="${s.units!=='kg'?'active':''}">lb</button><button data-u="kg" class="${s.units==='kg'?'active':''}">kg</button></div></label>
    </div>

    <button class="btn green block" id="st_test">▶ Test sound</button>
  `, ()=>{
    const toggle=(id,key)=>{ $(id).onclick=()=>{ const cur=Settings.get()[key]!==false; Settings.set({[key]:!cur}); $(id).classList.toggle('on',!cur); }; };
    toggle('st_sound','sound'); toggle('st_vib','vibrate'); toggle('st_flash','flash'); toggle('st_wake','keepAwake');
    $('st_name').oninput = ()=> Settings.set({name:$('st_name').value.trim()});
    $('st_box').oninput = ()=> Settings.set({box:$('st_box').value.trim()});
    $('st_bw').oninput = ()=>{ const v=parseFloat($('st_bw').value); Settings.set({bodyweight: isNaN(v)?null:v}); };
    $('st_units').querySelectorAll('button').forEach(b=> b.onclick=()=>{ Settings.set({units:b.dataset.u}); $('st_units').querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
    const refreshLead=()=> $('st_lead').textContent=(Settings.get().leadIn|0)+'s';
    $('st_leadDn').onclick=()=>{ Settings.set({leadIn:Math.max(0,(Settings.get().leadIn|0)-5)}); refreshLead(); };
    $('st_leadUp').onclick=()=>{ Settings.set({leadIn:(Settings.get().leadIn|0)+5}); refreshLead(); };
    $('st_test').onclick=()=>{ Sound.arm(); Sound.go(); if(Settings.get().vibrate!==false) buzz(60); if(Settings.get().flash!==false) flash('#3ec46d',220); setTimeout(()=>Sound.stop(),1200); };
  });
}

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

/* --------------------- myWOD (.mywod) import ----------------------------
   A .mywod file is a SQLite 3 database. We parse it directly in the browser
   with a tiny built-in SQLite reader (no external libraries) and map:
     MyWODs           -> workout log entries
     MovementSessions -> lift PRs (joined to Movement for the name)
   ---------------------------------------------------------------------- */

const MiniSQLite = (function(){
  function readVarint(buf, pos){
    let result = 0n;
    for(let i=0;i<9;i++){
      const b = buf[pos++];
      if(i===8){ result = (result<<8n) | BigInt(b); return [result, pos]; }
      result = (result<<7n) | BigInt(b & 0x7f);
      if(!(b & 0x80)) return [result, pos];
    }
    return [result, pos];
  }
  function u16(b,p){ return (b[p]<<8)|b[p+1]; }
  function u32(b,p){ return (b[p]*0x1000000)+((b[p+1]<<16)|(b[p+2]<<8)|b[p+3]); }

  function parse(arrayBuffer){
    const db = new Uint8Array(arrayBuffer);
    if(String.fromCharCode(...db.slice(0,15)) !== 'SQLite format 3')
      throw new Error('Not a SQLite/.mywod file');
    let pageSize = u16(db,16); if(pageSize===1) pageSize = 65536;
    const dec = new TextDecoder('utf-8');

    function page(n){ return db.subarray((n-1)*pageSize, n*pageSize); }

    function parseRecord(buf, pos){
      const start = pos;
      let hlen; [hlen,pos] = readVarint(buf,pos);
      const headerEnd = start + Number(hlen);
      const types = [];
      while(pos < headerEnd){ let t; [t,pos]=readVarint(buf,pos); types.push(Number(t)); }
      let body = headerEnd; const vals = [];
      for(const t of types){
        if(t===0) vals.push(null);
        else if(t===1){ vals.push(signed(buf,body,1)); body+=1; }
        else if(t===2){ vals.push(signed(buf,body,2)); body+=2; }
        else if(t===3){ vals.push(signed(buf,body,3)); body+=3; }
        else if(t===4){ vals.push(signed(buf,body,4)); body+=4; }
        else if(t===5){ vals.push(signed(buf,body,6)); body+=6; }
        else if(t===6){ vals.push(signed(buf,body,8)); body+=8; }
        else if(t===7){ const dv=new DataView(buf.buffer, buf.byteOffset+body, 8); vals.push(dv.getFloat64(0,false)); body+=8; }
        else if(t===8) vals.push(0);
        else if(t===9) vals.push(1);
        else if(t>=12 && t%2===0){ const n=(t-12)/2; vals.push(buf.subarray(body,body+n)); body+=n; }
        else if(t>=13 && t%2===1){ const n=(t-13)/2; vals.push(dec.decode(buf.subarray(body,body+n))); body+=n; }
        else vals.push(null);
      }
      return vals;
    }
    function signed(buf,pos,n){
      let v=0; for(let i=0;i<n;i++) v=v*256+buf[pos+i];
      const max=Math.pow(256,n); if(v>=max/2) v-=max; return v;
    }

    function walk(pageNum, out, limit){
      const pg = page(pageNum);
      const hdr = (pageNum===1)?100:0;
      const ptype = pg[hdr];
      const ncells = u16(pg,hdr+3);
      const cps = hdr + ((ptype===5||ptype===2)?12:8);
      if(ptype===5){
        for(let i=0;i<ncells;i++){
          const cp = u16(pg, cps+i*2);
          const child = u32(pg, cp);
          if(out.length<limit) walk(child,out,limit);
        }
        const right = u32(pg, hdr+8);
        if(out.length<limit) walk(right,out,limit);
        return;
      }
      if(ptype!==13) return;
      for(let i=0;i<ncells && out.length<limit;i++){
        const cp = u16(pg, cps+i*2);
        let pos = cp;
        let payloadLen; [payloadLen,pos] = readVarint(pg,pos);
        let rowid; [rowid,pos] = readVarint(pg,pos);
        // NOTE: overflow pages not handled; myWOD rows fit in a page.
        try{ out.push(parseRecord(pg,pos)); }catch(e){}
      }
    }

    // Read schema (root page 1) -> map table name to root page + column names.
    const schema = []; walk(1, schema, 100000);
    const tables = {};
    for(const r of schema){
      if(r[0]==='table'){
        const cols = parseColumns(r[4]);
        tables[r[1]] = { root: r[3], cols };
      }
    }
    function rows(name){
      const t = tables[name]; if(!t) return [];
      const out = []; walk(t.root, out, 100000);
      return out.map(r=>{ const o={}; t.cols.forEach((c,i)=> o[c]=r[i]); return o; });
    }
    return { tables, rows };
  }

  // Extract column names from a CREATE TABLE statement.
  function parseColumns(sql){
    const m = sql.match(/\(([\s\S]*)\)/); if(!m) return [];
    const inner = m[1];
    const parts = []; let depth=0, cur='';
    for(const ch of inner){
      if(ch==='(') depth++;
      if(ch===')') depth--;
      if(ch===',' && depth===0){ parts.push(cur); cur=''; } else cur+=ch;
    }
    if(cur.trim()) parts.push(cur);
    const cols = [];
    for(let p of parts){
      p = p.trim();
      const up = p.toUpperCase();
      if(up.startsWith('PRIMARY KEY')||up.startsWith('FOREIGN KEY')||up.startsWith('UNIQUE')||up.startsWith('CHECK')||up.startsWith('CONSTRAINT')) continue;
      const name = p.split(/\s+/)[0].replace(/["'`]/g,'');
      if(name) cols.push(name);
    }
    return cols;
  }

  return { parse };
})();

// Map myWOD scoreType -> our WOD type.
function mywodType(scoreType){
  switch((scoreType||'').toLowerCase()){
    case 'for time:': return 'For Time';
    case 'for rounds:': return 'AMRAP';
    case 'for repetitions:': return 'AMRAP';
    case 'for load:': return 'Load';
    default: return 'Other';
  }
}
// unit code 0 = lb, 1 = kg (myWOD); others (5/7/8) are reps/dist/time -> skip as lifts.
function mywodUnit(code){ return code===1 ? 'kg' : 'lb'; }

function importMywodSheet(){
  Sheet.open('Import from myWOD', `
    <div class="card"><div class="tag">
      Select your <b>.mywod</b> backup file (exported from the myWOD app).
      Your workouts and lift maxes will be <b>added</b> to WODBook — your existing
      data is kept. Duplicates from re-importing the same file are skipped.
    </div></div>
    <label class="field"><span>myWOD file</span>
      <input type="file" id="mw_file" accept=".mywod,application/octet-stream,application/x-sqlite3" class="input"></label>
    <div id="mw_status"></div>
  `, ()=>{
    $('mw_file').onchange = (e)=>{
      const file = e.target.files[0]; if(!file) return;
      $('mw_status').innerHTML = '<div class="tag">Reading…</div>';
      const r = new FileReader();
      r.onload = ()=>{
        try{ runMywodImport(r.result); }
        catch(err){ $('mw_status').innerHTML = `<div class="card" style="border-color:var(--danger)"><b>Couldn’t import</b><div class="tag">${esc(err.message||String(err))}</div></div>`; }
      };
      r.onerror = ()=>{ $('mw_status').innerHTML = '<div class="tag">Could not read file.</div>'; };
      r.readAsArrayBuffer(file);
    };
  });
}

function runMywodImport(arrayBuffer){
  const sdb = MiniSQLite.parse(arrayBuffer);

  // Build a set of existing keys to avoid duplicates on re-import.
  const existingWods = new Set(DB.data.wods.map(w=> (w.mywodKey||'') ));
  const existingLifts = new Set(DB.data.lifts.map(l=> (l.mywodKey||'') ));

  let addedW=0, addedL=0, skipped=0;
  const debug = { cols: (sdb.tables.MyWODs && sdb.tables.MyWODs.cols) || [], sample: null };

  // ---- Workouts (MyWODs) ----
  const myw = sdb.rows('MyWODs');
  if(myw[0]) debug.sample = { title: myw[0].title, scoreType: myw[0].scoreType, score: myw[0].score };
  for(const r of myw){
    if(r.deleted) continue;
    const key = 'w:'+(r.primaryClientID||'')+':'+(r.primaryRecordID||'');
    if(existingWods.has(key)){ skipped++; continue; }
    const dateMs = r.date ? isoToTs(String(r.date).slice(0,10)) : Date.now();
    // Coerce every text field to a string so a numeric score (e.g. 18) still shows.
    const asStr = (v)=> (v==null) ? '' : (typeof v==='string' ? v : String(v));
    DB.data.wods.push({
      id: uid(), createdAt: Date.now(), mywodKey: key,
      title: asStr(r.title) || 'Workout',
      type: mywodType(asStr(r.scoreType)),
      details: asStr(r.description),
      result: asStr(r.score),
      rxd: !!r.asPrescribed,
      notes: (asStr(r.notes) && r.notes!=='NA') ? asStr(r.notes) : '',
      date: dateMs,
      benchmarkName: null
    });
    addedW++;
  }

  // ---- Lifts (MovementSessions joined to Movement) ----
  const movements = sdb.rows('Movement');
  const mvName = {};
  for(const m of movements) mvName[(m.primaryClientID)+':'+(m.primaryRecordID)] = m.name;
  const sessions = sdb.rows('MovementSessions');
  for(const r of sessions){
    if(r.deleted) continue;
    // Only import weight-based sessions (unit code 0=lb or 1=kg).
    const code = r.measurementAUnitsCode;
    if(code!==0 && code!==1) continue;
    const weight = Number(r.measurementAValue);
    if(!weight || isNaN(weight)) continue;
    const name = mvName[(r.foreignMovementClientID)+':'+(r.foreignMovementRecordID)];
    if(!name) continue;
    const key = 'l:'+(r.primaryClientID||'')+':'+(r.primaryRecordID||'');
    if(existingLifts.has(key)){ skipped++; continue; }
    const reps = parseInt(r.measurementB,10) || 1;
    DB.data.lifts.push({
      id: uid(), createdAt: Date.now(), mywodKey: key,
      name, weight, unit: mywodUnit(code), reps,
      date: r.date ? isoToTs(String(r.date).slice(0,10)) : Date.now(),
      notes: (r.notes||'').trim()
    });
    addedL++;
  }

  // ---- Athlete profile ----
  let profileMsg = '';
  try{
    const ath = sdb.rows('Athlete').filter(a=>!a.deleted)[0];
    if(ath){
      const units = ath.units===1 ? 'kg' : 'lb';
      // myWOD stores weight in ounces; convert to lb, then to chosen unit.
      let bw = null;
      if(ath.weight){
        const lb = Number(ath.weight)/16;
        bw = units==='kg' ? Math.round(lb*0.45359237*10)/10 : Math.round(lb*10)/10;
      }
      const fullName = [ath.firstName, ath.lastName].filter(x=>x && x!=='N').join(' ').trim();
      const patch = { units };
      if(fullName) patch.name = fullName;
      if(bw) patch.bodyweight = bw;
      if(ath.dateOfBirth) patch.dob = String(ath.dateOfBirth).slice(0,10);
      if(ath.boxName) patch.box = ath.boxName;
      Settings.set(patch);
      profileMsg = `<br>Profile updated${bw?` (bodyweight ${bw} ${units})`:''}.`;
    }
  }catch(e){}

  DB.save();
  // Diagnostic preview: shows the parsed score for the first workout so we can
  // confirm times are being read correctly on-device.
  const sampleLine = debug.sample
    ? `${esc(debug.sample.title||'?')} — ${esc(String(debug.sample.score||'(no score)'))}`
    : '(no workouts found)';
  const hasScoreCol = debug.cols.indexOf('score') !== -1;
  $('mw_status').innerHTML = `
    <div class="card" style="border-color:var(--green)">
      <b>Import complete ✅</b>
      <div class="tag" style="margin-top:6px">
        ${addedW} workout${addedW===1?'':'s'} and ${addedL} lift entr${addedL===1?'y':'ies'} added.
        ${skipped?`<br>${skipped} duplicate${skipped===1?'':'s'} skipped.`:''}
        ${profileMsg}
      </div>
    </div>
    <div class="card"><div class="tag">
      <b>Diagnostic</b><br>
      First workout read: <b>${sampleLine}</b><br>
      Score column detected: ${hasScoreCol?'yes':'<span style="color:var(--danger)">NO</span>'}
    </div></div>
    <button class="btn primary block" id="mw_done">Done</button>`;
  $('mw_done').onclick = ()=>{ Sheet.close(); render(); toast('myWOD data imported'); };
}

/* ------------------------------ Timer ----------------------------------- */
const Timer = {
  mode:'For Time', running:false, phase:'idle', elapsed:0, display:0, round:0,
  splits:[], iv:null, lastBeep:-1, lead:0,
  // amrap/forTimeCap are durations in seconds; lead-in is in Settings.
  cfg:{ amrap:12*60, forTimeCap:0, emomIv:60, emomR:10, work:20, rest:10, tabataR:8 },

  total(){ const c=this.cfg;
    return this.mode==='For Time'?c.forTimeCap
      : this.mode==='AMRAP'?c.amrap
      : this.mode==='EMOM'?c.emomIv*c.emomR
      : (c.work+c.rest)*c.tabataR; },

  start(){
    if(this.running) return;
    if(this.phase==='idle'||this.phase==='finished') this.reset(true);
    Sound.arm();                                   // arm audio on user gesture
    Wake.on();                                     // keep screen awake
    this.running=true;
    this.lead = Math.max(0, Settings.get().leadIn|0);  // pre-workout countdown
    if(this.lead > 0){
      this.phase='lead';
      this.display=this.lead;
      this.cueCountdown();
    } else {
      this.beginWork();
    }
    this.iv = setInterval(()=>this.tick(), 1000);
    Screens.timer();
  },
  beginWork(){
    const c=this.cfg;
    this.phase = this.mode==='Tabata'?'work':'running';
    this.round = (this.mode==='For Time'||this.mode==='AMRAP')?0:1;
    this.tick0();
    this.cueGo();                                  // audible GO for ALL modes
  },
  pause(){ this.running=false; clearInterval(this.iv); this.iv=null; Sound.stop(); Wake.off(); Screens.timer(); },
  reset(keep){ clearInterval(this.iv); this.iv=null; this.running=false; this.elapsed=0; this.round=0; this.splits=[]; this.lastBeep=-1; this.lead=0; this.phase='idle';
    Sound.stop(); Wake.off();
    const c=this.cfg;
    this.display = this.mode==='AMRAP'?c.amrap : this.mode==='EMOM'?c.emomIv : this.mode==='Tabata'?c.work : (c.forTimeCap||0);
    Screens.timer(); },
  tick0(){ const c=this.cfg;
    this.display = this.mode==='For Time'?0 : this.mode==='AMRAP'?c.amrap : this.mode==='EMOM'?c.emomIv : c.work; },

  // Combined cues honor per-user Settings (sound / vibration / flash).
  _vib(p){ if(Settings.get().vibrate!==false) buzz(p); },
  _flash(col,ms){ if(Settings.get().flash!==false) flash(col,ms); },
  cueGo(){ Sound.go(); this._vib(60); this._flash('#3ec46d',220); },
  cueCountdown(){ Sound.beep(); this._vib(35); this._flash('#f0a23a',150); },
  cueRound(){ Sound.beep(); this._vib([0,90,60,90]); this._flash('#3ec46d',260); },
  cueRest(){ Sound.beep(); this._vib([0,60,40,60]); this._flash('#f0a23a',260); },
  cueSplit(){ Sound.beep(); this._vib(25); this._flash('#e87a4c',150); },
  cueTick(){ Sound.beep(); this._vib(20); },        // every-minute heartbeat (For Time)
  cueFinish(){ Sound.finish(); this._vib([0,120,80,120,80,200]); this._flash('#e87a4c',500);
    setTimeout(()=>this._flash('#e87a4c',500),550); },

  markRound(){ if(this.mode==='For Time'&&this.running&&this.phase!=='lead'){ this.splits.push(this.elapsed); this.cueSplit(); Screens.timer(); } },

  tick(){
    // Lead-in countdown phase (3-2-1-GO) before the workout begins.
    if(this.phase==='lead'){
      this.lead--;
      if(this.lead<=0){ this.beginWork(); }
      else { this.display=this.lead; this.cueCountdown(); }
      this.updateClock(); return;
    }

    this.elapsed++;
    const c=this.cfg;
    if(this.mode==='For Time'){
      this.display=this.elapsed;
      if(this.elapsed%60===0) this.cueTick();        // audible minute marker
      if(c.forTimeCap>0){
        const r=c.forTimeCap-this.elapsed;
        if(r<=3&&r>=1) this.cueCountdown();
        if(this.elapsed>=c.forTimeCap) return this.finish();
      }
    }
    else if(this.mode==='AMRAP'){ const r=Math.max(0,c.amrap-this.elapsed); this.display=r;
      if(r<=3&&r>=1&&r!==this.lastBeep){ this.lastBeep=r; this.cueCountdown(); }
      if(r===0) return this.finish(); }
    else if(this.mode==='EMOM'){ const into=(this.elapsed-1)%c.emomIv; this.display=c.emomIv-into;
      this.round=Math.min(c.emomR, Math.floor((this.elapsed-1)/c.emomIv)+1);
      if(into===0){ this.cueRound(); }
      if(this.elapsed>=this.total()) return this.finish(); }
    else { // Tabata
      const cyc=c.work+c.rest, into=(this.elapsed-1)%cyc;
      this.round=Math.min(c.tabataR, Math.floor((this.elapsed-1)/cyc)+1);
      if(into<c.work){ this.phase='work'; this.display=c.work-into; }
      else { this.phase='rest'; this.display=cyc-into; }
      if(into===0){ this.cueRound(); }
      else if(into===c.work){ this.cueRest(); }
      if(this.elapsed>=this.total()) return this.finish();
    }
    this.updateClock();
  },
  finish(){ this.running=false; clearInterval(this.iv); this.iv=null; this.phase='finished';
    this.cueFinish(); Wake.off();
    setTimeout(()=>Sound.stop(), 2200);              // stop after the alarm plays out
    Screens.timer();
    setTimeout(()=>{ if(confirm('Workout done — log this result?')){
      workoutsView='log'; go('log'); editWod(null, {title:this.mode, type:this.resultType(), result:this.resultStr(), details:'', rxd:false, notes:'', date:isoToTs(todayISO())});
    }}, 400);
  },
  resultStr(){ const c=this.cfg;
    return this.mode==='For Time'?mmss(this.elapsed)
      : this.mode==='AMRAP'?`${mmss(c.amrap)} AMRAP`
      : this.mode==='EMOM'?`${c.emomR} rounds EMOM`
      : `${c.tabataR} × ${c.work}/${c.rest}s`; },
  resultType(){ return this.mode==='For Time'?'For Time':this.mode==='AMRAP'?'AMRAP':this.mode==='EMOM'?'EMOM':'Other'; },
  updateClock(){ const el=$('tm_clock'); if(el){ el.textContent=mmss(this.display); el.className='clock '+(this.phase==='work'?'work':this.phase==='rest'?'rest':this.phase==='finished'?'done':this.phase==='lead'?'rest':''); }
    const ph=$('tm_phase'); if(ph) ph.textContent=this.phaseLabel();
    const rd=$('tm_round'); if(rd) rd.textContent=this.roundLabel(); },
  phaseLabel(){ if(this.phase==='lead') return 'GET READY';
    return this.phase==='work'?'WORK':this.phase==='rest'?'REST':this.phase==='finished'?('DONE — '+this.resultStr()):(this.running?'GO':''); },
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
  if(t.mode==='For Time') cfgHtml = stepperRow('Time cap', c.forTimeCap>0?mmss(c.forTimeCap):'none', 'capDn','capUp');
  if(t.mode==='AMRAP') cfgHtml = stepperRow('Duration', mmss(c.amrap), 'amrapDn','amrapUp');
  if(t.mode==='EMOM') cfgHtml = stepperRow('Interval', c.emomIv+'s','emomIvDn','emomIvUp')+stepperRow('Rounds', c.emomR,'emomRDn','emomRUp');
  if(t.mode==='Tabata') cfgHtml = stepperRow('Work', c.work+'s','workDn','workUp')+stepperRow('Rest', c.rest+'s','restDn','restUp')+stepperRow('Rounds', c.tabataR,'tabRDn','tabRUp');
  // Lead-in countdown is shared across modes (from Settings).
  cfgHtml += stepperRow('Lead-in', (Settings.get().leadIn|0)+'s', 'leadDn','leadUp');

  let splitsHtml='';
  if(t.mode==='For Time'&&t.splits.length) splitsHtml = `<div class="splits">${t.splits.map((s,i)=>`<div class="s"><div class="k">R${i+1}</div><div class="v">${mmss(s)}</div></div>`).join('')}</div>`;

  // Track body classes so CSS can adapt (landscape big-clock, hide tabs while running).
  document.body.classList.add('timer-active');
  document.body.classList.toggle('timer-running', t.running);

  const landscape = document.body.classList.contains('landscape');
  const disabled = t.running?'style="opacity:.5;pointer-events:none"':'';
  const clockCls = t.phase==='work'?'work':t.phase==='rest'?'rest':t.phase==='finished'?'done':t.phase==='lead'?'rest':'';

  const setupBlock = `
    <div class="seg" ${disabled} id="tm_modes" style="margin-bottom:12px">${modes.map(m=>`<button data-m="${m}" class="${m===t.mode?'active':''}">${m}</button>`).join('')}</div>
    <div class="card" ${disabled}><div class="tag" style="margin-bottom:6px">${blurbs[t.mode]}</div>${cfgHtml}</div>`;

  const clockBlock = `
    <div style="margin:10px 0 6px"><div class="clock ${clockCls}" id="tm_clock">${mmss(t.display)}</div>
      <div class="phase" id="tm_phase">${t.phaseLabel()}</div></div>
    <div class="big" style="text-align:center" id="tm_round">${t.roundLabel()}</div>
    ${splitsHtml}
    <div class="timer-controls">
      <button class="btn" id="tm_reset">Reset</button>
      ${t.mode==='For Time'&&t.running?'<button class="btn" id="tm_round_btn">Round</button>':''}
      <button class="btn ${t.running?'':'primary'}" id="tm_go">${t.running?'Pause':'Start'}</button>
    </div>`;

  if(landscape){
    // Two columns: setup/round info on the left, giant clock + controls on the right.
    $('screen').innerHTML = `
      <div class="tm-land">
        <div class="tm-right">${clockBlock}</div>
        <div class="tm-left">${setupBlock}</div>
      </div>`;
  } else {
    $('screen').innerHTML = setupBlock + clockBlock;
  }

  if(!t.running){
    $('tm_modes').querySelectorAll('button').forEach(b=> b.onclick=()=>{ t.mode=b.dataset.m; t.reset(true); });
    bindStep('capDn',()=>c.forTimeCap=Math.max(0,c.forTimeCap-30)); bindStep('capUp',()=>c.forTimeCap+=30);
    bindStep('amrapDn',()=>c.amrap=Math.max(30,c.amrap-30)); bindStep('amrapUp',()=>c.amrap+=30);
    bindStep('emomIvDn',()=>c.emomIv=Math.max(10,c.emomIv-5)); bindStep('emomIvUp',()=>c.emomIv+=5);
    bindStep('emomRDn',()=>c.emomR=Math.max(1,c.emomR-1)); bindStep('emomRUp',()=>c.emomR++);
    bindStep('workDn',()=>c.work=Math.max(5,c.work-5)); bindStep('workUp',()=>c.work+=5);
    bindStep('restDn',()=>c.rest=Math.max(5,c.rest-5)); bindStep('restUp',()=>c.rest+=5);
    bindStep('tabRDn',()=>c.tabataR=Math.max(1,c.tabataR-1)); bindStep('tabRUp',()=>c.tabataR++);
    // Lead-in persists to Settings.
    bindStep('leadDn',()=>{ const s=Settings.get(); Settings.set({leadIn:Math.max(0,(s.leadIn|0)-5)}); });
    bindStep('leadUp',()=>{ const s=Settings.get(); Settings.set({leadIn:(s.leadIn|0)+5}); });
  }
  $('tm_reset').onclick=()=>t.reset(true);
  $('tm_go').onclick=()=> t.running? t.pause() : t.start();
  if($('tm_round_btn')) $('tm_round_btn').onclick=()=>t.markRound();
  function bindStep(id,fn){ const el=$(id); if(el) el.onclick=()=>{ fn(); t.reset(true); }; }
};
function stepperRow(label,val,dnId,upId){
  return `<div class="stepper"><span>${label}</span><div class="ctl"><button id="${dnId}">−</button><span class="big">${val}</span><button id="${upId}">＋</button></div></div>`;
}

/* ------------------------------ Sound -----------------------------------
   To play on iOS even when the Ring/Silent switch is on SILENT, we route
   WebAudio through an <audio> element that loops a tiny silent clip. iOS then
   treats the page as MEDIA playback (music/video channel) which ignores the
   ringer switch. We also set the audio session to "playback" where supported. */
const Sound = {
  ctx:null, dest:null, keepEl:null, silentEl:null, started:false, pending:[],

  // 1s of silence as a WAV data URI (used to hold an active media session).
  _silentWav:'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',

  enabled(){ return Settings.get().sound !== false; },

  // Arm the audio session on a user gesture (Start). Keepalive runs ONLY
  // while the timer is active, and stop() tears it down so nothing lingers.
  arm(){
    if(!this.enabled()) return;
    if(!this.ctx){
      try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
    }
    if(!this.ctx) return;
    if(this.ctx.state==='suspended') this.ctx.resume();
    try{ if(navigator.audioSession){ navigator.audioSession.type='playback'; } }catch(e){}

    // Media-channel route (plays on silent): WebAudio -> MediaStream -> <audio>.
    if(!this.dest){
      try{
        if(this.ctx.createMediaStreamDestination){
          this.dest = this.ctx.createMediaStreamDestination();
          this.keepEl = document.createElement('audio');
          this.keepEl.setAttribute('playsinline','');
          this.keepEl.loop = true;
          this.keepEl.srcObject = this.dest.stream;
          this.keepEl.play().catch(()=>{});
        }
      }catch(e){ this.dest = null; }
    } else if(this.keepEl){ this.keepEl.play().catch(()=>{}); }

    // Looping silent clip keeps the media session warm.
    if(!this.silentEl){
      try{
        this.silentEl = document.createElement('audio');
        this.silentEl.src = this._silentWav; this.silentEl.loop = true;
        this.silentEl.setAttribute('playsinline',''); this.silentEl.volume = 0.01;
      }catch(e){}
    }
    if(this.silentEl) this.silentEl.play().catch(()=>{});
    this.started = true;
  },

  // Stop ALL audio: cancel queued tones and pause the keepalive elements.
  stop(){
    this.pending.forEach(id=>clearTimeout(id)); this.pending = [];
    try{ if(this.keepEl){ this.keepEl.pause(); } }catch(e){}
    try{ if(this.silentEl){ this.silentEl.pause(); this.silentEl.currentTime = 0; } }catch(e){}
  },

  _out(){ return this.dest || (this.ctx ? this.ctx.destination : null); },

  tone(freq,dur,vol,type){
    if(!this.enabled() || !this.ctx) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.frequency.value=freq; o.type=type||'square';
    o.connect(g); g.connect(this._out());
    const t=this.ctx.currentTime, v=vol==null?0.6:vol;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(v,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t); o.stop(t+dur+0.02);
  },

  beep(){ this.tone(880,0.16,0.6); },
  go(){ this.tone(1175,0.4,0.7); },     // distinct "GO" cue at start

  // Louder, longer multi-tone finish alarm (rising bursts, repeated).
  finish(){
    const seq = [[660,0,0.18],[880,200,0.20],[1175,400,0.45],
                 [660,750,0.18],[880,950,0.20],[1175,1150,0.5]];
    seq.forEach(([f,delay,d])=> this.pending.push(setTimeout(()=>this.tone(f,d,0.85),delay)));
  }
};

/* Full-screen color flash visual cue (works even when sound is blocked). */
function flash(color, ms){
  let el = document.getElementById('flashLayer');
  if(!el){
    el = document.createElement('div');
    el.id = 'flashLayer';
    el.style.cssText = 'position:fixed;inset:0;z-index:200;pointer-events:none;opacity:0;transition:opacity .12s';
    document.body.appendChild(el);
  }
  el.style.background = color;
  el.style.opacity = '0.55';
  clearTimeout(el._h);
  el._h = setTimeout(()=>{ el.style.opacity = '0'; }, ms||220);
}

/* --------------------------- Interactions -------------------------------
   Tap / long-press helper that ignores scrolls. A tap only fires if the
   finger barely moved (< MOVE_TOL px) and was released quickly; scrolling or
   dragging never triggers navigation. Long-press (≥ HOLD ms) fires onLong. */
const MOVE_TOL = 12;   // px of movement allowed before it's treated as a scroll
const HOLD = 600;      // ms to register a long-press
function bindLongPress(container, sel, onLong, onTap){
  if(!container) return;
  container.querySelectorAll(sel).forEach(el=>{
    let timer=null, longed=false, moved=false, sx=0, sy=0, active=false;

    const clearTimer=()=>{ if(timer){ clearTimeout(timer); timer=null; } };

    el.addEventListener('touchstart',(e)=>{
      if(e.touches.length>1) return;          // ignore multi-touch
      active=true; longed=false; moved=false;
      sx=e.touches[0].clientX; sy=e.touches[0].clientY;
      clearTimer();
      timer=setTimeout(()=>{ if(active && !moved){ longed=true; buzz(30); onLong && onLong(el); } }, HOLD);
    },{passive:true});

    el.addEventListener('touchmove',(e)=>{
      if(!active) return;
      const dx=Math.abs(e.touches[0].clientX-sx), dy=Math.abs(e.touches[0].clientY-sy);
      if(dx>MOVE_TOL || dy>MOVE_TOL){ moved=true; clearTimer(); }   // it's a scroll
    },{passive:true});

    el.addEventListener('touchend',()=>{
      clearTimer();
      if(active && !longed && !moved && onTap) onTap(el);   // genuine tap only
      active=false;
    });
    el.addEventListener('touchcancel',()=>{ clearTimer(); active=false; });

    // Desktop / non-touch fallback.
    el.addEventListener('click',()=>{ if(onTap && !('ontouchstart' in window)) onTap(el); });
  });
}

/* Robust tap binding for simple buttons/menu items (no long-press needed).
   Same scroll-tolerance so a quick scroll won't accidentally activate them. */
function onTapSafe(el, fn){
  if(!el) return;
  let sx=0, sy=0, moved=false, active=false;
  el.addEventListener('touchstart',(e)=>{ if(e.touches.length>1){active=false;return;} active=true; moved=false; sx=e.touches[0].clientX; sy=e.touches[0].clientY; },{passive:true});
  el.addEventListener('touchmove',(e)=>{ if(!active)return; if(Math.abs(e.touches[0].clientX-sx)>MOVE_TOL||Math.abs(e.touches[0].clientY-sy)>MOVE_TOL) moved=true; },{passive:true});
  el.addEventListener('touchend',(e)=>{ if(active && !moved){ e.preventDefault(); fn(el); } active=false; });
  el.addEventListener('click',()=>{ if(!('ontouchstart' in window)) fn(el); });
}

/* ------------------------ Orientation tracking -------------------------- */
function updateOrientationClass(){
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  document.body.classList.toggle('landscape', landscape);
}
window.addEventListener('resize', ()=>{ updateOrientationClass(); if(current==='timer') Screens.timer(); });
window.addEventListener('orientationchange', ()=>{ setTimeout(()=>{ updateOrientationClass(); if(current==='timer') Screens.timer(); }, 150); });

/* ------------------------------- Boot ----------------------------------- */
DB.load();
updateOrientationClass();
renderTabbar();
render();
