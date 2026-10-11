/** #22 对建筑射程小字：主数字下方一行 muted。compact=true（PK）在窄屏缩写为「建筑 N」，悬停/长按显示「对建筑射程 N」。 */
export function rangeB(u: { rng: number; rngB?: number }): number | null {
  return u.rngB != null && u.rngB !== u.rng ? u.rngB : null;
}
export function RangeB({ u, compact = false }: { u: { rng: number; rngB?: number }; compact?: boolean }) {
  const n = rangeB(u);
  if (n === null) return null;
  return (
    <small className="rngb note" data-t="range-building" title={`对建筑射程 ${n}`} aria-label={`对建筑射程 ${n}`}>
      <span className="rngb-full">对建筑 {n}</span>
      {compact && <span className="rngb-short">建筑 {n}</span>}
    </small>
  );
}
