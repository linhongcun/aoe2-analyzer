// #289：「同一个时间全站一致」第 3/4 份（组合与检查见 formatTimeConsistency.ts）
import { describe, it } from 'vitest';
import { checkCombo, shardCombos } from './formatTimeConsistency';

const combos = shardCombos(3);
describe('同一个时间全站一致', () => {
  it.each(combos)('%s × %s', checkCombo);
});
