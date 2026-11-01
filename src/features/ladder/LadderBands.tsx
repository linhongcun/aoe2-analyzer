import { Link } from 'react-router-dom';
import { formatGames, formatPercent, medianOf, metaQuadrant, winBand, type WinBand } from '../../domain/ladder';
import { CivIcon } from '../../shared/ui/art';

export interface BandCiv {
  en: string;
  zh: string;
  linked: boolean;
  winRate: number;
  playRate: number;
  games: number;
}

const BANDS: WinBand[] = ['S', 'A', 'B', 'C', 'D'];
const QUADS = [
  { id: '强且少见', hint: '胜率不低于 50%，出场率低于中位' },
  { id: '强且常见', hint: '胜率不低于 50%，出场率不低于中位' },
  { id: '弱且少见', hint: '胜率低于 50%，出场率低于中位' },
  { id: '弱且常见', hint: '胜率低于 50%，出场率不低于中位' },
] as const;

export function LadderTiers({ civs }: { civs: readonly BandCiv[] }) {
  return (
    <div data-testid="ladder-tiers">
      {BANDS.map((band) => {
        const mine = civs.filter((civ) => winBand(civ.winRate) === band);
        return (
          <div key={band} className="ladder-tier-band" data-testid={`ladder-tier-band-${band}`} data-band={band} data-count={mine.length}>
            <span className="ladder-tier-letter">{band}</span>
            <span className="num">{mine.length}</span>
            {mine.length === 0 ? (
              <span>这一档没有文明</span>
            ) : (
              <span className="ladder-tier-pills">
                {mine.map((civ) => (
                  <Link key={civ.en} to={`/civ/${civ.en}`} className="ladder-tier-pill">
                    {civ.linked && <CivIcon c={{ en: civ.en }} />}
                    <span>{civ.zh}</span>
                    <span className="num nw">{formatPercent(civ.winRate)}</span>
                  </Link>
                ))}
              </span>
            )}
          </div>
        );
      })}
      <p className="ladder-slice">分层按胜率带，空档仍留着。不是新手友好度。</p>
    </div>
  );
}

export function LadderMeta({ civs }: { civs: readonly BandCiv[] }) {
  const rates = civs.map((civ) => civ.playRate);
  const median = medianOf(rates);
  const xMax = Math.max(...rates, 1);
  const wins = civs.map((civ) => civ.winRate);
  const yMin = Math.min(...wins, 45);
  const yMax = Math.max(...wins, 55);
  const ySpan = yMax - yMin || 1;
  const games = civs.map((civ) => civ.games);
  const gMin = Math.min(...games);
  const gMax = Math.max(...games);
  return (
    <div data-testid="ladder-meta-map">
      <div className="ladder-quads">
        {QUADS.map((quad) => (
          <p key={quad.id}>
            <strong>{quad.id}</strong>
            <span>{quad.hint}</span>
          </p>
        ))}
      </div>
      <div className="ladder-plot" aria-hidden="false">
        <span className="ladder-plot-axis">出场率</span>
        <span className="ladder-plot-axis">胜率</span>
        <span
          className="ladder-meta-line ladder-meta-win"
          data-testid="ladder-meta-win-line"
          data-value="50"
          style={{ bottom: `${((50 - yMin) / ySpan) * 100}%` }}
        />
        {median != null && (
          <span
            className="ladder-meta-line ladder-meta-pick"
            data-testid="ladder-meta-pick-line"
            data-value={median}
            style={{ left: `${(median / xMax) * 100}%` }}
          />
        )}
        {median != null &&
          civs.map((civ) => {
            const size = bubbleSize(civ.games, gMin, gMax);
            return (
              <button
                key={civ.en}
                type="button"
                className="ladder-meta-bubble"
                data-testid={`ladder-meta-bubble-${civ.en}`}
                data-quadrant={metaQuadrant(civ.winRate, civ.playRate, median)}
                aria-label={`${civ.en} ${formatPercent(civ.winRate)} ${formatPercent(civ.playRate)} ${formatGames(civ.games)}`}
                style={{
                  left: `${(civ.playRate / xMax) * 100}%`,
                  bottom: `${((civ.winRate - yMin) / ySpan) * 100}%`,
                  width: size,
                  height: size,
                }}
              />
            );
          })}
      </div>
      <p className="ladder-slice">气泡大小是出场人次。虚线是 50% 胜率，和当前出场率中位数。</p>
    </div>
  );
}

function bubbleSize(games: number, min: number, max: number): number {
  const span = Math.sqrt(max) - Math.sqrt(min) || 1;
  const t = (Math.sqrt(games) - Math.sqrt(min)) / span;
  return 10 + Math.min(1, Math.max(0, t)) * 26;
}
