import { describe, expect, it } from 'vitest';
import { CIV_MECHANISM_KEYS } from '../../src/domain/buildSimMechanisms';
import { CIV_NOTES_KEYS } from '../../src/domain/buildSimNotes';

const MECHANISMS = [
  'Romans',
  'Poles',
  'Gurjaras',
  'Mapuche',
  'Chinese',
  'Jurchens',
  'Portuguese',
  'Shu',
  'Malians',
  'Varangians',
  'Tatars',
  'Mayans',
  'Franks',
  'Sicilians',
  'Wei',
  'Bengalis',
  'Armenians',
  'Georgians',
  'Slavs',
  'Khmer',
];
const NOTES = MECHANISMS.filter((civ) => civ !== 'Portuguese' && civ !== 'Franks');

describe('#794 机制注册表键集合', () => {
  it('导出的只读键集合与静态检查的基线一致', () => {
    expect(Object.isFrozen(CIV_MECHANISM_KEYS)).toBe(true);
    expect(Object.isFrozen(CIV_NOTES_KEYS)).toBe(true);
    expect([...CIV_MECHANISM_KEYS].sort()).toEqual([...MECHANISMS].sort());
    expect([...CIV_NOTES_KEYS].sort()).toEqual([...NOTES].sort());
  });
});
