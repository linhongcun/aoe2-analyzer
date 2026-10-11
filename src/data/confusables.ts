/**
 * 易混淆对照表（#44，手写，不做模糊匹配）。
 * 和别名表分开维护：别名表回答「这个叫法指哪个单位」，这张表回答「哪些单位容易被搞混」。
 * 新增条目由 Reid 维护、Steve 签字后再加。官方名出自 aoe2techtree 3bb43b1 版 data/locales/zh/strings.json。
 * v1 只有一条（#44 Jony 更正 6107054907 / SPEC a50f739）；战象 239 / 象兵 1132 暂无来源，不收录。
 */
export interface Confusable {
  /** 双向互链的两个 unit id */
  a: number;
  b: number;
  /** 两侧官方名的字符串 key（注释用途，测试核对） */
  keys: [number, number];
  /** 链接下方原因行；为空时不显示原因行、不留占位 */
  reason: string;
}

export const CONFUSABLES: readonly Confusable[] = [
  // 翼骑兵 · Hussar · unit 441 · key 14661 ⇄ 波兰翼骑兵 · Winged Hussar · unit 1707 · key 14577
  { a: 441, b: 1707, keys: [14661, 14577], reason: '通用单位 Hussar 的官方名就叫「翼骑兵」，和波兰翼骑兵只差两个字' },
];

/** 某单位的易混淆对象（双向） */
export function confusablesOf(id: number): { other: number; reason: string }[] {
  return CONFUSABLES.flatMap((c) => (c.a === id ? [{ other: c.b, reason: c.reason }] : c.b === id ? [{ other: c.a, reason: c.reason }] : []));
}
