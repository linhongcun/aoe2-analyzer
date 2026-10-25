/** 开局时间线的坐标与卡点排布；只整理已有模拟结果，不计算游戏机制。 */
export function timelineAxis(end: number) {
  const minutes = Math.ceil(end / 60);
  const span = minutes * 60;
  const every = minutes > 30 ? 5 : minutes > 10 ? 2 : 1;
  return {
    minutes,
    span,
    every,
    ticks: Array.from({ length: minutes + 1 }, (_, i) => i).filter((m) => m % every === 0),
    pct: (t: number) => `${span ? (Math.min(span, Math.max(0, t)) / span) * 100 : 0}%`,
    width: (from: number, to: number) => `${span ? (Math.max(0, Math.min(span, to) - Math.max(0, from)) / span) * 100 : 0}%`,
  };
}

interface LayoutBottleneck {
  from: number;
  to: number;
  sec: number;
  type: string;
  step: number;
}

/** 主卡点沿用原区间对象；其它相接（间隙至多1秒）卡点合为浅色条。 */
export function timelineBottleneckLayout<T extends LayoutBottleneck>(list: readonly T[], top: T | null) {
  const ranged = list.filter((b) => b.to > b.from);
  const tagged =
    top && top.to > top.from
      ? (ranged.find((b) => b.from === top.from && b.type === top.type && b.step === top.step) ?? top)
      : [...ranged].sort((a, b) => b.sec - a.sec)[0];
  const merged: { from: number; to: number; types: Set<string> }[] = [];
  for (const b of [...ranged].filter((x) => x !== tagged).sort((a, b) => a.from - b.from)) {
    const last = merged[merged.length - 1];
    if (last && b.from <= last.to + 1) {
      last.to = Math.max(last.to, b.to);
      last.types.add(b.type);
    } else merged.push({ from: b.from, to: b.to, types: new Set([b.type]) });
  }
  return { tagged, merged };
}
