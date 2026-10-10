/** 游戏美术图标（文明/单位/科技/属性/DLC），本地 public/img */
import { Link } from 'react-router-dom';
import type { Civ, Cost, Tech, Unit } from '../../domain/types';
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
export const UnitLink = ({ u }: { u: Unit }) => (
  <Link className="ulink" to={`/unit/${u.id}`}>
    <UnitIcon u={u} />
    {u.zh}
  </Link>
);
export const TechLink = ({ t }: { t: Tech }) => (
  <Link className="ulink tl" to={`/tech/${t.id}`}>
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
  const e = Object.entries(c);
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
export function DlcBadge({ i }: { i: number | null }) {
  if (i == null) return null;
  const d = DLCS[i]!;
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
