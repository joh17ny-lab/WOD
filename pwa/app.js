/* ============================================================================
   WODBook PWA — all app logic in one file.
   Data persists in localStorage. No backend, works offline.
   ========================================================================== */

/* ---------------------------- Storage layer ----------------------------- */
const DB = {
  KEY: 'wodbook.v1',
  data: { wods: [], lifts: [], bw: [], food: [], water: [], customFoods: [], meals: [] },
  load(){
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)) || this.data; }
    catch(e){}
    if(!this.data.wods) this.data.wods = [];
    if(!this.data.lifts) this.data.lifts = [];
    if(!this.data.bw) this.data.bw = [];           // bodyweight readings
    if(!this.data.food) this.data.food = [];       // food diary entries
    if(!this.data.water) this.data.water = [];     // water readings {date, ml}
    if(!this.data.customFoods) this.data.customFoods = []; // user-created foods
    if(!this.data.meals) this.data.meals = [];     // saved meals (groups of foods)
    this.seedBenchmarks();                         // pre-load benchmark WODs once
  },
  save(){ localStorage.setItem(this.KEY, JSON.stringify(this.data)); },

  /// One-time seed: add every benchmark WOD as a real (un-scored) entry so they
  /// appear in the workout list by default. Guarded by a flag so it runs only
  /// once and won't re-add benchmarks the user later deletes.
  seedBenchmarks(){
    if(this.data.seededBenchmarks) return;
    if(typeof BENCHMARKS === 'undefined') return;  // data not loaded yet
    // Don't duplicate a benchmark that's already in the log (e.g. restored
    // from a backup made after seeding).
    const have = new Set(
      this.data.wods
        .map(w => (w.benchmarkName || w.title || '').toLowerCase())
    );
    BENCHMARKS.forEach(b=>{
      if(have.has(b.name.toLowerCase())) return;
      this.data.wods.push({
        id: uid(), createdAt: Date.now(),
        title: b.name, type: b.type, details: b.desc,
        result: '', rxd: false, notes: '',
        date: isoToTs(todayISO()),
        benchmarkName: b.name, seeded: true
      });
    });
    this.data.seededBenchmarks = true;
    this.save();
  },

  // Nutrition: food diary
  addFood(f){ f.id=uid(); f.createdAt=Date.now(); this.data.food.push(f); this.save(); },
  deleteFood(id){ this.data.food = this.data.food.filter(x=>x.id!==id); this.save(); },
  foodFor(iso){ return this.data.food.filter(f=> tsToISO(f.date)===iso); },
  // Custom foods (reusable)
  addCustomFood(f){ f.id=uid(); this.data.customFoods.push(f); this.save(); },
  deleteCustomFood(id){ this.data.customFoods = this.data.customFoods.filter(x=>x.id!==id); this.save(); },
  // Saved meals
  addMeal(m){ m.id=uid(); this.data.meals.push(m); this.save(); },
  deleteMeal(id){ this.data.meals = this.data.meals.filter(x=>x.id!==id); this.save(); },
  // Water (one running total per day, stored in ml)
  waterFor(iso){ const r=this.data.water.find(w=>w.iso===iso); return r? r.ml : 0; },
  addWater(iso, ml){ let r=this.data.water.find(w=>w.iso===iso);
    if(!r){ r={iso, ml:0}; this.data.water.push(r); }
    r.ml = Math.max(0, r.ml + ml); this.save(); },
  // WODs
  addWod(w){ w.id = uid(); w.createdAt = Date.now(); this.data.wods.push(w); this.save(); },
  updateWod(id, patch){ const w=this.data.wods.find(x=>x.id===id); if(w){Object.assign(w,patch); this.save();} },
  deleteWod(id){ this.data.wods = this.data.wods.filter(x=>x.id!==id); this.save(); },
  wodsSorted(){ return [...this.data.wods].sort((a,b)=> b.date - a.date); },
  // Lifts
  addLift(l){ l.id = uid(); l.createdAt = Date.now(); this.data.lifts.push(l); this.save(); },
  deleteLift(id){ this.data.lifts = this.data.lifts.filter(x=>x.id!==id); this.save(); },
  // Bodyweight
  addBW(b){ b.id = uid(); b.createdAt = Date.now(); this.data.bw.push(b);
    // Keep Settings' current bodyweight in sync with the latest reading.
    const latest = [...this.data.bw].sort((x,y)=>y.date-x.date)[0];
    if(latest) Settings.set({ bodyweight: latest.weight, units: latest.unit });
    this.save(); },
  deleteBW(id){ this.data.bw = this.data.bw.filter(x=>x.id!==id); this.save(); },
};

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* --------------------------- Per-user settings -------------------------- */
const Settings = {
  KEY:'wodbook.settings.v1',
  _cache:null,
  defaults:{ sound:true, vibrate:true, flash:true, keepAwake:true, leadIn:10, units:'lb',
             name:'', bodyweight:null, dob:'', box:'',
             // Profile for the calorie calculator
             sex:'male', heightIn:null, activity:'moderate', dietGoal:'maintain',
             // Nutrition goals
             kcalGoal:2000, proteinGoal:150, carbsGoal:200, fatGoal:65, waterGoal:3000,
             // Cronometer-style: USDA source + micronutrient tracking
             usdaKey:'', trackMicros:true },
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
  {id:'food', title:'Food', ic:'🍎'},
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
  const fns = {log:Screens.workouts, lifts:Screens.lifts, timer:Screens.timer, food:Screens.food, cal:Screens.cal, more:Screens.more};
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

/* ---- WORKOUTS (logged entries + benchmarks merged, sorted A–Z) ---- */
Screens.workouts = function(){
  $('topActions').innerHTML = `<button class="iconbtn" id="addWod">＋</button>`;
  $('screen').innerHTML =
    `<input class="input" id="wodSearch" placeholder="Search workouts" style="margin-bottom:12px">
     <div class="swipe-hint">Tap to open · long-press a logged entry to delete</div>
     <div class="list" id="wkList"></div>`;
  if($('addWod')) onTapSafe($('addWod'), ()=>editWod(null));

  const listEl = $('wkList');

  // Build the merged, alphabetized model.
  // - Logged workouts are GROUPED by benchmark name (or title): one row per
  //   workout, even if you've logged it many times (combines duplicates).
  // - The row shows your best/most-recent scored attempt; tapping opens the
  //   detail with full history.
  // - Benchmarks you've never logged appear as loggable templates.
  function buildItems(){
    const logged = DB.wodsSorted();                        // already newest-first
    const groupKey = (w)=> (w.benchmarkName || w.title || '').toLowerCase().replace(/\s+/g,' ').trim();

    // Group all logged entries by their key.
    const groups = new Map();                              // key -> [entries]
    logged.forEach(w=>{
      const k = groupKey(w);
      if(!groups.has(k)) groups.set(k, []);
      groups.get(k).push(w);
    });

    const items = [];
    groups.forEach((entries, k)=>{
      // Pick a representative: prefer a scored attempt, else the newest entry.
      const scored = entries.filter(e=> (e.result||'').trim());
      const rep = scored[0] || entries[0];                 // entries already newest-first
      const count = entries.length;
      items.push({
        kind:'log', id:rep.id, title:rep.title, type:rep.type,
        result:rep.result, rxd:rep.rxd, date:rep.date, count,
        search:(entries.map(e=>e.title+e.details+e.notes).join(' ')).toLowerCase()
      });
    });

    // Add benchmark templates that aren't already represented in the log.
    const haveKeys = new Set([...groups.keys()]);
    BENCHMARKS.forEach(b=>{
      const n = b.name.toLowerCase();
      if(haveKeys.has(n)) return;
      items.push({ kind:'bench', name:b.name, title:b.name, type:b.type,
        cat:b.cat, search:(b.name+' '+b.desc).toLowerCase() });
    });

    // Sort alphabetically by title (case-insensitive); ties keep log first.
    items.sort((a,b)=>{
      const t = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
      if(t!==0) return t;
      return (a.kind==='log'?0:1) - (b.kind==='log'?0:1);
    });
    return items;
  }

  function rowHtml(it){
    if(it.kind==='log'){
      const countBadge = it.count>1 ? ` · ${it.count}×` : '';
      return `<div class="item" data-kind="log" data-id="${it.id}">
        <div class="lead">${typeIcon(it.type)}</div>
        <div class="grow">
          <div class="title">${esc(it.title)}</div>
          <div class="sub">${esc(it.type)}${it.result?' · '+esc(it.result):''}${countBadge}</div>
        </div>
        <div class="trail">
          ${it.rxd?'<span class="pill">RX</span><br>':''}
          <span class="tag">${fmtDate(it.date)}</span>
        </div>
      </div>`;
    }
    // Benchmark template (not yet logged).
    return `<div class="item" data-kind="bench" data-name="${esc(it.name)}">
      <div class="lead">${it.cat==='The Girls'?'⭐':'🛡'}</div>
      <div class="grow">
        <div class="title">${esc(it.title)}</div>
        <div class="sub">${esc(it.type)} · benchmark</div>
      </div>
      <div class="trail tag">＋</div>
    </div>`;
  }

  const all = buildItems();
  function paint(filter){
    const f = (filter||'').toLowerCase();
    const items = f ? all.filter(it=> it.search.includes(f)) : all;
    if(!items.length){
      listEl.innerHTML = `<div class="empty"><div class="ic">📋</div><p>${all.length? 'No matches.' : 'No workouts yet.<br>Tap ＋ to log your first WOD.'}</p></div>`;
      return;
    }
    listEl.innerHTML = items.map(rowHtml).join('');
    bindLongPress(listEl, '.item[data-kind="log"]', (el)=>{
      // For grouped workouts (multiple attempts), long-press opens the detail so
      // you can manage individual attempts. Single entries delete directly.
      const it = items.find(x=> x.kind==='log' && x.id===el.dataset.id);
      if(it && it.count>1){ wodDetail(el.dataset.id); return; }
      if(confirm('Delete this workout?')){ DB.deleteWod(el.dataset.id); render(); }
    }, (el)=> wodDetail(el.dataset.id));
    bindLongPress(listEl, '.item[data-kind="bench"]', null, (el)=> benchDetail(el.dataset.name));
  }
  paint('');
  $('wodSearch').oninput = (e)=>paint(e.target.value);
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
    <label class="field"><span>Calories burned (optional)</span><input class="input" id="f_kcal" type="number" inputmode="numeric" value="${base.kcalBurned!=null?base.kcalBurned:''}" placeholder="e.g. 350"></label>
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
      const kb = parseFloat($('f_kcal').value);
      const rec = {
        title, type, details:$('f_details').value.trim(), result:$('f_result').value.trim(),
        rxd, notes:$('f_notes').value.trim(), date:isoToTs($('f_date').value||todayISO()),
        kcalBurned: isNaN(kb)?0:kb,
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
  const norm = (s)=> String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
  // Match by benchmarkName when present, else fall back to the title so older
  // imports that predate benchmark-linking still show up here.
  const attempts = DB.data.wods.filter(w=>
    norm(w.benchmarkName)===norm(name) ||
    (!w.benchmarkName && norm(w.title)===norm(name))
  ).sort((a,c)=>c.date-a.date);
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
    ${attempts.length?`<div class="sectiontitle">History (${attempts.length})</div>
    <div class="list" id="b_hist">${attempts.map(a=>`
      <div class="item"><div class="grow"><div class="title">${esc(a.result||'—')}</div>
        <div class="sub">${fmtDateFull(a.date)}</div></div>
        ${a.rxd?'<span class="pill">RX</span>':''}</div>`).join('')}</div>`:''}
  `, ()=>{
    $('b_log').onclick = ()=>{ Sheet.close(); editWod(null, {
      title:b.name, type:b.type, details:b.desc, result:'', rxd:false, notes:'', date:isoToTs(todayISO()), benchmarkName:b.name
    }); };
  });
}

/* Detail for a logged workout: all attempts of the same WOD + PR + history.
   Workouts are grouped by benchmarkName when present, otherwise by title. */
function wodDetail(id){
  const w = DB.data.wods.find(x=>x.id===id);
  if(!w) return;
  const groupKey = (x)=> (x.benchmarkName || x.title || '').toLowerCase().replace(/\s+/g,' ').trim();
  const key = groupKey(w);
  const attempts = DB.data.wods.filter(x=> groupKey(x)===key).sort((a,c)=>c.date-a.date);

  // PR: fastest for timed WODs, else most recent scored attempt.
  let best=null;
  const scored = attempts.filter(a=>a.result);
  if(scored.length){
    if(w.type==='For Time'){ best = scored.reduce((m,a)=> (parseTimeToSec(a.result)??1e9) < (parseTimeToSec(m.result)??1e9)?a:m ); }
    else best = scored[0];
  }

  function open(){
    const list = attempts.map(a=>`
      <div class="item" data-id="${a.id}"><div class="lead">${typeIcon(a.type)}</div>
        <div class="grow"><div class="title">${esc(a.result||'—')}</div>
          <div class="sub">${fmtDateFull(a.date)}${a.notes?' · '+esc(a.notes):''}</div></div>
        ${a.rxd?'<span class="pill">RX</span>':''}</div>`).join('');

    Sheet.open(w.title, `
      <div class="card"><h3>Workout</h3>
        ${w.details?`<div style="white-space:pre-wrap">${esc(w.details)}</div>`:'<div class="tag">No description.</div>'}
        <div class="tag" style="margin-top:8px">Type: ${esc(w.type)}${w.kcalBurned?` · 🔥 ${Math.round(w.kcalBurned)} kcal`:''}</div></div>
      ${best?`<div class="card"><h3>🏆 Personal Best</h3>
        <div class="big" style="font-size:22px">${esc(best.result)}</div>
        <div class="tag">${fmtDateFull(best.date)} ${best.rxd?'· RX':''}</div></div>`:''}
      <button class="btn primary block" id="w_again">＋ Log Again</button>
      <button class="btn block" id="w_edit" style="margin-top:8px">Edit This Entry</button>
      ${attempts.length>1 || scored.length?`<div class="sectiontitle">History (${attempts.length})</div>
      <div class="list" id="w_hist">${list}</div>`:''}
    `, ()=>{
      onTapSafe($('w_again'), ()=>{ Sheet.close(); editWod(null, {
        title:w.title, type:w.type, details:w.details, result:'', rxd:false, notes:'',
        date:isoToTs(todayISO()), benchmarkName:w.benchmarkName||null
      }); });
      onTapSafe($('w_edit'), ()=>{ Sheet.close(); editWod(w.id); });
      // Tap any history row to edit that specific attempt.
      bindLongPress($('w_hist'), '.item[data-id]', (el)=>{
        if(confirm('Delete this attempt?')){ DB.deleteWod(el.dataset.id); Sheet.close(); render(); }
      }, (el)=>{ Sheet.close(); editWod(el.dataset.id); });
    });
  }
  open();
}

/* ---- LIFTS (with Bodyweight tracker at top) ---- */
Screens.lifts = function(){
  $('topActions').innerHTML = `<button class="iconbtn" id="addLift">＋</button>`;
  if($('addLift')) onTapSafe($('addLift'), ()=>editLift(null));

  // Bodyweight summary (latest reading).
  const bw = [...DB.data.bw].sort((a,b)=>b.date-a.date);
  const latestBW = bw[0];
  const bwRow = `<div class="item" id="bwRow">
      <div class="lead">⚖️</div>
      <div class="grow"><div class="title">Bodyweight</div>
        <div class="sub">${latestBW?('last: '+fmtDate(latestBW.date)):'tap to add a reading'}</div></div>
      <div class="trail">${latestBW?`<div class="big">${latestBW.weight}${esc(latestBW.unit)}</div>`:'<div class="tag">＋</div>'}</div>
    </div>`;

  const names = [...new Set(DB.data.lifts.map(l=>l.name))].sort();
  let liftsHtml = '';
  if(!names.length){
    liftsHtml = `<div class="empty" style="padding:30px 20px"><div class="ic">🏋️</div><p>No lifts tracked yet.<br>Tap ＋ to log a max.</p></div>`;
  } else {
    liftsHtml = `<div class="sectiontitle">Lifts</div><div class="list" id="liftList">` + names.map(n=>{
      const entries = DB.data.lifts.filter(l=>l.name===n);
      const best = entries.reduce((m,l)=> e1rm(l.weight,l.reps)>e1rm(m.weight,m.reps)?l:m);
      return `<div class="item" data-name="${esc(n)}">
        <div class="lead">🏋️</div>
        <div class="grow"><div class="title">${esc(n)}</div>
          <div class="sub">best e1RM ${e1rm(best.weight,best.reps)} ${esc(best.unit)}</div></div>
        <div class="trail"><div class="big">${best.weight}${esc(best.unit)}</div><div class="tag">×${best.reps}</div></div></div>`;
    }).join('') + `</div>`;
  }

  $('screen').innerHTML = `<div class="sectiontitle">Body</div><div class="list">${bwRow}</div>${liftsHtml}`;
  onTapSafe($('bwRow'), bodyweightDetail);
  if($('liftList')) bindLongPress($('liftList'), '.item[data-name]', null, (el)=>liftDetail(el.dataset.name));
};

/* Bodyweight history + chart, with quick add. */
function bodyweightDetail(){
  const entries = [...DB.data.bw].sort((a,b)=>a.date-b.date);
  const chart = entries.length>1 ? lineChartSVG(entries.map(e=>({x:e.date, y:e.weight}))) : '';
  Sheet.open('Bodyweight', `
    <button class="btn primary block" id="bw_add">＋ Log Bodyweight</button>
    ${chart?`<div class="card"><h3>Bodyweight over time</h3>${chart}</div>`:''}
    <div class="sectiontitle">Readings (${entries.length})</div>
    <div class="list" id="bw_list">${entries.length?[...entries].reverse().map(e=>`
      <div class="item" data-id="${e.id}">
        <div class="grow"><div class="title">${e.weight} ${esc(e.unit)}</div>
          <div class="sub">${fmtDateFull(e.date)}${e.notes?' · '+esc(e.notes):''}</div></div></div>`).join(''):'<div class="empty"><p>No readings yet.</p></div>'}</div>
  `, ()=>{
    onTapSafe($('bw_add'), ()=>{ Sheet.close(); editBodyweight(); });
    bindLongPress($('bw_list'), '.item[data-id]', (el)=>{
      if(confirm('Delete this reading?')){ DB.deleteBW(el.dataset.id); Sheet.close(); render(); }
    });
  });
}

function editBodyweight(){
  const defUnit = Settings.get().units==='kg'?'kg':'lb';
  const prefill = Settings.get().bodyweight!=null ? Settings.get().bodyweight : '';
  Sheet.open('Log Bodyweight', `
    <div class="row" style="gap:10px">
      <label class="field" style="flex:1"><span>Weight</span>
        <input class="input" id="bw_w" type="number" inputmode="decimal" value="${prefill}" placeholder="0"></label>
      <label class="field" style="width:110px"><span>Unit</span>
        <div class="seg" id="bw_unit"><button data-u="lb" class="${defUnit==='lb'?'active':''}">lb</button><button data-u="kg" class="${defUnit==='kg'?'active':''}">kg</button></div></label>
    </div>
    <label class="field"><span>Date</span><input class="input" type="date" id="bw_date" value="${todayISO()}"></label>
    <label class="field"><span>Notes</span><input class="input" id="bw_notes" placeholder="Optional"></label>
    <button class="btn primary block" id="bw_save">Save</button>
  `, ()=>{
    let unit=defUnit;
    $('bw_unit').querySelectorAll('button').forEach(b=> b.onclick=()=>{ unit=b.dataset.u; $('bw_unit').querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
    $('bw_save').onclick = ()=>{
      const w = parseFloat($('bw_w').value);
      if(isNaN(w)){ toast('Enter a weight'); return; }
      DB.addBW({ weight:w, unit, date:isoToTs($('bw_date').value||todayISO()), notes:$('bw_notes').value.trim() });
      Sheet.close(); render(); toast('Bodyweight saved');
    };
  });
}

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
  const defUnit = Settings.get().units==='kg'?'kg':'lb';
  // Build the lift picker: Common lifts + the full Movement Library
  // (weightlifting first, then everything else), de-duplicated.
  const commonSet = new Set(COMMON_LIFTS.map(x=>x.toLowerCase()));
  const libWeight = MOVEMENTS.filter(m=>m.c==='Weightlifting' && !commonSet.has(m.n.toLowerCase()));
  const libOther  = MOVEMENTS.filter(m=>m.c!=='Weightlifting' && !commonSet.has(m.n.toLowerCase()));
  const opt = (n)=> `<option ${n===presetName?'selected':''}>${esc(n)}</option>`;
  const liftOpts = `
    <optgroup label="Common Lifts">${COMMON_LIFTS.map(opt).join('')}</optgroup>
    ${libWeight.length?`<optgroup label="Library · Weightlifting">${libWeight.map(m=>opt(m.n)).join('')}</optgroup>`:''}
    ${libOther.length?`<optgroup label="Library · Other Movements">${libOther.map(m=>opt(m.n)).join('')}</optgroup>`:''}`;
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

/* ============================ NUTRITION ============================== */
let foodDay = todayISO();                 // currently viewed diary date
const MEALS = ['Breakfast','Lunch','Dinner','Snacks'];

/* ---- Measuring units for food (solid), drink (liquid) and count ----
   Each unit's `base` is its size in the category's base unit:
     solid  base = 1 g, liquid base = 1 mL, count base = 1 piece.
   `cat` groups units; conversions are only valid within a category. */
const FOOD_UNITS = {
  // Solid / mass (base = gram)
  g:    {cat:'solid',  base:1,        label:'g'},
  kg:   {cat:'solid',  base:1000,     label:'kg'},
  oz:   {cat:'solid',  base:28.3495,  label:'oz'},
  lb:   {cat:'solid',  base:453.592,  label:'lb'},
  // Liquid / volume (base = milliliter)
  ml:   {cat:'liquid', base:1,        label:'mL'},
  l:    {cat:'liquid', base:1000,     label:'L'},
  floz: {cat:'liquid', base:29.5735,  label:'fl oz'},
  cup:  {cat:'liquid', base:236.588,  label:'cup'},
  tbsp: {cat:'liquid', base:14.7868,  label:'tbsp'},
  tsp:  {cat:'liquid', base:4.92892,  label:'tsp'},
  // Count (base = piece)
  piece:   {cat:'count', base:1, label:'piece'},
  serving: {cat:'count', base:1, label:'serving'}
};
const UNIT_CATS = ['solid','liquid','count'];
const CAT_LABEL = {solid:'Solid', liquid:'Liquid', count:'Count'};
const CAT_BASIS = {solid:'100 g', liquid:'100 mL', count:'1 piece'};
function unitsForCat(cat){ return Object.keys(FOOD_UNITS).filter(k=>FOOD_UNITS[k].cat===cat); }
// How many "basis units" the given quantity+unit represents.
// solid/liquid basis = 100 base units; count basis = 1 piece.
function basisMultiplier(qty, unitKey){
  const u = FOOD_UNITS[unitKey] || FOOD_UNITS.g;
  const baseAmt = (parseFloat(qty)||0) * u.base;
  return u.cat==='count' ? baseAmt : baseAmt/100;
}

function sumNutrition(items){
  return items.reduce((a,f)=>({
    kcal:a.kcal+(+f.kcal||0), p:a.p+(+f.protein||0), c:a.c+(+f.carbs||0), f:a.f+(+f.fat||0)
  }), {kcal:0,p:0,c:0,f:0});
}

/* ---- Calorie goal calculator (Mifflin–St Jeor BMR -> TDEE -> goal) ---- */
const ACTIVITY = {
  sedentary:{label:'Sedentary (little/no exercise)', f:1.2},
  light:{label:'Light (1–3 days/wk)', f:1.375},
  moderate:{label:'Moderate (3–5 days/wk)', f:1.55},
  active:{label:'Active (6–7 days/wk)', f:1.725},
  athlete:{label:'Athlete (2×/day)', f:1.9}
};
const DIET_GOAL = {
  cut:{label:'Lose weight (−500 kcal)', delta:-500},
  mild:{label:'Mild loss (−250 kcal)', delta:-250},
  maintain:{label:'Maintain', delta:0},
  gain:{label:'Gain (+300 kcal)', delta:300}
};
function ageFromDob(dob){
  if(!dob) return null;
  const d=new Date(dob+'T12:00:00'); if(isNaN(d)) return null;
  const now=new Date(); let a=now.getFullYear()-d.getFullYear();
  const m=now.getMonth()-d.getMonth(); if(m<0||(m===0&&now.getDate()<d.getDate())) a--;
  return (a>0&&a<120)?a:null;
}
// Returns suggested {kcal, protein, carbs, fat, bmr, tdee} or null if missing inputs.
function calcCalories(){
  const s=Settings.get();
  const age=ageFromDob(s.dob);
  const heightIn = s.heightIn;
  // Bodyweight: convert to kg.
  let kg=null;
  if(s.bodyweight!=null){ kg = s.units==='kg' ? s.bodyweight : s.bodyweight*0.45359237; }
  if(!age || !heightIn || !kg) return null;
  const cm = heightIn*2.54;
  let bmr = 10*kg + 6.25*cm - 5*age + (s.sex==='female' ? -161 : 5);
  const tdee = bmr * (ACTIVITY[s.activity]||ACTIVITY.moderate).f;
  const kcal = Math.round((tdee + (DIET_GOAL[s.dietGoal]||DIET_GOAL.maintain).delta)/10)*10;
  // Macro split: protein ~1g per lb bodyweight, fat 25% kcal, rest carbs.
  const lb = s.units==='kg' ? s.bodyweight/0.45359237 : s.bodyweight;
  const protein = Math.round(lb);                 // ~1 g/lb
  const fat = Math.round(kcal*0.25/9);
  const carbs = Math.max(0, Math.round((kcal - protein*4 - fat*9)/4));
  return { kcal, protein, carbs, fat, bmr:Math.round(bmr), tdee:Math.round(tdee) };
}

/* ---- Micronutrients (Cronometer-style) ----
   key -> { label, unit, rda }. RDA = general adult daily reference value. */
const MICROS = [
  {k:'fiber',   label:'Fiber',     unit:'g',  rda:30},
  {k:'sugar',   label:'Sugar',     unit:'g',  rda:50},
  {k:'sodium',  label:'Sodium',    unit:'mg', rda:2300},
  {k:'potassium',label:'Potassium',unit:'mg', rda:3500},
  {k:'calcium', label:'Calcium',   unit:'mg', rda:1000},
  {k:'iron',    label:'Iron',      unit:'mg', rda:18},
  {k:'vitc',    label:'Vitamin C', unit:'mg', rda:90},
  {k:'vita',    label:'Vitamin A', unit:'µg', rda:900},
  {k:'vitd',    label:'Vitamin D', unit:'µg', rda:20},
  {k:'chol',    label:'Cholesterol',unit:'mg',rda:300},
  {k:'satfat',  label:'Sat. Fat',  unit:'g',  rda:20}
];
function sumMicros(items){
  const out={}; MICROS.forEach(m=> out[m.k]=0);
  items.forEach(f=> MICROS.forEach(m=> out[m.k]+= (+(f[m.k])||0)));
  return out;
}

// SVG progress ring for calories.
function calorieRing(consumed, goal){
  const r=46, cx=56, cy=56, circ=2*Math.PI*r;
  const pct = goal>0 ? Math.min(1, consumed/goal) : 0;
  const off = circ*(1-pct);
  const over = goal>0 && consumed>goal;
  return `<svg width="112" height="112" viewBox="0 0 112 112" class="cal-ring">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#222c3d" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${over?'#e5564b':'#3ec46d'}" stroke-width="10"
      stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${cx} ${cy})"/>
  </svg>`;
}

Screens.food = function(){
  $('topActions').innerHTML = '';
  const s = Settings.get();
  const items = DB.foodFor(foodDay);
  const tot = sumNutrition(items);
  const water = DB.waterFor(foodDay);

  const macro = (cls,label,val,goal,unit)=>{
    const pct = goal>0?Math.min(100,Math.round(val/goal*100)):0;
    return `<div class="macro ${cls}"><div class="top"><span>${label}</span><span class="v">${Math.round(val)} / ${goal}${unit}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
  };

  const ringHtml = `<div class="cal-ring-wrap">
      <div style="position:relative;width:112px;height:112px">
        ${calorieRing(tot.kcal, s.kcalGoal)}
        <div class="kcal-center" style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center">
          <div class="n">${Math.max(0, Math.round(s.kcalGoal - tot.kcal))}</div><div class="l">kcal left</div>
        </div>
      </div>
      <div class="macro-rows">
        ${macro('p','Protein',tot.p,s.proteinGoal,'g')}
        ${macro('c','Carbs',tot.c,s.carbsGoal,'g')}
        ${macro('f','Fat',tot.f,s.fatGoal,'g')}
      </div>
    </div>
    <div class="tag" style="margin-top:10px;text-align:center">${Math.round(tot.kcal)} / ${s.kcalGoal} kcal today</div>`;

  let mealsHtml = '';
  MEALS.forEach(meal=>{
    const mi = items.filter(f=>f.meal===meal);
    const mk = sumNutrition(mi);
    mealsHtml += `<div class="meal-head"><div><span class="t">${meal}</span> <span class="k">${Math.round(mk.kcal)} kcal</span></div>
      <button class="add" data-meal="${meal}">＋</button></div>`;
    mealsHtml += mi.map(f=>`
      <div class="food-item" data-id="${f.id}">
        <div class="grow"><div class="title">${esc(f.name)}</div>
          <div class="sub">${esc(f.serving||'')}${f.serving?' · ':''}P${Math.round(f.protein||0)} C${Math.round(f.carbs||0)} F${Math.round(f.fat||0)}</div></div>
        <div class="kcal">${Math.round(f.kcal||0)}</div>
      </div>`).join('');
  });

  const wPct = s.waterGoal>0?Math.min(100,Math.round(water/s.waterGoal*100)):0;
  const waterHtml = `<div class="meal-head"><div><span class="t">Water 💧</span> <span class="k">${water} / ${s.waterGoal} ml</span></div></div>
    <div class="macro" style="margin-bottom:8px"><div class="track"><div class="fill" style="width:${wPct}%;background:#5b9cf0"></div></div></div>
    <div class="water-row">
      <button class="water-btn" data-ml="250">+250</button>
      <button class="water-btn" data-ml="500">+500</button>
      <button class="water-btn" data-ml="-250">−250</button>
    </div>`;

  // Energy balance: calories in (food) vs out (workouts that day with a burn).
  const burned = DB.data.wods.filter(w=> tsToISO(w.date)===foodDay)
    .reduce((a,w)=> a + (+w.kcalBurned||0), 0);
  const net = Math.round(tot.kcal - burned);
  const balanceHtml = `<div class="meal-head"><div><span class="t">Energy Balance</span></div></div>
    <div class="row between" style="font-size:14px"><span>Consumed</span><span class="big">${Math.round(tot.kcal)}</span></div>
    <div class="row between" style="font-size:14px"><span>Burned (workouts)</span><span class="big">${burned?'−'+burned:'0'}</span></div>
    <div class="row between" style="font-size:15px;border-top:1px solid var(--line);margin-top:6px;padding-top:6px">
      <span>Net</span><span class="big" style="color:${net>s.kcalGoal?'var(--danger)':'var(--green)'}">${net}</span></div>
    <div class="tag" style="margin-top:4px">Add a calorie burn to a workout entry to include it here.</div>`;

  // Micronutrient summary (Cronometer-style) with RDA % progress.
  let microHtml = '';
  if(s.trackMicros!==false){
    const mt = sumMicros(items);
    microHtml = `<div class="meal-head"><div><span class="t">Nutrients</span> <span class="k">% of daily target</span></div></div>` +
      MICROS.map(m=>{
        const v = mt[m.k]||0; const pct = m.rda>0?Math.min(100,Math.round(v/m.rda*100)):0;
        const over = (m.k==='sodium'||m.k==='sugar'||m.k==='satfat'||m.k==='chol') && v>m.rda;
        return `<div class="macro" style="margin-bottom:8px"><div class="top">
            <span>${m.label}</span><span class="v">${Math.round(v*10)/10}${m.unit} · ${pct}%</span></div>
          <div class="track"><div class="fill" style="width:${pct}%;background:${over?'#e5564b':'#3ec46d'}"></div></div></div>`;
      }).join('');
  }

  $('screen').innerHTML = `
    <div class="date-nav">
      <button class="iconbtn" id="fd_prev">‹</button>
      <div class="d" id="fd_label">${foodDay===todayISO()?'Today':fmtDateFull(isoToTs(foodDay))}</div>
      <button class="iconbtn" id="fd_next">›</button>
    </div>
    <div class="card">${ringHtml}</div>
    ${mealsHtml}
    <div class="card" style="margin-top:14px">${waterHtml}</div>
    <div class="card" style="margin-top:14px">${balanceHtml}</div>
    ${microHtml?`<div class="card" style="margin-top:14px">${microHtml}</div>`:''}`;

  onTapSafe($('fd_prev'), ()=>{ foodDay=shiftISO(foodDay,-1); render(); });
  onTapSafe($('fd_next'), ()=>{ foodDay=shiftISO(foodDay, 1); render(); });
  $('screen').querySelectorAll('.add[data-meal]').forEach(b=> onTapSafe(b, ()=> addFoodFlow(b.dataset.meal)));
  $('screen').querySelectorAll('.water-btn').forEach(b=> onTapSafe(b, ()=>{ DB.addWater(foodDay, +b.dataset.ml); render(); }));
  bindLongPress($('screen'), '.food-item[data-id]', (el)=>{
    if(confirm('Remove this food?')){ DB.deleteFood(el.dataset.id); render(); }
  }, (el)=>{ const f=DB.data.food.find(x=>x.id===el.dataset.id); if(f) editFoodEntry(f); });
};

function shiftISO(iso, days){ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }

/* ---- Add food: tabs for Search / Recents / Custom / Meals / Scan ---- */
function addFoodFlow(meal){
  Sheet.open(`Add to ${meal}`, `
    <div class="seg sm" id="af_tabs" style="margin-bottom:12px">
      <button data-t="search" class="active">Search</button>
      <button data-t="recent">Recent</button>
      <button data-t="custom">Custom</button>
      <button data-t="meals">Meals</button>
      <button data-t="scan">Scan</button>
    </div>
    <div id="af_body"></div>`, ()=>{
    let tab='search';
    const tabsEl=$('af_tabs');
    const paint=()=>{
      tabsEl.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.t===tab));
      const body=$('af_body');
      if(tab==='search') paintSearch(body, meal);
      else if(tab==='recent') paintRecent(body, meal);
      else if(tab==='custom') paintCustom(body, meal);
      else if(tab==='meals') paintMeals(body, meal);
      else paintScan(body, meal);
    };
    tabsEl.querySelectorAll('button').forEach(b=> onTapSafe(b, ()=>{ tab=b.dataset.t; paint(); }));
    paint();
  });
}

let foodSource = 'off';   // 'off' = Open Food Facts, 'usda' = USDA FoodData Central
function paintSearch(body, meal){
  const hasUsda = !!(Settings.get().usdaKey||'').trim();
  if(!hasUsda) foodSource='off';
  const sourceSeg = hasUsda ? `<div class="seg sm" id="src_seg" style="margin-bottom:8px">
      <button data-s="off" class="${foodSource==='off'?'active':''}">Open Food Facts</button>
      <button data-s="usda" class="${foodSource==='usda'?'active':''}">USDA</button></div>` : '';
  body.innerHTML = sourceSeg +
    `<input class="input" id="af_q" placeholder="Search foods (e.g. banana)" style="margin-bottom:10px">
     <div id="af_results"><div class="tag">Type to search${hasUsda?'':' the Open Food Facts database'} (needs internet).${hasUsda?'':' Add a USDA key in Settings for richer nutrient data.'}</div></div>`;
  if(hasUsda) $('src_seg').querySelectorAll('button').forEach(b=> onTapSafe(b, ()=>{ foodSource=b.dataset.s; paintSearch(body, meal); }));
  let t=null;
  const run=(q)=>{
    const fn = foodSource==='usda' ? usdaSearch : offSearch;
    fn(q).then(list=> showFoodResults($('af_results'), list, meal))
      .catch((e)=> $('af_results').innerHTML=`<div class="tag">${e&&e.message==='no-key'?'Add your USDA API key in Settings.':'Search failed (offline?). Try Custom instead.'}</div>`);
  };
  $('af_q').oninput = (e)=>{
    clearTimeout(t); const q=e.target.value.trim();
    if(q.length<2){ $('af_results').innerHTML=''; return; }
    $('af_results').innerHTML = '<div class="tag">Searching…</div>';
    t=setTimeout(()=> run(q), 400);
  };
}

function showFoodResults(el, list, meal){
  if(!list.length){ el.innerHTML='<div class="tag">No results. Try Custom.</div>'; return; }
  el.innerHTML = list.map((f,i)=>`<div class="search-result" data-i="${i}">
    <div class="title">${esc(f.name)}</div>
    <div class="sub">${f.kcal} kcal · P${f.protein} C${f.carbs} F${f.fat} per ${esc(f.serving)}${f.source?' · '+f.source:''}</div></div>`).join('');
  el.querySelectorAll('.search-result').forEach(r=> onTapSafe(r, ()=> portionFood(list[+r.dataset.i], meal)));
}

function paintRecent(body, meal){
  // Build a unique list of recently logged foods.
  const seen=new Set(), recents=[];
  [...DB.data.food].sort((a,b)=>b.createdAt-a.createdAt).forEach(f=>{
    const k=f.name.toLowerCase(); if(seen.has(k)) return; seen.add(k);
    recents.push(f);
  });
  if(!recents.length){ body.innerHTML='<div class="tag">No recent foods yet.</div>'; return; }
  body.innerHTML = recents.slice(0,40).map((f,i)=>`<div class="search-result" data-i="${i}">
    <div class="title">${esc(f.name)}</div><div class="sub">${Math.round(f.kcal)} kcal · ${esc(f.serving||'')}</div></div>`).join('');
  body.querySelectorAll('.search-result').forEach(r=> onTapSafe(r, ()=>{
    const f=recents[+r.dataset.i];
    DB.addFood({ name:f.name, meal, date:isoToTs(foodDay), serving:f.serving,
      kcal:f.kcal, protein:f.protein, carbs:f.carbs, fat:f.fat });
    Sheet.close(); render(); toast('Added');
  }));
}

function paintCustom(body, meal){
  const list = DB.data.customFoods;
  body.innerHTML = `<button class="btn primary block" id="cf_new">＋ Create Custom Food</button>
    <div class="sectiontitle">My Foods</div>
    <div id="cf_list">${list.length?list.map((f,i)=>`<div class="search-result" data-i="${i}">
      <div class="title">${esc(f.name)}</div><div class="sub">${f.kcal} kcal · ${esc(f.serving||'')}</div></div>`).join(''):'<div class="tag">No custom foods yet.</div>'}</div>`;
  onTapSafe($('cf_new'), ()=> customFoodForm(meal));
  $('cf_list').querySelectorAll('.search-result').forEach(r=> onTapSafe(r, ()=> portionFood(list[+r.dataset.i], meal)));
}

function customFoodForm(meal){
  Sheet.open('Create Food', `
    <label class="field"><span>Name</span><input class="input" id="cf_name" placeholder="e.g. Protein shake"></label>

    <div class="seg sm" id="cf_cat" style="margin:8px 0">
      ${UNIT_CATS.map((c,i)=>`<button data-c="${c}" class="${i===0?'active':''}">${CAT_LABEL[c]}</button>`).join('')}
    </div>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:1"><span>Amount</span><input class="input" id="cf_qty" type="number" inputmode="decimal" value="100"></label>
      <label class="field" style="flex:1"><span>Unit</span>
        <select class="input" id="cf_unit"></select></label>
    </div>

    <div class="tag" id="cf_basis" style="margin-bottom:8px"></div>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:1"><span>Calories</span><input class="input" id="cf_kcal" type="number" inputmode="decimal"></label>
      <label class="field" style="flex:1"><span>Protein g</span><input class="input" id="cf_p" type="number" inputmode="decimal"></label>
    </div>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:1"><span>Carbs g</span><input class="input" id="cf_c" type="number" inputmode="decimal"></label>
      <label class="field" style="flex:1"><span>Fat g</span><input class="input" id="cf_f" type="number" inputmode="decimal"></label>
    </div>
    <div class="tag" id="cf_total" style="margin-bottom:8px"></div>
    <button class="btn primary block" id="cf_save">Save & Add</button>
  `, ()=>{
    let cat = 'solid';
    const fillUnits = ()=>{
      $('cf_unit').innerHTML = unitsForCat(cat)
        .map(k=>`<option value="${k}">${FOOD_UNITS[k].label}</option>`).join('');
    };
    const refresh = ()=>{
      $('cf_basis').textContent = `Enter nutrition per ${CAT_BASIS[cat]}.`;
      const mult = basisMultiplier($('cf_qty').value, $('cf_unit').value);
      const kcal=+$('cf_kcal').value||0, p=+$('cf_p').value||0, c=+$('cf_c').value||0, f=+$('cf_f').value||0;
      $('cf_total').textContent = `This entry: ${Math.round(kcal*mult)} kcal · P${Math.round(p*mult)} C${Math.round(c*mult)} F${Math.round(f*mult)}`;
    };
    fillUnits(); refresh();
    $('cf_cat').querySelectorAll('button').forEach(b=> onTapSafe(b, ()=>{
      cat=b.dataset.c;
      $('cf_cat').querySelectorAll('button').forEach(x=>x.classList.toggle('active', x.dataset.c===cat));
      fillUnits(); refresh();
    }));
    ['cf_qty','cf_unit','cf_kcal','cf_p','cf_c','cf_f'].forEach(id=>{ $(id).oninput=refresh; $(id).onchange=refresh; });
    $('cf_save').onclick = ()=>{
      const name=$('cf_name').value.trim(); if(!name){ toast('Name required'); return; }
      const qty = parseFloat($('cf_qty').value)||0;
      const unitKey = $('cf_unit').value;
      const mult = basisMultiplier(qty, unitKey);
      const qtyLabel = (qty%1===0?qty:qty.toFixed(1))+' '+FOOD_UNITS[unitKey].label;
      // Per-basis values (saved on the custom food so it can be re-portioned).
      const perKcal=+$('cf_kcal').value||0, perP=+$('cf_p').value||0, perC=+$('cf_c').value||0, perF=+$('cf_f').value||0;
      // Custom food stores the per-basis profile + its unit category.
      DB.addCustomFood({ name, cat, unit:unitKey, basis:CAT_BASIS[cat],
        serving:qtyLabel, kcal:perKcal, protein:perP, carbs:perC, fat:perF, perBasis:true });
      // The diary entry stores the scaled (consumed) totals.
      const food={ name, serving:qtyLabel,
        kcal:perKcal*mult, protein:perP*mult, carbs:perC*mult, fat:perF*mult,
        qty, unit:unitKey, cat };
      DB.addFood({...food, meal, date:isoToTs(foodDay)});
      Sheet.close(); render(); toast('Added');
    };
  });
}

function paintMeals(body, meal){
  const meals = DB.data.meals;
  body.innerHTML = `<div class="tag" style="margin-bottom:8px">Saved meals add several foods at once. Save the current day's ${esc(meal)} as a meal below.</div>
    <button class="btn block" id="ml_save">💾 Save current ${esc(meal)} as a meal</button>
    <div class="sectiontitle">Saved Meals</div>
    <div id="ml_list">${meals.length?meals.map((m,i)=>`<div class="search-result" data-i="${i}">
      <div class="title">${esc(m.name)}</div><div class="sub">${m.foods.length} items · ${Math.round(sumNutrition(m.foods).kcal)} kcal</div></div>`).join(''):'<div class="tag">No saved meals yet.</div>'}</div>`;
  onTapSafe($('ml_save'), ()=>{
    const cur = DB.foodFor(foodDay).filter(f=>f.meal===meal);
    if(!cur.length){ toast('Nothing in '+meal+' to save'); return; }
    const name = prompt('Name this meal:', meal+' combo'); if(!name) return;
    DB.addMeal({ name, foods: cur.map(f=>({name:f.name,serving:f.serving,kcal:f.kcal,protein:f.protein,carbs:f.carbs,fat:f.fat})) });
    paintMeals(body, meal); toast('Meal saved');
  });
  $('ml_list').querySelectorAll('.search-result').forEach(r=> onTapSafe(r, ()=>{
    const m=meals[+r.dataset.i];
    m.foods.forEach(f=> DB.addFood({...f, meal, date:isoToTs(foodDay)}));
    Sheet.close(); render(); toast('Meal added');
  }));
}

/* Portion chooser: pick servings multiplier before adding. */
function portionFood(food, meal){
  Sheet.open(food.name, `
    <div class="card"><div class="tag">Per ${esc(food.serving||'serving')}: ${food.kcal} kcal · P${food.protein} C${food.carbs} F${food.fat}</div></div>
    <label class="field"><span>Number of servings</span><input class="input" id="pf_mult" type="number" inputmode="decimal" value="1"></label>
    <div class="tag" id="pf_calc"></div>
    <button class="btn primary block" id="pf_add" style="margin-top:10px">Add to ${esc(meal)}</button>
  `, ()=>{
    const calc=()=>{ const m=parseFloat($('pf_mult').value)||0;
      $('pf_calc').textContent = `Total: ${Math.round(food.kcal*m)} kcal · P${Math.round(food.protein*m)} C${Math.round(food.carbs*m)} F${Math.round(food.fat*m)}`; };
    $('pf_mult').oninput=calc; calc();
    $('pf_add').onclick=()=>{
      const m=parseFloat($('pf_mult').value)||1;
      const rec = { name:food.name, meal, date:isoToTs(foodDay),
        serving:(m===1?food.serving:`${m} × ${food.serving||'serving'}`),
        kcal:food.kcal*m, protein:food.protein*m, carbs:food.carbs*m, fat:food.fat*m };
      // Scale micronutrients too.
      MICROS.forEach(mi=>{ if(food[mi.k]!=null) rec[mi.k] = (+food[mi.k]||0)*m; });
      DB.addFood(rec);
      Sheet.close(); render(); toast('Added');
    };
  });
}

function editFoodEntry(f){
  Sheet.open('Edit Food', `
    <label class="field"><span>Name</span><input class="input" id="ef_name" value="${esc(f.name)}"></label>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:1"><span>Calories</span><input class="input" id="ef_kcal" type="number" value="${Math.round(f.kcal||0)}"></label>
      <label class="field" style="flex:1"><span>Protein g</span><input class="input" id="ef_p" type="number" value="${Math.round(f.protein||0)}"></label>
    </div>
    <div class="row" style="gap:8px">
      <label class="field" style="flex:1"><span>Carbs g</span><input class="input" id="ef_c" type="number" value="${Math.round(f.carbs||0)}"></label>
      <label class="field" style="flex:1"><span>Fat g</span><input class="input" id="ef_f" type="number" value="${Math.round(f.fat||0)}"></label>
    </div>
    <button class="btn primary block" id="ef_save">Save</button>
    <button class="btn danger block" id="ef_del" style="margin-top:8px">Delete</button>
  `, ()=>{
    $('ef_save').onclick=()=>{ f.name=$('ef_name').value.trim()||f.name; f.kcal=+$('ef_kcal').value||0;
      f.protein=+$('ef_p').value||0; f.carbs=+$('ef_c').value||0; f.fat=+$('ef_f').value||0; DB.save(); Sheet.close(); render(); };
    $('ef_del').onclick=()=>{ if(confirm('Delete this food?')){ DB.deleteFood(f.id); Sheet.close(); render(); } };
  });
}

/* ---- Open Food Facts integration (free, needs internet) ---- */
function offNorm(prod){
  const n = prod.nutriments||{};
  const per = (k)=> Math.round((n[k+'_serving'] != null ? n[k+'_serving'] : (n[k+'_100g']||0)));
  const perF = (k)=> { const v = (n[k+'_serving'] != null ? n[k+'_serving'] : (n[k+'_100g']||0)); return Math.round((+v||0)*10)/10; };
  const serving = prod.serving_size || '100 g';
  return {
    name: (prod.product_name || prod.generic_name || 'Unknown').slice(0,80),
    serving,
    kcal: Math.round(n['energy-kcal_serving'] != null ? n['energy-kcal_serving'] : (n['energy-kcal_100g']||0)),
    protein: per('proteins'), carbs: per('carbohydrates'), fat: per('fat'),
    // Micronutrients (Open Food Facts keys)
    fiber: perF('fiber'), sugar: perF('sugars'), sodium: per('sodium')*1000 || per('salt')*400,
    potassium: per('potassium'), calcium: per('calcium'), iron: perF('iron'),
    vitc: perF('vitamin-c'), vita: per('vitamin-a'), vitd: perF('vitamin-d'),
    chol: per('cholesterol'), satfat: perF('saturated-fat'),
    source:'OFF'
  };
}
async function offSearch(q){
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=product_name,generic_name,serving_size,nutriments`;
  const res = await fetch(url); const data = await res.json();
  return (data.products||[]).map(offNorm).filter(f=> f.kcal>0 || f.protein>0);
}
async function offBarcode(code){
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,generic_name,serving_size,nutriments`);
  const data = await res.json();
  if(data.status!==1 || !data.product) return null;
  return offNorm(data.product);
}

/* ---- USDA FoodData Central (Cronometer-style, richer micronutrients) ---- */
// Map of USDA nutrient names -> our food fields (values are per 100 g).
const USDA_MAP = {
  'Energy':'kcal','Protein':'protein','Carbohydrate, by difference':'carbs','Total lipid (fat)':'fat',
  'Fiber, total dietary':'fiber','Sugars, total including NLEA':'sugar','Sodium, Na':'sodium',
  'Potassium, K':'potassium','Calcium, Ca':'calcium','Iron, Fe':'iron',
  'Vitamin C, total ascorbic acid':'vitc','Vitamin A, RAE':'vita','Vitamin D (D2 + D3)':'vitd',
  'Cholesterol':'chol','Fatty acids, total saturated':'satfat'
};
function usdaNorm(food){
  const out = { name:(food.description||'Unknown').slice(0,80), serving:'100 g', source:'USDA',
    kcal:0,protein:0,carbs:0,fat:0 };
  (food.foodNutrients||[]).forEach(nu=>{
    const nm = nu.nutrientName || (nu.nutrient && nu.nutrient.name);
    const val = (nu.value!=null?nu.value:nu.amount)||0;
    const field = USDA_MAP[nm];
    if(field){ out[field] = field==='kcal'||field==='sodium'||field==='potassium'||field==='calcium'||field==='vita'||field==='chol' ? Math.round(val) : Math.round(val*10)/10; }
  });
  return out;
}
async function usdaSearch(q){
  const key = (Settings.get().usdaKey||'').trim();
  if(!key) throw new Error('no-key');
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&pageSize=25&dataType=Foundation,SR%20Legacy,Branded`;
  const res = await fetch(url); if(!res.ok) throw new Error('usda '+res.status);
  const data = await res.json();
  return (data.foods||[]).map(usdaNorm).filter(f=> f.kcal>0 || f.protein>0);
}

/* ---- Barcode scanning (BarcodeDetector with manual fallback) ---- */
function paintScan(body, meal){
  const supported = ('BarcodeDetector' in window);
  body.innerHTML = `
    ${supported?`<div class="scanbox" id="sc_box"><video id="sc_video" playsinline muted></video></div>
      <div class="tag" id="sc_status" style="margin:8px 0">Point the camera at a barcode…</div>`
      : `<div class="tag">Live scanning isn't supported in this browser. Enter the barcode number below.</div>`}
    <label class="field" style="margin-top:8px"><span>Barcode number</span>
      <input class="input" id="sc_code" inputmode="numeric" placeholder="e.g. 737628064502"></label>
    <button class="btn primary block" id="sc_lookup">Look up</button>`;

  const lookup=(code)=>{
    $('sc_status') && ($('sc_status').textContent='Looking up '+code+'…');
    offBarcode(code).then(food=>{
      if(food){ stopScan(); portionFood(food, meal); }
      else toast('Product not found');
    }).catch(()=> toast('Lookup failed (offline?)'));
  };
  onTapSafe($('sc_lookup'), ()=>{ const c=$('sc_code').value.trim(); if(c) lookup(c); });

  if(supported) startScan(lookup);
}
let _scanStream=null, _scanRAF=null;
function stopScan(){
  if(_scanRAF) cancelAnimationFrame(_scanRAF), _scanRAF=null;
  if(_scanStream){ _scanStream.getTracks().forEach(t=>t.stop()); _scanStream=null; }
}
async function startScan(onCode){
  try{
    const detector = new window.BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});
    _scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const v=$('sc_video'); if(!v){ stopScan(); return; }
    v.srcObject=_scanStream; await v.play();
    let done=false;
    const tick=async()=>{
      if(done || !$('sc_video')){ return; }
      try{ const codes=await detector.detect(v);
        if(codes && codes.length){ done=true; buzz(40); onCode(codes[0].rawValue); return; }
      }catch(e){}
      _scanRAF=requestAnimationFrame(tick);
    };
    tick();
  }catch(e){ const st=$('sc_status'); if(st) st.textContent='Camera unavailable — enter the barcode manually.'; }
}
// Stop the camera whenever the add-food sheet closes.
(function(){ const orig=Sheet.close.bind(Sheet); Sheet.close=function(){ stopScan(); orig(); }; })();

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
      <div class="item" id="m_activity"><div class="lead">⌚</div><div class="grow"><div class="title">Import Activity File</div><div class="sub">Load a .tcx / .gpx from a watch or Garmin</div></div><div class="trail tag">›</div></div>
      <div class="item" id="m_backup"><div class="lead">💾</div><div class="grow"><div class="title">Backup & Restore</div><div class="sub">Export / import your data</div></div><div class="trail tag">›</div></div>
    </div>
    <div class="sectiontitle">About</div>
    <div class="card"><div class="tag">WODBook${s.name?(' · '+esc(s.name)):''} · installs to your home screen. Data is stored on this device only — use Backup to move it or keep it safe.</div></div>`;
  onTapSafe($('m_settings'), settingsSheet);
  onTapSafe($('m_prog'), progressSheet);
  onTapSafe($('m_mov'), movementsSheet);
  onTapSafe($('m_import'), importMywodSheet);
  onTapSafe($('m_activity'), importActivitySheet);
  onTapSafe($('m_backup'), backupSheet);
};

/* --------- Activity file import (.tcx / .gpx from a watch / Garmin) -------
   Browsers can't read Apple Health or Garmin Connect directly, so the PWA
   imports the standard files watches export. We parse the XML summary
   (sport, start, total time, distance, calories) into a workout entry. */
function parseActivityXML(text, fileName){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('Couldn’t read that file.');
  const get = (sel)=> doc.querySelector(sel);
  const num = (el)=> el ? (parseFloat(el.textContent)||0) : 0;
  const lower = (fileName||'').toLowerCase();
  const isTcx = lower.endsWith('.tcx') || doc.querySelector('TrainingCenterDatabase');

  if(isTcx){
    const act = get('Activity');
    const sport = (act && act.getAttribute('Sport')) || 'Activity';
    const id = get('Activity Id') || get('Id');
    // Sum lap times/calories; take max distance to avoid double counting.
    let secs=0, kcal=0, dist=0;
    doc.querySelectorAll('TotalTimeSeconds').forEach(e=> secs += parseFloat(e.textContent)||0);
    doc.querySelectorAll('Calories').forEach(e=> kcal += parseFloat(e.textContent)||0);
    doc.querySelectorAll('DistanceMeters').forEach(e=> dist = Math.max(dist, parseFloat(e.textContent)||0));
    const start = id ? Date.parse(id.textContent) : NaN;
    return { sport, start:isNaN(start)?null:start, secs, kcal, dist };
  }
  // GPX: derive duration from first/last <time>; distance/cal not summed.
  const times = [...doc.querySelectorAll('time')].map(e=> Date.parse(e.textContent)).filter(t=>!isNaN(t));
  const typeEl = get('type');
  const sport = typeEl ? typeEl.textContent.trim() : 'Activity';
  if(!times.length) throw new Error('No activity data found in the file.');
  const start = Math.min(...times), end = Math.max(...times);
  return { sport, start, secs:(end-start)/1000, kcal:0, dist:0 };
}

function importActivitySheet(){
  Sheet.open('Import Activity File', `
    <div class="card"><div class="tag">Browsers can’t read Apple Health or Garmin Connect directly. Export a <b>.tcx</b> or <b>.gpx</b> from your watch / Garmin Connect and load it here. It’s added to your workout Log.</div></div>
    <label class="field"><span>Activity file</span>
      <input type="file" id="ac_file" accept=".tcx,.gpx,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml" class="input"></label>
    <div id="ac_status"></div>
  `, ()=>{
    $('ac_file').onchange = (e)=>{
      const file = e.target.files[0]; if(!file) return;
      const r = new FileReader();
      r.onload = ()=>{
        try{
          const a = parseActivityXML(String(r.result), file.name);
          const mmss = (s)=>{ s=Math.round(s); const m=Math.floor(s/60), x=s%60; return m+':'+String(x).padStart(2,'0'); };
          const parts=[]; if(a.secs>0) parts.push(mmss(a.secs));
          if(a.kcal>0) parts.push(Math.round(a.kcal)+' kcal');
          if(a.dist>0) parts.push(Math.round(a.dist)+' m');
          const result = parts.join(' · ');
          const date = a.start || Date.now();
          $('ac_status').innerHTML = `<div class="card"><div class="sub" style="margin-bottom:8px"><b>${esc(a.sport)}</b><br>${esc(result||'—')}<br>${fmtDateFull(date)}</div>
            <button class="btn primary block" id="ac_add">Add to Log</button></div>`;
          $('ac_add').onclick = ()=>{
            DB.addWod({ title:a.sport, type:'Other', details:'Imported from '+file.name,
              result, date, rxd:false, notes:'', kcalBurned:Math.round(a.kcal)||0, source:'file' });
            Sheet.close(); go('log'); toast('Activity imported');
          };
        }catch(err){
          $('ac_status').innerHTML = `<div class="card" style="border-color:var(--danger)"><b>Couldn’t import</b><div class="tag">${esc(err.message||String(err))}</div></div>`;
        }
      };
      r.readAsText(file);
    };
  });
}

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
    <label class="field"><span>Sex</span>
      <div class="seg" id="st_sex"><button data-x="male" class="${s.sex!=='female'?'active':''}">Male</button><button data-x="female" class="${s.sex==='female'?'active':''}">Female</button></div></label>
    <div class="row" style="gap:10px">
      <label class="field" style="flex:1"><span>Height (ft)</span>
        <input class="input" id="st_hft" type="number" inputmode="numeric" min="0" value="${s.heightIn!=null?Math.floor(s.heightIn/12):''}" placeholder="e.g. 5"></label>
      <label class="field" style="flex:1"><span>Height (in)</span>
        <input class="input" id="st_hin" type="number" inputmode="numeric" min="0" max="11" value="${s.heightIn!=null?(s.heightIn%12):''}" placeholder="e.g. 7"></label>
    </div>
    <div class="tag" id="st_hcap" style="margin:-4px 0 12px">${s.heightIn!=null?`Height: ${Math.floor(s.heightIn/12)}\u2032 ${Math.round(s.heightIn%12)}\u2033`:''}</div>
    <label class="field"><span>Date of birth</span><input class="input" type="date" id="st_dob" value="${esc(s.dob||'')}"></label>

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

    <div class="sectiontitle">Calorie calculator</div>
    <div class="card">
      <label class="field"><span>Activity level</span>
        <select class="input" id="st_act">${Object.entries(ACTIVITY).map(([k,v])=>`<option value="${k}" ${s.activity===k?'selected':''}>${v.label}</option>`).join('')}</select></label>
      <label class="field"><span>Goal</span>
        <select class="input" id="st_goal">${Object.entries(DIET_GOAL).map(([k,v])=>`<option value="${k}" ${s.dietGoal===k?'selected':''}>${v.label}</option>`).join('')}</select></label>
      <div class="tag" id="st_calcout" style="margin-bottom:10px"></div>
      <button class="btn block" id="st_calc">Calculate & apply to goals</button>
    </div>

    <div class="sectiontitle">Nutrition goals</div>
    <div class="card">
      <label class="field"><span>Daily calories</span><input class="input" id="st_kcal" type="number" inputmode="numeric" value="${s.kcalGoal}"></label>
      <div class="row" style="gap:8px">
        <label class="field" style="flex:1"><span>Protein g</span><input class="input" id="st_p" type="number" value="${s.proteinGoal}"></label>
        <label class="field" style="flex:1"><span>Carbs g</span><input class="input" id="st_c" type="number" value="${s.carbsGoal}"></label>
        <label class="field" style="flex:1"><span>Fat g</span><input class="input" id="st_f" type="number" value="${s.fatGoal}"></label>
      </div>
      <label class="field"><span>Water goal (ml)</span><input class="input" id="st_water" type="number" inputmode="numeric" value="${s.waterGoal}"></label>
    </div>

    <div class="sectiontitle">Food database</div>
    <div class="card">
      <div class="toggle" style="margin-bottom:12px"><span>Track micronutrients</span><button class="${sw(s.trackMicros!==false)}" id="st_micros"></button></div>
      <label class="field"><span>USDA FoodData Central API key (optional)</span>
        <input class="input" id="st_usda" value="${esc(s.usdaKey||'')}" placeholder="Paste key for richer nutrient data"></label>
      <div class="tag">Free key at fdc.nal.usda.gov. Leave blank to use Open Food Facts only.</div>
    </div>

    <button class="btn green block" id="st_test">▶ Test sound</button>
  `, ()=>{
    const toggle=(id,key)=>{ $(id).onclick=()=>{ const cur=Settings.get()[key]!==false; Settings.set({[key]:!cur}); $(id).classList.toggle('on',!cur); }; };
    toggle('st_sound','sound'); toggle('st_vib','vibrate'); toggle('st_flash','flash'); toggle('st_wake','keepAwake');
    $('st_name').oninput = ()=> Settings.set({name:$('st_name').value.trim()});
    $('st_box').oninput = ()=> Settings.set({box:$('st_box').value.trim()});
    $('st_bw').oninput = ()=>{ const v=parseFloat($('st_bw').value); Settings.set({bodyweight: isNaN(v)?null:v}); };
    const updateHeight = ()=>{
      const ftRaw = $('st_hft').value.trim();
      const inRaw = $('st_hin').value.trim();
      if(ftRaw==='' && inRaw===''){ Settings.set({heightIn:null}); $('st_hcap').textContent=''; return; }
      const ft = parseInt(ftRaw,10) || 0;
      const inch = parseFloat(inRaw) || 0;
      const total = ft*12 + inch;
      Settings.set({heightIn: total>0 ? total : null});
      $('st_hcap').textContent = total>0
        ? `Height: ${Math.floor(total/12)}\u2032 ${Math.round(total%12)}\u2033` : '';
    };
    $('st_hft').oninput = updateHeight;
    $('st_hin').oninput = updateHeight;
    $('st_dob').oninput = ()=> Settings.set({dob:$('st_dob').value});
    $('st_sex').querySelectorAll('button').forEach(b=> b.onclick=()=>{ Settings.set({sex:b.dataset.x}); $('st_sex').querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
    $('st_units').querySelectorAll('button').forEach(b=> b.onclick=()=>{ Settings.set({units:b.dataset.u}); $('st_units').querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
    // Calorie calculator
    $('st_act').onchange = ()=> Settings.set({activity:$('st_act').value});
    $('st_goal').onchange = ()=> Settings.set({dietGoal:$('st_goal').value});
    $('st_calc').onclick = ()=>{
      const r = calcCalories();
      if(!r){ $('st_calcout').innerHTML = '<span style="color:var(--danger)">Need sex, height, date of birth and bodyweight first.</span>'; return; }
      Settings.set({ kcalGoal:r.kcal, proteinGoal:r.protein, carbsGoal:r.carbs, fatGoal:r.fat });
      $('st_kcal').value=r.kcal; $('st_p').value=r.protein; $('st_c').value=r.carbs; $('st_f').value=r.fat;
      $('st_calcout').innerHTML = `BMR ${r.bmr} · TDEE ${r.tdee} → goal <b>${r.kcal} kcal</b> · P${r.protein} C${r.carbs} F${r.fat}. Applied ✓`;
      toast('Goals updated');
    };
    // Food database
    $('st_usda').oninput = ()=> Settings.set({usdaKey:$('st_usda').value.trim()});
    toggle('st_micros','trackMicros');
    const refreshLead=()=> $('st_lead').textContent=(Settings.get().leadIn|0)+'s';
    $('st_leadDn').onclick=()=>{ Settings.set({leadIn:Math.max(0,(Settings.get().leadIn|0)-5)}); refreshLead(); };
    $('st_leadUp').onclick=()=>{ Settings.set({leadIn:(Settings.get().leadIn|0)+5}); refreshLead(); };
    // Nutrition goals
    $('st_kcal').oninput = ()=> Settings.set({kcalGoal:+$('st_kcal').value||0});
    $('st_p').oninput = ()=> Settings.set({proteinGoal:+$('st_p').value||0});
    $('st_c').oninput = ()=> Settings.set({carbsGoal:+$('st_c').value||0});
    $('st_f').oninput = ()=> Settings.set({fatGoal:+$('st_f').value||0});
    $('st_water').oninput = ()=> Settings.set({waterGoal:+$('st_water').value||0});
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

  // --- Nutrition trend: calories/day for the last 14 days ---
  const s = Settings.get();
  const days = [];
  for(let i=13;i>=0;i--) days.push(shiftISO(todayISO(), -i));
  const dayK = days.map(iso=> ({ iso, kcal: Math.round(sumNutrition(DB.foodFor(iso)).kcal) }));
  const anyFood = dayK.some(d=>d.kcal>0);
  const kmax = Math.max(s.kcalGoal||1, ...dayK.map(d=>d.kcal), 1);
  const calBars = anyFood ? `<div class="bars" style="height:150px">${dayK.map(d=>{
    const h = Math.round(d.kcal/kmax*120);
    const over = s.kcalGoal>0 && d.kcal>s.kcalGoal;
    const lbl = new Date(d.iso+'T12:00:00').toLocaleDateString(undefined,{day:'numeric'});
    return `<div class="b"><div class="bar" style="height:${h}px;background:${over?'#e5564b':'#3ec46d'}"></div><div class="lbl">${lbl}</div></div>`;
  }).join('')}</div><div class="tag" style="text-align:center;margin-top:6px">Goal: ${s.kcalGoal} kcal/day · green = under, red = over</div>`
    : '<div class="empty"><p>Log food to see your calorie trend.</p></div>';

  // Bodyweight trend (reuse line chart)
  const bwSorted = [...DB.data.bw].sort((a,b)=>a.date-b.date);
  const bwChart = bwSorted.length>1 ? lineChartSVG(bwSorted.map(e=>({x:e.date,y:e.weight}))) : '';

  Sheet.open('Progress', `
    <div class="stat-grid" style="margin-bottom:12px">
      <div class="stat"><div class="n">${wods.length}</div><div class="l">Workouts</div></div>
      <div class="stat"><div class="n">${thisMonth}</div><div class="l">This Month</div></div>
      <div class="stat"><div class="n">${names.length}</div><div class="l">Lifts</div></div>
    </div>
    <div class="card"><h3>Calories / Day (14d)</h3>${calBars}</div>
    ${bwChart?`<div class="card"><h3>Bodyweight Trend</h3>${bwChart}</div>`:''}
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
          <div class="card" style="padding:12px">
            <div class="row between"><span class="big">${esc(m.n)}</span><span class="pill ghost">${esc(m.a)}</span></div>
            <div class="tag" style="margin:4px 0 8px">${esc(m.s)}</div>
            <button class="btn sm" data-track="${esc(m.n)}">🏋️ Track as lift</button>
          </div>`).join('');
      }).join('');
      $('mv_list').querySelectorAll('[data-track]').forEach(b=> onTapSafe(b, ()=>{
        Sheet.close(); editLift(b.dataset.track);
      }));
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
      // Include the data AND the user profile/settings. Data fields are kept at
      // the top level for backward compatibility with older backups/importers,
      // and the full settings object is added under "settings".
      const payload = Object.assign({}, DB.data, { settings: Settings.get() });
      const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
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
          DB.data = {wods:obj.wods, lifts:obj.lifts, bw:obj.bw||[],
            food:obj.food||[], water:obj.water||[], customFoods:obj.customFoods||[], meals:obj.meals||[],
            seededBenchmarks:true};
          DB.save();
          // Restore the user profile / settings (name, weight, height, goals,
          // units, etc.) if present. Older backups won't have this — skip then.
          if(obj.settings && typeof obj.settings === 'object'){
            Settings._cache = null;                 // drop cache before overwrite
            localStorage.setItem(Settings.KEY, JSON.stringify(obj.settings));
            Settings._cache = null;                 // force reload on next get()
          }
          Sheet.close(); render(); toast('Data restored');
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
        let payloadLen; [payloadLen,pos] = readVarint(pg,pos); payloadLen = Number(payloadLen);
        let rowid; [rowid,pos] = readVarint(pg,pos);
        // Reassemble the full record, following overflow pages when the payload
        // doesn't fit on this leaf page (large myWOD descriptions overflow).
        try{
          const usable = pageSize;                 // no reserved bytes in myWOD files
          const maxLocal = usable - 35;            // SQLite table-leaf threshold
          let recBuf;
          if(payloadLen <= maxLocal){
            recBuf = pg.subarray(pos, pos + payloadLen);
          }else{
            const minLocal = ((usable - 12) * 32 / 255 | 0) - 23;
            let local = minLocal + ((payloadLen - minLocal) % (usable - 4));
            if(local > maxLocal) local = minLocal;
            recBuf = new Uint8Array(payloadLen);
            recBuf.set(pg.subarray(pos, pos + local), 0);
            let got = local;
            let nextPage = u32(pg, pos + local);   // 4-byte overflow page pointer
            while(nextPage && got < payloadLen){
              const op = page(nextPage);
              const np = u32(op, 0);               // next overflow page (0 = last)
              const chunk = Math.min(usable - 4, payloadLen - got);
              recBuf.set(op.subarray(4, 4 + chunk), got);
              got += chunk;
              nextPage = np;
            }
          }
          out.push(parseRecord(recBuf, 0));
        }catch(e){}
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

// Match an imported workout title against the built-in benchmark catalog so
// imported attempts (e.g. several "Grace" or "Cindy" entries) link to the same
// benchmark and group together everywhere. Returns the canonical benchmark
// name, or null if the title isn't a known benchmark.
function matchBenchmarkName(title){
  if(typeof BENCHMARKS === 'undefined' || !title) return null;
  const norm = (s)=> String(s).toLowerCase().replace(/\s+/g,' ').trim();
  const t = norm(title);
  const b = BENCHMARKS.find(x=> norm(x.name) === t);
  return b ? b.name : null;
}

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
    const title = asStr(r.title) || 'Workout';
    // Link known benchmarks (Grace, Cindy, …) so every imported attempt groups
    // under the same benchmark in the Benchmarks tab and the Log.
    const benchmarkName = matchBenchmarkName(title);
    // If this benchmark only exists as an empty seeded placeholder, drop the
    // placeholder so the imported real attempts become the visible history.
    if(benchmarkName){
      DB.data.wods = DB.data.wods.filter(w=>
        !(w.seeded && !((w.result||'').trim()) && w.benchmarkName===benchmarkName));
    }
    DB.data.wods.push({
      id: uid(), createdAt: Date.now(), mywodKey: key,
      title,
      type: mywodType(asStr(r.scoreType)),
      details: asStr(r.description),
      result: asStr(r.score),
      rxd: !!r.asPrescribed,
      notes: (asStr(r.notes) && r.notes!=='NA') ? asStr(r.notes) : '',
      date: dateMs,
      benchmarkName
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
      if(ath.height) patch.heightIn = Number(ath.height);   // myWOD height is inches
      if(ath.gender!=null) patch.sex = (ath.gender===1?'female':'male');
      Settings.set(patch);
      // Seed a starting bodyweight reading if none exist yet.
      if(bw && DB.data.bw.length===0){
        DB.data.bw.push({ id:uid(), createdAt:Date.now(), weight:bw, unit:units,
          date: ath.dateOfBirth ? Date.now() : Date.now(), notes:'from myWOD' });
      }
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
      go('log'); editWod(null, {title:this.mode, type:this.resultType(), result:this.resultStr(), details:'', rxd:false, notes:'', date:isoToTs(todayISO())});
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
  // One-line summary of the current mode + settings (shown above landscape clock).
  modeSummary(){ const c=this.cfg;
    const lead = (Settings.get().leadIn|0); const leadTxt = lead>0 ? ` · ${lead}s lead-in` : '';
    if(this.mode==='For Time') return `FOR TIME${c.forTimeCap>0?` · cap ${mmss(c.forTimeCap)}`:''}${leadTxt}`;
    if(this.mode==='AMRAP') return `AMRAP · ${mmss(c.amrap)}${leadTxt}`;
    if(this.mode==='EMOM') return `EMOM · ${c.emomIv}s × ${c.emomR}${leadTxt}`;
    return `TABATA · ${c.work}/${c.rest}s × ${c.tabataR}${leadTxt}`;
  },
};

Screens.timer = function(){
  const t=Timer, c=t.cfg;
  const modes=['For Time','AMRAP','EMOM','Tabata'];
  const blurbs={'For Time':'Count up. Tap “Round” to record splits.','AMRAP':'Count down from a set duration.','EMOM':'Every minute on the minute for N rounds.','Tabata':'Work / rest intervals repeated for N rounds.'};
  // Quick presets per mode — one tap to configure a common workout.
  const presets = {
    'For Time': [['No cap',0],['10:00',600],['15:00',900],['20:00',1200],['60:00',3600],['90:00',5400]],
    'AMRAP':    [['7:00',420],['12:00',720],['15:00',900],['20:00',1200],['60:00',3600],['90:00',5400]],
    'EMOM':     [['10×1:00',{iv:60,r:10}],['12×1:00',{iv:60,r:12}],['20×1:00',{iv:60,r:20}],['10×0:90',{iv:90,r:10}]],
    'Tabata':   [['Classic 20/10×8',{w:20,r:10,n:8}],['30/15×8',{w:30,r:15,n:8}],['40/20×6',{w:40,r:20,n:6}]]
  };
  const chipRow = (arr, attr)=> `<div class="seg" style="flex-wrap:wrap;gap:6px;margin-bottom:10px">`+
    arr.map((p,i)=>`<button data-${attr}="${i}" style="flex:0 0 auto">${esc(p[0])}</button>`).join('')+`</div>`;

  let cfgHtml='';
  if(t.mode==='For Time'){
    cfgHtml = `<div class="tag" style="margin-bottom:6px">Time cap (optional)</div>` + chipRow(presets['For Time'],'fc') +
      timeWheel('cfg_cap', c.forTimeCap);
  }
  if(t.mode==='AMRAP'){
    cfgHtml = `<div class="tag" style="margin-bottom:6px">Quick durations</div>` + chipRow(presets['AMRAP'],'ap') +
      timeWheel('cfg_amrap', c.amrap);
  }
  if(t.mode==='EMOM'){
    cfgHtml = chipRow(presets['EMOM'],'em') +
      `<div class="row" style="gap:8px">
        <div style="flex:2">${timeWheel('cfg_emomIv', c.emomIv)}</div>
        <div style="flex:1">${numWheel('cfg_emomR','Rounds', c.emomR, 1, 60)}</div>
      </div>`;
  }
  if(t.mode==='Tabata'){
    cfgHtml = chipRow(presets['Tabata'],'tb') +
      `<div class="row" style="gap:8px">
        <div style="flex:1">${numWheel('cfg_work','Work s', c.work, 5, 300, 5)}</div>
        <div style="flex:1">${numWheel('cfg_rest','Rest s', c.rest, 0, 300, 5)}</div>
        <div style="flex:1">${numWheel('cfg_tabR','Rounds', c.tabataR, 1, 50)}</div>
      </div>`;
  }
  // Lead-in countdown (shared).
  cfgHtml += `<div style="margin-top:8px">${numWheel('cfg_lead','Lead-in s', Settings.get().leadIn|0, 0, 60, 5)}</div>`;

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
    // Landscape: hide all setup/config — show only a mode summary + the big
    // clock + controls, centered, easy to read from across the gym.
    const summary = `<div class="tm-summary">${esc(t.modeSummary())}</div>`;
    $('screen').innerHTML = `<div class="tm-land tm-land-clock">${summary}${clockBlock}</div>`;
  } else {
    $('screen').innerHTML = setupBlock + clockBlock;
  }

  // Setup handlers only apply when the setup block is present (portrait, idle).
  if(!t.running && !landscape){
    $('tm_modes').querySelectorAll('button').forEach(b=> onTapSafe(b, ()=>{ t.mode=b.dataset.m; t.reset(true); }));

    // Scroll-wheel pickers commit live as you spin them (no full re-render,
    // so the wheel keeps its position) and only update the clock display.
    const refreshClock = ()=>{ t.tick0(); t.updateClock?.(); const el=$('tm_clock'); if(el) el.textContent=mmss(t.display); };
    initTimeWheel('cfg_cap',   (v)=>{ c.forTimeCap=v; if(t.mode==='For Time') refreshClock(); });
    initTimeWheel('cfg_amrap', (v)=>{ c.amrap=Math.max(10,v); if(t.mode==='AMRAP') refreshClock(); });
    initTimeWheel('cfg_emomIv',(v)=>{ c.emomIv=Math.max(5,v); });
    initNumWheel('cfg_emomR',  (v)=>{ c.emomR=Math.max(1,v); });
    initNumWheel('cfg_work',   (v)=>{ c.work=Math.max(5,v); if(t.mode==='Tabata') refreshClock(); });
    initNumWheel('cfg_rest',   (v)=>{ c.rest=Math.max(0,v); });
    initNumWheel('cfg_tabR',   (v)=>{ c.tabataR=Math.max(1,v); });
    initNumWheel('cfg_lead',   (v)=>{ Settings.set({leadIn:Math.max(0,v)}); });

    // Preset chips (one tap) — full re-render so wheels jump to the new values.
    $('screen').querySelectorAll('[data-fc]').forEach(b=> onTapSafe(b, ()=>{ c.forTimeCap=presets['For Time'][+b.dataset.fc][1]; t.reset(true); }));
    $('screen').querySelectorAll('[data-ap]').forEach(b=> onTapSafe(b, ()=>{ c.amrap=presets['AMRAP'][+b.dataset.ap][1]; t.reset(true); }));
    $('screen').querySelectorAll('[data-em]').forEach(b=> onTapSafe(b, ()=>{ const p=presets['EMOM'][+b.dataset.em][1]; c.emomIv=p.iv; c.emomR=p.r; t.reset(true); }));
    $('screen').querySelectorAll('[data-tb]').forEach(b=> onTapSafe(b, ()=>{ const p=presets['Tabata'][+b.dataset.tb][1]; c.work=p.w; c.rest=p.r; c.tabataR=p.n; t.reset(true); }));
  }
  $('tm_reset').onclick=()=>t.reset(true);
  $('tm_go').onclick=()=> t.running? t.pause() : t.start();
  if($('tm_round_btn')) $('tm_round_btn').onclick=()=>t.markRound();
};

/* =================== Scroll wheel picker (PushPress-style) ===================
   Spin minutes/seconds (or a number) columns. Snap-scroll on touch; the
   selected value is whichever option is centered in the highlight band. */

// Build a single number column. range = array of integer values.
function wheelColumn(id, values, selected){
  const opts = values.map(v=>`<div class="opt" data-v="${v}">${String(v).padStart(2,'0')}</div>`).join('');
  return `<div class="wheel" id="${id}" data-sel="${selected}">
      <div class="pad"></div>${opts}<div class="pad"></div>
    </div>`;
}
// mm:ss time wheel (minutes 0–59, seconds 0–59).
function timeWheel(id, seconds){
  const m=Math.floor((seconds||0)/60), s=(seconds||0)%60;
  // Minutes 0–90 so timers/caps can go up to 90:00; seconds 0–59.
  const mins=[...Array(91).keys()], secs=[...Array(60).keys()];
  return `<div class="wheels" data-time="${id}">
      <div class="hl"></div>
      <div class="wheel-col"><div class="wlabel">min</div>${wheelColumn(id+'_m', mins, m)}</div>
      <div class="sep">:</div>
      <div class="wheel-col"><div class="wlabel">sec</div>${wheelColumn(id+'_s', secs, s)}</div>
    </div>`;
}
// Single-number wheel with a label, min..max (step optional).
function numWheel(id, label, val, min, max, step){
  step = step||1; const vals=[];
  for(let v=min; v<=max; v+=step) vals.push(v);
  return `<div class="wheels" data-num="${id}">
      <div class="hl"></div>
      <div class="wheel-col"><div class="wlabel">${esc(label)}</div>${wheelColumn(id+'_n', vals, val)}</div>
    </div>`;
}

// Make a wheel column scrollable + snapping; returns its current value via getter.
function setupWheel(colId, onPick){
  const w=$(colId); if(!w) return null;
  const ih = 32; // must match --ih in CSS
  const opts = Array.from(w.querySelectorAll('.opt'));
  const idxOf = (v)=> opts.findIndex(o=> +o.dataset.v === +v);
  const start = Math.max(0, idxOf(+w.dataset.sel));
  // Position to the initially-selected option.
  requestAnimationFrame(()=>{ w.scrollTop = start*ih; markSel(); });
  function markSel(){
    const i = Math.round(w.scrollTop/ih);
    opts.forEach((o,k)=> o.classList.toggle('sel', k===i));
  }
  let tmr=null;
  w.addEventListener('scroll', ()=>{
    markSel();
    clearTimeout(tmr);
    tmr=setTimeout(()=>{
      const i=Math.max(0,Math.min(opts.length-1, Math.round(w.scrollTop/ih)));
      w.scrollTo({top:i*ih, behavior:'smooth'});
      const v=+opts[i].dataset.v; w.dataset.sel=v; buzz(8); onPick && onPick(v);
    }, 90);
  }, {passive:true});
  return { get:()=> +w.dataset.sel };
}

function initTimeWheel(id, commit){
  if(!$(id+'_m')) return;
  const mw=setupWheel(id+'_m', ()=> push());
  const sw=setupWheel(id+'_s', ()=> push());
  function push(){ if(mw&&sw) commit(mw.get()*60 + sw.get()); }
}
function initNumWheel(id, commit){
  if(!$(id+'_n')) return;
  setupWheel(id+'_n', (v)=> commit(v));
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
