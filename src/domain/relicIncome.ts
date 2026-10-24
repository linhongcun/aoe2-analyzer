/** Issue 238 fixed-state relic estimate. Data fields and documented engine semantics are separate evidence. */
import civs from '../data/raw/civs';

export const RELIC_RESOURCES = ['Gold', 'Food', 'Wood', 'Stone'] as const;
export type RelicResource = (typeof RELIC_RESOURCES)[number];
export const RELIC_INPUT_MAX = 1_000_000;
export const RELIC_URL_MAX = 8000;
export const ATHEISM_STATES = ['none', 'one', 'multiple', 'unknown', 'changing'] as const;
export type RelicAtheism = (typeof ATHEISM_STATES)[number];
export interface RelicIncomeConfig {
  civ: string;
  count: string;
  minutes: string;
  target: string;
  /** Distinct player slots; civilizations may repeat. Effective team sources are deduplicated. */
  allies: [string, string, string];
  grandTrunkRoad: boolean;
  atheism: RelicAtheism;
}
interface RelicModifier {
  resources: number[];
  operation: 'set' | 'mul';
  value: number;
  displayValue: number;
  civ: string;
  effectId: number;
  techId: number | null;
}
export interface RelicIncomeData {
  meta: {
    patch: string;
    datSha256: string;
    datSource: { repo: string; commit: string; path: string };
    engineVerifiedInPinnedBuild: boolean;
    fieldSemantics: { resources: string; effectTypes: string };
    semanticsChecked: string;
  };
  resourceIds: Record<RelicResource, number>;
  baseRates: Record<RelicResource, number>;
  civs: Record<string, { datCiv: number; baseResources: Record<string, number> }>;
  modifiers: Record<'aztecs' | 'burgundians' | 'grandTrunkRoad' | 'atheism', RelicModifier>;
  lithuanians: {
    countResource: number;
    thresholds: { count: number; tech: { id: number }; effect: { id: number } }[];
    cap: number;
    attackIncrement: number;
    units: { id: number; zh: string; en: string }[];
    extraRawTargets: { id: number; zh: string; en: string }[];
  };
  audit: { unitTaskCount: number; headerTaskCount: number; resourceCommands: unknown[]; resourceTaskReferences: unknown[] };
}
export const newRelicIncomeConfig = (): RelicIncomeConfig => ({
  civ: 'Franks',
  count: '1',
  minutes: '10',
  target: '0',
  allies: ['', '', ''],
  grandTrunkRoad: false,
  atheism: 'none',
});
const knownCiv = (civ: string) => civs.some((c) => c.en === civ);
const numeric = (s: string, whole = false) =>
  typeof s === 'string' && s.length <= 32 && (whole ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(s) && Number.isFinite(+s) && +s >= 0 && +s <= RELIC_INPUT_MAX;
const atheismValid = (s: string): s is RelicAtheism => (ATHEISM_STATES as readonly string[]).includes(s);
const textOfCiv = (name: string) => civs.find((c) => c.en === name)?.zh ?? name;

export function validateRelicIncomeConfig(c: RelicIncomeConfig): string[] {
  const errors: string[] = [];
  if (!knownCiv(c.civ)) errors.push('文明不存在，请重新选择。');
  if (!numeric(c.count, true)) errors.push('圣物数量须为 0–1000000 的整数。');
  if (!numeric(c.minutes)) errors.push('持续时长须为 0–1000000 的有限游戏分钟。');
  if (!numeric(c.target)) errors.push('目标金耗须为 0–1000000 的有限数。');
  if (!Array.isArray(c.allies) || c.allies.length !== 3 || c.allies.some((a) => a !== '' && !knownCiv(a))) errors.push('队友文明不存在或玩家槽位无效。');
  if (typeof c.grandTrunkRoad !== 'boolean') errors.push('大干道研究状态无效。');
  else if (c.grandTrunkRoad && c.civ !== 'Hindustanis') errors.push('大干道仅适用于本方印度斯坦；请修正文明或取消已研究。');
  if (!atheismValid(c.atheism)) errors.push('无神论状态无效，请重新选择。');
  return errors;
}

/** Refuse malformed lazy data instead of showing a normal-civilization fallback. */
export function validRelicIncomeData(value: unknown): value is RelicIncomeData {
  if (!value || typeof value !== 'object') return false;
  const d = value as RelicIncomeData;
  return Boolean(
    d.meta?.datSha256 &&
    d.meta?.datSource?.commit &&
    d.meta?.fieldSemantics?.resources &&
    d.meta?.fieldSemantics?.effectTypes &&
    d.meta.engineVerifiedInPinnedBuild === false &&
    d.civs &&
    civs.every((c) => d.civs[c.en]) &&
    d.resourceIds &&
    typeof d.resourceIds === 'object' &&
    !Array.isArray(d.resourceIds) &&
    Object.keys(d.resourceIds).length === RELIC_RESOURCES.length &&
    RELIC_RESOURCES.every((r) => Number.isSafeInteger(d.resourceIds[r]) && d.resourceIds[r] >= 0) &&
    new Set(RELIC_RESOURCES.map((r) => d.resourceIds[r])).size === RELIC_RESOURCES.length &&
    RELIC_RESOURCES.every((r) => Number.isFinite(d.baseRates?.[r]) && d.baseRates[r] >= 0) &&
    ['aztecs', 'burgundians', 'grandTrunkRoad', 'atheism'].every((id) => {
      const m = d.modifiers?.[id as keyof RelicIncomeData['modifiers']];
      return (
        m &&
        Array.isArray(m.resources) &&
        m.resources.every((id) => Number.isSafeInteger(id) && RELIC_RESOURCES.some((resource) => d.resourceIds[resource] === id)) &&
        ['mul', 'set'].includes(m.operation) &&
        Number.isFinite(m.value) &&
        m.value >= 0 &&
        Number.isFinite(m.displayValue)
      );
    }) &&
    Array.isArray(d.lithuanians?.units) &&
    Array.isArray(d.lithuanians?.extraRawTargets) &&
    Array.isArray(d.lithuanians?.thresholds) &&
    d.lithuanians.thresholds.length > 0 &&
    Number.isFinite(d.lithuanians.cap) &&
    Number.isFinite(d.lithuanians.attackIncrement) &&
    d.lithuanians.attackIncrement >= 0 &&
    [...d.lithuanians.units, ...d.lithuanians.extraRawTargets].every(
      (u) => u && Number.isSafeInteger(u.id) && typeof u.zh === 'string' && typeof u.en === 'string',
    ) &&
    d.lithuanians.thresholds.every((t) => Number.isFinite(t.count) && t.tech?.id >= 0 && t.effect?.id >= 0) &&
    d.audit &&
    Number.isSafeInteger(d.audit.unitTaskCount) &&
    Number.isSafeInteger(d.audit.headerTaskCount) &&
    Array.isArray(d.audit.resourceCommands) &&
    Array.isArray(d.audit.resourceTaskReferences),
  );
}
export interface RelicSourceRow {
  id: string;
  label: string;
  resource: RelicResource;
  providers: string[];
  rule: string;
  effectId: number | null;
  perMinute: number | null;
  total: number | null;
}
export interface RelicIncomeResult {
  status: 'valid' | 'paused' | 'invalid';
  errors: string[];
  warnings: string[];
  resources: Record<RelicResource, { perMinute: number | null; total: number | null }>;
  sources: RelicSourceRow[];
  target: number | null;
  covered: number | null;
  gap: number | null;
  lithuanian: { bonus: number; cap: number; thresholds: number[] } | null;
}
export function calculateRelicIncome(c: RelicIncomeConfig, d: RelicIncomeData): RelicIncomeResult {
  const errors = validateRelicIncomeConfig(c);
  if (!validRelicIncomeData(d)) errors.push('固定圣物数据无法核对，暂停计算。');
  const result: RelicIncomeResult = {
    status: 'invalid',
    errors,
    warnings: [],
    resources: Object.fromEntries(RELIC_RESOURCES.map((r) => [r, { perMinute: null, total: null }])) as RelicIncomeResult['resources'],
    sources: [],
    target: null,
    covered: null,
    gap: null,
    lithuanian: null,
  };
  if (errors.length) return result;
  const count = +c.count,
    minutes = +c.minutes;
  const rates = { ...d.baseRates };
  const add = (id: string, label: string, resource: RelicResource, providers: string[], rule: string, delta: number, effectId: number | null) => {
    result.sources.push({ id: `${id}-${resource}`, label, resource, providers, rule, effectId, perMinute: delta * count, total: delta * count * minutes });
  };
  for (const r of RELIC_RESOURCES) add('base', '通用规则', r, ['全部已支持文明'], `每件每游戏分钟 ${d.baseRates[r]}`, rates[r], null);
  const players = [{ civ: c.civ, label: '本方' }, ...c.allies.map((civ, i) => ({ civ, label: `队友${i + 1}` }))];
  const apply = (id: keyof RelicIncomeData['modifiers'], label: string, providers: string[]) => {
    const m = d.modifiers[id];
    for (const r of RELIC_RESOURCES.filter((resource) => m.resources.includes(d.resourceIds[resource]))) {
      const before = rates[r];
      rates[r] = m.operation === 'mul' ? before * m.value : m.value;
      add(id, label, r, providers, `${m.operation === 'mul' ? '倍率' : '每件每游戏分钟设为'} ${m.displayValue}`, rates[r] - before, m.effectId);
    }
  };
  for (const [id, name] of [
    ['aztecs', '阿兹特克团队'],
    ['burgundians', '勃艮第团队'],
  ] as const) {
    const providers = players.filter((p) => p.civ === d.modifiers[id].civ).map((p) => `${p.label}（${textOfCiv(p.civ)}）`);
    if (providers.length) apply(id, name, providers);
  }
  if (c.grandTrunkRoad) apply('grandTrunkRoad', '本方大干道', ['本方印度斯坦，整个期间已研究']);
  if (c.atheism === 'one') apply('atheism', '对手无神论', ['一个敌对或中立匈奴来源，整个期间已生效']);
  if (c.atheism === 'none') result.warnings.push('当前按无神论未生效计算；这是方案假设，请按本局实际情况确认。');
  const paused = ['multiple', 'unknown', 'changing'].includes(c.atheism);
  if (paused) result.warnings.push('无神论来源为多个、未知或期间变化，黄金与食物未核实，已暂停；木材和石料保留已审计的零收入。');
  if (c.civ === 'Armenians') result.warnings.push('亚美尼亚免费圣物如已存放，应包含在填写的数量中；本工具不会再加一件。');
  for (const r of RELIC_RESOURCES) {
    if (paused && (r === 'Gold' || r === 'Food')) continue;
    result.resources[r] = { perMinute: rates[r] * count, total: rates[r] * count * minutes };
  }
  if (paused)
    for (const row of result.sources)
      if (row.resource === 'Gold' || row.resource === 'Food') {
        row.perMinute = null;
        row.total = null;
      }
  result.target = +c.target;
  const gold = result.resources.Gold.perMinute;
  if (gold !== null) {
    result.covered = Math.min(result.target, gold);
    result.gap = Math.max(result.target - gold, 0);
  }
  if (c.civ === 'Lithuanians') {
    const l = d.lithuanians;
    result.lithuanian = {
      bonus: l.thresholds.filter((t) => count >= t.count).length * l.attackIncrement,
      cap: l.cap * l.attackIncrement,
      thresholds: l.thresholds.map((t) => t.count),
    };
  }
  result.status = paused ? 'paused' : 'valid';
  return result;
}

const keys = ['v', 'civ', 'count', 'minutes', 'target', 'a1', 'a2', 'a3', 'gtr', 'atheism'];
export function encodeRelicIncome(c: RelicIncomeConfig): string {
  return new URLSearchParams({
    v: '1',
    civ: c.civ,
    count: c.count,
    minutes: c.minutes,
    target: c.target,
    a1: c.allies[0],
    a2: c.allies[1],
    a3: c.allies[2],
    gtr: c.grandTrunkRoad ? '1' : '0',
    atheism: c.atheism,
  }).toString();
}
export function decodeRelicIncome(search: string): { config: RelicIncomeConfig; structuralErrors: string[]; errors: string[] } {
  const c = newRelicIncomeConfig(),
    structuralErrors: string[] = [];
  if (!search || search === '?') return { config: c, structuralErrors, errors: [] };
  try {
    decodeURIComponent(search.replace(/\+/g, ' '));
  } catch {
    structuralErrors.push('方案链接编码损坏。');
  }
  if (search.length > RELIC_URL_MAX) structuralErrors.push('方案链接超过 8000 字符上限。');
  const p = new URLSearchParams(search);
  for (const key of p.keys()) if (!keys.includes(key)) structuralErrors.push(`链接含未知参数 ${key}。`);
  for (const key of keys) if (p.getAll(key).length !== 1) structuralErrors.push(`链接参数 ${key} 缺失或重复。`);
  if (p.get('v') !== '1') structuralErrors.push('方案链接版本不支持。');
  if (!['0', '1'].includes(p.get('gtr') ?? '')) structuralErrors.push('大干道状态编码无效。');
  for (const key of ['civ', 'count', 'minutes', 'target'] as const) if (p.has(key)) c[key] = p.get(key)!;
  c.allies = [p.get('a1') ?? '', p.get('a2') ?? '', p.get('a3') ?? ''];
  c.grandTrunkRoad = p.get('gtr') === '1';
  c.atheism = (p.get('atheism') ?? '') as RelicAtheism;
  return { config: c, structuralErrors: [...new Set(structuralErrors)], errors: [...new Set([...structuralErrors, ...validateRelicIncomeConfig(c)])] };
}
/** Use document base so Pages project paths remain intact; unrelated outer query is removed. */
export function relicIncomeShareUrl(c: RelicIncomeConfig, base: string): string {
  if (validateRelicIncomeConfig(c).length) throw new Error('当前输入无效，不能生成完整方案链接。');
  const query = encodeRelicIncome(c);
  if (query.length > RELIC_URL_MAX) throw new Error('方案链接超长，未生成分享链接。');
  const url = new URL(base);
  url.search = '';
  url.hash = '/relic-income?' + query;
  return url.href;
}
