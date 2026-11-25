/* Драйвер интерфейса: нажимает настоящие контролы, ждёт остановки
   камеры, снимает кадр и считает по нему ЦВЕТОВУЮ сигнатуру —
   смена покрытия меняет цвет, а не яркость, и раньше не ловилась. */

const raf = () => new Promise(r => requestAnimationFrame(() => r()));
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const CFG_DEFAULTS = {
  speed:1, gap:90, shot:288, pixelTol:.04, camTol:.35,
  stepTimeout:8000, highlight:true, stopOnFail:false, showApp:true
};
const LIVE_RANGE = new Set(['explode','sec']);
const LIVE_CHIP = new Set(['secOn','wire','grid','marks']);

/* Сигнатура кадра: куб RGB 3×3×3 + сетка яркости 8×8.
   Декодируется из PNG в родительской странице, поэтому не требует
   никаких изменений в приложении. */
async function signature(url){
  if(!url) return null;
  const img=new Image(); img.src=url;
  try { await img.decode(); } catch { return null; }
  const W=64,H=40;
  const c=document.createElement('canvas'); c.width=W;c.height=H;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(img,0,0,W,H);
  let d; try { d=x.getImageData(0,0,W,H).data; } catch { return null; }
  const cube=new Array(27).fill(0), grid=new Array(64).fill(0), gn=new Array(64).fill(0);
  for(let py=0;py<H;py++)for(let px=0;px<W;px++){
    const i=(py*W+px)*4, R=d[i],G=d[i+1],B=d[i+2];
    cube[Math.min(2,R>>6)*9+Math.min(2,G>>6)*3+Math.min(2,B>>6)]++;
    const ci=Math.floor(py/H*8)*8+Math.floor(px/W*8);
    grid[ci]+=(R+G+B)/3; gn[ci]++;
  }
  const tot=W*H;
  return { cube:cube.map(v=>Math.round(v/tot*1000)), grid:grid.map((v,i)=>Math.round(v/Math.max(1,gn[i]))) };
}
function sigDiff(a,b){
  if(!a||!b) return 1;
  let l1=0; for(let i=0;i<27;i++) l1+=Math.abs(a.cube[i]-b.cube[i]);
  const color=Math.min(1,l1/2000);
  let n=0; for(let i=0;i<64;i++) if(Math.abs(a.grid[i]-b.grid[i])>6) n++;
  return +Math.max(color,n/64).toFixed(3);
}

export class Driver {
  constructor(iframe,cfg,hooks={}){ this.f=iframe; this.w=iframe.contentWindow; this.d=iframe.contentDocument;
    this.cfg=cfg; this.hooks=hooks; }
  get T(){ return this.w.__roofTest; }
  q(s){ return this.d.querySelector(s); }
  qa(s){ return [...this.d.querySelectorAll(s)]; }
  byK(k){ return this.d.querySelector(`[data-k="${k}"]`); }
  text(s){ const e=this.q(s); return e?e.textContent.trim():null; }
  pace(ms){ return sleep(ms/Math.max(.25,this.cfg.speed)+this.cfg.gap); }
  mark(el,label){ if(!this.cfg.highlight||!el||!this.hooks.onAct) return;
    const r=el.getBoundingClientRect();
    this.hooks.onAct({x:r.left,y:r.top,w:r.width,h:r.height,label}); }
  async waitFor(fn,ms,step=40){ const lim=ms??this.cfg.stepTimeout; const t0=performance.now();
    while(performance.now()-t0<lim){ if(fn()) return true; await sleep(step); } return false; }
  async boot(){ const ok=await this.waitFor(()=>this.T&&this.T.ready&&this.T.ready(),25000,80);
    await raf(); await raf(); return ok; }
  async settle(expectBuild=true){
    const b0=this.T.builds();
    if(expectBuild) await this.waitFor(()=>this.T.builds()>b0);
    await this.waitFor(()=>this.T.ready());
    await raf(); await raf(); await this.pace(60);
  }
  async cameraStill(tol=.008,ms=2500){
    let prev=this.T.camera().pos, stable=0; const t0=performance.now();
    while(performance.now()-t0<ms){ await sleep(70);
      const cur=this.T.camera().pos;
      const d=Math.hypot(cur[0]-prev[0],cur[1]-prev[1],cur[2]-prev[2]);
      prev=cur; stable=d<tol?stable+1:0; if(stable>=3) return true; }
    return false;
  }
  shot(w){ return this.T.capture(w||this.cfg.shot,Math.round((w||this.cfg.shot)*.625)); }
  async sig(){ return signature(this.shot(192).url); }
  /* Измерение изменения кадра вокруг действия — по цвету и яркости. */
  async measure(fn){ const a=await this.sig(); await fn(); const b=await this.sig(); return sigDiff(a,b); }
  async setRange(k,v){ const el=this.byK(k); if(!el) throw new Error(`ползунок ${k} не найден`);
    this.mark(el,`${k} → ${v}`); el.value=String(v);
    el.dispatchEvent(new this.w.Event('input',{bubbles:true}));
    el.dispatchEvent(new this.w.Event('change',{bubbles:true}));
    await this.settle(!LIVE_RANGE.has(k)); }
  async select(k,v){ const el=this.byK(k); if(!el) throw new Error(`селект ${k} не найден`);
    this.mark(el,`${k} = ${v}`); el.value=String(v);
    el.dispatchEvent(new this.w.Event('change',{bubbles:true})); await this.settle(true); }
  async chip(k,want){ const el=this.byK(k); if(!el) throw new Error(`переключатель ${k} не найден`);
    const on=el.classList.contains('on'); this.mark(el,`${k} ${want===undefined?'переключить':want?'вкл':'выкл'}`);
    if(want===undefined||want!==on) el.click(); await this.settle(!LIVE_CHIP.has(k)); }
  async tab(name){ const el=this.d.querySelector(`.tab[data-tab="${name}"]`);
    if(!el) throw new Error(`вкладка ${name} не найдена`);
    this.mark(el,`вкладка ${name}`); el.click();
    await this.waitFor(()=>this.q('#rightBody')?.dataset.tab===name,3000); await raf(); await this.pace(50); }
  async act(name){ const el=this.d.querySelector(`[data-act="${name}"]`);
    if(!el) throw new Error(`кнопка ${name} не найдена`);
    this.mark(el,`кнопка ${name}`); el.click(); await this.pace(180); await raf(); }
  async clickSel(sel,label){ const el=this.q(sel); if(!el) throw new Error(`элемент ${sel} не найден`);
    this.mark(el,label||sel); el.click(); await this.pace(160); await raf(); return el; }
  async layer(id,want){ const el=this.d.querySelector(`[data-layer="${id}"]`); if(!el) return false;
    const on=!el.classList.contains('off'); this.mark(el,`слой ${id}`);
    if(want!==undefined&&want!==on) el.click(); await this.settle(false); return true; }
  layersOn(){ return this.T.scene().layers||[]; }
  async orbit(dx=140,dy=40){
    const c=this.q('#stage canvas'); if(!c) throw new Error('канвас не найден');
    const r=c.getBoundingClientRect(), x0=r.left+r.width/2, y0=r.top+r.height/2;
    this.hooks.onAct?.({x:x0-26,y:y0-26,w:52,h:52,label:'орбита указателем'});
    const ev=(t,x,y)=>c.dispatchEvent(new this.w.PointerEvent(t,{bubbles:true,cancelable:true,pointerId:1,
      pointerType:'mouse',button:0,buttons:t==='pointerup'?0:1,clientX:x,clientY:y}));
    ev('pointerdown',x0,y0);
    for(let i=1;i<=8;i++){ ev('pointermove',x0+dx*i/8,y0+dy*i/8); await raf(); }
    ev('pointerup',x0+dx,y0+dy); await this.cameraStill();
  }
  async resize(w,h){ this.f.style.width=w+'px'; this.f.style.height=h+'px';
    this.hooks.onResize?.(w,h); this.w.dispatchEvent(new this.w.Event('resize'));
    await this.pace(340); await raf(); await raf(); }
  hookDownloads(){ const w=this.w; w.__blobs=[];
    if(!w.__dlHooked){ const orig=w.URL.createObjectURL.bind(w.URL);
      w.URL.createObjectURL=b=>{w.__blobs.push(b);return orig(b);};
      w.HTMLAnchorElement.prototype.click=function(){}; w.__dlHooked=true; }
    w.__blobs.length=0; }
  async lastBlob(){ const b=this.w.__blobs?.slice(-1)[0]; if(!b) return null;
    const text=await b.text(); return {size:b.size,type:b.type,lines:text.split('\n').length,text}; }
  badText(){ const bad=[];
    ['#rightBody','#ctlBody','#hud','#pieRows','#asm'].forEach(z=>{
      const e=this.q(z); if(!e) return;
      const m=(e.textContent||'').match(/\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]/g);
      if(m) bad.push(`${z}: ${[...new Set(m)].join(', ')}`); });
    return bad; }
  overflow(){ const out=[];
    ['#left','#right','#stage','#ctlBody','#rightBody'].forEach(s=>{
      const e=this.q(s); if(!e) return; const r=e.getBoundingClientRect();
      if(r.width<40||r.height<40) out.push(`${s} сжат до ${Math.round(r.width)}×${Math.round(r.height)}`); });
    const doc=this.d.documentElement;
    if(doc.scrollWidth>doc.clientWidth+6) out.push(`документ шире окна на ${doc.scrollWidth-doc.clientWidth}px`);
    return out; }
}

const A=(pass,detail,data)=>({pass:!!pass,detail:detail||'',data:data||null});
const pc=v=>(v*100).toFixed(0)+'%';

export const SCENARIOS = [
  { id:'B01',g:'Запуск',n:'Приложение загружается и рисует',run:async D=>{
    if(!await D.boot()) return A(false,'__roofTest.ready() не стал true за 25 с');
    const s=D.shot(); return A(s.lit>.02,`освещено ${pc(s.lit)}, яркость ${s.mean}`,{lit:s.lit}); } },
  { id:'B02',g:'Запуск',n:'Нет ошибок в консоли при загрузке',run:async D=>{
    const e=D.T.errors(); return A(!e.length,e.slice(0,3).join(' | ')); } },
  { id:'B03',g:'Запуск',n:'Не меньше 7 живых органов управления',run:async D=>{
    const n=D.qa('#ctlBody [data-k]').length; return A(n>=7,`контролов с data-k: ${n}`); } },
  { id:'B04',g:'Запуск',n:'Нет NaN/undefined в панелях',run:async D=>{
    const b=D.badText(); return A(!b.length,b.join(' | ')); } },
  { id:'B05',g:'Запуск',n:'Панели не сжаты и не переполнены',run:async D=>{
    const o=D.overflow(); return A(!o.length,o.join(' | ')); } },

  { id:'M01',g:'Мансарда',n:'Секция мансарды внутри прокрутки настроек',run:async D=>{
    const sec=D.q('[data-sec="mansard"]'); if(!sec) return A(false,'секция отсутствует');
    const body=D.q('#ctlBody'), inside=!!(body&&body.contains(sec));
    const pos=D.w.getComputedStyle(sec).position;
    return A(inside&&pos!=='fixed',`внутри #ctlBody ${inside}, position ${pos}`); } },
  { id:'M02',g:'Мансарда',n:'Секция не отжимает высоту у соседей',run:async D=>{
    const sec=D.q('[data-sec="mansard"]'), body=D.q('#ctlBody');
    if(!sec||!body) return A(false,'нет секции или тела настроек');
    const groups=D.qa('#ctlBody .grp').length;
    const ratio=sec.getBoundingClientRect().height/Math.max(1,body.getBoundingClientRect().height);
    return A(groups>=6&&ratio<.92,`секций ${groups}, мансарда ${pc(ratio)} высоты`); } },
  { id:'M03',g:'Мансарда',n:'Включение мансарды перестраивает сцену',run:async D=>{
    const b0=D.T.builds();
    const d=await D.measure(async()=>{ await D.chip('mansard',true); });
    const s=D.T.summary();
    return A(s.mansardOn&&D.T.builds()>b0&&d>D.cfg.pixelTol,
      `mansardOn ${s.mansardOn}, сборок +${D.T.builds()-b0}, кадр ${pc(d)}`,{d}); } },
  { id:'M04',g:'Мансарда',n:'В комнате нет центральных стоек',run:async D=>{
    const s=D.T.summary(); return A(s.posts===0&&s.planPosts===0,`стоек конька ${s.posts}, прогона ${s.planPosts}`); } },
  { id:'M05',g:'Мансарда',n:'Секция выживает после перерисовки настроек',run:async D=>{
    await D.setRange('span',9);
    const sec=D.q('[data-sec="mansard"]'), chip=D.byK('mansard');
    return A(!!sec&&!!chip&&chip.classList.contains('on'),
      `секция ${!!sec}, переключатель ${!!chip}, включён ${chip?chip.classList.contains('on'):false}`); } },
  { id:'M06',g:'Мансарда',n:'Высота потолка меняет комнату',run:async D=>{
    const a=D.T.summary(); await D.setRange('mansardRoomH',2.9); const b=D.T.summary();
    return A(Math.abs(b.roomH-2.9)<.06&&b.roomH!==a.roomH,`${a.roomH} → ${b.roomH} м`); } },
  { id:'M07',g:'Мансарда',n:'Аттиковая стенка меняет ширину комнаты',run:async D=>{
    const a=D.T.summary(); await D.setRange('mansardKnee',1.2);
    const b=D.T.summary(), sc=D.T.scene();
    return A(!sc.errors.length&&Number.isFinite(b.roomW),
      `комната ${a.roomW?.toFixed(2)} → ${b.roomW?.toFixed(2)} м, ошибок ${sc.errors.length}`); } },
  { id:'M08',g:'Мансарда',n:'Нижний уклон меняет геометрию',run:async D=>{
    await D.select('mansardScheme','broken');
    const d=await D.measure(async()=>{ await D.setRange('mansardLowPitch',70); });
    const s=D.T.summary();
    return A(d>D.cfg.pixelTol&&s.faces===4,`кадр ${pc(d)}, скатов ${s.faces}`,{d}); } },
  { id:'M09',g:'Мансарда',n:'Верхний уклон меняет геометрию',run:async D=>{
    const d=await D.measure(async()=>{ await D.setRange('mansardHighPitch',20); });
    return A(d>D.cfg.pixelTol*.75,`кадр ${pc(d)} при пороге ${pc(D.cfg.pixelTol*.75)}`,{d}); } },
  { id:'M10',g:'Мансарда',n:'Автоподбор сечения переключается',run:async D=>{
    await D.chip('mansardAutoSection',false); const off=D.T.summary().sect.join('×');
    await D.chip('mansardAutoSection',true); const on=D.T.summary().sect.join('×');
    return A(true,`без автоподбора ${off}, с автоподбором ${on}`); } },

  { id:'S01',g:'Схемы',n:'Ломаный скат — 4 ската',run:async D=>{
    await D.select('mansardScheme','broken'); const s=D.T.summary();
    return A(s.scheme==='broken'&&s.faces===4,`схема ${s.scheme}, скатов ${s.faces}`); } },
  { id:'S02',g:'Схемы',n:'Висячие с затяжкой — 2 ската',run:async D=>{
    await D.select('mansardScheme','tie'); const s=D.T.summary();
    return A(s.scheme==='tie'&&s.faces===2,`схема ${s.scheme}, скатов ${s.faces}`); } },
  { id:'S03',g:'Схемы',n:'Прогон на фронтонах — 2 ската',run:async D=>{
    await D.select('mansardScheme','ridge'); const s=D.T.summary();
    return A(s.scheme==='ridge'&&s.faces===2,`схема ${s.scheme}, скатов ${s.faces}`); } },
  { id:'S04',g:'Схемы',n:'Ферма — 2 ската',run:async D=>{
    await D.select('mansardScheme','truss'); const s=D.T.summary();
    return A(s.scheme==='truss'&&s.faces===2,`схема ${s.scheme}, скатов ${s.faces}`); } },
  { id:'S05',g:'Схемы',n:'Четыре схемы дают РАЗНУЮ сцену',run:async D=>{
    const sig={};
    for(const k of ['broken','tie','ridge','truss']){
      await D.select('mansardScheme',k);
      const sc=D.T.scene(); sig[k]={mesh:sc.meshCount,hw:sc.hwCount,s:await D.sig()};
    }
    const keys=Object.keys(sig), same=[];
    for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
      const a=sig[keys[i]],b=sig[keys[j]];
      if(a.mesh===b.mesh&&a.hw===b.hw&&sigDiff(a.s,b.s)<D.cfg.pixelTol*.75) same.push(`${keys[i]}≈${keys[j]}`);
    }
    return A(!same.length, same.length?'неразличимы: '+same.join(', ')
      :keys.map(k=>`${k} ${sig[k].mesh}m/${sig[k].hw}k`).join(' · ')); } },
  { id:'S06',g:'Схемы',n:'Схемы не дают NaN в панелях',run:async D=>{
    const bad=[];
    for(const k of ['broken','tie','ridge','truss']){ await D.select('mansardScheme',k);
      const b=D.badText(); if(b.length) bad.push(k+': '+b.join('; ')); }
    return A(!bad.length,bad.join(' | ')); } },
  { id:'S07',g:'Схемы',n:'Схемы не роняют сборку',run:async D=>{
    const errs=[];
    for(const k of ['broken','tie','ridge','truss']){ await D.select('mansardScheme',k);
      const e=D.T.scene().errors; if(e.length) errs.push(k+': '+e.join('; ')); }
    return A(!errs.length,errs.join(' | ')); } },
  { id:'S08',g:'Схемы',n:'Клеёный прогон разумной пропорции h/b ≤ 4.5',run:async D=>{
    await D.select('mansardScheme','ridge');
    await D.setRange('span',8); await D.setRange('length',10);
    const box=D.q('[data-sec="mansard"] .ms-box'), txt=box?box.textContent:'';
    const m=txt.match(/Прогон клеёный\s*(\d+)×(\d+)/);
    if(!m) return A(false,'сечение прогона не найдено в сводке');
    const b=+m[1],h=+m[2],hb=h/b;
    return A(hb<=4.5&&b>=115,`${b}×${h}, h/b ${hb.toFixed(2)}`,{hb}); } },

  { id:'G01',g:'Геометрия',n:'Выключение мансарды возвращает обычную крышу',run:async D=>{
    await D.chip('mansard',false); const s=D.T.summary();
    return A(!s.mansardOn&&s.faces>=2,`mansardOn ${s.mansardOn}, скатов ${s.faces}`); } },
  { id:'G02',g:'Геометрия',n:'Вальма даёт 4 ската и полуноги',run:async D=>{
    await D.select('type','hip'); const s=D.T.summary();
    return A(s.type==='hip'&&s.faces===4&&s.jacks>0,`скатов ${s.faces}, полуног ${s.jacks}`); } },
  { id:'G03',g:'Геометрия',n:'Двускатная даёт 2 ската без полуног',run:async D=>{
    await D.select('type','gable'); const s=D.T.summary();
    return A(s.type==='gable'&&s.faces===2&&s.jacks===0,`скатов ${s.faces}, полуног ${s.jacks}`); } },
  { id:'G04',g:'Геометрия',n:'Пролёт 14 м перестраивает без ошибок',run:async D=>{
    await D.setRange('span',14); const sc=D.T.scene(), s=D.T.summary();
    return A(!sc.errors.length&&s.rafters>0,`стропил ${s.rafters}, ошибок ${sc.errors.length}`); } },
  { id:'G05',g:'Геометрия',n:'Шаг 1000 мм уменьшает число стропил',run:async D=>{
    const a=D.T.summary().rafters; await D.select('step',1); const b=D.T.summary().rafters;
    await D.select('step',.6); return A(b<a,`шаг 600: ${a} ног, шаг 1000: ${b} ног`); } },
  { id:'G06',g:'Геометрия',n:'Смена покрытия меняет кадр',run:async D=>{
    const b0=D.T.builds();
    const d=await D.measure(async()=>{ await D.select('cover','shingle'); });
    const cov=D.T.params().cover, built=D.T.builds()-b0;
    await D.select('cover','metaltile');
    return A(cov==='shingle'&&built>=1&&d>.005,`покрытие ${cov}, пересборок ${built}, кадр ${pc(d)}`,{d}); } },

  { id:'V01',g:'Вид',n:'Орбита указателем поворачивает камеру',run:async D=>{
    const a=D.T.camera(); await D.orbit(160,30); const b=D.T.camera();
    const d=Math.hypot(a.pos[0]-b.pos[0],a.pos[1]-b.pos[1],a.pos[2]-b.pos[2]);
    return A(d>.4,`смещение ${d.toFixed(2)} м`,{d}); } },
  { id:'V02',g:'Вид',n:'Пересборка НЕ сбрасывает камеру',run:async D=>{
    await D.cameraStill(); const a=D.T.camera();
    await D.setRange('length',12); await D.cameraStill(); const b=D.T.camera();
    const d=Math.hypot(a.pos[0]-b.pos[0],a.pos[1]-b.pos[1],a.pos[2]-b.pos[2]);
    return A(d<D.cfg.camTol,`дрейф ${d.toFixed(3)} м при допуске ${D.cfg.camTol} м`,{d}); } },
  { id:'V03',g:'Вид',n:'Разлёт слоёв меняет кадр без пересборки',run:async D=>{
    const b0=D.T.builds();
    const d=await D.measure(async()=>{ await D.setRange('explode',.6); });
    const built=D.T.builds()-b0;
    await D.setRange('explode',0);
    return A(d>D.cfg.pixelTol,`кадр ${pc(d)}, пересборок ${built}`,{d}); } },
  { id:'V04',g:'Вид',n:'Каркасный режим меняет кадр',run:async D=>{
    const d=await D.measure(async()=>{ await D.chip('wire',true); });
    await D.chip('wire',false);
    return A(d>D.cfg.pixelTol,`кадр ${pc(d)}`,{d}); } },
  { id:'V05',g:'Вид',n:'Скрытие покрытия убирает слой и меняет кадр',run:async D=>{
    const before=D.layersOn();
    const d=await D.measure(async()=>{ await D.layer('cover',false); });
    const after=D.layersOn();
    await D.layer('cover',true);
    const removed=before.includes('cover')&&!after.includes('cover');
    return A(removed&&d>D.cfg.pixelTol,`слой снят ${removed}, кадр ${pc(d)}`,{d}); } },
  { id:'V06',g:'Вид',n:'«Вписать вид» возвращает камеру',run:async D=>{
    await D.orbit(200,60); await D.act('fit'); await D.cameraStill(.02,3500);
    const c=D.T.camera();
    return A(Number.isFinite(c.pos[0])&&c.pos[1]>1,`позиция ${c.pos.join(', ')}`); } },

  { id:'A01',g:'Сборка',n:'Ползунок этапа меняет видимые элементы',run:async D=>{
    const el=D.q('#asmRange'); if(!el) return A(false,'ползунок этапа не найден');
    D.mark(el,'этап 4'); el.value='4'; el.dispatchEvent(new D.w.Event('input',{bubbles:true})); await D.settle(false);
    const a=D.T.scene().visible;
    D.mark(el,'этап 13'); el.value='13'; el.dispatchEvent(new D.w.Event('input',{bubbles:true})); await D.settle(false);
    const b=D.T.scene().visible;
    return A(a<b,`этап 4: ${a}, этап 13: ${b}`); } },
  { id:'A02',g:'Сборка',n:'Проигрывание идёт и останавливается',run:async D=>{
    const btn=D.q('#asmPlay'); if(!btn) return A(false,'кнопка не найдена');
    D.mark(btn,'проиграть сборку'); btn.click(); await sleep(1400);
    const mid=+D.q('#asmRange').value;
    D.mark(btn,'остановить'); btn.click(); await sleep(200);
    const stopped=!btn.classList.contains('on');
    const el=D.q('#asmRange'); el.value='13'; el.dispatchEvent(new D.w.Event('input',{bubbles:true}));
    await D.settle(false);
    return A(mid>0&&stopped,`дошёл до этапа ${mid}, остановлен ${stopped}`); } },
  { id:'A03',g:'Сборка',n:'Клик по этапу переводит сцену',run:async D=>{
    await D.tab('asm');
    const el=D.d.querySelector('[data-stage="6"]'); if(!el) return A(false,'этап 6 не найден');
    D.mark(el,'этап 6 в списке'); el.click(); await D.settle(false);
    return A(+D.q('#asmRange').value===6,`этап ${D.q('#asmRange').value}`); } },

  { id:'T01',g:'Вкладки',n:'Все шесть вкладок наполнены',run:async D=>{
    const bad=[];
    for(const t of ['calc','cut','asm','lab','est','rate']){ await D.tab(t);
      const body=D.q('#rightBody');
      const len=(body?.textContent||'').trim().length, kids=body?.children.length||0;
      if(len<120||kids<1) bad.push(`${t}: ${len} симв / ${kids} блоков`); }
    return A(!bad.length,bad.join(' | ')||'все вкладки наполнены'); } },
  { id:'T02',g:'Вкладки',n:'Вкладки не содержат NaN',run:async D=>{
    const bad=[];
    for(const t of ['calc','cut','asm','lab','est','rate']){ await D.tab(t);
      const b=D.badText(); if(b.length) bad.push(t+': '+b.join('; ')); }
    return A(!bad.length,bad.join(' | ')); } },
  { id:'T03',g:'Вкладки',n:'Ведомость содержит все марки',run:async D=>{
    await D.tab('cut');
    const rows=D.qa('#rightBody table.cut tbody tr').length, s=D.T.summary();
    return A(rows===s.pieces,`строк ${rows}, марок ${s.pieces}`); } },
  { id:'T04',g:'Вкладки',n:'Смета даёт положительную сумму',run:async D=>{
    await D.tab('est'); const t=D.text('#tSum')||'';
    const n=parseInt(t.replace(/[^\d]/g,''),10);
    return A(Number.isFinite(n)&&n>10000,`итого «${t}»`); } },

  { id:'E01',g:'Экспорт',n:'CSV ведомости непустой',run:async D=>{
    D.hookDownloads();
    const btn=D.d.querySelector('[data-act="cutCsv"]')||D.q('#bCsv');
    if(!btn) return A(false,'кнопка не найдена');
    D.mark(btn,'выгрузка ведомости'); btn.click(); await sleep(260);
    const b=await D.lastBlob();
    return A(b&&b.size>400&&b.lines>5,b?`${b.size} байт, ${b.lines} строк`:'blob не создан'); } },
  { id:'E02',g:'Экспорт',n:'JSON пакет парсится',run:async D=>{
    D.hookDownloads();
    const btn=D.q('#bJson'); if(!btn) return A(false,'кнопка JSON не найдена');
    D.mark(btn,'выгрузка JSON'); btn.click(); await sleep(320);
    const b=await D.lastBlob(); if(!b) return A(false,'blob не создан');
    let ok=false,keys='';
    try{ const j=JSON.parse(b.text); ok=!!j.pieces&&!!j.nesting; keys=Object.keys(j).join(','); }
    catch(e){ keys=e.message; }
    return A(ok,`${b.size} байт · ${keys}`); } },

  { id:'R01',g:'Отзывчивость',n:'900×700 без переполнения',run:async D=>{
    await D.resize(900,700); const o=D.overflow(), s=D.shot();
    return A(!o.length&&s.lit>.01,o.join(' | ')||`кадр ${pc(s.lit)}`); } },
  { id:'R02',g:'Отзывчивость',n:'420×760 рисует',run:async D=>{
    await D.resize(420,760); const s=D.shot(), cs=D.T.canvasSize();
    return A(s.lit>.005&&cs.w>100,`канвас ${cs.w}×${cs.h}, кадр ${pc(s.lit)}`); } },
  { id:'R03',g:'Отзывчивость',n:'Возврат 1440×900 восстанавливает кадр',run:async D=>{
    await D.resize(1440,900); const s=D.shot(), o=D.overflow();
    return A(s.lit>.02&&!o.length,`кадр ${pc(s.lit)}${o.length?' · '+o.join('; '):''}`); } },

  { id:'X01',g:'Устойчивость',n:'20 быстрых изменений не ломают сцену',run:async D=>{
    D.T.clearErrors();
    const el=D.byK('span'); if(!el) return A(false,'ползунок пролёта не найден');
    D.mark(el,'20 быстрых изменений');
    for(let i=0;i<20;i++){ el.value=String(6+(i%8)); el.dispatchEvent(new D.w.Event('input',{bubbles:true})); await sleep(35); }
    await D.settle(true);
    const s=D.T.scene(), e=D.T.errors();
    return A(!s.errors.length&&!e.length&&s.meshCount>0,`мешей ${s.meshCount}, ошибок сборки ${s.errors.length}, консоли ${e.length}`); } },
  { id:'X02',g:'Устойчивость',n:'Случайный вариант ×6 без ошибок',run:async D=>{
    D.T.clearErrors();
    const btn=D.q('#bRand'); if(!btn) return A(false,'кнопка не найдена');
    const bad=[];
    for(let i=0;i<6;i++){ D.mark(btn,`случайный вариант ${i+1}/6`); btn.click(); await D.settle(true);
      const s=D.T.scene(), b=D.badText();
      if(s.errors.length||b.length) bad.push(`#${i}: ${[...s.errors,...b].join('; ')}`); }
    return A(!bad.length,bad.join(' | ')); } },
  { id:'X03',g:'Устойчивость',n:'Сброс возвращает базовое состояние',run:async D=>{
    await D.clickSel('#bReset','сброс'); await D.settle(true);
    const s=D.T.summary(), sc=D.T.scene();
    return A(sc.meshCount>0&&!sc.errors.length,`форма ${s.type}, мешей ${sc.meshCount}, ошибок ${sc.errors.length}`); } },
  { id:'X04',g:'Устойчивость',n:'Одна пересборка на одно изменение',run:async D=>{
    const b0=D.T.builds(); await D.setRange('pitch',30); const b1=D.T.builds();
    await D.setRange('pitch',26); const b2=D.T.builds();
    return A(b1-b0===1&&b2-b1===1,`пересборок: ${b1-b0} и ${b2-b1}`); } },
  { id:'X05',g:'Устойчивость',n:'Финальный кадр виден и без ошибок',run:async D=>{
    const s=D.shot(), e=D.T.errors(), sc=D.T.scene();
    return A(s.lit>.02&&!e.length&&!sc.errors.length,`кадр ${pc(s.lit)}, ошибок ${e.length+sc.errors.length}`); } }
];

export async function runSuite(opts={}){
  const cfg={...CFG_DEFAULTS,...(opts.cfg||{})};
  const hooks=opts.hooks||{};
  const ctl=opts.control||{paused:false,step:false,abort:false};
  const frame=document.createElement('iframe');
  frame.setAttribute('title','Тестируемое приложение кровли');
  frame.style.cssText=`width:${opts.width||1440}px;height:${opts.height||900}px;border:0;background:#0a110e;display:block`;
  frame.src=opts.src||'./roof-lab.html';
  (opts.mount||document.body).appendChild(frame);
  hooks.onResize?.(opts.width||1440,opts.height||900);
  await new Promise(r=>{ frame.onload=r; setTimeout(r,25000); });

  const D=new Driver(frame,cfg,hooks);
  const results=[];
  const list=opts.only?SCENARIOS.filter(s=>opts.only.includes(s.id)||opts.only.includes(s.g)):SCENARIOS;

  if(!await D.boot()){
    const errs=D.T?.errors?D.T.errors():['iframe не загрузился или __roofTest отсутствует'];
    const row={id:'BOOT',g:'Запуск',n:'Приложение не запустилось',pass:false,detail:errs.join(' | '),
      shot:null,before:null,delta:null,lit:null,ms:0,errors:errs};
    results.push(row); opts.onStep?.(row);
    return {results,frame,driver:D};
  }

  let i=0;
  for(const s of list){
    if(ctl.abort) break;
    while(ctl.paused&&!ctl.step&&!ctl.abort) await sleep(90);
    ctl.step=false; i++;
    opts.onProgress?.(i/list.length,s.n,s.id);
    const t0=performance.now();
    let res,shot=null,before=null;
    try{
      before=D.shot(160);
      if(typeof s.run!=='function') throw new Error(`сценарий ${s.id} без функции run`);
      res=await s.run(D);
      shot=D.shot();
    }catch(e){
      res={pass:false,detail:'исключение: '+(e&&e.message||e)};
      try{ shot=D.shot(); }catch{ /* канвас потерян */ }
    }
    const row={id:s.id,g:s.g,n:s.n,pass:!!res.pass,detail:res.detail,data:res.data||null,
      ms:Math.round(performance.now()-t0),shot:shot?.url||null,lit:shot?.lit??null,
      before:before?.url||null,delta:res.data&&Number.isFinite(res.data.d)?res.data.d:null,
      errors:D.T.errors().slice(-3)};
    results.push(row); opts.onStep?.(row);
    hooks.onAct?.(null);
    await raf();
    if(!row.pass&&cfg.stopOnFail){ ctl.paused=true; opts.onPaused?.(row); }
  }
  opts.onProgress?.(1,'готово','');
  return {results,frame,driver:D};
}