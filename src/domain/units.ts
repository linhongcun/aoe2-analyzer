import type { Unit } from './types';
/** 升级路线：向前追溯 from_，向后寻找以当前单位为 from_ 的单位 */
export function upgradeLine(u: Unit, units: Unit[], byId: Record<number, Unit>): Unit[] {
  const a = [u];
  let x = u;
  while (x.from_ != null && byId[x.from_] && a.length < 10) {
    x = byId[x.from_]!;
    a.unshift(x);
  }
  let y = u;
  for (let g = 0; g < 10; g++) {
    const n = units.find((v) => v.from_ === y.id);
    if (!n) break;
    a.push(n);
    y = n;
  }
  return a;
}
