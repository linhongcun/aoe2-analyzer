import { Suspense, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { civEnCasePath } from '../../../domain/civRoute';
import { startReturnPath } from '../../../domain/startGameReturn';
import { civByEn, civs } from '../../../data';
import { DLCS } from '../../../domain/dlc';
import { civInsights } from '../../../domain/insights';
import { arenaCastleGold } from '../arenaCastleGold';
import { nomadReveal } from '../nomadReveal';
import { civUniqueTechs, civUniqueUnits, relatedRegionalLines } from '../../../domain/civKit';
import { AGE_ZH, TYPE_ZH } from '../../../domain/ratings';
import type { Building, Civ, Unit } from '../../../domain/types';
import { DlcImg, img, TechIcon, UnitIcon } from '../../../shared/ui/art';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Icon } from '../../../shared/ui/Icon';
import { InsightSlot } from '../../../shared/ui/InsightSlot';
import { Breadcrumbs } from '../../../shared/ui/layout';
import { CopyPageLink, DetailSource } from '../../../shared/ui/DetailBlocks';
import { session } from '../../../shared/utils/sticky';
import { useCoreTrees, type CoreTreesResources } from '../../../shared/utils/useCoreTrees';
import { usePreviousHistoryEntry } from '../../../shared/utils/navigationEntry';
import { HistoricalEntityDetail } from '../../../shared/ui/PatchHistory';
import { savedHistoryVisit } from '../../../shared/ui/HistoryReaderLink';
import { EntityHistoryInline } from '../../../shared/ui/EntityHistoryInline';
import { useEntityHistory } from '../../../shared/ui/useEntityHistory';
import { readBrowseReturn } from '../logic/browse';
import { ArenaCastleGoldView } from './ArenaCastleGold';
import { NomadRevealView } from './NomadReveal';
import { CivHistory } from './CivHistory';
import { CivBackground } from './CivBackground';
import { CivRegionalBuildings } from './CivRegionalBuildings';
import { CivUniqueBuildings } from './CivUniqueBuildings';
import { CivFormations } from './CivFormations';
import { BonusRows } from './BonusRows';
import { useCivBonusReturn } from './useCivBonusReturn';
import { isFormationHash, readFormationReturn } from './useFormationNavigation';
import './civ-read.css';
import './civ-start-return.css';
import './civ-detail-1285.css';

const TAB_ANCHOR: Record<string, string> = {
  ov: 'identity',
  data: 'identity',
  tech: 'kit',
  formations: 'formations',
  techtree: 'techtree',
  history: 'patches',
};

const CHAPTERS = [
  ['identity', '身份'],
  ['bonuses', '加成'],
  ['kit', '套件'],
  ['techtree', '科技树'],
  ['history', '历史'],
  ['formations', '推荐阵容'],
  ['insights', '打法解读'],
  ['more', '工具'],
] as const;

type CivRestoreOwner = 'bonus' | 'formation' | 'history' | null;

interface CivRestoreEntry {
  civ: string;
  key: string;
  pathname: string;
  search: string;
  hash: string;
  owner: CivRestoreOwner;
}

const ACTIVE_CHAPTER_BOUNDARY_TOLERANCE_PX = 0.5;

/** 章节条跟着滚动标出当前所在章节。 */
function useActiveChapter(pathname: string, hash: string, chapterIds: readonly string[]): string {
  const [active, setActive] = useState<string>(chapterIds[0] ?? 'identity');
  useEffect(() => {
    let frame = 0;
    const root = document.querySelector<HTMLElement>('.civ-read');
    const nav = root?.querySelector<HTMLElement>('.civ-chapters');
    const read = () => {
      frame = 0;
      const barHeight = nav?.getBoundingClientRect().height ?? 44;
      const heightValue = String(barHeight) + 'px';
      if (root?.style.getPropertyValue('--civ-chapter-bar-height') !== heightValue) root?.style.setProperty('--civ-chapter-bar-height', heightValue);
      const boundary = (nav?.getBoundingClientRect().bottom ?? 140) + 12;
      const first = chapterIds[0] ?? 'identity';
      let current = first;
      let nearest = -Infinity;
      if (chapterIds.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 2 && scrollY > 0)
        current = chapterIds[chapterIds.length - 1] ?? first;
      else
        for (const id of chapterIds) {
          const el = root?.querySelector<HTMLElement>('#' + id);
          if (!el) continue;
          const top = el.getBoundingClientRect().top;
          if (top <= boundary + ACTIVE_CHAPTER_BOUNDARY_TOLERANCE_PX && (top > nearest || (top === nearest && hash === '#' + id))) {
            current = id;
            nearest = top;
          }
        }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(onScroll);
    if (root) observer?.observe(root);
    if (nav) observer?.observe(nav);
    for (const id of chapterIds) {
      const element = root?.querySelector<HTMLElement>('#' + id);
      if (element) observer?.observe(element);
    }
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [chapterIds, hash, pathname]);
  return active;
}

function chapterFocusTarget(id: string): HTMLElement | null {
  const section = document.getElementById(id);
  if (!section) return null;
  return id === 'techtree' ? section : section.querySelector<HTMLElement>('h1, h2');
}

function TechTreePending() {
  return (
    <div className="civ-tt-frame is-start is-end">
      <p className="civ-tt-skel" role="status">
        正在加载科技树…
      </p>
    </div>
  );
}

function EmNum({ text }: { text: string }) {
  return text.split(/((?:[+＋−-]\s*)?\d+(?:\.\d+)?\s*%?)/g).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Fold({ id, title, wanted, testId, children }: { id?: string; title: string; wanted: boolean; testId?: string; children: ReactNode }) {
  const [open, setOpen] = useState(wanted);
  return (
    <details id={id} className="civ-more-block" data-testid={testId} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <Icon name="chevron-right" className={'ic chev' + (open ? ' rot' : '')} />
        {title}
      </summary>
      {open ? children : null}
    </details>
  );
}

function buildingZh(id: number, buildings: readonly Building[] | null): string | undefined {
  return buildings?.find((building) => building.id === id)?.zh;
}

function KitUnits({
  civ,
  label,
  hint,
  lines,
  buildings,
  testId,
}: {
  civ: string;
  label: string;
  hint: string;
  lines: { u: Unit; elite?: Unit }[];
  buildings: readonly Building[] | null;
  testId: string;
}) {
  if (!lines.length) return null;
  return (
    <div className="civ-kit-group" data-testid={testId}>
      <p className="civ-group-title">
        <b>{label}</b>
        <span>{hint}</span>
      </p>
      {lines.map(({ u, elite }) => {
        const made = buildingZh(u.b, buildings);
        const sub = [u.en, elite ? '含精锐' : '', made ? `${made}生产` : ''].filter(Boolean).join(' · ');
        return (
          <Link className="kit-row uchips" key={u.id} to={`/unit/${u.id}?civ=${encodeURIComponent(civ)}`}>
            <span className="kit-icons">
              <UnitIcon u={u} />
              {elite && <UnitIcon u={elite} />}
            </span>
            <span className="kit-meta">
              <span className="kit-name">{u.zh}</span>
              <span className="kit-sub">{sub}</span>
            </span>
            <span className="kit-age">{AGE_ZH[u.age] ?? ''}</span>
          </Link>
        );
      })}
    </div>
  );
}

type TechTreeComponent = ComponentType<{ civEn: string; resources: CoreTreesResources }>;

export default function CivDetail({ techTree }: { techTree: TechTreeComponent }) {
  const { en = '' } = useParams();
  const location = useLocation();
  const c = civByEn(en);
  // 只差大小写时先 replace 到目录英文名。
  const canonicalPath = civEnCasePath(civs, en);
  if (canonicalPath) return <Navigate to={{ pathname: canonicalPath, search: location.search, hash: location.hash }} replace />;
  if (!c) return <HistoricalEntityDetail target={{ targetType: 'civ', targetId: en }} />;
  return <CivReading c={c} techTree={techTree} />;
}

function CivReading({ c, techTree: TechTree }: { c: Civ; techTree: TechTreeComponent }) {
  const location = useLocation();
  const entityHistory = useEntityHistory('civ/' + c.en, new URLSearchParams(location.search).get('tab') === 'history' || location.hash === '#patches');
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const homeReturn = startReturnPath(location.search);
  const resources = useCoreTrees();
  const core = resources.core.data;
  const previous = usePreviousHistoryEntry();
  const bonusReturn = useCivBonusReturn(c.en);
  const historySnapshot = savedHistoryVisit(location);
  const historyFocusId = historySnapshot?.focusId;
  const restoreOwnerEntry = useMemo<CivRestoreEntry>(() => {
    const formationOwner = readFormationReturn(c.en, previous);
    const owner: CivRestoreOwner = bonusReturn.ownsRestore
      ? 'bonus'
      : formationOwner
        ? 'formation'
        : navigationType === 'POP' && historyFocusId === 'encyclopedia-complete-history'
          ? 'history'
          : null;
    return {
      civ: c.en,
      key: location.key,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      owner,
    };
  }, [bonusReturn.ownsRestore, c.en, historyFocusId, location.hash, location.key, location.pathname, location.search, navigationType, previous]);
  const restoreOwner = restoreOwnerEntry.owner;
  const suppressFormationRestore = restoreOwner === 'bonus' || restoreOwner === 'history';
  const historyRestoreEnabled = restoreOwner !== 'bonus' && restoreOwner !== 'formation';
  const params = new URLSearchParams(location.search);
  const listReturn = readBrowseReturn(params, core, resources.core.pending);
  const tab = params.get('tab');
  const { insights, arenaGold, nomad } = useMemo(
    () => ({
      insights: civInsights(c.en),
      arenaGold: arenaCastleGold(c.en),
      nomad: nomadReveal(c.en),
    }),
    [c.en],
  );
  const hasInsights = insights.length > 0 || arenaGold !== null || nomad !== null;
  const chapters = useMemo(() => CHAPTERS.filter(([id]) => id !== 'insights' || hasInsights), [hasInsights]);
  const chapterIds = useMemo(() => chapters.map(([id]) => id), [chapters]);
  const chapter = useActiveChapter(location.pathname, location.hash, chapterIds);
  const chapterFocusConsumed = useRef<string | null>(null);
  const chaptersRef = useRef<HTMLElement>(null);
  const [chaptersRightFade, setChaptersRightFade] = useState(false);
  useEffect(() => {
    const nav = chaptersRef.current;
    if (!nav) return;
    const syncFade = () => setChaptersRightFade(nav.scrollWidth > nav.clientWidth + 2 && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
    syncFade();
    nav.addEventListener('scroll', syncFade, { passive: true });
    addEventListener('resize', syncFade);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncFade);
    observer?.observe(nav);
    return () => {
      nav.removeEventListener('scroll', syncFade);
      removeEventListener('resize', syncFade);
      observer?.disconnect();
    };
  }, [chapters, c.en]);
  useEffect(() => {
    const nav = chaptersRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth + 1) return;
    const activeLink = nav.querySelector<HTMLElement>('a[aria-current="location"]');
    if (!activeLink) return;
    const maxLeft = Math.max(0, nav.scrollWidth - nav.clientWidth);
    const desired = activeLink.offsetLeft + activeLink.offsetWidth - nav.clientWidth;
    if (activeLink.offsetLeft < nav.scrollLeft) nav.scrollTo({ left: Math.max(0, activeLink.offsetLeft), behavior: 'auto' });
    else if (desired > nav.scrollLeft) nav.scrollTo({ left: Math.min(maxLeft, desired), behavior: 'auto' });
    setChaptersRightFade(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  }, [chapter, chapters]);
  useEffect(() => {
    session.lastCiv = c.en;
    if (restoreOwner !== null) return;
    if (tab != null && tab !== 'history') {
      const next = new URLSearchParams(location.search);
      next.delete('tab');
      const anchor = TAB_ANCHOR[tab] ?? '';
      navigate({ pathname: location.pathname, search: next.toString() ? '?' + next : '', hash: anchor ? '#' + anchor : '' }, { replace: true });
      return;
    }
    if (isFormationHash(location.hash)) return;
    const id = location.hash.replace(/^#/, '') || (tab === 'history' ? 'patches' : '');
    if (!id) {
      if (navigationType !== 'POP') scrollTo(0, 0);
      return;
    }
    if (navigationType === 'POP' && previous) return;
    const requested = (location.state as { civChapterFocus?: unknown } | null)?.civChapterFocus === id;
    const focus = navigationType === 'PUSH' && requested && chapterFocusConsumed.current !== location.key;
    if (focus) chapterFocusConsumed.current = location.key;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
      if (focus) chapterFocusTarget(id)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [c, location.hash, location.key, location.pathname, location.search, location.state, navigate, navigationType, previous, restoreOwner, tab]);
  const uniqueUnits = core ? civUniqueUnits(c.en, core.units, core.fam) : [];
  const uniqueTechs = core ? civUniqueTechs(c.en, core.techs) : [];
  const regional = core
    ? relatedRegionalLines(c, core.units, core.techs).flatMap((line) => {
        const base = line[0];
        if (!base) return [];
        const tail = line.length > 1 ? line[line.length - 1] : undefined;
        return [{ u: base, elite: tail && tail.id !== base.id ? tail : undefined }];
      })
    : [];
  const tools = [
    ['civ-tool-builds', `/builds?civ=${c.en}`, '开局流程'],
    ['civ-tool-production', `/production?civ=${c.en}`, '持续生产'],
    ['civ-tool-train-total', `/production?mode=train-total&civ=${c.en}`, '训练总价'],
    ['civ-tool-matchup', `/matchup?me=${c.en}`, '对局助手'],
    ['civ-tool-compare', `/compare?a=${c.en}`, '文明对比'],
  ] as const;
  const historyOpen =
    tab === 'history' || location.hash === '#patches' || (historyRestoreEnabled && historySnapshot?.focusId === 'encyclopedia-complete-history');
  return (
    <CivBackground civ={c.en} className="civ-read">
      <Breadcrumbs current={c.zh} />
      {homeReturn && (
        <div className="civ-start-return">
          <Link to={homeReturn}>回开一局</Link>
          <small>返回文明步，保留原选择</small>
        </div>
      )}
      <header className="civ-identity" id="identity" data-testid="civ-identity">
        <div className="identity-art" aria-hidden="true" />
        <img className="civ-crest" src={img(`civs/${c.en.toLowerCase()}.webp`)} alt="" />
        <div className="civ-identity-main">
          {c.dlc != null && (
            <p className="civ-dlc">
              <Link to="/dlc">
                <DlcImg i={c.dlc} />
                <span>{DLCS[c.dlc]!.zh}</span>
              </Link>
            </p>
          )}
          <h1 tabIndex={-1}>
            {c.zh}
            <span>{c.en}</span>
          </h1>
          <p className="civ-official">
            官方定位：<em>{c.desc}</em>
          </p>
          {c.ty.length > 0 && (
            <div className="civ-tags">
              {c.ty.map((type) => (
                <span key={type} className="tag">
                  {TYPE_ZH[type]}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="civ-identity-actions">
          <CivPicker
            id="civ-head-switch"
            label="切换文明"
            value={c.en}
            selectedPrefix="切换文明"
            compactTrigger
            onChange={(nextEn) => {
              if (!nextEn || nextEn === c.en) return;
              const preserved = new URLSearchParams();
              if (listReturn.kind === 'filtered' || listReturn.kind === 'pending') {
                const rawList = params.get('civList');
                if (rawList) preserved.set('civList', rawList);
              }
              if (homeReturn) {
                const rawReturn = params.get('returnTo');
                if (rawReturn) preserved.set('returnTo', rawReturn);
              }
              const nextSearch = preserved.toString();
              navigate({ pathname: `/civ/${nextEn}`, search: nextSearch ? `?${nextSearch}` : '' });
            }}
          />
          <CopyPageLink />
          {listReturn.kind !== 'pending' && (
            <Link
              className="civ-list-link"
              to={listReturn.kind === 'filtered' ? listReturn.to : '/civs'}
              aria-describedby={listReturn.kind === 'invalid' ? 'civ-list-return-note' : undefined}
            >
              {listReturn.kind === 'filtered' ? '返回筛选结果' : '文明列表'}
            </Link>
          )}
          {listReturn.kind === 'invalid' && (
            <p className="civ-list-return-note" id="civ-list-return-note">
              原筛选条件无法恢复，将打开全部文明。
            </p>
          )}
        </div>
      </header>
      <nav ref={chaptersRef} className={`civ-chapters${chaptersRightFade ? ' has-right-fade' : ''}`} aria-label="本页章节">
        {chapters.map(([id, label]) => (
          <Link
            key={id}
            to={{ pathname: location.pathname, search: location.search, hash: `#${id}` }}
            state={id === 'formations' ? { focusFormation: true } : location.hash === '#' + id ? undefined : { civChapterFocus: id }}
            onClick={(event) => {
              if (
                id === 'formations' ||
                location.hash !== '#' + id ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              document.getElementById(id)?.scrollIntoView({ block: 'start' });
              chapterFocusTarget(id)?.focus({ preventScroll: true });
            }}
            aria-current={chapter === id ? 'location' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="civ-columns">
        <section id="bonuses" aria-labelledby="civ-bonus-title" data-testid="civ-bonuses">
          <p className="civ-kicker">机制事实</p>
          <h2 id="civ-bonus-title" tabIndex={-1}>
            文明加成
          </h2>
          <p className="note">
            <span className="civ-bonus-hint-wide">加成直接可读。想查影响对象、工具计入或来源，选择「作用与依据」。</span>
            <span className="civ-bonus-hint-narrow">
              加成直接可读。点每条右侧的 <Icon name="info" className="civ-bonus-hint-icon" />
              ，查看作用与依据。
            </span>
          </p>
          <BonusRows key={`${c.en}:${location.key}`} c={c} onCaptureLink={bonusReturn.captureLink} />
        </section>
        <section className="civ-kit" id="kit" aria-labelledby="civ-kit-title" data-testid="civ-kit">
          <p className="civ-kicker">本文明套件</p>
          <h2 id="civ-kit-title" tabIndex={-1}>
            关键兵种与科技
          </h2>
          <p className="note">
            打开单位资料时保留{c.zh}文明。能造什么、缺什么见下方
            <Link to={{ pathname: location.pathname, search: location.search, hash: '#techtree' }}>科技树</Link>。
          </p>
          {resources.core.pending && <p role="status">正在加载兵种与科技…</p>}
          {resources.core.error && (
            <div role="alert">
              <p>关键兵种与科技读取失败。</p>
              <button type="button" onClick={resources.core.retry}>
                重试兵种与科技
              </button>
            </div>
          )}
          <KitUnits civ={c.en} label="独特单位" hint="本文明专属" lines={uniqueUnits} buildings={core?.buildings ?? null} testId="civ-unique-units" />
          {uniqueTechs.length > 0 && (
            <div className="civ-kit-group" data-testid="civ-unique-techs">
              <p className="civ-group-title">
                <b>独特科技</b>
                <span>本文明专属</span>
              </p>
              {uniqueTechs.map((tech) => (
                <Link className="kit-row" key={tech.id} to={`/tech/${tech.id}`}>
                  <span className="kit-icons">
                    <TechIcon t={tech} />
                  </span>
                  <span className="kit-meta">
                    <span className="kit-name">{tech.zh}</span>
                    <span className="kit-sub">
                      <EmNum text={tech.desc} />
                    </span>
                  </span>
                  <span className="kit-age">{AGE_ZH[tech.age] ?? ''}</span>
                </Link>
              ))}
            </div>
          )}
          <KitUnits
            civ={c.en}
            label="区域单位"
            hint="与本文明加成或独特科技有关"
            lines={regional}
            buildings={core?.buildings ?? null}
            testId="civ-regional-units"
          />
          <CivUniqueBuildings civ={c.en} buildings={core?.buildings ?? null} />
          <CivRegionalBuildings civ={c.en} buildings={core?.buildings ?? null} />
        </section>
      </div>
      <section id="techtree" className="civ-techtree tree-pane" data-tree-civ={c.en} data-testid="civ-techtree" aria-labelledby="civ-tt-title" tabIndex={-1}>
        <div className="civ-tt-title">
          <p className="civ-kicker">能造什么、缺什么</p>
          <h2 id="civ-tt-title">科技树</h2>
        </div>
        <Suspense fallback={<TechTreePending />}>
          <TechTree civEn={c.en} resources={resources} />
        </Suspense>
      </section>
      <DetailSource note="加成、单位与科技来自当前数据目录" />
      <section id="history" className="civ-history-chapter" aria-labelledby="civ-history-title">
        <p className="civ-kicker">历史资料</p>
        <h2 id="civ-history-title" tabIndex={-1}>
          历史与更新
        </h2>
        <p className="note">历史背景用于了解来历，不作为当前版本机制说明。</p>
        <Fold key={`${c.en}-history`} title="文明历史摘要" wanted={false} testId="civ-history-summary">
          <CivHistory civ={c.en} />
        </Fold>
        {!entityHistory.empty && (
          <Fold key={`${c.en}-patches-${historyOpen ? 'open' : 'shut'}`} id="patches" title="更新历史" wanted={historyOpen} testId="civ-patches">
            <EntityHistoryInline resource={entityHistory} restoreEnabled={historyRestoreEnabled} />
          </Fold>
        )}
      </section>
      <CivFormations key={c.en} civ={c.en} resources={resources} suppressRestore={suppressFormationRestore} />
      {hasInsights && (
        <section id="insights" className="civ-insights-chapter" aria-labelledby="civ-insights-title">
          <h2 id="civ-insights-title" tabIndex={-1}>
            打法解读
          </h2>
          {insights.length > 0 && <InsightSlot items={insights} />}
          {arenaGold && <ArenaCastleGoldView card={arenaGold} />}
          {nomad && <NomadRevealView card={nomad} />}
        </section>
      )}
      <p className="note civ-reading-note">能力评分、团战位置和开局短句不作为本页推荐依据。</p>
      <section className="civ-more" id="more" data-testid="civ-more">
        <p className="civ-kicker">继续使用</p>
        <h2 id="civ-more-title" tabIndex={-1}>
          工具
        </h2>
        <p className="civ-continue" data-testid="civ-related-tools">
          <span className="civ-continue-lab">用这个文明继续：</span>
          {tools.map(([id, to, label]) => (
            <Link key={id} data-testid={id} to={to}>
              {label}
            </Link>
          ))}
        </p>
        <p className="note">这些入口沿用现有工具参数。阵容兵量、科技与成型总投入不会自动带入。</p>
      </section>
    </CivBackground>
  );
}
