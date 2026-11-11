import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import arabiaJson from '../../data/ladder-arabia-p185872.json';
import teamJson from '../../data/ladder-4v4-rm-e1200-1400-90d.json';
import { isBalanceAligned, LOW_SAMPLE, resolveElo, type BracketKey, type LadderSnapshot } from '../../domain/ladder';
import { canonicalLadderSearch, resolveLadderLocation, sliceFacts, type EloFilterOption, type LadderModeId } from '../../domain/ladderQuery';
import { LadderSourceFacts } from './LadderSourceFacts';
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
  const resolved = useMemo(() => resolveLadderLocation(location.search, arabiaSnapshot, teamSnapshot), [location.search]);
  const [toast, setToast] = useState<string | null>(resolved.toast);
  const [trackedToast, setTrackedToast] = useState(resolved.toast);
  if (resolved.toast !== trackedToast) {
    setTrackedToast(resolved.toast);
    if (resolved.toast) setToast(resolved.toast);
  }
  const [hideLow, setHideLow] = useState(true);
  // Elo 切换可能替换整棵 Team/Arabia/空态子树，焦点请求留在稳定根组件。
  const pendingEloFocus = useRef<string | null>(null);
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
    navigate({ pathname: '/ladder', search: canonicalLadderSearch({ mode, elo: 'all', pendingView: resolved.pendingView }) });
  };

  const selectElo = (key: string) => {
    const next = resolveElo(key, arabiaSnapshot).elo;
    navigate({ pathname: '/ladder', search: canonicalLadderSearch({ mode: 'arabia1v1', elo: next, pendingView: resolved.pendingView }) });
  };

  const selectEloOption = (option: EloFilterOption) => {
    if (!option.enabled || option.mode !== resolved.mode) return;
    if (option.current) {
      pendingEloFocus.current = null;
      return;
    }
    pendingEloFocus.current = `${option.mode}:${option.key}`;
    navigate({ pathname: '/ladder', search: canonicalLadderSearch({ mode: resolved.mode, elo: option.elo, pendingView: resolved.pendingView }) });
  };

  const selectView = (view: LadderViewId) => {
    navigate({ pathname: '/ladder', search: canonicalLadderSearch({ ...resolved, pendingView: view === 'table' ? null : view }) });
  };
  const view = resolved.pendingView ?? 'table';
  const facts = sliceFacts(resolved.mode, resolved.elo, arabiaSnapshot, teamSnapshot);
  const sampleFloor = (resolved.mode === '4v4' ? teamSnapshot.lowSampleGames : undefined) ?? LOW_SAMPLE;
  const controls = (
    <>
      <LadderFilters
        mode={resolved.mode}
        elo={resolved.elo}
        arabia={arabiaSnapshot}
        team={teamSnapshot}
        onMode={selectMode}
        onElo={selectEloOption}
        onEloRef={(id, node) => {
          if (node && pendingEloFocus.current === id && node.getAttribute('aria-checked') === 'true') {
            pendingEloFocus.current = null;
            node.focus();
          }
        }}
      >
        <HideLowSample checked={hideLow} threshold={sampleFloor} onChange={setHideLow} />
      </LadderFilters>
      {toast && (
        <p className="ladder-toast" role="status" data-testid="ladder-fallback-toast">
          {toast}
        </p>
      )}
    </>
  );

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
            默认 <span className="nw">4v4</span> 随机地图、Elo <span className="nw">1200–1400</span>、近 <span className="nw">90 天</span>、全图。可切到阿拉伯{' '}
            <span className="nw">1v1</span>。
          </p>
        </div>
        <LadderViewSwitch view={view} onChange={selectView} />
      </div>
      {resolved.missing ? (
        <>
          <div
            className="ladder-source"
            data-testid="ladder-source"
            data-cutoff="missing"
            data-slice-mode={facts.mode}
            data-slice-elo={facts.eloKey}
            data-slice-map={facts.mapKey}
          >
            <Icon name="database" />
            <div className="ladder-copy">
              <LadderSourceFacts facts={facts} />
              <p className="ladder-missing-source" data-testid="ladder-missing-source">
                本组合暂无快照，不显示其他分段的统计截止、样本或胜率。
              </p>
            </div>
          </div>
          {controls}
          <div className="ladder-empty" data-testid="ladder-empty">
            <Icon name="inbox" />
            <p className="ladder-empty-title">这个分段暂无数据</p>
            <p>没有这一模式和 Elo 的快照。不推算，不补数。</p>
          </div>
        </>
      ) : resolved.mode === '4v4' ? (
        <LadderTeam view={view} elo={resolved.elo} facts={facts} hideLow={hideLow} onArabia={() => selectMode('arabia1v1')}>
          {controls}
        </LadderTeam>
      ) : (
        <LadderArabia view={view} elo={resolved.elo as BracketKey} facts={facts} onSelect={selectElo} hideLow={hideLow}>
          {controls}
        </LadderArabia>
      )}
    </section>
  );
}
