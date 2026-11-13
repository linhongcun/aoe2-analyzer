export const TRAIN_TOTAL_TITLE = '训练总价';
export const TRAIN_TOTAL_DESCRIPTION = '计算同一文明、同一时代下，多种单位形态的训练总价。不含研究费用。';
export const TRAIN_TOTAL_EMPTY = '添加兵种并填写训练数量后查看合计。';
export const TRAIN_TOTAL_NONE = '当前没有已计入的训练行。';
export const TRAIN_TOTAL_FULL_SCOPE = '下列总价只含训练费用，不含研究与升级费用。';
export const TRAIN_TOTAL_PARTIAL_SCOPE = '下列只合计已计入的行，不是整份方案的训练总价。仍不含研究与升级费用。';
export const TRAIN_TOTAL_ESTIMATE_SCOPE = '已选科技中有费用效果未能完整计入。下面是估算，不能当作完整准确的训练总价。';
export const TRAIN_TOTAL_FOOTER = [
  '计算口径。各已计入行是「当前单价 × 训练数量」，再相加。单价按当前文明、时代和已选科技计算，口径与站内其它训练费用工具相同，并计入已经支持的文明费用减免。按所选单位形态已经解锁来计算。',
  '不含研究费用。不含科技研究、单位升级、建筑建造、住房和其它转型投入。化学、翼骑兵升级等前置只影响能否选择该形态，其研究费用不加入合计。',
  '已选科技不等于全部计入。费用效果只套用确实作用在该单位、并且能够完整计入的项；未能完整计入的效果会在该行或警告中如实写出，不改价，结果须标为估算。',
] as const;

export interface TrainTotalSummary {
  title: string;
  marks: string[];
  count: string;
  scopes: string[];
  empty: string | null;
  none: string | null;
  showCards: boolean;
}

export function trainTotalSummary(input: { blocked: boolean; rowCount: number; validCount: number; incomplete: boolean }): TrainTotalSummary {
  if (input.blocked || input.rowCount === 0) {
    return {
      title: TRAIN_TOTAL_TITLE,
      marks: [],
      count: '',
      scopes: input.blocked ? [] : ['添加兵种并填写训练数量后，将在这里显示合计。合计只含训练费用，不含研究与升级费用。'],
      empty: input.blocked ? null : TRAIN_TOTAL_EMPTY,
      none: null,
      showCards: false,
    };
  }
  if (input.validCount === 0) {
    return { title: TRAIN_TOTAL_TITLE, marks: [], count: '', scopes: [], empty: null, none: TRAIN_TOTAL_NONE, showCards: false };
  }
  const partial = input.validCount < input.rowCount;
  const marks = [...(partial ? ['部分训练费用'] : []), ...(input.incomplete ? ['估算，未完整计入'] : [])];
  const scopes = [
    ...(partial ? [TRAIN_TOTAL_PARTIAL_SCOPE] : input.incomplete ? [] : [TRAIN_TOTAL_FULL_SCOPE]),
    ...(input.incomplete ? [TRAIN_TOTAL_ESTIMATE_SCOPE] : []),
  ];
  return {
    title: partial ? '已计入行小计' : TRAIN_TOTAL_TITLE,
    marks,
    count: partial ? `已计入 ${input.validCount} / ${input.rowCount} 行` : `${input.validCount} 行计入`,
    scopes,
    empty: null,
    none: null,
    showCards: true,
  };
}
