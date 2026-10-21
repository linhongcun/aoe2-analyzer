import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DATA_SOURCES } from '../utils/dataInfo';
import { Icon } from './Icon';
import { StatIcon } from './art';

export interface DetailStat {
  key: string;
  label: string;
  value: ReactNode;
  icon?: string;
  accent?: boolean;
  change?: number;
  lowerIsBetter?: boolean;
  note?: ReactNode;
  /** 评分只作辅助图形；数值始终以文字呈现。 */
  score?: number;
}

export function StatTiles({ stats, label = '关键属性' }: { stats: DetailStat[]; label?: string }) {
  if (!stats.length) return null;
  return (
    <section className="detail-stats-region" aria-label={label}>
      <dl className="detail-stats">
        {stats.map((s) => (
          <div key={s.key} className={`detail-stat${s.accent ? ' is-key' : ''}`} data-stat={s.key}>
            <dt>
              {s.icon && <StatIcon k={s.icon} t={s.label} />}
              {s.label}
            </dt>
            <dd>
              <span className="detail-stat-value" data-t="stat-value">
                {s.value}
              </span>
              {s.change != null && s.change !== 0 && (
                <span
                  className={`detail-stat-change ${(s.lowerIsBetter ? s.change < 0 : s.change > 0) ? 'g' : 'r'}`}
                  data-t="stat-delta"
                  aria-label={`相对普通版变化 ${s.change > 0 ? '+' : ''}${s.change}`}
                >
                  {s.change > 0 ? '+' : ''}
                  {Math.round(s.change * 100) / 100}
                </span>
              )}
            </dd>
            {s.score != null && (
              <span className="detail-score-track" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(10, s.score)) * 10}%` }} />
              </span>
            )}
            {s.note && <div className="detail-stat-note">{s.note}</div>}
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DetailSection({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`detail-section ${className}`} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function DetailSource({ note = '基础数值，未含文明加成与科技' }: { note?: string }) {
  return (
    <p className="detail-source note">
      来源：aoe2techtree{DATA_SOURCES.patch ? ` · DE ${DATA_SOURCES.patch.build}` : ''} · {note} · <Link to="/about-data">数据说明</Link>
    </p>
  );
}

export function CopyPageLink() {
  const loc = useLocation();
  const [state, setState] = useState<'idle' | 'copied' | 'fallback'>('idle');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    let url = window.location.href;
    try {
      const { sharePageUrl } = await import('../../domain/sharePage');
      url = sharePageUrl(loc.pathname, loc.search, document.baseURI);
      await navigator.clipboard.writeText(url);
      setState('copied');
      timer.current = setTimeout(() => setState('idle'), 2000);
    } catch {
      setFallbackUrl(url);
      setState('fallback');
    }
  };
  return (
    <div className="detail-copy">
      <button type="button" className="detail-copy-button" aria-label="复制链接" onClick={copy}>
        <Icon name={state === 'copied' ? 'check' : 'copy'} />
        <span role="status">{state === 'copied' ? '链接已复制' : '复制链接'}</span>
      </button>
      {state === 'fallback' && (
        <label className="detail-copy-fallback">
          请复制页面链接
          <input readOnly value={fallbackUrl} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}
