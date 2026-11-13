import { useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCore } from '../../../data/hooks';
import { BUILDING_TYPE_ZH, isUniqueBuilding } from '../../../domain/buildings';
import { DLCS } from '../../../domain/dlc';
import { AGE_ZH } from '../../../domain/ratings';
import type { Building, BuildingType } from '../../../domain/types';
import { BuildingIcon, CostView } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';
import { Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { filterBuildings } from '../logic/filter';
import './building-list.css';

const DESKTOP_QUERY = '(min-width: 721px)';
const ageGuides = [
  [101, '封建时代说明'],
  [102, '城堡时代说明'],
  [103, '帝王时代说明'],
] as const;
const AGES = [
  ['1', '黑暗'],
  ['2', '封建'],
  ['3', '城堡'],
  ['4', '帝王'],
] as const;

function useDesktopList() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useLayoutEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return desktop;
}

function cardFlags(b: Pick<Building, 'civs' | 'dlc'>): string {
  const bits: string[] = [];
  if (isUniqueBuilding(b)) bits.push('独特');
  if (b.dlc != null && b.dlc !== 0) {
    const name = DLCS[b.dlc]?.zh;
    if (name && name !== '国王时代') bits.push(name);
  }
  return bits.join(' · ');
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className="b-chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export default function BuildingList() {
  const core = useCore();
  const desktop = useDesktopList();
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useSticky('b.q', ''),
    [age, setAge] = useSticky('b.a', ''),
    [type, setType] = useSticky('b.t', ''),
    [dlc, setDlc] = useSticky('b.dlc', '');
  const all = core?.buildings ?? [];
  const r = filterBuildings(all, { q, age, type, dlc });
  const unlabeled = all.filter((b) => b.dlc == null).length;
  const dirty = Boolean(q || type || age || dlc);
  const summary = [
    q && `搜索「${q}」`,
    type && type in BUILDING_TYPE_ZH ? BUILDING_TYPE_ZH[type as BuildingType] : '',
    age && AGE_ZH[+age],
    dlc === 'none' ? '未标注资料片' : dlc ? DLCS[+dlc]?.zh : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const reset = () => {
    setQ('');
    setType('');
    setAge('');
    setDlc('');
  };
  return (
    <section id="buildings" className="pane">
      <div className="b-heading">
        <ListHead level={1} title="建筑" desc="查找建筑并打开详情。" />
        <nav className="b-guides" aria-label="时代升级说明">
          {ageGuides.map(([id, label]) => (
            <Link key={id} to={`/tech/${id}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="b-filters">
        <div className="b-search">
          <SearchInput id="bq" value={q} onChange={setQ} placeholder="搜索中文、英文或拼音" label="搜索建筑，可搜中文、英文或拼音" />
          {dirty && (
            <button type="button" className="b-clear" onClick={reset}>
              清空筛选
            </button>
          )}
        </div>
        <div className="b-type">
          <p className="b-label" id="b-type-label">
            类型
          </p>
          <div className="b-chips" role="group" aria-labelledby="b-type-label">
            <Chip pressed={type === ''} onClick={() => setType('')}>
              全部
            </Chip>
            {(Object.keys(BUILDING_TYPE_ZH) as BuildingType[]).map((key) => (
              <Chip key={key} pressed={type === key} onClick={() => setType(key)}>
                {BUILDING_TYPE_ZH[key]}
              </Chip>
            ))}
          </div>
        </div>
        <details
          className="b-more"
          open={desktop || moreOpen}
          onToggle={(event) => {
            if (window.matchMedia(DESKTOP_QUERY).matches) {
              if (!event.currentTarget.open) event.currentTarget.open = true;
              return;
            }
            setMoreOpen(event.currentTarget.open);
          }}
        >
          <summary>
            <span>筛选</span>
            <Icon name="chevron-down" />
          </summary>
          <div className="b-secondary">
            <div>
              <p className="b-label" id="b-age-label">
                时代
              </p>
              <div className="b-chips" role="group" aria-labelledby="b-age-label">
                <Chip pressed={age === ''} onClick={() => setAge('')}>
                  全部
                </Chip>
                {AGES.map(([value, label]) => (
                  <Chip key={value} pressed={age === value} onClick={() => setAge(value)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="b-dlc">
              <label className="b-label" htmlFor="bdlc">
                资料片
              </label>
              <select id="bdlc" value={dlc} onChange={(event) => setDlc(event.target.value)}>
                <option value="">全部</option>
                {DLCS.map((item, index) => (
                  <option key={item.en} value={String(index)}>
                    {item.zh}
                  </option>
                ))}
                <option value="none">未标注（{unlabeled}）</option>
              </select>
            </div>
          </div>
        </details>
      </div>
      <div className="b-results-bar">
        <div className="b-result">
          <p className="b-count">
            <span id="bcnt" className="num nw">
              {r.length} / {all.length} 座建筑
            </span>
          </p>
          {summary && <p className="b-summary">{summary}</p>}
        </div>
        <p className="b-note">造价为目录基础值。时代按目录时代精确匹配。</p>
      </div>
      {!core ? (
        <Loading />
      ) : !r.length ? (
        <div className="b-empty" role="status">
          <p>没有符合条件的建筑。</p>
          <button type="button" className="b-clear" onClick={reset}>
            清空筛选
          </button>
        </div>
      ) : (
        <div id="bgrid">
          {r.map((b) => {
            const flags = cardFlags(b);
            return (
              <Link key={b.id} className="card b-card" to={`/building/${b.id}`} data-building-id={b.id}>
                <BuildingIcon b={b} />
                <div className="b-id">
                  <h2 className="b-zh">{b.zh}</h2>
                  <p className="b-en">{b.en}</p>
                </div>
                <p className="b-meta">
                  <span className="b-type-tag">{BUILDING_TYPE_ZH[b.type]}</span>
                  <span>{AGE_ZH[b.age] ?? ''}</span>
                </p>
                <div className="b-foot">
                  <p className="b-cost">
                    <span className="b-cost-label">造价</span>
                    <CostView c={b.cost} />
                  </p>
                  {flags && <p className="b-flags">{flags}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
