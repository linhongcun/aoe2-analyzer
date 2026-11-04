import { describe, expect, it } from 'vitest';
import {
  buildsMatchupReturn,
  buildsPath,
  duelCivs,
  matchupBuildPath,
  matchupPath,
  matchupUnitPath,
  readMatchupPair,
  writeMatchupPair,
  writeExplicitMatchupPair,
  explicitMatchupPath,
} from '../../src/domain/matchupRoute';

const query = (url: string) => new URLSearchParams(url.split('?')[1]);
const sticky = { me: 'Franks', opp: 'Japanese' };

describe('#520 matchup URL context', () => {
  it('prefers query over sticky and falls back independently for missing/unknown keys', () => {
    expect(readMatchupPair(new URLSearchParams('me=Mongols&opp=Chinese'), sticky)).toEqual({ me: 'Mongols', opp: 'Chinese', invalid: false });
    expect(readMatchupPair(new URLSearchParams('me=Mongols'), sticky)).toEqual({ me: 'Mongols', opp: 'Japanese', invalid: false });
    expect(readMatchupPair(new URLSearchParams('me=Unknown&opp=Chinese'), sticky)).toEqual({ me: 'Franks', opp: 'Chinese', invalid: true });
    expect(readMatchupPair(new URLSearchParams('me=&opp=unknown'), sticky)).toEqual({ ...sticky, invalid: true });
    expect(readMatchupPair(new URLSearchParams(), sticky)).toEqual({ ...sticky, invalid: false });
    expect(readMatchupPair(new URLSearchParams('me=Mongols&opp=Mongols'), sticky)).toEqual({ me: 'Mongols', opp: 'Mongols', invalid: false });
  });

  it('writes both sides without dropping the selected rush or mutating the source', () => {
    const source = new URLSearchParams('rush=scouts&me=Unknown');
    expect(writeMatchupPair(source, 'Mongols', 'Chinese').toString()).toBe('rush=scouts&me=Mongols&opp=Chinese');
    expect(source.toString()).toBe('rush=scouts&me=Unknown');
    expect(matchupPath('Mongols', 'Chinese')).toBe('/matchup?me=Mongols&opp=Chinese');
    expect(matchupPath()).toBe('/matchup');
  });

  it('round-trips both builds entries without swapping original me/opp semantics', () => {
    const own = matchupBuildPath('Mongols', 'Chinese', 'me');
    const opponent = matchupBuildPath('Mongols', 'Chinese', 'opp');
    expect(own).toBe('/builds?civ=Mongols&from=matchup&opp=Chinese');
    expect(opponent).toBe('/builds?civ=Chinese&from=matchup&me=Mongols');
    expect(buildsMatchupReturn(query(own))).toBe(matchupPath('Mongols', 'Chinese'));
    expect(buildsMatchupReturn(query(opponent))).toBe(matchupPath('Mongols', 'Chinese'));
    expect(buildsMatchupReturn(query(matchupBuildPath('Mongols', 'Chinese', 'me', 'archers-19')))).toBe(matchupPath('Mongols', 'Chinese'));
    expect(buildsMatchupReturn(new URLSearchParams('civ=Mongols&opp=Chinese'))).toBe(matchupPath('Mongols', 'Chinese'));
    expect(buildsMatchupReturn(new URLSearchParams('from=matchup'))).toBe('/matchup');
    expect(buildsMatchupReturn(new URLSearchParams('civ=Mongols&from=duel'))).toBeNull();
  });

  it('keeps civ when returning to the full builds list, and carries unit context', () => {
    expect(buildsPath('Mongols')).toBe('/builds?civ=Mongols');
    expect(buildsPath()).toBe('/builds');
    expect(buildsPath('Chinese', 'duel')).toBe('/builds?civ=Chinese&from=duel');
    expect(matchupUnitPath(4, 'Mongols', 'Chinese')).toBe('/unit/4?civ=Mongols&from=matchup&me=Mongols&opp=Chinese');
  });

  it('reads civs from existing PK packs and leaves failed or missing sides empty', () => {
    expect(duelCivs(new URLSearchParams('a=4.Mongols.2..&b=74.Chinese.2..'))).toEqual({ me: 'Mongols', opp: 'Chinese' });
    for (const raw of ['', 'oops', 'bad.Mongols.2..', '0.Mongols.2..', '4.Unknown.2..', '4..2..']) {
      expect(duelCivs(new URLSearchParams({ a: raw, b: '74.Chinese.2..' }))).toEqual({ me: undefined, opp: 'Chinese' });
    }
    expect(duelCivs(new URLSearchParams())).toEqual({ me: undefined, opp: undefined });
  });
});

describe('#672 显式部分对阵独立于legacy默认', () => {
  it.each([
    ['', '', null, null],
    ['Mongols', '', 'Mongols', null],
    ['', 'Japanese', null, 'Japanese'],
    ['Mongols', 'Japanese', 'Mongols', 'Japanese'],
    ['Mongols', 'Mongols', 'Mongols', 'Mongols'],
  ])('真实双方 %s/%s', (me, opp, a, b) => {
    const params = new URLSearchParams(explicitMatchupPath(me || null, opp || null).split('?')[1]);
    expect(readMatchupPair(params, sticky)).toEqual({ me: a, opp: b, invalid: false });
  });
  it.each([
    'pair=',
    'pair=other',
    'pair=explicit&pair=explicit',
    'pair=explicit&me=',
    'pair=explicit&opp=',
    'pair=explicit&me=Unknown',
    'pair=explicit&opp=Unknown',
    'pair=explicit&me=Mongols&me=Mongols',
    'pair=explicit&opp=Japanese&opp=Japanese',
  ])('拒绝整体坏对阵 %s', (raw) => expect(readMatchupPair(new URLSearchParams(raw), sticky)).toEqual({ me: null, opp: null, invalid: true }));
  it('清空删除键、恢复规范marker、保留rush及独立参数且不修改输入', () => {
    const source = new URLSearchParams('pair=bad&pair=explicit&me=Unknown&me=Franks&opp=Chinese&rush=scouts&x=1');
    const next = writeExplicitMatchupPair(source, null, 'Japanese');
    expect([...next.getAll('pair')]).toEqual(['explicit']);
    expect(next.has('me')).toBe(false);
    expect(next.get('opp')).toBe('Japanese');
    expect(next.get('rush')).toBe('scouts');
    expect(next.get('x')).toBe('1');
    expect(source.getAll('pair')).toHaveLength(2);
  });
});
