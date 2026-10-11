import type { Civ, CivType } from './types';

export const AXES = ['骑兵', '弓手', '步兵', '经济', '防御', '攻城', '僧侣', '海军'] as const;
/** 强项门槛：评分 ≥ 8 才算「强」（与建议文案同源） */
export const STRONG_THRESHOLD = 8;
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

export interface StrengthEntry {
  /** 轴索引对应 AXES / Civ.s */
  key: 'cav' | 'arch' | 'inf' | 'eco' | 'def' | 'siege' | 'monk' | 'naval';
  axis: string;
  score: number;
}

const AXIS_KEYS: StrengthEntry['key'][] = ['cav', 'arch', 'inf', 'eco', 'def', 'siege', 'monk', 'naval'];

/** 评分 ≥ STRONG_THRESHOLD 的轴（由高到低）；不足 3 项则少列，不再用 <8 的充数 */
export function strengthEntries(c: Civ): StrengthEntry[] {
  return c.s
    .map((score, i) => ({ key: AXIS_KEYS[i]!, axis: AXES[i]!, score }))
    .filter((x) => x.score >= STRONG_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

/** 前三项优势与后三项劣势（文明页用，相对排序；对局助手强项另用 strengthEntries 门槛） */
export function strengths(c: Civ): [string[], string[]] {
  const a = c.s.map((v, i) => [v, AXES[i]!] as const).sort((x, y) => y[0] - x[0]);
  return [a.slice(0, 3).map((x) => x[1]), a.slice(-3).map((x) => x[1])];
}

/**
 * 各兵种类型的反制单位（中文名，须与 units.json 的 zh 精确匹配或为其升级线常用名）。
 * 战术补充文案不含单位名，过滤后仍可展示。
 */
export const COUNTER_UNITS: Record<CivType, string[]> = {
  cav: ['长矛兵', '长枪兵', '长戟兵', '骆驼兵', '重装骆驼兵', '帝王骆驼兵', '骆驼斥候', '僧侣'],
  arch: [
    '掷矛手',
    '精锐掷矛手',
    '帝王掷矛手',
    '攻城锤',
    '中型冲车',
    '重型冲车',
    '轻型投石车',
    '中型投石车',
    '重型投石车',
    '侦察骑兵',
    '轻型骑兵',
    '翼骑兵',
    '骑士',
    '重装骑士',
    '游侠',
  ],
  inf: ['步弓手', '弩手', '劲弩手', '火枪手', '骑士', '重装骑士', '游侠', '骑射手', '重装骑射手', '弩炮', '重型弩炮'],
  naval: ['火艨艟', '喷火船', '快速喷火船', '箭船', '战船', '大型战舰'],
  monk: ['轻型骑兵', '翼骑兵', '鹰斥候', '鹰勇士', '精锐鹰勇士'],
  siege: ['侦察骑兵', '轻型骑兵', '翼骑兵', '骑士', '重装骑士', '游侠'],
  def: [],
  eco: ['民兵', '侦察骑兵'],
};

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

/** @deprecated 保留给旧引用；新逻辑用 COUNTER_UNITS + filterCounterUnits */
export const COUNTERS: Record<CivType, string> = {
  cav: '长矛兵/戟兵 + 骆驼 + 僧侣转化；用城墙/长矛阵限制机动',
  arch: '散兵/精英散兵 + 冲车/投石；侦察骑兵或骑士快速贴脸；轻骑兵绕后',
  inf: '弓手/手炮远程放风筝；用骑兵或骑射拉扯；城堡期蝎子克制密集步兵',
  naval: '在水图早出火船/战舰抢水；陆图则无需担心，压制其陆军',
  monk: '轻骑兵/鹰战士猎杀僧侣；分散阵型；具有转化抗性的单位',
  siege: '骑兵/轻骑兵直切攻城武器；保持冲车阵型分散',
  def: '避免强攻城墙塔楼，转为经济压制与攻城武器推进；多点骚扰',
  eco: '早期骚扰（侦察/民兵）打断其发育节奏，别让其速城堡',
};

export const EMPTY_COUNTERS_COPY = '当前文明暂无可用反制推荐';

export interface CounterUnit {
  id: number;
  nameZh: string;
  nameEn: string;
}

/** 本方文明能否造出该中文名单位（精确匹配 zh） */
export function civCanBuildZh(civEn: string, nameZh: string, units: { id: number; zh: string; en: string; civs: string[] }[]): boolean {
  return units.some((u) => u.zh === nameZh && u.civs.includes(civEn));
}

/** 按本方科技树过滤反制单位；造不出的藏掉（v1，不灰显） */
export function filterCounterUnits(meEn: string, oppTypes: CivType[], units: { id: number; zh: string; en: string; civs: string[] }[]): CounterUnit[] {
  const seen = new Set<number>();
  const out: CounterUnit[] = [];
  for (const t of oppTypes) {
    for (const zh of COUNTER_UNITS[t] ?? []) {
      const u = units.find((x) => x.zh === zh && x.civs.includes(meEn));
      if (u && !seen.has(u.id)) {
        seen.add(u.id);
        out.push({ id: u.id, nameZh: u.zh, nameEn: u.en });
      }
    }
  }
  return out;
}

export interface MatchupAdvice {
  oppStrong: string[];
  oppWeak: string[];
  /** 带分数的强项（仅 ≥ 门槛） */
  strengths: StrengthEntry[];
  myEdge: string;
  tips: string;
  /** 建议文案数组（便于测试） */
  advice: string[];
}

export function matchup(a: Civ, e: Civ): MatchupAdvice {
  const entries = strengthEntries(e);
  const [, ew] = strengths(e);
  const best = AXES.map((k, i) => [a.s[i]! - e.s[i]!, k] as const).sort((x, y) => y[0] - x[0]);
  const myEdge =
    best
      .slice(0, 3)
      .filter((x) => x[0] > 0)
      .map((x) => `${x[1]}(+${x[0]})`)
      .join('、') || '无明显优势，建议稳健发育';
  const advice: string[] = [];
  advice.push(e.s[3]! >= STRONG_THRESHOLD ? '对手经济强，前期主动骚扰。' : '对手经济一般，可以稳健发育拖后期。');
  if (a.s[0]! >= STRONG_THRESHOLD) advice.push('你骑兵强，可攻击对方后排弓手和攻城武器。');
  if (ew.includes('骑兵')) advice.push('对手缺骑兵，你可以多用远程单位。');
  return {
    oppStrong: entries.map((x) => x.axis),
    oppWeak: ew,
    strengths: entries,
    myEdge,
    tips: advice.join(''),
    advice,
  };
}
