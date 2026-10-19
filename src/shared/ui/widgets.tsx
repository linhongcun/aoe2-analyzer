import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Civ } from '../../domain/types';
import { AXES } from '../../domain/ratings';
import { DLCS } from '../../domain/dlc';
import { linkify } from '../../domain/linker';
import { useCore } from '../../data/hooks';
import { civs } from '../../data';
import { DlcImg } from './art';
import { Icon } from './Icon';

/** 自动链接单位/科技名称；nl=true 时把换行渲染为 <br> */
export function Linked({ text, nl }: { text: string; nl?: boolean }) {
  const core = useCore();
  const segs = core ? linkify(text, core.linker) : [{ text }];
  const br = (s: string) =>
    nl
      ? s.split('\n').map((p, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {p}
          </Fragment>
        ))
      : s;
  return (
    <>
      {segs.map((s, i) =>
        s.href ? (
          <Link key={i} className={s.kind === 'tech' ? 'ulink tl' : 'ulink'} to={'/' + s.href}>
            {s.text}
          </Link>
        ) : (
          <Fragment key={i}>{br(s.text)}</Fragment>
        ),
      )}
    </>
  );
}

/** 以 Lucide chevron 分隔的开局步骤 */
export function Steps({ s }: { s: string }) {
  return (
    <>
      {s.split('->').map((x, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="sep">
              <Icon name="chevron-right" />
            </span>
          )}
          {x.trim()}
        </Fragment>
      ))}
    </>
  );
}
export function Sep() {
  return (
    <span className="sep">
      <Icon name="chevron-right" />
    </span>
  );
}
export function Join({ items, sep }: { items: ReactNode[]; sep: ReactNode }) {
  return (
    <>
      {items.map((x, i) => (
        <Fragment key={i}>
          {i > 0 && sep}
          {x}
        </Fragment>
      ))}
    </>
  );
}

/** 8 轴能力雷达图（canvas）；canvas 不认 var()，颜色从设计令牌读取 */
export function Radar({ list, id }: { list: Civ[]; id?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const x = cv?.getContext('2d');
    if (!cv || !x) return;
    const draw = () => {
      const css = getComputedStyle(cv);
      const tok = (name: string) => css.getPropertyValue(name).trim();
      const COL = [tok('--color-accent'), tok('--color-link')];
      const W = cv.width,
        H = cv.height,
        cx = W / 2,
        cy = H / 2,
        R = Math.min(W, H) / 2 - 40,
        n = AXES.length;
      const ang = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
      x.clearRect(0, 0, W, H);
      x.font = '13px sans-serif';
      for (let r = 1; r <= 5; r++) {
        x.beginPath();
        for (let i = 0; i <= n; i++) {
          const p = (R * r) / 5;
          x.lineTo(cx + p * Math.cos(ang(i)), cy + p * Math.sin(ang(i)));
        }
        x.strokeStyle = tok('--color-border');
        x.stroke();
      }
      AXES.forEach((l, i) => {
        const a = ang(i);
        x.beginPath();
        x.moveTo(cx, cy);
        x.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
        x.stroke();
        x.fillStyle = tok('--color-text');
        x.textAlign = 'center';
        x.fillText(l, cx + (R + 22) * Math.cos(a), cy + (R + 18) * Math.sin(a) + 4);
      });
      list.forEach((c, k) => {
        x.beginPath();
        c.s.forEach((s, i) => x.lineTo(cx + ((R * s) / 10) * Math.cos(ang(i)), cy + ((R * s) / 10) * Math.sin(ang(i))));
        x.closePath();
        x.globalAlpha = 0.3;
        x.fillStyle = COL[k]!;
        x.fill();
        x.globalAlpha = 1;
        x.strokeStyle = COL[k]!;
        x.lineWidth = 2;
        x.stroke();
        x.lineWidth = 1;
      });
    };
    draw();
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => theme.disconnect();
  }, [list]);
  return <canvas id={id} ref={ref} width={440} height={440} />;
}

/** 团战位置适配（边位/口袋）横条 */
export function PosBox({ list }: { list: Civ[] }) {
  const cl = ['var(--c-gold)', 'var(--c-blue)'];
  const row = (n: string, k: 'fl' | 'pk') => (
    <div className="prow">
      <span className="plab">{n}</span>
      <div className="pbars">
        {list.map((c, j) => (
          <div className="pbar" key={c.en + j}>
            <div style={{ width: `${c[k] * 10}%`, background: cl[j] }} />
            <b>
              {list.length > 1 ? c.zh + ' ' : ''}
              {c[k]}/10
            </b>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="posbox">
      <h4>
        团战位置适配 <small>Team Position</small>
      </h4>
      {row('边位 Flank', 'fl')}
      {row('口袋 Pocket', 'pk')}
      <p className="note">主观近似评分</p>
    </div>
  );
}

export function CivOptions() {
  return (
    <>
      {civs.map((c, i) => (
        <option key={c.en} value={i}>
          {c.zh} {c.en}
        </option>
      ))}
    </>
  );
}

/** DLC 下拉 + 图标按钮条（共享同一状态） */
export function DlcSelect({
  value,
  onChange,
  id,
  includeUpdates = false,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  includeUpdates?: boolean;
}) {
  return (
    <select id={id} aria-label={includeUpdates ? '首发版本' : '资料片'} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{includeUpdates ? '全部首发版本' : '全部 DLC'}</option>
      {DLCS.map((d, i) => (
        <option key={i} value={i}>
          {d.zh} {d.en} ({d.year})
        </option>
      ))}
      {includeUpdates && <option value="update">免费更新</option>}
      <option value="none">未标注</option>
    </select>
  );
}
export function DlcBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const b = (v: string, c: ReactNode) => (
    <button key={v} data-v={v} className={value === v ? 'on' : undefined} onClick={() => onChange(v)}>
      {c}
    </button>
  );
  return (
    <div className="dbar">
      {b('', '全部')}
      {DLCS.map((_, i) => b(String(i), <DlcImg i={i} />))}
      {b('none', '未标注')}
    </div>
  );
}
export function SearchInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <span className="sw">
      <Icon name="search" className="ic sic" />
      <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}
export const Loading = () => <p className="note">加载中…</p>;
