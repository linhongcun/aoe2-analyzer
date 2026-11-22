/** 目录出手前摇秒数格式化（纯函数，仅控制展示精度，不修改原始数据）。 */
export function formatAttackDelaySeconds(delay: number): string {
  if (delay === 0 || Object.is(delay, -0)) return '0';
  const two = Number(delay.toFixed(2));
  if (two !== 0) return String(two);
  const four = Number(delay.toFixed(4));
  if (four !== 0) return String(four);
  return String(delay);
}
