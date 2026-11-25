/* verified:true — подтверждено застройщиком.
   verified:false — ориентир из общих знаний, НЕ проверен по прайсу.
   hint — диапазон и что уточнить у поставщика. */
export const RATES_DEF = {
  lumberBoard:{v:17000,u:'₽/м³',src:'ok',verified:true,g:'Пиломатериал',n:'Доска / брус обычный',hint:'подтверждено застройщиком'},
  lumberProf:{v:23000,u:'₽/м³',src:'ok',verified:true,g:'Пиломатериал',n:'Брус профилированный (стены)',hint:'подтверждено застройщиком'},
  glulam:{v:78000,u:'₽/м³',src:'mk',verified:false,g:'Пиломатериал',n:'Клеёная балка / LVL',hint:'ориентир 60–110 тыс, отдельный поставщик'},

  membrane:{v:70,u:'₽/м²',src:'mk',verified:false,g:'Пирог',n:'Супердиффузионная мембрана',hint:'ориентир 55–110 ₽/м²'},
  vapor:{v:35,u:'₽/м²',src:'mk',verified:false,g:'Пирог',n:'Пароизоляция',hint:'ориентир 25–50 ₽/м²'},
  wool:{v:5500,u:'₽/м³',src:'mk',verified:false,g:'Пирог',n:'Минвата 35–45 кг/м³',hint:'ориентир 4 500–7 000 ₽/м³'},
  osb:{v:1350,u:'₽/лист',src:'mk',verified:false,g:'Пирог',n:'OSB-3 12 мм 2500×1250',hint:'ориентир 1 100–1 800 ₽/лист'},
  underlay:{v:120,u:'₽/м²',src:'mk',verified:false,g:'Пирог',n:'Подкладочный ковёр',hint:'ориентир 90–170 ₽/м²'},
  mastic:{v:270,u:'₽/кг',src:'mk',verified:false,g:'Пирог',n:'Мастика битумная',hint:'ориентир 200–380 ₽/кг'},

  metaltile:{v:650,u:'₽/м²',src:'mk',verified:false,g:'Покрытие',n:'Металлочерепица',hint:'ориентир 550–950 ₽/м²'},
  seam:{v:1100,u:'₽/м²',src:'mk',verified:false,g:'Покрытие',n:'Фальцевая картина',hint:'ориентир 900–1 600 ₽/м²'},
  shingle:{v:1800,u:'₽/упак',src:'mk',verified:false,g:'Покрытие',n:'Гибкая черепица, упак ~3 м²',hint:'ориентир 1 400–2 600 ₽/упак'},
  prof:{v:550,u:'₽/м²',src:'mk',verified:false,g:'Покрытие',n:'Профлист С21',hint:'ориентир 450–750 ₽/м²'},

  ridge:{v:600,u:'₽/шт 2 м',src:'mk',verified:false,g:'Погонаж',n:'Конёк / хребтовая планка',hint:'ориентир 450–850 ₽/шт'},
  rake:{v:520,u:'₽/шт 2 м',src:'mk',verified:false,g:'Погонаж',n:'Ветровая планка',hint:'ориентир 400–700 ₽/шт'},
  drip:{v:450,u:'₽/шт 2 м',src:'mk',verified:false,g:'Погонаж',n:'Карнизная планка / капельник',hint:'ориентир 350–600 ₽/шт'},
  endcap:{v:220,u:'₽/шт',src:'mk',verified:false,g:'Погонаж',n:'Заглушка / тройник конька',hint:'ориентир 150–400 ₽/шт'},
  seal:{v:90,u:'₽/м.п.',src:'mk',verified:false,g:'Погонаж',n:'Уплотнитель вентконька',hint:'ориентир 60–140 ₽/м.п.'},

  gut:{v:950,u:'₽/шт 3 м',src:'mk',verified:false,g:'Водосток',n:'Жёлоб 3 м',hint:'ориентир 700–1 400 ₽/шт'},
  gutJoin:{v:270,u:'₽/шт',src:'mk',verified:false,g:'Водосток',n:'Соединитель жёлоба',hint:'ориентир 200–400 ₽/шт'},
  gutCap:{v:200,u:'₽/шт',src:'mk',verified:false,g:'Водосток',n:'Заглушка жёлоба',hint:'ориентир 150–300 ₽/шт'},
  gutCorner:{v:390,u:'₽/шт',src:'mk',verified:false,g:'Водосток',n:'Угол жёлоба 90°',hint:'ориентир 300–550 ₽/шт'},
  gutBrk:{v:170,u:'₽/шт',src:'mk',verified:false,g:'Водосток',n:'Кронштейн жёлоба',hint:'ориентир 120–260 ₽/шт'},
  funnel:{v:470,u:'₽/шт',src:'mk',verified:false,g:'Водосток',n:'Воронка',hint:'ориентир 350–700 ₽/шт'},
  pipe:{v:1050,u:'₽/шт 3 м',src:'mk',verified:false,g:'Водосток',n:'Труба 3 м',hint:'ориентир 800–1 500 ₽/шт'},
  elbow:{v:320,u:'₽/шт',src:'mk',verified:false,g:'Водосток',n:'Колено 45°',hint:'ориентир 250–450 ₽/шт'},
  clamp:{v:210,u:'₽/шт',src:'mk',verified:false,g:'Водосток',n:'Хомут трубы',hint:'ориентир 150–320 ₽/шт'},
  outlet:{v:320,u:'₽/шт',src:'mk',verified:false,g:'Водосток',n:'Отлив (слив)',hint:'ориентир 250–450 ₽/шт'},

  snowSet:{v:2500,u:'₽/компл',src:'mk',verified:false,g:'Снегозадержание',n:'Трубчатый комплект 3 м',hint:'ориентир 1 800–3 500 ₽/компл'},
  soffit:{v:600,u:'₽/панель',src:'mk',verified:false,g:'Подшивка',n:'Софит 3000×305',hint:'ориентир 450–850 ₽/панель'},
  jprof:{v:350,u:'₽/шт 3 м',src:'mk',verified:false,g:'Подшивка',n:'J-профиль',hint:'ориентир 250–500 ₽/шт'},

  screw:{v:600,u:'₽/100 шт',src:'mk',verified:false,g:'Крепёж',n:'Саморез кровельный 4.8×35 EPDM',hint:'ориентир 450–900 ₽/100'},
  screwLong:{v:900,u:'₽/100 шт',src:'mk',verified:false,g:'Крепёж',n:'Саморез 4.8×70',hint:'ориентир 700–1 300 ₽/100'},
  nail:{v:240,u:'₽/кг',src:'mk',verified:false,g:'Крепёж',n:'Гвоздь ершёный оцинк.',hint:'ориентир 180–330 ₽/кг'},
  klammer:{v:35,u:'₽/шт',src:'mk',verified:false,g:'Крепёж',n:'Кляммер фальцевый',hint:'ориентир 25–50 ₽/шт'},
  slide:{v:180,u:'₽/шт',src:'mk',verified:false,g:'Крепёж',n:'Скользящая опора стропил',hint:'ориентир 120–280 ₽/шт'},
  angle:{v:60,u:'₽/шт',src:'mk',verified:false,g:'Крепёж',n:'Уголок перфорированный',hint:'ориентир 40–90 ₽/шт'},
  plate:{v:95,u:'₽/шт',src:'mk',verified:false,g:'Крепёж',n:'Пластина перфорированная 100×140',hint:'ориентир 60–150 ₽/шт'},
  bolt:{v:78,u:'₽/компл',src:'mk',verified:false,g:'Крепёж',n:'Болт М12 + гайка + 2 шайбы',hint:'ориентир 55–120 ₽/компл'},
  bolt10:{v:45,u:'₽/шт',src:'mk',verified:false,g:'Крепёж',n:'Болт М10',hint:'ориентир 30–70 ₽/шт'},
  stud:{v:120,u:'₽/шт',src:'mk',verified:false,g:'Крепёж',n:'Шпилька М12 + гайки/шайбы',hint:'ориентир 90–180 ₽/шт'},
  antiseptic:{v:250,u:'₽/л',src:'mk',verified:false,g:'Крепёж',n:'Антисептик-антипирен',hint:'ориентир 180–350 ₽/л'},

  sawCut:{v:120,u:'₽/рез',src:'mk',verified:false,g:'Распил',n:'Торцовка / рез на лесопилке',hint:'ориентир 80–200 ₽/рез'},
  sawAngle:{v:260,u:'₽/косой рез',src:'mk',verified:false,g:'Распил',n:'Косой или compound-рез',hint:'ориентир 180–400 ₽/рез'},
  sawNotch:{v:340,u:'₽/врубка',src:'mk',verified:false,g:'Распил',n:'Седло / врубка на станке',hint:'ориентир 250–500 ₽/шт'},
  sawLabel:{v:45,u:'₽/марка',src:'mk',verified:false,g:'Распил',n:'Маркировка + штрихкод',hint:'ориентир 30–80 ₽/деталь'},
  longOrder:{v:4200,u:'₽/м³',src:'mk',verified:false,g:'Распил',n:'Наценка за нестандартную длину',hint:'ориентир 2 500–6 000 ₽/м³'},
  pack:{v:1800,u:'₽/паллета',src:'mk',verified:false,g:'Распил',n:'Пакетирование, обвязка, плёнка',hint:'ориентир 1 200–2 800 ₽/паллета'},
  deliver:{v:14000,u:'₽/рейс',src:'mk',verified:false,g:'Распил',n:'Доставка на площадку (до 20 м³)',hint:'ориентир 10–20 тыс ₽/рейс, зависит от плеча'},

  wFrame:{v:900,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Стропильная система с нуля',hint:'ориентир 700–1 200 ₽/м²'},
  wKit:{v:520,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Сборка готового комплекта по маркам',hint:'ориентир 400–700 ₽/м²'},
  wDeck:{v:450,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Контробрешётка, обрешётка, мембрана',hint:'ориентир 350–600 ₽/м²'},
  wMetaltile:{v:550,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Монтаж металлочерепицы',hint:'ориентир 450–750 ₽/м²'},
  wSeam:{v:1500,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Монтаж фальцевой кровли',hint:'ориентир 1 200–2 000 ₽/м²'},
  wShingle:{v:750,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Монтаж гибкой черепицы',hint:'ориентир 600–1 000 ₽/м²'},
  wProf:{v:500,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Монтаж профлиста',hint:'ориентир 400–650 ₽/м²'},
  wWarm:{v:900,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Утепление, пароизоляция, подшивка',hint:'ориентир 700–1 200 ₽/м²'},
  wJoist:{v:420,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Балки перекрытия',hint:'ориентир 300–550 ₽/м²'},
  wSeat:{v:180,u:'₽/узел',src:'mk',verified:false,g:'Работа',n:'Опорный брусок / прибоина, монтаж',hint:'ориентир 120–300 ₽/узел'},
  wTrim:{v:350,u:'₽/м.п.',src:'mk',verified:false,g:'Работа',n:'Конёк, планки, примыкания',hint:'ориентир 250–500 ₽/м.п.'},
  wGut:{v:450,u:'₽/м.п.',src:'mk',verified:false,g:'Работа',n:'Монтаж водостока',hint:'ориентир 350–650 ₽/м.п.'},
  wSnow:{v:450,u:'₽/м.п.',src:'mk',verified:false,g:'Работа',n:'Монтаж снегозадержателей',hint:'ориентир 350–650 ₽/м.п.'},
  wSoffit:{v:600,u:'₽/м²',src:'mk',verified:false,g:'Работа',n:'Подшивка свесов',hint:'ориентир 450–850 ₽/м²'},
  wAnti:{v:1500,u:'₽/м³',src:'mk',verified:false,g:'Работа',n:'Антисептирование пиломатериала',hint:'ориентир 1 200–2 200 ₽/м³'},
  workProf:{v:8500,u:'₽/м³',src:'ok',verified:true,g:'Работа',n:'Укладка профилированного бруса',hint:'подтверждено застройщиком'},
  overhead:{v:6,u:'% матер.',src:'mk',verified:false,g:'Работа',n:'Леса, подъём, вывоз мусора',hint:'ориентир 4–9 % от материалов'}
};

const LS = 'domles.roof.rates.v8';
export const RATES = structuredClone(RATES_DEF);

export function loadRates() {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || '{}');
    for (const k in s) if (RATES[k] && Number.isFinite(+s[k])) RATES[k].v = +s[k];
  } catch { /* повреждённое сохранение игнорируем */ }
  return RATES;
}
export function saveRates() {
  const o = {}; for (const k in RATES) o[k] = RATES[k].v;
  try { localStorage.setItem(LS, JSON.stringify(o)); } catch { /* quota */ }
}
export function resetRates() {
  for (const k in RATES_DEF) RATES[k].v = RATES_DEF[k].v;
  saveRates();
  return RATES;
}
loadRates();