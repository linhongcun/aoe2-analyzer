import { useContext, useEffect } from 'react';
import { Link, UNSAFE_NavigationContext, useLocation, useNavigate } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { entityCivLink } from '../../../domain/civRoute';
import { civNote, dupPeers } from '../../../domain/dupNames';
import { baseUnit } from '../../../domain/family';
import { isChampiUnit } from '../../../domain/champiCounters';
import { discountedCost, priceAge } from '../../../domain/costDiscount';
import { confusablesOf } from '../../../data/confusables';
import { unitInsights } from '../../../domain/insights';
import { AGE_ZH, RES_ZH } from '../../../domain/ratings';
import { unitRelatedTechs } from '../../../domain/relatedTechs';
import { civStatus, makeSimContext, parseUnitPath, routeWithQueryCiv } from '../../../domain/simulator';
import type { Trees, Unit } from '../../../domain/types';
import { uniqueCivs, upgradeLine } from '../../../domain/units';
import { discountView, replaceUnitCiv, unitTypeLabel, unitWorkspaceOpen, upgradeNotes, withUnitTab } from '../../../domain/unitDetailView';
import { trainingSites } from '../../../domain/unitTrainingSites';
import { AgeImg, CivChip, CostView, DlcBadge, UnitIcon } from '../../../shared/ui/art';
import ChampiReferences from '../../../shared/ui/ChampiReferences';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CopyPageLink } from '../../../shared/ui/DetailBlocks';
import { Icon } from '../../../shared/ui/Icon';
import { TreeSummaryReturn } from '../../../shared/ui/TreeSummaryReturn';
import { InsightSlot } from '../../../shared/ui/InsightSlot';
import { Breadcrumbs } from '../../../shared/ui/layout';
import { HistoricalEntityDetail } from '../../../shared/ui/PatchHistory';
import { EntityHistoryInline } from '../../../shared/ui/EntityHistoryInline';
import { useEntityHistory } from '../../../shared/ui/useEntityHistory';
import Simulator from '../../../shared/ui/sim/Simulator';
import { Loading } from '../../../shared/ui/widgets';
import { minus } from '../../../shared/utils/minus';
import { unitDisplayAge } from '../displayAge';
import { unitSiegeHref } from '../siegeEntry';
import { resolveUnitForm } from '../unitFormDetail';
import { UnitNotes } from './UnitNotes';
import { AgeCounterBonuses } from './AgeCounterBonuses';
import { ConversionMechanics } from './ConversionMechanics';
import { FishingGather } from './FishingGather';
import { ScoutAgeChanges } from './ScoutAgeChanges';
import { SplashMechanics } from './SplashMechanics';
import { TrebuchetStates } from './TrebuchetStates';
import UnitList from './UnitList';
import { VillagerGather } from './VillagerGather';
import UnitGarrison from './UnitGarrison';
import { UnitTransportCapacity } from './UnitTransportCapacity';
import { BuildingTag, CatalogStats, GatherLine, RelatedTechs } from './unitDetailParts';
import { ReverseCounters } from './ReverseCounters';
import { projectUnitForDetail, useUnitDetailResources } from '../unitDetailSafety';
import { readReverseCounterSession, reverseCounterSessionKey } from '../reverseCounterSession';
import { advanceUnitSimReturnState, createUnitSimReturnState, readUnitSimReturnSource, sameUnitSimLocation } from '../unitSimReturnProvenance';
import type { SimNavigationAdapter } from '../../../shared/hooks/useSimState';
import { UpgradeLine } from './UpgradeLine';
import { UnitTrainingConditions } from './UnitTrainingConditions';
import { FormAccess, FormBar, FormDifference } from './UnitForms';
import './unit-detail.css';

const JUMPS = [
  ['unit-core', '属性'],
  ['unit-obtain', '如何获得'],
  ['unit-garrison', '驻军'],
  ['unit-notes', '说明'],
  ['unit-related', '相关'],
  ['unit-sim', '模拟器'],
  ['unit-history', '更新历史'],
  ['unit-reverse-counters', '反向查询'],
] as const;

export default function UnitDetail() {
  const loc = useLocation();
  const nav = useNavigate();
  const navigator = useContext(UNSAFE_NavigationContext).navigator;
  const resources = useUnitDetailResources();
  const core = resources.core;
  const trees = resources.trees;
  const rt = parseUnitPath(loc.pathname);
  const params = new URLSearchParams(loc.search);
  const tab = params.get('tab');
  const pathToken = rt?.civ;
  const pathCiv = pathToken ? civByEn(pathToken) : undefined;
  const queryCiv = civByEn(params.get('civ') ?? '');
  const { owner, alternate, rawTarget } = resolveUnitForm(core, rt?.id);
  const context = alternate ? undefined : pathToken ? pathCiv : queryCiv;
  const me = civByEn(params.get('me') ?? '');
  const opp = civByEn(params.get('opp') ?? '');
  const targetProjection = rawTarget ? projectUnitForDetail(rawTarget) : null;
  const u = targetProjection?.unit;
  const entityHistory = useEntityHistory(u ? 'unit/' + u.id : undefined, tab === 'history');
  const savedReverseSession = readReverseCounterSession(reverseCounterSessionKey(rt?.id ?? null, context?.en ?? '', loc), loc);
  const hasSavedReverseReaderLocation = !!(savedReverseSession?.anchor || savedReverseSession?.fallbackAnchor);
  const workspace = rt ? unitWorkspaceOpen(rt, loc.search) : false;
  const setHistory = (open: boolean) => {
    const next = new URLSearchParams(loc.search);
    if (open) next.set('tab', 'history');
    else if (next.get('tab') === 'history') next.delete('tab');
    const query = next.toString();
    nav({ pathname: loc.pathname, search: query ? `?${query}` : '' }, { state: loc.state });
  };

  useEffect(() => {
    if (hasSavedReverseReaderLocation) return;
    if (workspace) document.getElementById('unit-sim')?.scrollIntoView({ block: 'start' });
    else if (tab === 'rel') document.getElementById('unit-related')?.scrollIntoView({ block: 'start' });
    else if (tab === 'history' && !entityHistory.empty) document.getElementById('unit-history')?.scrollIntoView({ block: 'start' });
    else scrollTo(0, 0);
  }, [u?.id, workspace, tab, hasSavedReverseReaderLocation, entityHistory.empty]);

  if (!core)
    return (
      <section className="pane">
        {resources.coreError ? (
          <p role="alert">
            {resources.rawCore ? '单位资料结构无法解析，当前地址保留。' : '单位资料加载失败，当前地址保留。'}
            <button type="button" className="ud-btn" onClick={resources.retryCore} disabled={resources.corePending}>
              {resources.corePending ? '正在重试…' : '重试资料'}
            </button>
          </p>
        ) : (
          <Loading />
        )}
      </section>
    );
  if (!rt) return <UnitList />;
  if (!u || !owner) return <HistoricalEntityDetail target={{ targetType: 'unit', targetId: rt.id }} />;

  const displayAge = unitDisplayAge(u, context?.en ?? '');
  const base = baseUnit(owner, core.fam);
  const elite = core.fam.eliteOf[base.id];
  const isE = owner.id !== base.id;
  const relation = owner.form ? { owner, form: owner.form, alternate: !!alternate, elite: isE, otherTier: (isE ? base : elite)?.form } : null;
  const showUpgrade = elite && (!alternate || alternate.kind === 'weapon');
  const typeLabel = unitTypeLabel(u.type);
  const canTrain = !!context && u.civs.includes(context.en);
  const quote = canTrain && context ? discountedCost(u, context.en, priceAge(u.age, rt.age ?? null)) : null;
  const discount = discountView(context?.en, canTrain, quote);
  const gatherCost = discount.kind === 'price' ? discount.cost : u.cost;
  const status = context && trees ? civStatus(trees, context.en) : null;
  const avail = status ? (id: number) => status['u' + id] === 1 : undefined;
  const line = trees && !alternate ? upgradeLine(u, core.units, core.unitById, avail) : [];
  const notes = trees && !alternate ? upgradeNotes(line, core.units, avail) : [];
  const rel = trees ? unitRelatedTechs(makeSimContext(core.techs, trees), u, context?.en) : null;
  const peers = alternate ? [] : dupPeers(base, core.units);
  const conf =
    alternate || peers.length
      ? []
      : confusablesOf(base.id)
          .map((c) => ({ u: core.unitById[c.other], reason: c.reason }))
          .filter((c) => c.u);
  const insights = unitInsights(u.id);
  const training = alternate ? null : trainingSites(u, context?.en);
  const site = training?.kind === 'available' ? training.primary : null;
  const buildingId = site?.building ?? u.b;
  const building = core.buildingById[buildingId];
  const trainingBuilding =
    training?.kind !== 'unavailable' ? (
      <BuildingTag id={buildingId} zh={site ? (building?.zh ?? '资料待核') : u.bz} building={building} civ={site?.civ} />
    ) : null;
  const siegeHref = unitSiegeHref(u, core.buildingById[82]);
  const invalidCombatProjection = targetProjection?.invalidFields.some((field) => ['atks', 'armc', 'arms'].includes(field)) ?? false;
  const showEngine = workspace && (!context || canTrain) && !invalidCombatProjection;
  const simulatorRoute = routeWithQueryCiv(rt, context && canTrain ? context.en : undefined, u.civs);
  const simNavigationAdapter: SimNavigationAdapter = ({ current, next, civ }) => {
    const historyKey = (window.history.state as { key?: unknown } | null)?.key;
    if (typeof historyKey === 'string' && historyKey !== loc.key) return { kind: 'ignore' };
    const rendered = { pathname: loc.pathname, search: loc.search, hash: loc.hash };
    if (!sameUnitSimLocation(current, rendered)) return { kind: 'ignore' };
    return { kind: 'navigate', state: advanceUnitSimReturnState(loc.state, current, next, u.id, u.civs, civ) };
  };
  const swap = (id: number) => loc.pathname.replace(/^\/unit\/\d+/, '/unit/' + id) + loc.search;
  const setCiv = (en: string) => {
    const next = replaceUnitCiv(loc.pathname, loc.search, en);
    nav({ pathname: next.pathname, search: next.search }, { replace: true });
  };
  const openSim = () => {
    const source = { pathname: loc.pathname, search: loc.search, hash: loc.hash };
    const destination = { pathname: loc.pathname, search: withUnitTab(loc.search, 'sim'), hash: loc.hash };
    const state = createUnitSimReturnState(source, destination, u.id, u.civs, context?.en);
    // Bypass useNavigate's resolveTo normalization to preserve valid empty pathname segments.
    navigator.push(destination, state);
  };
  const closeSim = () => {
    const current = { pathname: loc.pathname, search: loc.search, hash: loc.hash };
    const source = readUnitSimReturnSource(loc.state, current, u.id, u.civs, context?.en);
    if (source) navigator.push(source, null);
    else nav({ pathname: loc.pathname, search: withUnitTab(loc.search, 'ov') });
  };
  const forkCivs = (id: number) => {
    if (!trees) return '';
    const target = core.unitById[id];
    if (!target) return '';
    const names = uniqueCivs(target, trees).map((en) => civByEn(en)?.zh ?? en);
    if (!names.length || names.length > 4) return '';
    return `（${names.join('、')}）`;
  };
  const nodeCiv = (x: Unit, tree: Trees) => {
    if (x.type !== 'UniqueUnit') return null;
    const names = uniqueCivs(x, tree).map((en) => civByEn(en)?.zh ?? en);
    if (!names.length || names.length > 3) return null;
    return <span className="ud-node-meta">{names.join('、')}</span>;
  };
  const cz = (en: string) => civByEn(en)?.zh;
  const showEliteResearch = !!(elite?.up && (u.id === elite.id || u.id === base.id));
  const showPrior = !!(u.up && u.id !== elite?.id);
  const treeWaiting = resources.treesError ? (
    <p role="alert">
      {resources.rawTrees ? '科技树结构无法解析，目录资料仍可查看。' : '科技树资料加载失败，目录资料仍可查看。'}
      <button type="button" className="ud-btn" onClick={resources.retryTrees} disabled={resources.treesPending}>
        {resources.treesPending ? '正在重试…' : '重试科技树'}
      </button>
    </p>
  ) : resources.treesPending ? (
    <p className="ud-kicker">科技树资料加载中，目录资料仍可查看。</p>
  ) : (
    <p role="alert">科技树资料尚不可用，目录资料仍可查看。</p>
  );

  return (
    <section id="unit" className="pane ud" data-view={workspace ? 'simulator' : 'overview'}>
      <Breadcrumbs current={u.zh} />
      <TreeSummaryReturn civ={context} kind="u" id={u.id} />
      <div className="ud-id" data-t="unit-identity">
        <div className="ud-icon">
          <UnitIcon u={u} big />
        </div>
        <div className="ud-id-main">
          <h1>
            {u.zh}
            {(relation || peers.length > 0 || conf.length > 0) && <span className="civnote">{civNote(u, cz)}</span>}
          </h1>
          <p className="ud-en">
            {u.en} · id <span className="num nw">{u.id}</span>
          </p>
          <div className="ud-tags">
            {typeLabel && (
              <span className="ud-tag" data-t="unit-type">
                {typeLabel}
                {alternate && (alternate.kind === 'dismount' ? ' · 下马替身' : ' · 切换形态')}
              </span>
            )}
            <span className="ud-tag" data-t="display-age">
              <AgeImg age={displayAge} />
              {alternate?.kind === 'dismount' ? (
                (isE ? '精锐档' : '普通档') + '（随骑乘档位）'
              ) : (
                <>
                  {AGE_ZH[displayAge] ?? displayAge}
                  {alternate && (alternate.kind === 'barrage' ? '（无精锐档）' : isE ? '（精锐档）' : '（普通档）')}
                </>
              )}
            </span>
            {alternate ? <span className="ud-tag">非独立训练单位</span> : trainingBuilding}
            <DlcBadge i={u.dlc} />
          </div>
          {u.id === 93 && (
            <p className="ud-kicker" data-t="spear-age">
              通常在封建时代可用；亚美尼亚可在黑暗时代训练长矛兵。
            </p>
          )}
        </div>
        <div className="ud-id-actions">
          {showUpgrade && elite && (
            <div className="eseg" role="radiogroup" aria-label="普通或精锐">
              <Link
                role="radio"
                aria-checked={!isE}
                className={isE ? undefined : 'on'}
                to={alternate && base.form ? '/unit/' + base.form.id : swap(base.id)}
                replace
              >
                普通
              </Link>
              <Link
                role="radio"
                aria-checked={isE}
                className={isE ? 'on' : undefined}
                to={alternate && elite.form ? '/unit/' + elite.form.id : swap(elite.id)}
                replace
              >
                精锐
              </Link>
            </div>
          )}
          <CopyPageLink />
        </div>
      </div>

      {relation && <FormBar {...relation} />}

      <nav className="ud-jump" aria-label="本页章节">
        {JUMPS.filter(
          ([id]) =>
            (!alternate || (id !== 'unit-obtain' && id !== 'unit-garrison' && id !== 'unit-sim')) &&
            (id !== 'unit-garrison' || !workspace) &&
            (id !== 'unit-history' || !entityHistory.empty),
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === 'unit-history') setHistory(true);
              document.getElementById(id)?.scrollIntoView({ block: 'start' });
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="ud-civ">
        {!alternate && <CivPicker id="unitciv" label="选择文明" value={context?.en ?? ''} onChange={setCiv} none="不指定" />}
        <p className="ud-kicker">
          目录基础值，未计文明加成与科技。
          {alternate &&
            (alternate.kind === 'weapon'
              ? '训练与文明模拟请回到原单位。'
              : alternate.kind === 'barrage'
                ? '本形态不进单位 PK 或科技模拟器。'
                : '下马后不可单独升级，档位由骑乘单位是否升级精锐决定。')}
        </p>
        {context && !canTrain && (
          <p className="ud-kicker" data-t="cannot-train">
            该文明无法训练本单位
          </p>
        )}
      </div>

      <section className="ud-core" id="unit-core" aria-label={alternate ? '目录基础属性与获取方式' : '目录基础属性与造价'}>
        <div className="ud-stats">
          <h2>目录基础属性</h2>
          <CatalogStats u={u} base={base} elite={isE && !alternate} meleeForm={!!alternate && alternate.kind !== 'barrage'} />
          {alternate ? <FormDifference owner={owner} form={alternate} /> : <UnitTransportCapacity unit={u} civ={context} />}
        </div>
        {alternate ? (
          <FormAccess owner={owner} form={alternate} elite={isE} />
        ) : (
          <div className="ud-cost-col">
            <h2>目录造价</h2>
            <p className="ud-kicker">目录造价，未计文明折扣。</p>
            <div className="ud-cost" data-t="catalog-cost">
              <CostView c={u.cost} />
            </div>
            {(u.id === 1759 || u.id === 1761) && (u.cost.Food ?? 0) === 0 && <p className="ud-kicker">训练不消耗食物。</p>}
            {discount.kind === 'price' && (
              <div className="ud-discount" data-t="discount-price">
                <span>折后训练价</span>
                <CostView c={discount.cost} />
                {discount.applied.map((a) => (
                  <span key={`${a.idx ?? 'x'}-${a.techs.join('-')}-${a.label}`} className="ud-discount-line">
                    {minus(`已计入：${a.label} -${a.pct}%${a.res ? `，仅${a.res.map((r) => RES_ZH[r] ?? r).join('、')}` : ''}`)}
                  </span>
                ))}
              </div>
            )}
            {discount.kind === 'unapplied' && (
              <p className="ud-discount" data-t="discount-unapplied">
                折扣未计入
              </p>
            )}
          </div>
        )}
      </section>
      {u.id === 331 && <p className="ud-kicker">目录护甲、准确度和移动是打包记录；攻击、射程和攻击间隔是展开记录。科技模拟器不切换这两态。</p>}

      {!alternate && (
        <section className="ud-section" id="unit-obtain" aria-label="如何获得与升级">
          <h2>如何获得与升级</h2>
          <p className="ud-obtain">
            {trainingBuilding}
            <span className="num nw">
              <Icon name="clock" />
              {u.tt}秒
            </span>
          </p>
          <UnitTrainingConditions training={training} core={core} />
          {showPrior && u.up && (
            <p>
              从上一级升级为{u.zh}：<CostView c={u.up[0]} />{' '}
              <span className="num nw">
                <Icon name="clock" />
                {u.up[1]}秒
              </span>
            </p>
          )}
          {showEliteResearch && elite?.up && (
            <p id="ediff">
              精锐升级研究：
              <CostView c={elite.up[0]} />{' '}
              <span className="num nw">
                <Icon name="clock" />
                {elite.up[1]}秒
              </span>
            </p>
          )}
          {trees ? (
            <UpgradeLine>
              {line.map((x, index) => (
                <span key={x.id} className="ud-line-step">
                  {index > 0 && <Icon name="chevron-right" className="ic ud-line-connector" />}
                  {x.id === u.id ? (
                    <span className="ud-node is-current" aria-current="true">
                      <UnitIcon u={x} />
                      <span>
                        <span className="ud-node-name">{x.zh}</span>
                        {nodeCiv(x, trees)}
                      </span>
                    </span>
                  ) : (
                    <Link className="ud-node" to={entityCivLink('unit', x.id, site?.civ)}>
                      <UnitIcon u={x} />
                      <span>
                        <span className="ud-node-name">{x.zh}</span>
                        {nodeCiv(x, trees)}
                      </span>
                    </Link>
                  )}
                </span>
              ))}
            </UpgradeLine>
          ) : (
            treeWaiting
          )}
          {notes.map((note) => (
            <p key={note.id} className="ud-kicker" data-t="upgrade-note">
              {note.kind === 'fork' ? `另有独特升级：${note.zh}${forkCivs(note.id)}` : `该文明没有${note.zh}这一升级形态`}
            </p>
          ))}
        </section>
      )}

      {!alternate && !workspace && (
        <UnitGarrison
          core={core}
          trees={trees}
          unitId={u.id}
          civ={context?.en ?? ''}
          error={resources.treesError}
          pending={resources.treesPending}
          retry={resources.retryTrees}
        />
      )}

      <UnitNotes u={u} relation={relation} techs={core.techs} invalid={!!targetProjection?.invalidFields.length} />

      <ReverseCounters
        key={reverseCounterSessionKey(u.id, context?.en ?? '', loc) ?? `${u.id}:${context?.en ?? ''}`}
        target={u}
        rawTarget={rawTarget!}
        targetIssues={targetProjection?.invalidFields ?? []}
        core={core}
        corePending={resources.corePending}
        coreError={resources.coreError}
        retryCore={resources.retryCore}
        trees={trees}
        rawTrees={resources.rawTrees}
        treesPending={resources.treesPending}
        treesError={resources.treesError}
        retryTrees={resources.retryTrees}
        targetCiv={context?.en ?? ''}
        location={loc}
      />

      {trees && isChampiUnit(u.id) ? <ChampiReferences core={core} trees={trees} variant="unit" /> : null}
      <TrebuchetStates unit={u} />
      <ScoutAgeChanges unit={u} />
      <AgeCounterBonuses unitId={u.id} unitById={core.unitById} />
      <ConversionMechanics unitId={u.id} techs={core.techs} />
      <SplashMechanics unit={u} />
      <VillagerGather unitId={u.id} />
      <FishingGather unitId={u.id} />
      {insights.length > 0 && <InsightSlot items={insights} />}
      {!alternate && <GatherLine u={u} cost={gatherCost} age={rt.age} civ={canTrain && context ? context.en : ''} />}

      <section className="ud-section" id="unit-related" aria-label="相关">
        <h2>相关</h2>
        {(peers.length > 0 || conf.length > 0) && (
          <div data-t="rel-first">
            {peers.map((p) => (
              <Link key={p.id} className="ud-rel" to={`/unit/${p.id}`} data-t="dup-link">
                <Icon name="copy" />
                <span>
                  同名单位：{p.zh}
                  <span className="civnote">{civNote(p, cz)}</span>
                </span>
              </Link>
            ))}
            {conf.map(({ u: other, reason }) => (
              <Link key={other!.id} className="ud-rel" to={`/unit/${other!.id}`} data-t="conf-link">
                <Icon name="info" />
                <span>
                  别和 {other!.zh} 混淆
                  {reason && <span className="ud-kicker">{reason}</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
        <h3>相关科技</h3>
        {rel ? <RelatedTechs items={rel} civ={context?.en} /> : treeWaiting}
        <h3>
          可用文明（<span className="num nw">{u.civs.length}</span>/<span className="num nw">{civs.length}</span>）
        </h3>
        <div className="ud-civs">
          {u.civs.map((name) => {
            const c = civByEn(name);
            return c ? <CivChip key={c.en} c={c} /> : <span key={name}>{name}</span>;
          })}
        </div>
      </section>

      {alternate ? (
        workspace && (
          <section className="ud-section" id="unit-sim">
            <h2>科技模拟器</h2>
            <p>当前形态仅用于查阅目录基础属性，不开放科技模拟器。请返回原单位使用模拟器与单位 PK。</p>
            <Link className="ud-btn" to={'/unit/' + owner.id}>
              回到原单位
            </Link>
          </section>
        )
      ) : (
        <section className="ud-section" id="unit-sim" aria-label="科技模拟器">
          <div className="ud-sim-entry">
            <div>
              <h2>科技模拟器</h2>
              <p>
                这里给出当前设置下的近似模拟值。已建模科技与部分文明加成计入；独特科技与未建模效果可能只显示文本、不计入。累计研究费用汇总在工作区里，不是训练价。
              </p>
            </div>
            {workspace ? (
              <button type="button" className="ud-btn" onClick={closeSim}>
                返回概览
              </button>
            ) : (
              <button type="button" className="ud-btn" onClick={openSim}>
                打开科技模拟器 <Icon name="arrow-right" />
              </button>
            )}
          </div>
          {workspace && (
            <div className="ud-workspace" data-t="workspace-open">
              {showEngine ? (
                <Simulator key={u.id} u={u} route={simulatorRoute} navigationAdapter={simNavigationAdapter} />
              ) : invalidCombatProjection ? (
                <p role="alert" data-t="workspace-invalid-target">
                  本单位攻击或护甲类别资料异常，已停用模拟器；不会用清理后的零值代替原始数据。
                </p>
              ) : (
                <p>该文明无法训练本单位，因此不给出该文明的近似模拟值。</p>
              )}
            </div>
          )}
        </section>
      )}

      {!alternate && (siegeHref || (me && opp)) && (
        <nav className="ud-tools" aria-label="本页相关工具">
          {me && opp && (
            <Link className="ud-btn" to={`/matchup?${new URLSearchParams({ me: me.en, opp: opp.en })}`}>
              <Icon name="arrow-left" /> 回对局助手
            </Link>
          )}
          {siegeHref && (
            <Link className="ud-btn" to={siegeHref} data-testid="unit-siege-entry">
              <Icon name="hammer" /> 算拆建筑
            </Link>
          )}
        </nav>
      )}

      {!entityHistory.empty && (
        <details
          className="ud-history"
          id="unit-history"
          open={tab === 'history'}
          onToggle={(event) => {
            if (event.currentTarget.open === (tab === 'history')) return;
            setHistory(event.currentTarget.open);
          }}
        >
          <summary>
            <h2>更新历史</h2>
            <Icon name="chevron-down" />
          </summary>
          <EntityHistoryInline resource={entityHistory} />
        </details>
      )}
    </section>
  );
}
