import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { civBonuses } from '../../../domain/civBonus';
import { civEnCasePath } from '../../../domain/civRoute';
import { CivIcon } from '../../../shared/ui/art';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import BonusBody, { BonusTags, BonusText } from '../../../shared/ui/BonusBody';
import BonusList from './BonusList';
import RomanArmor710 from './RomanArmor710';

/** #/civ/:en/bonus/:idx（idx 为序号或 team） */
export default function BonusDetail() {
  const { en = '', idx = '' } = useParams();
  const location = useLocation();
  // 与文明详情同一规则。保留原来的 idx、查询和页内 hash；对不上的 idx 仍走下面的列表回退。
  const canonicalPath = civEnCasePath(civs, en, `/bonus/${idx}`);
  if (canonicalPath) return <Navigate to={{ pathname: canonicalPath, search: location.search, hash: location.hash }} replace />;
  const c = civByEn(en);
  const list = c ? civBonuses(c) : [];
  const b = list.find((x) => String(x.idx) === idx);
  if (!c || !b) return <BonusList />;
  const kind = b.team ? `${c.zh} · 团队加成` : `${c.zh} · 文明加成 ${+b.idx + 1}`;
  return (
    <DetailPage
      key={b.id}
      id="bonus"
      crumb={kind}
      icon={<CivIcon c={c} />}
      title={b.zh}
      en={b.en}
      badges={<span className="tag bon-kind">{kind}</span>}
      tags={<BonusTags b={b} />}
      showTabs={false}
      tabs={[
        {
          key: 'ov',
          label: '效果',
          content: (
            <>
              <BonusBody b={b} head={false} />
              {b.id === 'Romans-1' && <RomanArmor710 b={b} />}
            </>
          ),
        },
      ]}
      sidebar={
        <SideBlock title={`${c.zh} 的全部加成`}>
          <ul className="bside">
            {list.map((x) => (
              <li key={x.id} className={x.id === b.id ? 'cur' : undefined}>
                <Link to={`/civ/${c.en}/bonus/${x.idx}`}>{x.team ? '团队：' + x.zh : <BonusText b={x} linked={false} />}</Link>
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
