/** 科技树布局：按建筑分列、按时代分行，计算格子坐标与升级连线 */
import type { Trees } from '../../../domain/types';
import { civStatus } from '../../../domain/simulator';

export const TW = 52,
  TH = 56,
  HD = 74,
  LW = 60;
export const AGE_BANDS: [string, number, number][] = [
  ['黑暗', 0, 1],
  ['封建时代', 1, 2],
  ['城堡时代', 3, 2],
  ['帝王时代', 5, 2],
];

export interface LCell {
  k: 'u' | 't' | 'b';
  id: number;
  x: number;
  y: number;
  avail: boolean;
  diff: '' | 'onlyA' | 'onlyB';
}
export interface LBuilding {
  bid: number;
  x: number;
  w: number;
}
export interface LLine {
  d: string;
  avail: boolean;
}
export interface TreeLayout {
  W: number;
  H: number;
  buildings: LBuilding[];
  cells: LCell[];
  lines: LLine[];
}

export function layoutTree(trees: Trees, civ: string, cmpCiv: string | null, exists: (k: 'u' | 't' | 'b', id: number) => boolean): TreeLayout {
  const sb = cmpCiv ? civStatus(trees, cmpCiv) : null;
  let x = LW;
  const buildings: LBuilding[] = [],
    cells: LCell[] = [],
    lines: LLine[] = [];
  (trees.t[civ] ?? []).forEach(([bid, , nc, cs]) => {
    const gw = nc * TW,
      pos: Record<string, [number, number]> = {};
    buildings.push({ bid, x, w: gw });
    cs.forEach(([r, c, k, id, st]) => {
      if (!exists(k, id)) return;
      const px = x + c * TW,
        py = HD + (r - 1) * TH;
      pos[k + id] = [px + TW / 2, py];
      const diff = sb ? (st && !sb[k + id] ? 'onlyA' : !st && sb[k + id] ? 'onlyB' : '') : '';
      cells.push({ k, id, x: px + 4, y: py + 4, avail: !!st, diff });
    });
    cs.forEach(([, , k, id, st, lk]) => {
      if (lk == null) return;
      const p = pos[k + lk],
        q = pos[k + id];
      if (!p || !q) return;
      const y1 = p[1] + TH - 6,
        y2 = q[1] + 4,
        ym = (y1 + y2) / 2;
      lines.push({ d: `M${p[0]} ${y1}V${ym}H${q[0]}V${y2}`, avail: !!st });
    });
    x += gw + 10;
  });
  return { W: x, H: HD + 7 * TH, buildings, cells, lines };
}

/** b 的树中可用而 a 中不可用的项目 */
export function extraItems(trees: Trees, a: string, b: string): ['u' | 't' | 'b', number][] {
  const sa = civStatus(trees, a),
    r: ['u' | 't' | 'b', number][] = [];
  (trees.t[b] ?? []).forEach((bl) =>
    bl[3].forEach((c) => {
      if (c[4] && !sa[c[2] + c[3]]) r.push([c[2], c[3]]);
    }),
  );
  return r;
}
