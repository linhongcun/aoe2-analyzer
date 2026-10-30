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
