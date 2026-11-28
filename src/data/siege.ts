import raw from '../../data/game/siege.json';

export interface SiegeCombatEvidence {
  readonly hp: number;
  readonly class: number;
  readonly attacks: readonly (readonly number[])[];
  readonly armors: readonly (readonly number[])[];
  readonly baseArmor: number;
  readonly reload: number;
  readonly modifiers: Readonly<Record<string, number>>;
  readonly attacksComplete?: boolean;
  readonly armorsComplete?: boolean;
  readonly modifiersVerified: boolean;
}

export interface SiegeCivModifier {
  readonly attackMul: readonly (readonly number[])[];
  readonly reloadMul: number;
  readonly source?: string;
}

export interface SiegeArmorTechEvidence {
  readonly name: string;
  readonly classes: readonly number[];
  readonly hpMul: number;
  readonly armorAdd: readonly (readonly number[])[];
  readonly verified: boolean;
}

export interface SiegeCoverageEntry {
  readonly unit: number;
  readonly building: number;
  readonly civs: readonly string[];
  readonly armors: readonly (readonly number[])[];
  readonly status: string;
}

export interface SiegeEvidence {
  readonly schemaVersion: number;
  readonly classes: Readonly<Record<string, string>>;
  readonly attacker: SiegeCombatEvidence & { readonly id: number };
  readonly buildings: Readonly<Record<string, SiegeCombatEvidence>>;
  readonly civModifiers: Readonly<Record<string, SiegeCivModifier>>;
  readonly armorTechs: Readonly<Record<string, SiegeArmorTechEvidence>>;
  readonly coverage: readonly SiegeCoverageEntry[];
}

/** Generated, schema-checked evidence. Numeric records alone do not grant coverage. */
export const SIEGE_EVIDENCE: SiegeEvidence = raw;
