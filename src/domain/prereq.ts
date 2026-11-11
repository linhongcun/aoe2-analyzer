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

export interface ToggleSelectedOptions {
  /** 当前工具可选的科技 id。 */
  available: ReadonlySet<number>;
  /** 免费科技：不可取消，也不参与切换。 */
  free?: ReadonlySet<number>;
  /** 不在 available 的 id 是否仍允许进入选择（production/construction 由 effective* 再过滤）。 */
  allowUnavailable?: boolean;
  /** 取消时把「前置不在选择中」的后继全部移除；默认只处理 available 中的前置。 */
  removeMissing?: 'any' | 'available';
  /** 取消时按完整前置链级联（模拟器行为）。 */
  cascadeChain?: boolean;
  /** 返回按 id 升序的集合（驻军建筑页行为）。 */
  sort?: boolean;
}

/**
 * 科技选择切换的唯一实现：选中补前置、取消移除依赖它的后继。
 * 各工具通过 options 保留免费科技、可选范围、级联方式和排序差异。
 */
export function toggleSelected(id: number, selected: ReadonlySet<number>, byId: Record<number, Tech>, options: ToggleSelectedOptions): Set<number> {
  const next = new Set(selected);
  if (!byId[id] || options.free?.has(id)) return next;
  if (!options.allowUnavailable && !options.available.has(id)) return next;
  if (next.has(id)) {
    if (options.cascadeChain) {
      const rm = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const xid of options.available) {
          if (next.has(xid) && !rm.has(xid) && prereqChain(byId[xid]!, byId).some((p) => rm.has(p.id))) {
            rm.add(xid);
            changed = true;
          }
        }
      }
      rm.forEach((xid) => next.delete(xid));
    } else {
      next.delete(id);
      let changed = true;
      while (changed) {
        changed = false;
        for (const xid of next) {
          const pre = byId[xid]?.pre;
          if (pre == null) continue;
          const missing = options.removeMissing === 'any' ? !next.has(pre) : options.available.has(pre) && !next.has(pre);
          if (missing) {
            next.delete(xid);
            changed = true;
          }
        }
      }
    }
  } else {
    const add = (xid: number, root: boolean) => {
      if ((!root && !options.available.has(xid)) || next.has(xid)) return;
      next.add(xid);
      const pre = byId[xid]?.pre;
      if (pre != null) add(pre, false);
    };
    add(id, true);
  }
  return options.sort ? new Set([...next].sort((a, b) => a - b)) : next;
}

export function toggleTech(id: number, sel: ReadonlySet<number>, avail: readonly Tech[], byId: Record<number, Tech>): Set<number> {
  return toggleSelected(id, sel, byId, { available: new Set(avail.map((t) => t.id)), allowUnavailable: true, cascadeChain: true });
}
