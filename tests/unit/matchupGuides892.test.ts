import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import mixedArmy from '../../src/content/mixed-army.json';
import { CASTLE_OBSERVATIONS } from '../../src/domain/castleDefense';
import { SCOUTING_SCENARIOS } from '../../src/domain/scouting';
import { PAGES } from '../../src/shared/nav/pageRegistry';
import { ALL } from '../../src/shared/nav/sections';

const guide = (key: string) => PAGES.find((page) => page.key === key);

describe('#892 三份有限指南归入对局助手', () => {
  it('首页和导航不再并列这三份指南，旧地址跳到对应分区', () => {
    for (const key of ['scouting', 'mixed-army', 'castle-defense']) {
      const page = guide(key);
      expect(page?.lane, key).toBeUndefined();
      expect(page?.entry, key).toBe('none');
      expect(page?.path, key).toBe(`/matchup/${key}`);
      expect(
        ALL.some((section) => section.key === key),
        key,
      ).toBe(false);
      const redirect = guide(`${key}-redirect`);
      expect(redirect).toMatchObject({ kind: 'redirect', path: `/${key}`, redirectTo: `/matchup/${key}`, redirectKeepSearch: true, entry: 'none' });
    }
    expect(ALL.some((section) => section.key === 'matchup')).toBe(true);
    expect(ALL.some((section) => section.key === 'team-fit')).toBe(true);
    expect(ALL.some((section) => section.key === 'team-plan')).toBe(false);
    expect(guide('team-plan')).toMatchObject({ path: '/team-plan', entry: 'none', component: 'TeamPlan' });
    expect(ALL.some((section) => section.key === 'match-review')).toBe(true);
  });

  it('助手能到达原指南，且没有把评分建议加回去', () => {
    const matchup = readFileSync('src/features/matchup/components/Matchup.tsx', 'utf8');
    expect(matchup).toContain('to="/matchup/scouting"');
    expect(matchup).toContain('to="/matchup/mixed-army"');
    expect(matchup).toContain('to="/matchup/castle-defense"');
    expect(matchup).not.toContain('你的相对优势');
    expect(matchup).not.toContain('对手强项');
    expect(matchup).not.toContain('前期主动骚扰');
    expect(matchup).not.toContain('自动生成的建议');
    expect(SCOUTING_SCENARIOS).toHaveLength(2);
    expect(mixedArmy.scenarios).toHaveLength(2);
    expect(mixedArmy.cards).toHaveLength(6);
    expect(CASTLE_OBSERVATIONS).toHaveLength(3);
  });
});
