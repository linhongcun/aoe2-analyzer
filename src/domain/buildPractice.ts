import type { Action, BuildOrder, Task } from './buildOrder';
import type { BuildTimeline } from './buildSim';

/** 已手动跟完的步骤数，与时间线选择、模拟时间完全独立。 */
export function practiceProgress(completed: number, total: number, command: 'next' | 'previous' | 'reset'): number {
  const limit = Number.isSafeInteger(total) && total > 0 ? total : 0;
  const current = Number.isSafeInteger(completed) ? Math.max(0, Math.min(limit, completed)) : 0;
  return command === 'reset' ? 0 : Math.max(0, Math.min(limit, current + (command === 'next' ? 1 : -1)));
}

/** 保留原始步骤及全部动作；绝不从已合并的时间线图段反推。 */
export function practiceSteps(order: BuildOrder, timeline: BuildTimeline) {
  if (order.id !== timeline.buildId || order.steps.length !== timeline.steps.length) throw new Error('开局步骤与模拟结果不一致');
  return order.steps.map((step, index) => {
    const simulation = timeline.steps[index]!;
    if (simulation.index !== index) throw new Error('开局步骤顺序不一致');
    return { step, simulation, index };
  });
}

export type PracticeStep = ReturnType<typeof practiceSteps>[number];
export type PracticeNames = (kind: 'unit' | 'tech' | 'building', id: number) => string;
const TASK_ZH: Record<Task, string> = {
  sheep: '采羊肉',
  boar: '采野猪肉',
  deer: '采鹿肉',
  hunt: '采肉',
  berries: '采浆果',
  farm: '耕田',
  fish: '捕鱼',
  wood: '伐木',
  gold: '采金',
  stone: '采石',
  build: '建造',
};
const AGE_ZH = { 2: '封建时代', 3: '城堡时代', 4: '帝王时代' };

/** 动作文字不省略多动作步骤中的训练、研究或搬人。数值只来自开局数据。 */
export function practiceAction(action: Action, name: PracticeNames): string {
  switch (action.type) {
    case 'gather':
      return action.from ? `从${TASK_ZH[action.from]}调 ${action.count} 名村民去${TASK_ZH[action.task]}` : `安排 ${action.count} 名村民${TASK_ZH[action.task]}`;
    case 'build':
      return `建造 ${action.count ?? 1} ${action.building === 1808 ? '辆' : '座'}${name('building', action.building)}`;
    case 'train':
      return `训练 ${action.count ?? 1} 个${name('unit', action.unit)}`;
    case 'research':
      return `研究${name('tech', action.tech)}`;
    case 'upgrade':
      return `升级为${name('unit', action.unit)}`;
    case 'ageUp':
      return `点击升级${AGE_ZH[action.age]}`;
    case 'lure':
      return action.target === 'boar' ? `引 ${action.count ?? 1} 头野猪` : `推 ${action.count ?? 1} 只鹿`;
  }
}
