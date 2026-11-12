/** 文明加成：按文明分组，搜索、类别和计入档筛选，窄屏只吸顶搜索行。 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { allCivBonuses, BONUS_CATS, type CivBonusEnt } from '../../../domain/civBonus';
import { bonusLevel, LEVEL_ZH, type BonusLevel } from '../../../domain/bonusUsage';
import { CivIcon } from '../../../shared/ui/art';
import { BonusText } from '../../../shared/ui/BonusBody';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';
import { ToolRelated } from '../../../shared/ui/ToolPageHeader';
import { SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import './bonusList.css';

const ALL = allCivBonuses(civs);
const LEVEL = new Map(ALL.map((b) => [b.id, bonusLevel(b)]));
const TOTAL = new Map<string, number>();
for (const b of ALL) TOTAL.set(b.civ, (TOTAL.get(b.civ) ?? 0) + 1);
const levelOf = (b: CivBonusEnt): BonusLevel => LEVEL.get(b.id) ?? bonusLevel(b);

function matchQuery(b: CivBonusEnt, ql: string) {
  return !ql || b.zh.includes(ql) || b.en.toLowerCase().includes(ql) || civByEn(b.civ)!.zh.includes(ql) || b.civ.toLowerCase().includes(ql);
}
function matchCat(b: CivBonusEnt, cat: string) {
  return !cat || (cat === '团队' ? b.team : b.cats.includes(cat as never));
}
function matchLevel(b: CivBonusEnt, lv: string) {
  if (!lv) return true;
  return lv === 'none' ? levelOf(b) === 'none' : levelOf(b) !== 'none';
}

function useBonusStick(root: RefObject<HTMLElement | null>, filter: RefObject<HTMLElement | null>, search: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const host = root.current;
    const header = document.querySelector('header.topbar');
    if (!host) return;
    const apply = () => {
      const headerH = header?.getBoundingClientRect().height ?? 0;
      const narrow = window.matchMedia('(max-width: 700px)').matches;
      const bar = narrow ? search.current : filter.current;
      host.style.setProperty('--bon-stick', `${headerH}px`);
      host.style.setProperty('--bon-filter-h', `${bar?.getBoundingClientRect().height ?? 0}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    const watch = (el: Element | null) => {
      if (!el || getComputedStyle(el).display === 'contents') return;
      observer.observe(el);
    };
    watch(header);
    watch(filter.current);
    watch(search.current);
    window.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [root, filter, search]);
}

function Segment({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: ReactNode }[];
  onChange: (value: string) => void;
}) {
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const index = Math.max(
      0,
      buttons.findIndex((button) => button.getAttribute('aria-checked') === 'true'),
    );
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next]!.value);
    buttons[next]?.focus();
  };
  return (
    <div className="bon-line">
      <span className="bon-k" aria-hidden="true">
        {label}
      </span>
      <div className="bon-seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
        {options.map((option) => {
          const on = value === option.value;
          return (
            <button
              key={option.value || 'all'}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={on ? 'on' : undefined}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BonusList() {
  const [q, setQ] = useSticky('bon.q', ''),
    [cat, setCat] = useSticky('bon.cat', ''),
    [lv, setLv] = useSticky('bon.lv', '');
  const rootRef = useRef<HTMLElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useBonusStick(rootRef, filterRef, searchRef);
  useLayoutEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  const ql = q.trim().toLowerCase();
  const inCat = ALL.filter((b) => matchQuery(b, ql) && matchCat(b, cat));
  const nOn = inCat.filter((b) => levelOf(b) !== 'none').length;
  const nText = inCat.length - nOn;
  const matched = inCat.filter((b) => matchLevel(b, lv));
  const filtering = Boolean(ql || cat || lv);
  const groups: { en: string; zh: string; rows: CivBonusEnt[] }[] = [];
  for (const b of matched) {
    const last = groups[groups.length - 1];
    if (last && last.en === b.civ) last.rows.push(b);
    else groups.push({ en: b.civ, zh: civByEn(b.civ)!.zh, rows: [b] });
  }
  const clear = () => {
    setQ('');
    setCat('');
    setLv('');
  };
  const jumpTo = (en: string) => {
    if (!en) return;
    const card = document.getElementById(`bg-${en}`);
    const link = card?.querySelector<HTMLAnchorElement>('a');
    card?.scrollIntoView({ block: 'start' });
    link?.focus({ preventScroll: true });
  };
  return (
    <section id="bonuses" className="pane" ref={rootRef}>
      <ListHead level={1} title="文明加成" desc={`${civs.length} 个文明的 ${ALL.length} 条文明与团队加成，按文明分组`} />
      <div className="bon-filter" ref={filterRef} {...(narrow ? {} : { role: 'search' as const, 'aria-label': '筛选文明加成' })}>
        <div className="bon-filter-main" ref={searchRef} {...(narrow ? { role: 'search' as const, 'aria-label': '筛选文明加成' } : {})}>
          <SearchInput id="bq" value={q} onChange={setQ} placeholder="搜索加成或文明（中/英）" />
          <select className="bon-jump" aria-label="跳到文明" value="" onChange={(event) => jumpTo(event.target.value)}>
            <option value="">跳到文明…</option>
            {groups.map((group) => (
              <option key={group.en} value={group.en}>
                {group.zh}
              </option>
            ))}
          </select>
        </div>
        <div className="bon-filter-segs">
          <div className="bon-seg-scroll">
            <Segment label="类别" value={cat} onChange={setCat} options={['', ...BONUS_CATS, '团队'].map((value) => ({ value, label: value || '全部' }))} />
            <Segment
              label="计入"
              value={lv}
              onChange={setLv}
              options={[
                { value: '', label: '全部' },
                {
                  value: 'on',
                  label: (
                    <>
                      有计入 <span className="num nw">{nOn}</span>
                    </>
                  ),
                },
                {
                  value: 'none',
                  label: (
                    <>
                      仅文本 <span className="num nw">{nText}</span>
                    </>
                  ),
                },
              ]}
            />
          </div>
          <span id="bcnt" className="note" aria-live="polite">
            {filtering ? (
              <>
                <span className="num nw">
                  {matched.length} / {ALL.length} 条
                </span>
                {' · '}
                <span className="num nw">{groups.length} 个文明</span>
              </>
            ) : (
              <>
                <span className="num nw">{ALL.length} 条</span>
                {' · '}
                <span className="num nw">{civs.length} 个文明</span>
              </>
            )}
          </span>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="bon-empty" id="blist" role="status">
          <p>没有符合条件的加成。</p>
          <button type="button" onClick={clear}>
            <Icon name="x" />
            清除筛选
          </button>
        </div>
      ) : (
        <div className="bg-grid" id="blist">
          {groups.map((group) => {
            const total = TOTAL.get(group.en) ?? group.rows.length;
            const nameId = `bg-name-${group.en}`;
            return (
              <section key={group.en} className="bg-card" id={`bg-${group.en}`} aria-labelledby={nameId}>
                <header className="bg-head">
                  <Link to={`/civ/${group.en}`}>
                    <CivIcon c={{ en: group.en }} alt="" />
                    <h2 id={nameId}>{group.zh}</h2>
                    <span className="bg-en">{group.en}</span>
                  </Link>
                  <span className="bg-n num nw">{filtering ? `${group.rows.length} / ${total} 条` : `${total} 条`}</span>
                </header>
                <ul className="bg-rows">
                  {group.rows.map((b) => {
                    const level = levelOf(b);
                    return (
                      <li key={b.id} className="bg-row">
                        <Link to={`/civ/${b.civ}/bonus/${b.idx}`}>
                          {b.team && <span className="tag team">团队</span>}
                          <span className="bg-zh">
                            <BonusText b={b} linked={false} />
                          </span>
                          <span className={'tag bg-lv ' + (level === 'none' ? 'txt' : 'ok')}>{LEVEL_ZH[level]}</span>
                          <Icon name="chevron-right" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="bon-legend note">
        <b>标签说明。</b>
        已计入表示有可计算的效果；部分计入表示只有部分工具计入；仅文本表示只展示游戏说明。点开单条加成可查看适用对象和各工具的计入情况。
      </p>
      <ToolRelated links={[{ to: '/team-bonuses', label: '按玩家阵容汇总团队加成' }]} />
    </section>
  );
}
