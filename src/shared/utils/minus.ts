/** issue 97：只在显示层把「-数字」里的连字符换成 U+2212 减号；数据原文不动 */
export const minus = (s: string) => s.replace(/-(?=\s?\d)/g, '\u2212');
