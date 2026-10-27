import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { buildView } from '../../src/features/builds/timelineModel';
import { buildShareCard } from '../../src/features/builds/shareCard';

const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const knightNote = '玛雅无马厩；侦察骑兵、骑士方案仅供通用模板经济估算';
const card = (boId: string, civEn: string, civZh: string) => {
  const bo = buildOrders.find((item) => item.id === boId)!;
  const timeline = simulateBuild(bo, civEn, eco as unknown as EcoData, ups);
  const view = buildView(timeline, (name) => name);
  return buildShareCard({
    view,
    target: view.ages.find((age) => age.age === (bo.target.age === 2 ? 'feudal' : 'castle')),
    boId,
    boNameZh: bo.name.zh,
    civEn,
    civZh,
    targetZh: bo.target.age === 2 ? '封建' : '城堡',
    dist: 4,
    defaultDist: 4,
    house: true,
    patchBuild: __DATA_SOURCES__.patch.build,
    siteRoot: 'linhongcun.github.io/aoe2-analyzer/',
  });
};
describe('#197 玛雅分享保留模板边界', () => {
  it.each(['scouts-18', 'fast-castle-knights'])('%s卡片basis保留不可用军事模板说明，同一model供PNG绘制', (boId) => {
    const result = card(boId, 'Mayans', '玛雅');
    expect(result.basis).toBe(`按玛雅计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}\n${knightNote}`);
    expect(result.url).toContain('civ=Mayans');
  });
  it.each([
    ['archers-19', 'Mayans', '玛雅'],
    ['fast-castle-knights', 'Franks', '法兰克'],
  ])('%s/%s原basis不增加玛雅骑兵模板说明', (boId, civ, zh) => {
    expect(card(boId!, civ!, zh!).basis).toBe(`按${zh}计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}`);
  });
});
