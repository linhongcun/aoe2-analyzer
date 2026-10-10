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

/** 前三项优势与后三项劣势 */
export function strengths(c: Civ): [string[], string[]] {
  const a = c.s.map((v, i) => [v, AXES[i]!] as const).sort((x, y) => y[0] - x[0]);
  return [a.slice(0, 3).map((x) => x[1]), a.slice(-3).map((x) => x[1])];
}

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

export interface MatchupAdvice {
  oppStrong: string[];
  oppWeak: string[];
  myEdge: string;
  tips: string;
}
export function matchup(a: Civ, e: Civ): MatchupAdvice {
  const [es, ew] = strengths(e);
  const best = AXES.map((k, i) => [a.s[i]! - e.s[i]!, k] as const).sort((x, y) => y[0] - x[0]);
  const myEdge =
    best
      .slice(0, 3)
      .filter((x) => x[0] > 0)
      .map((x) => `${x[1]}(+${x[0]})`)
      .join('、') || '无明显优势，建议稳健发育';
  const tips =
    (e.s[3]! >= 8 ? '对手经济强，前期主动骚扰。' : '对手经济一般，可以稳健发育拖后期。') +
    (a.s[0]! >= 8 ? '你骑兵强，可攻击对方后排弓手和攻城武器。' : '') +
    (ew.includes('骑兵') ? '对手缺骑兵，你可以多用远程单位。' : '');
  return { oppStrong: es, oppWeak: ew, myEdge, tips };
}
