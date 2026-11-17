import { useId, useMemo, useRef, useState } from 'react';
import { BUILD_ALIASES, TECH_AKA, UNIT_ALIASES } from '../../data/aliases';
import type { CivUpdatesData, UpdateEntity } from '../../domain/civUpdates';
import { HISTORY_ADVANCED, HISTORY_FILTERS, HISTORY_LABELS, HISTORY_TYPES, availableReaderFilters, historyOptions, type HistoryFilter } from '../../domain/historyReader';
import type { UnitEventView } from '../../domain/unitUpdates';
import { norm } from '../../domain/search';
import { UpdateText } from '../../shared/ui/CivUpdatePrimitives';

function searchText(entity: UpdateEntity) {
  const id = Number(entity.catalogId);
  const aliases =
    entity.status !== 'current'
      ? []
      : entity.type === 'unit'
        ? UNIT_ALIASES[id]
        : entity.type === 'tech'
          ? TECH_AKA[id]
          : entity.type === 'building'
            ? BUILD_ALIASES[entity.catalogId]
            : [];
  return [entity.nameZh, entity.nameEn ?? '', entity.catalogId, entity.id, ...entity.aliases, ...(aliases ?? [])];
}

export function ObjectPicker({ entities, choose }: { entities: UpdateEntity[]; choose: (e: UpdateEntity) => void }) {
  const [type, setType] = useState<UpdateEntity['type'] | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const text = norm(query);
  const options = useMemo(
    () =>
      entities
        .filter((entity) => type === 'all' || type === entity.type)
        .flatMap((entity) => {
          if (!text) return [{ entity, rank: 0 }];
          const labels = searchText(entity).map(norm);
          const rank = labels.includes(text) ? 3 : labels.some((label) => label.startsWith(text)) ? 2 :
            labels.some((label) => label.includes(text)) ? 1 : 0;
          return rank ? [{ entity, rank }] : [];
        })
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 24),
    [entities, text, type],
  );
  const select = (entity: UpdateEntity) => {
    setOpen(false);
    setQuery('');
    choose(entity);
  };
  const active = options[index]?.entity;
  const opened = open && options.length > 0;
  return (
    <div
      className="history-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={uid}>查找历史对象</label>
      <div className="history-controls">
        <select
          aria-label="对象类型"
          value={type}
          onChange={(e) => {
            setType(e.target.value as typeof type);
            setIndex(0);
            setOpen(true);
            input.current?.focus();
          }}
        >
          <option value="all">全部类型</option>
          {Object.entries(HISTORY_TYPES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <input
          id={uid}
          ref={input}
          role="combobox"
          autoComplete="off"
          placeholder="名称、别名或编号"
          aria-expanded={opened}
          aria-controls={opened ? uid + '-list' : undefined}
          aria-autocomplete="list"
          aria-activedescendant={opened && active ? uid + '-' + index : undefined}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              return;
            }
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length) {
              e.preventDefault();
              const next = !opened
                ? e.key === 'ArrowDown'
                  ? 0
                  : options.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
              setOpen(true);
              setIndex(next);
              requestAnimationFrame(() => document.getElementById(uid + '-' + next)?.scrollIntoView({ block: 'nearest' }));
            }
            if (e.key === 'Enter' && opened && active && !e.nativeEvent.isComposing) {
              e.preventDefault();
              select(active);
            }
          }}
        />
      </div>
      {opened && (
        <ul id={uid + '-list'} className="history-options" role="listbox" aria-label="历史对象搜索结果">
          {options.map(({ entity }, i) => (
            <li
              id={uid + '-' + i}
              key={entity.id}
              role="option"
              tabIndex={-1}
              aria-selected={i === index}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse') e.preventDefault();
              }}
              onClick={() => select(entity)}
            >
              <strong>{entity.nameZh}</strong> · {HISTORY_TYPES[entity.type]} · <span className="num nw">{entity.catalogId}</span>
              {entity.status === 'retired' && ' · 退役'}
              {entity.nameEn && <small>{entity.nameEn}</small>}
            </li>
          ))}
        </ul>
      )}
      {open && !options.length && <p role="status">找不到匹配的对象，请更换名称或类型。</p>}
    </div>
  );
}

function FilterSelect({
  data,
  name,
  query,
  apply,
  available,
}: {
  data: CivUpdatesData;
  name: HistoryFilter;
  query: URLSearchParams;
  apply: (q: URLSearchParams) => void;
  available: Set<string>;
}) {
  return (
    <label>
      {HISTORY_LABELS[name]}{' '}
      <select
        value={query.get(name) ?? ''}
        onChange={(e) => {
          const next = new URLSearchParams(query);
          if (e.target.value) next.set(name, e.target.value);
          else next.delete(name);
          apply(next);
        }}
      >
        <option value="">不限</option>
        {historyOptions(data, name).filter(([id]) => available.has(id) || query.get(name) === id).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReaderFilters({ data, views, query, apply }: { data: CivUpdatesData; views: UnitEventView[]; query: URLSearchParams; apply: (q: URLSearchParams) => void }) {
  const values = query.get('histVersion')?.split(',') ?? [];
  const options = useMemo(() => availableReaderFilters(data, views), [data, views]);
  const versions = historyOptions(data, 'histVersion').filter(([id]) => options.histVersion.has(id) || values.includes(id));
  if (values.includes('unknown')) versions.push(['unknown', '仅未登记版本']);
  const base = query.toString();
  const [pending, setPending] = useState<{ base: string; values: URLSearchParams }>();
  const advanced = pending?.base === base ? pending.values : query;
  const [open, setOpen] = useState(false);
  const activeCount = HISTORY_ADVANCED.filter((k) => query.has(k)).length;
  return (
    <div className="history-filter-panel">
      <div className="history-controls">
        <details>
          <summary>
            版本筛选
            {values.length > 0 && (
              <>
                {' '}
                · <span className="num nw">{values.length}</span> 项
              </>
            )}
          </summary>
          <fieldset className="history-versions">
            <legend>可选择多个版本</legend>
            {versions.map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={values.includes(id!)}
                  onChange={(e) => {
                    const next = new URLSearchParams(query);
                    const items = e.target.checked ? [...values, id!] : values.filter((v) => v !== id);
                    if (items.length) next.set('histVersion', items.join(','));
                    else next.delete('histVersion');
                    apply(next);
                  }}
                />{' '}
                <UpdateText>{label!}</UpdateText>
              </label>
            ))}
          </fieldset>
        </details>
        <label>
          排序{' '}
          <select
            value={query.get('histOrder') ?? 'newest'}
            onChange={(e) => {
              const next = new URLSearchParams(query);
              next.set('histOrder', e.target.value);
              apply(next);
            }}
          >
            <option value="newest">新到旧</option>
            <option value="oldest">旧到新</option>
          </select>
        </label>
      </div>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>进阶筛选{activeCount > 0 && <> · <span className="num nw">{activeCount} 项</span></>}</summary>
        <div className="history-controls">
          {HISTORY_ADVANCED.map((k) => (
            <FilterSelect key={k} data={data} name={k} query={advanced} available={options[k]} apply={(values) => setPending({ base, values })} />
          ))}
        </div>
        <div className="history-controls">
          <button type="button" onClick={() => { apply(advanced); setPending(undefined); }}>应用筛选</button>
          <button type="button" onClick={() => {
            const next = new URLSearchParams(query);
            HISTORY_ADVANCED.forEach((k) => next.delete(k));
            setPending({ base, values: next });
          }}>重置进阶项</button>
        </div>
      </details>
      <div className="history-controls" aria-label="当前筛选条件">
        {HISTORY_FILTERS.filter((key) => query.has(key)).map((key) => {
          const options = new Map(historyOptions(data, key));
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(query);
                next.delete(key);
                apply(next);
              }}
            >
              移除{HISTORY_LABELS[key]}：
              <UpdateText>
                {query
                  .get(key)!
                  .split(',')
                  .map((v) => options.get(v) ?? '未登记版本')
                  .join('、')}
              </UpdateText>
            </button>
          );
        })}
      </div>
    </div>
  );
}
