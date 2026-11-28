import raw from '../../data/game/sim_research_prices.json';
import type { Cost } from '../domain/types';

export type SimResearchAgeKey = '1' | '2' | '3' | '4';

export interface SimResearchPriceEntry {
  readonly cost: Cost | null;
  readonly free?: true;
  readonly zero?: true;
  readonly reason?: string;
}

export type SimResearchTechRecord =
  | { readonly kind: 'all'; readonly entry: SimResearchPriceEntry }
  | { readonly kind: 'byAge'; readonly ages: Readonly<Partial<Record<SimResearchAgeKey, SimResearchPriceEntry>>> };

export interface SimOrderModifierEntry {
  readonly civ: string | null;
  readonly targets: readonly number[];
  readonly global?: true;
}

export interface SimResearchPricesData {
  readonly meta: {
    readonly generatedBy: string;
    readonly patch: string;
    readonly commit: string;
    readonly sha256: string;
  };
  readonly civs: Readonly<Record<string, Readonly<Record<string, SimResearchTechRecord>>>>;
  readonly orderModifiers: Readonly<Record<string, SimOrderModifierEntry>>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  }
  return value;
}

export const SIM_RESEARCH_PRICES: SimResearchPricesData = /*#__PURE__*/ deepFreeze(raw as SimResearchPricesData);
