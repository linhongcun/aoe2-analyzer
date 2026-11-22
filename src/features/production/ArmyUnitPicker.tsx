import { useMemo, useRef, useState } from 'react';
import type { Unit } from '../../domain/types';
import { unitQueryMatches } from '../../domain/unitFilters';
import { cleanBuildingName, sortUnitFamilies, unitEntryMatchKind } from '../../domain/unitOrder';
import { UnitIcon } from '../../shared/ui/art';

export function ArmyUnitPicker({ units, civ, onSelect, onClose }: { units: Unit[]; civ?: string; onSelect: (u: Unit) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const ordered = useMemo(
    () =>
      sortUnitFamilies(
        units.map((u) => ({ u })),
        { civ },
      ),
    [units, civ],
  );
  const matches = useMemo(() => ordered.filter((entry) => unitQueryMatches(entry.u, query)), [ordered, query]);
  return (
    <div
      className="army-picker"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[data-unit-option]') ?? [])];
          if (!buttons.length) return;
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const index = e.key === 'ArrowDown' ? (current + 1) % buttons.length : current <= 0 ? buttons.length - 1 : current - 1;
          buttons[index]?.focus();
        }
      }}
    >
      <label>
        搜索兵种
        <input
          id="army-unit-search"
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              e.preventDefault();
              onSelect(matches[0].u);
            }
          }}
        />
      </label>
      <div className="army-picker-options">
        {matches.map((entry) => (
          <button type="button" className="btn" data-unit-option key={entry.u.id} onClick={() => onSelect(entry.u)}>
            <UnitIcon u={entry.u} />
            <span>
              {entry.u.zh} · {cleanBuildingName(entry.u.bz)}
            </span>
            {unitEntryMatchKind(entry, query) === 'py' && <span className="up-badge up-badge-py">拼音命中</span>}
          </button>
        ))}
        {!matches.length && (
          <p className="note" role="status">
            没有匹配的兵种，请修改关键词。
          </p>
        )}
      </div>
      <button type="button" className="btn" onClick={onClose}>
        取消选择
      </button>
    </div>
  );
}
