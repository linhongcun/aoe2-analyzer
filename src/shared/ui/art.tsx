/** 游戏美术图标（文明/单位/科技/属性/DLC），本地 public/img */
import { Link } from 'react-router-dom';
import type { Building, Civ, Cost, Tech, Unit } from '../../domain/types';
import type { FamilyEntry } from '../../domain/family';
import { DLCS } from '../../domain/dlc';
import { RES_ZH } from '../../domain/ratings';

export const img = (p: string) => `${import.meta.env.BASE_URL}img/${p}`;

export const CivIcon = ({ c }: { c: Pick<Civ, 'en'> }) => <img className="ico" src={img(`civs/${c.en.toLowerCase()}.webp`)} alt={c.en} loading="lazy" />;
export const UnitIcon = ({ u, big }: { u: Unit; big?: boolean }) => (
  <img className={big ? 'uico big' : 'uico'} src={img(`units/${u.pic}.webp`)} alt="" loading="lazy" />
);
export const TechIcon = ({ t, big }: { t: Tech; big?: boolean }) => (
  <img className={big ? 'uico big' : 'uico'} src={img(`techs/${t.pic}.webp`)} alt="" loading="lazy" />
);
/** 单位链接；传入 elite 时表示“普通+精锐”合并条目，名称后带「精锐」小标 */
export const UnitLink = ({ u, elite }: { u: Unit; elite?: Unit }) => (
  <Link className="ulink" to={`/unit/${u.id}`} title={elite ? `${u.zh} / ${elite.zh}` : undefined}>
    <UnitIcon u={u} />
    {u.zh}
    {elite && <EliteBadge />}
  </Link>
);
export const EliteBadge = () => (
  <span className="ebadge" title="含精锐版本">
    精锐
  </span>
);
/** 合并精锐后的单位链接列表 */
export const UnitLinks = ({ list }: { list: FamilyEntry[] }) => (
  <>
    {list.map((x) => (
      <UnitLink key={x.u.id} u={x.u} elite={x.elite} />
    ))}
  </>
);
export const TechLink = ({ t }: { t: Tech }) => (
  <Link className="ulink tlink" to={`/tech/${t.id}`}>
    <TechIcon t={t} />
    {t.zh}
  </Link>
);
export const CivChip = ({ c, title }: { c: Civ; title?: string }) => (
  <Link className="civchip" to={`/civ/${c.en}`} title={title}>
    <CivIcon c={c} />
    {c.zh}
  </Link>
);

/** 属性图标；k 为空时输出占位 */
export const StatIcon = ({ k, t }: { k: string; t?: string }) =>
  k ? <img className="si" src={img(`stats/${k}.webp`)} alt={t ?? k} title={t ?? k} /> : <span className="si" />;

const RK: Record<string, string> = { Food: 'food', Wood: 'wood', Gold: 'gold', Stone: 'stone' };
export function CostView({ c }: { c: Cost }) {
  const e = Object.entries(c).filter(([, v]) => v);
  if (!e.length) return <>—</>;
  return (
    <>
      {e.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && ' '}
          {RK[k] ? (
            <span className="res">
              <StatIcon k={RK[k]} t={RES_ZH[k]} />
              {v}
            </span>
          ) : (
            `${v} ${k}`
          )}
        </span>
      ))}
    </>
  );
}
export const costText = (c: Cost) =>
  Object.entries(c)
    .map(([k, v]) => `${v} ${RES_ZH[k] ?? k}`)
    .join(' + ') || '—';

export const DlcImg = ({ i, className = 'dlci' }: { i: number; className?: string }) => {
  const d = DLCS[i]!;
  return <img className={className} src={img(`dlc/${i}.webp`)} alt={`${d.zh} ${d.en}`} title={`${d.zh} · ${d.en} (${d.year})`} />;
};
export function DlcBadge({ i, linked = true }: { i: number | null; linked?: boolean }) {
  if (i == null) return null;
  const d = DLCS[i]!;
  if (!linked)
    return (
      <span className="dlcb" title={`${d.zh} · ${d.en} (${d.year})`}>
        <DlcImg i={i} />
      </span>
    );
  return (
    <Link className="dlcb" to="/dlc" title={`${d.zh} · ${d.en} (${d.year})`}>
      <DlcImg i={i} />
    </Link>
  );
}
export function DlcBadgeL({ i }: { i: number | null }) {
  if (i == null) return null;
  const d = DLCS[i]!;
  return (
    <Link className="dlcb big" to="/dlc" title={`${d.en} (${d.year})`}>
      <DlcImg i={i} />
      <span>
        {d.zh} · {d.year}
      </span>
    </Link>
  );
}

/** 科技独立免费更新与未核实状态也显式展示，不冒用资料片图标。 */
export function TechReleaseBadge({ t, large = false }: { t: Pick<Tech, 'dlc' | 'introducedUpdate'>; large?: boolean }) {
  if (t.introducedUpdate || t.dlc === null)
    return (
      <span className="tag" data-tech-release={t.introducedUpdate ? 'update' : 'none'}>
        {t.introducedUpdate ? `免费更新 · ${t.introducedUpdate}` : '首发版本未标注'}
      </span>
    );
  return large ? <DlcBadgeL i={t.dlc} /> : <DlcBadge i={t.dlc} linked={false} />;
}

export const BuildingIcon = ({ b, big }: { b: Pick<Building, 'pic'>; big?: boolean }) => (
  <img className={big ? 'uico big' : 'uico'} src={img(`buildings/${b.pic}.webp`)} alt="" loading="lazy" />
);
export const BuildingLink = ({ b }: { b: Building }) => (
  <Link className="ulink bl" to={`/building/${b.id}`}>
    <BuildingIcon b={b} />
    {b.zh}
  </Link>
);
