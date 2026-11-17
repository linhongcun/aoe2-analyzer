import type { Core } from '../data';
import type { TreeCell, Trees } from './types';
import { treeAge } from './treeAge';
import { treeNodeIdentity } from './treeIdentity';

export const UNAVAILABLE_SCOPE = '仅汇总当前文明科技树中明确标为不可用的单位、升级与科技；不含未收录项目及建筑，不代表全游戏缺口或配兵建议。';
export const UNAVAILABLE_AGE_NOTE = '树中时代不是解锁承诺；清单不随差异对照改变。';
export const UNAVAILABLE_COUNT_NOTE = '不含无不可用项的建筑组；同一对象跨建筑分别计入。';
export const UNAVAILABLE_INCOMPLETE = '汇总不完整：以下仅为已匹配目录的条目，不代表全部结果。';

export interface UnavailableItem {
  kind: 'u' | 't';
  id: number;
  name: string | null;
  pic: string | number | null;
  type: string;
  identity: string | null;
  age: string;
  row: number;
}

export interface UnavailableGroup {
  id: number;
  name: string;
  named: boolean;
  items: UnavailableItem[];
}

export interface UnavailableSummary {
  groups: UnavailableGroup[];
  count: number;
  unresolved: number;
  complete: boolean;
}

type Catalog = Pick<Core, 'unitById' | 'techById' | 'buildingById'>;

function itemType(kind: 'u' | 't', type: string | null | undefined): string {
  if (kind === 'u') {
    if (type === 'UnitUpgrade') return '单位升级';
    if (!type || ['Unit', 'UniqueUnit', 'RegionalUnit'].includes(type)) return '单位';
  } else if (!type || ['Research', 'UniqueTech', 'RegionalTech'].includes(type)) return '科技';
  return `${kind === 'u' ? '单位' : '科技'}（类型未核实：${type}）`;
}

export function unavailableSummary(trees: Trees, core: Catalog, civ: string): UnavailableSummary | null {
  const blocks = trees.t[civ];
  if (!blocks) return null;
  const groups = new Map<number, UnavailableGroup>();
  const groupedCells = new Map<number, TreeCell[]>();
  for (const [id, , , cells] of blocks) {
    let group = groups.get(id);
    if (!group) {
      const name = core.buildingById[id]?.zh || trees.b[id]?.[0];
      group = { id, name: name || `建筑 ID ${id}`, named: !!name, items: [] };
      groups.set(id, group);
      groupedCells.set(id, []);
    }
    groupedCells.get(id)!.push(...cells);
  }
  for (const [id, group] of groups) {
    const cells = groupedCells.get(id)!;
    const seen = new Set<string>();
    const rowOrder = (row: number) => (treeAge(row) === '时代未核实' ? Infinity : row);
    const sorted = cells
      .map((cell, index) => ({ cell, index }))
      .sort((a, b) => rowOrder(a.cell[0]) - rowOrder(b.cell[0]) || a.cell[1] - b.cell[1] || a.index - b.index);
    for (const {
      cell: [row, , kind, nodeId, status],
    } of sorted) {
      if (status !== 0 || (kind !== 'u' && kind !== 't')) continue;
      const key = kind + nodeId;
      if (seen.has(key)) continue;
      seen.add(key);
      const node = kind === 'u' ? core.unitById[nodeId] : core.techById[nodeId];
      group.items.push({
        kind,
        id: nodeId,
        name: node?.zh || null,
        pic: node?.pic ?? null,
        type: itemType(kind, node?.type),
        identity: treeNodeIdentity(kind, nodeId, node?.type)?.label ?? null,
        age: treeAge(row),
        row,
      });
    }
  }
  const nonempty = [...groups.values()].filter((group) => group.items.length);
  const items = nonempty.flatMap((group) => group.items);
  const unresolved = items.filter((item) => !item.name).length;
  return { groups: nonempty, count: items.length - unresolved, unresolved, complete: !unresolved && nonempty.every((group) => group.named) };
}

export function unavailableText(summary: UnavailableSummary, civName: string, version: string, treeUrl: string): string {
  const lines = [
    `${civName} · 不可用项汇总${summary.complete ? '' : '（汇总不完整）'}`,
    `数据版本：${version} · 来自当前文明科技树`,
    `${summary.groups.length} 个建筑组 · 已列出 ${summary.count} 条（按建筑内条目计）${summary.unresolved ? ` · 另有 ${summary.unresolved} 个条目待核对` : ''}`,
    UNAVAILABLE_SCOPE,
    UNAVAILABLE_AGE_NOTE,
    UNAVAILABLE_COUNT_NOTE,
  ];
  if (!summary.complete) lines.push(UNAVAILABLE_INCOMPLETE);
  if (!summary.groups.length) lines.push('当前科技树中未发现明确标为不可用的单位、升级与科技。');
  for (const group of summary.groups) {
    lines.push('', `${group.name}（已列出 ${group.items.filter((item) => item.name).length} 条）`);
    for (const item of group.items) {
      const identity = item.identity ? ` · ${item.identity}` : '';
      lines.push(
        item.name
          ? `- ${item.name} · ${item.type}${identity} · 树中时代：${item.age}`
          : `- ${group.name} · 待核对条目 ${item.kind}${item.id} · ${item.type} · 树中时代：${item.age}；目录资料不可用，暂不提供详情链接。`,
      );
    }
  }
  lines.push('', `当前文明科技树：${treeUrl}`);
  return lines.join('\n');
}
