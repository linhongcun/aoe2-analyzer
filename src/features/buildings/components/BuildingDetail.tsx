import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { militaryTechAge } from '../../../domain/availabilityAge';
import {
  buildingCiv,
  buildingConstructionEntry,
  buildingDiscountView,
  buildingHasAttack,
  buildingIdentityMark,
  buildingSurface,
  patchBuildingSearch,
  productionEntries,
  type BuildingAnchor,
} from '../../../domain/buildingDetailView';
import { BUILDING_TYPE_ZH } from '../../../domain/buildings';
import { supportsBuildingCivRank } from '../../../domain/buildingCivRank';
import { formatHp } from '../../../domain/hpFormat';
import { AGE_ZH, RES_ZH } from '../../../domain/ratings';
import { SIEGE_DEFAULT_UNIT_ID, siegeBuildingEntryVerified } from '../../../domain/siege';
import type { Tech, Unit } from '../../../domain/types';
import { trainingAtBuilding } from '../../../domain/unitTrainingSites';
import { GARRISON_HOST_IDS as garrisonHosts } from '../../../data/garrisonHosts';
import { AgeImg, BuildingIcon, CivChip, DlcBadgeL } from '../../../shared/ui/art';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CopyPageLink, DetailSource } from '../../../shared/ui/DetailBlocks';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { Breadcrumbs } from '../../../shared/ui/layout';
import { HistoricalEntityDetail } from '../../../shared/ui/PatchHistory';
import { EntityHistoryInline } from '../../../shared/ui/EntityHistoryInline';
import { radioKeyboard } from '../../../shared/ui/radioKeyboard';
import { CostDeltaPills, OrderedCost } from '../../../shared/ui/sim/SimEffectiveCost';
import { useEntityHistory } from '../../../shared/ui/useEntityHistory';
import { Linked, Loading } from '../../../shared/ui/widgets';
import { BuildingAttackDetails } from './BuildingAttackDetails';
import { BuildingCatalog } from './BuildingCatalog';
import { BuildingCivRank, BuildingCivsHeader } from './BuildingCivRank';
import { FoodAmount } from './FoodAmount';
import { HousingGuideLink, POP_ANCHOR } from './HousingGuideLink';
import { MarketFees } from './MarketFees';
import { RepairCosts } from './RepairCosts';
import { WallAgeChanges } from './WallAgeChanges';
import './building-detail.css';

const BuildingSimulator = lazy(() => import('./BuildingSimulator'));
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
  const entityHistory = useEntityHistory(b ? 'building/' + b.id : undefined, tab === 'history');
  const host = !!b && garrisonHosts.includes(b.id);
  const view = buildingSurface(tab, host);
  const civ = b ? buildingCiv(params.get('civ'), b.civs) : null;
  const requestedCiv = civByEn(params.get('civ') ?? '');
  const pendingScroll = useRef<string | null>(null);
  const scrolledSurfaceRef = useRef<string | null>(null);
  const routeState = loc.state as { scrollTo?: string } | null;
  const routeScrollTarget = typeof routeState?.scrollTo === 'string' ? routeState.scrollTo : null;
  const [garrisonDiscountAge, setGarrisonDiscountAge] = useState<{ key: string; age: number } | null>(null);

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
    if (tab === 'history' && entityHistory.empty) {
      pendingScroll.current = null;
      window.scrollTo(0, 0);
      return;
    }
    const next = buildingSurface(tab, host);
    if (next.surface === 'sim' || next.surface === 'garrison') {
      const surfaceKey = `${b.id}:${next.surface}`;
      if (scrolledSurfaceRef.current === surfaceKey) return;
      scrolledSurfaceRef.current = surfaceKey;
      const defaultTarget = next.surface === 'sim' ? 'building-sim' : 'building-garrison';
      document.getElementById(routeScrollTarget ?? defaultTarget)?.scrollIntoView({ block: 'start' });
      return;
    }
    scrolledSurfaceRef.current = null;
    if (next.anchor) {
      document.getElementById(ANCHOR[next.anchor])?.scrollIntoView({ block: 'start' });
      return;
    }
    if (loc.hash === `#${POP_ANCHOR}`) document.getElementById(POP_ANCHOR)?.scrollIntoView({ block: 'start' });
  }, [b, tab, host, loc.hash, entityHistory.empty, routeScrollTarget]);

  if (!core)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  if (!b) return <HistoricalEntityDetail target={{ targetType: 'building', targetId: id }} />;

  const units = b.units.map((unitId) => core.unitById[unitId]).filter((unit): unit is Unit => !!unit);
  const produced = productionEntries(units, core.fam);
  const unavailableTrainingCiv = !civ && requestedCiv && units.some((unit) => trainingAtBuilding(unit, b.id)) ? requestedCiv : null;
  const techs = b.techs.map((techId) => core.techById[techId]).filter((tech): tech is Tech => !!tech);
  const mark = buildingIdentityMark(b.id);
  const ageName = AGE_ZH[b.age] ?? String(b.age);
  const discountScopeKey = `${b.id}:${civ ?? ''}:${params.get('age') ?? ''}`;
  const rawDiscountAge =
    view.surface === 'garrison' ? (garrisonDiscountAge?.key === discountScopeKey ? String(garrisonDiscountAge.age) : params.get('age')) : params.get('age');
  const discount = buildingDiscountView(b, civ, rawDiscountAge);
  const construction = buildingConstructionEntry(b.id, b.age, civ);
  const showSiege = siegeBuildingEntryVerified(b, core.unitById[SIEGE_DEFAULT_UNIT_ID]);
  const showCivRank = supportsBuildingCivRank(b);
  const attack = buildingHasAttack(b);
  const workspaceStatus = host
    ? civ
      ? '查看科技效果，或配置驻军预览。'
      : '查看科技效果，或配置驻军预览。未指定文明时需先选择文明。'
    : civ
      ? '查看科技效果。'
      : '查看科技效果。未指定文明时需先选择文明。';
  const go = (patch: Record<string, string | null>) => {
    if (garrisonDiscountAge && (patch.tab !== undefined || patch.civ !== undefined)) setGarrisonDiscountAge(null);
    nav({ pathname: loc.pathname, search: patchBuildingSearch(loc.search, patch) });
  };
  const setDiscountAge = (nextAge: number) => {
    // 驻军预览工作区复用 ?age= 与 gtechs；在驻军态下切换顶部折后价时代只改局部视图，不改写驻军 URL，避免破坏已选驻军科技与结果。
    if (view.surface === 'garrison') {
      setGarrisonDiscountAge({ key: discountScopeKey, age: nextAge });
      return;
    }
    const patch: Record<string, string | null> = { age: String(nextAge) };
    for (const key of ['techs', 'gtechs'] as const) {
      const raw = params.get(key);
      if (raw === null) continue;
      const kept = raw
        .split(',')
        .filter(Boolean)
        .map(Number)
        .filter((tid) => {
          const tech = core.techById[tid];
          return !!tech && militaryTechAge(civ ?? '', tid, tech.age) <= nextAge;
        });
      patch[key] = kept.length ? kept.join(',') : null;
    }
    nav({ pathname: loc.pathname, search: patchBuildingSearch(loc.search, patch) }, { replace: true });
  };
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
            ...(showCivRank ? ([['building-civ-rank', '各文明对照', 'ov']] as const) : []),
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
        {!entityHistory.empty && (
          <button type="button" onClick={openHistory}>
            更新历史
          </button>
        )}
      </nav>

      <div className="bd-civ">
        <CivPicker id="building-civ" label="选择文明" value={civ ?? ''} onChange={setCiv} allowed={b.civs} none="未指定文明" />
        <p className="bd-kicker" data-t="civ-scope">
          {unavailableTrainingCiv
            ? `${unavailableTrainingCiv.zh}没有这座建筑。可选择拥有该建筑的文明。`
            : civ
              ? '这是目录含有情况，不是完整的科技树可用性。'
              : '未指定文明，展示全文明目录并集。'}
        </p>
      </div>

      <section className="bd-core" id="building-core" aria-label="目录基础属性与造价">
        <div>
          <h2>目录基础属性</h2>
          <p className="bd-kicker">目录基础值，不随所选文明变化，未计文明加成与科技。</p>
          <div className="bd-stat-grid">
            <Stat icon="heart" stat="hp" label="生命" value={formatHp(b.hp)} />
            <Stat icon="shield" stat="ma" label="近战护甲" value={String(b.ma)} />
            <Stat icon="shield-half" stat="pa" label="穿刺护甲" value={String(b.pa)} />
            <Stat icon="eye" stat="los" label="视野" value={String(b.los)} />
            {b.gar ? <Stat icon="users" stat="gar" label="驻扎" value={String(b.gar)} /> : null}
            {b.pop ? <Stat icon="home" stat="pop" label="人口" value={String(b.pop)} id={POP_ANCHOR} /> : null}
            {attack && (
              <>
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
          <BuildingAttackDetails atk={b.atk} atks={b.atks} />
        </div>
        <div className="bd-cost-col">
          <h2>目录造价</h2>
          <p className="bd-kicker">目录基础价，未计文明折扣与科技。</p>
          <div className="bd-cost" data-t="catalog-cost">
            <OrderedCost cost={b.cost} />
          </div>
          {discount.kind === 'price' && (
            <div className="bd-discount-card" data-t="building-discount-price" data-age={discount.selectedAge}>
              <div className="bd-discount-head">
                <span className="bd-discount-label">{civByEn(civ!)?.zh ?? civ}折后造价</span>
                {discount.variesByAge ? (
                  <div className="bd-age-seg" role="radiogroup" aria-label="折后造价时代" onKeyDown={radioKeyboard}>
                    {discount.ages.map((ageOption) => {
                      const checked = ageOption === discount.selectedAge;
                      return (
                        <button
                          key={ageOption}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          tabIndex={checked ? 0 : -1}
                          className={checked ? 'on' : undefined}
                          onClick={() => setDiscountAge(ageOption)}
                        >
                          {AGE_ZH[ageOption]}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="bd-age-badge nw" data-t="building-discount-age">
                    按{AGE_ZH[discount.selectedAge]}
                  </span>
                )}
              </div>
              {discount.activeAtSelectedAge ? (
                <>
                  <div className="bd-discount-price-row" data-t="building-discount-amount">
                    <span className="bd-discount-main">
                      <OrderedCost cost={discount.cost} base={discount.base} />
                    </span>
                    <span className="bd-discount-base">
                      目录原价{' '}
                      <s>
                        <OrderedCost cost={discount.base} />
                      </s>
                    </span>
                  </div>
                  <div data-t="building-discount-deltas">
                    <CostDeltaPills deltas={discount.deltas} />
                  </div>
                  <p className="bd-discount-source" data-t="building-discount-source">
                    <Icon name="check" className="ic" />
                    <span>
                      已计入：
                      {discount.applied
                        .map((line) => `${line.label}（\u2212${line.pct}%${line.res ? `，仅${line.res.map((r) => RES_ZH[r] ?? r).join('、')}` : ''}）`)
                        .join('、')}
                      （{AGE_ZH[discount.selectedAge]}）
                    </span>
                  </p>
                </>
              ) : (
                <p className="bd-discount-wait" data-t="building-discount-wait">
                  <OrderedCost cost={discount.base} /> · {AGE_ZH[discount.selectedAge]}暂无此折扣，{AGE_ZH[discount.firstDiscountAge]}起生效。
                </p>
              )}
              <p className="bd-discount-scope">仅含文明被动折扣，不含下方建筑科技模拟器内的科技改价。</p>
            </div>
          )}
          {discount.kind === 'unapplied' && (
            <p className="bd-discount-card is-warn" data-t="building-discount-unapplied">
              文明折扣暂未计入，当前仍按目录原价展示。
            </p>
          )}
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
          <Suspense fallback={<Loading />}>
            <BuildingSimulator b={b} />
          </Suspense>
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
          <BuildingCatalog
            key={`${b.id}-units`}
            id="building-prod"
            title="生产"
            empty="这座建筑不生产单位"
            units={produced}
            civ={civ}
            unitTraining={{ building: b.id, requestedCiv: requestedCiv?.en, techs: core.techById }}
          />
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
            <BuildingCivsHeader count={b.civs.length} showRankLink={showCivRank} />
            <div className="bd-civs">
              {b.civs.map((name) => {
                const owner = civByEn(name);
                return owner ? <CivChip key={owner.en} c={owner} /> : <span key={name}>{name}</span>;
              })}
            </div>
          </section>
          {showCivRank && <BuildingCivRank key={b.id} building={b} core={core} />}
          {!entityHistory.empty && (
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
              <summary>
                <Icon name="chevron-down" />
                <h2>更新历史</h2>
              </summary>
              <EntityHistoryInline resource={entityHistory} />
            </details>
          )}
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
