/**
 * 临时置灰（#3 P0）：buildSim 升城堡没等两座封建建筑建完，受影响开局的城堡时间偏早。
 * 修复上线前，这里列出的开局从「点该时代」那一步起不显示任何时间，统一标「计算修正中」。
 * 模拟器修好后删掉对应条目（或整个文件）即可。
 */
export type PendingAge = 'feudal' | 'castle';
export const PENDING_FIX: Readonly<Record<string, PendingAge>> = {
  'fast-castle-boom': 'castle',
  'drush-fc': 'castle',
};
export const PENDING_LABEL = '计算修正中';
const AGE_NUM: Record<PendingAge, number> = { feudal: 2, castle: 3 };

/** 从第几步（0 起）开始置灰；不受影响返回 null */
export function pendingFrom(bo: { id: string; steps: { phase?: string }[] }): number | null {
  const age = PENDING_FIX[bo.id];
  if (!age) return null;
  const i = bo.steps.findIndex((s) => s.phase === `${age}-click`);
  return i < 0 ? 0 : i;
}

/** 该时代（2 封建 / 3 城堡 / 4 帝王）的到达时间是否需要置灰 */
export function agePending(id: string, age: number): boolean {
  const a = PENDING_FIX[id];
  return !!a && age >= AGE_NUM[a];
}

/** 列表页目标时间：去掉城堡及之后的时间段，封建保留（如「约 10:30 封建、14:00 城堡」→「约 10:30 封建」） */
export function keptTime(time: string | undefined): string {
  return (time ?? '')
    .split('、')
    .filter((s) => !/城堡|帝王/.test(s))
    .join('、');
}
