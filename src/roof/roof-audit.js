import { computeRoofModel } from './roof-model.js';
import { computeRoofStructure } from './roof-structure.js';
import { computeRoofPieces } from './roof-pieces.js';
import { nestRoofPieces } from './roof-nesting.js';
import { planLongMembers, purlinXs } from './roof-long.js';
import { ROOF_DEFAULTS } from './roof-params.js';
import { MANSARD_SCHEMES } from './roof-mansard.js';

const EPS = 1e-6;
export const AUDIT_GROUPS = {
  X:{n:'Целостность',c:'#7fb2d8'}, M:{n:'Геометрия',c:'#e0913f'},
  S:{n:'Несущая способность',c:'#f4645f'}, P:{n:'Опоры и стыки',c:'#a3e635'},
  N:{n:'Мансарда',c:'#b07cf0'}, C:{n:'Ведомость и раскрой',c:'#4cc9f0'}, R:{n:'Сцена',c:'#fbbf24'}
};
const grp = id => (id && AUDIT_GROUPS[id[0]]) ? id[0] : 'X';
const ok = (id,name,pass,detail) => ({ id, name, pass:!!pass, detail:detail||'', group:grp(id) });
const skip = (id,name,detail) => ({ id, name, pass:true, skipped:true, detail:detail||'', group:grp(id) });

export function deriveAll(params){
  const model=computeRoofModel(params);
  const structure=computeRoofStructure(params,model);
  const pieces=computeRoofPieces(params,model);
  const plan=planLongMembers(model,params,pieces);
  const nesting=nestRoofPieces(pieces,params);
  return {model,structure,pieces,plan,nesting,params};
}
const tagRu = t => t==='lower'?'низ':t==='upper'?'верх':'скат';
const pct = v => `${Math.round(v*100)}%`;

export function auditCore(params){
  const R=[]; let d;
  try { d=deriveAll(params); }
  catch(e){ return [ok('X00','Ядро считается без исключения',false,String(e&&e.message||e))]; }
  const {model:m,structure:S,pieces,plan:LP,nesting:NS}=d;
  const MS=m.mansardOn?m.mansard:null;

  const wantType=m.mansardOn?'gable':(params.type==='hip'?'hip':'gable');
  R.push(ok('X01','Форма модели совпадает с запросом',m.type===wantType,`запрошено ${wantType}, построено ${m.type}`));
  R.push(ok('X02','Число скатов соответствует форме',
    MS&&MS.scheme==='broken'?m.faces.length===4:m.type==='hip'?m.faces.length===4:m.faces.length===2,`скатов ${m.faces.length}`));
  const bad=Object.entries(m).filter(([,v])=>typeof v==='number'&&!Number.isFinite(v)).map(([k])=>k);
  R.push(ok('M01','Числовые поля модели конечны',!bad.length,bad.join(', ')));
  R.push(ok('M02','Площадка врубки не шире мауэрлата',m.seatW<=m.pw+EPS,`seatW=${(m.seatW*1000)|0} pw=${(m.pw*1000)|0}`));
  R.push(ok('M03','Врубка не глубже ¼ сечения',m.notchRatio<=.2501,`${(m.notchRatio*100).toFixed(1)}%`));
  R.push(ok('M04','Седло бруска выше нуля',m.seatMode==='notch'||m.blockFloorY>.005,
    m.seatMode==='notch'?'режим запил — бруска нет':`floor=${(m.blockFloorY*1000)|0} мм`));
  R.push(ok('M05','Прогон перекрывает вертикальный рез',m.bh>=m.plumbH-EPS,`bh=${(m.bh*1000)|0} plumb=${(m.plumbH*1000)|0}`));
  R.push(ok('M06','Лежень только под стойками и покрывает их',
    !m.postZ.length||(m.sleeperLen>0&&m.postZ.every(z=>Math.abs(z-m.sleeperZ)<=m.sleeperLen/2+EPS)),
    `len=${m.sleeperLen.toFixed(2)} posts=${m.postZ.length}`));
  R.push(ok('M07','Стойки конька над несущей стеной',m.postZ.every(z=>Math.abs(z)<=m.length/2+EPS)));
  R.push(ok('M08','Пирог обрезан по лобовой доске',m.faces.every(f=>f.rlPie>f.rl*.5&&f.rlPie<=f.rl+.3+EPS)));
  R.push(ok('M09','Накосные: up перпендикулярен оси',m.hips.every(h=>Math.abs(h.up.dot(h.axis))<1e-5)));
  R.push(ok('M10','Базисы скатов ортонормированы',m.faces.every(f=>{const b=f.basis;
    return Math.abs(b.X.dot(b.Y))<1e-5&&Math.abs(b.X.dot(b.Z))<1e-5&&Math.abs(b.Y.dot(b.Z))<1e-5;})));
  R.push(ok('M11','Стропила в границах своего ската',m.rafters.every(r=>r.x0>=-EPS&&r.len>0&&r.x0+r.len<=r.f.rl+1e-4)));
  R.push(ok('M12','Полуноги с косым резом конечны',
    m.rafters.filter(r=>r.cheek).every(r=>[r.cheek.xA0,r.cheek.xA1,r.cheek.xB0,r.cheek.xB1].every(Number.isFinite))));
  R.push(ok('M13','Распор воспринимается',m.thrustOk));
  R.push(ok('M14','Нагрузка учитывает фактическое утепление',
    !m.mansardOn||(Math.abs(m.deadKN-m.deadKg*9.81/1000)<1e-9&&m.insulMM>=250),`${m.deadKg.toFixed(1)} кг/м² · утепл. ${m.insulMM} мм`));
  R.push(ok('M15','У каждого ската своя геометрия',
    m.faces.every(f=>Number.isFinite(f.rl)&&Number.isFinite(f.ta)&&Number.isFinite(f.rlPie)&&f.rl>.3),
    m.faces.map(f=>`${f.tag}:${f.rl.toFixed(2)}м/${f.deg.toFixed(0)}°`).join(' ')));
  R.push(ok('M16','Объём пиломатериала конечен и положителен',Number.isFinite(m.wood)&&m.wood>0,`${m.wood.toFixed(2)} м³`));

  if(m.tieMode==='side'&&!m.mansardOn){
    R.push(ok('S01','Болты ригеля размещаются',S.boltOk,S.boltReason));
    if(S.boltLayout&&S.boltLayout.ok){
      R.push(ok('S02','Болты внутри ригеля с отступами',S.boltLayout.positions.every(q=>
        q.y>=m.tieY+S.a4/1000-1e-4&&q.y<=m.tieY+m.th-S.a4/1000+1e-4)));
      R.push(ok('S03','Болты внутри стропилы с отступами',S.boltLayout.positions.every(q=>{
        const rb=m.apex-q.x*m.ta;
        return q.y>=rb+S.a4/1000/m.ca-1e-3&&q.y<=rb+m.rd/m.ca-S.a4/1000/m.ca+1e-3;})));
    }
  }
  const rafterNote=`${S.sectMM.join('×')} · ${S.G.n} · уклон ${S.slopeDeg.toFixed(0)}° · μ=${S.mu.toFixed(2)}`;
  if(S.skipRafter){
    R.push(skip('S04','Стропило по изгибу','ферма заводская — хорды считает завод'));
    R.push(skip('S05','Прогиб стропил','ферма заводская — прогиб считает завод'));
    R.push(skip('S06','Смятие на опоре','ферма заводская — опорный узел завода'));
  } else {
    R.push(ok('S04','Стропило по изгибу',S.utilR<=1,`${pct(S.utilR)} · пролёт ${S.runHoriz.toFixed(2)} м · ${rafterNote}`));
    R.push(ok('S05','Прогиб стропил',S.utilD<=1,`${S.defl.toFixed(1)} / ${S.deflLim.toFixed(1)} мм · q⊥=q·cos²α`));
    R.push(ok('S06','Смятие на опоре',S.utilSm<=1,`${S.smB.toFixed(2)} / ${S.G.Rsm} МПа`));
  }
  R.push(ok('S07','Болты ригеля по срезу',S.utilB<=1,pct(S.utilB)));
  R.push(ok('S08','Ригель по чистому сечению',S.utilT<=1,pct(S.utilT)));
  R.push(ok('S09','Пролёт учитывает прогоны',
    m.mansardOn||!purlinXs(m,params).length||S.runHoriz<(m.half-m.pw/2)-.2,
    `опор ${Array.isArray(S.supports)?S.supports.length:S.supports}, пролёт ${S.runHoriz.toFixed(2)} м`));
  R.push(ok('S10','Прогиб согласован с моментом',
    S.skipRafter||Math.abs((S.qPair*S.caS*S.caS)*Math.pow(S.runHoriz/S.caS,2)/8-S.M)<1e-6,'q⊥·Ls²/8 = q·Lh²/8'));

  const usable=NS.usable;
  const longR=m.rafters.filter(r=>!r.jack&&Math.round(r.len*1000)+params.allow>usable);
  const bySup=LP.strategy==='support'||LP.strategy==='splice';
  R.push(ok('P01','Длинная стропила имеет стык или заказанную длину',
    m.mansardOn||!bySup||!longR.length||longR.every(r=>(r.joints||[]).length>0),
    `длинных ${longR.length}, со стыком ${longR.filter(r=>(r.joints||[]).length).length}`));
  const purByFace=new Map();
  LP.purlins.forEach(q=>{if(!purByFace.has(q.fi))purByFace.set(q.fi,[]);purByFace.get(q.fi).push(q.X);});
  R.push(ok('P02','Каждый стык лежит на прогоне',m.rafters.every(r=>(r.joints||[]).every(j=>
    (purByFace.get(r.fi)||[]).some(X=>Math.abs(X-j.X)<1e-4)))));
  const nJ=m.rafters.reduce((s,r)=>s+(r.joints||[]).length,0);
  const nk=pieces.find(x=>x.code&&x.code.startsWith('NK-'));
  R.push(ok('P03','Накладки стыков есть в ведомости',nJ===0||!!nk,nJ?`стыков ${nJ}, накладок ${nk?nk.qty:0}`:'стыков нет'));
  R.push(ok('P04','Накладок ровно 2 на стык',!nk||nk.qty===nJ*2,`${nk?nk.qty:0} / ${nJ*2}`));
  R.push(ok('P05','Болтов не меньше 4 на стык',!nJ||(m.rafters.find(r=>(r.joints||[]).length)||{joints:[{bolts:0}]}).joints[0].bolts>=4));
  R.push(ok('P06','Под стойкой на подкладке есть подкладка',
    LP.posts.every(q=>!q.onPad||LP.pads.some(pd=>Math.abs(pd.x-q.x)<1e-4&&Math.abs(pd.z-q.z)<1e-4)),
    `стоек ${LP.posts.length}, подкладок ${LP.pads.length}`));
  const held=q=>(q.onPad&&q.bottom>.05)||(!q.onPad&&m.joistsOn);
  const fl=LP.posts.filter(q=>!held(q));
  R.push(ok('P07','Стойка стоит на опоре: подкладка или балка',!fl.length,
    `на подкладке ${LP.posts.filter(q=>q.onPad).length}, на балке ${LP.posts.filter(q=>!q.onPad).length}`+(fl.length?`, висит ${fl.length}`:'')));
  R.push(ok('P08','Подкладка перекрывает ≥2 балки',LP.pads.every(q=>q.len>=2*m.step-EPS)));
  R.push(ok('P09','Стойки и подкладки внутри контура',
    [...LP.posts,...LP.pads].every(q=>Math.abs(q.x)<=m.span/2+EPS&&Math.abs(q.z)<=m.length/2+EPS)));
  const hipLimit=LP.glulam?6.0:3.6;
  const longHips=m.hips.map((h,i)=>({h,i})).filter(o=>o.h.full>=hipLimit);
  const withSup=new Set(LP.shprengels.map(q=>q.hi));
  R.push(ok('P10','Шпренгель на каждом длинном накосном',longHips.every(o=>withSup.has(o.i)),
    `длинных ${longHips.length}, со шпренгелем ${withSup.size}`));
  R.push(ok('P11','Шпренгель опёрт обоими концами на мауэрлат',LP.shprengels.every(q=>{
    const onX=p=>Math.abs(Math.abs(p.x)-m.span/2)<.02&&Math.abs(p.z)<=m.length/2+EPS;
    const onZ=p=>Math.abs(Math.abs(p.z)-m.length/2)<.02&&Math.abs(p.x)<=m.span/2+EPS;
    return (onX(q.a)||onZ(q.a))&&(onX(q.b)||onZ(q.b));})));
  R.push(ok('P12','Шпренгель под накосным, стойка если нужна',LP.shprengels.every(q=>
    q.beamY>.02&&(!q.post||(q.post.bottom>.05&&q.post.top>q.post.bottom+.2))),
    `без стойки (прямое опирание): ${LP.shprengels.filter(q=>!q.post).length}`));
  R.push(ok('P13','Прогоны в границах ската',LP.purlins.every(q=>q.len>0&&q.len<=2*m.zHalf(m.faces[q.fi],q.X)+EPS)));
  const supMarks=LP.supportPieces.map(x=>x.mark);
  R.push(ok('P14','Опорные детали имеют марки в ведомости',supMarks.every(mk=>pieces.some(x=>x.mark===mk)),`марок ${supMarks.length}`));
  R.push(ok('P15','Марки опорных деталей уникальны',new Set(supMarks).size===supMarks.length));

  if(MS){
    R.push(ok('N01','Схема мансарды распознана',!!MANSARD_SCHEMES[MS.scheme],MS.scheme));
    R.push(ok('N02','В комнате нет центральных стоек',m.postZ.length===0,`стоек ${m.postZ.length}`));
    R.push(ok('N03','Нет прогонов со стойками внутри комнаты',LP.purlins.length===0&&LP.posts.length===0,
      `прогонов ${LP.purlins.length}, стоек ${LP.posts.length}`));
    R.push(ok('N04','Шпренгели исключены (двускатная схема)',LP.shprengels.length===0&&m.hips.length===0));
    R.push(ok('N05','Балки перекрытия обязательны как нижняя затяжка',m.joistsOn===true));
    R.push(ok('N06','Утепление мансарды не ниже 250 мм',m.warm&&m.insulMM>=250,`${m.insulMM} мм`));
    R.push(ok('N07','Ригель/затяжка присутствует',m.tieZ.length>0,`шт ${m.tieZ.length}`));
    R.push(ok('N08','Усилие в затяжке посчитано',Number.isFinite(MS.tieN)&&MS.tieN>=0,`${MS.tieN.toFixed(1)} кН`));
    R.push(ok('N09','Высота мансарды пригодна для жилья',MS.roomHeight>=2.3,
      `${MS.roomHeight.toFixed(2)} м до ${MS.ceilFlat?'плоского потолка':'конька'}`+(MS.roomHeight>4.5?' · объём под антресоль':'')));
    R.push(ok('N10','Полезная ширина при 2.0 м не меньше 2.5 м',MS.usableWidth>=2.5,
      `${MS.usableWidth.toFixed(2)} м · площадь ${MS.usableArea.toFixed(1)} м²`));
    R.push(ok('N11','Ломаный скат даёт четыре ската',
      MS.scheme!=='broken'||(m.faces.length===4&&m.faces.filter(f=>f.tag==='upper').length===2&&m.faces.filter(f=>f.tag==='lower').length===2),
      `upper ${m.faces.filter(f=>f.tag==='upper').length}, lower ${m.faces.filter(f=>f.tag==='lower').length}`));
    R.push(ok('N12','Нижний скат круче верхнего',MS.scheme!=='broken'||MS.lowA>MS.highA,
      `${MS.lowDeg.toFixed(0)}° / ${MS.highDeg.toFixed(0)}°`));
    if(MS.scheme==='ridge'){
      R.push(ok('N13','Коньковый прогон подобран и проходит',!!MS.ridgeBeam&&MS.ridgeBeam.ok,
        MS.ridgeBeam?`${MS.ridgeBeam.sect.join('×')} · σ=${MS.ridgeBeam.sigma.toFixed(1)} МПа · f=${MS.ridgeBeam.defl.toFixed(0)}/${MS.ridgeBeam.deflLim.toFixed(0)} мм · h/b ${MS.ridgeBeam.hb}`:'не подобран'));
      R.push(ok('N14','Прогон опирается только на фронтоны',m.postZ.length===0&&LP.posts.length===0));
      R.push(ok('N17','Стропила из массива, не клеёные',S.G.n.indexOf('Клеёная')<0,S.G.n));
      R.push(ok('N22','Пропорция прогона h/b не выше 4.5',!!MS.ridgeBeam&&MS.ridgeBeam.hb<=4.5,MS.ridgeBeam?`h/b ${MS.ridgeBeam.hb}`:'—'));
    } else {
      R.push(ok('N13','Затяжка проходит по растяжению',MS.tieUtil<=1,`${MS.tieSigma.toFixed(2)} МПа · загрузка ${pct(MS.tieUtil)}`));
      const bt=S.bottomTie;
      R.push(ok('N14','Нижняя затяжка (балки) проходит',!bt||bt.util<=1,bt?`${bt.N.toFixed(1)} кН · ${pct(bt.util)}`:'распор воспринимает прогон'));
    }
    R.push(ok('N15','Длинная стропила решается заготовкой, не стойкой',
      !longR.length||LP.orderStock>params.stock||LP.glulam,`заготовка ${LP.orderStock} мм`));
    const caseStr=(MS.checks||[]).map(c=>`${tagRu(c.tag)}${c.deg!=null?' '+c.deg.toFixed(0)+'°':''} σ${pct(c.utilR)} f${pct(c.utilD)}`).join(' · ');
    R.push(ok('N16','Сечение стропил подобрано минимальным проходящим',
      !MS.autoPicked||(MS.checks||[]).every(c=>c.ok),
      `${(MS.requestedSect||[]).join('×')} → ${(MS.finalSect||[]).join('×')}${caseStr?' · '+caseStr:''}`));
    if(MS.scheme==='truss'){
      R.push(ok('N18','Данные фермы переданы заводу',Number.isFinite(MS.trussDepth)&&MS.trussDepth>0&&Number.isFinite(MS.trussLoad),
        `пролёт ${(2*m.half).toFixed(1)} м · высота ≈${MS.trussDepth} мм · ${MS.trussLoad.toFixed(2)} кН/м`));
      R.push(ok('N20','Сечение хорд не раздувается автоподбором',
        MS.autoPicked===false&&(MS.finalSect||[]).join('×')===(MS.requestedSect||[]).join('×'),
        `задано ${(MS.requestedSect||[]).join('×')}, в модели ${(MS.finalSect||[]).join('×')}`));
    }
    R.push(ok('N19','Снег взят по фактическому уклону ската',
      MS.scheme!=='broken'||m.faces.filter(f=>f.tag==='lower').every(f=>f.mu===0),
      MS.scheme==='broken'?`низ ${MS.lowDeg.toFixed(0)}° μ=${m.faces.find(f=>f.tag==='lower').mu.toFixed(2)}`:'один уклон'));
    R.push(ok('N21','Ригель выше прогона и не касается его',
      MS.scheme!=='broken'||(m.tieY-MS.breakY)>-1e-6,
      `низ ригеля ${m.tieY.toFixed(3)} · верх прогона ${MS.breakY.toFixed(3)}`));
    R.push(ok('N25','Ригель прошит в стропило, а не в прогон',
      MS.scheme!=='broken'||(m.msTieBolts||[]).length>=1,
      `болтов на конец ${(m.msTieBolts||[]).length}`));
    const withMk=(MS.parts||[]).filter(q=>Array.isArray(q.mk));
    const inCut=withMk.every(q=>pieces.some(x=>x.g===q.mk[0]&&Math.abs(x.len-q.mk[1])<.02));
    R.push(ok('N23','Члены мансарды попали в ведомость',inCut,`${withMk.length} членов с маркой`));
    R.push(ok('N24','Ферма над потолком размещена где задумана',
      !MS.hasUpper||m.upperZ.length>0,`узлов ${m.upperZ.length}, нужно ${MS.hasUpper?'да':'нет'}`));
  }

  R.push(ok('C01','Детали положительной длины и количества',pieces.every(x=>x.len>0&&x.qty>0&&x.cutLen>0)));
  R.push(ok('C02','Марки деталей уникальны',new Set(pieces.map(x=>x.mark)).size===pieces.length));
  R.push(ok('C03','Штрихкоды совместимы с Code 39',pieces.every(x=>/^[A-Z0-9\-. ]+$/.test(x.code))));
  R.push(ok('C04','Отход раскроя в разумных пределах',NS.waste>=-EPS&&NS.waste<.6,`${(NS.waste*100).toFixed(1)}%`));
  const qty=pieces.reduce((s,x)=>s+x.qty,0);
  const nq=NS.bins.reduce((s,b)=>s+b.items.length,0)+NS.over.length;
  R.push(ok('C05','Раскрой содержит все детали',qty===nq,`${nq} / ${qty}`));
  R.push(ok('C06','Опорные детали попали в раскрой',LP.supportPieces.every(x=>
    NS.bins.some(b=>b.items.some(i=>i.mark===x.mark))||NS.over.some(o=>o.mark===x.mark))));
  R.push(ok('C07','Стык длинной стропилы не в пролёте',
    !NS.over.some(o=>o.group==='rafter')||bySup||LP.strategy==='order'||LP.glulam||m.mansardOn));
  return R;
}

export function auditScene(THREE, root, model, pieces, plan, params, hwErrors, info){
  const R=[];
  if(!root) return [ok('R00','Сцена построена',false,'root отсутствует')];
  R.push(ok('R00','Сборка без внутренних ошибок',!hwErrors||!hwErrors.length,(hwErrors||[]).join(' | ')));
  const meshes=[],instanced=[],groups=[];
  root.traverse(o=>{
    if(o.isInstancedMesh) instanced.push(o);
    else if(o.isMesh) meshes.push(o);
    else if(o.isGroup&&o!==root&&!o.userData.layerId) groups.push(o);
  });
  R.push(ok('R01','В сцене есть геометрия',meshes.length+instanced.length>0,`${meshes.length} mesh / ${instanced.length} instanced`));
  let nan=0;
  meshes.forEach(o=>{const a=o.geometry&&o.geometry.attributes&&o.geometry.attributes.position;
    if(!a){nan++;return;} for(let i=0;i<a.array.length;i++) if(!Number.isFinite(a.array[i])){nan++;break;}});
  R.push(ok('R02','Нет NaN в геометрии',nan===0,`${nan} повреждённых`));
  R.push(ok('R03','Каждый элемент приписан к этапу',meshes.every(o=>o.userData.st!==undefined),
    `${meshes.filter(o=>o.userData.st===undefined).length} без этапа`));
  const marks=new Set(pieces.map(x=>x.mark));
  const badMark=meshes.filter(o=>o.userData.mk&&!marks.has(o.userData.mk));
  R.push(ok('R04','Марки на элементах есть в ведомости',!badMark.length,
    [...new Set(badMark.map(o=>o.userData.mk))].slice(0,6).join(', ')));
  R.push(ok('R05','Нет пустых групп (кроме слоёв)',groups.every(g=>g.children.length>0),
    `${groups.filter(g=>!g.children.length).length} пустых`));
  const badInst=instanced.filter(o=>{ if(!o.count) return true;
    const a=o.instanceMatrix.array; for(let i=0;i<a.length;i++) if(!Number.isFinite(a[i])) return true; return false; });
  R.push(ok('R06','Инстансы крепежа корректны',!badInst.length,`${badInst.length} битых`));
  const hwCount=instanced.reduce((s,o)=>s+o.count,0)+meshes.filter(o=>o.userData.hw).length;
  R.push(ok('R07','Крепёж построен',!params.fix||hwCount>0,`${hwCount} элементов`));

  const boxes=[];
  meshes.forEach(o=>{ if(o.userData.hw) return;
    o.updateWorldMatrix(true,false);
    const b=new THREE.Box3().setFromObject(o);
    if(!b.isEmpty()) boxes.push({o,b,s:b.getSize(new THREE.Vector3())}); });

  /* Вертикальная опора — только действительно стоячий элемент.
     Крутая контробрешётка/стропило на 62° имеет большой Δx и
     больше не принимается за висящую стойку. */
  const isVert = e => e.o.userData.vertSupport === true ||
    (e.s.y > .3 && e.s.x < .26 && e.s.z < .26 && e.s.y > e.s.x*3 && e.s.y > e.s.z*3);
  const posts = boxes.filter(isVert), floating=[];
  posts.forEach(({o,b})=>{
    const cx=(b.min.x+b.max.x)/2, cz=(b.min.z+b.max.z)/2, bottom=b.min.y;
    if(bottom<=-2.9) return;
    const held=boxes.some(({o:other,b:ob,s})=>{
      if(other===o) return false;
      if(s.y>.3&&s.x<.26&&s.z<.26&&s.y>s.x*3&&s.y>s.z*3) return false;
      if(Math.abs(ob.max.y-bottom)>.08) return false;
      return cx>=ob.min.x-.05&&cx<=ob.max.x+.05&&cz>=ob.min.z-.05&&cz<=ob.max.z+.05;
    });
    if(!held) floating.push(`${o.userData.mk||o.userData.msPart||'?'}@(${cx.toFixed(2)},${cz.toFixed(2)})`);
  });
  R.push(ok('R08','Ни одна опора не висит в воздухе',!floating.length,
    `${floating.length} из ${posts.length}${floating.length?': '+floating.slice(0,5).join(' '):''}`));

  const expect=new Set();
  model.rafters.forEach((r,ri)=>(r.joints||[]).forEach(j=>expect.add(ri+':'+j.X.toFixed(4))));
  if(expect.size){
    const got=new Set(meshes.filter(o=>o.userData.joint).map(o=>o.userData.joint));
    const missing=[...expect].filter(k=>!got.has(k));
    R.push(ok('R09','Накладка стоит на каждом стыке',!missing.length,`${missing.length} из ${expect.size} без накладки`));
  }
  const sunk=meshes.filter(o=>{o.updateWorldMatrix(true,false);
    const b=new THREE.Box3().setFromObject(o); return !b.isEmpty()&&b.max.y<-3.25;});
  R.push(ok('R10','Ничего не провалилось ниже площадки',!sunk.length,`${sunk.length}`));

  if(model.mansardOn&&info&&info.mansard){
    const MS=model.mansard, mi=info.mansard;
    const knee=meshes.filter(o=>o.userData.knee);
    R.push(ok('R11','Аттиковая стенка отрисована',MS.kneeTop<=.05||knee.length>=2,`${knee.length} стенок при аттике ${MS.kneeTop.toFixed(2)} м`));
    const caps=meshes.filter(o=>o.userData.kneeCap);
    R.push(ok('R12','Верхний мауэрлат стенки на месте',MS.kneeTop<=.05||caps.length>=2,`${caps.length} мауэрлатов`));
    const bp=meshes.filter(o=>o.userData.breakPurlin);
    R.push(ok('R13','Прогоны перелома отрисованы',MS.scheme!=='broken'||bp.length===2,`${bp.length} прогонов перелома`));
    if(MS.scheme==='broken'&&bp.length){
      const tops=bp.map(o=>{o.updateWorldMatrix(true,false);return new THREE.Box3().setFromObject(o).max.y;});
      R.push(ok('R14','Прогон перелома точно под изломом',tops.every(y=>Math.abs(y-MS.breakY)<.02),
        `верх ${tops.map(y=>y.toFixed(3)).join(' / ')} · перелом ${MS.breakY.toFixed(3)}`));
    }
    const mt=meshes.filter(o=>o.userData.mansardTie);
    R.push(ok('R15','Ригель мансарды отрисован',mt.length===model.tieZ.length,`${mt.length} ригелей при ${model.tieZ.length} по плану`));
    if(MS.scheme==='broken'&&mt.length)
      R.push(ok('R16','Ригель накладной над прогоном, потолок по ригелю',
        mt.every(o=>o.userData.tieTop>MS.breakY+1e-3),
        `верх ригеля ${mt[0].userData.tieTop.toFixed(3)} · верх прогона ${MS.breakY.toFixed(3)}`));
    const rb=meshes.filter(o=>o.userData.ridgeBeam);
    R.push(ok('R17','Коньковый прогон отрисован нужным сечением',
      rb.length===1&&rb[0].userData.sect.join('×')===model.ridgeBeamSect.join('×'),
      rb.length?`${rb[0].userData.sect.join('×')} · план ${model.ridgeBeamSect.join('×')}`:'прогон не найден'));
    if(MS.scheme==='ridge'){
      const gb=meshes.filter(o=>o.userData.gableBearing);
      R.push(ok('R18','Опирание прогона только на фронтоны',gb.length===2,`${gb.length} опорных площадок`));
    }
    const webs=meshes.filter(o=>o.userData.trussWeb||o.userData.tieBrace);
    const kings=meshes.filter(o=>o.userData.upperKing||o.userData.tieKing);
    const ceil=meshes.filter(o=>o.userData.trussCeiling);
    const plates=meshes.filter(o=>o.userData.trussPlate);
    const needUpper=MS.hasUpper;
    R.push(ok('R19','Решётка над потолком отрисована',
      !needUpper||(webs.length>0&&(kings.length>0||MS.scheme==='truss')),
      `${webs.length} раскосов · ${kings.length} бабок · ${ceil.length} поясов · ${plates.length} пластин`));
    const inRoom=posts.filter(({o,b})=>{
      if(o.userData.knee||o.userData.kneeStud) return false;
      const cx=(b.min.x+b.max.x)/2;
      return Math.abs(cx)<mi.roomHalf-.18&&b.min.y>-.05&&b.max.y<mi.ceilY+.05;
    });
    R.push(ok('R20','В жилой комнате нет колонн',!inRoom.length,`${inRoom.length} внутри контура ${mi.roomHalf.toFixed(2)} м`));
    const covers=meshes.filter(o=>o.userData.faceTag&&o.userData.st===12);
    R.push(ok('R21','Покрытие построено на каждом скате',covers.length===model.faces.length,
      `${covers.length} скатов покрытия при ${model.faces.length} скатах`));
    const culled=meshes.filter(o=>o.userData.culled);
    R.push(ok('R22','Ничего не снято страховкой контура',!culled.length,
      culled.length?[...new Set(culled.map(o=>o.userData.msPart))].join(', '):'все члены внутри контура'));
  }
  return R;
}

export const AUDIT_MATRIX = [
  { name:'Двускатная 8×10, базовая', p:{type:'gable'} },
  { name:'Двускатная 8×10, запил', p:{type:'gable',seat:'notch'}, expect:['M03'] },
  { name:'Двускатная 8×10, прибоины', p:{type:'gable',seat:'cleat'} },
  { name:'Двускатная 14×18, длинные', p:{type:'gable',span:14,length:18,rafter:'60x250'} },
  { name:'Вальма 8×10', p:{type:'hip'} },
  { name:'Вальма 8×10, крутая 42°', p:{type:'hip',pitch:42} },
  { name:'Вальма 14×18, длинные стропила', p:{type:'hip',span:14,length:18,rafter:'50x250'} },
  { name:'Вальма 6.5×6.5, шатёр', p:{type:'hip',span:6.5,length:6.5} },

  { name:'Мансарда · ломаный скат 8×10', p:{type:'gable',mansard:1,mansardScheme:'broken',span:8,length:10} },
  { name:'Мансарда · ломаный, аттик 1.2 м', p:{type:'gable',mansard:1,mansardScheme:'broken',mansardKnee:1.2,span:8,length:10} },
  { name:'Мансарда · ломаный, низ 70°', p:{type:'gable',mansard:1,mansardScheme:'broken',mansardLowPitch:70,mansardHighPitch:22,span:9,length:12} },
  { name:'Мансарда · ломаный, узкий 6×8', p:{type:'gable',mansard:1,mansardScheme:'broken',span:6,length:8} },
  { name:'Мансарда · ломаный, без автоподбора', p:{type:'gable',mansard:1,mansardScheme:'broken',mansardAutoSection:0,rafter:'50x250',span:8,length:10} },
  { name:'Мансарда · ломаный, аттик 0', p:{type:'gable',mansard:1,mansardScheme:'broken',mansardKnee:0,span:7,length:9} },
  { name:'Мансарда · висячие с затяжкой 6×8', p:{type:'gable',mansard:1,mansardScheme:'tie',span:6,length:8,pitch:45,mansardKnee:1.0} },
  { name:'Мансарда · прогон на фронтонах 8×6', p:{type:'gable',mansard:1,mansardScheme:'ridge',span:8,length:6,pitch:38,mansardKnee:1.2} },
  { name:'Мансарда · прогон на фронтонах 8×10', p:{type:'gable',mansard:1,mansardScheme:'ridge',span:8,length:10,pitch:38,mansardKnee:1.2} },
  { name:'Мансарда · ферма 10×12', p:{type:'gable',mansard:1,mansardScheme:'truss',span:10,length:12,mansardKnee:1.4} },

  { name:'Тёплая кровля 250 мм (не мансарда)', p:{type:'hip',insul:250} },
  { name:'Тёплая кровля 300 мм (не мансарда)', p:{type:'hip',insul:300} },
  { name:'Ригель снизу', p:{type:'hip',tieMode:'under'} },
  { name:'Ригель М20 ×2', p:{type:'hip',boltD:20,boltN:2} },
  { name:'Ригель М10 ×8 в две стороны', p:{type:'hip',boltD:10,boltN:8,tieSides:2} },
  { name:'Висячая схема без врубки', p:{type:'hip',scheme:'vis',seat:'block'} },
  { name:'Заготовка 4000, стратегия прогон', p:{type:'gable',stock:4000,span:12,length:14} },
  { name:'Заготовка 4000, стратегия заказ', p:{type:'gable',stock:4000,span:12,longStrategy:'order'}, expect:['S04','S05'] },
  { name:'Заготовка 4000, клеёнка', p:{type:'gable',stock:4000,span:12,longStrategy:'glulam'}, expect:['S05'] },
  { name:'Фальц, сплошной настил', p:{type:'hip',cover:'seam'} },
  { name:'Гибкая черепица, уклон 14°', p:{type:'hip',cover:'shingle',pitch:14} },
  { name:'Профлист, уклон 10°', p:{type:'hip',cover:'prof',pitch:10} },
  { name:'Без крепежа', p:{type:'hip',fix:0} },
  { name:'Без балок перекрытия', p:{type:'hip',joists:0} },
  { name:'Снег VIII, 3 сорт', p:{type:'hip',snowZone:'VIII',grade:'3'}, expect:['S04','S05','S06'] }
];

export function auditConfig(c, makeScene){
  const params={...ROOF_DEFAULTS,...c.p};
  const expect=new Set(c.expect||[]);
  const core=auditCore(params);
  let scene=[],resolved=null;
  try { resolved=deriveAll(params); } catch { /* отмечено в core */ }
  if(makeScene){
    if(c.coreOnly) scene=[skip('R—','Сцена пропущена',c.coreReason||'схема пока без отрисовки')];
    else { try { scene=makeScene(params); }
      catch(e){ scene=[ok('R00','Сцена собирается без исключения',false,String(e&&e.message||e))]; } }
  }
  const all=[...core,...scene].map(x=>({...x,expected:!x.pass&&expect.has(x.id)}));
  const form=params.mansard?'mansard':(params.type==='hip'?'hip':'gable');
  return { name:c.name, params, form, coreOnly:!!c.coreOnly, all, resolved,
    bugs:all.filter(x=>!x.pass&&!x.expected&&!x.skipped).length,
    violations:all.filter(x=>!x.pass&&x.expected).length,
    skipped:all.filter(x=>x.skipped).length,
    passed:all.filter(x=>x.pass&&!x.skipped).length };
}
export function runMatrix(makeScene){ return AUDIT_MATRIX.map(c=>auditConfig(c,makeScene)); }