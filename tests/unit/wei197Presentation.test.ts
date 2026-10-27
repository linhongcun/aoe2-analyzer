import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { civs, loadCore } from '../../src/data';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { civBonuses } from '../../src/domain/civBonus';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import BonusBody from '../../src/shared/ui/BonusBody';
import { buildView } from '../../src/features/builds/timelineModel';
import { buildShareCard } from '../../src/features/builds/shareCard';

beforeAll(async () => {
  await loadCore();
});
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const knightNote = '魏没有骑士；骑士方案仅供通用模板经济估算';
const card = (id: string) => {
  const bo = buildOrders.find((bo) => bo.id === id)!;
  const tl = simulateBuild(bo, 'Wei', eco as unknown as EcoData, ups);
  const view = buildView(tl, (name) => name);
  return buildShareCard({
    view,
    target: view.ages.find((a) => a.age === (bo.target.age === 2 ? 'feudal' : 'castle')),
    boId: id,
    boNameZh: bo.name.zh,
    civEn: 'Wei',
    civZh: '魏',
    targetZh: bo.target.age === 2 ? '封建' : '城堡',
    dist: 4,
    defaultDist: 4,
    house: true,
    patchBuild: __DATA_SOURCES__.patch.build,
    siteRoot: 'linhongcun.github.io/aoe2-analyzer/',
  });
};
describe('#197 魏公开说明与分享', () => {
  it('actual bonus0 source and encoded values remain truthful; actual DOM shows completed-research usage', () => {
    const b = civBonuses(civs.find((c) => c.en === 'Wei')!).find((b) => b.idx === 0)!;
    expect(b.src).toBe('eco');
    expect(b.encoded).toBe(false);
    expect(bonusUsage(b).find((line) => line.tool === 'sim')).toMatchObject({ on: true });
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/civ/Wei/bonus/0' }, createElement(BonusBody, { b, compact })));
      expect(html).toContain('data-usage="sim" data-on="true"');
      expect(html).toContain('研究完成');
      expect(html).not.toContain('仅文本，未计入数值');
    }
  });
  it('knight template share preserves restriction and housing model; actual renderer uses same card model', () => {
    const c = card('fast-castle-knights');
    expect(c.basis).toContain(knightNote);
    expect(c.basis).toContain('满住房仍计入赠送');
    expect(c.url).toContain('civ=Wei');
  });
  it.each(['scouts-18', 'archers-19', 'fast-castle-boom'])('%s has model disclosure and no knight-template restriction', (id) => {
    const c = card(id);
    expect(c.basis).toContain('满住房仍计入赠送');
    expect(c.basis).not.toContain(knightNote);
  });
});
