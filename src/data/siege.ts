import raw from '../../data/game/siege.json';

export interface SiegeCombatEvidence {
  readonly hp: number;
  readonly attacks: readonly (readonly number[])[];
  readonly armors: readonly (readonly number[])[];
  readonly baseArmor: number;
  readonly reload: number;
  readonly modifiers: Readonly<Record<string, number>>;
  readonly attacksComplete?: boolean;
  readonly armorsComplete?: boolean;
  readonly modifiersVerified: boolean;
}

export interface SiegeEvidence {
  readonly schemaVersion: number;
  readonly classes: Readonly<Record<string, string>>;
  readonly attacker: SiegeCombatEvidence & { readonly id: number };
  readonly buildings: Readonly<Record<string, SiegeCombatEvidence>>;
  readonly coverage: readonly {
    readonly unit: number;
    readonly building: number;
    readonly civ: string;
    readonly armor: readonly number[];
    readonly status: string;
  }[];
}

/** Generated, schema-checked evidence. Numeric records alone do not grant coverage. */
export const SIEGE_EVIDENCE: SiegeEvidence = raw;
