import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { BUILDING_TYPE_ZH } from '../../../domain/buildings';
import { AGE_ZH } from '../../../domain/ratings';
import type { Tech, Unit } from '../../../domain/types';
import { BuildingIcon, CivChip, CostView, DlcBadgeL, StatIcon, TechLink, UnitLink } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { Join, Linked, Loading } from '../../../shared/ui/widgets';
import BuildingList from './BuildingList';
import BuildingSimulator from './BuildingSimulator';
import { useLocation } from 'react-router-dom';

const isUq = (x: Unit | Tech) => x.type === 'UniqueUnit' || x.type === 'UniqueTech';

export default function BuildingDetail() {
  const { id = '' } = useParams();
  const core = useCore();
  const loc = useLocation();
  useEffect(() => {
    scrollTo(0, 0);
  }, [id]);
  if (!core)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  const b = core.buildingById[+id];
  if (!b) return <BuildingList />;
  const units = b.units.map((i) => core.unitById[i]).filter((x): x is Unit => !!x);
  const techs = b.techs.map((i) => core.techById[i]).filter((x): x is Tech => !!x);
  const owners = (x: Unit | Tech) => x.civs.map((n) => civByEn(n)?.zh ?? n).join('/');
  const split = <T extends Unit | Tech>(list: T[], L: (x: T) => React.ReactNode, empty: string) => {
    const common = list.filter((x) => !isUq(x)),
      uq = list.filter(isUq);
    if (!list.length) return <p className="note">{empty}</p>;
    return (
      <>
        {common.length > 0 && (
          <>
            <h4>通用（{common.length}）</h4>
            <div className="uchips">{common.map(L)}</div>
          </>
        )}
        {uq.length > 0 && (
          <>
            <h4>文明独特（{uq.length}）</h4>
            <div className="uqlist">
              {uq.map((x) => (
                <div key={x.id} className="uqrow">
                  {L(x)}
                  <small className="note">{owners(x)}</small>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    );
  };
  const stats: [string, string, string | number][] = [
    ['hp', '生命值', b.hp],
    ['marm', '近战护甲', b.ma],
    ['parm', '穿刺护甲', b.pa],
    ['time', '建造时间', b.bt + 's'],
    ['', '视野', b.los],
    ...(b.gar ? [['', '驻扎容量', b.gar] as [string, string, number]] : []),
    ...(b.pop ? [['', '提供人口', b.pop] as [string, string, number]] : []),
    ...(b.atk
      ? [
          ['patk', '攻击力', b.atk] as [string, string, number],
          ['range', '射程', b.rng + (b.minr ? `（最小 ${b.minr}）` : '')] as [string, string, string],
          ['rof', '攻击间隔', b.rof + 's'] as [string, string, string],
        ]
      : []),
  ];
  const notAvail = civs.filter((c) => !b.civs.includes(c.en));
  return (
    <DetailPage
      key={b.id}
      id="building"
      crumb={b.zh}
      icon={<BuildingIcon b={b} big />}
      title={b.zh}
      en={b.en}
      badges={<DlcBadgeL i={b.dlc} />}
      tags={
        <>
          <span className="tag">{BUILDING_TYPE_ZH[b.type]}</span>
          <span className="tag">{AGE_ZH[b.age] ?? b.age}</span>
          {b.civs.length <= 4 && <span className="tag">文明独特</span>}
        </>
      }
      initialTab={new URLSearchParams(loc.search).get('tab') ?? undefined}
      tabs={[
        {
          key: 'ov',
          label: '概览',
          content: (
            <>
              <p>
                <b>造价：</b>
                <CostView c={b.cost} />　<b>建造时间：</b>
                <StatIcon k="time" t="建造时间" />
                {b.bt}s
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
                  <h4>说明</h4>
                  <p className="desc">
                    <Linked text={b.desc} nl />
                  </p>
                  <p className="note">{b.descEn.replace(/\n/g, ' ')}</p>
                </div>
              </div>
              <p className="note">数据来自 aoe2techtree（基础数值，未含文明加成与科技）</p>
            </>
          ),
        },
        { key: 'sim', label: '科技模拟器', content: <BuildingSimulator b={b} /> },
        { key: 'prod', label: `生产（${units.length}）`, content: split(units, (u) => <UnitLink key={u.id} u={u} />, '该建筑不生产单位') },
        { key: 'tech', label: `科技（${techs.length}）`, content: split(techs, (t) => <TechLink key={t.id} t={t} />, '该建筑不研究科技') },
        {
          key: 'civs',
          label: `文明（${b.civs.length}）`,
          content: (
            <>
              <h4>
                拥有该建筑的文明（{b.civs.length}/{civs.length}）
              </h4>
              <div>
                <Join
                  sep=" "
                  items={b.civs.map((n) => {
                    const c = civByEn(n);
                    return c ? <CivChip c={c} /> : n;
                  })}
                />
              </div>
              {notAvail.length > 0 && b.civs.length > civs.length / 2 && <p className="note">无此建筑：{notAvail.map((c) => c.zh).join('、')}</p>}
            </>
          ),
        },
      ]}
      sidebar={
        <>
          <SideBlock title="概要">
            <p className="note">
              生命值 {b.hp} · 护甲 {b.ma}/{b.pa}
              {b.atk ? ` · 攻击 ${b.atk}` : ''}
              {b.pop ? ` · 人口 +${b.pop}` : ''}
            </p>
          </SideBlock>
          {units.length > 0 && (
            <SideBlock title="可生产（部分）">
              <div className="uchips">
                {units
                  .filter((u) => !isUq(u))
                  .slice(0, 6)
                  .map((u) => (
                    <UnitLink key={u.id} u={u} />
                  ))}
              </div>
            </SideBlock>
          )}
          <SideBlock title="快速入口">
            <a className="ulink" href="#/tree">
              <Icon name="git-branch" /> 科技树
            </a>
          </SideBlock>
        </>
      }
    />
  );
}
