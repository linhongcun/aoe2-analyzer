import { ArmorClasses, BonusTable } from '../../simulator/components/SimPanel';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { parseUnitPath } from '../../../domain/simulator';
import { AGE_ZH } from '../../../domain/ratings';
import { upgradeLine } from '../../../domain/units';
import { CivChip, CostView, DlcBadgeL, StatIcon, TechLink, UnitIcon, UnitLink } from '../../../shared/ui/art';
import { BLink } from '../../buildings/components/BLink';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { Join, Linked, Loading, Sep } from '../../../shared/ui/widgets';
import Simulator from '../../simulator/components/Simulator';
import UnitList from './UnitList';

const UT: Record<string, string> = { UniqueUnit: '独特单位', Unit: '通用单位', UnitUpgrade: '升级单位', RegionalUnit: '区域单位' };

export default function UnitDetail() {
  const loc = useLocation();
  const core = useCore();
  const rt = parseUnitPath(loc.pathname);
  const u = core && rt ? core.unitById[rt.id] : undefined;
  const hasCiv = !!rt?.civ;
  useEffect(() => {
    if (!hasCiv) scrollTo(0, 0);
  }, [rt?.id, hasCiv]);
  if (!core)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  if (!u || !rt) return <UnitList />;
  const ln = upgradeLine(u, core.units, core.unitById);
  const stats: [string, string, string | number][] = [
    ['hp', '生命值 HP', u.hp],
    [u.rng > 1 ? 'patk' : 'atk', '攻击力', u.atk],
    ['marm', '近战护甲', u.ma],
    ['parm', '穿刺护甲', u.pa],
    ['range', '射程', u.rng + (u.minr ? `（最小 ${u.minr}）` : '')],
    ['speed', '移动速度', u.spd],
    ['', '视野', u.los],
    ['rof', '攻击间隔', u.rof + 's'],
    ['', '准确度', u.acc + '%'],
    ...(u.blast ? [['blast', '溅射范围', u.blast] as [string, string, number]] : []),
  ];
  const rel = core.techs.filter((t) => t.desc.includes(u.zh)).slice(0, 16);
  const wantSim = hasCiv || new URLSearchParams(loc.search).get('tab') === 'sim';
  return (
    <DetailPage
      key={u.id}
      id="unit"
      crumb={u.zh}
      icon={<UnitIcon u={u} big />}
      title={u.zh}
      en={u.en}
      badges={<DlcBadgeL i={u.dlc} />}
      tags={
        <>
          <span className="tag">{UT[u.type] ?? u.type}</span>
          <BLink id={u.b} zh={u.bz} />
          <span className="tag">{AGE_ZH[u.age] ?? u.age}</span>
        </>
      }
      initialTab={wantSim && u.civs.length ? 'sim' : 'ov'}
      tabs={[
        {
          key: 'ov',
          label: '概览',
          content: (
            <>
              <p>
                <b>造价：</b>
                <CostView c={u.cost} />　<b>生产时间：</b>
                <StatIcon k="time" t="生产时间" />
                {u.tt}s　<b>建筑：</b>
                <BLink id={u.b} zh={u.bz} />（{u.ben}）
              </p>
              <div className="two">
                <div>
                  <table className="stat">
                    <tbody>
                      {stats.map((r) => (
                        <tr key={r[1]}>
                          <td>
                            <StatIcon k={r[0]} t={r[1]} />
                            {r[1]}
                          </td>
                          <td>{r[2]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <BonusTable B={Object.fromEntries(u.atks.filter(([n]) => n !== '近战' && n !== '穿刺'))} />
                  <ArmorClasses list={u.armc} />
                  {u.up && (
                    <>
                      <h4>升级研究</h4>
                      <p>
                        从上一级升级为 {u.zh}：<CostView c={u.up[0]} /> <StatIcon k="time" t="研究时间" />
                        {u.up[1]}s
                      </p>
                    </>
                  )}
                </div>
              </div>
              <h4>说明</h4>
              <p className="desc">
                <Linked text={u.desc} nl />
              </p>
              <p className="note">数据来自 aoe2techtree（基础数值，未含文明加成与科技）</p>
            </>
          ),
        },
        ...(u.civs.length ? [{ key: 'sim', label: '科技模拟器', content: <Simulator key={u.id} u={u} route={rt} /> }] : []),
        {
          key: 'rel',
          label: '相关',
          content: (
            <>
              {rel.length > 0 && (
                <>
                  <h4>相关科技</h4>
                  <div className="uchips">
                    {rel.map((t) => (
                      <TechLink key={t.id} t={t} />
                    ))}
                  </div>
                </>
              )}
              <h4>
                拥有该单位的文明（{u.civs.length}/{civs.length}）
              </h4>
              <div>
                <Join
                  sep=" "
                  items={u.civs.map((n) => {
                    const c = civByEn(n);
                    return c ? <CivChip c={c} /> : n;
                  })}
                />
              </div>
            </>
          ),
        },
      ]}
      sidebar={
        <>
          <SideBlock title="升级路线">
            <div className="uline vline">
              <Join
                sep={<Sep />}
                items={ln.map((x) =>
                  x.id === u.id ? (
                    <b className="cur">
                      <UnitIcon u={x} />
                      {x.zh}
                    </b>
                  ) : (
                    <UnitLink u={x} />
                  ),
                )}
              />
            </div>
          </SideBlock>
          {rel.length > 0 && (
            <SideBlock title="相关科技">
              <div className="uchips">
                {rel.slice(0, 6).map((t) => (
                  <TechLink key={t.id} t={t} />
                ))}
              </div>
            </SideBlock>
          )}
          <SideBlock title={`可用文明 ${u.civs.length}/${civs.length}`}>
            <p className="note">
              {u.civs
                .slice(0, 8)
                .map((n) => civByEn(n)?.zh ?? n)
                .join('、')}
              {u.civs.length > 8 ? ' 等' : ''}
            </p>
          </SideBlock>
        </>
      }
    />
  );
}
