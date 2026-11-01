import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISPLAY_BRACKETS, type LadderSnapshot } from '../../src/domain/ladder';
import { canonicalLadderSearch, eloFilterOptions, sliceBracket, sliceFacts } from '../../src/domain/ladderQuery';

const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const team = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;

function franks(snapshot: LadderSnapshot) {
  for (const bracket of snapshot.brackets) {
    const civ = bracket.civs.find((item) => item.en === 'Franks');
    if (civ) return { games: bracket.games, winRate: civ.winRate, sample: civ.games };
  }
  throw new Error('缺少 Franks');
}

describe('天梯模式与 Elo 只读已有快照 #571', () => {
  it('两份已有切片的胜率和样本量不同', () => {
    const four = sliceBracket('4v4', 'all', arabia, team);
    const one = sliceBracket('arabia1v1', 'all', arabia, team);
    const franks4 = franks(team);
    const franks1 = franks(arabia);
    expect(four.empty).toBe(false);
    expect(one.empty).toBe(false);
    expect(four.games).toBe(franks4.games);
    expect(one.games).toBe(franks1.games);
    expect(four.games).not.toBe(one.games);
    expect(franks4.winRate).not.toBe(franks1.winRate);
    expect(franks4.sample).not.toBe(franks1.sample);
  });

  it('没有快照的 Elo 档没有胜率', () => {
    for (const band of DISPLAY_BRACKETS) {
      if (band.key === 'all') continue;
      expect(sliceBracket('arabia1v1', band.key, arabia, team).civs).toEqual([]);
      expect(sliceBracket('4v4', band.key, arabia, team).civs).toEqual([]);
    }
    expect(sliceBracket('4v4', 'not-a-band', arabia, team).civs).toEqual([]);
  });

  it('有数据的档可选，空档停用；当前档跟着模式走', () => {
    const onTeam = eloFilterOptions('4v4', 'all', arabia, team);
    expect(onTeam.find((option) => option.current)).toMatchObject({ key: '1200-1400', mode: '4v4', enabled: true, elo: 'all' });
    expect(onTeam.find((option) => option.key === 'all')).toMatchObject({ mode: 'arabia1v1', enabled: true, current: false, elo: 'all' });
    expect(onTeam.filter((option) => !option.enabled).map((option) => option.key)).toEqual(['lt850', '850-1000', '1000-1200', '1200+', '1900+']);
    const onArabia = eloFilterOptions('arabia1v1', 'all', arabia, team);
    expect(onArabia.find((option) => option.current)?.key).toBe('all');
    expect(onArabia.find((option) => option.key === '1200-1400')).toMatchObject({ mode: '4v4', enabled: true, current: false });
  });

  it('选中有数据的档会切到那份快照，空档不能当成当前表', () => {
    const toArabia = eloFilterOptions('4v4', 'all', arabia, team).find((option) => option.key === 'all');
    const toTeam = eloFilterOptions('arabia1v1', 'all', arabia, team).find((option) => option.key === '1200-1400');
    expect(toArabia && canonicalLadderSearch({ mode: toArabia.mode, elo: toArabia.elo, pendingView: null })).toBe('?mode=arabia1v1');
    expect(toTeam && canonicalLadderSearch({ mode: toTeam.mode, elo: toTeam.elo, pendingView: 'tiers' })).toBe('?view=tiers');
    const blocked = eloFilterOptions('4v4', 'all', arabia, team).find((option) => option.key === 'lt850');
    expect(blocked?.enabled).toBe(false);
    expect(sliceBracket('arabia1v1', 'lt850', arabia, team).empty).toBe(true);
  });

  it('同一模式下换 Elo 时，来源条的地图字段还在', () => {
    const low = {
      ...arabia,
      brackets: [
        ...arabia.brackets,
        {
          key: 'lt850',
          label: '<850',
          games: 3,
          civs: [{ en: 'Franks', winRate: 41, playRate: 1, games: 3 }],
        },
      ],
    } satisfies LadderSnapshot;
    const allFacts = sliceFacts('arabia1v1', 'all', low, team);
    const lowFacts = sliceFacts('arabia1v1', 'lt850', low, team);
    expect(allFacts).toMatchObject({ modeLabel: '阿拉伯 1v1', eloLabel: '全部', mapLabel: '阿拉伯' });
    expect(lowFacts.eloLabel).toBe('<850');
    expect(lowFacts.mapLabel).toBe(allFacts.mapLabel);
    expect(lowFacts.modeLabel).toBe(allFacts.modeLabel);
    expect(sliceBracket('arabia1v1', 'lt850', low, team).civs[0]?.winRate).toBe(41);
    expect(sliceBracket('arabia1v1', 'all', low, team).games).not.toBe(3);
    expect(sliceFacts('4v4', 'all', arabia, team)).toMatchObject({
      modeLabel: '4v4 随机地图',
      eloLabel: '1200–1400',
      mapLabel: '全图',
      eloKey: '1200-1400',
    });
  });
});
