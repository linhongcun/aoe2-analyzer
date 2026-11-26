import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { civFormationContent } from '../../../data/civFormations';
import { DATA_PATCH } from '../../../data/sources';
import { dedupeFormationClauses, type DedupedRouteText } from '../../../domain/formationDedup';
import { isAgeProgressionSupplement } from '../../../domain/formationPartition.mjs';
import { formationEntityDomId } from '../../../domain/formationScenarios';
import {
  currentFormationPatch,
  projectFormation,
  publishedFormations,
  type CivFormationContent,
  type FormationEntityView,
  type FormationView,
} from '../../../domain/civFormations';
import type { CoreTreesResources } from '../../../shared/utils/useCoreTrees';
import { FormationEntityLine, type RememberEntity } from './FormationEntityLine';
import { FormationFold, FormationText, SharedFormationNotice, renderFormationAgeProgression } from './FormationPresentation';
import { FormationEvidence, FormationTacticsFold, HistoricalFormationDetail, StatusBadges, Version } from './FormationRouteDetails';
import { FormationRouteTabs, formationPanelId, formationTabId, formationViewId } from './FormationRouteTabs';
import { FormationScenarios } from './FormationScenarios';
import { formationAnchor, formationIdFromHash, useFormationNavigation } from './useFormationNavigation';
import './civ-formations.css';

export { FormationText };

type VisibleFormationView = Exclude<FormationView, { status: 'draft' }>;

function TreeLink() {
  const { search } = useLocation();
  return <Link to={{ search, hash: '#techtree' }}>查看科技树</Link>;
}

function ActiveFormationPanel({
  view,
  civ,
  remember,
  multiRoute,
  grouped,
  deduped,
  openScenarioId,
  onChangeScenario,
}: {
  view: VisibleFormationView;
  civ: string;
  remember: RememberEntity;
  multiRoute: boolean;
  grouped: boolean;
  deduped?: DedupedRouteText;
  openScenarioId: string | null;
  onChangeScenario: (id: string | null) => void;
}) {
  const id = formationViewId(view);
  const anchor = formationAnchor(id);
  const panelProps = multiRoute ? { id: formationPanelId(id), role: 'tabpanel' as const, 'aria-labelledby': formationTabId(id) } : {};

  if (view.status === 'unverified') {
    return (
      <article className="formation-card formation-warning" {...panelProps}>
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
  if (view.status === 'unavailable') {
    return (
      <article className="formation-card formation-warning" {...panelProps}>
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
  }

  if (view.status === 'historical') {
    return (
      <article className="formation-card formation-warning" {...panelProps}>
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
          <HistoricalFormationDetail route={route} source={source} />
        </FormationFold>
      </article>
    );
  }

  const coreEntityLine = (row: FormationEntityView, showAge = true) => (
    <FormationEntityLine
      row={row}
      civ={civ}
      routeId={route.id}
      scenarioId={null}
      id={formationEntityDomId(anchor, row, null)}
      remember={remember}
      showAge={showAge}
    />
  );

  const scenarioEntityLine = (row: FormationEntityView, scenarioId: string) => (
    <FormationEntityLine
      row={row}
      civ={civ}
      routeId={route.id}
      scenarioId={scenarioId}
      id={formationEntityDomId(anchor, row, scenarioId)}
      remember={remember}
      showAge
    />
  );

  const heading = (
    <header className="formation-route-head">
      <div className="formation-card-heading">
        <h3 id={anchor} tabIndex={-1}>
          <FormationText text={route.title} />
        </h3>
        <StatusBadges route={route} grouped={grouped} />
      </div>
      <p className="formation-condition">
        <b>适用条件</b> <FormationText text={route.condition} />
      </p>
    </header>
  );

  const reasonText = deduped ? deduped.reason : route.reason;
  const limitationText = deduped ? deduped.limitation : route.limitation;

  const bottomFolds = (
    <div className="formation-bottom-folds">
      <FormationTacticsFold route={route} />
      <FormationFold id={`${anchor}-sources`} label="来源与核对" closeLabel={grouped ? '收起来源与核对' : undefined}>
        <FormationEvidence route={route} source={source} links={view.evidenceLinks} />
      </FormationFold>
    </div>
  );

  if (route.presentation === 'age-progression') {
    const continuations = view.supplements.filter((group) => isAgeProgressionSupplement(route, group)).flatMap((group) => group.entities);
    return (
      <article className="formation-card" {...panelProps}>
        {heading}
        {renderFormationAgeProgression(view.required, continuations, coreEntityLine)}
        {reasonText && (
          <p className="formation-age-note">
            <FormationText text={reasonText} />
          </p>
        )}
        <FormationScenarios
          anchor={anchor}
          scenarios={view.scenarios}
          openId={openScenarioId}
          onChangeOpen={onChangeScenario}
          renderEntity={scenarioEntityLine}
        />
        {bottomFolds}
      </article>
    );
  }

  const requiredLabel =
    route.status === 'candidate'
      ? '局部选择'
      : route.composition === 'progression'
        ? '先后阶段组成'
        : route.composition === 'choice'
          ? '必出侧翼核心'
          : '必出核心';

  const prerequisites = view.prerequisites.filter(
    (item) => item.kind !== 'tech' || !view.required.some((row) => row.kind === 'unit' && row.research?.tech.id === item.entity.id),
  );

  return (
    <article className="formation-card" {...panelProps}>
      {heading}
      <div className="formation-columns">
        <div className="formation-composition">
          {view.required.length > 0 && (
            <div className="formation-core-block">
              <h4 className="formation-group-label">{requiredLabel}</h4>
              <ul className="formation-entities">
                {view.required.map((row) => (
                  <li key={`${row.kind}-${row.entity.id}-${row.rawOccurrence ?? 0}`}>{coreEntityLine(row)}</li>
                ))}
              </ul>
            </div>
          )}
          {view.choices.length > 0 && (
            <div className="formation-choices">
              <h4 className="formation-group-label">{route.choiceLabel ?? '备选分支（按条件择一，不同时必出）'}</h4>
              {view.choices.map((choice) => (
                <section className="formation-choice" key={choice.id}>
                  <h5>
                    <FormationText text={choice.title} />
                  </h5>
                  <ul className="formation-entities">
                    {choice.entities.map((row) => (
                      <li key={`${row.kind}-${row.entity.id}-${row.rawOccurrence ?? 0}`}>{coreEntityLine(row)}</li>
                    ))}
                  </ul>
                  <p className="formation-choice-pre">
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
                  <li key={`${row.kind}-${row.entity.id}-${row.rawOccurrence ?? 0}`}>{coreEntityLine(row)}</li>
                ))}
              </ul>
              {route.prerequisites.map(
                (item) =>
                  item.condition && (
                    <p key={`${item.kind}-${item.id}`} className="formation-meta">
                      <FormationText text={item.condition} />
                    </p>
                  ),
              )}
            </div>
          )}
        </div>

        <div className="formation-analysis">
          {reasonText && (
            <section className="formation-analysis-card">
              <h4>为什么这样配</h4>
              <p>
                <FormationText text={reasonText} />
              </p>
            </section>
          )}
          {limitationText && (
            <section className="formation-analysis-card formation-limitation">
              <h4>主轴共性短板</h4>
              <p>
                <FormationText text={limitationText} />
              </p>
            </section>
          )}
        </div>
      </div>

      <FormationScenarios
        anchor={anchor}
        scenarios={view.scenarios}
        openId={openScenarioId}
        onChangeOpen={onChangeScenario}
        renderEntity={scenarioEntityLine}
      />
      {bottomFolds}
    </article>
  );
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
  const { search, hash } = useLocation();
  const visibleViews = useMemo(() => routes.filter((view): view is VisibleFormationView => view.status !== 'draft'), [routes]);
  const visibleIds = useMemo(() => visibleViews.map(formationViewId), [visibleViews]);
  const hashRouteId = formationIdFromHash(hash);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(() => hashRouteId);
  const [openScenarioId, setOpenScenarioId] = useState<string | null>(null);

  const activeRouteId =
    selectedRouteId && visibleIds.includes(selectedRouteId)
      ? selectedRouteId
      : hashRouteId && visibleIds.includes(hashRouteId)
        ? hashRouteId
        : (visibleIds[0] ?? null);

  const handleRestoreTarget = useCallback((target: { routeId: string | null; scenarioId: string | null }) => {
    if (target.routeId) setSelectedRouteId(target.routeId);
    setOpenScenarioId(target.scenarioId);
  }, []);

  const { root, remember, switchRouteHash } = useFormationNavigation({
    civ,
    views: visibleViews,
    blocked: pending || error,
    suppressRestore,
    activeRouteId,
    openScenarioId,
    onRestoreTarget: handleRestoreTarget,
  });

  const [requestedRetry, setRequestedRetry] = useState(false);
  const retrying = requestedRetry && pending;
  const retryReady = requestedRetry && !pending && !error;
  const title = useRef<HTMLHeadingElement>(null);
  const needsRetry = Boolean(retry && (pending || error));
  const dedup = useMemo(() => dedupeFormationClauses(routes), [routes]);

  useEffect(() => {
    if (retryReady && document.activeElement === document.body) title.current?.focus({ preventScroll: true });
  }, [retryReady]);

  const activeView = activeRouteId ? (visibleViews.find((view) => formationViewId(view) === activeRouteId) ?? visibleViews[0]) : undefined;
  const groupedIds = useMemo(() => new Set(content?.routeGroups?.flatMap((g) => g.routes.map((r) => r.id)) ?? []), [content?.routeGroups]);

  function handleSelectRoute(nextId: string) {
    setSelectedRouteId(nextId);
    setOpenScenarioId(null);
    switchRouteHash(nextId);
  }

  return (
    <section className="civ-formations" id="formations" aria-labelledby="formations-title" ref={root}>
      <div className="formation-section-head">
        <h2 id="formations-title" ref={title} tabIndex={-1}>
          推荐阵容
        </h2>
        {visibleViews.length > 0 && content && (
          <p className="formation-meta">
            核对数据 <Version patch={DATA_PATCH} />
          </p>
        )}
      </div>
      {visibleViews.length > 0 && content && (
        <>
          <p className="formation-lead">
            <FormationText text={content.lead} />
          </p>
          <SharedFormationNotice items={dedup.shared} />
          <FormationRouteTabs views={visibleViews} groups={content.routeGroups} activeId={activeRouteId ?? ''} onSelect={handleSelectRoute} />
          {activeView && (
            <ActiveFormationPanel
              key={formationViewId(activeView)}
              view={activeView}
              civ={civ}
              remember={remember}
              multiRoute={visibleViews.length > 1}
              grouped={groupedIds.has(formationViewId(activeView))}
              deduped={activeView.status === 'current' ? dedup.byRouteId[activeView.route.id] : undefined}
              openScenarioId={openScenarioId}
              onChangeScenario={setOpenScenarioId}
            />
          )}
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
      {!needsRetry && visibleViews.length === 0 && (
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
  const content = useMemo(() => civFormationContent.find((entry) => entry.civ === civ), [civ]);
  const routes = useMemo(() => publishedFormations(content), [content]);
  const needsCatalog = useMemo(() => routes.some((route) => route.status !== 'unverified' && currentFormationPatch(route.patch, DATA_PATCH)), [routes]);
  const { core, trees, retry } = resources;
  const catalog = useMemo(() => (core.data && trees.data ? { core: core.data, trees: trees.data } : undefined), [core.data, trees.data]);
  const projected = useMemo(() => {
    if (!content || !needsCatalog) {
      return routes.map((route) => projectFormation(route, civ, DATA_PATCH, undefined, routes, content?.source));
    }
    const visible = routes.filter((route) => route.status === 'unverified' || catalog || !currentFormationPatch(route.patch, DATA_PATCH));
    return visible.map((route) => projectFormation(route, civ, DATA_PATCH, catalog, routes, content.source));
  }, [catalog, civ, content, needsCatalog, routes]);

  if (!content || !needsCatalog) {
    return <FormationSection civ={civ} content={content} routes={projected} suppressRestore={suppressRestore} />;
  }
  const error = core.error || trees.error;
  return (
    <FormationSection
      civ={civ}
      content={content}
      routes={projected}
      pending={!error && (core.pending || trees.pending)}
      error={error}
      retry={retry}
      suppressRestore={suppressRestore}
    />
  );
}
