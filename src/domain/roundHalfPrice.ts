/**
 * 单位折后价取整（#129 规则 B）：就近取到 0.5，x.25 / x.75 往大取。PK 页与开局页（buildSim）共用这一个函数。
 * 写法必须保持 Math.round(x * 2) / 2，开局页的输出依赖它逐字不变。
 */
export const roundHalfPrice = (x: number) => Math.round(x * 2) / 2;
