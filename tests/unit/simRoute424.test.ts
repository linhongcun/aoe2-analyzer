import { expect, it } from 'vitest';
import { parseUnitPath, unitPath } from '../../src/domain/simRoute';

it('#424 默认入口明确单位、文明、时代与空科技，不依赖效果数据', () => {
  const path = unitPath(38, 'Franks', 4, [], []);
  expect(path).toBe('/unit/38/Franks/4//');
  expect(parseUnitPath(path)).toEqual({ id: 38, civ: 'Franks', age: 4, ids: [], team: [] });
});
