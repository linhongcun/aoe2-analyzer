/** 工具：单位 PK（1v1 / N vs M / 等资源 / 混编），URL 与结果协调。 */
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCoreTrees, type CoreTreesResources } from '../../../shared/utils/useCoreTrees';
import ChampiReferences from '../../../shared/ui/ChampiReferences';
import { CivArtCredit } from '../../../shared/ui/CivArtCredit';
import { isChampiUnit } from '../../../domain/champiCounters';
import { damageByClass } from '../../../domain/duel';
import { buildDuelBudgetErrorParts, DUEL_UNIT_REPLACED_NOTE, isDuelExcludedUnit, replaceDuelUnitId, resolveSideBudgetCount } from '../../../domain/duelBudget';
import { unitTrainCount } from '../../../domain/trainBatch';
import '../duel-headings.css';
import { collapse } from '../../../domain/family';
import { makeSimContext } from '../../../domain/simulator';
import { fmtSide, parseSide, type SideSpec } from '../../../domain/duelState';
import { canonDuelKite, canonDuelParams, canonDuelRelics, decodeDuelKite, decodeDuelParams, decodeDuelRelics } from '../../../domain/duelParams';
import { unitRelicBonus } from '../../../domain/effects';
import type { KiteOptions } from '../../../domain/contactKite';
import { buildsPath } from '../../../domain/matchupRoute';
import '../../../shared/ui/contextLinks.css';
import { fmtClock, realCostOf } from '../../../domain/realCost';
import { extractDuelSourceParams, readDuelMatchupContext } from '../logic/duelContext';
import { buildEnterMixedParams, formatBreakEvenSide, rawUid, resolveDuelKiteEligibility, techFieldInvalid } from '../logic/duelKiteView';
import { readLinkAdjustedParams, resolveDuelMixedHint, swapDuelNumericDrafts } from '../logic/duelNumericDraft';
import { swapSingleDuelParams } from '../logic/duelSwap';
import { DUEL_COST_MODEL } from '../logic/trainingCostView';
import { Icon } from '../../../shared/ui/Icon';
import { DuelFieldErrors, DuelNumericField, DuelParamAdjustedNotice } from './DuelNumericFeedback';
import { DuelNPairHints, pairBatchQtyPatch } from './DuelTradeAndBudget';
import { useDuelNumericState } from './useDuelNumericState';
import { radioKeyboard } from './radioKeyboard';
import { ListHead } from '../../../shared/ui/layout';
import { Loading } from '../../../shared/ui/widgets';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import { isMixedDuelLink } from '../../../domain/mixedDuelParams';
import { DuelModeBar, type TopMode } from './DuelModeBar';
import { DuelStage } from './DuelStage';
import { MixedDuel } from './MixedDuel';
import { BreakEven } from './BreakEven';
import { DamageBreakdown } from './DamageBreakdown';
import { AgeComparison } from './AgeComparison';
import { UpgradeComparison } from './UpgradeComparison';
import { Side } from './DuelSelection';
import { CONTACT_BOUNDARY } from './ContactSummary';
import { KiteContactBoundary } from './KiteSummaryCard';
import { canonicalizeDuelSide, resolve, isUnavail, type SideState } from '../logic/duelSide';

const DEF_A: SideSpec = { uid: 569, civ: 'Franks', age: 4, techs: 'f', team: [] };
const DEF_B: SideSpec = { uid: 359, civ: 'Japanese', age: 4, techs: 'f', team: [] };
const SIMPLE_DAMAGE = '伤害 = max(1, Σ max(0, 攻击类别 − 对应护甲类别))';
const FULL_DAMAGE = '伤害 = max(1, Σ max(min(0, 攻击类别), 攻击类别 − 对应护甲类别))';

function parseDuelSpec(raw: string | null, fallback: SideSpec, preserveExcluded: boolean): SideSpec {
  const spec = parseSide(raw, fallback);
  return preserveExcluded ? spec : { ...spec, uid: replaceDuelUnitId(spec.uid) };
}

export default function Duel() {
  const resources = useCoreTrees();
  const [params] = useSearchParams();
  const mixed = isMixedDuelLink(params);
  const pendingModeFocusRef = useRef<TopMode | null>(null);
  useEffect(() => () => void (pendingModeFocusRef.current = null), []);
  const specA = parseSide(params.get('a'), DEF_A);
  const specB = parseSide(params.get('b'), DEF_B);
  const champiRelevant = isChampiUnit(specA.uid) || isChampiUnit(specB.uid) || specA.civ === 'Muisca' || specB.civ === 'Muisca';
  const champi =
    !mixed && resources.core.data && resources.trees.data ? (
      <ChampiReferences core={resources.core.data} trees={resources.trees.data} collapsible defaultOpen={champiRelevant} />
    ) : null;
  return mixed ? (
    <MixedDuel resources={resources} pendingModeFocusRef={pendingModeFocusRef} />
  ) : (
    <DuelCalculator resources={resources} pendingModeFocusRef={pendingModeFocusRef} after={champi} />
  );
}

type DuelCalcProps = { resources: CoreTreesResources; pendingModeFocusRef: MutableRefObject<TopMode | null>; after?: ReactNode };

function DuelCalculator({ resources, pendingModeFocusRef, after }: DuelCalcProps) {
  const core = resources.core.data,
    trees = resources.trees.data;
  const [sp, setSp] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const hasUpgrade = ['base', 'fixed', 'basev', 'baser', 'fixedr'].some((key) => sp.has(key));
  // issue 772 / issue 1368 / issue 1483：坏单位 id / 乱码科技回退、1260 替换为 1233 或外部深链数值参数调整时给出提示，
  // 并把标记放进 history state，让地址栏 replace 后提示保留一次；之后用户改动任意参数自然清除。
  const linkState = location.state as { duelLinkInvalid?: boolean; duelUnitReplaced?: boolean; duelParamsAdjusted?: unknown } | null;
  const linkStateInvalid = linkState?.duelLinkInvalid ?? false;
  const linkStateReplaced = linkState?.duelUnitReplaced ?? false;
  const linkStateAdjusted = useMemo(() => readLinkAdjustedParams(linkState?.duelParamsAdjusted), [linkState?.duelParamsAdjusted]);
  const uidInvalid =
    !!core &&
    (['a', 'b'] as const).some((key) => {
      const raw = sp.get(key);
      if (!raw) return false;
      const uid = rawUid(raw);
      return uid === null || !core.unitById[uid];
    });
  const invalidLink = linkStateInvalid || techFieldInvalid(sp.get('a')) || techFieldInvalid(sp.get('b')) || uidInvalid;
  const unitReplacedInUrl =
    !hasUpgrade &&
    (['a', 'b'] as const).some((key) => {
      const uid = rawUid(sp.get(key));
      return uid !== null && isDuelExcludedUnit(uid);
    });
  const unitReplaced = linkStateReplaced || unitReplacedInUrl;
  const ctx = useMemo(() => (core && trees ? makeSimContext(core.techs, trees) : null), [core, trees]);
  const productionContext = useMemo(() => (core && trees ? { core, trees } : null), [core, trees]);
  const decodedParams = useMemo(() => decodeDuelParams(sp), [sp]);
  const { mode, na, nb, bud, vils, mins } = decodedParams;
  const kite = decodeDuelKite(sp);
  const relics = decodeDuelRelics(sp);
  const eq = mode === 'r' || mode === 't';
  const aParam = sp.get('a');
  const bParam = sp.get('b');
  const A = useMemo<SideState | null>(
    () => (core && ctx ? resolve(ctx, core.unitById, parseDuelSpec(aParam, DEF_A, hasUpgrade), DEF_A.uid, relics.a) : null),
    [core, ctx, aParam, hasUpgrade, relics.a],
  );
  const B = useMemo<SideState | null>(
    () => (core && ctx ? resolve(ctx, core.unitById, parseDuelSpec(bParam, DEF_B, hasUpgrade), DEF_B.uid, relics.b) : null),
    [core, ctx, bParam, hasUpgrade, relics.b],
  );
  // issue 102：地址栏始终带完整的 a、b、m（等资源再带 bud，N vs M 再带 na/nb），反馈链接读地址栏即可复现当前对阵
  const canon = new URLSearchParams(sp);
  const uiKiteEligible = resolveDuelKiteEligibility(mode, A, B);
  const canonKiteEligible = hasUpgrade ? undefined : uiKiteEligible;
  const relicBonusA = A && !isUnavail(A) ? unitRelicBonus(A.civ, A.u) : null;
  const relicBonusB = B && !isUnavail(B) ? unitRelicBonus(B.civ, B.u) : null;
  const canonRelicMax = !A || !B || hasUpgrade ? undefined : { a: relicBonusA?.maxRelics ?? 0, b: relicBonusB?.maxRelics ?? 0 };
  // issue 141 / 772 / 1403：普通 PK 链接规范化（比较链接的错误参数须保留并明确失效，不经容错回退）。
  if (!hasUpgrade) {
    canon.set('a', fmtSide(canonicalizeDuelSide(core, parseDuelSpec(aParam, DEF_A, false), DEF_A)));
    canon.set('b', fmtSide(canonicalizeDuelSide(core, parseDuelSpec(bParam, DEF_B, false), DEF_B)));
    canon.set('m', mode);
  }
  const incoming = sp.toString();
  const canonStr = canonDuelRelics(canonDuelKite(canonDuelParams(canon, decodedParams), kite, canonKiteEligible), relics, canonRelicMax).toString();
  const canonSearch = canonStr ? `?${canonStr}` : '';
  const { activeDrafts, numericErrors, hasNumericErrors, visibleParamsAdjusted, applySearch, set, onNumericChange, fieldVal } = useDuelNumericState({
    sp,
    setSp,
    location,
    navigationType,
    decodedParams,
    canonSearch,
    linkStateAdjusted,
  });
  const matchupContext = readDuelMatchupContext(sp);

  useEffect(() => {
    if (canonStr === incoming) return;
    const nextState =
      invalidLink || unitReplaced || visibleParamsAdjusted.length > 0
        ? {
            ...(invalidLink ? { duelLinkInvalid: true } : {}),
            ...(unitReplaced ? { duelUnitReplaced: true } : {}),
            ...(visibleParamsAdjusted.length > 0 ? { duelParamsAdjusted: visibleParamsAdjusted } : {}),
          }
        : undefined;
    // setSearchParams 会丢掉 #duel-model。只在这个锚点上改用带 hash 的跳转，其它地址仍走原来的补齐。
    if (location.hash === '#duel-model')
      navigate({ pathname: location.pathname, search: canonSearch, hash: location.hash }, { replace: true, state: nextState });
    else setSp(new URLSearchParams(canonStr), { replace: true, state: nextState });
  }, [canonStr, canonSearch, incoming, setSp, navigate, location.pathname, location.hash, invalidLink, unitReplaced, visibleParamsAdjusted]);

  useEffect(() => {
    if (location.hash !== '#duel-model') return;
    document.getElementById('duel-model')?.scrollIntoView({ block: 'start' });
  }, [location.hash, core]);

  useLayoutEffect(() => {
    const target = pendingModeFocusRef.current;
    if (!target || !core || !ctx) return;
    const button = document.querySelector<HTMLButtonElement>(`#duel [role="radiogroup"][aria-label="模式"] button[data-mode="${target}"]`);
    pendingModeFocusRef.current = null;
    button?.focus();
  }, [pendingModeFocusRef, core, ctx]);

  const fams = useMemo(
    () =>
      core
        ? collapse(
            core.units.filter((u) => u.civs.length && !isDuelExcludedUnit(u.id)),
            core.fam,
          )
        : [],
    [core],
  );
  const effKiteA = Boolean(kite.a && uiKiteEligible?.a);
  const effKiteB = Boolean(kite.b && uiKiteEligible?.b);
  const kiteOpt = useMemo<KiteOptions | undefined>(() => (effKiteA || effKiteB ? { a: effKiteA, b: effKiteB } : undefined), [effKiteA, effKiteB]);

  const sideBudget = (s: SideState | null) => {
    if (!s || isUnavail(s) || (mode !== 'r' && mode !== 't')) return null;
    const unitSec = mode === 't' ? realCostOf({ ...s.disc, cost: s.training.price.cost, exact: s.training.price.exact }, s.age, s.civ).rc.total : 0;
    return resolveSideBudgetCount(mode, s.training.price.cost, unitSec, { bud, vils, mins }, unitTrainCount(s.u));
  };
  const budgetA = sideBudget(A);
  const budgetB = sideBudget(B);
  const cnt = (s: SideState | null, b: ReturnType<typeof sideBudget>, n: number): number | null =>
    !s || isUnavail(s) ? 1 : b ? b.count : mode === 'n' ? Math.floor(n) : 1;
  const cntA = cnt(A, budgetA, na);
  const cntB = cnt(B, budgetB, nb);
  const budgetErrorParts =
    A && B && !isUnavail(A) && !isUnavail(B) && budgetA && budgetB
      ? buildDuelBudgetErrorParts({ side: 'A', unitName: A.u.zh, resolved: budgetA }, { side: 'B', unitName: B.u.zh, resolved: budgetB }, { bud, vils, mins })
      : null;

  const contextBar = matchupContext ? (
    <nav className="ctx-bar" aria-label="对阵相关入口">
      <Link className={matchupContext.practiceReturnLabel ? 'community-tool-entry duel-practice-return' : 'community-tool-entry'} to={matchupContext.returnTo}>
        <Icon name="arrow-left" />
        <span>
          回对局助手
          {matchupContext.practiceReturnLabel && <span className="duel-practice-return-detail">{matchupContext.practiceReturnLabel}</span>}
        </span>
      </Link>
      {matchupContext.civs.map((civ) => (
        <Link key={`civ-${civ}`} className="community-tool-entry" to={`/civ/${civ}`}>
          {civByEn(civ)?.zh}
        </Link>
      ))}
      {matchupContext.civs.map((civ) => (
        <Link key={`builds-${civ}`} className="community-tool-entry" to={buildsPath(civ, 'duel')}>
          <Icon name="list-ordered" />
          {civByEn(civ)?.zh} 开局
        </Link>
      ))}
    </nav>
  ) : null;

  if (!core || !ctx || !A || !B)
    return (
      <section id="duel" className="pane">
        <ListHead level={1} title="单位 PK" desc="两个单位对战模拟" />
        {contextBar}
        {resources.core.error || resources.trees.error ? (
          <p role="alert">
            对局资料加载失败，已选文明保留。
            <button type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={resources.retry}>
              重试资料
            </button>
          </p>
        ) : (
          <Loading />
        )}
      </section>
    );

  const hasUnavail = isUnavail(A) || isUnavail(B);
  const hasNegative = !hasUnavail && [...damageByClass(A.F, B.F), ...damageByClass(B.F, A.F)].some((row) => row.damage < 0);
  const formulaTitle = hasUnavail
    ? '存在不可用单位，本场伤害未计算；简式仅适用于匹配类别没有负伤害贡献的情形。'
    : hasNegative
      ? '本场存在负伤害贡献；只对目标已入库且具有的护甲类别求和。'
      : '本场双方已匹配类别均无负伤害贡献，使用等价简式；一般规则保留负攻击扣减。';
  const damageFormula = hasNegative ? FULL_DAMAGE : SIMPLE_DAMAGE;
  const upd = (k: 'a' | 'b', s: SideSpec) => {
    const qtyKey = k === 'a' ? 'na' : 'nb';
    const pairPatch = activeDrafts[qtyKey] !== undefined ? {} : pairBatchQtyPatch(mode, k, (k === 'a' ? A : B).u, core.unitById[s.uid], k === 'a' ? na : nb);
    set({ [k]: fmtSide(s), ...pairPatch });
  };
  const enterMixed = (viaKeyboard: boolean) => {
    if (hasUnavail || hasNumericErrors) {
      pendingModeFocusRef.current = null;
      return;
    }
    const source = extractDuelSourceParams(sp);
    pendingModeFocusRef.current = viaKeyboard ? 'mix' : null;
    setSp(buildEnterMixedParams(A, B, mode, { na, nb, cntA, cntB }, { a: effKiteA, b: effKiteB }), source ? { state: { duelSource: source } } : undefined);
  };
  const sideCntA = hasNumericErrors ? null : cntA;
  const sideCntB = hasNumericErrors ? null : cntB;
  const sideBatchesA = hasNumericErrors ? null : (budgetA?.batches ?? null);
  const sideBatchesB = hasNumericErrors ? null : (budgetB?.batches ?? null);
  const sideBud = mode === 'r' && !hasNumericErrors ? bud : 0;

  return (
    <>
      <section id="duel" className="pane">
        <ListHead level={1} title="单位 PK" desc="选择双方单位、文明与科技，计算每击伤害、击杀次数与用时；支持群战与等资源对比" />
        {invalidLink && (
          <p className="note" role="status">
            链接中的单位或科技无效，已回退为默认对决；地址栏已写成实际使用的参数。
          </p>
        )}
        {unitReplaced && (
          <p className="note" role="status" data-t="duel-unit-replaced">
            {DUEL_UNIT_REPLACED_NOTE}
          </p>
        )}
        <DuelParamAdjustedNotice items={visibleParamsAdjusted} />
        {contextBar}
        <DuelModeBar
          active={eq ? 'r' : mode}
          mixedDisabled={hasUnavail || hasNumericErrors}
          mixedHint={resolveDuelMixedHint(hasUnavail, hasNumericErrors)}
          onSelect={(nextMode, _trigger, viaKeyboard) => {
            if (nextMode === 'mix') {
              enterMixed(viaKeyboard);
              return;
            }
            set({ m: nextMode }, ['be'], nextMode !== (eq ? 'r' : mode));
          }}
        >
          {mode === 'n' && (
            <>
              <div className="duel-mode-extra">
                <DuelNumericField fieldKey="na" label="A 数量" value={fieldVal('na', na)} invalid={activeDrafts.na !== undefined} onChange={onNumericChange} />
                <DuelNumericField fieldKey="nb" label="B 数量" value={fieldVal('nb', nb)} invalid={activeDrafts.nb !== undefined} onChange={onNumericChange} />
              </div>
              <DuelFieldErrors errors={numericErrors} />
            </>
          )}
          {mode === 'r' && (
            <>
              <div className="duel-mode-extra">
                <DuelNumericField
                  fieldKey="bud"
                  label="资源预算"
                  value={fieldVal('bud', bud)}
                  invalid={activeDrafts.bud !== undefined}
                  onChange={onNumericChange}
                />
              </div>
              <DuelFieldErrors errors={numericErrors} />
            </>
          )}
        </DuelModeBar>
        {mode === 'n' && <DuelNPairHints A={A} B={B} na={activeDrafts.na !== undefined ? null : na} nb={activeDrafts.nb !== undefined ? null : nb} />}
        {eq && (
          <div className="rc-seg">
            <span className="seg" role="radiogroup" aria-label="比法" data-t="rc-toggle" onKeyDown={radioKeyboard}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'r'}
                tabIndex={mode === 'r' ? 0 : -1}
                className={mode === 'r' ? 'on' : undefined}
                onClick={() => set({ m: 'r' }, ['vil', 'min'], mode !== 'r')}
              >
                等资源
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 't'}
                tabIndex={mode === 't' ? 0 : -1}
                className={mode === 't' ? 'on' : undefined}
                onClick={() => set({ m: 't' }, [], mode !== 't')}
              >
                <Icon name="clock" className="ic" />
                等采集时间
              </button>
            </span>
          </div>
        )}
        {mode === 't' && (
          <div className="rc-budget" data-t="rc-budget">
            <span className="rc-budget-summary">
              村民时间{' '}
              {hasNumericErrors ? (
                <b data-t="rc-budget-text" className="rc-budget-invalid">
                  待修正输入
                </b>
              ) : (
                <b data-t="rc-budget-text">{`${vils} 个村民 × ${fmtClock(mins * 60)}`}</b>
              )}
            </span>
            <DuelNumericField fieldKey="vil" label="村民" value={fieldVal('vil', vils)} invalid={activeDrafts.vil !== undefined} onChange={onNumericChange} />
            <DuelNumericField fieldKey="min" label="分钟" value={fieldVal('min', mins)} invalid={activeDrafts.min !== undefined} onChange={onNumericChange} />
            <DuelFieldErrors errors={numericErrors} />
          </div>
        )}
        <DuelStage
          A={A}
          B={B}
          mode={mode}
          cntA={sideCntA}
          cntB={sideCntB}
          bud={sideBud}
          kite={kiteOpt}
          budgetErrorParts={hasNumericErrors ? null : budgetErrorParts}
          inputErrors={numericErrors}
        >
          <div className="duel-sides">
            <Side
              k="a"
              side={A}
              fams={fams}
              onChange={(s) => upd('a', s)}
              count={sideCntA}
              batches={sideBatchesA}
              bud={sideBud}
              time={mode === 't' ? [vils, mins] : null}
              hideTimeCount={mode === 't' && hasNumericErrors}
              context={productionContext!}
              canKite={uiKiteEligible?.a ?? false}
              kite={effKiteA}
              onKiteChange={(v) => set(v ? { ka: '1' } : {}, v ? [] : ['ka'])}
              relicBonus={relicBonusA}
              relics={!isUnavail(A) ? A.relics : 0}
              onRelicsChange={(n) => set(n > 0 ? { ra: String(n) } : {}, n > 0 ? [] : ['ra'])}
            />
            <button
              type="button"
              className="duel-swap"
              aria-label="互换 A、B 双方"
              onClick={() => applySearch(swapSingleDuelParams(sp, A, B, decodedParams), swapDuelNumericDrafts(mode, activeDrafts))}
            >
              <Icon name="arrow-left-right" />
              <span className="duel-swap-short" aria-hidden="true">
                互换
              </span>
              <span className="duel-swap-long" aria-hidden="true">
                互换 A / B 双方
              </span>
            </button>
            <Side
              k="b"
              side={B}
              fams={fams}
              onChange={(s) => upd('b', s)}
              count={sideCntB}
              batches={sideBatchesB}
              bud={sideBud}
              time={mode === 't' ? [vils, mins] : null}
              hideTimeCount={mode === 't' && hasNumericErrors}
              context={productionContext!}
              canKite={uiKiteEligible?.b ?? false}
              kite={effKiteB}
              onKiteChange={(v) => set(v ? { kb: '1' } : {}, v ? [] : ['kb'])}
              relicBonus={relicBonusB}
              relics={!isUnavail(B) ? B.relics : 0}
              onRelicsChange={(n) => set(n > 0 ? { rb: String(n) } : {}, n > 0 ? [] : ['rb'])}
            />
          </div>
        </DuelStage>
        <UpgradeComparison
          ctx={ctx}
          byId={core.unitById}
          params={sp}
          available={!hasUnavail}
          onSave={(a, b) => {
            const next: Record<string, string> = {
              a: fmtSide(a),
              b: fmtSide(b),
              m: '1',
              base: fmtSide(a),
              fixed: fmtSide(b),
              basev: String(DATA_SOURCES?.patch?.build ?? ''),
            };
            const drop: string[] = [];
            if (a.relics && a.relics > 0) next.baser = String(a.relics);
            else drop.push('baser');
            if (b.relics && b.relics > 0) next.fixedr = String(b.relics);
            else drop.push('fixedr');
            set(next, drop, true);
          }}
          onClear={() => set({}, ['base', 'fixed', 'basev', 'baser', 'fixedr'])}
          onNormalize={(values) => set(values)}
        />
        {!hasUnavail && <DamageBreakdown ctx={ctx} a={A} b={B} />}
        {!hasUnavail && (
          <AgeComparison ctx={ctx} byId={core.unitById} a={{ ...A.spec, civ: A.civ, relics: A.relics }} b={{ ...B.spec, civ: B.civ, relics: B.relics }} />
        )}
        {!eq && !hasNumericErrors && !hasUnavail && (
          // issue 25 盈亏平衡点：等资源模式 v1 不放入口（v2 SPEC）
          <BreakEven
            key={mode}
            a={A.F}
            b={B.F}
            nb={cntB ?? 1}
            summary={`${formatBreakEvenSide(A, effKiteA)} vs ${formatBreakEvenSide(B, effKiteB)}`}
            sig={[mode, fmtSide(A.spec), fmtSide(B.spec), cntB ?? 1, Number(effKiteA), Number(effKiteB), A.relics, B.relics].join('|')}
            auto={sp.get('be') === '1'}
            kite={kiteOpt}
            onComputed={() => set({ be: '1' })}
            onOpen={(n, m) => set({ m: 'n', na: String(n), nb: String(m) }, mode === 'n' ? [] : ['be'], true)}
          />
        )}
        <p className="note duel-note" id="duel-model">
          <Icon name="triangle-alert" className="ic warn" />
          近似模型：
          <span role="math" title={formulaTitle} aria-label={`${formulaTitle} ${damageFormula}`}>
            {damageFormula}
          </span>
          （来源：Fandom「Armor class」、aoe2.rocks 伤害计算）。攻击方带「无视护甲」且目标不抵抗时，近战、穿刺护甲按 <span className="num nw">0</span>{' '}
          计。目标带「额外伤害减免」时，近战、穿刺之外的每类伤害先按同类相减再按比例折减，合计后仍最低为 <span className="num nw">1</span>
          。常规远程按命中率取期望伤害。目录准确度为 <span className="num nw">0%</span> 的特殊远程攻击按每击命中主目标估算。
          {kiteOpt ? (
            <KiteContactBoundary />
          ) : mode === '1' ? (
            <>
              1v1 有有效碰撞数据时按一维接敌与射程先手模拟（自爆或无普攻单位降级为 <span className="num nw">t=0</span>{' '}
              静态对照）；不含走位/风筝、地形高低差、冲锋攻击、溅射、
              {isChampiUnit(A.u.id) || isChampiUnit(B.u.id) ? '未建模的独特/特殊效果未计入；已建模数值科技按实际选择计算。' : '特殊能力与独特科技（仅文本）。'}
            </>
          ) : (
            CONTACT_BOUNDARY
          )}
          {DUEL_COST_MODEL}
        </p>
      </section>
      {after}
      <CivArtCredit civs={[A.civ, B.civ]} />
    </>
  );
}
