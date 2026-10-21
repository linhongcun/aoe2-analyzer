import type { Trees, Unit } from './types';
import { civStatus } from './civStatus';
/**
 * 升级路线：向前追溯 from_，向后寻找以当前单位为 from_ 的单位。
 * 有分叉时（如重装骑士→游侠 / 萨瓦尔）：
 * - 不传 avail（通用视角）：取非独特单位的那条（游侠）。
 * - 传入 avail（所选文明可用性）：只在该文明可用的候选里选，优先独特单位（波斯→萨瓦尔）；都不可用则停止。
 */
export function upgradeLine(u: Unit, units: Unit[], byId: Record<number, Unit>, avail?: (id: number) => boolean): Unit[] {
  const a = [u];
  let x = u;
  while (x.from_ != null && byId[x.from_] && a.length < 10) {
    x = byId[x.from_]!;
    a.unshift(x);
  }
  let y = u;
  for (let g = 0; g < 10; g++) {
    const from = y.id;
    let cs = units.filter((v) => v.from_ === from);
    if (avail) cs = cs.filter((v) => avail(v.id));
    const uniq = cs.find((v) => v.type === 'UniqueUnit');
    const gen = cs.find((v) => v.type !== 'UniqueUnit');
    const n = avail ? (uniq ?? gen) : (gen ?? cs[0]);
    if (!n) break;
    a.push(n);
    y = n;
  }
  return a;
}

/** 独特单位所属文明（按科技树可用性），用于升级路线上的「{单位} · {文明}」小标签（#10） */
export function uniqueCivs(u: Unit, trees: Trees): string[] {
  if (u.type !== 'UniqueUnit') return [];
  return Object.keys(trees.t).filter((c) => civStatus(trees, c)['u' + u.id] === 1);
}
