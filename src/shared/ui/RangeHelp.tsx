import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { rangeB } from './RangeB';

/** #36：沿用评分说明浮层的样式与键盘交互，射程数字直接读取当前单位。 */
export function RangeHelp({ u }: { u: { rng: number; rngBd?: number; minr?: number } }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const building = rangeB(u);
  useEffect(() => {
    if (!open) return;
    popup.current?.focus();
    const dismiss = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <span className="rl-wrap range-help" ref={wrap}>
      <button
        type="button"
        className="rl-btn"
        ref={button}
        aria-label="射程说明"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="circle-help" className="ic rl-ic" />
      </button>
      {open && (
        <div id={id} ref={popup} className="rl-pop" role="dialog" aria-label="射程说明" tabIndex={-1}>
          <strong className="rl-title">射程说明</strong>
          <p>射程以地图格数计，主数字是对单位的最大攻击距离。</p>
          <p>
            对单位 <span className="tl-num">{u.rng} 格</span>；对建筑 <span className="tl-num">{building ?? u.rng} 格</span>。
            {building === null ? '两者相同时只显示一个数字。' : '攻击建筑时使用单独标出的「对建筑」射程。'}
          </p>
          {!!u.minr && (
            <p>
              最小射程为 <span className="tl-num">{u.minr} 格</span>，距离更近时无法攻击。
            </p>
          )}
          <p>这里是基础数值，未含文明加成与科技；升级后的数值请查看科技模拟器。</p>
        </div>
      )}
    </span>
  );
}
