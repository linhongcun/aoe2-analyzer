import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { civByEn, civs, type Core } from '../../data';
import type { PatchArchive } from '../../domain/patchHistory';
import {
  ARCHIVE_KIND_LABEL,
  ARCHIVE_KINDS,
  PATCH_TYPES,
  patchTarget,
  searchObjects,
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

export const OBJECT_LABEL = { unit: '单位', building: '建筑', tech: '科技', civ: '文明' } as const;
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

function objectCandidates(core: Core | null, archives: readonly PatchArchive[]): ObjectCandidate[] {
  const items: ObjectCandidate[] = civs.map((civ) => ({ type: 'civ', id: civ.en, zh: civ.zh, en: civ.en }));
  const seen = new Set(items.map((item) => `${item.type}:${item.id}`));
  const add = (item: ObjectCandidate) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };
  if (core) {
    for (const unit of core.units) add({ type: 'unit', id: String(unit.id), zh: unit.zh, en: unit.en });
    for (const building of core.buildings) add({ type: 'building', id: String(building.id), zh: building.zh, en: building.en });
    for (const tech of core.techs) add({ type: 'tech', id: String(tech.id), zh: tech.zh, en: tech.en });
  }
  for (const archive of archives) {
    for (const target of archive.archivedTargets ?? []) {
      if (target.targetType !== 'unit' && target.targetType !== 'building' && target.targetType !== 'tech' && target.targetType !== 'civ') continue;
      add({ type: target.targetType, id: String(target.targetId), zh: target.targetNameZh, en: target.nameEn ?? '' });
    }
  }
  return items;
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

export function ObjectSearch({ archives, core }: { archives: readonly PatchArchive[]; core: Core | null }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const items = useMemo(() => objectCandidates(core, archives), [core, archives]);
  const result = searchObjects(query, items);
  const choose = (item: ObjectCandidate) => {
    setOpen(false);
    navigate({ pathname: '/patches', search: `?obj=${item.type}:${encodeURIComponent(item.id)}` });
  };
  return (
    <div
      className="patch-search"
      data-testid="patch-object-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <label>
        查找对象
        <input
          role="combobox"
          aria-label="查找对象"
          aria-expanded={open}
          aria-controls="patch-object-options"
          aria-autocomplete="list"
          placeholder="文明、单位、建筑或科技"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.max(0, Math.min(result.shown.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
            }
            if (event.key === 'Enter' && open && result.shown[active]) {
              event.preventDefault();
              choose(result.shown[active]!);
            }
          }}
        />
      </label>
      {open && query.trim() && (
        <div id="patch-object-options" role="listbox" aria-label="对象">
          {!core && <p role="status">正在加载单位、建筑和科技目录</p>}
          {result.total > 20 && (
            <p role="status">
              仅列出前 <span className="num nw">20</span> 条（共 <span className="num nw">{result.total}</span> 条），请输入更完整的名称。
            </p>
          )}
          {result.shown.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === active}
              className={index === active ? 'active' : undefined}
              key={`${item.type}:${item.id}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <ObjectArt item={item} core={core} />
              <span>{item.zh}</span>
              <small>
                {OBJECT_LABEL[item.type]}
                {item.en ? ` ${item.en}` : ''}
              </small>
            </button>
          ))}
          {core && result.total === 0 && <p role="status">没有匹配的对象</p>}
        </div>
      )}
    </div>
  );
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
