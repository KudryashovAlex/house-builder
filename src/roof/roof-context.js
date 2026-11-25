import { ROOF_DEFAULTS } from './roof-params.js';
import { cl } from './format.js';

// Мост «дом → кровля». Дом отдаёт только то, что нужно крыше.
export function roofFromHouse(house = {}, overrides = {}) {
  const beamW = cl(+(house.beamWidth || 150) / 1000, .1, .2);
  const floors = cl(Math.round(house.floors || 1), 1, 3);
  const mansard = house.mansard === 'yes' && floors >= 2;
  const wallHeight = cl(house.wallHeight || 2.7, 2.4, 4);
  const knee = 1.8;
  const wallsH = mansard ? wallHeight * (floors - 1) + knee : wallHeight * floors;
  const stepY = house.material === 'brevno' ? beamW * .85 : beamW * .95;
  const layers = Math.max(1, Math.ceil(wallsH / stepY));
  const wallTopY = .6 + layers * stepY + beamW / 2;

  const span = cl(house.width || 8, 4, 14);
  const roofHeight = cl(house.roofHeight || 2.2, .8, 5);
  const pitch = Math.round(Math.atan2(roofHeight, span / 2) * 180 / Math.PI);

  return {
    ...ROOF_DEFAULTS,
    type: mansard ? 'gable' : (house.roofType === 'hip' ? 'hip' : 'gable'),
    span,
    length: cl(house.length || 6, 4, 18),
    pitch: cl(pitch, 8, 50),
    eave: cl(house.overhangSides || .8, .3, 1.2),
    rake: cl(Math.max(house.overhangFront || .8, house.overhangBack || .8), .3, 1),
    insul: mansard ? 250 : 0,
    context: { wallTopY, beamWidth: beamW, material: house.material || 'brus', floors, mansard },
    ...overrides
  };
}