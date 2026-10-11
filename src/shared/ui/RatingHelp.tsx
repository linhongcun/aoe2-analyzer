import { useEffect, useId, useRef, useState } from 'react';
import FeedbackLink from '../../features/feedback/FeedbackLink';
import { Icon } from './Icon';

/** 「能力评分」标题 + 主观评分标注（详情页、对比页共用） */
export function RatingHeading() {
  return (
    <div className="ratehead">
      <h4>能力评分</h4>
      <RatingLabel />
    </div>
  );
}

/** 「主观评分，仅供参考」小字 + 问号按钮（点开说明评分来源） */
export function RatingLabel() {
  return (
    <span className="ratelabel">
      <span className="rl-text">主观评分，仅供参考</span>
      <RatingHelp />
    </span>
  );
}

function RatingHelp() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    pop.current?.focus();
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <span className="rl-wrap" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="rl-btn"
        aria-label="评分说明"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="circle-help" className="ic rl-ic" />
      </button>
      {open && (
        <div id={id} ref={pop} className="rl-pop" role="dialog" aria-label="评分是怎么来的" tabIndex={-1}>
          <strong className="rl-title">评分是怎么来的</strong>
          <p>8 项能力按 1–10 打分，由我们参考以下几点人工整理：文明加成、独特单位和独特科技；科技树完整度（缺哪些关键升级）；团战排位社区的普遍看法。</p>
          <p>不是胜率统计，会随版本补丁调整。数据在 scripts/civ_ratings.json。</p>
          <p>
            觉得不准？
            <FeedbackLink
              label={
                <>
                  反馈给我们 <Icon name="arrow-right" />
                </>
              }
            />
          </p>
        </div>
      )}
    </span>
  );
}
