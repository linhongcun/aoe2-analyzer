import { Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { civEnCasePath } from '../../../domain/civRoute';
import { startReturnPath } from '../../../domain/startGameReturn';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { DLCS } from '../../../domain/dlc';
import { civInsights } from '../../../domain/insights';
import { civUniqueTechs, civUniqueUnits, relatedRegionalLines } from '../../../domain/civKit';
import { AGE_ZH, TYPE_ZH } from '../../../domain/ratings';
import type { Building, Unit } from '../../../domain/types';
import { DlcImg, img, TechIcon, UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { InsightSlot } from '../../../shared/ui/InsightSlot';
import { Breadcrumbs } from '../../../shared/ui/layout';
import { CopyPageLink, DetailSource } from '../../../shared/ui/DetailBlocks';
import { session } from '../../../shared/utils/sticky';
import { HistoricalEntityDetail, PatchHistory } from '../../../shared/ui/PatchHistory';
import { ArenaCastleGold } from './ArenaCastleGold';
import { NomadReveal } from './NomadReveal';
import { BonusRows } from './BonusRows';
import { CivHistory } from './CivHistory';
import { CivBackground } from './CivBackground';
import { CivRegionalBuildings } from './CivRegionalBuildings';
import { CivUniqueBuildings } from './CivUniqueBuildings';
import './civ-read.css';
import './civ-start-return.css';

const TAB_ANCHOR: Record<string, string> = {
  ov: 'identity',
  data: 'identity',
  tech: 'kit',
  techtree: 'techtree',
  history: 'patches',
};

const CHAPTERS = [
  ['identity', '身份'],
  ['bonuses', '加成'],
  ['kit', '兵种'],
  ['techtree', '科技树'],
  ['more', '其他'],
] as const;

const CHAPTER_IDS = CHAPTERS.map(([id]) => id);

/** 章节条跟着滚动标出当前所在章节。 */
function useActiveChapter(pathname: string, hash: string): string {
  const [active, setActive] = useState<string>(CHAPTER_IDS[0]!);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      let current: string = CHAPTER_IDS[0]!;
      let nearest = -Infinity;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2 && scrollY > 0) current = CHAPTER_IDS[CHAPTER_IDS.length - 1]!;
      else
        for (const id of CHAPTER_IDS) {
          const el = document.getElementById(id);
          if (!el) continue;
          const top = el.getBoundingClientRect().top;
          if (top <= 140 && (top > nearest || (top === nearest && hash === `#${id}`))) {
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
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pathname, hash]);
  return active;
}

function TechTreePending() {
  return (
    <section id="techtree" className="civ-techtree" data-testid="civ-techtree" aria-labelledby="civ-tt-title">
      <div className="civ-tt-head">
        <div className="civ-tt-title">
          <p className="civ-kicker">能造什么、缺什么</p>
          <h2 id="civ-tt-title">科技树</h2>
        </div>
      </div>
      <div className="civ-tt-frame is-end">
        <p className="civ-tt-skel" role="status">
          正在加载科技树…
        </p>
      </div>
    </section>
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
  label,
  hint,
  lines,
  buildings,
  testId,
}: {
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
          <Link className="kit-row uchips" key={u.id} to={`/unit/${u.id}`}>
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

export default function CivDetail({ techTree: TechTree }: { techTree: ComponentType<{ civEn: string }> }) {
  const { en = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const homeReturn = startReturnPath(location.search);
  const c = civByEn(en);
  const core = useCore();
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  const chapter = useActiveChapter(location.pathname, location.hash);
  useEffect(() => {
    if (!c) return;
    session.lastCiv = c.en;
    if (tab != null) {
      const next = new URLSearchParams(location.search);
      next.delete('tab');
      const anchor = TAB_ANCHOR[tab] ?? '';
      navigate({ pathname: location.pathname, search: next.toString() ? `?${next}` : '', hash: anchor ? `#${anchor}` : '' }, { replace: true });
      return;
    }
    const id = location.hash.replace(/^#/, '');
    if (!id) {
      scrollTo(0, 0);
      return;
    }
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [c, location.hash, location.pathname, location.search, navigate, tab]);
  // 只差大小写时先 replace 到目录英文名。已是规范名或对不上目录则不跳，也不能先画出历史空态。
  const canonicalPath = civEnCasePath(civs, en);
  if (canonicalPath) return <Navigate to={{ pathname: canonicalPath, search: location.search, hash: location.hash }} replace />;
  if (!c) return <HistoricalEntityDetail target={{ targetType: 'civ', targetId: en }} />;
  const insights = civInsights(c.en);
  const uniqueUnits = core ? civUniqueUnits(c.en, core.units, core.fam) : [];
  const uniqueTechs = core ? civUniqueTechs(c, core.techs) : [];
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
  const historyOpen = tab === 'history' || location.hash === '#patches';
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
          <h1>
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
          <CopyPageLink />
          <Link className="civ-list-link" to="/civs">
            文明列表
          </Link>
        </div>
      </header>
      <nav className="civ-chapters" aria-label="本页章节">
        {CHAPTERS.map(([id, label]) => (
          <Link key={id} to={{ pathname: location.pathname, search: location.search, hash: `#${id}` }} aria-current={chapter === id ? 'location' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="civ-columns">
        <section id="bonuses" aria-labelledby="civ-bonus-title" data-testid="civ-bonuses">
          <p className="civ-kicker">机制事实</p>
          <h2 id="civ-bonus-title">文明加成</h2>
          <p className="note">事实在此完整列出一次。点开一行可进入加成详情。</p>
          <BonusRows key={c.en} c={c} />
        </section>
        <section className="civ-kit" id="kit" aria-labelledby="civ-kit-title" data-testid="civ-kit">
          <p className="civ-kicker">本文明套件</p>
          <h2 id="civ-kit-title">关键兵种与科技</h2>
          <p className="note">
            名称进入单位或科技页。能造什么、缺什么见下方
            <Link to={{ pathname: location.pathname, search: location.search, hash: '#techtree' }}>科技树</Link>。
          </p>
          {!core && <p role="status">正在加载兵种与科技…</p>}
          <KitUnits label="独特单位" hint="本文明专属" lines={uniqueUnits} buildings={core?.buildings ?? null} testId="civ-unique-units" />
          {uniqueTechs.length > 0 && (
            <div className="civ-kit-group" data-testid="civ-unique-techs">
              <p className="civ-group-title">
                <b>独特科技</b>
                <span>本文明专属</span>
              </p>
              {uniqueTechs.map((item) => (
                <Link className="kit-row" key={item.tech.id} to={`/tech/${item.tech.id}`}>
                  <span className="kit-icons">
                    <TechIcon t={item.tech} />
                  </span>
                  <span className="kit-meta">
                    <span className="kit-name">{item.zh}</span>
                    <span className="kit-sub">
                      <EmNum text={item.tech.desc || item.rest} />
                    </span>
                  </span>
                  <span className="kit-age">{AGE_ZH[item.tech.age] ?? ''}</span>
                </Link>
              ))}
            </div>
          )}
          <KitUnits label="区域单位" hint="与本文明加成或独特科技有关" lines={regional} buildings={core?.buildings ?? null} testId="civ-regional-units" />
          <CivUniqueBuildings civ={c.en} buildings={core?.buildings ?? null} />
          <CivRegionalBuildings civ={c.en} buildings={core?.buildings ?? null} />
        </section>
      </div>
      <Suspense fallback={<TechTreePending />}>
        <TechTree civEn={c.en} />
      </Suspense>
      {insights.length > 0 && <InsightSlot items={insights} />}
      <ArenaCastleGold en={c.en} />
      <NomadReveal en={c.en} />
      <section className="civ-more" id="more" data-testid="civ-more">
        <p className="civ-continue" data-testid="civ-related-tools">
          <span className="civ-continue-lab">用这个文明继续：</span>
          {tools.map(([id, to, label]) => (
            <Link key={id} data-testid={id} to={to}>
              {label}
            </Link>
          ))}
        </p>
        <p className="civ-kicker">其他资料</p>
        <h2>历史与更新</h2>
        <p className="note">本页不展示能力评分、团战位置和开局短句。这些仍留在数据里，不作为打法或排名推荐。</p>
        <Fold key={`${c.en}-history`} title="文明历史摘要" wanted={false}>
          <CivHistory civ={c.en} />
        </Fold>
        <Fold key={`${c.en}-patches-${historyOpen ? 'open' : 'shut'}`} id="patches" title="更新历史" wanted={historyOpen} testId="civ-patches">
          <PatchHistory hostedHeading target={{ targetType: 'civ', targetId: c.en, targetNameZh: c.zh }} />
        </Fold>
        <DetailSource note="加成、单位与科技来自当前数据目录" />
      </section>
    </CivBackground>
  );
}
