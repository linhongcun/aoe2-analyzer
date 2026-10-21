import type { PageCase } from './v0280-golden-cases';

/**
 * #281 ④（Duel URL 数值参数解码挪进 domain/duelParams.ts）的界面级对照用例。Kent 写。
 * 在 v0280-golden 的 28 组 PK 之外，再补 URL 解码与规范化写回的边界：缺参数、越界、小数、非数字、未知键、键顺序。
 * 期望值是 main @ 4a3f89f（#321 之前）构建上录下的字面量，存在 fixtures/v0280-duel-url.json。
 */
const A = 'a=38.Franks.3.f.';
const B = 'b=4.Britons.2.f.';
const T = 'a=4.Britons.2.c.&b=448.Mongols.2.c.';
const duel = (id: string, q: string): PageCase => ({ id: `pk-url:${id}`, url: `./#/duel?${q}`, sel: '#duel' });

export const DUEL_URL: PageCase[] = [
  duel('no-mode-with-na-nb', `na=5&nb=7&${A}&${B}`),
  duel('n-only-na', `m=n&na=3&${A}&${B}`),
  duel('n-empty-values', `m=n&na=&nb=&${A}&${B}`),
  duel('n-decimals', `m=n&na=2.5&nb=0.4&${A}&${B}`),
  duel('n-infinity', `m=n&na=Infinity&nb=-Infinity&${A}&${B}`),
  duel('n-key-order', `nb=3&m=n&${B}&na=4&${A}`),
  duel('n-unknown-keys', `foo=bar&m=n&${A}&zzz=1&${B}&na=6`),
  duel('r-non-numeric', `m=r&bud=abc&${A}&${B}`),
  duel('r-exponent', `m=r&bud=1e3&${A}&${B}`),
  duel('r-over-max', `m=r&bud=100001&${A}&${B}`),
  duel('r-plus-sign', `m=r&bud=%2B500&${A}&${B}`),
  duel('t-defaults-dropped', `m=t&vil=10&min=10&${T}`),
  duel('t-negative-and-text', `m=t&vil=-3&min=abc&${T}`),
  duel('t-decimal-and-hex', `m=t&vil=12.9&min=0x10&${T}`),
  duel('t-keeps-bud', `m=t&bud=4000&vil=25&${T}`),
  duel('mode-uppercase', `m=N&na=5&${A}&${B}`),
  duel('one-strips-vil-min', `m=1&vil=20&min=30&${A}&${B}`),
];
