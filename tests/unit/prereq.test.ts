import { describe, expect, it } from 'vitest';
import { prereqChain, toggleTech } from '../../src/domain/prereq';
import { tech, techById } from './helpers';

describe('prerequisite resolver', () => {
  const F = tech('Fletching'),
    B = tech('Bodkin Arrow'),
    R = tech('Bracer');
  const avail = [F, B, R];
  it('Bracer chain = Bodkin, Fletching', () => {
    expect(prereqChain(R, techById).map((t) => t.en)).toEqual(['Bodkin Arrow', 'Fletching']);
  });
  it('selecting Bracer auto-selects Fletching and Bodkin', () => {
    expect([...toggleTech(R.id, new Set(), avail, techById)].sort()).toEqual([F.id, B.id, R.id].sort());
  });
  it('deselecting Fletching cascades', () => {
    expect(toggleTech(F.id, new Set([F.id, B.id, R.id]), avail, techById).size).toBe(0);
  });
  it('deselecting Bracer keeps earlier ones', () => {
    expect([...toggleTech(R.id, new Set([F.id, B.id, R.id]), avail, techById)].sort()).toEqual([F.id, B.id].sort());
  });
});
