import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { AGE_ZH } from '../../../domain/ratings';
import { CivChip, CostView, DlcBadgeL, StatIcon, TechIcon, TechLink, UnitLink } from '../../../shared/ui/art';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { Join, Linked, Loading } from '../../../shared/ui/widgets';
import TechList from './TechList';

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
  const rel = core.units.filter((u) => u.zh.length >= 2 && t.desc.includes(u.zh));
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
          <span className="tag">{t.bz}</span>
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
                {t.bz}（{t.ben}）
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
          {rel.length > 0 && (
            <SideBlock title="涉及单位">
              <div className="uchips">
                {rel.slice(0, 6).map((u) => (
                  <UnitLink key={u.id} u={u} />
                ))}
              </div>
            </SideBlock>
          )}
          <p className="note">数据来自 aoe2techtree</p>
        </>
      }
    />
  );
}
