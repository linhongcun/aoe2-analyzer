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
import { TimelineChart } from '../../src/features/builds/TimelineChart';

beforeAll(async () => {
  await loadCore();
});
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const knightNote = '孟加拉没有骑士；骑士方案仅供通用模板经济估算';
describe('#197 孟加拉真实人口与公开说明', () => {
  it.each([
    ['scouts-18', 'feudal', 20, 21, 25],
    ['archers-19', 'feudal', 21, 22, 25],
    ['fast-castle-knights', 'castle', 27, 28, 30],
    ['fast-castle-boom', 'castle', 27, 28, 30],
  ] as const)('%s actual%s summary includes the arrival gift once', (id, age, vils, used, cap) => {
    const bo = buildOrders.find((bo) => bo.id === id)!;
    const tl = simulateBuild(bo, 'Bengalis', eco as unknown as EcoData, ups);
    const view = buildView(tl, (name) => name);
    expect(view.ages.find((mark) => mark.age === age)).toMatchObject({ vils, pop: { used, cap } });
    const html = renderToStaticMarkup(createElement(TimelineChart, { v: view, tl, selectedStep: null, showAssume: true, setShowAssume: () => undefined }));
    expect(html).toContain('aria-label="孟加拉时代赠送村民"');
    expect(html).toContain('时代赠村');
    expect(html).toContain(`${vils} 村民 · 人口 ${used}/${cap}`);
    expect(html).not.toContain('经济研究完成，赠送');
    expect(html).toContain('满住房仍计入赠送');
  });
  it('actual bonus0 keeps eco/encodedfalse source and renders simulator plus untouched independent gather boundary', () => {
    const b = civBonuses(civs.find((civ) => civ.en === 'Bengalis')!).find((bonus) => bonus.idx === 0)!;
    expect(b).toMatchObject({ src: 'eco', encoded: false });
    expect(bonusUsage(b).find((line) => line.tool === 'sim')).toMatchObject({ on: true });
    expect(bonusUsage(b).find((line) => line.tool === 'gather')).toMatchObject({ on: false, note: '赠送村民未计入真实成本；单个村民的采集速度不变' });
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/civ/Bengalis/bonus/0' }, createElement(BonusBody, { b, compact })));
      expect(html).toContain('data-usage="sim" data-on="true"');
      expect(html).toContain('data-usage="gather" data-on="false"');
      expect(html).toContain('<span class="num nw">2个村民</span>');
    }
  });
  it.each(['scouts-18', 'fast-castle-knights'])('%s sharing keeps age source, model boundary and only the knight-template warning', (id) => {
    const bo = buildOrders.find((bo) => bo.id === id)!;
    const tl = simulateBuild(bo, 'Bengalis', eco as unknown as EcoData, ups);
    const view = buildView(tl, (name) => name);
    const model = buildShareCard({
      view,
      target: view.ages.find((age) => age.age === (bo.target.age === 2 ? 'feudal' : 'castle')),
      boId: id,
      boNameZh: bo.name.zh,
      civEn: 'Bengalis',
      civZh: '孟加拉',
      targetZh: bo.target.age === 2 ? '封建' : '城堡',
      dist: 4,
      defaultDist: 4,
      house: true,
      patchBuild: __DATA_SOURCES__.patch.build,
      siteRoot: 'linhongcun.github.io/aoe2-analyzer/',
    });
    expect(model.url).toContain('civ=Bengalis');
    expect(model.basis).toContain('每座完成城镇中心赠送2个村民');
    expect(model.basis).toContain('住房政策未经当前版本客户端实测');
    expect(model.basis.includes(knightNote)).toBe(id === 'fast-castle-knights');
  });
});
