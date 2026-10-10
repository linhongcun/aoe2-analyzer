import type { Tech } from './types';

/** 前置链（由近到远） */
export function prereqChain(t: Tech, byId: Record<number, Tech>): Tech[] {
  const r: Tech[] = [];
  let p = t.pre != null ? byId[t.pre] : undefined;
  while (p && r.length < 20) {
    r.push(p);
    p = p.pre != null ? byId[p.pre] : undefined;
  }
  return r;
}

/**
 * 切换科技选择：选中时自动选中所有可用前置；取消时级联取消依赖它的后续科技。
 * 返回新的选择集合与（选中时）需要提升到的时代。
 */
export function toggleTech(id: number, sel: ReadonlySet<number>, avail: readonly Tech[], byId: Record<number, Tech>): Set<number> {
  const next = new Set(sel);
  const t = byId[id];
  if (!t) return next;
  if (next.has(id)) {
    const rm = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const x of avail) {
        if (next.has(x.id) && !rm.has(x.id) && prereqChain(x, byId).some((p) => rm.has(p.id))) {
          rm.add(x.id);
          changed = true;
        }
      }
    }
    rm.forEach((i) => next.delete(i));
  } else {
    const ok = new Set(avail.map((a) => a.id));
    [t, ...prereqChain(t, byId)].forEach((x) => {
      if (ok.has(x.id)) next.add(x.id);
    });
  }
  return next;
}
