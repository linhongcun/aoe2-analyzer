import { SAMPLE_UNLISTED, formatGames, freshnessText, relativeFreshness, sampleGames, type RelativeFreshness } from '../../domain/ladder';

/** 来源条里的相对新鲜度和样本量。不进黄条，不改统计截止那一句。 */
export function LadderFreshness({
  fetchedAt,
  games,
  scope,
  unit,
  now,
}: {
  fetchedAt: string;
  games: number | null | undefined;
  scope: string;
  unit: string;
  now?: Date;
}) {
  const fresh = relativeFreshness(fetchedAt, now ?? new Date());
  const listed = sampleGames(games);
  return (
    <p className="ladder-freshness" data-testid="ladder-freshness">
      <FreshnessText value={fresh} />
      <span aria-hidden="true"> · </span>
      {listed == null ? (
        <span data-testid="ladder-sample">{SAMPLE_UNLISTED}</span>
      ) : (
        <span className="nw" data-testid="ladder-sample">
          {scope} <span className="num">{formatGames(listed)}</span> {unit}
        </span>
      )}
    </p>
  );
}

function FreshnessText({ value }: { value: RelativeFreshness }) {
  if (value.kind === 'days' || value.kind === 'hours') {
    return (
      <span className="nw" data-testid="ladder-relative">
        更新于 <span className="num">{value.count}</span> {value.kind === 'hours' ? '小时前' : '天前'}
      </span>
    );
  }
  if (value.kind === 'under-hour') {
    return (
      <span className="nw" data-testid="ladder-relative">
        更新于不到 <span className="num">1</span> 小时
      </span>
    );
  }
  return (
    <span className="nw" data-testid="ladder-relative">
      {freshnessText(value)}
    </span>
  );
}
