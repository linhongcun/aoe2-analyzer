import { describe, expect, it } from 'vitest';
import trees from '../../src/data/trees.json';
import { civStatus } from '../../src/domain/simulator';
import type { Trees } from '../../src/domain/types';
import { tech } from './helpers';

const T = trees as unknown as Trees;
const has = (civ: string, en: string) => civStatus(T, civ)['t' + tech(en).id] === 1;

describe('tech availability (vs aoe2techtree + AoE2 Fandom Wiki availability charts)', () => {
  it('Byzantines lack Masonry and Architecture (wiki: "All except Aztecs, Byzantines, Tupi")', () => {
    expect(has('Byzantines', 'Masonry')).toBe(false);
    expect(has('Byzantines', 'Architecture')).toBe(false);
    expect(has('Byzantines', 'Hoardings')).toBe(true);
    expect(has('Tupi', 'Masonry')).toBe(false);
    expect(has('Britons', 'Masonry')).toBe(true);
  });
  it('Aztecs lack Hoardings; Britons lack Thumb Ring; Franks lack Bracer', () => {
    expect(has('Aztecs', 'Hoardings')).toBe(false);
    expect(has('Britons', 'Thumb Ring')).toBe(false);
    expect(has('Franks', 'Bracer')).toBe(false);
    expect(has('Mongols', 'Thumb Ring')).toBe(true);
  });
  it('building nodes in tech trees (Fish Trap, Malay Harbor) are typed as buildings, not techs', () => {
    const cells = Object.values(T.t).flatMap((bl) => bl.flatMap((b) => b[3]));
    expect(cells.some((c) => c[2] === 't' && c[3] === 1189)).toBe(false);
    expect(cells.some((c) => c[2] === 'b' && c[3] === 199)).toBe(true);
    // Fish Trap (building 199) must not overwrite Fletching (tech 199) availability
    expect(has('Britons', 'Fletching')).toBe(true);
  });
});
