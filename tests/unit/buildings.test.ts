import { describe, expect, it } from 'vitest';
import raw from '../../src/data/buildings.json';
import { buildingDlc, buildingType } from '../../src/domain/buildings';
import { buildLinker, linkify } from '../../src/domain/linker';
import type { Building } from '../../src/domain/types';
import { techs, units } from './helpers';

const bs = (raw as unknown as Omit<Building, 'dlc' | 'type'>[]).map((b) => ({ ...b, dlc: buildingDlc(b), type: buildingType(b.en) })) as Building[];
const by = (en: string) => bs.find((b) => b.en === en)!;

describe('buildings data', () => {
  it('38 buildings, every one available to at least one civ', () => {
    expect(bs.length).toBe(38);
    bs.forEach((b) => expect(b.civs.length, b.en).toBeGreaterThan(0));
  });
  it('includes civ-specific buildings', () => {
    for (const n of [
      'Krepost',
      'Donjon',
      'Folwark',
      'Feitoria',
      'Caravanserai',
      'Harbor',
      'Mule Cart',
      'Settlement',
      'Fortified Church',
      'Wonder',
      'Gate',
      'House',
    ])
      expect(by(n), n).toBeTruthy();
  });
  it('Castle stats and contents', () => {
    const c = by('Castle');
    expect([c.hp, c.pa, c.pop]).toEqual([4800, 11, 20]);
    expect(c.civs.length).toBe(56);
    expect(c.units).toContain(units.find((u) => u.en === 'Trebuchet (Packed)')!.id);
  });
  it('availability is per tree data', () => {
    expect(by('Krepost').civs).toEqual(['Bulgarians']);
    expect(by('Feitoria').civs).toEqual(['Portuguese']);
    expect(by('Bombard Tower').civs.length).toBeLessThan(56);
  });
  it('DLC tags only where reliable', () => {
    expect(by('Krepost').dlc).toBe(5);
    expect(by('Feitoria').dlc).toBe(3);
    expect(by('Caravanserai').dlc).toBe(8);
    expect(by('Castle').dlc).toBe(0);
    expect(by('Bombard Tower').dlc).toBe(0);
  });
  it('type classification', () => {
    expect([by('Stable').type, by('Mill').type, by('Keep').type, by('University').type]).toEqual(['military', 'economy', 'defense', 'other']);
  });
  it('auto-linker links building names', () => {
    const L = buildLinker(units, techs, bs);
    const s = linkify('在马厩训练', L).find((x) => x.text === '马厩');
    expect(s?.href).toBe('building/101');
  });
});
