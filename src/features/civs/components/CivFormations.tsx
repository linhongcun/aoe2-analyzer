import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { civFormationContent } from '../../../data/civFormations';
import { DATA_PATCH } from '../../../data/sources';
import {
  approvedFormations,
  currentFormationPatch,
  projectFormation,
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

function EntityLine({ row, civ, anchor, remember }: { row: FormationEntityView; civ: string; anchor: string; remember: RememberEntity }) {
  const to = `/${row.kind}/${row.entity.id}?civ=${encodeURIComponent(civ)}`;
  return (
    <Link id={`${anchor}-${row.kind}-${row.entity.id}`} className="formation-entity" to={to} onClick={(event) => remember(event, anchor, to)}>
      {row.kind === 'unit' && <UnitIcon u={row.entity} />}
      {row.kind === 'building' && <BuildingIcon b={row.entity} />}
      {row.kind === 'tech' && <TechIcon t={row.entity} />}
      <span>
        <b>{row.entity.zh}</b>
        <small>{row.role}</small>
      </span>
    </Link>
  );
}

function FormationDetail({ route, adjustments }: { route: Route; adjustments: { id: string; when: string; text?: string; unavailable?: boolean }[] }) {
  return (
    <>
      <div className="formation-grid">
        <div>
          <h4>进攻怎样配合</h4>
          <p>{route.attack}</p>
        </div>
        <div>
          <h4>防守怎样配合</h4>
          <p>{route.defense}</p>
        </div>
      </div>
      <h4>对手变化时怎样调整</h4>
      <dl className="formation-adjustments">
        {adjustments.map(({ id, when, text, unavailable }) => (
          <div key={id}>
            <dt>{when}</dt>
            <dd>
              {text}
              {unavailable && <span className="formation-meta"> 这项补充资料暂不可用</span>}
            </dd>
          </div>
        ))}
      </dl>
      <h4>为什么不默认加入</h4>
      <p>{route.alternatives}</p>
    </>
  );
}

function FormationEvidence({ route, source }: { route: Route; source: Source }) {
  return (
    <>
      <dl className="formation-evidence">
        <div>
          <dt>认可状态</dt>
          <dd>用户认可此条件方案</dd>
        </div>
        <div>
          <dt>实战使用</dt>
          <dd>尚未说明是否实战使用</dd>
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

function FormationCard({ view, source, civ, remember }: { view: FormationView; source: Source; civ: string; remember: RememberEntity }) {
  const { route } = view;
  const anchor = formationAnchor(route.id);
  if (view.status === 'unavailable')
    return (
      <article className="formation-card formation-warning">
        <h3 id={anchor} tabIndex={-1}>
          {route.title}：暂不可用
        </h3>
        <p>必需单位、建筑或科技的资料缺失，或当前文明不可用。核对完成前不作为有效推荐。</p>
        <TreeLink />
      </article>
    );
  if (view.status === 'historical')
    return (
      <article className="formation-card formation-warning">
        <h3 id={anchor} tabIndex={-1}>
          {route.title}：版本待复核
        </h3>
        <p>
          原核对版本 <Version patch={route.patch} /> · 本站 <Version patch={DATA_PATCH} />
        </p>
        <p>这份说明暂不作为当前版本推荐，不自动替换兵种。</p>
        <FormationFold id={`${anchor}-history`} label="查看历史说明（非当前推荐）">
          <p>{route.condition}</p>
          <ul>
            {[...route.required, ...route.supplements].map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                {row.historicalName} · {row.role}
              </li>
            ))}
          </ul>
          <p>{route.reason}</p>
          <p>{route.limitation}</p>
          <FormationDetail route={route} adjustments={route.adjustments} />
          <FormationEvidence route={route} source={source} />
        </FormationFold>
      </article>
    );

  const entityLine = (row: FormationEntityView) => <EntityLine row={row} civ={civ} anchor={anchor} remember={remember} />;
  return (
    <article className="formation-card">
      <div className="formation-card-heading">
        <h3 id={anchor} tabIndex={-1}>
          {route.title}
        </h3>
        <span className="formation-confidence">讨论认可 · 实战未说明</span>
      </div>
      <p className="formation-condition">
        <b>适合何时用</b> {route.condition}
      </p>
      <div className="formation-grid">
        <div>
          <h4 className="formation-group-label">必需组成与职责</h4>
          <ul className="formation-entities">
            {view.required.map((row) => (
              <li key={`${row.kind}-${row.entity.id}`}>{entityLine(row)}</li>
            ))}
          </ul>
          {route.supplements.length > 0 && (
            <div className="formation-supplements">
              <h4 className="formation-group-label">按需补充，不是固定主力</h4>
              <ul className="formation-entities">
                {route.supplements.map((ref, i) => {
                  const row = view.supplements[i];
                  return <li key={`${ref.kind}-${ref.id}`}>{row ? entityLine(row) : '这项补充资料暂不可用'}</li>;
                })}
              </ul>
            </div>
          )}
        </div>
        <div>
          <p>
            <b>为什么这样配</b> {route.reason}
          </p>
          <p className="formation-limitation">
            <b>主要短板</b> {route.limitation}
          </p>
        </div>
      </div>
      <FormationFold id={`${anchor}-detail`} label="查看攻守与调整" closeLabel="收起攻守与调整">
        <FormationDetail route={route} adjustments={view.adjustments} />
      </FormationFold>
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
  retry,
}: {
  civ: string;
  content?: CivFormationContent;
  routes?: FormationView[];
  error?: boolean;
  pending?: boolean;
  retry?: () => void;
}) {
  const { pathname, search } = useLocation();
  const { root, remember } = useFormationNavigation(civ, pending && !error);
  const [retrying, setRetrying] = useState(false);
  const [retryReady, setRetryReady] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const needsRetry = Boolean(retry && (pending || error));
  useEffect(() => {
    if (pending || !retrying) return;
    setRetrying(false);
    if (!error) {
      setRetryReady(true);
      if (!document.activeElement || document.activeElement === document.body) title.current?.focus({ preventScroll: true });
    }
  }, [error, pending, retrying]);
  const active = routes.find((view) => view.status === 'current');

  return (
    <section className="civ-formations" id="formations" aria-labelledby="formations-title" ref={root}>
      <h2 id="formations-title" ref={title} tabIndex={-1}>
        推荐阵容
      </h2>
      {routes.length > 0 && content && (
        <>
          <p>{content.lead}</p>
          {active && (
            <p className="formation-meta">
              核对数据 <Version patch={DATA_PATCH} /> · 内容修订 <span className="num nw">{active.route.revised}</span> · 用户认可，尚未说明是否实战使用
            </p>
          )}
          {routes.length > 1 && (
            <nav className="formation-jumps" aria-label="阵容路线">
              {routes.map(({ route }) => (
                <Link key={route.id} to={{ pathname, search, hash: `#${formationAnchor(route.id)}` }} state={{ focusFormation: true }}>
                  {route.title}
                </Link>
              ))}
            </nav>
          )}
          <div className="formation-list">
            {routes.map((view) => (
              <FormationCard key={view.route.id} view={view} source={content.source} civ={civ} remember={remember} />
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
                setRetryReady(false);
                setRetrying(true);
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

export function CivFormations({ civ, resources }: { civ: string; resources: CoreTreesResources }) {
  const content = civFormationContent.find((entry) => entry.civ === civ);
  const routes = approvedFormations(content);
  if (!content || !routes.some((route) => currentFormationPatch(route.patch, DATA_PATCH))) {
    return <FormationSection civ={civ} content={content} routes={routes.map((route) => projectFormation(route, civ, DATA_PATCH))} />;
  }
  const { core, trees, retry } = resources;
  const catalog = core.data && trees.data ? { core: core.data, trees: trees.data } : undefined;
  const visible = routes
    .filter((route) => catalog || !currentFormationPatch(route.patch, DATA_PATCH))
    .map((route) => projectFormation(route, civ, DATA_PATCH, catalog, routes));
  const error = core.error || trees.error;
  return <FormationSection civ={civ} content={content} routes={visible} pending={!error && (core.pending || trees.pending)} error={error} retry={retry} />;
}
