import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { DLCS } from '../../../domain/dlc';
import { findUniqueTech } from '../../../domain/linker';
import { strengths, TYPE_ZH } from '../../../domain/ratings';
import { CivChip, CivIcon, DlcBadgeL, TechIcon, UnitLinks } from '../../../shared/ui/art';
import { collapse } from '../../../domain/family';
import { Icon } from '../../../shared/ui/Icon';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { Linked, PosBox, Radar, Steps } from '../../../shared/ui/widgets';
import { session } from '../../../shared/utils/sticky';
import CivList from './CivList';
import { BonusRows } from './BonusRows';

function UTech({ s, civ }: { s: string; civ: string }) {
  const core = useCore();
  const f = core && findUniqueTech(s, civ, core.techs);
  if (!f) return <Linked text={s} />;
  return (
    <>
      <Link className="ulink tl" to={`/tech/${f.tech.id}`}>
        <TechIcon t={f.tech} />
        {f.zh}
      </Link>
      <Linked text={f.rest} />｜{f.en}
    </>
  );
}

export default function CivDetail() {
  const { en = '' } = useParams();
  const c = civByEn(en);
  const core = useCore();
  useEffect(() => {
    if (c) {
      session.lastCiv = c.en;
      scrollTo(0, 0);
    }
  }, [c]);
  if (!c) return <CivList />;
  const [s, w] = strengths(c);
  const myU = core ? core.units.filter((u) => u.type === 'UniqueUnit' && u.civs.includes(c.en)) : [];
  const sameDlc = c.dlc != null ? DLCS[c.dlc]!.civs.filter((n) => n !== c.en).map((n) => civByEn(n)!) : [];
  return (
    <DetailPage
      key={c.en}
      id="detail"
      crumb={c.zh}
      icon={<CivIcon c={c} />}
      title={c.zh}
      en={c.en}
      badges={<DlcBadgeL i={c.dlc} />}
      tags={c.ty.map((t) => (
        <span key={t} className="tag">
          {TYPE_ZH[t]}
        </span>
      ))}
      tabs={[
        {
          key: 'ov',
          label: '概览',
          content: (
            <>
              <p>
                <b>官方定位：</b>
                {c.desc}
              </p>
              <p>
                <b>特色兵种：</b>
                <Linked text={c.uu} />
              </p>
              <p>
                <b>文明加成：</b>
              </p>
              <BonusRows c={c} />
              <p className="g">
                <b>优势：</b>
                {s.join('、')}
              </p>
              <p className="r">
                <b>劣势：</b>
                {w.join('、')}
              </p>
              <p>
                <b>推荐团战位置：</b>
                {c.fl >= c.pk ? '边位 Flank' : '口袋 Pocket'}（边位 {c.fl}/10，口袋 {c.pk}/10）
              </p>
              <p>
                <b>推荐开局：</b>
                <Steps s={c.op} />
              </p>
            </>
          ),
        },
        {
          key: 'data',
          label: '数据',
          content: (
            <div className="two">
              <div>
                <Radar id="rd" list={[c]} />
              </div>
              <div>
                <PosBox list={[c]} />
                <p className="note">评分为主观近似值，仅供参考</p>
              </div>
            </div>
          ),
        },
        {
          key: 'tech',
          label: '科技',
          content: (
            <>
              <p>
                <b>城堡时代独特科技：</b>
                <UTech s={c.ct} civ={c.en} />
              </p>
              <p>
                <b>帝王时代独特科技：</b>
                <UTech s={c.it} civ={c.en} />
              </p>
              <p>
                <Link className="ulink tl" to={`/tree/${c.en}`}>
                  <Icon name="tree-deciduous" /> 查看完整科技树 <Icon name="arrow-right" />
                </Link>
              </p>
            </>
          ),
        },
      ]}
      sidebar={
        <>
          <SideBlock title="独特单位">
            <div className="uchips">{core && <UnitLinks list={collapse(myU, core.fam)} />}</div>
          </SideBlock>
          <SideBlock title="快速入口">
            <Link className="ulink tl" to={`/tree/${c.en}`}>
              <Icon name="git-branch" /> 科技树
            </Link>
            <Link className="ulink" to="/compare">
              <Icon name="scale" /> 文明对比
            </Link>
            <Link className="ulink" to="/matchup">
              <Icon name="crosshair" /> 对局助手
            </Link>
          </SideBlock>
          {sameDlc.length > 0 && (
            <SideBlock title="同资料片文明">
              {sameDlc.map((x) => (
                <CivChip key={x.en} c={x} />
              ))}
            </SideBlock>
          )}
          <p className="note">共 {civs.length} 个文明</p>
        </>
      }
    />
  );
}
