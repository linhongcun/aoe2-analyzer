import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import {
  buildingCiv,
  buildingConstructionEntry,
  buildingHasAttack,
  buildingIdentityMark,
  buildingSurface,
  patchBuildingSearch,
  productionEntries,
  type BuildingAnchor,
} from '../../../domain/buildingDetailView';
import { BUILDING_TYPE_ZH } from '../../../domain/buildings';
import { formatHp } from '../../../domain/hpFormat';
import { AGE_ZH } from '../../../domain/ratings';
import { SIEGE_DEFAULT_UNIT_ID, siegeBuildingEntryVerified } from '../../../domain/siege';
import type { Tech, Unit } from '../../../domain/types';
import garrisonHosts from '../../../data/garrison_hosts.json';
import { AgeImg, BuildingIcon, CivChip, CostView, DlcBadgeL } from '../../../shared/ui/art';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CopyPageLink, DetailSource } from '../../../shared/ui/DetailBlocks';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { Breadcrumbs } from '../../../shared/ui/layout';
import { HistoricalEntityDetail, PatchHistory } from '../../../shared/ui/PatchHistory';
import { Linked, Loading } from '../../../shared/ui/widgets';
import { BuildingCatalog } from './BuildingCatalog';
import BuildingSimulator from './BuildingSimulator';
import { FoodAmount } from './FoodAmount';
import { HousingGuideLink, POP_ANCHOR } from './HousingGuideLink';
import { MarketFees } from './MarketFees';
import { RepairCosts } from './RepairCosts';
import { WallAgeChanges } from './WallAgeChanges';
import './building-detail.css';

const GarrisonPreview = lazy(() => import('./GeneralGarrisonPreview'));

const ANCHOR: Record<BuildingAnchor, string> = {
  prod: 'building-prod',
  tech: 'building-tech',
  civs: 'building-civs',
  history: 'building-history',
};

export default function BuildingDetail() {
  const { id = '' } = useParams();
  const core = useCore();
  const loc = useLocation();
  const nav = useNavigate();
  const params = new URLSearchParams(loc.search);
  const tab = params.get('tab');
  const b = core?.buildingById[+id];
  const host = !!b && garrisonHosts.includes(b.id);
  const view = buildingSurface(tab, host);
  const civ = b ? buildingCiv(params.get('civ'), b.civs) : null;
  const pendingScroll = useRef<string | null>(null);

  useEffect(() => {
    if (tab === 'garrison' && b && !host) nav({ pathname: loc.pathname, search: patchBuildingSearch(loc.search, { tab: 'ov' }) }, { replace: true });
  }, [tab, b, host, nav, loc.pathname, loc.search]);

  useEffect(() => {
    const target = pendingScroll.current;
    const node = target ? document.getElementById(target) : null;
    if (!target || !node) return;
    pendingScroll.current = null;
    node.scrollIntoView({ block: 'start' });
  }, [loc.search, tab, b?.id]);

  useEffect(() => {
    if (!b || (tab === 'garrison' && !host)) return;
    const next = buildingSurface(tab, host);
    if (next.surface === 'sim') {
      document.getElementById('building-sim')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (next.surface === 'garrison') {
      document.getElementById('building-garrison')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (next.anchor) {
      document.getElementById(ANCHOR[next.anchor])?.scrollIntoView({ block: 'start' });
      return;
    }
    if (loc.hash === `#${POP_ANCHOR}`) document.getElementById(POP_ANCHOR)?.scrollIntoView({ block: 'start' });
  }, [b, tab, host, loc.hash]);

  if (!core)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  if (!b) return <HistoricalEntityDetail target={{ targetType: 'building', targetId: id }} />;

  const units = b.units.map((unitId) => core.unitById[unitId]).filter((unit): unit is Unit => !!unit);
  const produced = productionEntries(units, core.fam);
  const techs = b.techs.map((techId) => core.techById[techId]).filter((tech): tech is Tech => !!tech);
  const mark = buildingIdentityMark(b.id);
  const ageName = AGE_ZH[b.age] ?? String(b.age);
  const construction = buildingConstructionEntry(b.id, b.age, civ);
  const showSiege = siegeBuildingEntryVerified(b, core.unitById[SIEGE_DEFAULT_UNIT_ID]);
  const attack = buildingHasAttack(b);
  const workspaceStatus = host
    ? civ
      ? '查看科技效果，或配置驻军预览。'
      : '查看科技效果，或配置驻军预览。未指定文明时需先选择文明。'
    : civ
      ? '查看科技效果。'
      : '查看科技效果。未指定文明时需先选择文明。';
  const go = (patch: Record<string, string | null>) => nav({ pathname: loc.pathname, search: patchBuildingSearch(loc.search, patch) });
  const setCiv = (en: string) => go({ civ: en || null });
  const scrollTo = (target: string) => {
    const node = document.getElementById(target);
    if (node) {
      pendingScroll.current = null;
      node.scrollIntoView({ block: 'start' });
      return;
    }
    pendingScroll.current = target;
  };
  const openHistory = () => {
    if (tab !== 'history') go({ tab: 'history' });
    scrollTo('building-history');
  };

  return (
    <section id="building" className="pane bd" data-view={view.surface}>
      <Breadcrumbs current={b.zh} />
      <div className="bd-id" data-t="building-identity">
        <div className="bd-icon">
          <BuildingIcon b={b} big />
        </div>
        <div className="bd-id-main">
          <h1>{b.zh}</h1>
          <p className="bd-en">{b.en}</p>
          <div className="bd-tags">
            <span className="bd-tag" data-t="building-type">
              {BUILDING_TYPE_ZH[b.type]}
            </span>
            <span className="bd-tag" data-t="catalog-age">
              <AgeImg age={b.age} />
              {ageName}
            </span>
            {mark && (
              <span className="bd-tag" data-t="building-mark">
                {mark}
              </span>
            )}
            <span data-t="building-dlc">
              <DlcBadgeL i={b.dlc} />
            </span>
          </div>
        </div>
        <div className="bd-id-actions">
          <CopyPageLink />
        </div>
      </div>

      <nav className="bd-jump" aria-label="本页章节">
        {(
          [
            ['building-core', '属性', null],
            ['building-prod', '生产', 'ov'],
            ['building-tech', '研究', 'ov'],
            ['building-notes', '说明', 'ov'],
            ['building-civs', '相关', 'ov'],
          ] as const
        ).map(([target, label, next]) => (
          <button
            key={target}
            type="button"
            onClick={() => {
              if (next && view.surface !== 'overview') go({ tab: 'ov' });
              scrollTo(target);
            }}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={openHistory}>
          更新历史
        </button>
      </nav>

      <div className="bd-civ">
        <CivPicker id="building-civ" label="选择文明" value={civ ?? ''} onChange={setCiv} allowed={b.civs} none="未指定文明" />
        <p className="bd-kicker" data-t="civ-scope">
          {civ ? '这是目录含有情况，不是完整的科技树可用性。' : '未指定文明，展示全文明目录并集。'}
        </p>
      </div>

      <section className="bd-core" id="building-core" aria-label="目录基础属性与造价">
        <div>
          <h2>目录基础属性</h2>
          <p className="bd-kicker">目录基础值，未计文明加成与科技。</p>
          <div className="bd-stat-grid">
            <Stat icon="heart" stat="hp" label="生命" value={formatHp(b.hp)} />
            <Stat icon="shield" stat="ma" label="近战护甲" value={String(b.ma)} />
            <Stat icon="shield" stat="pa" label="远程护甲" value={String(b.pa)} />
            <Stat icon="eye" stat="los" label="视野" value={String(b.los)} />
            {b.gar ? <Stat icon="users" stat="gar" label="驻扎" value={String(b.gar)} /> : null}
            {b.pop ? <Stat icon="home" stat="pop" label="人口" value={String(b.pop)} id={POP_ANCHOR} /> : null}
            {attack && (
              <>
                <Stat icon="sword" stat="atk" label="攻击" value={String(b.atk)} />
                <Stat
                  icon="crosshair"
                  stat="rng"
                  label="射程"
                  value={String(b.rng)}
                  sub={
                    <>
                      最小射程 <span className="num nw">{b.minr}</span>
                    </>
                  }
                />
                <Stat icon="clock" stat="rof" label="攻击间隔" value={`${b.rof}秒`} />
              </>
            )}
          </div>
        </div>
        <div className="bd-cost-col">
          <h2>目录造价</h2>
          <div className="bd-cost" data-t="catalog-cost">
            <CostView c={b.cost} />
          </div>
          <div className="bd-time" data-t="panel-time">
            <div className="bd-stat-lab">
              <Icon name="clock" />
              面板工期
            </div>
            <div className="bd-stat-val">
              <span className="num nw">{b.bt}秒</span>
            </div>
            <p className="bd-kicker">目录记录的面板工期，不是多人施工里的村民工时。</p>
          </div>
          <div className="bd-tools">
            {construction ? (
              <div data-t="construction-entry-block">
                <Link className="bd-btn" to={construction} data-t="construction-entry">
                  比较多人施工
                </Link>
                <p className="bd-kicker" data-t="construction-note">
                  预填目录时代，非解锁条件。
                </p>
              </div>
            ) : (
              <p className="bd-kicker" data-t="construction-needs-civ">
                先选择文明。
              </p>
            )}
            {showSiege && (
              <Link className="bd-btn" to={`/siege?bldg=${b.id}`} data-testid="building-siege-entry">
                <Icon name="hammer" /> 算攻城拆这座
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="bd-entry" id="building-workspace" aria-label="工作区">
        <h2>工作区</h2>
        <p data-t="workspace-status">{workspaceStatus}</p>
        <div className="bd-tools">
          {view.surface === 'overview' ? (
            <button type="button" className="bd-btn" onClick={() => go({ tab: 'sim' })}>
              打开科技模拟器
            </button>
          ) : (
            <button type="button" className="bd-btn" onClick={() => go({ tab: 'ov' })}>
              返回概览
            </button>
          )}
          {host && view.surface !== 'garrison' && (
            <button type="button" className="bd-btn" onClick={() => go({ tab: 'garrison' })}>
              配置驻军预览
            </button>
          )}
          {view.surface === 'garrison' && (
            <button type="button" className="bd-btn" onClick={() => go({ tab: 'sim' })}>
              打开科技模拟器
            </button>
          )}
        </div>
      </section>

      {view.surface === 'sim' && (
        <div className="bd-workspace" id="building-sim">
          <BuildingSimulator b={b} />
        </div>
      )}
      {view.surface === 'garrison' && (
        <div className="bd-workspace" id="building-garrison">
          {civ ? (
            <Suspense fallback={<Loading />}>
              <GarrisonPreview b={b} />
            </Suspense>
          ) : (
            <p data-t="garrison-needs-civ">请先选择拥有这座建筑的文明，再配置驻军预览。</p>
          )}
        </div>
      )}

      {view.surface === 'overview' && (
        <>
          <BuildingCatalog key={`${b.id}-units`} id="building-prod" title="生产" empty="这座建筑不生产单位" units={produced} civ={civ} />
          <BuildingCatalog key={`${b.id}-techs`} id="building-tech" title="研究" empty="这座建筑不研究科技" techs={techs} civ={civ} />
          <section className="bd-section" id="building-notes" aria-label="适用说明">
            <h2>适用说明</h2>
            {b.desc.trim() && (
              <p className="bd-desc">
                <Linked text={b.desc} nl />
              </p>
            )}
            <RepairCosts />
            <WallAgeChanges building={b} />
            {b.pop ? <HousingGuideLink /> : null}
            <FoodAmount buildingId={b.id} />
            <MarketFees buildingId={b.id} />
            <DetailSource note={null} />
          </section>
          <section className="bd-section" id="building-civs" aria-label="相关">
            <h2>相关</h2>
            <p className="bd-kicker">
              拥有这座建筑的文明 <span className="num nw">{b.civs.length}</span>
            </p>
            <div className="bd-civs">
              {b.civs.map((name) => {
                const owner = civByEn(name);
                return owner ? <CivChip key={owner.en} c={owner} /> : <span key={name}>{name}</span>;
              })}
            </div>
          </section>
          <details
            className="bd-history"
            id="building-history"
            open={tab === 'history'}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              if (open === (tab === 'history')) return;
              go({ tab: open ? 'history' : 'ov' });
            }}
          >
            <summary>更新历史</summary>
            <PatchHistory target={{ targetType: 'building', targetId: b.id, targetNameZh: b.zh }} />
          </details>
        </>
      )}
    </section>
  );
}

function Stat({ icon, stat, label, value, sub, id }: { icon: IconName; stat: string; label: string; value: string; sub?: ReactNode; id?: string }) {
  return (
    <div className="bd-stat" data-stat={stat} id={id}>
      <div className="bd-stat-lab">
        <Icon name={icon} />
        {label}
      </div>
      <div className="bd-stat-val" data-t="stat-value">
        <span className="num nw">{value}</span>
      </div>
      {sub ? <div className="bd-stat-sub">{sub}</div> : null}
    </div>
  );
}
