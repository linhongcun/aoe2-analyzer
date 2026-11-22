import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search } from '../../../domain/search';
import { SEARCH_QUICK_SECTIONS, sectionOf } from '../../../shared/nav/sections';
import { img } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { useSearchIndex } from '../hooks';

const KIND = { page: '页面', build: '开局', civ: '文明', unit: '单位', tech: '科技', building: '建筑', bonus: '加成', term: '术语' } as const;

/** Ctrl/Cmd+K 全局命令面板 */
export default function CommandPalette({
  open,
  onClose,
  initialQuery,
}: {
  open: boolean;
  onClose: () => void;
  /** 懒加载期间已输入的文字，挂载时作为初始查询（issue 280） */
  initialQuery?: string;
}) {
  const idx = useSearchIndex();
  const [q, setQ] = useState(initialQuery ?? '');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const nav = useNavigate();
  if (!open) return null;
  const trimmed = q.trim();
  const isEmptyQuery = !trimmed;
  const res = isEmptyQuery ? [] : search(idx, q);
  const optionCount = isEmptyQuery ? SEARCH_QUICK_SECTIONS.length : res.length;
  const activeOptionId = sel >= 0 && sel < optionCount ? `${listId}-option-${sel}` : undefined;
  const go = (i: number) => {
    const href = isEmptyQuery ? SEARCH_QUICK_SECTIONS[i]?.path : res[i]?.href;
    if (href) {
      nav(href);
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
            aria-activedescendant={activeOptionId}
            value={q}
            placeholder="搜索文明、单位、科技、术语、页面、开局"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (optionCount > 0) setSel((s) => Math.max(0, Math.min(optionCount - 1, s + 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (optionCount > 0) setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') go(sel);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id={listId} className="cmdk-list" role="listbox" aria-label="搜索结果">
          {isEmptyQuery ? (
            <>
              <li className="cmdk-sec" role="presentation">
                常用工具直达
              </li>
              {SEARCH_QUICK_SECTIONS.map((s, i) => (
                <li
                  key={`quick-${s.key}`}
                  id={`${listId}-option-${i}`}
                  role="option"
                  aria-selected={i === sel}
                  className={i === sel ? 'on' : undefined}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(i)}
                >
                  <span className="cmdk-ph">
                    <Icon name={s.icon} />
                  </span>
                  <span className="cmdk-t">
                    <b>{s.label}</b> <small>{s.en}</small>
                    <br />
                    <small className="note">{s.desc}</small>
                  </span>
                  <span className="tag">{s.lane === 'wiki' ? '百科' : '工具'}</span>
                  {i === sel && <Icon name="enter" />}
                </li>
              ))}
            </>
          ) : (
            <>
              {res.map((r, i) => {
                const pageIcon = r.kind === 'page' ? sectionOf(r.href.split('?')[0] ?? r.href)?.icon : undefined;
                return (
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
                        <Icon name={pageIcon ?? 'arrow-right'} />
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
                );
              })}
              {trimmed && !res.length && (
                <li className="note" role="presentation">
                  无匹配结果
                </li>
              )}
            </>
          )}
        </ul>
        <div className="cmdk-foot">
          <span>输入中文、英文或拼音实时搜索全站</span>
          <span className="cmdk-foot-keys">
            <Icon name="arrow-up-down" />
            选择 · Enter 打开 · Esc 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
