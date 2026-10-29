/** Civilization-specific disclosures, in the same prefix / row / mechanism / tail order as the simulator. */
import { buildOrders as ALL_BOS } from '../data/buildOrders';
import type { EcoData, EffectRow } from './buildSim';
import { simScope, techAtomicOk, RES234_IRRELEVANT_TECH } from './buildSimCoverage';
import { applyEffects, baseMods, RES_HUNT_FOOD } from './buildSimEffects';
import * as rules from './buildSimCivRules';
import { armenianContext, ARMENIAN_CART_NOTE, ARMENIAN_RESEARCH_NOTE } from './armenianEconomy';
import { georgianContext, GEORGIAN_START_NOTE, GEORGIAN_CART_NOTE } from './georgianEconomy';
import { slavicContext, slavicHasFarmAssignment, SLAVIC_FARM_NOTE } from './slavicEconomy';
import { khmerContext, khmerNotes } from './khmerEconomy';
import { weiRewardFamily, WEI_SPAWN_NOTE, WEI_KNIGHT_TEMPLATE_NOTE } from './weiEconomy';
import { bengaliRewardFamily, BENGALI_SPAWN_NOTE, BENGALI_KNIGHT_TEMPLATE_NOTE } from './bengaliEconomy';

import { jurchenNotes } from './jurchenEconomy';

interface NotesInput {
  eco: EcoData;
  civ: string;
  boId?: string;
  rows: EffectRow[];
}
interface CivNotes {
  prefix?: (input: NotesInput) => string[];
  mechanism?: (input: NotesInput) => string[];
  skipHunt?: boolean;
}

/** Generic-row disclosures remain outside the registry: a displaced Portuguese row still has its old note. */
const CIV_NOTES: ReadonlyMap<string, CivNotes> = new Map([
  ['Jurchens', { mechanism: ({ eco, boId }) => jurchenNotes(eco, boId) }],
  [
    'Khmer',
    {
      prefix: ({ eco, boId }) =>
        khmerNotes(
          khmerContext(eco),
          ALL_BOS.find((order) => order.id === boId),
        ),
    },
  ],
  [
    'Slavs',
    {
      prefix: ({ eco, boId }) => {
        const context = slavicContext(eco);
        const bo = ALL_BOS.find((order) => order.id === boId);
        return context.physical && context.reasons.length === 0 && bo && slavicHasFarmAssignment(bo) ? [SLAVIC_FARM_NOTE] : [];
      },
    },
  ],
  ['Armenians', { prefix: ({ eco }) => (armenianContext(eco).reasons.length === 0 ? [ARMENIAN_CART_NOTE, ARMENIAN_RESEARCH_NOTE] : []) }],
  [
    'Georgians',
    {
      prefix: ({ eco }) => {
        const context = georgianContext(eco);
        return context.reasons.length === 0 ? [...(context.start ? [GEORGIAN_START_NOTE] : []), GEORGIAN_CART_NOTE] : [];
      },
    },
  ],
  [
    'Shu',
    {
      mechanism: ({ eco, rows }) => {
        const scope = simScope(eco, ALL_BOS);
        const active = rows.some(
          (row) =>
            rules.hasLumberFoodContext(row) &&
            row.effects.some((effect) => effect.kind === 'res' && effect.res === rules.RES_LUMBER_FOOD && effect.op === 'set') &&
            techAtomicOk(row, scope),
        );
        return [...(active ? [rules.LUMBER_FOOD_NOTE] : []), rules.SHU_KNIGHT_TEMPLATE_NOTE];
      },
    },
  ],
  [
    'Malians',
    {
      mechanism: ({ eco, rows }) => {
        const scope = simScope(eco, ALL_BOS);
        return rows.some(
          (row) =>
            rules.hasMalianGoldContext(row) &&
            row.effects.some((effect) => effect.kind === 'res' && effect.res === rules.RES_GOLD_PRODUCTIVITY && effect.op === 'add') &&
            techAtomicOk(row, scope),
        )
          ? [rules.MALIAN_GOLD_NOTE]
          : [];
      },
    },
  ],
  [
    'Varangians',
    {
      mechanism: ({ eco, rows }) => {
        const scope = simScope(eco, ALL_BOS);
        return rows.some(
          (row) =>
            rules.hasVarangianGoldContext(row) &&
            row.effects.some((effect) => effect.kind === 'res' && effect.res === rules.RES_WILD_FOOD_GOLD && effect.op === 'set') &&
            techAtomicOk(row, scope),
        )
          ? [rules.VARANGIAN_GOLD_NOTE]
          : [];
      },
    },
  ],
  [
    'Tatars',
    {
      mechanism: ({ eco, rows }) => {
        const scope = simScope(eco, ALL_BOS);
        return rows.some((row) => rules.hasTatarShepherdContext(row) && techAtomicOk(row, scope)) ? [rules.TATAR_SHEPHERD_NOTE] : [];
      },
    },
  ],
  [
    'Mayans',
    {
      mechanism: ({ eco, rows }) => {
        const scope = simScope(eco, ALL_BOS);
        const active = rules.hasUniqueMayanTree(eco) && rows.some((row) => rules.hasMayanTreeContext(row) && techAtomicOk(row, scope));
        return [...(active ? [rules.MAYAN_RESOURCE_NOTE] : []), rules.MAYAN_CAVALRY_TEMPLATE_NOTE];
      },
      skipHunt: true,
    },
  ],
  [
    'Sicilians',
    {
      mechanism: ({ eco, civ }) => {
        // Unlike the generic special-income notes, construction needs the civilization's complete scope.
        const scope = simScope(eco, ALL_BOS, civ);
        return [
          ...(rules.sicilianGroupOk(scope, 770) ? [rules.SICILIAN_CONSTRUCTION_NOTE] : []),
          ...(rules.sicilianGroupOk(scope, 772) ? [rules.SICILIAN_FARM_NOTE] : []),
        ];
      },
    },
  ],
  [
    'Wei',
    {
      mechanism: ({ eco, boId }) =>
        weiRewardFamily(eco.civEco.Wei) ? [WEI_SPAWN_NOTE, ...(boId === 'fast-castle-knights' ? [WEI_KNIGHT_TEMPLATE_NOTE] : [])] : [],
    },
  ],
  [
    'Bengalis',
    {
      mechanism: ({ eco, boId }) =>
        bengaliRewardFamily(eco.civEco.Bengalis) ? [BENGALI_SPAWN_NOTE, ...(boId === 'fast-castle-knights' ? [BENGALI_KNIGHT_TEMPLATE_NOTE] : [])] : [],
    },
  ],
]);

/** 页面「按某文明计」下方的附注：已计入但有未核实部分、或明确不计入的加成。 */
export function civSimNotes(eco: EcoData, civ: string, boId?: string): string[] {
  const rows = (eco.civEco[civ] ?? []).filter((row) => row.source !== 'team');
  const input: NotesInput = { eco, civ, boId, rows };
  const notes = CIV_NOTES.get(civ);
  const out = notes?.prefix?.(input) ?? [];
  if (rows.some((row) => row.tech === 453 && row.effects.some((effect) => effect.res === rules.RES_FORAGER_WOOD && effect.op === 'add')))
    out.push(rules.FORAGER_WOOD_NOTE);
  out.push(...(notes?.mechanism?.(input) ?? []));
  if (rows.some((row) => row.tech !== undefined && !!RES234_IRRELEVANT_TECH[row.tech])) out.push('马的食物未计入');
  if (!notes?.skipHunt && rows.some((row) => row.effects.some((effect) => effect.kind === 'res' && effect.res === RES_HUNT_FOOD))) {
    const mods = baseMods();
    for (const row of rows)
      if (row.age === 1)
        applyEffects(
          mods,
          row.effects.filter((effect) => effect.kind === 'res' && effect.res === RES_HUNT_FOOD),
        );
    out.push(`猎物食物 ×${Math.round(mods.huntFoodMul * 100) / 100}；对其他采集的作用未核实`);
  }
  return out;
}
