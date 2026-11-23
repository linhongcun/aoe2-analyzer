import type { CivUpdatesData } from '../../domain/civUpdates';
import type { UnitEventView } from '../../domain/unitUpdates';
import { UpdateEventCard } from './CivUpdates';
import { SourceTime, UpdateText } from './CivUpdatePrimitives';
import { HistoryEntityLinks } from './HistoryEntityLinks';
import './unit-updates.css';

export function VersionEvents({
  data,
  rows,
  anchorPrefix = 'hist-',
  context,
}: {
  data: CivUpdatesData;
  rows: UnitEventView[];
  anchorPrefix?: string;
  context?: (row: UnitEventView) => React.ReactNode;
}) {
  const groups = new Map<string | null, UnitEventView[]>();
  rows.forEach((row) => groups.set(row.event.versionId, [...(groups.get(row.event.versionId) ?? []), row]));
  return [...groups].map(([versionId, views]) => {
    const version = data.versions.find((v) => v.id === versionId);
    return (
      <section className="civ-update-version" key={versionId ?? 'unknown'} aria-label={version?.label ?? '未登记版本'}>
        <div className="civ-update-version-heading">
          <h3>
            <UpdateText>{version?.label ?? '未登记版本'}</UpdateText>
          </h3>
          <span className="civ-update-pill">
            {version?.channel ? { release: '正式', pup: 'PUP', hotfix: '热修', unknown: '版本类别待核' }[version.channel] : '版本类别待核'}
          </span>
          <span>
            发行日期：
            <SourceTime value={version?.releaseDate ?? null} />
          </span>
        </div>
        {version && (
          <p className="note">
            {version.orderReason ??
              (version.build !== null
                ? '按来源明示的 build 排序；日期和版本类别未登记时保持未知。'
                : version.orderKey
                  ? '按已登记版本顺序；不是采集时间或推测发布日期。'
                  : '版本无法比较，列在可排序版本之后。')}
          </p>
        )}
        {views.map(({ event, original, relations }) => (
          <div key={event.id}>
            {relations.some((r) => r.relation !== 'direct') && (
              <p className="civ-update-warning">
                {relations
                  .filter((r) => r.relation !== 'direct')
                  .map((r) => r.note)
                  .join('；')}
              </p>
            )}
            <UpdateEventCard data={data} event={event} sourceEvent={original} anchorId={anchorPrefix + event.id} />
            {context?.({ event, original, relations, unknownScope: false })}
            {!context && <HistoryEntityLinks data={data} event={event} />}
          </div>
        ))}
      </section>
    );
  });
}
