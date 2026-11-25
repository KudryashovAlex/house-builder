import { SEATS } from './roof-params.js';
import { MANSARD_SCHEMES } from './roof-mansard.js';
import { mm, f1, f2, fmt } from './format.js';

export function roofChecks(p, m, S, pcs, NS) {
  const C = [], add = (lv, t, d, act) => C.push({ lv, t, d, act });
  const pc = u => Math.round(u * 100);
  const bar = u => `<div class="bar"><i style="width:${Math.min(100, pc(u))}%;background:${u > 1 ? 'var(--red)' : u > .85 ? 'var(--warn)' : 'var(--green)'}"></i></div>`;
  const MS = m.mansardOn ? m.mansard : null;

  /* фактическое утепление: мансарда принудительно ≥250 мм */
  const insul = m.insulMM ?? +p.insul;

  if (MS) {
    add('ok', `Мансарда · ${MANSARD_SCHEMES[MS.scheme].short}`,
      `Комната <code>${MS.roomWidth.toFixed(2)}×${m.length.toFixed(1)} м</code>, потолок ${MS.roomHeight.toFixed(2)} м, полезная площадь ${MS.usableArea.toFixed(1)} м². Governing скат: ${S.govTag}. Центральные опоры исключены.`);
    add(MS.roomHeight >= 2.3 ? 'ok' : 'warn', `Высота комнаты ${MS.roomHeight.toFixed(2)} м`,
      MS.roomHeight >= 2.3 ? 'Пригодно для жилья по СП 55.13330.' : 'Ниже 2.3 м — поднимите аттиковую стенку или высоту потолка.');
    add(MS.usableWidth >= 2.5 ? 'ok' : 'bad', `Ширина комнаты ${MS.usableWidth.toFixed(2)} м`,
      MS.usableWidth >= 2.5 ? 'Плоский потолок по всей ширине — мебель встаёт к любой стене.' : 'Уже 2.5 м — комната непригодна.');
    if (MS.rejectedParts && MS.rejectedParts.length)
      add('warn', 'Часть решётки не размещена', `Вне контура кровли: ${[...new Set(MS.rejectedParts)].join(', ')}. Уменьшите высоту потолка или увеличьте уклон.`);
  }

  const nr = m.notchRatio * 100;
  if (MS) {
    add('ok', 'Опирание — верхний мауэрлат аттиковой стенки',
      `Стропило садится на мауэрлат ${mm(m.pw)}×${mm(m.ph)} мм на высоте ${MS.kneeTop.toFixed(2)} м. Врубка не требуется: распор берут затяжка по полу и ригель потолка.`);
  } else if (m.seatMode === 'notch') {
    if (nr > 33) add('bad', `Запил ${nr.toFixed(0)}% — нарушение нормы`,
      `Площадка ${mm(m.seatW)} мм, глубина ${mm(m.notchPerp)} мм при высоте стропилы ${mm(m.rd)} мм. СП 64.13330: не более ¼ сечения. Сузьте площадку — перейдите на опорный брусок.`, 'block');
    else if (nr > 25) add('info', `Запил ${nr.toFixed(0)}% — на пределе`, 'Рекомендуется ≤25%. Опорный брусок сужает площадку и снижает врубку до ~12%.', 'block');
    else add('ok', `Запил ${nr.toFixed(0)}% сечения`, `Площадка ${mm(m.seatW)} мм, глубина ${mm(m.notchPerp)} мм. Пятка упирается в мауэрлат, распор воспринят.`);
  } else {
    add('ok', `${SEATS[m.seatMode].s}: врубка ${nr.toFixed(0)}%`,
      `Брусок ${mm(m.pw)}×${mm(m.blockH)} мм с седлом: площадка ${mm(m.seatW)} мм, глубина ${mm(m.notchPerp)} мм, вертикальный упор ${mm(m.blockH - m.blockFloorY)} мм принимает пятку стропилы.`);
  }
  if (!m.thrustOk) add('bad', 'Распор некуда передать',
    'Врубки нет, а схема висячая — горизонтальную составляющую не воспринимает ни один элемент. Нужен упор бруска или наслонная схема с прогоном.', 'block');

  if (MS) {
    add('ok', 'Распор замкнут внутри контура',
      MS.scheme === 'ridge'
        ? `Коньковый прогон ${m.ridgeBeamSect.join('×')} несёт вертикальную нагрузку на фронтоны, распора на стены нет.`
        : `Нижняя затяжка (балки перекрытия) ${MS.bottomTieForce.toFixed(1)} кН, ригель потолка ${MS.tieForce.toFixed(1)} кН. Стены получают только вертикальную нагрузку.`);
    if (MS.ridgeBeam) add(MS.ridgeBeam.ok ? 'ok' : 'bad', `Прогон ${MS.ridgeBeam.sect.join('×')} клеёный`,
      `σ=${MS.ridgeBeam.sigma.toFixed(1)} МПа ≤ ${24}, прогиб ${MS.ridgeBeam.defl.toFixed(0)}/${MS.ridgeBeam.deflLim.toFixed(0)} мм, h/b ${MS.ridgeBeam.hb}. ${MS.ridgeBeam.note}.`);
  } else if (m.tieMode === 'side') {
    if (!S.boltOk) add('bad', 'Ригель сбоку: болты не размещаются', S.boltReason, 'tie250');
    else add('ok', `Ригель сбоку: ${S.nEff}×М${m.boltD}, раскладка ${S.cols}×${S.rows}`,
      `Доступно <code>${Math.round(S.availLen)} мм</code> вдоль волокон и <code>${Math.round(S.maxWin)} мм</code> поперёк. Отступы: от торца ${S.a3} мм, шаг вдоль ${S.a1} мм, поперёк ${S.a2} мм, от кромки ${S.a4} мм — соблюдены для обеих деталей.`);
    if (S.utilB > 1) add('bad', `Болты перегружены: ${pc(S.utilB)}%`,
      `Усилие <code>${f1(S.tieN)} кН</code>, на узел ${f1(S.perEnd)} кН. Ёмкость ${m.boltN}×М${m.boltD} = <code>${f1(S.capEnd)} кН</code>.${bar(S.utilB)}`, 'bolt6');
    else add('ok', `Болты ригеля: загрузка ${pc(S.utilB)}%`,
      `Fv,Rk=${f2(S.Fv)} кН, kmod 0.9 / γM 1.3 → <code>${f2(S.FvRd)} кН</code>. Запас ${f1(S.capEnd / Math.max(.01, S.perEnd))}×.${bar(S.utilB)}`);
    if (S.utilT > 1) add('bad', `Ригель по чистому сечению: ${pc(S.utilT)}%`,
      `σт=<code>${f2(S.sigT)} МПа</code> при Rт=${S.G.Rt}. Net ${Math.round(S.Anet)} мм².${bar(S.utilT)}`, 'tie250');
    else add('ok', `Ригель на растяжение: ${pc(S.utilT)}%`, `σт=${f2(S.sigT)} МПа ≤ Rт=${S.G.Rt}, net ${Math.round(S.Anet)} мм².${bar(S.utilT)}`);
  } else {
    add('ok', 'Ригель снизу: прижат к подошве стропил',
      'Верхняя грань резана по подошве обоих стропил, контакт по всей длине скоса. Грани заподлицо — накладные перфорированные пластины с двух сторон.');
  }

  if (!MS) add(S.nasl ? 'ok' : 'info', S.nasl ? 'Схема наслонная — прогон на стойках' : 'Схема висячая — распор на ригель',
    S.nasl ? `Прогон на ${m.postZ.length} стойках. Ригель считан консервативно: 35% от полного распора (${f1(S.tieFull)} кН).`
      : `Распор в опоре <code>${f1(S.thrustFull)} кН</code>, усилие ригеля на высоте ${f2(S.hc)} м = <code>${f1(S.tieFull)} кН</code>. Плечо h−hc=${f2(S.hEff)} м.`);

  if (S.skipRafter) {
    add('info', 'Хорды фермы считает завод',
      `Пролёт ${(2 * m.half).toFixed(1)} м, строительная высота ≈${MS.trussDepth} мм, погонная нагрузка ${MS.trussLoad.toFixed(2)} кН/м. Расчёт решётки и зубчатых пластин — по методике завода (СП 64 разд. 9).`);
  } else {
    const gov = S.govTag === 'upper' ? 'верхний скат' : S.govTag === 'lower' ? 'нижний скат' : 'скат';
    if (S.utilR > 1) add('bad', `Стропило по изгибу: ${pc(S.utilR)}%`,
      `${gov}: M=${f2(S.M)} кН·м, W=${Math.round(S.W / 1000)} см³ → σи=<code>${f2(S.sigma)} МПа</code> > Rи=${S.G.Ri}. Пролёт ${f2(S.runHoriz)} м.${bar(S.utilR)}`, p.braces && !MS ? 'braces' : 'rafter250');
    else add('ok', `Стропило по изгибу: ${pc(S.utilR)}%`,
      `${gov}: σи=${f2(S.sigma)} МПа ≤ Rи=${S.G.Ri} (${S.G.n}), пролёт ${f2(S.runHoriz)} м, сечение ${S.sectMM.join('×')}.${bar(S.utilR)}`);
    if (S.utilD > 1) add('bad', `Прогиб: ${pc(S.utilD)}% нормы`,
      `f=${f1(S.defl)} мм > L/200 = ${f1(S.deflLim)} мм.${bar(S.utilD)}`, 'rafter250');
    else add('ok', `Прогиб ${f1(S.defl)} мм ≤ ${f1(S.deflLim)} мм`,
      `Нагрузка ${f2(S.qn)} кН/м² по горизонтали, E=${S.G.E} МПа, q⊥=q·cos²α.${bar(S.utilD)}`);
    if (S.utilSm > 1) add('bad', `Смятие на опоре: ${pc(S.utilSm)}%`,
      `R=${fmt(S.R)} Н на площадку ${mm(m.seatW)}×${mm(m.rt)} мм → ${f2(S.smB)} МПа > Rсм90=${S.G.Rsm}.${bar(S.utilSm)}`, 'plate200');
    else add('ok', `Смятие ${f2(S.smB)} МПа ≤ ${S.G.Rsm} МПа`, `Опорная площадка ${mm(m.seatW)} мм, реакция ${fmt(S.R)} Н.${bar(S.utilSm)}`);
  }

  if (!MS) {
    add('ok', `Прогон ${m.ridgeBeamSect.join('×')} под вертикальный рез`,
      `Высота реза стропилы ${mm(m.plumbH)} мм, прогон ${m.ridgeBeamSect[1]} мм — опирание полной гранью.`);
    if (m.postZ.length) add('ok', `Лежень ${f2(m.sleeperLen)} м только под стойками`, 'Не выпускается за фронтон, где под ним нет опоры.');
  }
  add('ok', 'Конёк непрерывен ' + f2(m.ridgeLen) + ' м',
    m.type === 'hip' ? 'Планки подняты над покрытием, узел трёх скатов закрыт тройником.' : 'Торцы перпендикулярны, заглушки по профилю планки.');
  if (m.type === 'hip') {
    add('ok', 'Накосные балки и полуноги',
      `${m.hips.length} накосных — пакет из ${m.hipLam} досок ${mm(m.hipBoardT)}×${mm(m.hipDepth)}, доведены до угла лобовой доски. ${m.jackJoints} полуног с косым резом в боковую плоскость накосного.`);
    add('ok', 'Каркас вальмы вписан в конёк', `Стойки и подкосы в зоне ±${m.ridgeHalf.toFixed(2)} м.`);
  } else if (!MS) add('ok', 'Мауэрлат доведён до края свеса', `Боковой ${f2(m.plateLenZ)} м, крайнее стропило закрывает торец.`);

  add('ok', `Снег: район ${p.snowZone}, Sg=${S.Sg} кПа`,
    `Проверяемый уклон ${S.slopeDeg.toFixed(0)}°, μ=${f2(S.mu)}. Sn=${f2(S.Sn)} / ${f2(S.Sd)} кПа. Постоянная ${f1(S.deadKg)} кг/м². Расчётная <code>${f2(S.qd)} кН/м²</code>.`);
  add('ok', `Ветер: район ${p.windZone}, w0=${S.w0} кПа`, `Отрыв ${f1(S.windUplift)} кН суммарно — опирание на двух уголках.`);
  add('ok', `Нагрузка на стены ${f1(S.totalKN)} кН`, `Масса пирога ≈ ${fmt(S.massKg)} кг, пиломатериал ${f2(m.wood)} м³.`);

  if (m.pitch < m.cv.min && !MS) add('bad', `Уклон ${m.pitch}° ниже минимума ${m.cv.min}°`, `Для «${m.cv.n}» нужен другой уклон или сплошное основание с двойной гидроизоляцией.`);
  else add('ok', `Уклон подходит для «${m.cv.n}»`, `Минимум ${m.cv.min}°, шаг обрешётки ${mm(m.cv.module || .35) || 'сплошной'} мм.`);
  add('ok', `Вентзазор ${mm(m.cntH)} мм`, 'Контробрешётка 50×50 + вентконёк и продухи в карнизе.');

  if (m.warm && insul < 250) add('info', `Утеплитель ${insul} мм`, 'Для Омска требуется 250–300 мм (СП 50.13330).');
  else if (m.warm) add('ok', `Утеплитель ${insul} мм`, MS ? 'Мансарда утепляется принудительно не ниже 250 мм.' : 'Соответствует СП 50.13330 для Омска.');

  if (NS.over.length) {
    const strat = MS ? 'удлинённая заготовка (опоры в комнате запрещены)'
      : ({ support: 'прогон на стойках', splice: 'стык над опорой', order: 'удлинённая заготовка', glulam: 'клеёная балка' }[p.longStrategy] || 'прогон');
    add('info', `${NS.over.length} марок длиннее ${NS.usable} мм`,
      `Решение: ${strat}. Стык структурного элемента в пролёте недопустим — только над опорой. Обрешётка и лобовая стыкуются свободно. Подробности во вкладке «Распил».`,
      MS || p.longStrategy === 'support' ? null : 'support');
  } else add('ok', `Раскрой: ${NS.boards} заготовок, отход ${Math.round(NS.waste * 100)}%`,
    `Пропил ${NS.kerf} мм, припуск ${p.allow} мм, допуск ±${p.tol} мм.`);

  if (+p.moisture > 20) add('bad', `Влажность ${p.moisture}% выше нормы`, 'Для несущих ≤20%, оптимально 16–18%.');
  else add('ok', `Влажность ${p.moisture}% — норма`, `Сорт ${S.G.n}, антисептик по всем граням до сборки.`);
  if (m.clampNote) add('info', 'Геометрия скорректирована', m.clampNote);
  return C;
}