import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatGames, formatPercent, medianOf, metaQuadrant, winBand, type WinBand } from '../../domain/ladder';
import { CivIcon } from '../../shared/ui/art';
import './ladderMeta.css';

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

export function LadderMeta({ civs, sampleUnit }: { civs: readonly BandCiv[]; sampleUnit: '人次' | '局' }) {
  const [selectedEn, setSelectedEn] = useState<string | null>(null);
  const detailId = useId();
  const selected = civs.find((civ) => civ.en === selectedEn);
  useEffect(() => {
    if (selectedEn && !civs.some((civ) => civ.en === selectedEn)) setSelectedEn(null);
  }, [civs, selectedEn]);
  if (!civs.length) {
    return (
      <div data-testid="ladder-meta-map">
        <p className="ladder-meta-detail" data-testid="ladder-meta-detail" role="status">
          暂无符合筛选的文明。
        </p>
      </div>
    );
  }
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
  const sampleLabel = sampleUnit === '人次' ? '出场人次' : '样本局数';
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
      <label className="ladder-meta-select">
        <span>查看文明数据</span>
        <select value={selected?.en ?? ''} onChange={(event) => setSelectedEn(event.target.value)}>
          <option value="" disabled>
            请选择文明
          </option>
          {civs.map((civ) => (
            <option key={civ.en} value={civ.en}>
              {civ.zh}
            </option>
          ))}
        </select>
      </label>
      <div className="ladder-plot" role="group" aria-label="文明胜率与出场率分布">
        <span className="ladder-meta-axis-title ladder-meta-axis-y">胜率</span>
        <span className="ladder-meta-axis-title ladder-meta-axis-x">出场率</span>
        <div className="ladder-plot-inner">
          <span className="ladder-meta-y-tick num nw" data-testid="ladder-meta-y-max" style={{ bottom: '100%' }}>
            {formatPercent(yMax)}
          </span>
          <span className="ladder-meta-y-tick num nw" style={{ bottom: `${((50 - yMin) / ySpan) * 100}%` }}>
            50%
          </span>
          <span className="ladder-meta-y-tick num nw" data-testid="ladder-meta-y-min" style={{ bottom: 0 }}>
            {formatPercent(yMin)}
          </span>
          <span className="ladder-meta-x-tick num nw">0%</span>
          <span className="ladder-meta-x-tick ladder-meta-x-end num nw" data-testid="ladder-meta-x-max">
            {formatPercent(xMax)}
          </span>
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
              const active = selected?.en === civ.en;
              return (
                <button
                  key={civ.en}
                  type="button"
                  className="ladder-meta-bubble"
                  data-testid={`ladder-meta-bubble-${civ.en}`}
                  data-quadrant={metaQuadrant(civ.winRate, civ.playRate, median)}
                  aria-label={`${civ.zh} (${civ.en})，胜率 ${formatPercent(civ.winRate)}，出场率 ${formatPercent(civ.playRate)}，${sampleLabel} ${formatGames(civ.games)} ${sampleUnit}`}
                  aria-pressed={active}
                  aria-describedby={active ? detailId : undefined}
                  onMouseEnter={() => setSelectedEn(civ.en)}
                  onFocus={() => setSelectedEn(civ.en)}
                  onClick={() => setSelectedEn(civ.en)}
                  style={{ left: `${(civ.playRate / xMax) * 100}%`, bottom: `${((civ.winRate - yMin) / ySpan) * 100}%` }}
                >
                  <span className="ladder-meta-mark" aria-hidden="true" style={{ width: size, height: size }} />
                </button>
              );
            })}
        </div>
      </div>
      <p className="ladder-slice" data-testid="ladder-meta-reference">
        气泡大小是{sampleLabel}。虚线是 <span className="num nw">50%</span> 胜率，和当前出场率中位数{' '}
        <span className="num nw">{median != null ? formatPercent(median) : '暂无'}</span>。
      </p>
      <div id={detailId} className="ladder-meta-detail" data-testid="ladder-meta-detail" role="status" aria-live="polite" aria-atomic="true">
        {selected ? (
          <>
            <strong data-testid="ladder-meta-name">{selected.zh}</strong>
            <dl>
              <div>
                <dt>胜率</dt>
                <dd className="num nw" data-testid="ladder-meta-win-value">
                  {formatPercent(selected.winRate)}
                </dd>
              </div>
              <div>
                <dt>出场率</dt>
                <dd className="num nw" data-testid="ladder-meta-pick-value">
                  {formatPercent(selected.playRate)}
                </dd>
              </div>
              <div>
                <dt>{sampleLabel}</dt>
                <dd className="num nw" data-testid="ladder-meta-sample-value">
                  {formatGames(selected.games)} {sampleUnit}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p>悬停、聚焦或点选气泡，查看文明数据；重叠时可从列表选择。</p>
        )}
      </div>
    </div>
  );
}

function bubbleSize(games: number, min: number, max: number): number {
  const span = Math.sqrt(max) - Math.sqrt(min) || 1;
  const t = (Math.sqrt(games) - Math.sqrt(min)) / span;
  return 10 + Math.min(1, Math.max(0, t)) * 26;
}
