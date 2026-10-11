import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { AGE_ZH } from '../../../domain/ratings';
import { CivChip, CostView, DlcBadgeL, StatIcon, TechIcon, TechLink, UnitLink } from '../../../shared/ui/art';
import { BLink } from '../../buildings/components/BLink';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { Join, Linked, Loading } from '../../../shared/ui/widgets';
import TechList from './TechList';
import TechAffects from './TechAffects';
import { techAffects } from '../../../domain/affects';
import { affectedUnits } from '../../../domain/family';

const TT: Record<string, string> = { UniqueTech: '独特科技', Research: '通用科技', RegionalTech: '区域科技' };

export default function TechDetail() {
  const { id = '' } = useParams();
  const core = useCore();
  useEffect(() => {
    scrollTo(0, 0);
  }, [id]);
  if (!core)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  const t = core.techById[+id];
  if (!t) return <TechList />;
  const pre = t.pre != null ? core.techById[t.pre] : undefined;
  const nxt = core.techs.filter((x) => x.pre === t.id);
  // 涉及单位用结构化效果（与「作用对象」同源），不再按说明文字匹配单位名（#13）
  const rel = affectedUnits(techAffects(t, core.units, core.buildings), core.fam);
  const civList = (
    <>
      <h4>
        {t.type === 'UniqueTech' ? '所属文明' : '可研究的文明'}（{t.civs.length}/{civs.length}）
      </h4>
      <div>
        <Join
          sep=" "
          items={t.civs.map((n) => {
            const c = civByEn(n);
            return c ? <CivChip c={c} /> : n;
          })}
        />
      </div>
      {t.type !== 'UniqueTech' && t.civs.length < civs.length && (
        <p className="note">
          无法研究：
          {civs
            .filter((c) => !t.civs.includes(c.en))
            .map((c) => c.zh)
            .join('、')}
        </p>
      )}
    </>
  );
  return (
    <DetailPage
      key={t.id}
      id="tech"
      crumb={t.zh}
      icon={<TechIcon t={t} big />}
      title={t.zh}
      en={t.en}
      badges={<DlcBadgeL i={t.dlc} />}
      tags={
        <>
          <span className="tag">{TT[t.type] ?? t.type}</span>
          <BLink id={t.b} zh={t.bz} />
          <span className="tag">{AGE_ZH[t.age] ?? t.age}</span>
        </>
      }
      tabs={[
        {
          key: 'ov',
          label: '概览',
          content: (
            <>
              <p>
                <b>费用：</b>
                <CostView c={t.cost} />　<b>研究时间：</b>
                <StatIcon k="time" t="研究时间" />
                {t.rt}s　<b>建筑：</b>
                <BLink id={t.b} zh={t.bz} />（{t.ben}）
              </p>
              <h4>效果</h4>
              <p className="desc">
                <Linked text={t.desc} nl />
                <br />
                <small className="note">{t.descEn.replace(/\n/g, ' ')}</small>
              </p>
              {rel.length > 0 && (
                <>
                  <h4>涉及单位</h4>
                  <div className="uchips">
                    {rel.map((u) => (
                      <UnitLink key={u.id} u={u} />
                    ))}
                  </div>
                </>
              )}
            </>
          ),
        },
        { key: 'affects', label: '作用对象', content: <TechAffects t={t} /> },
        { key: 'civs', label: '文明', content: civList },
      ]}
      sidebar={
        <>
          {(pre || nxt.length > 0) && (
            <SideBlock title="科技链">
              <div className="uline">
                {pre && (
                  <>
                    前置：
                    <TechLink t={pre} />
                    <br />
                  </>
                )}
                {nxt.length > 0 && (
                  <>
                    后续：
                    <Join
                      sep=" "
                      items={nxt.map((x) => (
                        <TechLink t={x} />
                      ))}
                    />
                  </>
                )}
              </div>
            </SideBlock>
          )}
          <p className="note">数据来自 aoe2techtree</p>
        </>
      }
    />
  );
}
