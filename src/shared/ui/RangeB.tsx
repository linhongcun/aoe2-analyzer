/** #22 对建筑射程小字：主数字下方一行 muted。compact=true（PK）在窄屏缩写为「建筑 N」，悬停/长按显示「对建筑射程 N」。 */
type RangeLike = { rng: number; rngB?: number; rngBd?: number };
/** 对建筑射程：模拟后的 StatSet 用 rngB；原始 Unit 用 rng + rngBd */
export function rangeB(u: RangeLike): number | null {
  const b = u.rngB ?? (u.rngBd ? u.rng + u.rngBd : undefined);
  return b != null && b !== u.rng ? b : null;
}
export function RangeB({ u, compact = false }: { u: RangeLike; compact?: boolean }) {
  const n = rangeB(u);
  if (n === null) return null;
  return (
    <small className="rngb note" data-t="range-building" title={`对建筑射程 ${n}`} aria-label={`对建筑射程 ${n}`}>
      <span className="rngb-full">对建筑 {n}</span>
      {compact && <span className="rngb-short">建筑 {n}</span>}
    </small>
  );
}
