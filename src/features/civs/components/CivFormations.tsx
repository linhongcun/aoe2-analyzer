import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { civFormationContent } from '../../../data/civFormations';
import { DATA_PATCH } from '../../../data/sources';
import { AGE_ZH } from '../../../domain/ratings';
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
import {
  FormationConditionBranches,
  FormationCost,
  FormationDecisionText,
  FormationFold,
  FormationRoutes,
  FormationText,
  renderFormationAgeProgression,
  renderFormationConditionalGroups,
} from './FormationPresentation';
import { FormationDetail, FormationEvidence, HistoricalEntities, StatusBadges, Version } from './FormationRouteDetails';
import { formationAnchor, useFormationNavigation } from './useFormationNavigation';
import './civ-formations.css';

export { FormationText };

type Route = CivFormationContent['routes'][number];
type RememberEntity = (event: MouseEvent<HTMLAnchorElement>, route: string, to: string) => void;

function EntityLine({
  row,
  civ,
  anchor,
  id,
  remember,
  showAge,
}: {
  row: FormationEntityView;
  civ: string;
  anchor: string;
  id: string;
  remember: RememberEntity;
  showAge: boolean;
}) {
  const to = `/${row.kind}/${row.entity.id}?civ=${encodeURIComponent(civ)}`;
  const link = (
    <Link id={id} className="formation-entity" to={to} onClick={(event) => remember(event, anchor, to)}>
      {row.kind === 'unit' && <UnitIcon u={row.entity} />}
      {row.kind === 'building' && <BuildingIcon b={row.entity} />}
      {row.kind === 'tech' && <TechIcon t={row.entity} />}
      <span>
        <b>
          <FormationText text={row.entity.zh} />
        </b>
        <small>
          <FormationText text={row.role} />
          {showAge && (
            <>
              {' '}
              · <span className="formation-age">{AGE_ZH[row.age]}</span>
            </>
          )}
        </small>
      </span>
    </Link>
  );
  if (row.kind !== 'unit' || !row.research) return link;

  const { tech, effect, caveat, decision, optional, trainingPrice } = row.research;
  const researchTo = `/tech/${tech.id}?civ=${encodeURIComponent(civ)}`;
  const label = optional ? '可选科技' : tech.type === 'UniqueTech' ? '独特科技' : '科技';
  const standaloneEffect = optional || trainingPrice || decision;
  const effectLine = decision ? (
    <FormationDecisionText action={effect} decision={decision} />
  ) : (
    <p className="formation-research-effect">
      <FormationText text={effect} />
    </p>
  );
  return (
    <div className="formation-research">
      {standaloneEffect ? (
        link
      ) : (
        <div className="formation-research-unit">
          {link}
          {effectLine}
        </div>
      )}
      <Link id={`${id}-research-${tech.id}`} className="formation-entity" to={researchTo} onClick={(event) => remember(event, anchor, researchTo)}>
        <TechIcon t={tech} />
        <span>
          <b>{tech.zh}</b> <span className="formation-meta">{label}</span>
          <small>
            {AGE_ZH[tech.age]} · {tech.bz}
            {optional && '研究'}
          </small>
          <span className="formation-research-cost">
            <span>{trainingPrice ? '一次性研究' : '研究投入'}</span>
            <FormationCost cost={tech.cost} />
            <span className="num nw">{tech.rt} 游戏秒</span>
          </span>
        </span>
      </Link>
      {trainingPrice && (
        <div className="formation-training-price">
          <h5>训练单价（每名{row.entity.zh}）</h5>
          <dl>
            <div>
              <dt>研究前</dt>
              <dd>
                <FormationCost cost={trainingPrice.before} showZero />
              </dd>
            </div>
            <div>
              <dt>研究后</dt>
              <dd>
                <FormationCost cost={trainingPrice.after} showZero />
              </dd>
            </div>
          </dl>
        </div>
      )}
      {standaloneEffect && effectLine}
      {caveat && (
        <p className="formation-research-note formation-meta">
          <FormationText text={caveat} />
        </p>
      )}
    </div>
  );
}

function FormationCard({ view, civ, remember, grouped = false }: { view: FormationView; civ: string; remember: RememberEntity; grouped?: boolean }) {
  if (view.status === 'draft') return null;
  if (view.status === 'unverified') {
    const anchor = formationAnchor(view.id);
    return (
      <article className="formation-card formation-warning">
        <h3 id={anchor} tabIndex={-1}>
          路线依据待核实
        </h3>
        <p>
          <FormationText text={view.pendingText} />
        </p>
        {view.source?.boundary && (
          <p>
            <FormationText text={view.source.boundary} />
          </p>
        )}
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
            <FormationText text={`${route.title}：暂不可用`} />
          </h3>
          <StatusBadges route={route} grouped={grouped} />
        </div>
        <p>必需单位、建筑或科技的资料在各自时代不可用。核对完成前不作为有效建议。</p>
        <FormationFold id={`${anchor}-sources`} label="来源与核对" closeLabel={grouped ? '收起来源与核对' : undefined}>
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
            <FormationText text={`${route.title}：版本待复核`} />
          </h3>
          <StatusBadges route={route} grouped={grouped} />
        </div>
        <p>
          原核对版本 <Version patch={route.patch} /> · 本站 <Version patch={DATA_PATCH} />
        </p>
        <p>这份说明暂不作为当前版本推荐，不自动替换兵种。</p>
        <FormationFold id={`${anchor}-history`} label="查看历史说明（非当前推荐）">
          <p>
            <FormationText text={route.condition} />
          </p>
          <HistoricalEntities route={route} />
          {route.reason && (
            <p>
              <FormationText text={route.reason} />
            </p>
          )}
          {route.limitation && (
            <p>
              <FormationText text={route.limitation} />
            </p>
          )}
          <FormationDetail route={route} adjustments={route.adjustments ?? []} />
          <FormationEvidence route={route} source={source} />
        </FormationFold>
      </article>
    );

  const seenEntities = new Map<string, number>();
  const entityLine = (row: FormationEntityView, showAge = true) => {
    const key = `${row.kind}-${row.entity.id}`;
    const occurrence = seenEntities.get(key) ?? 0;
    seenEntities.set(key, occurrence + 1);
    const id = `${anchor}-${key}${occurrence ? `-repeat-${occurrence}` : ''}`;
    return <EntityLine row={row} civ={civ} anchor={anchor} id={id} remember={remember} showAge={showAge} />;
  };
  const heading = (
    <>
      <div className="formation-card-heading">
        <h3 id={anchor} tabIndex={-1}>
          <FormationText text={route.title} />
        </h3>
        <StatusBadges route={route} grouped={grouped} />
      </div>
      <p className="formation-condition">
        <b>适用条件</b> <FormationText text={route.condition} />
      </p>
    </>
  );
  const conditionBranches = view.conditionBranches && <FormationConditionBranches id={`${anchor}-conditional-branches`} branches={view.conditionBranches} />;
  if (route.presentation === 'age-progression') {
    const continuations = view.supplements.filter((group) => group.mode === 'progression').flatMap((group) => group.entities);
    const opponentSupport = view.supplements.filter((group) => group.mode === 'conditional-evaluation');
    const support = view.supplements.filter((group) => group.mode !== 'progression' && group.mode !== 'conditional-evaluation');
    return (
      <article className="formation-card">
        {heading}
        {renderFormationAgeProgression(view.required, continuations, entityLine)}
        {route.reason && (
          <p className="formation-age-note">
            <FormationText text={route.reason} />
          </p>
        )}
        {support.length > 0 && (
          <section className="formation-expanded-group">
            <h4>条件支援与转型</h4>
            {renderFormationConditionalGroups(support, entityLine)}
          </section>
        )}
        <FormationDetail
          route={route}
          adjustments={view.adjustments}
          support={opponentSupport.length > 0 && renderFormationConditionalGroups(opponentSupport, entityLine)}
        />
        {conditionBranches}
        <section className="formation-expanded-group">
          <h4>来源与核对</h4>
          <FormationEvidence route={route} source={source} />
        </section>
      </article>
    );
  }
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

  const separateSupport = route.presentation === 'separate-support';
  const prerequisites = view.prerequisites.filter(
    (item) => item.kind !== 'tech' || !view.required.some((row) => row.kind === 'unit' && row.research?.tech.id === item.entity.id),
  );
  const renderSupplements = () =>
    view.supplements.length > 0 && (
      <div className="formation-supplements">
        {view.supplements.map((group, index) => (
          <div className="formation-supplement-group" key={`${group.mode}-${index}`}>
            <h4 className="formation-group-label">
              <FormationText text={group.label ?? supplementLabel(group.mode)} />
            </h4>
            {group.condition && (
              <p>
                <FormationText text={group.condition} />
              </p>
            )}
            <ul className="formation-entities">
              {group.entities.map((row) => (
                <li key={`${row.kind}-${row.entity.id}`}>{entityLine(row)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );

  return (
    <article className="formation-card">
      {heading}
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
              <h4 className="formation-group-label">{route.choiceLabel ?? '备选分支（按条件择一，不同时必出）'}</h4>
              {view.choices.map((choice) => (
                <section className="formation-choice" key={choice.id}>
                  <h4>
                    <FormationText text={choice.title} />
                  </h4>
                  <ul className="formation-entities">
                    {choice.entities.map((row) => (
                      <li key={`${row.kind}-${row.entity.id}`}>{entityLine(row)}</li>
                    ))}
                  </ul>
                  <p>
                    <FormationText text={choice.preconditions.join('；')} />
                  </p>
                </section>
              ))}
            </div>
          )}
          {prerequisites.length > 0 && (
            <div className="formation-prerequisites">
              <h4 className="formation-group-label">路线前置条件</h4>
              <ul className="formation-entities">
                {prerequisites.map((row) => (
                  <li key={`${row.kind}-${row.entity.id}`}>{entityLine(row)}</li>
                ))}
              </ul>
              {route.prerequisites.map(
                (item) =>
                  item.condition && (
                    <p key={`${item.kind}-${item.id}`}>
                      <FormationText text={item.condition} />
                    </p>
                  ),
              )}
            </div>
          )}
          {!separateSupport && renderSupplements()}
        </div>
        <div className="formation-analysis">
          {separateSupport && renderSupplements()}
          {(route.reason || route.limitation) && (
            <div className="formation-grid">
              {route.reason && (
                <p>
                  <b>为什么这样配</b> <FormationText text={route.reason} />
                </p>
              )}
              {route.limitation && (
                <p className="formation-limitation">
                  <b>主要短板</b> <FormationText text={route.limitation} />
                </p>
              )}
            </div>
          )}
          <FormationDetail route={route} adjustments={view.adjustments} />
        </div>
      </div>
      {conditionBranches}
      <FormationFold id={`${anchor}-sources`} label="来源与核对" closeLabel={grouped ? '收起来源与核对' : undefined}>
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
  const { search } = useLocation();
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
          <p>
            <FormationText text={content.lead} />
          </p>
          <p className="formation-meta">
            核对数据 <Version patch={DATA_PATCH} />
          </p>
          <FormationRoutes
            groups={content.routeGroups}
            routes={routes}
            renderCard={(id, view, grouped) => <FormationCard key={id} view={view} civ={civ} remember={remember} grouped={grouped} />}
          />
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
