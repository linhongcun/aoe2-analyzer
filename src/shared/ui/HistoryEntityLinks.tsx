import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { validHistoryReturn, type CivUpdateEvent, type CivUpdatesData } from '../../domain/civUpdates';
import { TECH_FILTER_KEYS, techHistoryPath } from '../../domain/techUpdates';

/** Traverse explicit shared evidence only. Return state is one validated layer. */
export function HistoryEntityLinks({ data, event, sourceEntityId }: { data: CivUpdatesData; event: CivUpdateEvent; sourceEntityId?: string }) {
  const location = useLocation();
  const [query] = useSearchParams();
  const backQuery = new URLSearchParams(query);
  backQuery.delete('histReturn');
  backQuery.set('histEvent', event.id);
  const back = validHistoryReturn(location.pathname + '?' + backQuery.toString(), data);
  const effectIds = new Set(event.claims.flatMap((c) => c.effects.map((f) => f.id)));
  const relations = [...(data.techs?.relations ?? []), ...(data.units?.relations ?? []), ...(data.buildings?.relations ?? [])];
  const ids = new Set(relations.filter((r) => r.eventId === event.id && r.effectIds.some((id) => effectIds.has(id))).map((r) => r.entityId));
  for (const claim of event.claims) for (const effect of claim.effects) for (const ref of effect.entityRefs) if ('entityId' in ref) ids.add(ref.entityId);
  for (const relation of event.civRelations) ids.add('civ/' + relation.civId);
  const targets = data.entities.filter((e) => e.id !== sourceEntityId && ids.has(e.id) && (e.type === 'tech' || e.status === 'current'));
  if (!targets.length) return null;
  return (
    <nav className="unit-history-actions" aria-label="相关实体历史">
      <p>仅沿本条证据关联；相关效果不自动成为目标的基础属性。文明页仅携带其支持的搜索、版本、核验和排序，完整条件保留在返回地址。</p>
      {targets.map((entity) => {
        const next = new URLSearchParams();
        for (const key of ['histQuery', ...TECH_FILTER_KEYS])
          if (query.getAll(key).length === 1 && (entity.type !== 'civ' || ['histQuery', 'histVersion', 'histVerification', 'histOrder'].includes(key)))
            next.set(key, query.get(key)!);
        if (event.versionId && !next.has('histVersion')) next.set('histVersion', event.versionId);
        next.set('histEvent', event.id);
        if (back) next.set('histReturn', back);
        if (entity.type === 'tech')
          return (
            <Link key={entity.id} to={techHistoryPath(data, entity.id, next, entity.status === 'current' ? 'detail' : 'overview', back ?? undefined)}>
              查看{entity.nameZh}科技历史{entity.status === 'retired' ? '（退役身份）' : ''}
            </Link>
          );
        if (!entity.linkPath) return null;
        next.set('tab', 'history');
        return (
          <Link key={entity.id} to={entity.linkPath + '?' + next.toString()}>
            查看{entity.nameZh}
            {{ unit: '单位', building: '建筑', civ: '文明' }[entity.type]}历史
          </Link>
        );
      })}
    </nav>
  );
}
