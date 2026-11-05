import raw from '../../data/charge_attack.json';
import validate from '../../content/schema/compiled/charge-attack.mjs';
import { readValidatedJson } from '../../data/validatedJson';
import { civStatus } from '../../domain/civStatus';
import type { Tech, Trees, Unit } from '../../domain/types';
export interface ChargeState {
  max_charge: number;
  recharge_rate: number;
  charge_event: number;
  charge_type: number;
}
export interface ChargeAttackData {
  meta: {
    generatedBy: string;
    patch: string;
    datSource: { repo: string; commit: string; path: string };
    datSha256: string;
    engineVerifiedInPinnedBuild: false;
    fieldSemantics: Record<'attributes' | 'mode' | 'duration' | 'seconds', string>;
    durationFormula: string;
    durationUnit: string;
  };
  tech: {
    id: number;
    name: string;
    civId: number;
    civName: string;
    effectId: number;
    age: number;
    repeatable: number;
    requires: number[];
    requiredCount: number;
    researchLocations: number[];
  };
  commands: { index: number; Type: number; A: number; B: number; C: number; D: number }[];
  rawTargets: number[];
  legalTargets: number[];
  examples: { unitId: number; before: ChargeState; after: ChargeState; commandIndices: number[] }[];
}
export const CHARGE_ATTACK_DATA = readValidatedJson(raw, validate, '攻击类蓄力参数');
/** Only an audited attack mode; structural errors throw at the JSON boundary. */
export function chargeExample(data: ChargeAttackData, id: number, units: Record<number, Unit>, techs: Record<number, Tech>, trees: Trees) {
  const u = units[id],
    t = techs[data.tech.id],
    e = data.examples.find((x) => x.unitId === id),
    st = civStatus(trees, data.tech.civName);
  if (
    !u ||
    !t ||
    !e ||
    t.en !== data.tech.name ||
    !data.legalTargets.includes(id) ||
    !data.rawTargets.includes(id) ||
    !u.civs.includes(data.tech.civName) ||
    !t.civs.includes(data.tech.civName) ||
    st['u' + id] !== 1 ||
    st['t' + t.id] !== 1 ||
    u.age > t.age ||
    e.after.charge_event !== 1 ||
    e.after.charge_type !== 1
  )
    return null;
  const q = e.after;
  if (![q.max_charge, q.recharge_rate, e.before.max_charge].every((n) => Number.isFinite(n) && n >= 0)) return null;
  const seconds = q.recharge_rate > 0 ? q.max_charge / q.recharge_rate : null;
  if (seconds !== null && !Number.isFinite(seconds)) return null;
  return { u, before: e.before, after: q, seconds };
}
