import { describe, expect, it } from 'vitest';
import civsRaw from '../../data/game/civs.json';
import { civUniqueTechs } from '../../src/domain/civKit';
import { CIV_DLC, DLCS, dlcMatch } from '../../src/domain/dlc';
import { buildLinker, linkify } from '../../src/domain/linker';
import { strengths } from '../../src/domain/ratings';
import type { Civ } from '../../src/domain/types';
import { techs, units } from './helpers';

const civs = civsRaw as unknown as Civ[];
describe('DLC mapping', () => {
  it('14 expansions, counts match release list', () => {
    expect(DLCS.map((d) => d.civs.length)).toEqual([13, 5, 5, 4, 4, 4, 2, 2, 3, 1, 2, 5, 3, 3]);
  });
  it('every one of the 56 civs maps to exactly one DLC', () => {
    expect(civs.length).toBe(56);
    civs.forEach((c) => expect(CIV_DLC[c.en], c.en).toBeTypeOf('number'));
    expect(Object.keys(CIV_DLC).length).toBe(56);
  });
  it('unit forms use their own introduction, including original base-game units', () => {
    expect(units.find((u) => u.en === 'Eagle Warrior')!.dlc).toBe(1);
    const cs = units.find((u) => u.en === 'Throwing Axeman')!;
    expect(cs.dlc).toBe(0);
    expect(units.find((u) => u.en === 'Knight')!.dlc).toBe(0);
  });
  it('filter', () => {
    expect(dlcMatch(null, 'none')).toBe(true);
    expect(dlcMatch(3, '3')).toBe(true);
    expect(dlcMatch(3, '')).toBe(true);
    expect(dlcMatch(3, '2')).toBe(false);
  });
});

describe('auto-linker', () => {
  const L = buildLinker(units, techs);
  it('links unit and tech names, longest first', () => {
    const pal = units.find((u) => u.en === 'Paladin')!.zh;
    const text = `骑士和${pal}研究血统`;
    const segs = linkify(text, L);
    const linked = segs.filter((s) => s.href).map((s) => s.text);
    expect(linked).toContain(pal);
    expect(linked).toContain('血统');
    expect(segs.find((s) => s.text === '血统')?.href).toMatch(/^tech\//);
    expect(segs.map((s) => s.text).join('')).toBe(text);
  });
  it('plain text passes through', () => {
    expect(linkify('无关文本', L)).toEqual([{ text: '无关文本' }]);
  });
  it('strengths returns top3/bottom3', () => {
    const [s, w] = strengths(civs[16]!);
    expect(s).toHaveLength(3);
    expect(w).toHaveLength(3);
  });
});

it('finds the Frank castle and imperial unique techs in the technology catalog', () => {
  expect(civUniqueTechs('Franks', techs).map(({ age, en, type }) => ({ age, en, type }))).toEqual([
    { age: 3, en: 'Ordonnance Companies', type: 'UniqueTech' },
    { age: 4, en: 'Chivalry', type: 'UniqueTech' },
  ]);
});
