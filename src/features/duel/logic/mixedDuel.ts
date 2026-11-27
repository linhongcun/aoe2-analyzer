import { civByEn, type Core } from '../../../data';
import { militaryTechAge } from '../../../domain/availabilityAge';
import { isDuelExcludedUnit } from '../../../domain/duelBudget';
import { TEAM_BONUSES, unitRelicBonus } from '../../../domain/effects';
import { applicableTrainingTechs } from '../../../domain/duelTrainingCost';
import type { MixedSideInput } from '../../../domain/mixedDuelParams';
import { mixedFighterError, type MixedFighter } from '../../../domain/mixedFight';
import { prereqChain } from '../../../domain/prereq';
import { parseRelicCount } from '../../../domain/relicParams';
import { keepsScopedUnmodeledTech } from '../../../domain/duelUnmodeledEco';
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
  partial?: boolean;
  rows: number[];
  chargeOnlyRows?: number[];
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

/** 混编单侧命中圣物加攻的单位中文名（按行序去重，不依赖 row.resolved 以确保低时代仍显示禁用态）。 */
export function mixedSideRelicMatchedUnits(civ: string, rows: readonly MixedRowView[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const u = row.unit;
    if (!u || isDuelExcludedUnit(u.id) || !unitRelicBonus(civ, u)) continue;
    if (!seen.has(u.zh)) {
      seen.add(u.zh);
      names.push(u.zh);
    }
  }
  return names;
}

/** 混编单侧切换文明时，同时剥离原文明（兼容旧链残留）与目标文明自身的团队索引，避免原文明隐藏本方索引泄漏为新文明的额外盟友。 */
export function filterMixedTeamOnCivChange(prevCiv: string, nextCiv: string, rawTeam: readonly string[]): string[] {
  return rawTeam.filter((raw) => {
    if (!(/^(0|[1-9]\d*)$/.test(raw) && Number.isSafeInteger(+raw))) return true;
    const owner = TEAM_BONUSES[+raw]?.[0];
    return owner !== prevCiv && owner !== nextCiv;
  });
}

/** 混编单侧若不再含圣物命中单位行，移除其 relics 字段。 */
export function stripIneligibleMixedRelics(core: Core, sideInput: MixedSideInput): MixedSideInput {
  if (!sideInput.relics) return sideInput;
  const eligible = sideInput.rows.some((row) => {
    const uid = positiveId(row.uid);
    const u = uid !== null ? core.unitById[uid] : undefined;
    return Boolean(u && !isDuelExcludedUnit(u.id) && unitRelicBonus(sideInput.civ, u));
  });
  if (eligible) return sideInput;
  const { relics: _dropped, ...rest } = sideInput;
  void _dropped;
  return rest;
}

/**
 * issue 1279：判断混编单侧是否具备切回单兵种模式的最小有效上下文（允许自爆单位与科技树时代滞后单位安全退出，不锁死退路）。
 */
export function canRecoverSingleDuelSide(ctx: SimContext, core: Core, input: MixedSideInput, requireQty: boolean): boolean {
  const row0 = input.rows[0];
  if (!row0) return false;
  const uid = positiveId(row0.uid);
  if (uid === null) return false;
  const u = core.unitById[uid];
  if (!u || !u.civs.length) return false;
  if (!civByEn(input.civ) || !ctx.trees.t[input.civ]) return false;
  const age = /^[1-4]$/.test(input.age) ? +input.age : null;
  if (!age) return false;
  if (requireQty) {
    const qty = positiveId(row0.qty);
    if (qty === null || qty > 200) return false;
  }
  const status = civStatus(ctx.trees, input.civ);
  const seenTechs = new Set<number>();
  for (const raw of input.techs) {
    const id = positiveId(raw);
    const tech = id === null ? undefined : core.techById[id];
    if (id === null || !tech || seenTechs.has(id) || militaryTechAge(input.civ, id, tech.age) > age || !status['t' + id]) return false;
    seenTechs.add(id);
  }
  const seenTeam = new Set<number>();
  for (const raw of input.team) {
    const id = /^(0|[1-9]\d*)$/.test(raw) && Number.isSafeInteger(+raw) ? +raw : -1;
    if (!TEAM_BONUSES[id] || seenTeam.has(id)) return false;
    seenTeam.add(id);
  }
  return true;
}

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
    else if (isDuelExcludedUnit(u.id))
      fail(
        `unit-${i}`,
        `第 ${i + 1} 行「精锐钦察（库曼雇佣兵）」没有训练造价，单位 PK 不再提供；本方已存在城堡训练的精锐钦察或重复行，无法在不改动受击顺序的前提下自动替换，请删除该行或更换单位`,
      );
    if (uid !== null && seen.has(uid)) fail(`unit-${i}`, `第 ${i + 1} 行单位重复；具体单位 ID 不能重复`);
    if (uid !== null) seen.add(uid);
    const qty = positiveId(row.qty);
    if (qty === null || qty > 200) fail(`qty-${i}`, `第 ${i + 1} 行数量须为 1–200 的正整数`);
    if (u && !isDuelExcludedUnit(u.id) && civ && age) {
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
    if (!u || isDuelExcludedUnit(u.id) || !civ || !u.civs.includes(input.civ)) return;
    const avail = simTechs(ctx, u, input.civ);
    const costs = applicableTrainingTechs(ctx, u, input.civ, age ?? 4);
    for (const item of [
      ...avail
        .filter(({ t, ef }) => {
          if (ef !== null) return true;
          return keepsScopedUnmodeledTech(t, input.civ, u.id, u.chargeType ?? 0);
        })
        .map(({ t, ef, chargeOnly }) => ({ t, numeric: !!ef, cost: false, partial: false, chargeOnly: !!chargeOnly })),
      ...costs.map(({ tech, supported, partial }) => ({
        t: tech,
        numeric: false,
        cost: supported && !partial,
        partial: Boolean(partial),
        chargeOnly: false,
      })),
    ]) {
      if (!status['t' + item.t.id]) continue;
      const current = candidates.get(item.t.id);
      if (current) {
        if (!current.rows.includes(i)) current.rows.push(i);
        if (item.chargeOnly) {
          current.chargeOnlyRows ??= [];
          if (!current.chargeOnlyRows.includes(i)) current.chargeOnlyRows.push(i);
        }
        current.numeric ||= item.numeric;
        current.cost ||= item.cost;
        if (item.partial) current.partial = true;
      } else {
        const next: MixedTechOption = { t: item.t, numeric: item.numeric, cost: item.cost, rows: [i] };
        if (item.partial) next.partial = true;
        if (item.chargeOnly) next.chargeOnlyRows = [i];
        candidates.set(item.t.id, next);
      }
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
      if (age && militaryTechAge(input.civ, option.t.id, option.t.age) > age) fail('techs', `科技${option.t.zh}高于本方时代`);
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
  const sideRelics = parseRelicCount(input.relics);
  rows.forEach((row, i) => {
    const u = row.unit;
    if (!u || isDuelExcludedUnit(u.id) || !civ || !age || !unitAvailable({ core, trees: ctx.trees }, input.civ, u.id, age)) return;
    const applicable = [...selected].filter((id) => candidates.get(id)?.rows.includes(i));
    const result = resolve(ctx, core.unitById, { uid: u.id, civ: input.civ, age, ageSet: true, techs: applicable, team: [...team] }, u.id, sideRelics);
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
