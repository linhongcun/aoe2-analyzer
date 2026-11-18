import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { civFormationContent } from '../../../data/civFormations';
import { DATA_PATCH } from '../../../data/sources';
import {
  currentFormationPatch,
  projectFormation,
  publishedFormations,
  type CivFormationContent,
  type FormationEntityView,
  type FormationView,
} from '../../../domain/civFormations';
import { BuildingIcon, TechIcon, UnitIcon } from '../../../shared/ui/art';
import type { CoreTreesResources } from '../../../shared/utils/useCoreTrees';
import { formationAnchor, useFormationNavigation } from './useFormationNavigation';
import './civ-formations.css';

type Source = CivFormationContent['source'];
type Route = CivFormationContent['routes'][number];
type RememberEntity = (event: MouseEvent<HTMLAnchorElement>, route: string, to: string) => void;

function Version({ patch }: { patch: Route['patch'] }) {
  return (
    <>
      <span className="num nw">DE {patch.build}</span> <span className="num nw">（{patch.date}）</span>
    </>
  );
}

function FormationFold({ id, label, closeLabel, children }: { id: string; label: string; closeLabel?: string; children: ReactNode }) {
  return (
    <details id={id} className="formation-fold" data-formation-fold>
      <summary>
        {closeLabel ? (
          <>
            <span className="formation-fold-closed">{label}</span>
            <span className="formation-fold-open">{closeLabel}</span>
          </>
        ) : (
          label
        )}
      </summary>
      <div className="formation-fold-body">{children}</div>
    </details>
  );
}

function EntityLine({ row, civ, anchor, id, remember }: { row: FormationEntityView; civ: string; anchor: string; id: string; remember: RememberEntity }) {
  const to = `/${row.kind}/${row.entity.id}?civ=${encodeURIComponent(civ)}`;
  return (
    <Link id={id} className="formation-entity" to={to} onClick={(event) => remember(event, anchor, to)}>
      {row.kind === 'unit' && <UnitIcon u={row.entity} />}
      {row.kind === 'building' && <BuildingIcon b={row.entity} />}
      {row.kind === 'tech' && <TechIcon t={row.entity} />}
      <span>
        <b>{row.entity.zh}</b>
        <small>
          {row.role} · <span className="formation-age">{row.age === 3 ? '城堡时代' : '帝王时代'}</span>
        </small>
      </span>
    </Link>
  );
}

function StatusBadges({ route }: { route: Route }) {
  const recognition = route.status === 'candidate' ? '限定候选' : '讨论认可';
  const playtest = route.playtest === 'reported' ? '用户报告用过' : route.playtest === 'pending' ? '待实战验证' : '实战未说明';
  return (
    <div className="formation-status" aria-label="路线状态">
      <span className={route.status === 'candidate' ? 'formation-status-candidate' : ''}>{recognition}</span>
      <span>{playtest}</span>
    </div>
  );
}

function FormationDetail({
  route,
  adjustments,
}: {
  route: Route;
  adjustments: { id: string; when: string; text?: string; unavailable?: boolean; candidateBoundary?: string }[];
}) {
  const hasDetails = route.attack || route.defense || adjustments.length > 0 || route.alternatives;
  if (!hasDetails) return null;
  return (
    <FormationFold id={`${formationAnchor(route.id)}-detail`} label="查看攻守与调整" closeLabel="收起攻守与调整">
      {route.attack && (
        <div>
          <h4>进攻怎样配合</h4>
          <p>{route.attack}</p>
        </div>
      )}
      {route.defense && (
        <div>
          <h4>防守怎样配合</h4>
          <p>{route.defense}</p>
        </div>
      )}
      {adjustments.length > 0 && (
        <>
          <h4>对手变化时怎样调整</h4>
          <dl className="formation-adjustments">
            {adjustments.map(({ id, when, text, unavailable, candidateBoundary }) => (
              <div key={id}>
                <dt>{when}</dt>
                <dd>
                  {text}
                  {candidateBoundary && <span className="formation-meta"> 候选边界：{candidateBoundary}</span>}
                  {unavailable && <span className="formation-meta"> 这项补充资料暂不可用</span>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {route.alternatives && (
        <>
          <h4>为什么不默认加入</h4>
          <p>{route.alternatives}</p>
        </>
      )}
    </FormationFold>
  );
}

function SourceLinks({ source }: { source: Source | null }) {
  if (!source) return <p className="formation-meta">来源链接暂不可用。</p>;
  return (
    <>
      <p>{source.boundary}</p>
      <div className="formation-source-links">
        <a href={source.content} target="_blank" rel="noreferrer">
          查看固定内容来源
        </a>
        <a href={source.discussion} target="_blank" rel="noreferrer">
          原讨论
        </a>
      </div>
    </>
  );
}

function FormationEvidence({ route, source }: { route: Route; source: Source | null }) {
  return (
    <>
      <dl className="formation-evidence">
        <div>
          <dt>认可状态</dt>
          <dd>{route.evidence.recognition}</dd>
        </div>
        <div>
          <dt>实战使用</dt>
          <dd>{route.evidence.playtest}</dd>
        </div>
        <div>
          <dt>依据范围</dt>
          <dd>{route.evidence.scope}</dd>
        </div>
        <div>
          <dt>记录时版本</dt>
          <dd>{route.evidence.recordedVersion}</dd>
        </div>
        <div>
          <dt>核对数据</dt>
          <dd>
            <Version patch={route.patch} />
          </dd>
        </div>
        <div>
          <dt>内容修订</dt>
          <dd>
            <time className="num nw" dateTime={route.revised}>
              {route.revised}
            </time>
          </dd>
        </div>
      </dl>
      <SourceLinks source={source} />
    </>
  );
}

function HistoricalEntities({ route }: { route: Route }) {
  return (
    <>
      <h4>原记录组成（非当前推荐）</h4>
      <ul>
        {[
          ...route.required,
          ...route.prerequisites,
          ...(route.choices ?? []).flatMap((choice) => choice.entities),
          ...route.supplements.flatMap((group) => group.entities),
        ].map((row, index) => (
          <li key={`${row.kind}-${row.id}-${index}`}>
            {row.historicalName} · {row.role}
            {row.age ? `（${row.age === 3 ? '城堡时代' : '帝王时代'}）` : ''}
          </li>
        ))}
      </ul>
    </>
  );
}

function FormationCard({ view, civ, remember }: { view: FormationView; civ: string; remember: RememberEntity }) {
  if (view.status === 'draft') return null;
  if (view.status === 'unverified') {
    const anchor = formationAnchor(view.id);
    return (
      <article className="formation-card formation-warning">
        <h3 id={anchor} tabIndex={-1}>
          路线依据待核实
        </h3>
        <p>{view.pendingText}</p>
        <p>{view.source?.boundary}</p>
        <div className="formation-source-links">
          {view.source && (
            <>
              <a href={view.source.content} target="_blank" rel="noreferrer">
                查看来源
              </a>
              <a href={view.source.discussion} target="_blank" rel="noreferrer">
                原讨论
              </a>
            </>
          )}
        </div>
      </article>
    );
  }

  const { route, source } = view;
  const anchor = formationAnchor(route.id);
  if (view.status === 'unavailable')
    return (
      <article className="formation-card formation-warning">
        <div className="formation-card-heading">
          <h3 id={anchor} tabIndex={-1}>
            {route.title}：暂不可用
          </h3>
          <StatusBadges route={route} />
        </div>
        <p>必需单位、建筑或科技的资料在各自时代不可用。核对完成前不作为有效建议。</p>
        <FormationFold id={`${anchor}-sources`} label="来源与核对">
          <FormationEvidence route={route} source={source} />
        </FormationFold>
        <TreeLink />
      </article>
    );
  if (view.status === 'historical')
    return (
      <article className="formation-card formation-warning">
        <div className="formation-card-heading">
          <h3 id={anchor} tabIndex={-1}>
            {route.title}：版本待复核
          </h3>
          <StatusBadges route={route} />
        </div>
        <p>
          原核对版本 <Version patch={route.patch} /> · 本站 <Version patch={DATA_PATCH} />
        </p>
        <p>这份说明暂不作为当前版本推荐，不自动替换兵种。</p>
        <FormationFold id={`${anchor}-history`} label="查看历史说明（非当前推荐）">
          <p>{route.condition}</p>
          <HistoricalEntities route={route} />
          {route.reason && <p>{route.reason}</p>}
          {route.limitation && <p>{route.limitation}</p>}
          <FormationDetail route={route} adjustments={route.adjustments ?? []} />
          <FormationEvidence route={route} source={source} />
        </FormationFold>
      </article>
    );

  const seenEntities = new Map<string, number>();
  const entityLine = (row: FormationEntityView) => {
    const key = `${row.kind}-${row.entity.id}`;
    const occurrence = seenEntities.get(key) ?? 0;
    seenEntities.set(key, occurrence + 1);
    const id = `${anchor}-${key}${occurrence ? `-repeat-${occurrence}` : ''}`;
    return <EntityLine row={row} civ={civ} anchor={anchor} id={id} remember={remember} />;
  };
  const requiredLabel =
    route.status === 'candidate'
      ? '局部选择'
      : route.composition === 'choice'
        ? '局部选择（按条件择一）'
        : route.composition === 'progression'
          ? '先后阶段组成'
          : '共同组成';
  const supplementLabel = (mode: Route['supplements'][number]['mode']) =>
    mode === 'choice'
      ? '按需择一'
      : mode === 'replace'
        ? '按需替换'
        : mode === 'progression'
          ? '可选阶段延续'
          : mode === 'mechanism-support' || mode === 'mechanism-only'
            ? '机制支持（非必需主力）'
            : mode === 'continuation-adjustment'
              ? '延续调整'
              : mode === 'production-alternative'
                ? '产能备选'
                : mode === 'upgrade'
                  ? '升级支持'
                  : mode === 'position-variant'
                    ? '位置变体（按条件）'
                    : mode === 'conditional' || mode === 'conditional-evaluation'
                      ? '条件补充'
                      : mode === 'support'
                        ? '按需支援'
                        : '按需补充，不是固定主力';

  return (
    <article className="formation-card">
      <div className="formation-card-heading">
        <h3 id={anchor} tabIndex={-1}>
          {route.title}
        </h3>
        <StatusBadges route={route} />
      </div>
      <p className="formation-condition">
        <b>适用条件</b> {route.condition}
      </p>
      <div className="formation-columns">
        <div className="formation-composition">
          {route.required.length > 0 && (
            <div>
              <h4 className="formation-group-label">{requiredLabel}</h4>
              <ul className="formation-entities">
                {view.required.map((row) => (
                  <li key={`${row.kind}-${row.entity.id}`}>{entityLine(row)}</li>
                ))}
              </ul>
            </div>
          )}
          {view.choices.length > 0 && (
            <div className="formation-choices">
              <h4 className="formation-group-label">备选分支（按条件择一，不同时必出）</h4>
              {view.choices.map((choice) => (
                <section className="formation-choice" key={choice.id}>
                  <h4>{choice.title}</h4>
                  <ul className="formation-entities">
                    {choice.entities.map((row) => (
                      <li key={`${row.kind}-${row.entity.id}`}>{entityLine(row)}</li>
                    ))}
                  </ul>
                  <p>{choice.preconditions.join('；')}</p>
                </section>
              ))}
            </div>
          )}
          {view.prerequisites.length > 0 && (
            <div className="formation-prerequisites">
              <h4 className="formation-group-label">路线前置条件</h4>
              <ul className="formation-entities">
                {view.prerequisites.map((row) => (
                  <li key={`${row.kind}-${row.entity.id}`}>{entityLine(row)}</li>
                ))}
              </ul>
              {route.prerequisites.map((item) => item.condition && <p key={`${item.kind}-${item.id}`}>{item.condition}</p>)}
            </div>
          )}
          {view.supplements.length > 0 && (
            <div className="formation-supplements">
              {view.supplements.map((group, index) => (
                <div className="formation-supplement-group" key={`${group.mode}-${index}`}>
                  <h4 className="formation-group-label">{supplementLabel(group.mode)}</h4>
                  {group.condition && <p>{group.condition}</p>}
                  <ul className="formation-entities">
                    {group.entities.map((row) => (
                      <li key={`${row.kind}-${row.entity.id}`}>{entityLine(row)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="formation-analysis">
          {(route.reason || route.limitation) && (
            <div className="formation-grid">
              {route.reason && (
                <p>
                  <b>为什么这样配</b> {route.reason}
                </p>
              )}
              {route.limitation && (
                <p className="formation-limitation">
                  <b>主要短板</b> {route.limitation}
                </p>
              )}
            </div>
          )}
          <FormationDetail route={route} adjustments={view.adjustments} />
        </div>
      </div>
      <FormationFold id={`${anchor}-sources`} label="来源与核对">
        <FormationEvidence route={route} source={source} />
      </FormationFold>
    </article>
  );
}

function TreeLink() {
  const { search } = useLocation();
  return <Link to={{ search, hash: '#techtree' }}>查看科技树</Link>;
}

function FormationSection({
  civ,
  content,
  routes = [],
  error = false,
  pending = false,
  suppressRestore = false,
  retry,
}: {
  civ: string;
  content?: CivFormationContent;
  routes?: FormationView[];
  error?: boolean;
  pending?: boolean;
  suppressRestore?: boolean;
  retry?: () => void;
}) {
  const { pathname, search } = useLocation();
  const { root, remember } = useFormationNavigation(civ, pending && !error, suppressRestore);
  const [requestedRetry, setRequestedRetry] = useState(false);
  const retrying = requestedRetry && pending;
  const retryReady = requestedRetry && !pending && !error;
  const title = useRef<HTMLHeadingElement>(null);
  const needsRetry = Boolean(retry && (pending || error));
  useEffect(() => {
    if (retryReady && document.activeElement === document.body) title.current?.focus({ preventScroll: true });
  }, [retryReady]);
  return (
    <section className="civ-formations" id="formations" aria-labelledby="formations-title" ref={root}>
      <h2 id="formations-title" ref={title} tabIndex={-1}>
        推荐阵容
      </h2>
      {routes.length > 0 && content && (
        <>
          <p>{content.lead}</p>
          <p className="formation-meta">
            核对数据 <Version patch={DATA_PATCH} />
          </p>
          {routes.length > 1 && (
            <nav className="formation-jumps" aria-label="阵容路线">
              {routes.map((view) => {
                const label = view.status === 'unverified' ? '路线依据待核实' : view.status === 'draft' ? '' : view.route.title;
                return label ? (
                  <Link
                    key={view.status === 'unverified' ? view.id : view.status === 'draft' ? 'draft' : view.route.id}
                    to={{
                      pathname,
                      search,
                      hash: `#${formationAnchor(view.status === 'unverified' ? view.id : view.status === 'draft' ? '' : view.route.id)}`,
                    }}
                    state={{ focusFormation: true }}
                  >
                    {label}
                  </Link>
                ) : null;
              })}
            </nav>
          )}
          <div className="formation-list">
            {routes.map((view) => (
              <FormationCard
                key={view.status === 'unverified' ? view.id : view.status === 'draft' ? 'draft' : view.route.id}
                view={view}
                civ={civ}
                remember={remember}
              />
            ))}
          </div>
        </>
      )}
      {needsRetry && (
        <div className="formation-card">
          {pending ? (
            <p role="status">正在读取推荐阵容… 文明资料与科技树仍可继续查看。</p>
          ) : (
            <div role="alert">
              <h3>推荐阵容读取失败</h3>
              <p>未能读取本页阵容，请重试。此状态不表示没有已整理内容。</p>
            </div>
          )}
          {(error || retrying) && (
            <button
              type="button"
              aria-disabled={!error}
              onClick={() => {
                if (!error) return;
                setRequestedRetry(true);
                retry?.();
              }}
            >
              {pending ? '正在重试…' : '重试'}
            </button>
          )}{' '}
          <TreeLink />
        </div>
      )}
      {!needsRetry && routes.length === 0 && (
        <div className="formation-card">
          <h3>暂无已整理阵容</h3>
          <p>这个文明尚未纳入当前整理范围。你仍可查看科技树和现有工具。</p>
          <div className="formation-source-links">
            <TreeLink />
            <Link to={{ search, hash: '#more' }}>查看现有工具</Link>
          </div>
        </div>
      )}
      <span role="status" className="formation-meta">
        {retryReady ? '推荐阵容已读取' : ''}
      </span>
    </section>
  );
}

export function CivFormations({ civ, resources, suppressRestore = false }: { civ: string; resources: CoreTreesResources; suppressRestore?: boolean }) {
  const content = civFormationContent.find((entry) => entry.civ === civ);
  const routes = publishedFormations(content);
  const needsCatalog = routes.some((route) => route.status !== 'unverified' && currentFormationPatch(route.patch, DATA_PATCH));
  if (!content || !needsCatalog) {
    return (
      <FormationSection
        civ={civ}
        content={content}
        routes={routes.map((route) => projectFormation(route, civ, DATA_PATCH, undefined, routes, content?.source))}
        suppressRestore={suppressRestore}
      />
    );
  }
  const { core, trees, retry } = resources;
  const catalog = core.data && trees.data ? { core: core.data, trees: trees.data } : undefined;
  const visible = routes.filter((route) => route.status === 'unverified' || catalog || !currentFormationPatch(route.patch, DATA_PATCH));
  const error = core.error || trees.error;
  return (
    <FormationSection
      civ={civ}
      content={content}
      routes={visible.map((route) => projectFormation(route, civ, DATA_PATCH, catalog, routes, content.source))}
      pending={!error && (core.pending || trees.pending)}
      error={error}
      retry={retry}
      suppressRestore={suppressRestore}
    />
  );
}
