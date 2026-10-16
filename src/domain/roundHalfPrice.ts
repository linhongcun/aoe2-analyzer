/**
 * 单位折后价取整（issue 129，Steve 在 issue 133 按游戏实测定）：就近取到 0.5；
 * 恰好落在 x.25 / x.75 时取最近的整数（x.25 往小、x.75 往大），恰为 .5 的保留 .5。
 * 依据：hongcun 游戏内实测拜占庭精锐掷矛手 18.75 食物 → 19、26.25 木头 → 26（issue 24 comment 6106912488）。
 * PK 页与开局页（buildSim）共用这一个函数。
 */
const EPS = 1e-9;
export const roundHalfPrice = (x: number): number => {
  const f = Math.floor(x + EPS);
  const frac = x - f;
  if (Math.abs(frac - 0.25) < EPS) return f;
  if (Math.abs(frac - 0.75) < EPS) return f + 1;
  return Math.round(x * 2) / 2;
};
