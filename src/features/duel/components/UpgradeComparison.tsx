import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useShareLink } from '../../../shared/ui/useShareLink';
import { civByEn } from '../../../data';
import { DATA_SOURCES, versionLabel } from '../../../shared/utils/dataInfo';
import { upgradeComparison, upgradePlan, type UpgradeSide } from '../../../domain/upgradeComparison';
import type { SimContext } from '../../../domain/simulator';
import type { Tech, Unit } from '../../../domain/types';
import { CostView, TechLink } from '../../../shared/ui/art';
import { fmtSide, parseUpgradeSide } from '../../../domain/duelState';
import './upgrade-comparison.css';

const fmt = (n: number | null) => (n === null || !Number.isFinite(n) ? '—' : String(Number(n.toFixed(3))));
const MODEL = '1v1 近似模型：首击同时发生，远程按命中率取期望；未模拟移速、射程、弹道、走位、地形和特殊能力的实战价值。结果不变不代表科技无用。';
const COST_NOTE = '基础研究费用：文明科研折扣、免费科技、返金与研究速度加成未计入；研究时长为逐项合计，不模拟并行研究。';
type Plan = Extract<ReturnType<typeof upgradePlan>, { ok: true }>;
const sideText = (p: Plan) => `${civByEn(p.spec.civ)?.zh ?? p.spec.civ} · ${p.u.zh} · ${['', '黑暗时代', '封建时代', '城堡时代', '帝王时代'][p.spec.age]}`;
const techList = (items: Tech[], empty = '无') =>
  items.length ? (
    <ul className="upgrade-tech-list">
      {items.map((t) => (
        <li key={t.id}>
          <TechLink t={t} />
        </li>
      ))}
    </ul>
  ) : (
    <p className="note">{empty}</p>
  );

function PlanCard({ label, plan, opponent, testId }: { label: string; plan: Plan; opponent: Plan; testId: string }) {
  return (
    <section className="upgrade-plan" data-t={testId} aria-label={label}>
      <h4>{label}</h4>
      <p>{sideText(plan)}</p>
      <p className="note">完整科技（{plan.techs.length} 项）</p>
      {techList(plan.techs, '无科技')}
      <p>
        单位训练费用（基础价）：
        <CostView c={plan.u.cost} />
      </p>
      <p className="note">数据版本：{versionLabel(DATA_SOURCES)}</p>
      <p className="note">{MODEL}</p>
      <Link className="ulink" to={`/duel?a=${fmtSide(plan.spec)}&b=${fmtSide(opponent.spec)}&m=1`}>
        打开{label}独立 PK
      </Link>
    </section>
  );
}

export function UpgradeComparison({
  ctx,
  byId,
  params,
  onSave,
  onClear,
  onNormalize,
  available,
}: {
  ctx: SimContext;
  byId: Record<number, Unit>;
  params: URLSearchParams;
  onSave: (a: UpgradeSide, b: UpgradeSide) => void;
  onClear: () => void;
  onNormalize: (values: Record<string, string>) => void;
  available: boolean;
}) {
  const {
    copy: copyLink,
    status,
    manualLink,
    statusProps,
  } = useShareLink({
    stateKey: params.toString(),
    successMessage: '比较链接已复制。',
    failureMessage: '自动复制不可用，请选中下面的完整链接手动复制。',
  });
  const copy = () => copyLink(window.location.href);
  const a = parseUpgradeSide(params.get('a'));
  const b = parseUpgradeSide(params.get('b'));
  const base = parseUpgradeSide(params.get('base'), false);
  const fixed = parseUpgradeSide(params.get('fixed'), false);
  const hasBase = ['base', 'fixed', 'basev'].some((key) => params.has(key));
  const one = params.get('m') === '1';
  const currentA = a ? upgradePlan(ctx, byId, a) : null;
  const currentB = b ? upgradePlan(ctx, byId, b) : null;
  const canSave = available && one && currentA?.ok && currentB?.ok;
  const result =
    hasBase && base && fixed && a && b && one && available && params.get('basev') === String(DATA_SOURCES.patch.build)
      ? upgradeComparison(ctx, byId, base, a, fixed, b)
      : null;
  const invalid = !available
    ? '双方必须选择该文明可用的单位。'
    : !one
      ? '升级比较仅支持 1v1；模式已改变，请重新保存基准。'
      : hasBase && params.get('basev') !== String(DATA_SOURCES.patch.build)
        ? '数据版本已改变或缺失，请重新保存基准。'
        : hasBase && (!base || !fixed || !a || !b)
          ? '比较链接包含非法或不完整配置，请重新保存基准。'
          : result && !result.ok
            ? result.reason
            : currentA && !currentA.ok
              ? currentA.reason
              : currentB && !currentB.ok
                ? currentB.reason
                : !a || !b
                  ? '等待完整对局配置。'
                  : '';
  const save = () => {
    if (canSave && currentA?.ok && currentB?.ok) onSave(currentA.spec, currentB.spec);
  };
  const comparison = result?.ok ? result : null;
  const combatAvailable =
    comparison &&
    [comparison.before.F, comparison.current.F, comparison.opponent.F].every((f) => f.rof > 0) &&
    [comparison.beforeResult.ab.time, comparison.beforeResult.ba.time, comparison.currentResult.ab.time, comparison.currentResult.ba.time].every(
      (time) => time !== null && Number.isFinite(time),
    );
  const canonical = comparison
    ? {
        a: fmtSide(comparison.current.spec),
        b: fmtSide(comparison.opponent.spec),
        base: fmtSide(comparison.before.spec),
        fixed: fmtSide(comparison.opponent.spec),
      }
    : null;
  const canonicalString = canonical ? JSON.stringify(canonical) : '';
  useEffect(() => {
    if (!canonicalString) return;
    const values = JSON.parse(canonicalString) as Record<string, string>;
    if (Object.entries(values).some(([key, value]) => params.get(key) !== value)) onNormalize(values);
  }, [canonicalString, params, onNormalize]);
  type Row = { key: string; label: string; before: number | null; after: number | null; unit?: string };
  const rows: Row[] = comparison
    ? [
        ...(
          [
            ['hp', '生命值'],
            ['atk', '攻击'],
            ['ma', '近战护甲'],
            ['pa', '穿刺护甲'],
            ['rof', '攻击间隔'],
            ['acc', '命中率'],
            ['rng', '射程（未模拟）'],
            ['spd', '移速（未模拟）'],
          ] as const
        ).map(([key, label]) => ({
          key: `a-${key}`,
          label: `A ${label}`,
          before: comparison.before.S[key],
          after: comparison.current.S[key],
          unit: key === 'rof' ? '秒' : key === 'acc' ? '%' : '',
        })),
        ...(['ab', 'ba'] as const).flatMap((direction) =>
          (
            [
              ['dmg', '每击伤害'],
              ['expDmg', '期望每击'],
              ['hits', '击杀次数'],
              ['time', '击杀用时'],
              ['dps', 'DPS'],
            ] as const
          ).map(([key, label]) => ({
            key: `${direction}-${key === 'expDmg' ? 'exp' : key}`,
            label: `${direction === 'ab' ? 'A 打 B' : 'B 打 A'} ${label}`,
            before: comparison.beforeResult[direction][key],
            after: comparison.currentResult[direction][key],
            unit: key === 'time' ? '秒' : '',
          })),
        ),
        {
          key: 'duration',
          label: '战斗时长',
          before: combatAvailable ? comparison.beforeResult.duration : null,
          after: combatAvailable ? comparison.currentResult.duration : null,
          unit: '秒',
        },
        {
          key: 'remaining',
          label: '胜者剩余生命',
          before: combatAvailable ? comparison.beforeResult.remaining : null,
          after: combatAvailable ? comparison.currentResult.remaining : null,
        },
      ]
    : [];
  const winner = (w: 'a' | 'b' | 'draw') => (w === 'draw' ? '平局' : `${w.toUpperCase()} 获胜`);
  return (
    <section className="upgrade-comparison posbox" data-t="upgrade-comparison" aria-label="升级前后对比">
      <h3>升级前后对比</h3>
      <p className="note">保存当前 A 为升级前，固定 B；在上方 A 的科技详情选择方案。同一单位形态、文明、时代和团队加成，仅比较 1v1。</p>
      <div className="upgrade-actions">
        <button type="button" disabled={!canSave} onClick={save}>
          {hasBase ? '重新保存基准' : '保存为升级前'}
        </button>
        {hasBase && (
          <button type="button" onClick={onClear}>
            清除比较
          </button>
        )}
        {comparison && (
          <button type="button" onClick={copy}>
            复制比较链接
          </button>
        )}
      </div>
      {comparison && status && (
        <div className="upgrade-copy" data-t="upgrade-copy-status" {...statusProps}>
          <p className="note">{status}</p>
          {manualLink && <input aria-label="手动复制比较链接" readOnly value={manualLink} onFocus={(e) => e.target.select()} />}
        </div>
      )}
      {!comparison ? (
        <p role="status" data-t="upgrade-status" className={hasBase || invalid ? 'upgrade-invalid' : 'note'}>
          {invalid || '尚未保存基准。先设置本方科技，再保存为升级前。'}
        </p>
      ) : (
        <>
          <p className="note">
            固定 B：{sideText(comparison.opponent)}；科技：{comparison.opponent.techs.map((t) => t.zh).join('、') || '无'}；双方数量：1 / 1。
          </p>
          <div className="upgrade-plans">
            <PlanCard label="升级前" plan={comparison.before} opponent={comparison.opponent} testId="upgrade-before" />
            <PlanCard label="当前方案" plan={comparison.current} opponent={comparison.opponent} testId="upgrade-current" />
          </div>
          <table className="stat upgrade-table">
            <thead>
              <tr>
                <th scope="col">指标</th>
                <th scope="col">升级前</th>
                <th scope="col">当前方案 / 变化</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-metric={row.key}>
                  <th scope="row">{row.label}</th>
                  <td>
                    <span className="upgrade-number" data-t="upgrade-value">
                      {fmt(row.before)}
                      {row.before === null || !Number.isFinite(row.before) ? '' : row.unit}
                    </span>
                  </td>
                  <td>
                    <span className="upgrade-number" data-t="upgrade-value">
                      {fmt(row.after)}
                      {row.after === null || !Number.isFinite(row.after) ? '' : row.unit}
                    </span>
                    <small className="upgrade-delta">
                      {row.before === null || row.after === null || !Number.isFinite(row.before) || !Number.isFinite(row.after)
                        ? '未模拟'
                        : row.after === row.before
                          ? '不变'
                          : `变化 ${row.after > row.before ? '+' : ''}${fmt(row.after - row.before)}${row.unit ?? ''}`}
                    </small>
                  </td>
                </tr>
              ))}
              <tr data-metric="winner">
                <th scope="row">胜负</th>
                <td>
                  <span data-t="upgrade-value">{combatAvailable ? winner(comparison.beforeResult.winner) : '—'}</span>
                </td>
                <td>
                  <span data-t="upgrade-value">{combatAvailable ? winner(comparison.currentResult.winner) : '—'}</span>
                  <small className="upgrade-delta">
                    {!combatAvailable ? '未模拟' : comparison.beforeResult.winner === comparison.currentResult.winner ? '不变' : '胜负改变'}
                  </small>
                </td>
              </tr>
            </tbody>
          </table>
          {!combatAvailable && <p className="note">爆炸单位缺少攻击间隔或期望伤害为零，无法比较胜负、战斗时长与剩余生命；保留可计算的每击指标。</p>}
          {!comparison.added.length && !comparison.removed.length && <p className="note">尚无科技变化。</p>}
          <div className="upgrade-investment">
            <section data-t="upgrade-added">
              <h4>新增科技</h4>
              {techList(comparison.added)}
            </section>
            <section data-t="upgrade-prerequisites">
              <h4>其中新增前置</h4>
              {techList(comparison.addedPrerequisites)}
            </section>
            <section data-t="upgrade-removed">
              <h4>取消科技（不退款）</h4>
              {techList(comparison.removed)}
            </section>
          </div>
          {comparison.removed.length > 0 && <p className="note">取消项仅用于方案比较，游戏中不能撤销已研究科技。</p>}
          <p data-t="upgrade-added-cost">
            新增研究基础费用：{comparison.added.length ? <CostView c={comparison.cost} /> : <span>0</span>}；
            <span className="upgrade-number">研究时长合计 {fmt(comparison.time)}秒</span>
          </p>
          <p className="note">{COST_NOTE}</p>
          <p className="note">{MODEL}</p>
        </>
      )}
    </section>
  );
}
