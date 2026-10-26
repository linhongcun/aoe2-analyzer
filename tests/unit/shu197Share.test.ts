import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { buildView } from '../../src/features/builds/timelineModel';
import { buildShareCard } from '../../src/features/builds/shareCard';

const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const knightNote = '蜀不能训练骑士；骑士方案仅供通用模板经济估算。';
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
describe('#197 蜀分享保留合法性边界', () => {
  it('蜀骑士模板卡片basis携带明确限制，同一model同时供预览和PNG绘制', () => {
    const result = card('fast-castle-knights', 'Shu', '蜀');
    expect(result.basis).toBe(`按蜀计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}\n${knightNote}`);
    expect(result.url).toContain('civ=Shu');
  });
  it.each([
    ['archers-19', 'Shu', '蜀'],
    ['fast-castle-knights', 'Franks', '法兰克'],
    ['fast-castle-knights', 'Portuguese', '葡萄牙'],
  ])('%s/%s旧basis逐字保留，不把蜀的限制加到其它卡片', (boId, civ, zh) => {
    expect(card(boId!, civ!, zh!).basis).toBe(`按${zh}计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}`);
  });
});
