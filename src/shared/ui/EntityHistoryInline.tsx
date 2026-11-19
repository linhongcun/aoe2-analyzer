import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { encyclopediaHistoryPath } from '../../domain/historyReader';
import { SourceTime, UpdateText } from './CivUpdatePrimitives';
import { HistoryReaderLink, savedHistoryVisit } from './HistoryReaderLink';
import { defaultHistoryVersions, type EntityHistoryResource } from './useEntityHistory';
import './entity-history-inline.css';

const UpdateEventCard = lazy(() => import('./CivUpdates').then((module) => ({ default: module.UpdateEventCard })));
const loading = (
  <p role="status" aria-live="polite" aria-busy="true">
    正在加载更新历史…
  </p>
);

function LoadedHistory({ resource, restoreEnabled }: { resource: EntityHistoryResource; restoreEnabled: boolean }) {
  const { data, entity, nodes } = resource;
  const location = useLocation();
  const navigation = useNavigationType();
  const saved = savedHistoryVisit(location);
  const [expanded, setExpanded] = useState<string[]>(() => (navigation === 'POP' && saved?.expanded ? saved.expanded : defaultHistoryVersions(nodes)));
  const id = 'encyclopedia-complete-history';
  useEffect(() => {
    if (!restoreEnabled || navigation !== 'POP' || saved?.focusId !== id) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.focus({ preventScroll: true });
      window.scrollTo(0, saved.y);
    });
    return () => cancelAnimationFrame(frame);
  }, [navigation, restoreEnabled, saved]);
  if (!data || !entity) return null;
  const to = encyclopediaHistoryPath(entity.id, location.pathname, location.search, location.hash);
  const from = new URLSearchParams(to.split('?')[1]).get('histReturn')!;
  const toggle = (key: string) => setExpanded((previous) => (previous.includes(key) ? previous.filter((value) => value !== key) : [...previous, key]));
  return (
    <div className="entity-history-inline" data-testid="entity-history">
      <p className="entity-inline-note">仅展示已收录的变化；历史数值不代表当前机制。</p>
      {nodes.map((node) => {
        const panel = `entity-inline-${entity.id.replace('/', '-')}-${node.id}`;
        return (
          <section key={node.id} data-history-version={node.id}>
            <h3>
              <button type="button" aria-expanded={expanded.includes(node.id)} aria-controls={panel} onClick={() => toggle(node.id)}>
                <span>
                  <UpdateText>{node.version?.label ?? '版本未登记'}</UpdateText>
                </span>
                <SourceTime value={node.version?.releaseDate ?? null} missing="日期未登记" />
                <span>{expanded.includes(node.id) ? '收起' : '展开'}</span>
              </button>
            </h3>
            <div id={panel} hidden={!expanded.includes(node.id)}>
              {node.rows.map((view) => (
                <UpdateEventCard
                  key={view.event.id}
                  data={data}
                  event={view.event}
                  sourceEvent={view.original}
                  inline={{ view, entity, evidenceOpen: expanded.includes(view.event.id), toggleEvidence: () => toggle(view.event.id) }}
                />
              ))}
            </div>
          </section>
        );
      })}
      <HistoryReaderLink to={to} from={from} id={id} expanded={expanded}>
        查看完整历史
      </HistoryReaderLink>
    </div>
  );
}

export function EntityHistoryInline({ resource, restoreEnabled = true }: { resource: EntityHistoryResource; restoreEnabled?: boolean }) {
  if (resource.empty) return null;
  if (resource.error)
    return (
      <div>
        <p role="alert">更新历史加载失败，请重试。</p>
        <button type="button" onClick={resource.retry}>
          重试
        </button>
      </div>
    );
  if (!resource.data) return loading;
  return (
    <Suspense fallback={loading}>
      <LoadedHistory key={resource.entity?.id} resource={resource} restoreEnabled={restoreEnabled} />
    </Suspense>
  );
}
