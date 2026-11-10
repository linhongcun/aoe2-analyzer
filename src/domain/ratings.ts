import type { Civ, CivType } from './types';

export const AXES = ['骑兵', '弓手', '步兵', '经济', '防御', '攻城', '僧侣', '海军'] as const;
export const TYPE_ZH: Record<CivType, string> = {
  cav: '骑兵',
  arch: '弓手',
  inf: '步兵',
  naval: '海军',
  monk: '僧侣',
  siege: '攻城',
  def: '防御',
  eco: '经济',
};
export const AGE_ZH: Record<number, string> = { 1: '黑暗时代', 2: '封建时代', 3: '城堡时代', 4: '帝王时代' };
export const RES_ZH: Record<string, string> = { Food: '食物', Wood: '木材', Gold: '黄金', Stone: '石料' };

/** 前三项优势与后三项弱项，仅为评分的相对排序，不代表兵种可用性。 */
export function strengths(c: Civ): [string[], string[]] {
  const a = c.s.map((v, i) => [v, AXES[i]!] as const).sort((x, y) => y[0] - x[0]);
  return [a.slice(0, 3).map((x) => x[1]), a.slice(-3).map((x) => x[1])];
}

/**
 * 各兵种类型的反制单位 id（units.json）。id 化后不再依赖中文显示名；
 * 同名 Sicilians 变体（1786-1788）不列入，规范项为 93/358/359。
 */
export const COUNTER_UNITS: Readonly<Record<CivType, readonly number[]>> = {
  cav: [93, 358, 359, 329, 330, 207, 1755, 125],
  arch: [7, 6, 1155, 1258, 422, 548, 280, 550, 588, 448, 546, 441, 38, 283, 569],
  inf: [4, 24, 492, 5, 38, 283, 569, 39, 474, 279, 542],
  naval: [1103, 529, 532, 539, 21, 442],
  monk: [546, 441, 751, 753, 752],
  siege: [448, 546, 441, 38, 283, 569],
  def: [],
  eco: [74, 448],
};

/** 反制补充文案用到的单位组；与 COUNTER_UNITS 分离，避免把「文案补充」误当成完整反制表。 */
export const COUNTER_EXTRA_GROUPS = {
  cavalry: [448, 38],
  lightCavalry: [546, 441, 1707],
  horseArcher: [39, 474],
  spearman: [93],
  monk: [125],
  ram: [1258, 422, 548],
  onager: [280, 550, 588],
  rangedInfantry: [4, 24, 492, 5],
  scorpion: [279],
} as const satisfies Record<string, readonly number[]>;

export const COUNTER_EXTRA: Record<CivType, string> = {
  cav: '用城墙/长矛阵限制机动；僧侣转化也有效',
  arch: '冲车/投石压阵地；骑兵快速贴脸或轻骑绕后',
  inf: '远程放风筝；骑兵或骑射拉扯；城堡期蝎子克制密集步兵',
  naval: '水图早抢水权；陆图则压制其陆军',
  monk: '分散阵型；具有转化抗性的单位优先',
  siege: '骑兵直切攻城武器；保持冲车阵型分散',
  def: '避免强攻城墙塔楼，转为经济压制与攻城武器推进；多点骚扰',
  eco: '早期骚扰打断其发育节奏，别让其速城堡',
};

export const EMPTY_COUNTERS_COPY = '当前文明暂无可用反制推荐';

export interface CounterUnit {
  id: number;
  nameZh: string;
  nameEn: string;
}

/** 按本方科技树过滤反制单位；造不出的藏掉（v1，不灰显） */
export function filterCounterUnits(meEn: string, oppTypes: CivType[], units: { id: number; zh: string; en: string; civs: string[] }[]): CounterUnit[] {
  const seen = new Set<number>();
  const out: CounterUnit[] = [];
  for (const t of oppTypes) {
    for (const id of COUNTER_UNITS[t] ?? []) {
      const u = units.find((x) => x.id === id && x.civs.includes(meEn));
      if (u && !seen.has(u.id)) {
        seen.add(u.id);
        out.push({ id: u.id, nameZh: u.zh, nameEn: u.en });
      }
    }
  }
  return out;
}
