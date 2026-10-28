import type { EcoData, EffectRow } from './buildSim';
import type { simScope } from './buildSimCoverage';
import type { Mods } from './buildSimEffects';
import { CONSTRUCTION_DATA } from '../data/construction';
const TC = 109;
/** tech453 / effect510，res267 add33.333302；公开Function12的 .01×267 语义与连续模型边界见 docs/design/portuguese197.md。 */
export const RES_FORAGER_WOOD = 267;
export const FORAGER_WOOD_NOTE = '采果兼产木材按连续收入估算';
export const FORAGER_WOOD_ASSUMPTION =
  '采果兼产木材按采果有效食物收入的比例连续流入；共用采果的携带量和往返时间，不增加伐木走路。不模拟客户端逐笔到账、取整和走路期间的触发时序。';
/** 额外收入以采果率为基数，不从食物库存余额或存放加成反推。 */
export const foragerWoodIncome = (m: Mods, task: string, rate: number) => (task === 'berries' ? rate * m.foragerWood : 0);
/** tech1071的502 set7配33 set16；百分比及连续近似边界见 docs/design/shu197.md。 */
export const RES_LUMBER_FOOD = 502;
export const LUMBER_FOOD_NOTE = '伐木兼产食物按连续收入估算';
export const LUMBER_FOOD_ASSUMPTION =
  '伐木兼产食物按伐木有效收入的比例连续流入；共用伐木的携带量和往返时间，不额外增加食物走路。不模拟客户端逐笔到账、取整、砍倒树阶段或走路期间的触发时序。';
export const SHU_KNIGHT_TEMPLATE_NOTE = '蜀不能训练骑士；骑士方案仅供通用模板经济估算。';
export const lumberFoodIncome = (m: Mods, task: string, rate: number) => (task === 'wood' ? rate * m.lumberFood : 0);
export const hasLumberFoodContext = (row: { tech?: number; effects?: EffectRow['effects'] }) =>
  row.tech === 1071 && row.effects?.some((effect) => effect.kind === 'res' && effect.res === 33 && effect.op === 'set' && effect.v === 16);
/** tech594的276 add10配33 set11；公开百分比及连续近似边界见 docs/design/malians197.md。 */
export const RES_GOLD_PRODUCTIVITY = 276;
export const MALIAN_GOLD_NOTE = '采金交仓额外黄金按连续收入估算';
export const MALIAN_GOLD_ASSUMPTION =
  '采金交仓额外黄金按有效采金收入的百分比连续计入，共用采金携带量和往返时间；不增加基础工作速率或矿物储量。不模拟客户端逐次交仓、取整或行走期间的触发时序。';
export const hasMalianGoldContext = (row: { source?: string; tech?: number; effects?: EffectRow['effects'] }) =>
  row.source === 'bonus' &&
  row.tech === 594 &&
  row.effects?.some((effect) => effect.kind === 'res' && effect.res === 33 && effect.op === 'set' && effect.v === 11);
/** tech1475的298 set10.01配33 set34；固定公开百分比及连续近似边界见docs/design/varangians197.md。 */
export const RES_WILD_FOOD_GOLD = 298;
export const VARANGIAN_GOLD_NOTE = '牧羊、狩猎和捕鱼兼产黄金按连续收入估算';
export const VARANGIAN_GOLD_ASSUMPTION =
  '牧羊、狩猎和捕鱼兼产黄金按有效食物收入的比例连续计入；村民和渔船共用各自主资源的携带量与往返参数，不占用食物携带空间。不模拟客户端逐笔到账、取整或行走期间的触发时序。';
export const VARANGIAN_GOLD_TASKS = new Set(['sheep', 'hunt', 'fish']);
export const varangianGoldIncome = (m: Mods, task: string, rate: number) => (VARANGIAN_GOLD_TASKS.has(task) ? rate * m.varangianGold : 0);
export const hasVarangianGoldContext = (row: { source?: string; tech?: number; effects?: EffectRow['effects'] }) =>
  row.source === 'bonus' &&
  row.tech === 1475 &&
  row.effects?.some((effect) => effect.kind === 'res' && effect.res === 33 && effect.op === 'set' && effect.v === 34);
/** 固定704的标准牧羊任务与两个额外牧羊变体；各自倍率从实际输入读取，不重复作用同一任务。 */
export const RES_SHEPHERD_PRODUCTIVITY = 216;
export const TATAR_SHEPHERD_TARGETS = ['task:sheep', 'unit:1891', 'unit:1892'];
export const TATAR_SHEPHERD_NOTE = '牧羊按产量与工作率配对估算；新增羊和资源耗尽未模拟';
export const TATAR_SHEPHERD_ASSUMPTION =
  '鞑靼牧羊先按固定数据的产量与工作率配对，再计算携带和往返；近城镇中心肉类沿用牧羊速率代理，不表示真正狩猎也有羊加成。不模拟新增羊实体、羊总食物可采量、资源耗尽或客户端逐帧行为。';
export const hasTatarShepherdContext = (row: { source?: string; tech?: number; effects?: EffectRow['effects'] }) => {
  if (row.source !== 'bonus' || row.tech !== 704 || !row.effects) return false;
  const food = row.effects.filter((effect) => effect.kind === 'res' && effect.res === RES_SHEPHERD_PRODUCTIVITY);
  const valid = (effect: EffectRow['effects'][number]) => effect.op === 'mul' && Number.isFinite(effect.v) && effect.v! > 0;
  return (
    food.length === 1 &&
    valid(food[0]!) &&
    TATAR_SHEPHERD_TARGETS.every((target) => {
      const rates = row.effects!.filter((effect) => effect.kind === 'attr' && effect.target === target && effect.attr === 'workRate');
      return rates.length === 1 && valid(rates[0]!);
    })
  );
};
/** tree449：每个实际采集对象只读取一个resource_multiplier。 */
export const MAYAN_RESOURCE_TASKS: Record<number, string> = {
  47: 'gold',
  79: 'stone',
  189: 'wood',
  190: 'farm',
  216: 'sheep',
  268: 'hunt',
  219: 'fish',
  296: 'berries',
};
export const MAYAN_TREE_MARKERS = new Set([47, 79, 189, 190, 219, 296]);
export const MAYAN_WORK_TARGETS = [
  'task:gold',
  'task:stone',
  'task:wood',
  'task:farm',
  'task:sheep',
  'task:hunt',
  'task:fish',
  'task:berries',
  'class:21',
  'villager',
  'unit:1891',
  'unit:1892',
  'unit:2333',
  'unit:2334',
];
export const MAYAN_TREE_SIGNATURES = new Set([
  ...Object.keys(MAYAN_RESOURCE_TASKS).map((res) => 'res:' + res),
  ...MAYAN_WORK_TARGETS.map((target) => 'attr:' + target + ':workRate'),
  ...[4, 24, 492, 763, 765].map((id) => 'attr:unit:' + id + ':cost'),
  'attr:unit:199:trainTime',
]);
export const mayanSignature = (e: EffectRow['effects'][number]) =>
  e.kind === 'res' ? 'res:' + e.res : e.kind === 'attr' ? 'attr:' + e.target + ':' + e.attr : '';
export const positiveMultiplier = (e: EffectRow['effects'][number]) => e.op === 'mul' && Number.isFinite(e.v) && e.v! > 0;
export const hasMayanTreeContext = (row: { source?: string; age?: number; tech?: number; effects?: EffectRow['effects'] }) =>
  row.source === 'tree' &&
  row.age === 1 &&
  row.tech === undefined &&
  row.effects?.length === MAYAN_TREE_SIGNATURES.size &&
  new Set(row.effects.map(mayanSignature)).size === MAYAN_TREE_SIGNATURES.size &&
  row.effects.every((effect) => MAYAN_TREE_SIGNATURES.has(mayanSignature(effect)) && positiveMultiplier(effect));
export const hasMayanTreeMarker = (row: { effects?: EffectRow['effects'] }) =>
  row.effects?.some((effect) => effect.kind === 'res' && MAYAN_TREE_MARKERS.has(effect.res ?? -1));
export const hasUniqueMayanTree = (eco: EcoData) => {
  const rows = (eco.civEco.Mayans ?? []).filter((row) => row.source === 'tree' || hasMayanTreeMarker(row));
  return rows.length === 1 && hasMayanTreeContext(rows[0]!);
};
export const mayanRowAllowed = (civ: string, row: EffectRow, uniqueMayanTree: boolean) =>
  ((civ !== 'Mayans' || row.source !== 'tree') && !hasMayanTreeMarker(row)) || (civ === 'Mayans' && uniqueMayanTree && hasMayanTreeContext(row));
export const hasMayanWallContext = (row: EffectRow, scope: ReturnType<typeof simScope>) =>
  row.source === 'team' &&
  row.age === 1 &&
  row.effects.length === 2 &&
  [...scope.buildingClass.values()].every((cls) => Number.isInteger(cls) && cls >= 0) &&
  [27, 39].every(
    (cls) =>
      row.effects.filter((effect) => effect.kind === 'attr' && effect.target === 'class:' + cls && effect.attr === 'cost' && positiveMultiplier(effect))
        .length === 1,
  );
export const MAYAN_RESOURCE_NOTE = '资源产量与工作率配对估算；储量和耗尽未模拟';
export const MAYAN_CAVALRY_TEMPLATE_NOTE = '玛雅无马厩；侦察骑兵、骑士方案仅供通用模板经济估算';
export const MAYAN_RESOURCE_ASSUMPTION =
  '玛雅各资源产量与专职工作率配对后再计算携带和往返，一般净系数1.0005、农田0.9315；近城镇中心肉类仍用牧羊代理。资源储量、耗尽、农田续种和客户端逐帧行为未模拟。沿用玛雅的起始人数，织布按原开局实际研发；墙费只在显式计入团队时折半。';
export const SICILIAN_CONSTRUCTION_NOTE = '按实际施工形态计入城镇中心、城堡和防御工事加成';
export const SICILIAN_FARM_NOTE = '农田升级额外储量、耗尽和续种未模拟';
export const SICILIAN_CONSTRUCTION_ASSUMPTION =
  '西西里施工从开局已有的城镇中心完成状态计入一次加成；新城镇中心按实际施工形态的工期计算，城堡和防御工事按各自工期计算。建造者完工后返回原任务，建造费用与停采时间沿用同一模型；增建城镇中心不会再赠石料，额外城镇中心的产村民队列未模拟。';
export const SICILIAN_FARM_ASSUMPTION = '西西里农田升级额外储量不改变采集速度；资源点不会耗尽，农田升级额外储量、失效和续种未模拟，也不估算由此节省的木材。';
export const SICILIAN_FORT_CLASSES = new Set([27, 39, 52]);
export const SICILIAN_TC_FORMS = [621, 617, 484, 597];
export const SICILIAN_TIME_TARGETS = new Set([
  'unit:82',
  ...SICILIAN_TC_FORMS.map((id) => 'unit:' + id),
  ...[...SICILIAN_FORT_CLASSES].map((id) => 'class:' + id),
]);
export type SicilianGroup = 228 | 261 | 770 | 772 | 'team';
export const SICILIAN_GROUPS: SicilianGroup[] = [228, 261, 770, 772, 'team'];
/** Identify displaced known rows too, so a wrong source/tech cannot bypass the complete-row guard. */
export function sicilianGroup(row: EffectRow): SicilianGroup | undefined {
  if ([228, 261, 770, 772].includes(row.tech ?? -1)) return row.tech as Exclude<SicilianGroup, 'team'>;
  if (!Array.isArray(row.effects)) return undefined;
  if (row.source === 'team' || row.effects.some((e) => e.target === 'unit:545')) return 'team';
  if (row.effects.some((e) => SICILIAN_TIME_TARGETS.has(e.target ?? '') && e.attr === 'trainTime')) return 770;
  if (row.effects.some((e) => e.kind === 'res' && e.res === 69)) return 772;
  if (row.effects.some((e) => e.kind === 'res' && e.res === 93)) return 228;
  if (row.effects.some((e) => e.kind === 'res' && e.res === 2)) return 261;
  return undefined;
}
export const onlyEffectKeys = (effect: EffectRow['effects'][number], keys: string[]) => Object.keys(effect).every((key) => keys.includes(key));
export const sameIds = (actual: number[] | undefined, expected: readonly number[]) =>
  Array.isArray(actual) && actual.length === expected.length && actual.every((id, index) => id === expected[index]);
export function sicilianRowContext(row: EffectRow, group: SicilianGroup): boolean {
  if (!Array.isArray(row.effects)) return false;
  if (row.age !== 1 || row.source !== (group === 'team' ? 'team' : 'bonus') || row.tech !== (group === 'team' ? undefined : group)) return false;
  if (group === 'team') {
    const e = row.effects[0];
    return (
      row.requires === undefined &&
      row.effects.length === 1 &&
      !!e &&
      onlyEffectKeys(e, ['kind', 'target', 'attr', 'op', 'v']) &&
      e.kind === 'attr' &&
      e.target === 'unit:545' &&
      e.attr === 'cost' &&
      positiveMultiplier(e)
    );
  }
  const requires = group === 228 ? [639, 307] : group === 261 ? [228] : group === 770 ? [307] : [];
  if (!sameIds(row.requires, requires)) return false;
  if (group === 770)
    return (
      row.effects.length === SICILIAN_TIME_TARGETS.size &&
      new Set(row.effects.map((e) => e.target)).size === SICILIAN_TIME_TARGETS.size &&
      row.effects.every(
        (e) =>
          onlyEffectKeys(e, ['kind', 'target', 'attr', 'op', 'v']) &&
          e.kind === 'attr' &&
          SICILIAN_TIME_TARGETS.has(e.target ?? '') &&
          e.attr === 'trainTime' &&
          positiveMultiplier(e),
      )
    );
  const e = row.effects[0];
  return (
    row.effects.length === 1 &&
    !!e &&
    onlyEffectKeys(e, ['kind', 'label', 'res', 'op', 'v']) &&
    e.kind === 'res' &&
    e.res === (group === 228 ? 93 : group === 261 ? 2 : 69) &&
    e.op === (group === 772 ? 'mul' : 'add') &&
    Number.isFinite(e.v) &&
    (group !== 772 || e.v! > 0)
  );
}
/** Reuse the validated physical construction source; completed TC109 has a different time. */
export function sicilianConstructionSource(scope: ReturnType<typeof simScope>): boolean {
  const data = CONSTRUCTION_DATA.civs.Sicilians;
  const forms = CONSTRUCTION_DATA.buildings[TC];
  const rules = data?.automatic.filter((r) => r.id === 770);
  return (
    !!data &&
    !!forms?.supported &&
    sameIds(forms.forms, SICILIAN_TC_FORMS) &&
    rules?.length === 1 &&
    sameIds(rules[0]!.requires, [307]) &&
    rules[0]!.count === 1 &&
    rules[0]!.commands.length === SICILIAN_TIME_TARGETS.size &&
    new Set(rules[0]!.commands.map((c) => (c.A >= 0 ? 'unit:' + c.A : 'class:' + c.B))).size === SICILIAN_TIME_TARGETS.size &&
    rules[0]!.commands.every(
      (c) => c.Type === 5 && c.C === 101 && Number.isFinite(c.D) && c.D > 0 && SICILIAN_TIME_TARGETS.has(c.A >= 0 ? 'unit:' + c.A : 'class:' + c.B),
    ) &&
    [...scope.buildingClass.values()].every((cls) => Number.isInteger(cls) && cls >= 0) &&
    Object.entries(scope.sicilianBuildings ?? {}).every(([id, unit]) => {
      const physical = Number(id) === TC ? data.units[forms.forms[0]!] : data.units[id];
      return physical?.class === unit.class;
    }) &&
    SICILIAN_TC_FORMS.every((id) => {
      const unit = data.units[id];
      return (
        unit?.class === 3 &&
        Number.isFinite(unit.time) &&
        unit.time > 0 &&
        sameIds(unit.at, [118]) &&
        [118, 212].every((builder) => data.units[builder]?.class === 4 && data.units[builder]?.rate === 1)
      );
    })
  );
}
export function sicilianGroupOk(scope: ReturnType<typeof simScope>, group: SicilianGroup): boolean {
  const rows = scope.sicilianRows?.filter((row) => sicilianGroup(row) === group);
  return rows?.length === 1 && sicilianRowContext(rows[0]!, group) && (group !== 770 || sicilianConstructionSource(scope));
}
export const sicilianRowAllowed = (scope: ReturnType<typeof simScope>, row: EffectRow) => {
  if (!scope.sicilianRows) return true;
  const group = sicilianGroup(row);
  return group !== undefined && sicilianGroupOk(scope, group);
};
/** 固定595的四个建筑类别命令；数值倍率仍从实际effects读取。农田class49不在其中。 */
export const MALIAN_BUILDING_CLASSES = new Set([3, 39, 52, 27]);
export const hasMalianBuildingContext = (row: { source?: string; tech?: number; effects?: EffectRow['effects'] }, scope: ReturnType<typeof simScope>) => {
  if (row.source !== 'bonus' || row.tech !== 595 || !row.effects || [...scope.buildingClass.values()].some((cls) => !Number.isInteger(cls) || cls < 0))
    return false;
  const classes = row.effects.filter((effect) => effect.kind === 'attr' && effect.target?.startsWith('class:'));
  return (
    classes.length === MALIAN_BUILDING_CLASSES.size &&
    [...MALIAN_BUILDING_CLASSES].every((cls) =>
      classes.some(
        (effect) => effect.target === 'class:' + cls && effect.attr === 'woodCost' && effect.op === 'mul' && Number.isFinite(effect.v) && effect.v! > 0,
      ),
    )
  );
};
