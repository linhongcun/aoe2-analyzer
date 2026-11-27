import { describe, expect, it } from 'vitest';
import { SIEGE_EVIDENCE, type SiegeCombatEvidence } from '../../src/data/siege';
import { CORE } from '../../src/data/core';
import { calculateSiege, decodeSiege, encodeSiege, SIEGE_COMPARE_IDS, siegeUnitEntryVerified } from '../../src/domain/siege';
import { siegeEvidenceDamage, verifiedSiegeInputs } from '../../src/domain/siegeEvidence';

const cannon = CORE.unitById[36]!;
const castle = CORE.buildingById[82]!;
const keep = CORE.buildingById[235]!;
const attacker = SIEGE_EVIDENCE.attacker;
const defender = SIEGE_EVIDENCE.buildings['82']!;

describe('#1064 pinned direct cannon hit', () => {
  // Independent arithmetic from the full raw tables, not calculator output:
  // Castle: (200-8)+(40-8)=224. No class 13 -> actual base armour 10000.
  // Keep: (200-0)+(40-3)+(40-0)=277. Explicit class 13 armour 0.
  // Both: other attack classes <= base armour; reload 6.5; first volley t=0.
  it.each([
    [82, 1, 224, 22, 136.5],
    [82, 2, 224, 11, 65],
    [82, 40, 224, 1, 0],
    [235, 1, 277, 9, 52],
    [235, 2, 277, 5, 26],
    [235, 40, 277, 1, 0],
  ])('building %i n=%i matches independent expected damage/volleys/time', (id, n, damage, hits, seconds) => {
    for (const civ of ['', 'Turks']) {
      expect(calculateSiege(cannon, CORE.buildingById[id]!, n, civ)).toEqual({
        verified: true,
        damage,
        hits,
        gameSeconds: seconds,
        realSeconds: seconds / 1.7,
      });
    }
  });

  it('distinguishes explicit zero, complete absence, and uncollected armour', () => {
    expect(defender.armors.some(([id]) => id === 13)).toBe(false);
    expect(SIEGE_EVIDENCE.buildings['235']!.armors.find(([id]) => id === 13)).toEqual([13, 0]);
    expect(siegeEvidenceDamage(attacker, defender)).toBe(224);
    expect(siegeEvidenceDamage(attacker, { ...defender, armors: [...defender.armors, [13, 0]] })).toBe(264);
    expect(siegeEvidenceDamage(attacker, { ...defender, armorsComplete: false })).toBeUndefined();
    expect(siegeEvidenceDamage({ ...attacker, attacksComplete: false }, defender)).toBeUndefined();
    // The fallback is the actual base armour, not a class-name skip list.
    expect(siegeEvidenceDamage({ ...attacker, attacks: [[13, 10010]] }, defender)).toBe(10);
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite raw, catalog and modifier data (%s)', (bad) => {
    for (const d of [
      { ...defender, baseArmor: bad },
      { ...defender, armors: [[4, bad]] },
      { ...defender, modifiers: { ...defender.modifiers, reflection: bad } },
    ])
      expect(siegeEvidenceDamage(attacker, d)).toBeUndefined();
    expect(siegeEvidenceDamage({ ...attacker, attacks: [[4, bad]] }, defender)).toBeUndefined();
    expect(calculateSiege({ ...cannon, rof: bad }, castle, 2, 'Turks').verified).toBe(false);
    expect(calculateSiege(cannon, { ...castle, hp: bad }, 2, 'Turks').verified).toBe(false);
    expect(calculateSiege(cannon, { ...keep, ma: bad }, 2, 'Turks').verified).toBe(false);
  });

  it('rejects malformed classes, changed modifiers and missing audit flags', () => {
    for (const d of [
      { ...defender, armors: [] },
      { ...defender, armors: [[4]] },
      {
        ...defender,
        armors: [
          [4, 8],
          [4, 8],
        ],
      },
      { ...defender, modifiersVerified: false },
      { ...defender, modifiers: { ...defender.modifiers, unknownMultiplier: 1 } },
      { ...defender, modifiers: { ...defender.modifiers, bonusResistance: 0.5 } },
    ])
      expect(siegeEvidenceDamage(attacker, d)).toBeUndefined();
    for (const key of ['blastDamage', 'projectiles', 'secondaryProjectile', 'specialAbility', 'chargeType', 'chargeEvent', 'rear', 'flank']) {
      expect(siegeEvidenceDamage({ ...attacker, modifiers: { ...attacker.modifiers, [key]: 2 } }, defender), key).toBeUndefined();
    }
    const incomplete = { ...defender, baseArmor: undefined } as unknown as SiegeCombatEvidence;
    expect(siegeEvidenceDamage(attacker, incomplete)).toBeUndefined();
  });

  it('never grants coverage from numeric records alone', () => {
    expect(verifiedSiegeInputs(cannon, castle, 'Turks', [], { ...SIEGE_EVIDENCE, coverage: [] })).toBeUndefined();
    expect(verifiedSiegeInputs(cannon, castle, 'Turks', [], { ...SIEGE_EVIDENCE, schemaVersion: 99 })).toBeUndefined();
    expect(
      verifiedSiegeInputs(cannon, castle, 'Turks', [], {
        ...SIEGE_EVIDENCE,
        coverage: SIEGE_EVIDENCE.coverage.map((c) => ({ ...c, status: 'unverified' })),
      }),
    ).toBeUndefined();
    expect(verifiedSiegeInputs(cannon, castle, 'Turks', [], { ...SIEGE_EVIDENCE, buildings: {} })).toBeUndefined();
    for (const armor of [[50], [51], [50, 51], [999]]) {
      const result = calculateSiege(cannon, castle, 2, 'Turks', armor);
      expect(result.verified).toBe(false);
      expect(result).not.toHaveProperty('hits');
    }
    expect(calculateSiege(cannon, castle, 2, 'Portuguese').verified).toBe(false);
    expect(calculateSiege(cannon, castle, 2, 'Unknown').verified).toBe(false);
    expect(calculateSiege({ ...cannon, atks: [...cannon.atks, ['未收录类别', 40]] }, castle, 2).verified).toBe(false);
  });

  it('keeps valid selected techs/civs in URLs while independently refusing unsupported results', () => {
    const config = decodeSiege('?unit=36&n=2&bldg=82&civ=Portuguese&armor=50', CORE);
    expect(config).toEqual({ unit: 36, n: 2, bldg: 82, civ: 'Portuguese', armor: [50], techs: [] });
    expect(decodeSiege('?' + encodeSiege(config), CORE)).toEqual(config);
    expect(calculateSiege(cannon, castle, config.n, config.civ, config.armor).verified).toBe(false);
  });

  it('grants the existing cannon detail entry from audited base castle coverage only', () => {
    expect(siegeUnitEntryVerified(cannon, castle)).toBe(true);
    for (const id of [280, 550, 588]) {
      expect(siegeUnitEntryVerified(CORE.unitById[id]!, castle)).toBe(false);
      expect(calculateSiege(CORE.unitById[id]!, keep, 2, 'Turks').verified).toBe(false);
    }
  });

  it('only restores the castle comparison row, leaving other rows unknown', () => {
    expect(SIEGE_COMPARE_IDS.map((id) => [id, calculateSiege(cannon, CORE.buildingById[id]!, 2, 'Turks').verified])).toEqual([
      [109, false],
      [82, true],
      [79, false],
      [117, false],
      [487, false],
    ]);
  });

  it('preserves adjacent trebuchet and ram ideal results', () => {
    expect(calculateSiege(CORE.unitById[331]!, castle, 2, 'Turks')).toMatchObject({ verified: true, hits: 6, gameSeconds: 50, damage: 431 });
    expect(calculateSiege(CORE.unitById[1258]!, castle, 4)).toMatchObject({ verified: true, hits: 9, gameSeconds: 40, damage: 142 });
    expect(calculateSiege(CORE.unitById[1258]!, CORE.buildingById[109]!, 1)).toMatchObject({ verified: true, hits: 16, gameSeconds: 75, damage: 150 });
  });
});
