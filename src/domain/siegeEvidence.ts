import { SIEGE_EVIDENCE, type SiegeArmorTechEvidence, type SiegeCivModifier, type SiegeCombatEvidence, type SiegeEvidence } from '../data/siege';
import { damageRows, totalDamage } from './damageCore';
import type { Building, Unit } from './types';

export const SIEGE_EVIDENCE_SCHEMA_VERSION = 2;

const validClasses = (rows: readonly (readonly number[])[]) =>
  Array.isArray(rows) &&
  rows.length > 0 &&
  rows.every((r) => Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && Number.isFinite(r[1])) &&
  new Set(rows.map((r) => r[0])).size === rows.length;

const MODIFIER_KEYS = [
  'bonusResistance',
  'reflection',
  'blastDamage',
  'accuracy',
  'projectiles',
  'maxProjectiles',
  'secondaryProjectile',
  'specialAbility',
  'chargeType',
  'chargeEvent',
  'rear',
  'flank',
];
const validModifiers = (modifiers: Readonly<Record<string, number>>) =>
  !!modifiers && Object.keys(modifiers).length === MODIFIER_KEYS.length && MODIFIER_KEYS.every((key) => Number.isFinite(modifiers[key]));

const sameNumberArray = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Full tables may omit a class: use the recorded base armour, never a guessed 0. */
export function siegeEvidenceDamage(attacker: SiegeCombatEvidence, defender: SiegeCombatEvidence): number | undefined {
  if (
    !attacker ||
    !defender ||
    !validModifiers(attacker.modifiers) ||
    !validModifiers(defender.modifiers) ||
    attacker.attacksComplete !== true ||
    defender.armorsComplete !== true ||
    attacker.modifiersVerified !== true ||
    defender.modifiersVerified !== true ||
    !validClasses(attacker.attacks) ||
    !validClasses(defender.armors) ||
    !Number.isFinite(defender.baseArmor) ||
    defender.baseArmor < 0 ||
    // This bounded model has audited neutral direct-hit modifiers only.
    attacker.modifiers.blastDamage !== 1 ||
    attacker.modifiers.accuracy !== 100 ||
    attacker.modifiers.projectiles !== 1 ||
    attacker.modifiers.maxProjectiles !== 1 ||
    attacker.modifiers.secondaryProjectile !== -1 ||
    attacker.modifiers.specialAbility !== 0 ||
    attacker.modifiers.chargeType !== 0 ||
    attacker.modifiers.chargeEvent !== 0 ||
    attacker.modifiers.rear !== 0 ||
    attacker.modifiers.flank !== 1 ||
    defender.modifiers.bonusResistance !== 0 ||
    defender.modifiers.reflection !== 0
  )
    return undefined;
  const attacks = Object.fromEntries(attacker.attacks.map(([id, amount]) => [String(id), amount!]));
  const explicit = new Map(defender.armors.map(([id, amount]) => [id!, amount!]));
  const armors = Object.fromEntries(attacker.attacks.map(([id]) => [String(id), explicit.get(id!) ?? defender.baseArmor]));
  const rows = damageRows(attacks, armors, { negativeAttack: false, missingArmor: 'error' });
  if (rows.problems.length) return undefined;
  const damage = totalDamage(rows.rows);
  return Number.isFinite(damage) && damage > 0 ? damage : undefined;
}

function applyCivModifier(
  attacker: SiegeCombatEvidence,
  modifier: SiegeCivModifier | undefined,
): { attacker: SiegeCombatEvidence; interval: number } | undefined {
  if (!modifier) return { attacker, interval: attacker.reload };
  if (!Array.isArray(modifier.attackMul) || !Number.isFinite(modifier.reloadMul) || modifier.reloadMul <= 0) return undefined;
  const baseClassIds = new Set(attacker.attacks.map(([id]) => id));
  const mulByClass = new Map<number, number>();
  for (const row of modifier.attackMul) {
    if (!Array.isArray(row) || row.length !== 2) return undefined;
    const [cls, mul] = row;
    if (!Number.isInteger(cls) || !Number.isFinite(mul) || mul <= 0 || mulByClass.has(cls!) || !baseClassIds.has(cls!)) return undefined;
    mulByClass.set(cls!, mul!);
  }
  const attacks =
    mulByClass.size > 0
      ? attacker.attacks.map(([id, amount]) => {
          const mul = mulByClass.get(id!);
          return mul !== undefined ? [id!, amount! * mul] : [id!, amount!];
        })
      : attacker.attacks;
  const interval = Math.round(attacker.reload * modifier.reloadMul * 1e9) / 1e9;
  if (!Number.isFinite(interval) || interval <= 0) return undefined;
  return { attacker: { ...attacker, attacks }, interval };
}

function applyArmorTechs(
  defender: SiegeCombatEvidence,
  armorIds: readonly number[],
  armorTechs: Readonly<Record<string, SiegeArmorTechEvidence>>,
): SiegeCombatEvidence | undefined {
  if (armorIds.length === 0) return defender;
  if (!Number.isInteger(defender.class) || !validClasses(defender.armors)) return undefined;
  let hp = defender.hp;
  const armorMap = new Map(defender.armors.map(([id, amount]) => [id!, amount!]));
  for (const tid of armorIds) {
    const key = String(tid);
    if (!armorTechs || !Object.hasOwn(armorTechs, key)) return undefined;
    const tech = armorTechs[key];
    if (
      !tech ||
      tech.verified !== true ||
      !Array.isArray(tech.classes) ||
      !tech.classes.includes(defender.class) ||
      !Number.isFinite(tech.hpMul) ||
      tech.hpMul <= 0 ||
      !Array.isArray(tech.armorAdd) ||
      tech.armorAdd.length === 0
    )
      return undefined;
    const seen = new Set<number>();
    for (const row of tech.armorAdd) {
      if (!Array.isArray(row) || row.length !== 2) return undefined;
      const [cls, delta] = row;
      if (!Number.isInteger(cls) || !Number.isFinite(delta) || seen.has(cls!) || !armorMap.has(cls!)) return undefined;
      seen.add(cls!);
      armorMap.set(cls!, armorMap.get(cls!)! + delta!);
    }
    hp *= tech.hpMul;
    if (!Number.isFinite(hp) || hp <= 0) return undefined;
  }
  const armors = defender.armors.map(([id]) => [id!, armorMap.get(id!)!]);
  return { ...defender, hp, armors };
}

/** Exact configurations plus catalog consistency; legal unsupported selections stay unknown. */
export function verifiedSiegeInputs(u: Unit, b: Building, civ: string, armor: readonly number[], evidence: SiegeEvidence = SIEGE_EVIDENCE) {
  if (evidence.schemaVersion !== SIEGE_EVIDENCE_SCHEMA_VERSION) return undefined;
  if (!Array.isArray(armor) || !armor.every((id) => Number.isInteger(id)) || new Set(armor).size !== armor.length) return undefined;
  const sortedArmor = [...armor].sort((x, y) => x - y);
  if (
    !Array.isArray(evidence.coverage) ||
    !evidence.coverage.some(
      (c) =>
        c.status === 'verified' &&
        c.unit === u.id &&
        c.building === b.id &&
        Array.isArray(c.civs) &&
        c.civs.includes(civ) &&
        Array.isArray(c.armors) &&
        c.armors.some((allowed: readonly number[]) => Array.isArray(allowed) && sameNumberArray(allowed, sortedArmor)),
    )
  )
    return undefined;
  const a = evidence.attacker;
  const bKey = String(b.id);
  const d = evidence.buildings && Object.hasOwn(evidence.buildings, bKey) ? evidence.buildings[bKey] : undefined;
  if (!d || !a || a.id !== u.id) return undefined;
  if (!validClasses(a.attacks) || !validClasses(d.armors)) return undefined;
  const names = a.attacks.map(([id]) => (evidence.classes && Object.hasOwn(evidence.classes, String(id)) ? evidence.classes[String(id)] : undefined));
  if (
    names.some((name) => !name) ||
    new Set(names).size !== names.length ||
    u.atks.length !== a.attacks.length ||
    new Set(u.atks.map(([name]) => name)).size !== names.length ||
    a.attacks.some(([id, amount]) => !u.atks.some(([name, value]) => name === evidence.classes[String(id)] && value === amount)) ||
    u.hp !== a.hp ||
    u.rof !== a.reload ||
    b.hp !== d.hp ||
    b.ma !== d.armors.find(([id]) => id === 4)?.[1] ||
    b.pa !== d.armors.find(([id]) => id === 3)?.[1] ||
    b.barm !== d.armors.find(([id]) => id === 11)?.[1]
  )
    return undefined;
  const civMod = evidence.civModifiers && Object.hasOwn(evidence.civModifiers, civ) ? evidence.civModifiers[civ] : undefined;
  const modifiedAttacker = applyCivModifier(a, civMod);
  if (!modifiedAttacker) return undefined;
  const modifiedDefender = applyArmorTechs(d, sortedArmor, evidence.armorTechs);
  if (!modifiedDefender) return undefined;
  const damage = siegeEvidenceDamage(modifiedAttacker.attacker, modifiedDefender);
  if (damage === undefined) return undefined;
  return { damage, hp: modifiedDefender.hp, interval: modifiedAttacker.interval };
}
