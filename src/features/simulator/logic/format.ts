import type { NumStat } from '../../../domain/types';
/** [属性键, 中文名, 图标键（null=按射程选 atk/patk，''=无图标）] */
export const SIM_ROWS: [NumStat, string, string | null][] = [
  ['hp', '生命值', 'hp'],
  ['atk', '攻击力', null],
  ['ma', '近战护甲', 'marm'],
  ['pa', '穿刺护甲', 'parm'],
  ['rng', '射程', 'range'],
  ['spd', '移动速度', 'speed'],
  ['los', '视野', ''],
  ['rof', '攻击间隔', 'rof'],
  ['acc', '准确度', ''],
];
export const fmtStat = (k: NumStat, v: number): string =>
  k === 'spd' ? v.toFixed(2) : k === 'rof' ? v.toFixed(2) + 's' : k === 'acc' ? Math.round(v) + '%' : String(Math.round(v * 100) / 100);
