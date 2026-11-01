import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import arabiaJson from '../../data/ladder-arabia-p162286.json';
import teamJson from '../../data/ladder-4v4-rm-e1200-1400-90d.json';
import { isBalanceAligned, LOW_SAMPLE, resolveElo, type BracketKey, type LadderSnapshot } from '../../domain/ladder';
import { canonicalLadderSearch, resolveLadderLocation, type LadderModeId } from '../../domain/ladderQuery';
import { LadderArabia } from './LadderArabia';
import { HideLowSample, LadderFilters } from './LadderFilters';
import { LadderTeam } from './LadderTeam';
import { LadderViewSwitch, type LadderViewId } from './LadderViewSwitch';
import { Icon } from '../../shared/ui/Icon';
import { DATA_SOURCES } from '../../shared/utils/dataInfo';
import './ladder.css';

const arabiaSnapshot = arabiaJson as LadderSnapshot;
const teamSnapshot = teamJson as LadderSnapshot;
const SITE_BUILD = DATA_SOURCES.patch?.build ?? 0;

export default function Ladder() {
  const location = useLocation();
  const navigate = useNavigate();
  const resolved = useMemo(() => resolveLadderLocation(location.search, arabiaSnapshot), [location.search]);
  const [toast, setToast] = useState<string | null>(resolved.toast);
  const [trackedToast, setTrackedToast] = useState(resolved.toast);
  if (resolved.toast !== trackedToast) {
    setTrackedToast(resolved.toast);
    if (resolved.toast) setToast(resolved.toast);
  }
  const [hideLow, setHideLow] = useState(true);
  const active = resolved.mode === '4v4' ? teamSnapshot : arabiaSnapshot;
  const aligned = isBalanceAligned(active.patchNote, SITE_BUILD);

  useEffect(() => {
    const canonical = canonicalLadderSearch(resolved);
    if (location.search !== canonical) navigate({ pathname: '/ladder', search: canonical }, { replace: true });
  }, [resolved, location.search, navigate]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectMode = (mode: LadderModeId) => {
    navigate({ pathname: '/ladder', search: canonicalLadderSearch({ mode, elo: 'all', pendingView: resolved.pendingView }) }, { replace: true });
  };

  const selectElo = (key: string) => {
    const next = resolveElo(key, arabiaSnapshot).elo;
    navigate({ pathname: '/ladder', search: canonicalLadderSearch({ mode: 'arabia1v1', elo: next, pendingView: resolved.pendingView }) }, { replace: true });
  };

  const selectView = (view: LadderViewId) => {
    navigate({ pathname: '/ladder', search: canonicalLadderSearch({ ...resolved, pendingView: view === 'table' ? null : view }) }, { replace: true });
  };
  const view = resolved.pendingView ?? 'table';
  const sampleFloor = (resolved.mode === '4v4' ? teamSnapshot.lowSampleGames : undefined) ?? LOW_SAMPLE;

  return (
    <section className="pane ladder-page" data-testid="ladder-page" data-patch-mismatch={aligned ? undefined : 'true'}>
      <nav className="crumbs" aria-label="面包屑">
        <Link to="/">
          <Icon name="home" /> 首页
        </Link>
        <Icon name="chevron-right" />
        <span>资料</span>
        <Icon name="chevron-right" />
        <span>天梯数据</span>
      </nav>
      <div className="ladder-head">
        <div>
          <h1>
            <Icon name="trophy" />
            天梯数据 <small>Ladder Stats</small>
          </h1>
          <p className="ladder-desc">
            默认 <span className="nw">4v4</span> 随机地图、Elo <span className="nw">1200–1400</span>、近 <span className="nw">90 天</span>、全图。可切回阿拉伯{' '}
            <span className="nw">1v1</span>。
          </p>
        </div>
        <LadderViewSwitch view={view} onChange={selectView} />
      </div>
      <LadderFilters mode={resolved.mode} arabia={arabiaSnapshot} onMode={selectMode} />
      <HideLowSample checked={hideLow} threshold={sampleFloor} onChange={setHideLow} />
      {toast && (
        <p className="ladder-toast" role="status" data-testid="ladder-fallback-toast">
          {toast}
        </p>
      )}
      {resolved.mode === '4v4' ? (
        <LadderTeam view={view} hideLow={hideLow} onArabia={() => selectMode('arabia1v1')} />
      ) : (
        <LadderArabia view={view} elo={resolved.elo as BracketKey} onSelect={selectElo} hideLow={hideLow} />
      )}
    </section>
  );
}
