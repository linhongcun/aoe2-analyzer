import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search } from '../../../domain/search';
import { img } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { useSearchIndex } from '../hooks';

const KIND = { page: '页面', civ: '文明', unit: '单位', tech: '科技' } as const;

/** Ctrl/Cmd+K 全局命令面板 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const idx = useSearchIndex();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
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
      <div className="cmdk" role="dialog" aria-label="全局搜索" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-in">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            placeholder="搜索文明、单位、科技…（中/英）"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(res.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') go(sel);
              else if (e.key === 'Escape') onClose();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="cmdk-list">
          {res.map((r, i) => (
            <li key={r.kind + r.id} className={i === sel ? 'on' : undefined} onMouseEnter={() => setSel(i)} onClick={() => go(i)}>
              {r.img ? (
                <img src={img(r.img)} alt="" />
              ) : (
                <span className="cmdk-ph">
                  <Icon name="arrow-right" />
                </span>
              )}
              <span className="cmdk-t">
                <b>{r.zh}</b> <small>{r.en}</small>
                <br />
                <small className="note">{r.sub}</small>
              </span>
              <span className="tag">{KIND[r.kind]}</span>
              {i === sel && <Icon name="enter" />}
            </li>
          ))}
          {q && !res.length && <li className="note">无匹配结果</li>}
          {!q && <li className="note">输入关键词，方向键选择，Enter 打开</li>}
        </ul>
      </div>
    </div>
  );
}
