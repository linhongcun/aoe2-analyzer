/** Chinese opening admission against the complete fixed DE188329 bonus records. */
import type { EcoData, EffectRow } from './buildSim';
import type { JurchenRawTech } from './jurchenEconomy';

export type ChineseRawTech = JurchenRawTech;
export const CHINESE_SOURCE_REASON = '中国起始、科技折扣或城镇中心缺少完整已核来源，未计入';
export const CHINESE_OPENING_NOTE = '普通开局6村民；城镇中心提供15人口；科技折扣不含升级时代';
export const CHINESE_MODEL_NOTE = '普通起始按固定数据计入；科技折扣在到达相应时代后生效，沿用本站整数费用取整。农田额外储量、视野与客户端逐帧行为未模拟。';
const IDS = [226, 302, 304, 350, 351, 352, 425];
const TCS = [109, 71, 141, 142];
const command = (Type: number, A: number, B: number, C: number, D: number) => ({ Type, A, B, C, D });
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value;
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function expected(id: number): { age: number; raw: ChineseRawTech; effects: EffectRow['effects'] } | null {
  let effectId = id,
    requires: number[] = [],
    commands: ChineseRawTech['commands'],
    age = 1;
  let effects: EffectRow['effects'];
  if (id === 226) {
    effectId = 215;
    requires = [639];
    commands = [command(1, 91, 1, -1, -200), command(1, 92, 1, -1, -50)];
    effects = [
      { kind: 'res', res: 91, op: 'add', v: -200 },
      { kind: 'res', res: 92, op: 'add', v: -50 },
    ];
  } else if (id === 302) {
    requires = [639, 307];
    commands = [command(1, 234, 0, -1, 1), command(7, 83, 619, 3, 0)];
    effects = [{ kind: 'res', res: 234, op: 'set', v: 1 }];
  } else if ([304, 350, 351, 352].includes(id)) {
    age = id === 304 ? 1 : id - 348;
    effectId = id === 304 ? id : id - 1;
    requires = age === 1 ? [] : [99 + age];
    const value = [1, 0.95, 0.9, 0.85][age - 1]!;
    commands = [command(1, 85, 0, -1, Math.fround(value))];
    effects = [{ kind: 'res', res: 85, op: 'set', v: value }];
  } else if (id === 425) {
    effectId = 437;
    commands = [
      ...TCS.map((tc) => command(0, tc, -1, 21, 15)),
      ...TCS.map((tc) => command(4, tc, -1, 1, 7)),
      ...TCS.map((tc) => command(4, tc, -1, 23, 7)),
      command(0, 444, -1, 21, 15),
    ];
    effects = [];
  } else return null;
  return {
    age,
    raw: { tech: id, civ: 6, effectId, requiredCount: requires.length, requires, researchLocation: -1, researchAt: [], researchTime: 0, cost: [], commands },
    effects,
  };
}
const rowValid = (row: EffectRow) => {
  if (!Array.isArray(row.effects)) return false;
  const source = expected(row.tech ?? -1);
  // Labels and display names do not affect the calculation; every semantic effect field does.
  const effects = row.effects.map((effect) => Object.fromEntries(Object.entries(effect).filter(([key]) => key !== 'label')));
  return (
    !!source &&
    row.source === 'bonus' &&
    row.age === source.age &&
    equal(row.requires, source.raw.requires) &&
    equal(row.chineseTech, source.raw) &&
    equal(effects, source.effects)
  );
};
export const hasChineseMarker = (row: EffectRow) => 'chineseTech' in row || IDS.includes(row.tech ?? -1);
export function chineseContext(eco: EcoData) {
  const rows = eco.civEco.Chinese ?? [];
  const admitted = new Map<number, EffectRow>();
  for (const id of IDS) {
    const found = rows.filter((row) => row.tech === id);
    if (found.length === 1 && rowValid(found[0]!)) admitted.set(id, found[0]!);
  }
  const complete = admitted.size === IDS.length && rows.every((row) => !('chineseTech' in row) || IDS.includes(row.tech ?? -1));
  return { admitted, complete, reasons: complete ? [] : [CHINESE_SOURCE_REASON] };
}
export function chineseRowAllowed(row: EffectRow, civ?: string, context?: ReturnType<typeof chineseContext>): boolean {
  return !hasChineseMarker(row) || (civ === 'Chinese' && context?.admitted.get(row.tech ?? -1) === row);
}
export function chineseRowClass(
  row: EffectRow,
  civ?: string,
  context?: ReturnType<typeof chineseContext>,
): { kind: 'handled' } | { kind: 'unhandled'; reason: string } | null {
  if (!hasChineseMarker(row)) return null;
  return chineseRowAllowed(row, civ, context) ? { kind: 'handled' } : { kind: 'unhandled', reason: CHINESE_SOURCE_REASON };
}
/** Actual values are read only after their complete source record has been admitted. */
export const chinesePopulation = (context?: ReturnType<typeof chineseContext>) => context?.admitted.get(425)?.chineseTech?.commands[0]?.D ?? 5;
export const chineseStartingVillagers = (context?: ReturnType<typeof chineseContext>) => 3 + (context?.admitted.get(302)?.chineseTech?.commands[1]?.C ?? 0);
export const chineseNotes = (eco: EcoData) => (chineseContext(eco).complete ? [CHINESE_OPENING_NOTE] : []);
