import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { BUILDING_TYPE_ZH } from '../../../domain/buildings';
import { AGE_ZH } from '../../../domain/ratings';
import type { Tech, Unit } from '../../../domain/types';
import { collapse } from '../../../domain/family';
import { BuildingIcon, CivChip, CostView, DlcBadgeL, StatIcon, TechLink, UnitLink } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { DetailPage, SideBlock } from '../../../shared/ui/layout';
import { DetailSection, DetailSource, StatTiles, type DetailStat } from '../../../shared/ui/DetailBlocks';
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
  const famU = collapse(
    b.units.map((i) => core.unitById[i]).filter((x): x is Unit => !!x),
    core.fam,
  );
  const eliteMap = new Map(famU.map((x) => [x.u.id, x.elite]));
  const units = famU.map((x) => x.u);
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
  const stats: DetailStat[] = [
    { key: 'hp', icon: 'hp', label: '生命值', value: b.hp, accent: true },
    { key: 'armor', icon: 'marm', label: '护甲（近战 / 穿刺）', value: `${b.ma} / ${b.pa}`, accent: true },
    { key: 'los', label: '视野', value: b.los },
    ...(b.gar ? [{ key: 'gar', label: '驻扎容量', value: b.gar }] : []),
    ...(b.pop ? [{ key: 'pop', label: '提供人口', value: b.pop }] : []),
    ...(b.atk
      ? [
          { key: 'atk', icon: 'patk', label: '攻击力', value: b.atk },
          { key: 'rng', icon: 'range', label: '射程', value: b.rng, note: b.minr ? `最小射程 ${b.minr}` : undefined },
          { key: 'rof', icon: 'rof', label: '攻击间隔', value: `${b.rof}s` },
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
              <DetailSection title="造价与建造">
                <dl className="detail-cost-grid">
                  <div>
                    <dt>造价</dt>
                    <dd>
                      <CostView c={b.cost} />
                    </dd>
                  </div>
                  <div>
                    <dt>建造时间</dt>
                    <dd className="detail-number">
                      <StatIcon k="time" t="建造时间" />
                      {b.bt}s
                    </dd>
                  </div>
                </dl>
              </DetailSection>
              <StatTiles stats={stats} label="建筑属性" />
              {b.desc.trim() && (
                <DetailSection title="说明">
                  <p className="desc">
                    <Linked text={b.desc} nl />
                  </p>
                  <p className="note">{b.descEn.replace(/\n/g, ' ')}</p>
                </DetailSection>
              )}
              <DetailSource />
            </>
          ),
        },
        { key: 'sim', label: '科技模拟器', content: <BuildingSimulator b={b} /> },
        ...(units.length
          ? [
              {
                key: 'prod',
                label: `生产（${units.length}）`,
                content: split(units, (u) => <UnitLink key={u.id} u={u} elite={eliteMap.get(u.id)} />, '该建筑不生产单位'),
              },
            ]
          : []),
        ...(techs.length
          ? [{ key: 'tech', label: `科技（${techs.length}）`, content: split(techs, (t) => <TechLink key={t.id} t={t} />, '该建筑不研究科技') }]
          : []),
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
                    <UnitLink key={u.id} u={u} elite={eliteMap.get(u.id)} />
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
