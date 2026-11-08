import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import arabiaJson from '../../data/ladder-arabia-p185872.json';
import teamJson from '../../data/ladder-4v4-rm-e1200-1400-90d.json';
import { isBalanceAligned, LOW_SAMPLE, resolveElo, type BracketKey, type LadderSnapshot } from '../../domain/ladder';
import { type InsightsMapKey, type InsightsSnapshot } from '../../domain/ladderInsights';
import {
  canonicalLadderSearch,
  resolveLadderLocation,
  sliceFacts,
  type EloFilterOption,
  type LadderModeId,
  type MapFilterOption,
} from '../../domain/ladderQuery';
import { LadderArabia } from './LadderArabia';
import { HideLowSample, LadderFilters } from './LadderFilters';
import { LadderInsights } from './LadderInsights';
import { fixtureSnapshot, type LadderFixtureId } from './ladder570Fixture';
import { LadderTeam } from './LadderTeam';
import { LadderViewSwitch, type LadderViewId } from './LadderViewSwitch';
import { Icon } from '../../shared/ui/Icon';
import { DATA_SOURCES } from '../../shared/utils/dataInfo';
import './ladder.css';

const arabiaSnapshot = arabiaJson as LadderSnapshot;
const teamSnapshot = teamJson as LadderSnapshot;
const SITE_BUILD = DATA_SOURCES.patch?.build ?? 0;

/** 已提交的 Insights 文件是全时段，不能当作 2026-05 至 2026-10。 */
const insightsCatalog: { byKey: Partial<Record<InsightsMapKey, InsightsSnapshot>>; available: InsightsMapKey[] } = {
  byKey: {},
  available: [],
};

function fixtureId(search: string): LadderFixtureId | null {
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('fixture');
  if (value === '570-data' || value === '570-low') return value;
  return null;
}

function withFixture(search: string, fixture: LadderFixtureId | null): string {
  if (!fixture) return search;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.set('fixture', fixture);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export default function Ladder() {
  const location = useLocation();
  const navigate = useNavigate();
  const fixture = fixtureId(location.search);
  const available = useMemo(() => (fixture ? (['rm-arabia', 'arena'] as const) : insightsCatalog.available), [fixture]);
  const resolved = useMemo(() => resolveLadderLocation(location.search, arabiaSnapshot, { insightsMaps: available }), [available, location.search]);
  const [toast, setToast] = useState<string | null>(resolved.toast);
  const [trackedToast, setTrackedToast] = useState(resolved.toast);
  if (resolved.toast !== trackedToast) {
    setTrackedToast(resolved.toast);
    if (resolved.toast) setToast(resolved.toast);
  }
  const [hideLow, setHideLow] = useState(true);
  const pendingEloFocus = useRef<string | null>(null);
  const pendingMapFocus = useRef<string | null>(null);
  const windowMissing = resolved.insightsMap != null && !available.includes(resolved.insightsMap);
  const unfilteredElo = Boolean(fixture) || windowMissing;
  const active = resolved.mode === '4v4' ? teamSnapshot : arabiaSnapshot;
  const aligned = windowMissing || fixture ? true : isBalanceAligned(active.patchNote, SITE_BUILD);
  const fixtureMap: InsightsMapKey = resolved.insightsMap === 'arena' ? 'arena' : 'rm-arabia';
  const shownInsights = fixture
    ? fixtureSnapshot(fixture, fixtureMap)
    : available.includes(resolved.insightsMap ?? 'arena')
      ? insightsCatalog.byKey[resolved.insightsMap!]
      : undefined;

  useEffect(() => {
    const canonical = withFixture(canonicalLadderSearch(resolved), fixture);
    if (location.search !== canonical) navigate({ pathname: '/ladder', search: canonical }, { replace: true });
  }, [fixture, resolved, location.search, navigate]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = (search: string) => navigate({ pathname: '/ladder', search: withFixture(search, fixture) }, { replace: true });

  const selectMode = (mode: LadderModeId) => {
    go(canonicalLadderSearch({ mode, elo: 'all', pendingView: resolved.pendingView, insightsMap: null }));
  };

  const selectElo = (key: string) => {
    const next = resolveElo(key, arabiaSnapshot).elo;
    go(canonicalLadderSearch({ mode: 'arabia1v1', elo: next, pendingView: resolved.pendingView }));
  };

  const selectEloOption = (option: EloFilterOption) => {
    if (!option.enabled || option.mode !== resolved.mode) return;
    if (option.current) {
      pendingEloFocus.current = null;
      return;
    }
    pendingEloFocus.current = `${option.mode}:${option.key}`;
    go(canonicalLadderSearch({ mode: resolved.mode, elo: option.elo, pendingView: resolved.pendingView, insightsMap: resolved.insightsMap }));
  };

  const selectMap = (option: MapFilterOption) => {
    if (!option.enabled) return;
    pendingMapFocus.current = option.key;
    go(canonicalLadderSearch({ mode: 'arabia1v1', elo: 'all', pendingView: resolved.pendingView, insightsMap: option.key }));
  };

  const selectLegacyMap = () => {
    pendingMapFocus.current = 'arabia';
    go(canonicalLadderSearch({ mode: 'arabia1v1', elo: 'all', pendingView: resolved.pendingView, insightsMap: null }));
  };

  const selectView = (view: LadderViewId) => {
    go(canonicalLadderSearch({ ...resolved, pendingView: view === 'table' ? null : view }));
  };
  const view = resolved.pendingView ?? 'table';
  const facts = sliceFacts(resolved.mode, resolved.elo, arabiaSnapshot, teamSnapshot);
  const sampleFloor = shownInsights?.lowSample.threshold ?? (resolved.mode === '4v4' ? teamSnapshot.lowSampleGames : undefined) ?? LOW_SAMPLE;
  const controls = (
    <>
      <LadderFilters
        mode={resolved.mode}
        elo={resolved.elo}
        arabia={arabiaSnapshot}
        team={teamSnapshot}
        insightsMap={fixture ? fixtureMap : resolved.insightsMap}
        insightsAvailable={available}
        unfilteredElo={unfilteredElo}
        onMode={selectMode}
        onElo={selectEloOption}
        onMap={selectMap}
        onLegacyMap={selectLegacyMap}
        onEloRef={(id, node) => {
          if (node && pendingEloFocus.current === id && node.getAttribute('aria-checked') === 'true') {
            pendingEloFocus.current = null;
            node.focus();
          }
        }}
        onMapRef={(key, node) => {
          if (node && pendingMapFocus.current === key && node.getAttribute('aria-checked') === 'true') {
            pendingMapFocus.current = null;
            node.focus();
          }
        }}
      />
      <HideLowSample checked={hideLow} threshold={sampleFloor} onChange={setHideLow} />
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
            默认 <span className="nw">4v4</span> 随机地图、Elo <span className="nw">1200–1400</span>、近 <span className="nw">90 天</span>、全图。可切回阿拉伯{' '}
            <span className="nw">1v1</span>。
          </p>
        </div>
        <LadderViewSwitch view={view} onChange={selectView} />
      </div>
      {shownInsights ? (
        <LadderInsights view={view} snapshot={shownInsights} hideLow={hideLow} onShowLow={() => setHideLow(false)}>
          {fixture && (
            <p className="ladder-fixture-banner" data-testid="ladder-fixture-banner">
              测试夹具，不是正式统计，也不是已采集的 2026-05 至 2026-10 快照。
            </p>
          )}
          {controls}
        </LadderInsights>
      ) : resolved.missing || windowMissing ? (
        <>
          {controls}
          <div className="ladder-empty" data-testid="ladder-empty">
            <Icon name="inbox" />
            <p className="ladder-empty-title">{resolved.insightsMap ? '该地图与分段暂无快照' : '这个分段暂无数据'}</p>
            <p>{resolved.insightsMap ? '该地图与分段暂无快照，不推算、不补数。' : '没有这一模式和 Elo 的快照。不推算，不补数。'}</p>
            {resolved.insightsMap && (
              <button type="button" onClick={selectLegacyMap}>
                看现有阿拉伯快照
              </button>
            )}
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
