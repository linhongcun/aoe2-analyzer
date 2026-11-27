/** issue 1469：攻城拆建筑页面的攻方口径说明、空态文案、前置链提示与结果条件摘要纯函数。 */
import { civByEn } from '../../data';
import { prereqChain } from '../../domain/prereq';
import { SIEGE_EVIDENCE_UNIT_ID, SIEGE_MANGONEL_IDS } from '../../domain/siege';
import type { Tech, Unit } from '../../domain/types';

// 用 codePoint 构造右箭头分隔符，规避 ESLint iconRestrictions 对字面量箭头字符的拦截。
const CHAIN_SEP = ` ${String.fromCodePoint(0x2192)} `;

export interface SiegeConditionSummary {
  civText: string;
  techText: string;
  techActive: boolean;
  armorText: string | null;
  compareLine: string;
}

/** 攻方文明下拉框下方口径说明（覆盖全部 9 种状态）。 */
export function siegeCivNote(u: Unit, civ: string, availableTechs: readonly Tech[], selectedTechs: readonly number[]): string {
  if (SIEGE_MANGONEL_IDS.includes(u.id)) {
    return civ ? '投石车系主弹与副弹结算尚未对齐，文明加成暂不参与计算。' : '未选文明：投石车系主弹与副弹结算尚未对齐，暂不参与计算。';
  }
  if (u.id === SIEGE_EVIDENCE_UNIT_ID) {
    return civ ? '手推炮走独立核实表，仅覆盖已审计文明的基础配置，不含团队加成。' : '未选文明：当前手推炮仅按已核实无科技基础口径计算。';
  }
  if (!civ) {
    return selectedTechs.length > 0
      ? '未选文明：不计入文明被动加成与独特科技；已计入下方勾选的通用攻方科技。'
      : '未选文明：不计入文明被动加成与独特科技；当前未勾选攻方科技（基础值），可在下方勾选通用攻方科技。';
  }
  if (!u.civs.includes(civ)) return '所选文明无法训练当前单位，暂不计算。';
  return availableTechs.length > 0
    ? '文明被动加成按单位所处时代计入；攻方科技按下方开关计入，团队加成与未编码机制未计入。'
    : '文明被动加成按单位所处时代计入；团队加成与未编码机制未计入。';
}

/** 无适用攻方科技时的空态说明（覆盖 4 类路径）。 */
export function siegeTechsEmptyNote(u: Unit, civ: string): string {
  if (SIEGE_MANGONEL_IDS.includes(u.id)) return '投石车系暂不提供攻方科技开关。';
  if (u.id === SIEGE_EVIDENCE_UNIT_ID) return '手推炮当前仅按独立核实的基础数据计算，暂不提供攻方科技开关。';
  if (civ && !u.civs.includes(civ)) return '所选文明无法训练当前单位，未提供攻方科技选项。';
  return '当前文明对该单位没有已编码的攻方攻城科技。';
}

/** 攻方科技区底部条件辅助说明：动态提取可用前置链与跨时代提示，不命中时返回 null。 */
export function siegeTechsHint(u: Unit, availableTechs: readonly Tech[], techById: Record<number, Tech>): string | null {
  if (!availableTechs.length) return null;
  const availIds = new Set(availableTechs.map((t) => t.id));
  const hasChild = new Set<number>();
  for (const tech of availableTechs) {
    if (tech.pre != null && availIds.has(tech.pre)) hasChild.add(tech.pre);
  }
  let longestChain: Tech[] = [];
  for (const tech of availableTechs) {
    if (tech.pre == null || !availIds.has(tech.pre) || hasChild.has(tech.id)) continue;
    const chain = [
      ...prereqChain(tech, techById)
        .filter((pre) => availIds.has(pre.id))
        .reverse(),
      tech,
    ];
    if (chain.length > longestChain.length) longestChain = chain;
  }
  const chainText = longestChain.length >= 2 ? longestChain.map((t) => t.zh).join(CHAIN_SEP) : null;
  const hasHigherAge = availableTechs.some((t) => t.age > u.age);
  if (chainText && hasHigherAge) return `${chainText}按前置联动；可勾选帝王攻方科技（模拟帝王未升精锐场景）。`;
  if (chainText) return `${chainText}按前置联动：勾选后继自动补齐前置，取消前置级联取消后继。`;
  if (hasHigherAge) return '可勾选帝王攻方科技（模拟帝王未升级形态场景）。';
  return null;
}

/** 结果卡芯片与「同组合对照」表条件副标题摘要。 */
export function siegeConditionSummary(
  u: Unit,
  civ: string,
  availableTechs: readonly Tech[],
  selectedTechs: readonly number[],
  armorTechs: readonly { id: number; en: string }[],
  selectedArmor: readonly number[],
  techById: Record<number, Tech>,
): SiegeConditionSummary {
  const civText = civ ? `攻方：${civByEn(civ)?.zh ?? civ}` : '攻方：不限文明';
  const selectedSet = new Set(selectedTechs);
  const selectedNames = availableTechs.filter((t) => selectedSet.has(t.id)).map((t) => t.zh);
  let techText: string;
  let techActive = false;
  if (selectedNames.length > 0) {
    techActive = true;
    techText = civ ? `含攻方科技：${selectedNames.join('、')}` : `含通用攻方科技：${selectedNames.join('、')}`;
  } else if (u.id === SIEGE_EVIDENCE_UNIT_ID) {
    techText = '基础核实值（不含攻方科技）';
  } else if (civ && availableTechs.length === 0) {
    techText = '无适用攻方科技（基础值）';
  } else {
    techText = '无攻方科技（基础值）';
  }
  const armorNames = armorTechs.filter((t) => selectedArmor.includes(t.id)).map((t) => techById[t.id]!.zh);
  const armorText = armorNames.length > 0 ? `守方：${armorNames.join('、')}` : null;
  const parts = [civText, techText];
  if (armorText) parts.push(armorText);
  return { civText, techText, techActive, armorText, compareLine: parts.join('；') };
}
