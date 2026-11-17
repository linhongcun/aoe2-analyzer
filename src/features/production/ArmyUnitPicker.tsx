import { useRef, useState } from 'react';
import type { Unit } from '../../domain/types';

export function ArmyUnitPicker({ units, onSelect, onClose }: { units: Unit[]; onSelect: (u: Unit) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const matches = units.filter((u) => `${u.zh} ${u.en} ${u.py ?? ''} ${u.pyi ?? ''}`.toLowerCase().includes(query.toLowerCase()));
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
              onSelect(matches[0]);
            }
          }}
        />
      </label>
      <div className="army-picker-options">
        {matches.map((u) => (
          <button type="button" className="btn" data-unit-option key={u.id} onClick={() => onSelect(u)}>
            {u.zh} · {u.bz.replace(/\n/g, '')}
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
