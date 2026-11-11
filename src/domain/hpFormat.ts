/**
 * 生命值只在给玩家看的时候四舍五入到两位小数。
 * 舍入后恰好是整数时不补末尾 .00；非整数仍保留两位。
 * 返回的是展示字符串。战斗、费用和后续效果不要把它解析回数字再计算。
 * 这是站内显示约定，不是已核实的游戏客户端取整规则。
 */
export function formatHp(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const negative = value < 0;
  const scaled = Math.round(Math.abs(value) * 100);
  if (scaled === 0) return '0';
  const whole = Math.floor(scaled / 100);
  const frac = scaled % 100;
  const body = frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}
