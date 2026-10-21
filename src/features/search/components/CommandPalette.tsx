import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search } from '../../../domain/search';
import { img } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { useSearchIndex } from '../hooks';

const KIND = { page: '页面', civ: '文明', unit: '单位', tech: '科技', building: '建筑', bonus: '加成', term: '术语' } as const;

/** Ctrl/Cmd+K 全局命令面板 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const idx = useSearchIndex();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const nav = useNavigate();
  if (!open) return null;
  const res = search(idx, q);
  const go = (i: number) => {
    const r = res[i];
    if (r) {
      nav(r.href);
      onClose();
    }
  };
  return (
    <div className="cmdk-mask" onClick={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Tab') {
            // 选项通过 aria-activedescendant 操作，搜索框是弹窗内唯一的 Tab 停靠点。
            e.preventDefault();
            input.current?.focus();
          }
        }}
      >
        <div className="cmdk-in">
          <Icon name="search" />
          <input
            ref={input}
            autoFocus
            role="combobox"
            aria-label="全局搜索"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            aria-activedescendant={res[sel] ? `${listId}-option-${sel}` : undefined}
            value={q}
            placeholder="搜索文明、单位、科技、开局…（中/英）"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.max(0, Math.min(res.length - 1, s + 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') go(sel);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id={listId} className="cmdk-list" role="listbox" aria-label="搜索结果">
          {res.map((r, i) => (
            <li
              key={r.kind + r.id}
              id={`${listId}-option-${i}`}
              role="option"
              aria-selected={i === sel}
              className={i === sel ? 'on' : undefined}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(i)}
            >
              {r.img ? (
                <img src={img(r.img)} alt="" />
              ) : (
                <span className="cmdk-ph">
                  <Icon name="arrow-right" />
                </span>
              )}
              <span className="cmdk-t">
                <b>{r.zh}</b>
                {r.civNote && res.some((o) => o !== r && o.kind === 'unit' && o.zh === r.zh) && <span className="civnote">{r.civNote}</span>}{' '}
                <small>{r.en}</small>
                <br />
                <small className="note">{r.sub}</small>
              </span>
              <span className="tag">{KIND[r.kind]}</span>
              {i === sel && <Icon name="enter" />}
            </li>
          ))}
          {q && !res.length && (
            <li className="note" role="presentation">
              无匹配结果
            </li>
          )}
          {!q && (
            <li className="note" role="presentation">
              输入关键词，方向键选择，Enter 打开
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
