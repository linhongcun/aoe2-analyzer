import { describe, expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import units from '../../src/data/units.json';
import eco from '../../src/data/eco.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, WALK, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { buildView } from '../../src/features/builds/timelineModel';
import { buildShareCard } from '../../src/features/builds/shareCard';
import baseline from './__fixtures__/shareCardBasis818.json';

const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const AGE = ['', '', 'feudal', 'castle', 'imperial'] as const;
const AGE_ZH = ['', '黑暗', '封建', '城堡', '帝王'];
const BASIS = baseline as Record<string, string>;

describe('#818 分享卡 56 文明 × 8 开局备注基线', () => {
  it('所有开局 basis 与 fixture 逐字相同', () => {
    for (const civ of civs as { en: string; zh: string }[]) {
      for (const bo of buildOrders) {
        const tl = simulateBuild(bo, civ.en, eco as unknown as EcoData, ups, { walkTiles: WALK.default, autoHouses: true });
        const view = buildView(tl, (x) => x);
        const target = view.ages.find((a) => a.age === AGE[bo.target.age]);
        const basis = buildShareCard({
          view,
          target,
          boId: bo.id,
          boNameZh: bo.name.zh,
          civEn: civ.en,
          civZh: civ.zh,
          targetZh: AGE_ZH[bo.target.age]!,
          dist: WALK.default,
          defaultDist: WALK.default,
          house: true,
          patchBuild: 188329,
          siteRoot: 's/',
        }).basis;
        expect(basis, `${civ.en}/${bo.id}`).toBe(BASIS[`${civ.en}/${bo.id}`]);
      }
    }
  }, 60_000);
});
