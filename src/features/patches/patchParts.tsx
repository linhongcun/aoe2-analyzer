import { Link } from 'react-router-dom';
import { civByEn, type Core } from '../../data';
import {
  ARCHIVE_KIND_LABEL,
  ARCHIVE_KINDS,
  PATCH_TYPES,
  patchTarget,
  statedCivIds,
  type ArchiveKind,
  type ObjectCandidate,
  type PatchEntry,
} from '../../domain/patches';
import { parseResourceChange } from '../../domain/resourceValue';
import { BuildingIcon, CivIcon, TechIcon, UnitIcon } from '../../shared/ui/art';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { NumericText } from '../../shared/ui/PatchHistory';
import { ResourceValue } from '../../shared/ui/ResourceValue';

const KIND_ICON: Record<ArchiveKind, IconName> = { new: 'plus', buff: 'arrow-up', nerf: 'arrow-down', adjust: 'info' };

export function civZh(en: string) {
  return civByEn(en)?.zh ?? en;
}

function verificationText(entry: PatchEntry) {
  if (entry.verification === 'official') return '已核对官方原文';
  if (entry.verification === 'conflict' || entry.provenance === 'source-conflict') return '来源冲突，尚未核实';
  if (entry.verification === 'unverified') return '未核实';
  return '既有来源记录，尚未完成逐条原文核对';
}

function ObjectArt({ item, core }: { item: ObjectCandidate; core: Core | null }) {
  if (item.type === 'civ') return <CivIcon c={{ en: item.id }} alt="" />;
  if (item.type === 'unit') {
    const unit = core?.unitById[Number(item.id)];
    if (unit) return <UnitIcon u={unit} />;
  }
  if (item.type === 'tech') {
    const tech = core?.techById[Number(item.id)];
    if (tech) return <TechIcon t={tech} />;
  }
  if (item.type === 'building') {
    const building = core?.buildingById[Number(item.id)];
    if (building) return <BuildingIcon b={building} />;
  }
  return <Icon name="scroll" />;
}

function EntryArt({ entry, core }: { entry: PatchEntry; core: Core | null }) {
  return <ObjectArt item={{ type: entry.targetType as ObjectCandidate['type'], id: String(entry.targetId), zh: entry.targetNameZh, en: '' }} core={core} />;
}

export function EntryBody({ entry, core }: { entry: PatchEntry; core: Core | null }) {
  const kind = ARCHIVE_KINDS.find((item) => item === entry.kind);
  const parsed = parseResourceChange(entry);
  return (
    <>
      <p className="patch-kind">
        {kind && (
          <span className={`patch-mark patch-mark-${kind}`}>
            <Icon name={KIND_ICON[kind]} />
            {ARCHIVE_KIND_LABEL[kind]}
          </span>
        )}
        {entry.changeType === 'fix' && <span className="patch-mark patch-mark-fix">游戏修复</span>}
        <span>{PATCH_TYPES[entry.targetType] ?? entry.targetType}</span>
      </p>
      <h3>
        <Link to={`${patchTarget(entry)}?tab=history`}>
          <EntryArt entry={entry} core={core} />
          {entry.targetNameZh}
        </Link>
      </h3>
      <p>
        <NumericText text={entry.summaryZh} />
      </p>
      {(entry.before !== undefined || entry.after !== undefined) && (
        <div className="patch-values">
          {entry.before !== undefined && (
            <span>
              改动前{' '}
              <b>{parsed?.before ? <ResourceValue segments={parsed.before} other={parsed.after} variant="patch" /> : <NumericText text={entry.before} />}</b>
            </span>
          )}
          {entry.before !== undefined && entry.after !== undefined && <Icon name="arrow-right" />}
          {entry.after !== undefined && (
            <span>
              改动后{' '}
              <b>{parsed?.after ? <ResourceValue segments={parsed.after} other={parsed.before} variant="patch" /> : <NumericText text={entry.after} />}</b>
            </span>
          )}
        </div>
      )}
      {entry.scopeNote && (
        <p className="note">
          适用条件：
          <NumericText text={entry.scopeNote} />
        </p>
      )}
      {statedCivIds(entry).length > 0 && <p className="note">适用文明：{statedCivIds(entry).map(civZh).join('、')}</p>}
      <p className="note">
        <a href={entry.source} target="_blank" rel="noopener noreferrer">
          查看官方来源
        </a>
      </p>
      <p className="note">{verificationText(entry)}</p>
      {entry.originalText && (
        <details className="patch-original">
          <summary>查看官方原文</summary>
          <p lang="en">{entry.originalText}</p>
        </details>
      )}
      <p className="note">历史数值不是当前数值；档案标记不按数值重新判定。</p>
    </>
  );
}
