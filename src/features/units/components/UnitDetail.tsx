import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
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
import { AgeImg, CivChip, CostView, DlcBadge, UnitIcon } from '../../../shared/ui/art';
import ChampiReferences from '../../../shared/ui/ChampiReferences';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CopyPageLink, DetailSource } from '../../../shared/ui/DetailBlocks';
import { Icon } from '../../../shared/ui/Icon';
import { InsightSlot } from '../../../shared/ui/InsightSlot';
import { Breadcrumbs } from '../../../shared/ui/layout';
import { PatchHistory, HistoricalEntityDetail } from '../../../shared/ui/PatchHistory';
import { ArmorClasses, BonusTable } from '../../../shared/ui/sim/SimPanel';
import Simulator from '../../../shared/ui/sim/Simulator';
import { Linked, Loading } from '../../../shared/ui/widgets';
import { minus } from '../../../shared/utils/minus';
import { useCoreTrees } from '../../../shared/utils/useCoreTrees';
import { unitDisplayAge } from '../displayAge';
import { unitSiegeHref } from '../siegeEntry';
import { AccuracyBoundaryNote } from './AccuracyBoundaryNote';
import { AgeCounterBonuses } from './AgeCounterBonuses';
import { ConversionMechanics } from './ConversionMechanics';
import { FishingGather } from './FishingGather';
import { ScoutAgeChanges } from './ScoutAgeChanges';
import { SplashMechanics, splashDescription } from './SplashMechanics';
import { TrebuchetStates } from './TrebuchetStates';
import UnitList from './UnitList';
import { VillagerGather } from './VillagerGather';
import { BuildingTag, CatalogStats, GatherLine, RelatedTechs } from './unitDetailParts';
import './unit-detail.css';

const JUMPS = [
  ['unit-core', '属性'],
  ['unit-obtain', '如何获得'],
  ['unit-notes', '说明'],
  ['unit-related', '相关'],
  ['unit-sim', '模拟器'],
  ['unit-history', '更新历史'],
] as const;

export default function UnitDetail() {
  const loc = useLocation();
  const nav = useNavigate();
  const resources = useCoreTrees();
  const core = resources.core.data;
  const trees = resources.trees.data;
  const rt = parseUnitPath(loc.pathname);
  const params = new URLSearchParams(loc.search);
  const tab = params.get('tab');
  const pathToken = rt?.civ;
  const pathCiv = pathToken ? civByEn(pathToken) : undefined;
  const queryCiv = civByEn(params.get('civ') ?? '');
  const context = pathToken ? pathCiv : queryCiv;
  const me = civByEn(params.get('me') ?? '');
  const opp = civByEn(params.get('opp') ?? '');
  const u = core && rt ? core.unitById[rt.id] : undefined;
  const workspace = rt ? unitWorkspaceOpen(rt, loc.search) : false;

  useEffect(() => {
    if (workspace) document.getElementById('unit-sim')?.scrollIntoView({ block: 'start' });
    else if (tab === 'rel') document.getElementById('unit-related')?.scrollIntoView({ block: 'start' });
    else scrollTo(0, 0);
  }, [u?.id, workspace, tab]);

  if (!core)
    return (
      <section className="pane">
        {resources.core.error ? (
          <p role="alert">
            单位资料加载失败，当前地址保留。
            <button type="button" className="ud-btn" onClick={resources.core.retry}>
              重试资料
            </button>
          </p>
        ) : (
          <Loading />
        )}
      </section>
    );
  if (!rt) return <UnitList />;
  if (!u) return <HistoricalEntityDetail target={{ targetType: 'unit', targetId: rt.id }} />;

  const displayAge = unitDisplayAge(u, context?.en ?? '');
  const base = baseUnit(u, core.fam);
  const elite = core.fam.eliteOf[base.id];
  const isE = u.id !== base.id;
  const typeLabel = unitTypeLabel(u.type);
  const canTrain = !!context && u.civs.includes(context.en);
  const quote = canTrain && context ? discountedCost(u, context.en, priceAge(u.age, rt.age ?? null)) : null;
  const discount = discountView(context?.en, canTrain, quote);
  const gatherCost = discount.kind === 'price' ? discount.cost : u.cost;
  const status = context && trees ? civStatus(trees, context.en) : null;
  const avail = status ? (id: number) => status['u' + id] === 1 : undefined;
  const line = trees ? upgradeLine(u, core.units, core.unitById, avail) : [];
  const notes = trees ? upgradeNotes(line, core.units, avail) : [];
  const rel = trees ? unitRelatedTechs(makeSimContext(core.techs, trees), u, context?.en) : null;
  const peers = dupPeers(base, core.units);
  const conf = peers.length
    ? []
    : confusablesOf(base.id)
        .map((c) => ({ u: core.unitById[c.other], reason: c.reason }))
        .filter((c) => c.u);
  const insights = unitInsights(u.id);
  const bonuses = Object.fromEntries(u.atks.filter(([name]) => name !== '近战' && name !== '穿刺'));
  const armorClasses = u.armc.filter(([name]) => !/^类别\d+$/.test(name));
  const building = core.buildingById[u.b];
  const siegeHref = unitSiegeHref(u, core.buildingById[82]);
  const showEngine = workspace && (!context || canTrain);
  const simulatorRoute = routeWithQueryCiv(rt, context && canTrain ? context.en : undefined, u.civs);
  const swap = (id: number) => loc.pathname.replace(/^\/unit\/\d+/, '/unit/' + id) + loc.search;
  const setCiv = (en: string) => {
    const next = replaceUnitCiv(loc.pathname, loc.search, en);
    nav({ pathname: next.pathname, search: next.search }, { replace: true });
  };
  const openSim = () => nav({ pathname: loc.pathname, search: withUnitTab(loc.search, 'sim') });
  const closeSim = () => nav({ pathname: loc.pathname, search: withUnitTab(loc.search, 'ov') });
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
  const treeWaiting = resources.trees.error ? (
    <p role="alert">
      科技树资料加载失败，目录资料仍可查看。
      <button type="button" className="ud-btn" onClick={resources.trees.retry}>
        重试科技树
      </button>
    </p>
  ) : (
    <p className="ud-kicker">科技树资料加载中，目录资料仍可查看。</p>
  );

  return (
    <section id="unit" className="pane ud" data-view={workspace ? 'simulator' : 'overview'}>
      <Breadcrumbs current={u.zh} />
      <div className="ud-id" data-t="unit-identity">
        <div className="ud-icon">
          <UnitIcon u={u} big />
        </div>
        <div className="ud-id-main">
          <h1>
            {u.zh}
            {(peers.length > 0 || conf.length > 0) && <span className="civnote">{civNote(u, cz)}</span>}
          </h1>
          <p className="ud-en">
            {u.en} · id <span className="num nw">{u.id}</span>
          </p>
          <div className="ud-tags">
            {typeLabel && (
              <span className="ud-tag" data-t="unit-type">
                {typeLabel}
              </span>
            )}
            <span className="ud-tag" data-t="display-age">
              <AgeImg age={displayAge} />
              {AGE_ZH[displayAge] ?? displayAge}
            </span>
            <BuildingTag id={u.b} zh={u.bz} building={building} />
            <DlcBadge i={u.dlc} />
          </div>
          {u.id === 93 && (
            <p className="ud-kicker" data-t="spear-age">
              通常在封建时代可用；亚美尼亚可在黑暗时代训练长矛兵。
            </p>
          )}
        </div>
        <div className="ud-id-actions">
          {elite && (
            <div className="eseg" role="radiogroup" aria-label="普通或精锐">
              <Link role="radio" aria-checked={!isE} className={isE ? undefined : 'on'} to={swap(base.id)} replace>
                普通
              </Link>
              <Link role="radio" aria-checked={isE} className={isE ? 'on' : undefined} to={swap(elite.id)} replace>
                精锐
              </Link>
            </div>
          )}
          <CopyPageLink />
        </div>
      </div>

      <nav className="ud-jump" aria-label="本页章节">
        {JUMPS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ block: 'start' })}>
            {label}
          </button>
        ))}
      </nav>

      <div className="ud-civ">
        <CivPicker id="unitciv" label="选择文明" value={context?.en ?? ''} onChange={setCiv} none="不指定" />
        <p className="ud-kicker">目录基础值，未计文明加成与科技。</p>
        {context && !canTrain && (
          <p className="ud-kicker" data-t="cannot-train">
            该文明无法训练本单位
          </p>
        )}
      </div>

      <section className="ud-core" id="unit-core" aria-label="目录基础属性与造价">
        <div className="ud-stats">
          <h2>目录基础属性</h2>
          <p className="ud-kicker">目录基础值，未计文明加成与科技。</p>
          <CatalogStats u={u} base={base} elite={isE} />
        </div>
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
      </section>
      {u.id === 331 && <p className="ud-kicker">目录护甲、准确度和移动是打包记录；攻击、射程和攻击间隔是展开记录。科技模拟器不切换这两态。</p>}

      <section className="ud-section" id="unit-obtain" aria-label="如何获得与升级">
        <h2>如何获得与升级</h2>
        <p className="ud-obtain">
          <BuildingTag id={u.b} zh={u.bz} building={building} />
          <span className="num nw">
            <Icon name="clock" />
            {u.tt}秒
          </span>
        </p>
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
          <div className="ud-line">
            {line.map((x, index) => (
              <span key={x.id} className="ud-line-step">
                {index > 0 && <Icon name="chevron-right" />}
                {x.id === u.id ? (
                  <span className="ud-node is-current" aria-current="true">
                    <UnitIcon u={x} />
                    <span>
                      <span className="ud-node-name">{x.zh}</span>
                      {nodeCiv(x, trees)}
                    </span>
                  </span>
                ) : (
                  <Link className="ud-node" to={`/unit/${x.id}`}>
                    <UnitIcon u={x} />
                    <span>
                      <span className="ud-node-name">{x.zh}</span>
                      {nodeCiv(x, trees)}
                    </span>
                  </Link>
                )}
              </span>
            ))}
          </div>
        ) : (
          treeWaiting
        )}
        {notes.map((note) => (
          <p key={note.id} className="ud-kicker" data-t="upgrade-note">
            {note.kind === 'fork' ? `另有独特升级：${note.zh}${forkCivs(note.id)}` : `该文明没有${note.zh}这一升级形态`}
          </p>
        ))}
      </section>

      <section className="ud-section" id="unit-notes" aria-label="适用加成、护甲与说明">
        <h2>适用加成、护甲与说明</h2>
        {u.id === 331 && <p className="ud-kicker">下列攻击加成按已核同的展开攻击字段列出。</p>}
        {Object.keys(bonuses).length > 0 && <BonusTable B={bonuses} headingLevel={3} />}
        {u.arms.length > 0 && (
          <div>
            <h3>护甲</h3>
            <ul className="ud-arms">
              {u.arms.map(([name, value]) => (
                <li key={name}>
                  {name} <span className="num nw">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {armorClasses.length > 0 && (
          <>
            {u.id === 331 && (
              <p className="ud-kicker" data-t="trebuchet-armor">
                下列为目录打包记录的护甲类别，不代表展开态。
              </p>
            )}
            <ArmorClasses list={u.armc} headingLevel={3} />
          </>
        )}
        <p>
          准确度 <span className="num nw">{u.acc}%</span>
        </p>
        {u.id === 331 && <p className="ud-kicker">目录打包记录的准确度，不代表展开命中率。</p>}
        <AccuracyBoundaryNote unit={u} techs={core.techs} />
        {!!u.blast && (
          <p>
            溅射范围 <span className="num nw">{u.blast}</span>
          </p>
        )}
        <h3>说明</h3>
        <p className="ud-desc">
          <Linked text={u.id === 331 ? u.desc.replace('组装后才能移动，拆装后即可攻击', '打包后可移动，展开后可攻击') : splashDescription(u)} nl />
        </p>
        <DetailSource note="目录基础值，未计文明加成与科技。" />
      </section>

      {trees && isChampiUnit(u.id) ? <ChampiReferences core={core} trees={trees} variant="unit" /> : null}
      <TrebuchetStates unit={u} />
      <ScoutAgeChanges unit={u} />
      <AgeCounterBonuses unitId={u.id} unitById={core.unitById} />
      <ConversionMechanics unitId={u.id} techs={core.techs} />
      <SplashMechanics unit={u} />
      <VillagerGather unitId={u.id} />
      <FishingGather unitId={u.id} />
      {insights.length > 0 && <InsightSlot items={insights} />}
      <GatherLine u={u} cost={gatherCost} age={rt.age} civ={canTrain && context ? context.en : ''} />

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
              打开科技模拟器
            </button>
          )}
        </div>
        {workspace && (
          <div className="ud-workspace" data-t="workspace-open">
            {showEngine ? <Simulator key={u.id} u={u} route={simulatorRoute} /> : <p>该文明无法训练本单位，因此不给出该文明的近似模拟值。</p>}
          </div>
        )}
      </section>

      {(siegeHref || (me && opp)) && (
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

      <details className="ud-history" id="unit-history">
        <summary>更新历史</summary>
        <PatchHistory target={{ targetType: 'unit', targetId: u.id, targetNameZh: u.zh }} />
      </details>
    </section>
  );
}
