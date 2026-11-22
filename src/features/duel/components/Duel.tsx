/** 工具：单位 PK（1v1 / N vs M / 等资源 / 混编），URL 与结果协调。 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCoreTrees, type CoreTreesResources } from '../../../shared/utils/useCoreTrees';
import ChampiReferences from '../../../shared/ui/ChampiReferences';
import { CivArtCredit } from '../../../shared/ui/CivArtCredit';
import { isChampiUnit } from '../../../domain/champiCounters';
import { countForBudget, damageByClass, duel, groupFight } from '../../../domain/duel';
import '../duel-headings.css';
import { collapse } from '../../../domain/family';
import { makeSimContext } from '../../../domain/simulator';
import { fmtSide, parseSide, type Mode, type SideSpec } from '../../../domain/duelState';
import { canonDuelParams, decodeDuelParams } from '../../../domain/duelParams';
import { buildsPath } from '../../../domain/matchupRoute';
import '../../../shared/ui/contextLinks.css';
import { countForTime, fmtClock, realCostOf } from '../../../domain/realCost';
import { extractDuelSourceParams, readDuelMatchupContext } from '../logic/duelContext';
import { summarizeGroup, summarizeOneVOne } from '../logic/duelSummary';
import { swapSingleDuelParams } from '../logic/duelSwap';
import { DUEL_COST_MODEL } from '../logic/trainingCostView';
import { Icon } from '../../../shared/ui/Icon';
import { radioKeyboard } from './radioKeyboard';
import { ListHead } from '../../../shared/ui/layout';
import { Loading } from '../../../shared/ui/widgets';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import { encodeMixedDuel, isMixedDuelLink, mixedDataVersion, type MixedSideInput } from '../../../domain/mixedDuelParams';
import { MIXED_RULE } from '../../../domain/mixedFight';
import { DuelModeBar, type TopMode } from './DuelModeBar';
import { DuelStickyResult } from './DuelStickyResult';
import { MixedDuel } from './MixedDuel';
import { BreakEven } from './BreakEven';
import { DamageBreakdown } from './DamageBreakdown';
import { AgeComparison } from './AgeComparison';
import { UpgradeComparison } from './UpgradeComparison';
import { Side } from './DuelSelection';
import { OneVOne, Group } from './DuelResults';
import { CONTACT_BOUNDARY } from './ContactSummary';
import { resolve, isUnavail, type SideState, type Resolved } from '../logic/duelSide';

const DEF_A: SideSpec = { uid: 569, civ: 'Franks', age: 4, techs: 'f', team: [] };
const DEF_B: SideSpec = { uid: 359, civ: 'Japanese', age: 4, techs: 'f', team: [] };
/** issue 772：坏深链里的科技字段不是 f/c/数字列表时视为无效，需要提示并写回规范化后的地址。 */
const techFieldInvalid = (raw: string | null) => {
  if (raw === null) return false;
  const field = raw.split('.')[3] ?? '';
  if (field === '' || field === 'f' || field === 'c') return false;
  return !/^[1-9]\d*(?:-[1-9]\d*)*$/.test(field);
};
const rawUid = (raw: string | null) => {
  if (raw === null) return null;
  const uid = Number(raw.split('.')[0]);
  return Number.isSafeInteger(uid) && uid > 0 ? uid : null;
};
const clampMixedQty = (value: number) => String(Math.max(1, Math.min(200, Math.floor(value) || 10)));
const SIMPLE_DAMAGE = '伤害 = max(1, Σ max(0, 攻击类别 − 对应护甲类别))';
const FULL_DAMAGE = '伤害 = max(1, Σ max(min(0, 攻击类别), 攻击类别 − 对应护甲类别))';

export default function Duel() {
  const resources = useCoreTrees();
  const [params] = useSearchParams();
  const mixed = isMixedDuelLink(params);
  const pendingModeFocusRef = useRef<TopMode | null>(null);
  useEffect(
    () => () => {
      pendingModeFocusRef.current = null;
    },
    [],
  );
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

function DuelStage({
  A,
  B,
  mode,
  cntA,
  cntB,
  bud,
  children,
}: {
  A: SideState;
  B: SideState;
  mode: Mode;
  cntA: number;
  cntB: number;
  bud: number;
  children: ReactNode;
}) {
  const [resEl, setResEl] = useState<HTMLDivElement | null>(null);
  const resHeadingRef = useRef<HTMLHeadingElement>(null);
  const oneResult = useMemo(() => (mode === '1' && !isUnavail(A) && !isUnavail(B) ? duel(A.F, B.F) : null), [mode, A, B]);
  const groupResult = useMemo(() => (mode !== '1' && !isUnavail(A) && !isUnavail(B) ? groupFight(A.F, cntA, B.F, cntB) : null), [mode, A, B, cntA, cntB]);
  const stickySummary = useMemo(() => {
    if (isUnavail(A) || isUnavail(B)) return null;
    if (mode === '1' && oneResult) return summarizeOneVOne(A, B, oneResult);
    if (mode !== '1' && groupResult) return summarizeGroup(A, B, groupResult);
    return null;
  }, [mode, A, B, oneResult, groupResult]);
  return (
    <>
      <DuelStickyResult summary={stickySummary} targetEl={resEl} headingRef={resHeadingRef} />
      {children}
      {isUnavail(A) || isUnavail(B) ? (
        <div id="duel-pending" className="posbox duel-pending">
          <p data-t="pk-pending">
            <Icon name="info" className="ic" />
            先在上面选好能造的单位或文明，再出对战结果。
          </p>
        </div>
      ) : mode === '1' ? (
        <OneVOne
          key={[fmtSide(A.spec), fmtSide(B.spec)].join('|')}
          A={A}
          B={B}
          result={oneResult ?? undefined}
          resultElRef={setResEl}
          headingRef={resHeadingRef}
        />
      ) : (
        <Group
          key={[mode, fmtSide(A.spec), fmtSide(B.spec), cntA, cntB].join('|')}
          A={A}
          B={B}
          na={cntA}
          nb={cntB}
          bud={mode === 'r' ? bud : 0}
          result={groupResult ?? undefined}
          resultElRef={setResEl}
          headingRef={resHeadingRef}
        />
      )}
    </>
  );
}

type DuelCalcProps = { resources: CoreTreesResources; pendingModeFocusRef: MutableRefObject<TopMode | null>; after?: ReactNode };

function DuelCalculator({ resources, pendingModeFocusRef, after }: DuelCalcProps) {
  const core = resources.core.data,
    trees = resources.trees.data;
  const [sp, setSp] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // issue 772：坏单位 id / 乱码科技被宽松回退时给出明确提示，并把 evidence 放进 history state，
  // 让地址栏被 replace 成实际参数后提示仍保留一次；之后用户改选/前往新链接自然清除。
  const linkStateInvalid = (location.state as { duelLinkInvalid?: boolean } | null)?.duelLinkInvalid ?? false;
  const uidInvalid =
    !!core &&
    (['a', 'b'] as const).some((key) => {
      const raw = sp.get(key);
      if (!raw) return false;
      const uid = rawUid(raw);
      return uid === null || !core.unitById[uid];
    });
  const invalidLink = linkStateInvalid || techFieldInvalid(sp.get('a')) || techFieldInvalid(sp.get('b')) || uidInvalid;
  const ctx = useMemo(() => (core && trees ? makeSimContext(core.techs, trees) : null), [core, trees]);
  const productionContext = useMemo(() => (core && trees ? { core, trees } : null), [core, trees]);
  const { mode, na, nb, bud, vils, mins } = decodeDuelParams(sp);
  const eq = mode === 'r' || mode === 't';
  const set = (k: Record<string, string>, drop: string[] = []) => {
    const n = new URLSearchParams(sp);
    Object.entries(k).forEach(([a, b]) => n.set(a, b));
    drop.forEach((d) => n.delete(d));
    setSp(n, { replace: true });
  };
  // issue 102：地址栏始终带完整的 a、b、m（等资源再带 bud，N vs M 再带 na/nb），反馈链接读地址栏即可复现当前对阵
  const canon = new URLSearchParams(sp);
  const hasUpgrade = ['base', 'fixed', 'basev'].some((key) => sp.has(key));
  // issue 141：文明为空或认不出时页面回落到该单位第一个能造的文明（issue 124 的规则不变），URL 也用 replace 写成这个文明
  const civFix = (s: SideSpec, fallback: number): SideSpec => {
    if (!core || civByEn(s.civ)) return s;
    const u = core.unitById[s.uid]?.civs.length ? core.unitById[s.uid]! : core.unitById[fallback];
    return u?.civs.length ? { ...s, civ: u.civs[0]! } : s;
  };
  // issue 772：未知单位 id 回退到默认一侧，避免坏链接永远留在地址栏。
  const fixSide = (spec: SideSpec, fallback: SideSpec) => (core && !core.unitById[spec.uid] ? fallback : civFix(spec, fallback.uid));
  // 比较链接的错误参数须保留并明确失效，不能经旧 PK 容错回退后变成有效比较。
  if (!hasUpgrade) {
    canon.set('a', fmtSide(fixSide(parseSide(sp.get('a'), DEF_A), DEF_A)));
    canon.set('b', fmtSide(fixSide(parseSide(sp.get('b'), DEF_B), DEF_B)));
    canon.set('m', mode);
  }
  const incoming = sp.toString();
  const canonStr = canonDuelParams(canon, { mode, na, nb, bud, vils, mins }).toString();
  const matchupContext = readDuelMatchupContext(sp);

  useEffect(() => {
    if (canonStr === incoming) return;
    const nextState = invalidLink ? { duelLinkInvalid: true } : undefined;
    // setSearchParams 会丢掉 #duel-model。只在这个锚点上改用带 hash 的跳转，其它地址仍走原来的补齐。
    if (location.hash === '#duel-model')
      navigate({ pathname: location.pathname, search: `?${canonStr}`, hash: location.hash }, { replace: true, state: nextState });
    else setSp(new URLSearchParams(canonStr), { replace: true, state: nextState });
  }, [canonStr, incoming, setSp, navigate, location.pathname, location.hash, invalidLink]);

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
            core.units.filter((u) => u.civs.length),
            core.fam,
          )
        : [],
    [core],
  );

  const aParam = sp.get('a');
  const bParam = sp.get('b');
  const A = useMemo<SideState | null>(() => (core && ctx ? resolve(ctx, core.unitById, parseSide(aParam, DEF_A), DEF_A.uid) : null), [core, ctx, aParam]);
  const B = useMemo<SideState | null>(() => (core && ctx ? resolve(ctx, core.unitById, parseSide(bParam, DEF_B), DEF_B.uid) : null), [core, ctx, bParam]);

  const cnt = (s: SideState | null, n: number) =>
    !s || isUnavail(s)
      ? 1
      : mode === 'r'
        ? countForBudget(s.training.price.cost, bud)
        : mode === 't'
          ? Math.max(1, countForTime(realCostOf({ ...s.disc, cost: s.training.price.cost, exact: s.training.price.exact }, s.age, s.civ).rc.total, vils, mins))
          : mode === 'n'
            ? Math.floor(n)
            : 1;
  const cntA = cnt(A, na);
  const cntB = cnt(B, nb);

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

  const hasNegative = !isUnavail(A) && !isUnavail(B) && [...damageByClass(A.F, B.F), ...damageByClass(B.F, A.F)].some((row) => row.damage < 0);
  const formulaTitle =
    isUnavail(A) || isUnavail(B)
      ? '存在不可用单位，本场伤害未计算；简式仅适用于匹配类别没有负伤害贡献的情形。'
      : hasNegative
        ? '本场存在负伤害贡献；只对目标已入库且具有的护甲类别求和。'
        : '本场双方已匹配类别均无负伤害贡献，使用等价简式；一般规则保留负攻击扣减。';
  const damageFormula = hasNegative ? FULL_DAMAGE : SIMPLE_DAMAGE;
  const upd = (k: 'a' | 'b', s: SideSpec) => set({ [k]: fmtSide(s) });
  const enterMixed = (viaKeyboard: boolean) => {
    if (isUnavail(A) || isUnavail(B)) {
      pendingModeFocusRef.current = null;
      return;
    }
    const side = (s: Resolved, qty: string): MixedSideInput => ({
      civ: s.civ,
      age: String(s.age),
      techs: [...s.sel].map(String),
      team: s.spec.team.map(String),
      rows: [{ uid: String(s.u.id), qty }],
    });
    const qtyA = mode === 'r' || mode === 't' ? clampMixedQty(cntA) : clampMixedQty(na);
    const qtyB = mode === 'r' || mode === 't' ? clampMixedQty(cntB) : clampMixedQty(nb);
    const source = extractDuelSourceParams(sp);
    pendingModeFocusRef.current = viaKeyboard ? 'mix' : null;
    setSp(
      encodeMixedDuel({
        rule: MIXED_RULE,
        data: mixedDataVersion(DATA_SOURCES),
        a: side(A, qtyA),
        b: side(B, qtyB),
      }),
      source ? { state: { duelSource: source } } : undefined,
    );
  };

  return (
    <>
      <section id="duel" className="pane">
        <ListHead level={1} title="单位 PK" desc="选择双方单位、文明与科技，计算每击伤害、击杀次数与用时；支持群战与等资源对比" />
        {invalidLink && (
          <p className="note" role="status">
            链接中的单位或科技无效，已回退为默认对决；地址栏已写成实际使用的参数。
          </p>
        )}
        {contextBar}
        <DuelModeBar
          active={eq ? 'r' : mode}
          mixedDisabled={isUnavail(A) || isUnavail(B)}
          mixedHint="请先修正不可用单位，再进入混编。"
          onSelect={(nextMode, _trigger, viaKeyboard) => {
            if (nextMode === 'mix') {
              enterMixed(viaKeyboard);
              return;
            }
            set({ m: nextMode }, ['be']);
          }}
        >
          {mode === 'n' && (
            <div className="duel-mode-extra">
              <label>
                A 数量 <input id="duel-na" type="number" min={1} max={200} value={na} onChange={(e) => set({ na: e.target.value })} style={{ width: 64 }} />
              </label>
              <label>
                B 数量 <input id="duel-nb" type="number" min={1} max={200} value={nb} onChange={(e) => set({ nb: e.target.value })} style={{ width: 64 }} />
              </label>
            </div>
          )}
          {mode === 'r' && (
            <div className="duel-mode-extra">
              <label>
                资源预算{' '}
                <input id="duel-bud" type="number" min={100} step={500} value={bud} onChange={(e) => set({ bud: e.target.value })} style={{ width: 90 }} />
              </label>
            </div>
          )}
        </DuelModeBar>
        {eq && (
          <div className="rc-seg">
            <span className="seg" role="radiogroup" aria-label="比法" data-t="rc-toggle" onKeyDown={radioKeyboard}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'r'}
                tabIndex={mode === 'r' ? 0 : -1}
                className={mode === 'r' ? 'on' : undefined}
                onClick={() => set({ m: 'r' }, ['vil', 'min'])}
              >
                等资源
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 't'}
                tabIndex={mode === 't' ? 0 : -1}
                className={mode === 't' ? 'on' : undefined}
                onClick={() => set({ m: 't' })}
              >
                <Icon name="clock" className="ic" />
                等采集时间
              </button>
            </span>
          </div>
        )}
        {mode === 't' && (
          <div className="rc-budget" data-t="rc-budget">
            <span>
              村民时间 <b data-t="rc-budget-text">{`${vils} 个村民 × ${fmtClock(mins * 60)}`}</b>
            </span>
            <label>
              村民 <input id="duel-vil" type="number" min={1} max={200} value={vils} onChange={(e) => set({ vil: e.target.value })} />
            </label>
            <label>
              分钟 <input id="duel-min" type="number" min={1} max={120} value={mins} onChange={(e) => set({ min: e.target.value })} />
            </label>
          </div>
        )}
        <DuelStage A={A} B={B} mode={mode} cntA={cntA} cntB={cntB} bud={bud}>
          <div className="duel-sides">
            <Side
              k="a"
              side={A}
              fams={fams}
              onChange={(s) => upd('a', s)}
              count={cntA}
              bud={mode === 'r' ? bud : 0}
              time={mode === 't' ? [vils, mins] : null}
              context={productionContext!}
            />
            <button
              type="button"
              className="duel-swap"
              aria-label="互换 A、B 双方"
              onClick={() => setSp(swapSingleDuelParams(sp, A, B, { mode, na, nb, bud, vils, mins }), { replace: true })}
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
              count={cntB}
              bud={mode === 'r' ? bud : 0}
              time={mode === 't' ? [vils, mins] : null}
              context={productionContext!}
            />
          </div>
        </DuelStage>
        <UpgradeComparison
          ctx={ctx}
          byId={core.unitById}
          params={sp}
          available={!isUnavail(A) && !isUnavail(B)}
          onSave={(a, b) => set({ a: fmtSide(a), b: fmtSide(b), m: '1', base: fmtSide(a), fixed: fmtSide(b), basev: String(DATA_SOURCES?.patch?.build ?? '') })}
          onClear={() => set({}, ['base', 'fixed', 'basev'])}
          onNormalize={(values) => set(values)}
        />
        {!isUnavail(A) && !isUnavail(B) && <DamageBreakdown ctx={ctx} a={A} b={B} />}
        {!isUnavail(A) && !isUnavail(B) && <AgeComparison ctx={ctx} byId={core.unitById} a={{ ...A.spec, civ: A.civ }} b={{ ...B.spec, civ: B.civ }} />}
        {!eq && !isUnavail(A) && !isUnavail(B) && (
          // issue 25 盈亏平衡点：等资源模式 v1 不放入口（v2 SPEC）
          <BreakEven
            key={mode}
            a={A.F}
            b={B.F}
            nb={cntB}
            summary={`${beSide(A)} vs ${beSide(B)}`}
            sig={[mode, fmtSide(A.spec), fmtSide(B.spec), cntB].join('|')}
            auto={sp.get('be') === '1'}
            onComputed={() => set({ be: '1' })}
            onOpen={(n, m) => set({ m: 'n', na: String(n), nb: String(m) }, mode === 'n' ? [] : ['be'])}
          />
        )}
        <p className="note duel-note" id="duel-model">
          <Icon name="triangle-alert" className="ic warn" />
          近似模型：
          <span role="math" title={formulaTitle} aria-label={`${formulaTitle} ${damageFormula}`}>
            {damageFormula}
          </span>
          （来源：Fandom「Armor class」、aoe2.rocks 伤害计算）。远程按命中率取期望伤害。
          {mode === '1' ? (
            <>
              双方 <span className="num nw">t=0</span> 同时出手；忽略射程、走位/风筝、地形高低差、冲锋攻击、溅射、
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

const PRESET_ZH = { f: '满科技', c: '当前时代满科技' } as const;
const beSide = (s: Resolved) =>
  `${civByEn(s.civ)?.zh ?? s.civ} ${s.u.zh}` +
  (Array.isArray(s.spec.techs) ? (s.spec.techs.length ? ` · 自选科技 ${s.sel.size} 项` : ' · 无科技') : ` · ${PRESET_ZH[s.spec.techs]}`);
