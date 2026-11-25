# Аудит проекта

`Корень:` `E:\dom`
Сгенерировано: 2026-11-24T11:40:59.092Z

Файлов **41** · связей **107** · экспортов **193** · ошибок **9** · предупреждений **13**

## Проверки

| проверка | результат |
|---|---|
| Разрешение импортов | 107/107 |
| Именованные экспорты | 193/193 |
| Циклы | 0 |
| Мёртвые файлы | 2 |
| Риски контрактов | 1 |
| Неиспользуемые экспорты | 68 |

## Проблемы

### Ошибки (9)

- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:91 читает .x — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:91`
- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:96 читает .x — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:96`
- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:100 читает .x — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:100`
- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:100 читает .z — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:100`
- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:106 читает .x — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:106`
- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:107 читает .z — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:107`
- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:250 читает .floor — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:250`
- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:426 читает .floor — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:426`
- **Чтение поля, которого нет во всех вариантах формы** — src/main.js:490 читает .x — есть только у intWall/extWall/door, нет у extOpening (производитель src/editor.js)  
  `src/main.js:490`

### Предупреждения (13)

- **userData читается, но нигде не пишется** — write: читают audit-project.mjs  
  `audit-project.mjs`
- **userData читается, но нигде не пишется** — read: читают audit-project.mjs  
  `audit-project.mjs`
- **userData читается, но нигде не пишется** — knee: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — kneeCap: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — breakPurlin: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — gableBearing: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — trussWeb: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — tieBrace: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — upperKing: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — tieKing: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — trussCeiling: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — trussPlate: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`
- **userData читается, но нигде не пишется** — kneeStud: читают src/roof/roof-audit.js  
  `src/roof/roof-audit.js`

### Заметки (72)

- **Файл недостижим из точек входа** — audit-project.mjs — никто не импортирует, из HTML не подключён  
  `audit-project.mjs`
- **Файл недостижим из точек входа** — src/roof/roof-mansard-ui.js — никто не импортирует, из HTML не подключён  
  `src/roof/roof-mansard-ui.js`
- **Обратная связь по слоям** — src/roof/index.js (слой 16) импортирует src/roof/roof-hardware.js (слой 17)  
  `src/roof/index.js:17`
- **Обратная связь по слоям** — src/roof/roof-structure.js (слой 7) импортирует src/roof/roof-long.js (слой 8)  
  `src/roof/roof-structure.js:2`
- **Экспорт никем не используется** — calculateVerandaExtras в src/calculator.js  
  `src/calculator.js:123`
- **Экспорт никем не используется** — initEditor в src/editor.js  
  `src/editor.js:810`
- **Экспорт никем не используется** — updateEditorHelpers в src/editor.js  
  `src/editor.js:923`
- **Экспорт никем не используется** — roofDesign в src/roof.js  
  `src/roof.js:35`
- **Экспорт никем не используется** — roofColorHex в src/roof.js  
  `src/roof.js:47`
- **Экспорт никем не используется** — roofArea в src/roof.js  
  `src/roof.js:185`
- **Экспорт никем не используется** — Vec3 в src/roof/index.js  
  `src/roof/index.js:1`
- **Экспорт никем не используется** — v3 в src/roof/index.js  
  `src/roof/index.js:1`
- **Экспорт никем не используется** — eulerBasis в src/roof/index.js  
  `src/roof/index.js:1`
- **Экспорт никем не используется** — fin в src/roof/index.js  
  `src/roof/index.js:2`
- **Экспорт никем не используется** — deg в src/roof/index.js  
  `src/roof/index.js:2`
- **Экспорт никем не используется** — ROOF_DEFAULTS в src/roof/index.js  
  `src/roof/index.js:3`
- **Экспорт никем не используется** — RAFTER_MAX в src/roof/index.js  
  `src/roof/index.js:3`
- **Экспорт никем не используется** — GRADE в src/roof/index.js  
  `src/roof/index.js:3`
- **Экспорт никем не используется** — PIECE_GROUPS в src/roof/index.js  
  `src/roof/index.js:4`
- **Экспорт никем не используется** — RATES_DEF в src/roof/index.js  
  `src/roof/index.js:5`
- **Экспорт никем не используется** — loadRates в src/roof/index.js  
  `src/roof/index.js:5`
- **Экспорт никем не используется** — computeRoofModel в src/roof/index.js  
  `src/roof/index.js:6`
- **Экспорт никем не используется** — computeRoofStructure в src/roof/index.js  
  `src/roof/index.js:7`
- **Экспорт никем не используется** — computeRoofPieces в src/roof/index.js  
  `src/roof/index.js:8`
- **Экспорт никем не используется** — nestRoofPieces в src/roof/index.js  
  `src/roof/index.js:9`
- **Экспорт никем не используется** — roofBOM в src/roof/index.js  
  `src/roof/index.js:10`
- **Экспорт никем не используется** — roofChecks в src/roof/index.js  
  `src/roof/index.js:11`
- **Экспорт никем не используется** — roofFromHouse в src/roof/index.js  
  `src/roof/index.js:13`
- **Экспорт никем не используется** — analyzeLong в src/roof/index.js  
  `src/roof/index.js:15`
- **Экспорт никем не используется** — HARDWARE_NOTES в src/roof/index.js  
  `src/roof/index.js:17`
- **Экспорт никем не используется** — AUDIT_GROUPS в src/roof/roof-audit.js  
  `src/roof/roof-audit.js:10`
- **Экспорт никем не используется** — deriveAll в src/roof/roof-audit.js  
  `src/roof/roof-audit.js:19`
- **Экспорт никем не используется** — auditCore в src/roof/roof-audit.js  
  `src/roof/roof-audit.js:30`
- **Экспорт никем не используется** — auditScene в src/roof/roof-audit.js  
  `src/roof/roof-audit.js:207`
- **Экспорт никем не используется** — AUDIT_MATRIX в src/roof/roof-audit.js  
  `src/roof/roof-audit.js:323`
- **Экспорт никем не используется** — auditConfig в src/roof/roof-audit.js  
  `src/roof/roof-audit.js:361`
- **Экспорт никем не используется** — runMatrix в src/roof/roof-audit.js  
  `src/roof/roof-audit.js:380`
- **Экспорт никем не используется** — hipNeedsSupport в src/roof/roof-long.js  
  `src/roof/roof-long.js:42`
- **Экспорт никем не используется** — RAFTER_SECTIONS в src/roof/roof-mansard.js  
  `src/roof/roof-mansard.js:18`
- **Экспорт никем не используется** — pickRafterSection в src/roof/roof-mansard.js  
  `src/roof/roof-mansard.js:36`
- **Экспорт никем не используется** — rejectedCount в src/roof/roof-render.js  
  `src/roof/roof-render.js:8`
- **Экспорт никем не используется** — CFG_DEFAULTS в src/roof/ui-test.js  
  `src/roof/ui-test.js:8`
- **Экспорт никем не используется** — Driver в src/roof/ui-test.js  
  `src/roof/ui-test.js:45`
- **Экспорт никем не используется** — SCENARIOS в src/roof/ui-test.js  
  `src/roof/ui-test.js:141`
- **Экспорт никем не используется** — runSuite в src/roof/ui-test.js  
  `src/roof/ui-test.js:393`
- **Экспорт никем не используется** — safeCylinder в src/safe.js  
  `src/safe.js:171`
- **Экспорт никем не используется** — initScene в src/scene.js  
  `src/scene.js:52`
- **Экспорт никем не используется** — getRenderCamera в src/scene.js  
  `src/scene.js:156`
- **Экспорт никем не используется** — getCanvasElement в src/scene.js  
  `src/scene.js:159`
- **Экспорт никем не используется** — isPlanMode в src/scene.js  
  `src/scene.js:160`
- **Экспорт никем не используется** — setPlanMode в src/scene.js  
  `src/scene.js:184`
- **Экспорт никем не используется** — updateEnvironment в src/scene.js  
  `src/scene.js:219`
- **Экспорт никем не используется** — STAIR_TYPES в src/stairs.js  
  `src/stairs.js:3`
- **Экспорт никем не используется** — STAIR_WIDTHS в src/stairs.js  
  `src/stairs.js:9`
- **Экспорт никем не используется** — STAIR_STRINGERS в src/stairs.js  
  `src/stairs.js:15`
- **Экспорт никем не используется** — STAIR_RAILS в src/stairs.js  
  `src/stairs.js:19`
- **Экспорт никем не используется** — STAIR_TURNS в src/stairs.js  
  `src/stairs.js:24`
- **Экспорт никем не используется** — STAIR_RISERS в src/stairs.js  
  `src/stairs.js:28`
- **Экспорт никем не используется** — stairDesign в src/stairs.js  
  `src/stairs.js:37`
- **Экспорт никем не используется** — sanitizeStairParams в src/stairs.js  
  `src/stairs.js:49`
- **Экспорт никем не используется** — solveRises в src/stairs.js  
  `src/stairs.js:61`
- **Экспорт никем не используется** — polysOverlap в src/stairs.js  
  `src/stairs.js:247`
- **Экспорт никем не используется** — updateFoundationRecommendation в src/ui.js  
  `src/ui.js:7`
- **Экспорт никем не используется** — initUI в src/ui.js  
  `src/ui.js:100`
- **Экспорт никем не используется** — updatePriceDisplay в src/ui.js  
  `src/ui.js:231`
- **Экспорт никем не используется** — VERANDA_STYLES в src/verandas.js  
  `src/verandas.js:4`
- **Экспорт никем не используется** — getVerandaCollisionSegments в src/verandas.js  
  `src/verandas.js:71`
- **Экспорт никем не используется** — initWalk в src/walk.js  
  `src/walk.js:119`
- **Экспорт никем не используется** — startWalk в src/walk.js  
  `src/walk.js:133`
- **Экспорт никем не используется** — exit в src/walk.js  
  `src/walk.js:147`
- **Экспорт никем не используется** — isWalkActive в src/walk.js  
  `src/walk.js:155`
- **Экспорт никем не используется** — updateWalk в src/walk.js  
  `src/walk.js:157`

## Граф зависимостей

### audit-project.mjs
1132 строк · импортов 3 · экспортов 0 · входящих 0

Импорты: `node:fs` → node, `node:path` → node, `node:url` → node

### roof-audit.html — точка входа
523 строк · импортов 2 · экспортов 0 · входящих 0

Импорты: `./src/roof/roof-audit.js` → src/roof/roof-audit.js, `./src/roof/roof-render.js` → src/roof/roof-render.js

### roof-core-check.html — точка входа
40 строк · импортов 1 · экспортов 0 · входящих 0

Импорты: `./src/roof/index.js` → src/roof/index.js

### roof-ui-test.html — точка входа
447 строк · импортов 1 · экспортов 0 · входящих 0

Импорты: `./src/roof/ui-test.js` → src/roof/ui-test.js

### src/builder.js
1391 строк · импортов 6 · экспортов 2 · входящих 2

Экспорты: `buildHouse`, `createStairMesh`

Импорты: `three` → importmap, `./verandas.js` → src/verandas.js, `./stair-builder.js` → src/stair-builder.js, `./stairs.js` → src/stairs.js, `./safe.js` → src/safe.js, `./roof.js` → src/roof.js

### src/calculator.js
143 строк · импортов 1 · экспортов 2 · входящих 1

Экспорты: `calculateMaterials`, `calculateVerandaExtras`

Импорты: `./prices.js` → src/prices.js

### src/editor.js
1097 строк · импортов 5 · экспортов 2 · входящих 1

Экспорты: `initEditor`, `updateEditorHelpers`

Импорты: `three` → importmap, `./builder.js` → src/builder.js, `./scene.js` → src/scene.js, `./editor-ui.css` → src/editor-ui.css, `./stairs.js` → src/stairs.js

### src/main.js — точка входа
539 строк · импортов 7 · экспортов 0 · входящих 0

Импорты: `three` → importmap, `./scene.js` → src/scene.js, `./editor.js` → src/editor.js, `./walk.js` → src/walk.js, `./ui.js` → src/ui.js, `./builder.js` → src/builder.js, `./roof.js` → src/roof.js

### src/prices.js
96 строк · импортов 0 · экспортов 1 · входящих 2

Экспорты: `PRICES`

### src/roof.js
588 строк · импортов 1 · экспортов 8 · входящих 3

Экспорты: `ROOF_MATERIALS`, `ROOF_COLORS`, `roofDesign`, `roofColorHex`, `initRoofEnvironment`, `roofGeom`, `roofArea`, `buildRoof`

Импорты: `three` → importmap

### src/roof/format.js
8 строк · импортов 0 · экспортов 8 · входящих 11

Экспорты: `fin`, `cl`, `fmt`, `f1`, `f2`, `f3`, `mm`, `deg`

### src/roof/index.js
17 строк · импортов 17 · экспортов 46 · входящих 2

Экспорты: `Vec3`, `v3`, `eulerBasis`, `fin`, `cl`, `fmt`, `f1`, `f2`, `f3`, `mm`, `deg`, `ROOF_DEFAULTS`, `SEATS`, `TIEMODE`, `COVERS`, `RAFTER_MAX`, `SNOW`, `WIND`, `GRADE`, `RHO`, `ROOF_STAGES`, `PIECE_GROUPS`, `RATES`, `RATES_DEF`, `loadRates`, `saveRates`, `resetRates`, `computeRoofModel`, `computeRoofStructure`, `computeRoofPieces`, `nestRoofPieces`, `roofBOM`, `roofPrice`, `roofChecks`, `code39`, `roofFromHouse`, `createRoof`, `planLongMembers`, `analyzeLong`, `LONG_STRATEGIES`, `cutCSV`, `nestCSV`, `assemblyCSV`, `packageJSON`, `download`, `HARDWARE_NOTES`

Импорты: `./vec3.js` → src/roof/vec3.js, `./format.js` → src/roof/format.js, `./roof-params.js` → src/roof/roof-params.js, `./roof-stages.js` → src/roof/roof-stages.js, `./roof-prices.js` → src/roof/roof-prices.js, `./roof-model.js` → src/roof/roof-model.js, `./roof-structure.js` → src/roof/roof-structure.js, `./roof-pieces.js` → src/roof/roof-pieces.js, `./roof-nesting.js` → src/roof/roof-nesting.js, `./roof-bom.js` → src/roof/roof-bom.js, `./roof-checks.js` → src/roof/roof-checks.js, `./roof-barcode.js` → src/roof/roof-barcode.js, `./roof-context.js` → src/roof/roof-context.js, `./roof-controller.js` → src/roof/roof-controller.js, `./roof-long.js` → src/roof/roof-long.js, `./roof-export.js` → src/roof/roof-export.js, `./roof-hardware.js` → src/roof/roof-hardware.js

### src/roof/lab.js — точка входа
652 строк · импортов 4 · экспортов 0 · входящих 0

Импорты: `./roof.css` → src/roof/roof.css, `./index.js` → src/roof/index.js, `./roof-render.js` → src/roof/roof-render.js, `./roof-mansard.js` → src/roof/roof-mansard.js

### src/roof/roof-audit.js
380 строк · импортов 7 · экспортов 7 · входящих 1

Экспорты: `AUDIT_GROUPS`, `deriveAll`, `auditCore`, `auditScene`, `AUDIT_MATRIX`, `auditConfig`, `runMatrix`

Импорты: `./roof-model.js` → src/roof/roof-model.js, `./roof-structure.js` → src/roof/roof-structure.js, `./roof-pieces.js` → src/roof/roof-pieces.js, `./roof-nesting.js` → src/roof/roof-nesting.js, `./roof-long.js` → src/roof/roof-long.js, `./roof-params.js` → src/roof/roof-params.js, `./roof-mansard.js` → src/roof/roof-mansard.js

### src/roof/roof-barcode.js
22 строк · импортов 0 · экспортов 1 · входящих 1

Экспорты: `code39`

### src/roof/roof-bom.js
111 строк · импортов 3 · экспортов 2 · входящих 2

Экспорты: `roofBOM`, `roofPrice`

Импорты: `./roof-params.js` → src/roof/roof-params.js, `./format.js` → src/roof/format.js, `./roof-prices.js` → src/roof/roof-prices.js

### src/roof/roof-checks.js
124 строк · импортов 3 · экспортов 1 · входящих 2

Экспорты: `roofChecks`

Импорты: `./roof-params.js` → src/roof/roof-params.js, `./roof-mansard.js` → src/roof/roof-mansard.js, `./format.js` → src/roof/format.js

### src/roof/roof-context.js
32 строк · импортов 2 · экспортов 1 · входящих 1

Экспорты: `roofFromHouse`

Импорты: `./roof-params.js` → src/roof/roof-params.js, `./format.js` → src/roof/format.js

### src/roof/roof-controller.js
52 строк · импортов 8 · экспортов 1 · входящих 1

Экспорты: `createRoof`

Импорты: `./roof-params.js` → src/roof/roof-params.js, `./roof-model.js` → src/roof/roof-model.js, `./roof-structure.js` → src/roof/roof-structure.js, `./roof-pieces.js` → src/roof/roof-pieces.js, `./roof-nesting.js` → src/roof/roof-nesting.js, `./roof-bom.js` → src/roof/roof-bom.js, `./roof-checks.js` → src/roof/roof-checks.js, `./roof-long.js` → src/roof/roof-long.js

### src/roof/roof-export.js
86 строк · импортов 3 · экспортов 5 · входящих 1

Экспорты: `cutCSV`, `nestCSV`, `assemblyCSV`, `packageJSON`, `download`

Импорты: `./format.js` → src/roof/format.js, `./roof-stages.js` → src/roof/roof-stages.js, `./roof-prices.js` → src/roof/roof-prices.js

### src/roof/roof-hardware.js
557 строк · импортов 2 · экспортов 2 · входящих 2

Экспорты: `buildHardware`, `HARDWARE_NOTES`

Импорты: `three` → importmap, `three/addons/utils/BufferGeometryUtils.js` → importmap

### src/roof/roof-long.js
302 строк · импортов 2 · экспортов 5 · входящих 4

Экспорты: `LONG_STRATEGIES`, `analyzeLong`, `purlinXs`, `hipNeedsSupport`, `planLongMembers`

Импорты: `./format.js` → src/roof/format.js, `./roof-params.js` → src/roof/roof-params.js

### src/roof/roof-mansard-ui.js
246 строк · импортов 1 · экспортов 8 · входящих 0

Экспорты: `MANSARD_SCHEMES`, `GL`, `RAFTER_SECTIONS`, `snowMu`, `slopeLineLoad`, `checkRafterSection`, `pickRafterSection`, `solveMansard`

Импорты: `./format.js` → src/roof/format.js

### src/roof/roof-mansard.js
253 строк · импортов 1 · экспортов 8 · входящих 5

Экспорты: `MANSARD_SCHEMES`, `GL`, `RAFTER_SECTIONS`, `snowMu`, `slopeLineLoad`, `checkRafterSection`, `pickRafterSection`, `solveMansard`

Импорты: `./format.js` → src/roof/format.js

### src/roof/roof-model.js
309 строк · импортов 4 · экспортов 1 · входящих 3

Экспорты: `computeRoofModel`

Импорты: `./vec3.js` → src/roof/vec3.js, `./format.js` → src/roof/format.js, `./roof-params.js` → src/roof/roof-params.js, `./roof-mansard.js` → src/roof/roof-mansard.js

### src/roof/roof-nesting.js
31 строк · импортов 0 · экспортов 1 · входящих 3

Экспорты: `nestRoofPieces`

### src/roof/roof-params.js
44 строк · импортов 0 · экспортов 9 · входящих 10

Экспорты: `ROOF_DEFAULTS`, `SEATS`, `TIEMODE`, `COVERS`, `RAFTER_MAX`, `SNOW`, `WIND`, `GRADE`, `RHO`

### src/roof/roof-pieces.js
145 строк · импортов 3 · экспортов 1 · входящих 3

Экспорты: `computeRoofPieces`

Импорты: `./format.js` → src/roof/format.js, `./roof-params.js` → src/roof/roof-params.js, `./roof-stages.js` → src/roof/roof-stages.js

### src/roof/roof-prices.js
100 строк · импортов 0 · экспортов 5 · входящих 3

Экспорты: `RATES_DEF`, `RATES`, `loadRates`, `saveRates`, `resetRates`

### src/roof/roof-render.js
753 строк · импортов 5 · экспортов 3 · входящих 2

Экспорты: `rejectedCount`, `ROOF_LAYERS`, `createRoofStage`

Импорты: `three` → importmap, `three/addons/controls/OrbitControls.js` → importmap, `three/addons/utils/BufferGeometryUtils.js` → importmap, `./format.js` → src/roof/format.js, `./roof-hardware.js` → src/roof/roof-hardware.js

### src/roof/roof-stages.js
35 строк · импортов 0 · экспортов 2 · входящих 3

Экспорты: `ROOF_STAGES`, `PIECE_GROUPS`

### src/roof/roof-structure.js
116 строк · импортов 3 · экспортов 1 · входящих 3

Экспорты: `computeRoofStructure`

Импорты: `./roof-params.js` → src/roof/roof-params.js, `./roof-long.js` → src/roof/roof-long.js, `./roof-mansard.js` → src/roof/roof-mansard.js

### src/roof/ui-test.js
445 строк · импортов 0 · экспортов 4 · входящих 1

Экспорты: `CFG_DEFAULTS`, `Driver`, `SCENARIOS`, `runSuite`

### src/roof/vec3.js
80 строк · импортов 0 · экспортов 3 · входящих 2

Экспорты: `Vec3`, `v3`, `eulerBasis`

### src/safe.js
206 строк · импортов 1 · экспортов 13 · входящих 3

Экспорты: `num`, `clamp`, `int`, `sanitizeHouseParams`, `cleanPoly`, `polyArea`, `isSimple`, `guardGeometry`, `safeBox`, `safeCylinder`, `safeSphere`, `safeExtrude`, `safeMatrix`

Импорты: `three` → importmap

### src/scene.js
223 строк · импортов 2 · экспортов 13 · входящих 2

Экспорты: `initScene`, `getRenderCamera`, `getPlanCamera`, `getPlanZoom`, `getCanvasElement`, `isPlanMode`, `screenToWorld`, `getWorldPerPixel`, `setPlanMode`, `fitPlanView`, `planZoomAt`, `planPanByPixels`, `updateEnvironment`

Импорты: `three` → importmap, `three/addons/controls/OrbitControls.js` → importmap

### src/stair-builder.js
357 строк · импортов 4 · экспортов 1 · входящих 1

Экспорты: `buildStairGroup`

Импорты: `three` → importmap, `three/addons/utils/BufferGeometryUtils.js` → importmap, `./stairs.js` → src/stairs.js, `./safe.js` → src/safe.js

### src/stairs.js
260 строк · импортов 1 · экспортов 15 · входящих 4

Экспорты: `STAIR_TYPES`, `STAIR_WIDTHS`, `STAIR_STRINGERS`, `STAIR_RAILS`, `STAIR_TURNS`, `STAIR_RISERS`, `stairDesign`, `sanitizeStairParams`, `solveRises`, `computeStair`, `stairWorldPoly`, `stairFitsHouse`, `pointInPoly`, `polysOverlap`, `stairOverlapsAny`

Импорты: `./safe.js` → src/safe.js

### src/ui.js
334 строк · импортов 3 · экспортов 3 · входящих 1

Экспорты: `updateFoundationRecommendation`, `initUI`, `updatePriceDisplay`

Импорты: `./prices.js` → src/prices.js, `./calculator.js` → src/calculator.js, `./roof.js` → src/roof.js

### src/verandas.js
391 строк · импортов 1 · экспортов 3 · входящих 1

Экспорты: `VERANDA_STYLES`, `getVerandaCollisionSegments`, `addVerandaStructure`

Импорты: `three` → importmap

### src/walk.js
199 строк · импортов 3 · экспортов 5 · входящих 1

Экспорты: `initWalk`, `startWalk`, `exit`, `isWalkActive`, `updateWalk`

Импорты: `three` → importmap, `three/addons/controls/PointerLockControls.js` → importmap, `./stairs.js` → src/stairs.js

## Контракты данных

### src/editor.js → src/main.js
Дискриминатор `kind`, варианты: `extOpening`, `intWall`, `extWall`, `door`

- строка 91: читает `.x` — есть у intWall/extWall/door, нет у extOpening
- строка 96: читает `.x` — есть у intWall/extWall/door, нет у extOpening
- строка 100: читает `.x` — есть у intWall/extWall/door, нет у extOpening
- строка 100: читает `.z` — есть у intWall/extWall/door, нет у extOpening
- строка 106: читает `.x` — есть у intWall/extWall/door, нет у extOpening
- строка 107: читает `.z` — есть у intWall/extWall/door, нет у extOpening
- строка 250: читает `.floor` — есть у intWall/extWall/door, нет у extOpening
- строка 426: читает `.floor` — есть у intWall/extWall/door, нет у extOpening
- строка 490: читает `.x` — есть у intWall/extWall/door, нет у extOpening
