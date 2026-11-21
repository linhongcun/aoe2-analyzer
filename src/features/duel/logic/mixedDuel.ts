import { civByEn, type Core } from '../../../data';
import { TEAM_BONUSES } from '../../../domain/effects';
import { applicableTrainingTechs } from '../../../domain/duelTrainingCost';
import type { MixedSideInput } from '../../../domain/mixedDuelParams';
import { mixedFighterError, type MixedFighter } from '../../../domain/mixedFight';
import { prereqChain } from '../../../domain/prereq';
import { civStatus, simTechs, type SimContext } from '../../../domain/simulator';
import type { Tech, Unit } from '../../../domain/types';
import { unitAvailable } from '../../../domain/unitAvailability';
import { isUnavail, resolve, type Resolved } from './duelSide';

export interface MixedFieldError {
  field: string;
  message: string;
}
export interface MixedTechOption {
  t: Tech;
  numeric: boolean;
  cost: boolean;
  rows: number[];
}
export interface MixedRowView {
  unit?: Unit;
  resolved?: Resolved;
}
export interface MixedSideView {
  errors: MixedFieldError[];
  rows: MixedRowView[];
  techs: MixedTechOption[];
  army: MixedFighter[] | null;
  total: number | null;
}
export const positiveId = (raw: string): number | null => (/^[1-9]\d*$/.test(raw) && Number.isSafeInteger(+raw) ? +raw : null);

export function resolveMixedSide(ctx: SimContext, core: Core, input: MixedSideInput, side: 'a' | 'b'): MixedSideView {
  const errors: MixedFieldError[] = [];
  const fail = (field: string, message: string) => errors.push({ field: `mix-${side}-${field}`, message: `${side.toUpperCase()} 方${message}` });
  const civ = civByEn(input.civ);
  const age = /^[1-4]$/.test(input.age) ? +input.age : null;
  if (!civ || !ctx.trees.t[input.civ]) fail('civ', `文明无效：${input.civ || '未选择'}`);
  if (!age) fail('age', `时代无效：${input.age || '未选择'}`);
  if (!input.rows.length || input.rows.length > 3) fail('rows', '须配置 1–3 行不同单位');
  const seen = new Set<number>();
  const rows: MixedRowView[] = input.rows.map((row, i) => {
    const uid = positiveId(row.uid);
    const u = uid === null ? undefined : core.unitById[uid];
    if (!u || !u.civs.length) fail(`unit-${i}`, `第 ${i + 1} 行单位无效：${row.uid || '未选择'}`);
    if (uid !== null && seen.has(uid)) fail(`unit-${i}`, `第 ${i + 1} 行单位重复；具体单位 ID 不能重复`);
    if (uid !== null) seen.add(uid);
    const qty = positiveId(row.qty);
    if (qty === null || qty > 200) fail(`qty-${i}`, `第 ${i + 1} 行数量须为 1–200 的正整数`);
    if (u && civ && age) {
      if (!u.civs.includes(input.civ)) fail(`unit-${i}`, `第 ${i + 1} 行${civ.zh}不可用${u.zh}，请更换单位或文明`);
      else if (!unitAvailable({ core, trees: ctx.trees }, input.civ, u.id, age))
        fail(`unit-${i}`, `第 ${i + 1} 行${u.zh}在本方时代不可用，请显式提高本方时代或更换单位`);
    }
    return { unit: u };
  });
  const total = input.rows.every((r) => positiveId(r.qty) !== null) ? input.rows.reduce((s, r) => s + +r.qty, 0) : null;
  if (total !== null && (!Number.isSafeInteger(total) || total < 1 || total > 200)) fail('rows', '合计须为 1–200 个单位');
  const candidates = new Map<number, MixedTechOption>();
  const status = civ ? civStatus(ctx.trees, input.civ) : {};
  rows.forEach(({ unit: u }, i) => {
    if (!u || !civ || !u.civs.includes(input.civ)) return;
    const avail = simTechs(ctx, u, input.civ);
    const costs = applicableTrainingTechs(ctx, u, input.civ, age ?? 4);
    for (const item of [
      ...avail.map(({ t, ef }) => ({ t, numeric: !!ef, cost: false })),
      ...costs.map(({ tech, supported }) => ({ t: tech, numeric: false, cost: supported })),
    ]) {
      if (!status['t' + item.t.id]) continue;
      const current = candidates.get(item.t.id);
      if (current) {
        if (!current.rows.includes(i)) current.rows.push(i);
        current.numeric ||= item.numeric;
        current.cost ||= item.cost;
      } else candidates.set(item.t.id, { ...item, rows: [i] });
    }
  });
  const techs = [...candidates.values()].sort((a, b) => a.t.age - b.t.age || a.t.id - b.t.id);
  const selected = new Set<number>();
  for (const raw of input.techs) {
    const id = positiveId(raw),
      option = id === null ? undefined : candidates.get(id);
    if (id === null || !option) fail('techs', `科技无效或对本方全部单位不适用：${raw || '空值'}`);
    else {
      if (selected.has(id)) fail('techs', `科技 ID 重复：${raw}`);
      selected.add(id);
      if (age && option.t.age > age) fail('techs', `科技${option.t.zh}高于本方时代`);
      for (const pre of prereqChain(option.t, core.techById)) {
        if (candidates.has(pre.id) && !input.techs.includes(String(pre.id))) fail('techs', `科技${option.t.zh}缺少可选前置${pre.zh}`);
      }
    }
  }
  const team = new Set<number>();
  for (const raw of input.team) {
    const id = /^(0|[1-9]\d*)$/.test(raw) && Number.isSafeInteger(+raw) ? +raw : -1;
    if (!TEAM_BONUSES[id]) fail('team', `团队效果索引无效：${raw || '空值'}`);
    else if (team.has(id)) fail('team', `团队效果重复：${raw}`);
    else team.add(id);
  }
  rows.forEach((row, i) => {
    const u = row.unit;
    if (!u || !civ || !age || !unitAvailable({ core, trees: ctx.trees }, input.civ, u.id, age)) return;
    const applicable = [...selected].filter((id) => candidates.get(id)?.rows.includes(i));
    const result = resolve(ctx, core.unitById, { uid: u.id, civ: input.civ, age, ageSet: true, techs: applicable, team: [...team] }, u.id);
    if (isUnavail(result) || result.civ !== input.civ || result.age !== age || result.u.id !== u.id) {
      fail(`unit-${i}`, `第 ${i + 1} 行上下文解析不一致，未计算`);
      return;
    }
    row.resolved = result;
    const reason = mixedFighterError(result.F);
    if (reason || !Number.isFinite(result.S.acc) || result.S.acc < 0 || result.S.acc > 100) {
      fail(`unit-${i}`, `的${u.zh}${reason ?? '命中率无效'}`);
    }
  });
  return {
    errors,
    rows,
    techs,
    total: errors.some((e) => e.field !== `mix-${side}-techs` && e.field !== `mix-${side}-team`) ? null : total,
    army: errors.length ? null : rows.map((r, i) => ({ uid: r.unit!.id, count: +input.rows[i]!.qty, fighter: r.resolved!.F })),
  };
}
