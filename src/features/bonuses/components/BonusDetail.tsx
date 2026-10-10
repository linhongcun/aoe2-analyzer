import { Link, useParams } from 'react-router-dom';
import { civByEn } from '../../../data';
import { civBonuses } from '../../../domain/civBonus';
import { CivIcon } from '../../../shared/ui/art';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import BonusBody, { BonusTags } from './BonusBody';
import BonusList from './BonusList';

/** #/civ/:en/bonus/:idx（idx 为序号或 team） */
export default function BonusDetail() {
  const { en = '', idx = '' } = useParams();
  const c = civByEn(en);
  const list = c ? civBonuses(c) : [];
  const b = list.find((x) => String(x.idx) === idx);
  if (!c || !b) return <BonusList />;
  const title = b.team ? `${c.zh} · 团队加成` : `${c.zh} · 文明加成 ${+b.idx + 1}`;
  return (
    <DetailPage
      key={b.id}
      id="bonus"
      crumb={title}
      icon={<CivIcon c={c} />}
      title={title}
      en={b.team ? `${c.en} team bonus` : `${c.en} bonus ${+b.idx + 1}`}
      tags={<BonusTags b={b} />}
      tabs={[{ key: 'ov', label: '效果', content: <BonusBody b={b} /> }]}
      sidebar={
        <SideBlock title={`${c.zh} 的全部加成`}>
          <ul className="bside">
            {list.map((x) => (
              <li key={x.id} className={x.id === b.id ? 'cur' : undefined}>
                <Link to={`/civ/${c.en}/bonus/${x.idx}`}>{x.team ? '团队：' + x.zh : x.zh}</Link>
              </li>
            ))}
          </ul>
          <Link className="ulink" to={`/civ/${c.en}`}>
            返回 {c.zh} 文明页
          </Link>
        </SideBlock>
      }
    />
  );
}
