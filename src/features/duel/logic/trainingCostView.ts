/** issue 943 卡头与费用说明的正式文案。数字来自 quoteTraining，不在这里重算价格。 */
import { RES_ZH } from '../../../domain/ratings';
import { TRAINING_RESOURCES, type TrainingQuote } from '../../../domain/duelTrainingCost';
import type { Tech } from '../../../domain/types';

export const DUEL_COST_MODEL =
  '等资源与 1v1 展示的每名训练价，都按已选且本站已支持的费用效果计算，同一笔数；已核实的常驻文明训练费用加成计入其中。一次研究费用不摊进每名训练价，也不从派出预算里扣除。未计入的效果（未核实的加成、团队加成、本站尚未支持的科技费用效果）会在单位卡标明。若存在未计入项，当前价格不是完整效果后的最终价。';

export const EMPTY_TRAINING_TECH = '当前文明与时代下，没有可计入这名单位训练价的费用科技。';

export interface TrainingLine {
  kind: 'applied' | 'available' | 'unsupported';
  id: number;
  text: string;
  state?: 'off' | 'recorded';
}

const fmtNum = (n: number) => {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

export function deltaText(changes: { res: string; delta: number }[]): string {
  return changes
    .filter((change) => change.delta !== 0)
    .map((change) => {
      const sign = change.delta > 0 ? `+${fmtNum(change.delta)}` : `\u2212${fmtNum(Math.abs(change.delta))}`;
      return `${RES_ZH[change.res] ?? change.res} ${sign}`;
    })
    .join('，');
}

function researchBill(tech: Tech): string {
  const resources = TRAINING_RESOURCES.filter((res) => tech.cost[res]).map((res) => `${tech.cost[res]} ${RES_ZH[res]}`);
  const cost = resources.join(' ');
  return cost ? `${cost}，${tech.rt} 秒` : `${tech.rt} 秒`;
}

export function trainingLines(quote: TrainingQuote, sel: ReadonlySet<number>): { lines: TrainingLine[]; notes: string[] } {
  const lines: TrainingLine[] = [];
  const notes: string[] = [];
  const deltaById = new Map(quote.deltas.map((delta) => [delta.id, delta]));
  for (const item of quote.costs) {
    if (item.supported && sel.has(item.tech.id)) {
      const detail = deltaText(deltaById.get(item.tech.id)?.changes ?? []);
      lines.push({
        kind: 'applied',
        id: item.tech.id,
        text: detail ? `已计入：${item.tech.zh}（${detail}）` : `已计入：${item.tech.zh}`,
      });
      notes.push(`一次研究：${item.tech.zh} ${researchBill(item.tech)}。这笔费用不摊进每名训练价，也不从派出预算里扣除。`);
    } else if (item.supported) {
      lines.push({ kind: 'available', id: item.tech.id, text: `可计入未勾选：${item.tech.zh}` });
    } else {
      const recorded = sel.has(item.tech.id);
      lines.push({
        kind: 'unsupported',
        id: item.tech.id,
        state: recorded ? 'recorded' : 'off',
        text: `未计入：${item.tech.zh}，本站尚不支持，当前价格不是完整效果后的最终价`,
      });
      const bill = researchBill(item.tech);
      notes.push(
        recorded
          ? `已选择${item.tech.zh}，仅记录，训练价未套用该效果。其研究费用为 ${bill}；这笔费用不摊进每名训练价，也不从派出预算里扣除。`
          : `${item.tech.zh}适用但本站尚不支持，满科技不会自动勾选。未选择不等于已研究，当前训练价未套用该效果。其研究费用为 ${bill}；即使手选也只作记录，不摊进每名训练价，也不从派出预算里扣除。`,
      );
    }
  }
  return { lines, notes };
}
