import { useEffect, useId, useRef, useState } from 'react';
import FeedbackLink from './FeedbackLink';
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
        <div id={id} ref={pop} className="rl-pop" role="dialog" aria-label="评分口径在页面上" tabIndex={-1}>
          <strong className="rl-title">评分口径在页面上</strong>
          <p>八项分数是维护者主观整理的整数，用来画雷达。不是胜率，也不是精确战力。</p>
          <p>各轴只有名称，没有单独的量化规则，规则待核。可复查的记录是维护者主观判断；社区出处没有写入文件，待核。</p>
          <p>分数适用的游戏补丁未知。复核日只表示文件结构和口径查过，不是逐文明重打分，也不表示已经对齐当前资料版本。</p>
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
