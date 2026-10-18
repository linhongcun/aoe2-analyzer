import { describe, expect, it } from 'vitest';
import { units } from './helpers';

describe('#190 单位的首次引入版本', () => {
  it.each([
    [751, 2],
    [753, 1],
    [752, 1],
    [1747, 8],
    [1749, 8],
    [1302, 11],
    [1813, 10],
  ])('单位 %i 的版本为 %i', (id, release) => {
    expect(units.find((unit) => unit.id === id)?.dlc).toBe(release);
  });
});
