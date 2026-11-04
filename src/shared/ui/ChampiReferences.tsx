import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { civByEn, type Core } from '../../data';
import { champiPresets } from '../../domain/champiCounters';
import { AGE_ZH } from '../../domain/ratings';
import { sharePageUrl } from '../../domain/sharePage';
import type { Trees } from '../../domain/types';
import { DATA_SOURCES } from '../utils/dataInfo';
import { CivIcon, UnitIcon } from './art';
import { Icon } from './Icon';
import { useShareLink } from './useShareLink';
import './champi-references.css';

type Preset = ReturnType<typeof champiPresets>[number];
type ReadyReference = Extract<Preset['result'], { state: 'ok' }>;

function N({ value, unit = '' }: { value: number; unit?: string }) {
  return (
    <span className="num nw">
      {Number(value.toFixed(3))}
      {unit}
    </span>
  );
}

function ReferenceSide({ side, label, attack }: { side: ReadyReference['a']; label: 'A' | 'B'; attack: ReadyReference['result']['ab'] }) {
  const civ = civByEn(side.civ);
  return (
    <div className="champi-reference-side" data-side={label.toLowerCase()}>
      <p className="champi-reference-identity">
        <span>{label}</span>
        <UnitIcon u={side.unit} />
        <strong>{side.unit.zh}</strong>
        {civ ? (
          <>
            <CivIcon c={civ} alt="" />
            {civ.zh}
          </>
        ) : (
          '文明资料未核实'
        )}
      </p>
      <p className="champi-reference-shot">
        预计击杀对方 <N value={attack.hits} unit=" 次攻击" /> · {attack.time == null ? '用时未核实' : <N value={attack.time} unit=" 秒" />}。
      </p>
      <p className="champi-reference-note">
        近甲 <N value={side.stats.ma} /> · 穿甲 <N value={side.stats.pa} /> · 速度 <N value={side.stats.spd} unit=" 格/秒" />。
      </p>
    </div>
  );
}

function ReferenceItem({ preset, build }: { preset: Preset; build: number | undefined }) {
  const location = useLocation();
  const result = preset.result;
  const path = result.state === 'ok' ? result.pkPath : '';
  const query = path.startsWith('/duel?') ? path.slice('/duel'.length) : '';
  const { copy, copied, status, manualLink, statusProps } = useShareLink({
    stateKey: `${location.pathname}${location.search}|${preset.key}|${build ?? 'unverified'}|${path}`,
    successMessage: '参考对照链接已复制。',
    failureMessage: '自动复制失败，请手动复制下方完整参考对照链接。',
  });
  if (result.state !== 'ok' || !query)
    return (
      <article className="champi-reference-card" data-champi-preset={preset.key}>
        <h3>{AGE_ZH[preset.age]}参考对照</h3>
        <p className="champi-reference-note">{result.state === 'ok' ? '参考链接尚未核对，暂不提供打开或复制。' : result.reason}</p>
      </article>
    );
  const winner = result.result.winner === 'draw' ? null : result[result.result.winner];
  const outcome = winner ? `接触对照：${winner.unit.zh}（${civByEn(winner.civ)?.zh ?? '文明资料未核实'}）获胜` : '接触对照：同时击杀';
  const ranged = result.a.unit.rng > 1 || result.b.unit.rng > 1;
  return (
    <article className="champi-reference-card" data-champi-preset={preset.key}>
      <h3>
        {AGE_ZH[preset.age]} · {result.a.unit.zh} 对 {result.b.unit.zh}
      </h3>
      <ReferenceSide side={result.a} label="A" attack={result.result.ab} />
      <ReferenceSide side={result.b} label="B" attack={result.result.ba} />
      <p className="champi-reference-outcome">{outcome}</p>
      <p className="champi-reference-note">{ranged ? '未模拟射程先手与风筝。' : '未模拟追击，接触优势不代表能追上。'}</p>
      <div className="champi-reference-actions">
        <Link to={result.pkPath} className="champi-reference-link">
          <Icon name="swords" />
          打开参考对照
        </Link>
        <button
          type="button"
          aria-label={`复制链接：${AGE_ZH[preset.age]}蔷琵线参考对照`}
          onClick={() => void copy(() => sharePageUrl('/duel', query, document.baseURI))}
        >
          <Icon name={copied ? 'check' : 'copy'} />
          复制链接
        </button>
      </div>
      {status ? (
        <p className="champi-reference-note" {...statusProps}>
          {status}
        </p>
      ) : null}
      {manualLink ? (
        <label className="champi-reference-manual">
          完整参考对照链接
          <textarea readOnly rows={3} value={manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      ) : null}
    </article>
  );
}

export default function ChampiReferences({ core, trees, variant = 'duel' }: { core: Core; trees: Trees; variant?: 'duel' | 'unit' }) {
  const rawBuild = DATA_SOURCES?.patch?.build;
  const build = typeof rawBuild === 'number' && Number.isInteger(rawBuild) && rawBuild > 0 ? rawBuild : undefined;
  const presets = useMemo(() => champiPresets({ core, trees }, build), [core, trees, build]);
  const a = civByEn('Muisca'),
    b = civByEn('Franks');
  return (
    <section
      className={variant === 'unit' ? 'champi-unit-entry' : 'champi-presets'}
      data-testid={variant === 'unit' ? 'champi-unit-entry' : 'champi-presets'}
      aria-label="蔷琵线参考对照"
    >
      <h2>蔷琵线参考对照</h2>
      <p className="champi-reference-context">
        参考：{a?.zh ?? '文明资料未核实'}对{b?.zh ?? '文明资料未核实'}，不代表你当前的对手；当前时代满科技、无团队加成、接触 <span className="num nw">1v1</span>
        。
      </p>
      <p className="champi-reference-note">打开参考后才切换 PK 输入；复制链接可在新页面复算，不会自动修改当前计算器。</p>
      {presets.length ? (
        <div className="champi-reference-grid">
          {presets.map((preset) => (
            <ReferenceItem key={preset.key} preset={preset} build={build} />
          ))}
        </div>
      ) : (
        <p role="status">当前资料尚未核对，暂不生成蔷琵时代对照。</p>
      )}
      <p className="champi-reference-note">
        远程按命中率取期望伤害，首次攻击在 <span className="num nw">t=0</span>
        。已建模数值科技按实际选择计算；未建模的独特/特殊效果未计入。未计入射程先手、追击与风筝、地形、抬手、阵型和包围、聚落治疗、招降；不比较经济与到场时间，同数量不等于同资源投入，不是胜率或实战保证。
      </p>
      {build != null ? (
        <p className="champi-reference-note">
          数据 <span className="num nw">DE {build}</span>；仅在资料已核对时提供结果与链接。
        </p>
      ) : null}
    </section>
  );
}
