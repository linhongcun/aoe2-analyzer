/**
 * 单位详情的视图与造价口径。
 * 只决定看哪一块、地址怎么留、折后价能不能出示；不重算折扣或战斗。
 */
import type { CostDiscount } from './costDiscount';
import { parseUnitPath, type SimRoute } from './simRoute';
import type { Cost } from './types';

const TYPE_ZH: Record<string, string> = {
  UniqueUnit: '独特单位',
  RegionalUnit: '区域单位',
  Unit: '通用单位',
  UnitUpgrade: '升级单位',
};

/** 目录 type 的中文。缺 type 或认不出的值不猜测。 */
export function unitTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return TYPE_ZH[type] ?? null;
}

function paramsOf(search: string): URLSearchParams {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

/** 工作区是否展开。tab=ov / tab=rel 优先于已编码的时代和科技。 */
export function unitWorkspaceOpen(route: Pick<SimRoute, 'age' | 'ids' | 'team'>, search: string): boolean {
  const tab = paramsOf(search).get('tab');
  if (tab === 'ov' || tab === 'rel') return false;
  if (tab === 'sim') return true;
  return route.age !== undefined || route.ids.length > 0 || route.team.length > 0;
}

export function withUnitTab(search: string, tab: string): string {
  const params = paramsOf(search);
  params.set('tab', tab);
  const q = params.toString();
  return q ? `?${q}` : '';
}

/**
 * 更换或清空详情页文明。
 * 路径里已有文明段时只替换这一段，并去掉重复的 ?civ=。
 * 原来只有查询文明时继续写 ?civ=，不补时代段。
 * 清空文明时去掉依赖文明段的时代与科技，tab、me、opp 仍留在查询里。
 */
export function replaceUnitCiv(pathname: string, search: string, civ: string): { pathname: string; search: string } {
  const route = parseUnitPath(pathname);
  if (!route) return { pathname, search };
  const params = paramsOf(search);
  if (!civ) {
    params.delete('civ');
    const q = params.toString();
    return { pathname: `/unit/${route.id}`, search: q ? `?${q}` : '' };
  }
  if (route.civ) {
    params.delete('civ');
    const rest = pathname.replace(/^\/?unit\/\d+\/[^/]*/, '');
    const q = params.toString();
    return { pathname: `/unit/${route.id}/${civ}${rest}`, search: q ? `?${q}` : '' };
  }
  params.set('civ', civ);
  const q = params.toString();
  return { pathname: `/unit/${route.id}`, search: q ? `?${q}` : '' };
}

export type DiscountView = { kind: 'omit' } | { kind: 'unapplied' } | { kind: 'price'; cost: Cost; applied: CostDiscount['applied'] };

/**
 * 折后训练价只在已选且能训练时考虑。
 * 有对不上的组时不出确定数字。没有任何已计入项时不单列一张折后价。
 */
export function discountView(civ: string | undefined, canTrain: boolean, quote: Pick<CostDiscount, 'cost' | 'applied' | 'unsupported'> | null): DiscountView {
  if (!civ || !canTrain || !quote) return { kind: 'omit' };
  if (quote.unsupported.length > 0) return { kind: 'unapplied' };
  if (quote.applied.length === 0) return { kind: 'omit' };
  return { kind: 'price', cost: quote.cost, applied: quote.applied };
}

export interface UpgradeNote {
  kind: 'fork' | 'missing';
  id: number;
  zh: string;
}

type LineUnit = { id: number; from_: number | null; type: string; zh: string };

/**
 * 升级线没走上的分支。
 * 无可用性时只脚注独特升级。有可用性时，该文明没有的下一形态记为缺失，不把当前单位说成不存在。
 */
export function upgradeNotes(line: readonly LineUnit[], units: readonly LineUnit[], avail?: (id: number) => boolean): UpgradeNote[] {
  const inLine = new Set(line.map((u) => u.id));
  const notes: UpgradeNote[] = [];
  const seen = new Set<number>();
  for (const step of line) {
    for (const child of units) {
      if (child.from_ !== step.id || inLine.has(child.id) || seen.has(child.id)) continue;
      if (avail) {
        if (!avail(child.id)) {
          seen.add(child.id);
          notes.push({ kind: 'missing', id: child.id, zh: child.zh });
        }
      } else if (child.type === 'UniqueUnit') {
        seen.add(child.id);
        notes.push({ kind: 'fork', id: child.id, zh: child.zh });
      }
    }
  }
  return notes;
}
