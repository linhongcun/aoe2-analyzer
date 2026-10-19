/** issue 214：固定人口的单项经济科技收益；游戏数值只从固定导出读取。 */
import ecoRaw from '../data/eco.json';
import { civs } from '../data';
import { DAT } from './datEffects';
import { freeProductionTechs, productionTechAge, type ProductionContext } from './production';
import { gatherModel, type GatherRes } from './realCost';
import { civStatus } from './simulator';
import type { Cost, Tech } from './types';

export const PAYOFF_TARGETS = [202, 203, 221, 55, 182, 278, 279] as const;
export const PAYOFF_BASELINE = [...PAYOFF_TARGETS, 213, 249];
export const PAYOFF_RESOURCES: GatherRes[] = ['Food', 'Wood', 'Gold', 'Stone'];
const TASK = { Food: 'farm', Wood: 'wood', Gold: 'gold', Stone: 'stone' } as const;
type Fx = { kind: string; attr?: string; op?: string; res?: number | string; v?: number; tech?: number };
type Row = { age: number; source: string; name: string; tech?: number; requires?: number[]; effects: Fx[] };
const eco = ecoRaw as unknown as {
  techs: Record<string, { cost: Cost; researchTime: number }>;
  civEco: Record<string, Row[]>;
};
export interface EcoPayoffConfig {
  civ: string;
  age: number;
  target: number;
  known: number[];
  workers: Record<GatherRes, string>;
  distance: string;
  minutes: string;
}
export const DEFAULT_PAYOFF: EcoPayoffConfig = {
  civ: 'Franks',
  age: 2,
  target: 202,
  known: [],
  workers: { Food: '0', Wood: '10', Gold: '0', Stone: '0' },
  distance: '3',
  minutes: '10',
};
const op = (n: number, kind: string | undefined, v: number) => (kind === 'set' ? v : kind === 'mul' ? n * v : n + v);
const unique = (x: string[]) => [...new Set(x)];
export function payoffAvailable(ctx: ProductionContext, config: Pick<EcoPayoffConfig, 'civ' | 'age'>): Tech[] {
  const st = civStatus(ctx.trees, config.civ);
  return ctx.core.techs.filter(
    (t) => PAYOFF_BASELINE.includes(t.id) && t.civs.includes(config.civ) && st['t' + t.id] === 1 && productionTechAge(t, config.civ) <= config.age,
  );
}

/** 非零倍率读取 eco（其科研 op 已修正），零值由 effects 保留的明确 set0 补齐。 */
export function payoffResearch(config: Pick<EcoPayoffConfig, 'civ' | 'age'>, t: Tech) {
  const base = eco.techs[t.id];
  const cost: Cost = { ...(base?.cost ?? t.cost) };
  let time = base?.researchTime ?? t.rt;
  let allCost = 1,
    allTime = 1;
  const notes: string[] = [],
    warnings: string[] = [];
  const rows = [...(eco.civEco[config.civ] ?? [])].filter((r) => r.age <= config.age).sort((a, b) => a.age - b.age);
  for (const row of rows)
    for (const e of row.effects) {
      if (e.kind === 'res' && e.res === 85) {
        if (e.op === 'set' && Number.isFinite(e.v)) {
          allCost = e.v!;
          notes.push('当前时代的文明科研费用倍率');
        } else warnings.push(`${row.name}：科研费用倍率未核实。`);
      }
      if (e.kind === 'res' && e.res === 86) {
        if (e.op === 'set' && Number.isFinite(e.v)) {
          allTime = e.v!;
          notes.push('本文明团队科研时间倍率');
        } else warnings.push(`${row.name}：科研时间倍率未核实。`);
      }
    }
  PAYOFF_RESOURCES.forEach((r) => {
    if (cost[r] !== undefined) cost[r] = cost[r]! * allCost;
  });
  time *= allTime;
  for (const row of rows)
    for (const e of row.effects) {
      if (e.tech !== t.id || !['techCost', 'techTime'].includes(e.kind)) continue;
      if (!['set', 'mul', 'add'].includes(e.op ?? '') || !Number.isFinite(e.v)) {
        warnings.push(`${row.name}：${t.zh}的科研修正未核实。`);
        continue;
      }
      if (e.kind === 'techTime') time = op(time, e.op, e.v!);
      else {
        const affected = String(e.res) === '-1' ? PAYOFF_RESOURCES : PAYOFF_RESOURCES.filter((r) => r === e.res);
        if (!affected.length) {
          warnings.push(`${row.name}：费用资源类型未核实。`);
          continue;
        }
        affected.forEach((r) => {
          cost[r] = op(cost[r] ?? 0, e.op, e.v!);
        });
      }
      notes.push(e.kind === 'techTime' ? '本文明的目标科技研究时间修正' : '本文明的目标科技资源费用修正');
    }
  const resourceName: Record<string, GatherRes> = { 食物: 'Food', 木材: 'Wood', 黄金: 'Gold', 石料: 'Stone' };
  for (const row of DAT.civs[config.civ]?.bonus ?? []) {
    if (row.age > config.age) continue;
    for (const e of row.eco)
      if (e.tid === t.id && e.op === 'set' && e.v === 0) {
        if (e.what === '研究时间') time = 0;
        else if (e.what && resourceName[e.what]) cost[resourceName[e.what]!] = 0;
        notes.push(e.what === '研究时间' ? '文明免研究时间' : `文明免${e.what ?? '科研费用'}`);
      }
  }
  // 与既有 buildSim 的科研费用口径一致；不复用单位价格的半资源取整。
  PAYOFF_RESOURCES.forEach((r) => {
    if (cost[r] !== undefined) cost[r] = Math.max(0, Math.round(cost[r]!));
  });
  if (!Number.isFinite(time) || time < 0 || PAYOFF_RESOURCES.some((r) => !Number.isFinite(cost[r] ?? 0))) warnings.push('费用或研究时间不是有效数值。');
  return { cost, time, notes: unique(notes), warnings: unique(warnings) };
}

export interface PayoffResource {
  key: GatherRes;
  workers: number;
  beforeRate: number;
  afterRate: number;
  beforeIncome: number;
  afterIncome: number;
  gainPerMinute: number;
  gain: number;
  cost: number;
}
export interface EcoPayoffResult {
  state: 'ready' | 'already' | 'free' | 'invalid';
  errors: string[];
  warnings: string[];
  target: Tech | null;
  resources: PayoffResource[];
  known: Set<number>;
  free: Set<number>;
  time: number;
  cost: Cost;
  costNotes: string[];
  investment: number;
  labourGainPerSecond: number;
  balance: number | null;
  windowLabourGain: number;
  complete: boolean;
}
export function calculateEcoPayoff(ctx: ProductionContext, config: EcoPayoffConfig): EcoPayoffResult {
  const errors: string[] = [],
    warnings: string[] = [];
  const target = ctx.core.techById[config.target] ?? null;
  const available = payoffAvailable(ctx, config),
    allowed = new Set(available.map((t) => t.id));
  const free = new Set([...freeProductionTechs(ctx, config)].filter((id) => PAYOFF_BASELINE.includes(id)));
  const known = new Set([...config.known, ...free]);
  if (!civs.some((c) => c.en === config.civ)) errors.push('文明不存在，请重新选择。');
  if (![1, 2, 3, 4].includes(config.age)) errors.push('时代无效。');
  if (!PAYOFF_TARGETS.some((id) => id === config.target) || !target) errors.push('请选择伐木、采金或采石科技作为目标。');
  else if (!allowed.has(config.target)) errors.push(`${target.zh}在当前文明或时代不可用。`);
  for (const id of config.known) if (!allowed.has(id)) errors.push(`已有科技 ID ${id} 在当前文明或时代不可用。`);
  const checkPre = (id: number, label: string) => {
    const pre = ctx.core.techById[id]?.pre;
    if (pre && !known.has(pre)) errors.push(`${label}缺少前置：${ctx.core.techById[pre]?.zh ?? pre}。请在已有科技中明确勾选。`);
  };
  for (const id of known) if (allowed.has(id)) checkPre(id, `已有${ctx.core.techById[id]?.zh ?? '科技'}`);
  if (target && !known.has(target.id)) checkPre(target.id, target.zh);
  for (const r of PAYOFF_RESOURCES)
    if (!/^\d+$/.test(config.workers[r]) || +config.workers[r] > 200)
      errors.push(`${r === 'Food' ? '食物' : r === 'Wood' ? '木材' : r === 'Gold' ? '黄金' : '石料'}村民数须为 0–200 的整数。`);
  const distance = Number(config.distance),
    minutes = Number(config.minutes);
  if (!config.distance.trim() || !Number.isFinite(distance) || distance < 0 || distance > 10) errors.push('单程距离须为 0–10 格。');
  if (!config.minutes.trim() || !Number.isFinite(minutes) || minutes <= 0 || minutes > 120) errors.push('观察时长须大于 0 且不超过 120 分钟。');
  const result: EcoPayoffResult = {
    state: 'invalid',
    errors: unique(errors),
    warnings,
    target,
    resources: [],
    known,
    free,
    time: 0,
    cost: {},
    costNotes: [],
    investment: 0,
    labourGainPerSecond: 0,
    balance: null,
    windowLabourGain: 0,
    complete: false,
  };
  if (errors.length || !target) return result;
  const isKnown = known.has(target.id);
  const afterKnown = new Set([...known, target.id]);
  const before = gatherModel(config.age, config.civ, { techIds: known, walkTiles: distance });
  const after = gatherModel(config.age, config.civ, { techIds: afterKnown, walkTiles: distance });
  const research = payoffResearch(config, target);
  warnings.push(...research.warnings, ...before.unsupported.map((x) => `${x.label}：采集机制未完整计入。`));
  const special: Record<string, string> = {
    Danes: '丹麦村民存放食物的额外收益未计入，食物劳动量折算不完整。',
    Muisca: '穆伊斯卡自身团队天然黄金机制尚未完整核实。',
    Wei: '魏研究经济科技赠送村民未计入；本模型固定村民人数。',
    Spanish: '西班牙研究科技获得黄金的奖励未计入。',
    Khitans: '契丹的牧场食物机制不在农田基准模型内。',
  };
  if (special[config.civ]) warnings.push(special[config.civ]!);
  if (config.civ === 'Vietnamese' && config.age === 4) warnings.push('越南纸币及其与伐木科技的额外产金联动未计入。');
  const time = isKnown ? 0 : research.time;
  const cost = isKnown ? {} : research.cost;
  const resources = PAYOFF_RESOURCES.map((key) => {
    const beforeRate = before.rate[TASK[key]],
      afterRate = after.rate[TASK[key]],
      workers = +config.workers[key];
    const delta = workers * (afterRate - beforeRate);
    return {
      key,
      workers,
      beforeRate,
      afterRate,
      beforeIncome: workers * beforeRate * 60,
      afterIncome: workers * afterRate * 60,
      gainPerMinute: delta * 60,
      gain: delta * Math.max(0, minutes * 60 - time),
      cost: cost[key] ?? 0,
    };
  });
  const investment = resources.reduce((n, r) => n + r.cost / r.beforeRate, 0);
  const labourGainPerSecond = resources.reduce((n, r) => n + r.gainPerMinute / 60 / r.beforeRate, 0);
  const complete = warnings.length === 0;
  const balance = !isKnown && complete && labourGainPerSecond > 0 ? time + investment / labourGainPerSecond : null;
  return {
    ...result,
    state: free.has(target.id) ? 'free' : isKnown ? 'already' : 'ready',
    errors: [],
    warnings: unique(warnings),
    resources,
    time,
    cost,
    costNotes: research.notes,
    investment,
    labourGainPerSecond,
    balance,
    windowLabourGain: resources.reduce((n, r) => n + r.gain / r.beforeRate, 0),
    complete,
  };
}

export function encodeEcoPayoff(c: EcoPayoffConfig): string {
  return new URLSearchParams({
    civ: c.civ,
    age: String(c.age),
    target: String(c.target),
    known: [...new Set(c.known)].sort((a, b) => a - b).join(','),
    distance: c.distance,
    minutes: c.minutes,
    food: c.workers.Food,
    wood: c.workers.Wood,
    gold: c.workers.Gold,
    stone: c.workers.Stone,
  }).toString();
}
export function decodeEcoPayoff(search: string): { config: EcoPayoffConfig; errors: string[] } {
  const p = new URLSearchParams(search),
    errors: string[] = [];
  const config = { ...DEFAULT_PAYOFF, known: [] as number[], workers: { ...DEFAULT_PAYOFF.workers } };
  for (const key of ['civ', 'age', 'target', 'known', 'distance', 'minutes', 'food', 'wood', 'gold', 'stone'])
    if (p.getAll(key).length > 1) errors.push(`链接参数 ${key} 重复，请重置后重新配置。`);
  if (p.has('civ')) config.civ = p.get('civ')!;
  for (const key of ['age', 'target'] as const)
    if (p.has(key)) {
      const raw = p.get(key)!;
      if (/^\d+$/.test(raw) && Number.isSafeInteger(+raw)) config[key] = +raw;
      else errors.push(`链接参数 ${key} 不是有效整数。`);
    }
  if (p.has('known')) {
    const raw = p.get('known')!;
    if (raw && !/^\d+(,\d+)*$/.test(raw)) errors.push('已有科技链接格式无效。');
    else config.known = raw ? [...new Set(raw.split(',').map(Number))] : [];
  }
  for (const key of ['distance', 'minutes'] as const) if (p.has(key)) config[key] = p.get(key)!;
  for (const key of PAYOFF_RESOURCES) if (p.has(key.toLowerCase())) config.workers[key] = p.get(key.toLowerCase())!;
  return { config, errors };
}
