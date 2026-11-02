import type { SliceFacts } from '../../domain/ladderQuery';

/** 来源条里的模式、Elo、地图。和统计截止分行，换其中一个不会清掉另外两个。 */
export function LadderSourceFacts({ facts }: { facts: SliceFacts }) {
  return (
    <p className="ladder-source-facts" data-testid="ladder-source-facts">
      <span data-testid="ladder-source-mode" className="num nw">
        {facts.modeLabel}
      </span>
      <span aria-hidden="true"> · </span>
      <span data-testid="ladder-source-elo" className="num nw">
        Elo {facts.eloLabel}
      </span>
      <span aria-hidden="true"> · </span>
      <span data-testid="ladder-source-map">{facts.mapLabel}</span>
    </p>
  );
}
