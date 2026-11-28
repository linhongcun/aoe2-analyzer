import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { SIEGE_EVIDENCE, type SiegeCombatEvidence } from '../../src/data/siege';
import { CORE } from '../../src/data/core';
import { calculateSiege, decodeSiege, encodeSiege, SIEGE_COMPARE_IDS, siegeUnitEntryVerified } from '../../src/domain/siege';
import { siegeEvidenceDamage, verifiedSiegeInputs } from '../../src/domain/siegeEvidence';

const cannon = CORE.unitById[36]!;
const castle = CORE.buildingById[82]!;
const keep = CORE.buildingById[235]!;
const tc = CORE.buildingById[109]!;
const barracks = CORE.buildingById[12]!;
const attacker = SIEGE_EVIDENCE.attacker;
const defender = SIEGE_EVIDENCE.buildings['82']!;

const CANNON_CIVS = [
  'Berbers',
  'Bohemians',
  'Burgundians',
  'Burmese',
  'Byzantines',
  'Dravidians',
  'Ethiopians',
  'Franks',
  'Goths',
  'Gurjaras',
  'Hindustanis',
  'Italians',
  'Jurchens',
  'Koreans',
  'Lithuanians',
  'Malay',
  'Malians',
  'Persians',
  'Poles',
  'Portuguese',
  'Saracens',
  'Spanish',
  'Teutons',
  'Turks',
  'Vietnamese',
] as const;

const NEUTRAL_CIVS = ['', ...CANNON_CIVS.filter((c) => c !== 'Burgundians' && c !== 'Spanish')];
const ARMOR_BUILDINGS = [82, 235, 109, 79, 234, 236] as const;
const WALL_GATE_BUILDINGS = [117, 155, 487] as const;
const ALL_COVERED_BUILDINGS = [...ARMOR_BUILDINGS, ...WALL_GATE_BUILDINGS] as const;
const LEGAL_ARMOR_COMBOS: readonly (readonly number[])[] = [[], [50], [51], [50, 51]];

describe('#1064 / #1489 pinned direct cannon hit', () => {
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
    for (const civ of ['', 'Turks', 'Ethiopians', 'Portuguese']) {
      expect(calculateSiege(cannon, CORE.buildingById[id]!, n, civ)).toEqual({
        verified: true,
        damage,
        hits,
        gameSeconds: seconds,
        realSeconds: seconds / 1.7,
      });
    }
  });

  it('验收 1（基础 23 国 + 不限文明）：9 座核心建筑与石工/建筑学精确算例', () => {
    const cases: readonly [number, readonly number[], number, number, number, string][] = [
      [82, [], 224, 6, 32.5, '19.1'],
      [82, [50], 220, 6, 32.5, '19.1'],
      [82, [51], 220, 6, 32.5, '19.1'],
      [82, [50, 51], 216, 7, 39, '22.9'],
      [235, [], 277, 3, 13, '7.6'],
      [235, [50, 51], 269, 3, 13, '7.6'],
      [109, [], 237, 3, 13, '7.6'],
      [109, [50, 51], 229, 4, 19.5, '11.5'],
      [79, [], 279, 1, 0, '0.0'],
      [234, [], 278, 2, 6.5, '3.8'],
      [236, [], 277, 3, 13, '7.6'],
      [117, [], 256, 2, 6.5, '3.8'],
      [155, [], 244, 4, 19.5, '11.5'],
      [487, [], 260, 2, 6.5, '3.8'],
    ];
    for (const civ of NEUTRAL_CIVS) {
      for (const [bid, armor, damage, hits, gameSeconds, realText] of cases) {
        const res = calculateSiege(cannon, CORE.buildingById[bid]!, 4, civ, armor);
        expect(res, `${civ || 'no-civ'} bldg=${bid} armor=${armor.join(',')}`).toMatchObject({
          verified: true,
          damage,
          hits,
          gameSeconds,
        });
        if (res.verified) expect(res.realSeconds.toFixed(1)).toBe(realText);
      }
    }
    // 无序合法护甲参数 [51, 50] 与 [50, 51] 同值
    expect(calculateSiege(cannon, castle, 4, 'Ethiopians', [51, 50])).toEqual(calculateSiege(cannon, castle, 4, 'Ethiopians', [50, 51]));
  });

  it('验收 1（勃艮第 +25% 攻击与西班牙 +18% 攻速）：精确算例与页面展示精度一致', () => {
    const burgundiansCases: readonly [number, readonly number[], number, number, number, string][] = [
      [82, [], 284, 5, 26, '15.3'],
      [82, [50, 51], 276, 6, 32.5, '19.1'],
      [235, [], 347, 2, 6.5, '3.8'],
      [235, [50, 51], 339, 3, 13, '7.6'],
      [109, [50, 51], 289, 3, 13, '7.6'],
      [117, [], 326, 1, 0, '0.0'],
      [155, [], 314, 3, 13, '7.6'],
    ];
    for (const [bid, armor, damage, hits, gameSeconds, realText] of burgundiansCases) {
      const res = calculateSiege(cannon, CORE.buildingById[bid]!, 4, 'Burgundians', armor);
      expect(res, `Burgundians bldg=${bid} armor=${armor.join(',')}`).toMatchObject({
        verified: true,
        damage,
        hits,
        gameSeconds,
      });
      if (res.verified) expect(res.realSeconds.toFixed(1)).toBe(realText);
    }

    // 西班牙：interval = 6.5 * 0.85 = 5.525s
    const spaCastle = calculateSiege(cannon, castle, 4, 'Spanish');
    expect(spaCastle).toMatchObject({ verified: true, damage: 224, hits: 6 });
    if (spaCastle.verified) {
      expect(spaCastle.gameSeconds).toBe(27.625);
      expect(String(Number(spaCastle.gameSeconds.toFixed(2)))).toBe('27.63');
      expect(spaCastle.realSeconds.toFixed(1)).toBe('16.3');
    }

    const spaCastleArmored = calculateSiege(cannon, castle, 4, 'Spanish', [50, 51]);
    expect(spaCastleArmored).toMatchObject({ verified: true, damage: 216, hits: 7 });
    if (spaCastleArmored.verified) {
      expect(spaCastleArmored.gameSeconds).toBeCloseTo(33.15, 10);
      expect(String(Number(spaCastleArmored.gameSeconds.toFixed(2)))).toBe('33.15');
      expect(spaCastleArmored.realSeconds.toFixed(1)).toBe('19.5');
    }

    for (const bid of [235, 109, 236]) {
      const res = calculateSiege(cannon, CORE.buildingById[bid]!, 4, 'Spanish');
      expect(res, `Spanish bldg=${bid}`).toMatchObject({ verified: true, hits: 3 });
      if (res.verified) {
        expect(res.gameSeconds).toBeCloseTo(11.05, 10);
        expect(String(Number(res.gameSeconds.toFixed(2)))).toBe('11.05');
        expect(res.realSeconds.toFixed(1)).toBe('6.5');
      }
    }
  });

  it('验收 2：全部 26 文明 × 9 建筑 × 合法护甲（702 组合）全通过，且非覆盖组合一律 fail-closed', () => {
    expect([...cannon.civs].sort()).toEqual([...CANNON_CIVS]);
    const coveredCivs = ['', ...CANNON_CIVS];
    let verifiedCount = 0;

    for (const civ of coveredCivs) {
      for (const bid of ARMOR_BUILDINGS) {
        const b = CORE.buildingById[bid]!;
        for (const armor of LEGAL_ARMOR_COMBOS) {
          const res = calculateSiege(cannon, b, 4, civ, armor);
          expect(res.verified, `${civ || 'no-civ'} bldg=${bid} armor=${armor.join(',')}`).toBe(true);
          if (res.verified) {
            expect(res.damage).toBeGreaterThan(0);
            expect(res.hits).toBeGreaterThanOrEqual(1);
            expect(Number.isFinite(res.gameSeconds)).toBe(true);
            expect(Number.isFinite(res.realSeconds)).toBe(true);
          }
          verifiedCount++;
        }
      }
      for (const bid of WALL_GATE_BUILDINGS) {
        const b = CORE.buildingById[bid]!;
        expect(calculateSiege(cannon, b, 4, civ, []).verified, `${civ || 'no-civ'} wall/gate=${bid}`).toBe(true);
        verifiedCount++;
        for (const badArmor of [[50], [51], [50, 51]]) {
          const res = calculateSiege(cannon, b, 4, civ, badArmor);
          expect(res.verified, `${civ || 'no-civ'} wall/gate=${bid} badArmor=${badArmor.join(',')}`).toBe(false);
          expect(res).not.toHaveProperty('hits');
        }
      }
    }
    expect(verifiedCount).toBe(702);

    // 全部 31 个不可训练手推炮文明（含 Britons/Aztecs/Chinese）及非法/原型键名均 fail-closed
    const nonCannonCivs = civs.map((c) => c.en).filter((en) => !cannon.civs.includes(en));
    expect(nonCannonCivs.length).toBe(civs.length - 25);
    for (const badCiv of [...nonCannonCivs, 'Unknown', 'toString', 'constructor']) {
      expect(calculateSiege(cannon, castle, 4, badCiv).verified, badCiv).toBe(false);
    }

    // 未收录建筑（含 12 兵营、70 房屋、1251 营垒、276 世界奇观及其余全部 29 座）均 fail-closed
    const coveredSet = new Set<number>(ALL_COVERED_BUILDINGS);
    for (const b of CORE.buildings) {
      if (coveredSet.has(b.id)) continue;
      expect(calculateSiege(cannon, b, 4, 'Ethiopians').verified, `uncovered bldg ${b.id}`).toBe(false);
    }
    for (const bid of [12, 70, 1251, 276]) {
      expect(calculateSiege(cannon, CORE.buildingById[bid]!, 4, '').verified, `bldg ${bid}`).toBe(false);
    }

    // 重复护甲 ID、未知护甲 ID 与手推炮攻方科技均 fail-closed
    for (const badArmor of [[50, 50], [999], [50, 999]]) {
      expect(calculateSiege(cannon, castle, 4, 'Turks', badArmor).verified, `badArmor=${badArmor.join(',')}`).toBe(false);
    }
    expect(calculateSiege(cannon, castle, 4, 'Ethiopians', [], [377]).verified).toBe(false);
  });

  it('distinguishes explicit zero, complete absence, and uncollected armour', () => {
    expect(defender.armors.some(([id]) => id === 13)).toBe(false);
    expect(SIEGE_EVIDENCE.buildings['109']!.armors.some(([id]) => id === 13)).toBe(false);
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

  it('never grants coverage from numeric records alone and rejects tampered modifiers/armorTechs', () => {
    expect(verifiedSiegeInputs(cannon, castle, 'Turks', [], { ...SIEGE_EVIDENCE, coverage: [] })).toBeUndefined();
    expect(verifiedSiegeInputs(cannon, castle, 'Turks', [], { ...SIEGE_EVIDENCE, schemaVersion: 1 })).toBeUndefined();
    expect(verifiedSiegeInputs(cannon, castle, 'Turks', [], { ...SIEGE_EVIDENCE, schemaVersion: 99 })).toBeUndefined();
    expect(
      verifiedSiegeInputs(cannon, castle, 'Turks', [], {
        ...SIEGE_EVIDENCE,
        coverage: SIEGE_EVIDENCE.coverage.map((c) => ({ ...c, status: 'unverified' })),
      }),
    ).toBeUndefined();
    expect(verifiedSiegeInputs(cannon, castle, 'Turks', [], { ...SIEGE_EVIDENCE, buildings: {} })).toBeUndefined();
    expect(
      verifiedSiegeInputs(cannon, castle, 'Burgundians', [], {
        ...SIEGE_EVIDENCE,
        civModifiers: { ...SIEGE_EVIDENCE.civModifiers, Burgundians: { attackMul: [[999, 1.25]], reloadMul: 1 } },
      }),
    ).toBeUndefined();
    expect(
      verifiedSiegeInputs(cannon, castle, 'Spanish', [], {
        ...SIEGE_EVIDENCE,
        civModifiers: { ...SIEGE_EVIDENCE.civModifiers, Spanish: { attackMul: [], reloadMul: 0 } },
      }),
    ).toBeUndefined();
    expect(
      verifiedSiegeInputs(cannon, castle, 'Ethiopians', [50], {
        ...SIEGE_EVIDENCE,
        armorTechs: { ...SIEGE_EVIDENCE.armorTechs, '50': { ...SIEGE_EVIDENCE.armorTechs['50']!, verified: false } },
      }),
    ).toBeUndefined();
    expect(
      verifiedSiegeInputs(cannon, castle, 'Ethiopians', [50], {
        ...SIEGE_EVIDENCE,
        armorTechs: { ...SIEGE_EVIDENCE.armorTechs, '50': { ...SIEGE_EVIDENCE.armorTechs['50']!, classes: [52] } },
      }),
    ).toBeUndefined();
    expect(calculateSiege({ ...cannon, atks: [...cannon.atks, ['未收录类别', 40]] }, castle, 2).verified).toBe(false);
  });

  it('keeps valid selected techs/civs in URLs while independently refusing unsupported results', () => {
    const unsupported = decodeSiege('?unit=36&n=2&bldg=82&civ=Britons&armor=50', CORE);
    expect(unsupported).toEqual({ unit: 36, n: 2, bldg: 82, civ: 'Britons', armor: [50], techs: [] });
    expect(decodeSiege('?' + encodeSiege(unsupported), CORE)).toEqual(unsupported);
    expect(calculateSiege(cannon, castle, unsupported.n, unsupported.civ, unsupported.armor).verified).toBe(false);

    const uncoveredBldg = decodeSiege('?unit=36&n=4&bldg=12&civ=Ethiopians', CORE);
    expect(uncoveredBldg).toEqual({ unit: 36, n: 4, bldg: 12, civ: 'Ethiopians', armor: [], techs: [] });
    expect(calculateSiege(cannon, barracks, uncoveredBldg.n, uncoveredBldg.civ, uncoveredBldg.armor).verified).toBe(false);

    const supported = decodeSiege('?unit=36&n=4&bldg=82&civ=Ethiopians&armor=51,50', CORE);
    expect(supported).toEqual({ unit: 36, n: 4, bldg: 82, civ: 'Ethiopians', armor: [50, 51], techs: [] });
    expect(decodeSiege('?' + encodeSiege(supported), CORE)).toEqual(supported);
    expect(calculateSiege(cannon, castle, supported.n, supported.civ, supported.armor)).toMatchObject({
      verified: true,
      damage: 216,
      hits: 7,
      gameSeconds: 39,
    });
  });

  it('grants the existing cannon detail entry from audited base castle coverage only', () => {
    expect(siegeUnitEntryVerified(cannon, castle)).toBe(true);
    for (const id of [280, 550, 588]) {
      expect(siegeUnitEntryVerified(CORE.unitById[id]!, castle)).toBe(false);
      expect(calculateSiege(CORE.unitById[id]!, keep, 2, 'Turks').verified).toBe(false);
    }
  });

  it('restores all 5 comparison rows across all 25 cannon civs and no-civ', () => {
    for (const civ of ['', ...CANNON_CIVS]) {
      expect(
        SIEGE_COMPARE_IDS.map((id) => [id, calculateSiege(cannon, CORE.buildingById[id]!, 4, civ).verified]),
        civ || 'no-civ',
      ).toEqual([
        [109, true],
        [82, true],
        [79, true],
        [117, true],
        [487, true],
      ]);
    }
  });

  it('preserves adjacent trebuchet and ram ideal results', () => {
    expect(calculateSiege(CORE.unitById[331]!, castle, 2, 'Turks')).toMatchObject({ verified: true, hits: 6, gameSeconds: 50, damage: 431 });
    expect(calculateSiege(CORE.unitById[1258]!, castle, 4)).toMatchObject({ verified: true, hits: 9, gameSeconds: 40, damage: 142 });
    expect(calculateSiege(CORE.unitById[1258]!, tc, 1)).toMatchObject({ verified: true, hits: 16, gameSeconds: 75, damage: 150 });
  });
});
