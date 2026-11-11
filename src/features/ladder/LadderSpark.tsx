function sparkline(values: number[]): { points: string; tone: 'good' | 'bad' | 'muted' } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 36 : 2 + (index * 68) / (values.length - 1);
      const y = 22 - ((value - min) / span) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const tone = last > first ? 'good' : last < first ? 'bad' : 'muted';
  return { points, tone };
}

export function LadderSpark({ values }: { values: number[] }) {
  const line = sparkline(values);
  return (
    <svg className={`ladder-spark ladder-spark-${line.tone}`} width="72" height="24" viewBox="0 0 72 24" aria-hidden="true">
      <polyline points={line.points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
