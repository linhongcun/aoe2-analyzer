import { SIEGE_EVIDENCE, type SiegeCombatEvidence, type SiegeEvidence } from '../data/siege';
import { damageRows, totalDamage } from './damageCore';
import type { Building, Unit } from './types';

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

/** Exact configurations plus catalog consistency; legal unsupported selections stay unknown. */
export function verifiedSiegeInputs(u: Unit, b: Building, civ: string, armor: readonly number[], evidence: SiegeEvidence = SIEGE_EVIDENCE) {
  if (
    evidence.schemaVersion !== 1 ||
    !evidence.coverage.some(
      (c) =>
        c.status === 'verified' &&
        c.unit === u.id &&
        c.building === b.id &&
        c.civ === civ &&
        c.armor.length === armor.length &&
        c.armor.every((id) => armor.includes(id)),
    )
  )
    return undefined;
  const a = evidence.attacker;
  const d = evidence.buildings[String(b.id)];
  if (!d || !a || a.id !== u.id) return undefined;
  const damage = siegeEvidenceDamage(a, d);
  if (damage === undefined) return undefined;
  const names = a.attacks.map(([id]) => evidence.classes[String(id)]);
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
  return { damage, hp: d.hp, interval: a.reload };
}
