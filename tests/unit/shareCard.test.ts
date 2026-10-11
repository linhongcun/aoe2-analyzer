import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, WALK, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { formatClock } from '../../src/domain/formatTime';
import { buildView, rangeLabel, summaryText, pickSummaryBottleneck } from '../../src/features/builds/timelineModel';
import { buildShareCard, shareUrl, shortBoName, SHARE_DISABLED_NOTE } from '../../src/features/builds/shareCard';

/** #19 分享卡：卡片不自己算，和页面同一套函数（Jony SPEC v0.4） */
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const AGE = ['', '', 'feudal', 'castle', 'imperial'] as const;
const AGE_ZH = ['', '黑暗', '封建', '城堡', '帝王'];
function card(id: string, civ: string, civZh: string, house = true, dist: number = WALK.default) {
  const bo = buildOrders.find((b) => b.id === id)!;
  const tl = simulateBuild(bo, civ, eco as unknown as EcoData, ups, { walkTiles: dist, autoHouses: house });
  const view = buildView(tl, (x) => x);
  const target = view.ages.find((a) => a.age === AGE[bo.target.age]);
  const targetZh = AGE_ZH[bo.target.age]!;
  const c = buildShareCard({
    view,
    target,
    boId: id,
    boNameZh: bo.name.zh,
    civEn: civ,
    civZh,
    targetZh,
    dist,
    defaultDist: WALK.default,
    house,
    patchBuild: __DATA_SOURCES__.patch.build,
    siteRoot: 'linhongcun.github.io/aoe2-analyzer/',
  });
  return { c, view, target, targetZh, tl };
}

describe('#19 分享卡 buildShareCard', () => {
  it('卡在木头：与页面摘要同函数输出逐字一致（fast-castle-boom · 法兰克）', () => {
    const { c, view, target, targetZh } = card('fast-castle-boom', 'Franks', '法兰克');
    const sum = summaryText(pickSummaryBottleneck(view.bottlenecks), targetZh);
    expect(c.cells[0]).toEqual({
      label: `到达${targetZh}`,
      value: `约 ${formatClock(target!.reachAt)}`,
      accent: true,
      sub: rangeLabel(target!.reachAt, target!.errSec),
    });
    expect(c.cells[1]).toEqual({ label: '主要卡点', value: sum.main, accent: true, sub: sum.sub });
    expect(c.cells[2]).toEqual({ label: '城镇中心闲置', value: `约 ${formatClock(view.tcIdleTotal)}`, accent: false, sub: null });
    // Jony 验收要点 1（SPEC）
    expect(c.title).toBe('法兰克·速升城堡暴经济，约 15:32 到城堡，卡在木头');
    expect(c.cells.map((x) => [x.value, x.sub])).toEqual([
      ['约 15:32', '误差 14:33–17:15'],
      ['卡在木头 约 6:02', '第 5 步'],
      ['约 0:43', null],
    ]);
    expect(c.basis).toBe(`按法兰克计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}`);
    expect(c.url).toBe('linhongcun.github.io/aoe2-analyzer/#/builds?bo=fast-castle-boom&civ=Franks');
  });

  it('卡人口：显示开始时间；无范围时误差行为 null（整行不渲染）（scouts-18 · 法兰克 · 关自动建房）', () => {
    const { c } = card('scouts-18', 'Franks', '法兰克', false);
    expect(c.title).toBe('法兰克·18 人口侦察骑兵速攻，约 9:13 到封建，卡人口');
    expect(c.cells[0].sub).toBeNull();
    expect(c.cells.map((x) => x.value)).toEqual(['约 9:13', '卡人口 约 11:09 起', '约 0:00']);
    expect(c.cells[1].sub).toBe('第 13 步');
    expect(c.basis).toContain('关自动建房');
    expect(c.url).toMatch(/&house=0$/);
  });

  it('琥珀最多 2 处', () => {
    for (const b of buildOrders) {
      const { c } = card(b.id, 'Franks', '法兰克');
      expect(c.cells.filter((x) => x.accent).length).toBeLessThanOrEqual(2);
      expect(c.cells[2].accent).toBe(false);
    }
  });

  it('游戏版本来自 data_sources（不硬编码）', () => {
    expect(card('scouts-18', 'Franks', '法兰克').c.basis).toMatch(new RegExp(`游戏版本 ${__DATA_SOURCES__.patch.build}$`));
  });

  it('深链：dist / house 非默认才追加；通用不带 civ', () => {
    const base = { siteRoot: 's/', boId: 'x', civEn: 'Franks', defaultDist: 4 };
    expect(shareUrl({ ...base, dist: 4, house: true })).toBe('s/#/builds?bo=x&civ=Franks');
    expect(shareUrl({ ...base, dist: 7, house: false })).toBe('s/#/builds?bo=x&civ=Franks&dist=7&house=0');
    expect(shareUrl({ ...base, civEn: '', dist: 4, house: true })).toBe('s/#/builds?bo=x');
    expect(card('scouts-18', 'Franks', '法兰克', true, 7).c.basis).toContain('走路 7 格');
  });

  it('开局名去掉末尾括号补充；中间括号保留', () => {
    expect(shortBoName('速升城堡暴经济（23+2）')).toBe('速升城堡暴经济');
    expect(shortBoName('18 人口民兵升级武士（Man-at-Arms）速攻转弓手')).toBe('18 人口民兵升级武士（Man-at-Arms）速攻转弓手');
  });

  it('置灰说明逐字', () => {
    expect(SHARE_DISABLED_NOTE).toBe('加成未计入，暂不能生成分享卡');
  });
});
