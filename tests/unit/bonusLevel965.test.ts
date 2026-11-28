import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { allCivBonuses, civBonuses } from '../../src/domain/civBonus';
import { bonusLevel } from '../../src/domain/bonusUsage';

describe('#965 计入档与文明详情行同一判定', () => {
  const all = allCivBonuses(civs);

  it('281 条分成已计入 180、部分计入 18、仅文本 83；有计入是前两档之和', () => {
    const counts = { all: 0, part: 0, none: 0 };
    for (const bonus of all) counts[bonusLevel(bonus)] += 1;
    expect(all).toHaveLength(281);
    expect(counts).toEqual({ all: 180, part: 18, none: 83 });
    expect(counts.all + counts.part).toBe(198);
  });

  it('罗马第 1 条是部分计入', () => {
    const bonus = civBonuses(civs.find((civ) => civ.en === 'Romans')!).find((row) => row.idx === 0)!;
    expect(bonusLevel(bonus)).toBe('part');
  });
});
