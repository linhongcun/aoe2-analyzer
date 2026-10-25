import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { civs } from '../../data';
import { useCore, useTrees } from '../../data/hooks';
import {
  DEFAULT_HEALING_CONFIG,
  availableHealingTechs,
  calculateGarrisonHealing,
  freeHealingTechs,
  getHealingBuildings,
  getHealingCandidates,
  readHealingConfig,
  toggleHealingTech,
  writeHealingConfig,
  type HealingConfig,
  type HealingContext,
} from '../../domain/garrisonHealing';
import { getGarrisonBuildingAge, type GarrisonCandidate, type GarrisonEntry } from '../../domain/garrisonGeneral';
import { AGE_ZH } from '../../domain/ratings';
import { Icon } from '../../shared/ui/Icon';
import { Loading } from '../../shared/ui/widgets';
import { GameClockLink } from '../../shared/ui/GameClockLink';
import { useShareLink } from '../../shared/ui/useShareLink';
import './garrisonHealing.css';

const num = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const ENTRY_LABEL: Record<GarrisonEntry, string> = { enter: '从外部进入', created: '生产后留驻', deposit: '存放圣物' };
const entries = (candidate: GarrisonCandidate | undefined): GarrisonEntry[] => [
  ...(candidate?.canEnter ? ['enter' as const] : []),
  ...(candidate?.canCreate ? ['created' as const] : []),
  ...(candidate?.canDeposit ? ['deposit' as const] : []),
];
const STATUS_LABEL = {
  valid: '理论恢复时间',
  complete: '已达到目标，无需恢复',
  invalid: '当前配置无法计算',
  ineligible: '不具备建筑治疗资格',
  'zero-rate': '建筑治疗速率为零',
  unverified: '治疗机制待核实',
};

export default function GarrisonHealing() {
  const core = useCore(),
    trees = useTrees();
  if (!core || !trees)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  return <HealingBody ctx={{ core, trees }} />;
}

function HealingBody({ ctx }: { ctx: HealingContext }) {
  const [, setParams] = useSearchParams();
  const source = useLocation().search;
  const decoded = useMemo(() => readHealingConfig(new URLSearchParams(source), { core: ctx.core, trees: ctx.trees }, source), [source, ctx.core, ctx.trees]);
  const [draft, setDraft] = useState({ source, config: decoded.config });
  const config = draft.source === source ? draft.config : decoded.config;
  const {
    copy: copyLink,
    status: shareStatus,
    manualLink,
    reset: resetShare,
    statusProps,
  } = useShareLink({
    stateKey: JSON.stringify([source, config]),
    successMessage: '链接已复制，包含当前全部设置。',
    failureMessage: '自动复制失败，请手动复制下方链接。',
  });
  // Discard an unfinished draft when history navigation selects another URL.
  // Returning to its old URL must restore that URL rather than revive the draft.
  if (draft.source !== source) setDraft({ source, config: decoded.config });
  const result = calculateGarrisonHealing(ctx, config);
  const buildings = getHealingBuildings(ctx);
  const candidates = getHealingCandidates(ctx, config);
  const candidate = candidates.find((unit) => unit.id === config.unitId);
  const options = entries(candidate);
  const available = availableHealingTechs(ctx, config);
  const free = new Set(freeHealingTechs(ctx, config));
  const selected = new Set([...result.selected, ...free]);
  const locked = decoded.errors.length > 0;
  const errors = [...new Set([...decoded.errors, ...result.errors])];
  const unitName = candidate?.zh ?? ctx.core.unitById[config.unitId]?.zh ?? `单位 ${config.unitId}`;
  const blocked = locked || result.status === 'invalid';
  const unshareable = blocked || (result.status === 'ineligible' && config.entry !== 'deposit');

  const update = (next: HealingConfig) => {
    if (locked) return;
    setDraft({ source, config: next });
    resetShare();
    // Keep unfinished HP input editable without turning it into a broken URL.
    // Directly opened malformed links remain locked until the explicit reset.
    const nextStatus = calculateGarrisonHealing(ctx, next).status;
    if (nextStatus !== 'invalid' && !(nextStatus === 'ineligible' && next.entry !== 'deposit')) setParams(writeHealingConfig(next), { replace: true });
  };
  const changeContext = (patch: Partial<HealingConfig>) => {
    let next = { ...config, ...patch, techs: [] };
    const allowed = buildings.filter((building) => building.civs.includes(next.civ) && getGarrisonBuildingAge(building, next.civ, ctx.trees) <= next.age);
    if (!allowed.some((building) => building.id === next.buildingId) && allowed[0]) next = { ...next, buildingId: allowed[0].id };
    const units = getHealingCandidates(ctx, next);
    const unit = units.find((item) => item.id === next.unitId) ?? units.find((item) => item.id === 83) ?? units[0];
    const unitEntries = entries(unit);
    if (unit) next = { ...next, unitId: unit.id, entry: unitEntries.includes(next.entry) ? next.entry : (unitEntries[0] ?? 'enter') };
    update(next);
  };
  const reset = () => {
    const next = { ...DEFAULT_HEALING_CONFIG, techs: [] };
    setDraft({ source: '?' + writeHealingConfig(next).toString(), config: next });
    setParams(writeHealingConfig(next), { replace: true });
    resetShare();
  };
  const copy = async () => {
    if (unshareable) return;
    await copyLink(() => {
      const url = new URL(document.baseURI);
      url.search = '';
      url.hash = '/garrison-healing?' + writeHealingConfig(config).toString();
      return url.href;
    });
  };
  const comparison = [
    { label: '未研究草药', value: result.beforeHerbal, testId: 'healing-before' },
    { label: '草药生效后', value: result.afterHerbal, testId: 'healing-after' },
  ];
  const beforeRate = result.beforeHerbal.hpPerSecond,
    afterRate = result.afterHerbal.hpPerSecond;
  const multiplier = beforeRate !== null && beforeRate > 0 && afterRate !== null ? afterRate / beforeRate : null;

  return (
    <section className="pane healing-page" data-testid="garrison-healing-page">
      <header className="healing-heading">
        <div>
          <h1>驻军回血</h1>
          <p className="note">查看一个单位在建筑内的静态治疗速率，以及草药前后的理论恢复时间。时间均为游戏时间。</p>
        </div>
        <button type="button" className="btn" disabled={unshareable} onClick={() => void copy()}>
          <Icon name="copy" />
          复制回血方案
        </button>
      </header>
      {shareStatus && <p {...statusProps}>{shareStatus}</p>}
      {manualLink && (
        <label className="healing-manual">
          回血方案链接
          <input readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      {locked && (
        <div role="alert" className="healing-error" data-testid="healing-link-error">
          <h2>链接无效，配置已锁定</h2>
          <p>请显式重置后重新配置。修改其他字段不会清除损坏链接。</p>
          <ul>
            {decoded.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={reset}>
            重置回血方案
          </button>
        </div>
      )}

      <div className="healing-columns">
        <section className="healing-card" aria-labelledby="healing-config-title">
          <h2 id="healing-config-title">恢复配置</h2>
          <fieldset disabled={locked} className="healing-fields" aria-label="回血配置">
            <label>
              文明
              <select aria-label="回血文明" value={config.civ} onChange={(event) => changeContext({ civ: event.target.value })}>
                {civs.map((civ) => (
                  <option value={civ.en} key={civ.en}>
                    {civ.zh}
                  </option>
                ))}
              </select>
            </label>
            <label>
              时代
              <select aria-label="回血时代" value={config.age} onChange={(event) => changeContext({ age: Number(event.target.value) })}>
                {[1, 2, 3, 4].map((age) => (
                  <option value={age} key={age}>
                    {AGE_ZH[age]}
                  </option>
                ))}
              </select>
            </label>
            <label className="healing-span">
              建筑
              <select aria-label="回血建筑" value={config.buildingId} onChange={(event) => changeContext({ buildingId: Number(event.target.value) })}>
                {!buildings.some((building) => building.id === config.buildingId) && <option value={config.buildingId}>不可用建筑</option>}
                {buildings.map((building) => (
                  <option
                    value={building.id}
                    key={building.id}
                    disabled={!building.civs.includes(config.civ) || getGarrisonBuildingAge(building, config.civ, ctx.trees) > config.age}
                  >
                    {building.zh}
                  </option>
                ))}
              </select>
            </label>
            <label className="healing-span">
              单位
              <select
                aria-label="回血单位"
                value={config.unitId}
                onChange={(event) => {
                  const unitId = Number(event.target.value);
                  const nextEntries = entries(candidates.find((unit) => unit.id === unitId));
                  const next = { ...config, unitId, entry: nextEntries.includes(config.entry) ? config.entry : (nextEntries[0] ?? 'enter') };
                  const related = new Set(availableHealingTechs(ctx, next).map((tech) => tech.id));
                  update({ ...next, techs: config.techs.filter((id) => related.has(id)) });
                }}
              >
                {!candidate && <option value={config.unitId}>{unitName}（当前不可用）</option>}
                {candidates.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.zh} · {unit.category}
                  </option>
                ))}
              </select>
            </label>
            <label className="healing-span">
              驻留方式
              <select aria-label="回血驻留方式" value={config.entry} onChange={(event) => update({ ...config, entry: event.target.value as GarrisonEntry })}>
                {!options.includes(config.entry) && <option value={config.entry}>{ENTRY_LABEL[config.entry]}（不适用）</option>}
                {options.map((entry) => (
                  <option value={entry} key={entry}>
                    {ENTRY_LABEL[entry]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              当前 HP
              <input
                type="text"
                inputMode="decimal"
                aria-label="当前 HP"
                value={config.currentHp}
                onChange={(event) => update({ ...config, currentHp: event.target.value })}
              />
            </label>
            <label>
              目标 HP
              <input
                type="text"
                inputMode="decimal"
                aria-label="目标 HP"
                value={config.targetHp}
                onChange={(event) => update({ ...config, targetHp: event.target.value })}
              />
            </label>
          </fieldset>
          <p className="note" data-testid="healing-max-hp">
            所选单位最大 HP：{result.maxHp === null ? '待核实' : <strong className="healing-number">{num(result.maxHp)} HP</strong>}。
            切换文明、时代或建筑会清空自选科技；切换单位仅保留相关科技。当前与目标 HP 均保留，超出新上限时请手动修正。
          </p>
          {candidates.length === 0 && <p className="healing-warning">当前组合没有可用驻留单位，请更换建筑、文明或时代。</p>}
          {candidate?.reason && <p className="note">{candidate.reason}</p>}
          {config.entry === 'created' && (
            <p className="healing-warning" data-testid="healing-created-warning">
              生产后留驻仅表示单位自产后留在建筑内，不表示受伤单位能从外部重新进入。此项不提供返场疗伤建议。
            </p>
          )}
          {config.entry === 'deposit' && <p className="healing-warning">圣物存放与单位恢复不同，驻留合法不等于具备治疗资格。</p>}
          <fieldset disabled={locked} className="healing-techs">
            <legend>影响 HP 与治疗的已研究科技</legend>
            <p className="note">前置联动；免费及自动科技各生效一次。不从弹丸科技列表推断治疗效果。</p>
            <div className="healing-tech-grid">
              {available.map((tech) => (
                <label key={tech.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(tech.id)}
                    disabled={free.has(tech.id)}
                    onChange={() => update({ ...config, techs: toggleHealingTech(ctx, config, tech.id) })}
                  />
                  <span>
                    {tech.zh}
                    {free.has(tech.id) ? '（免费，自动生效）' : ''}
                  </span>
                </label>
              ))}
            </div>
            {available.length === 0 && <p className="note">当前组合没有可选择的相关科技。</p>}
            <button type="button" className="btn" onClick={() => update({ ...config, techs: [] })}>
              清空自选科技
            </button>
          </fieldset>
          <p>
            <Link className="ulink" to={`/building/${config.buildingId}?tab=garrison`}>
              查看建筑驻军配置与弹丸预览
            </Link>
          </p>
        </section>

        <section
          className="healing-card healing-result"
          aria-labelledby="healing-result-title"
          data-testid="healing-result"
          data-status={locked ? 'invalid' : result.status}
        >
          <h2 id="healing-result-title">{locked ? '链接无效，暂停计算' : STATUS_LABEL[result.status]}</h2>
          {blocked ? (
            <div role={locked ? undefined : 'alert'} className="healing-error">
              {!locked && (
                <ul>
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
              <p>修正当前配置后再查看恢复时间。HP 输入不会自动夹到最大值。</p>
            </div>
          ) : (
            <>
              <p>{result.reason}</p>
              {(result.status === 'valid' || result.status === 'complete') && (
                <dl className="healing-metrics">
                  <div>
                    <dt>达到目标</dt>
                    <dd className="healing-number" data-testid="healing-seconds">
                      {result.seconds === null ? '待核实' : `${num(result.seconds)} 秒`}
                    </dd>
                  </div>
                  <div>
                    <dt>建筑治疗</dt>
                    <dd className="healing-number" data-testid="healing-rate">
                      {result.hpPerMinute === null ? '待核实' : `${num(result.hpPerMinute)} HP / 分钟`}
                    </dd>
                  </div>
                  <div>
                    <dt>恢复区间</dt>
                    <dd className="healing-number">
                      {config.currentHp} 至 {config.targetHp} HP
                    </dd>
                  </div>
                </dl>
              )}
              {['valid', 'complete'].includes(result.status) && result.seconds !== null && <GameClockLink seconds={result.seconds} label="换算这段回血时间" />}
              {!['valid', 'complete'].includes(result.status) && (
                <p className="healing-warning" data-testid="healing-paused">
                  已暂停恢复时间计算。该状态不能用零秒表示。
                </p>
              )}
              <h3>草药前后对照</h3>
              <p className="note">使用相同的绝对当前 HP 与目标 HP。若某侧最大 HP 不足，该侧暂停比较，不改变目标。</p>
              <div className="healing-comparison">
                {comparison.map(({ label, value, testId }) => (
                  <section key={label} aria-label={label} data-testid={testId} data-status={value.status}>
                    <h4>{label}</h4>
                    <p>{value.reason}</p>
                    {value.hpPerMinute !== null && <p className="healing-number">{num(value.hpPerMinute)} HP / 分钟</p>}
                    {value.seconds !== null ? <strong className="healing-number">{num(value.seconds)} 秒</strong> : <strong>暂停比较</strong>}
                  </section>
                ))}
              </div>
              {multiplier !== null && (
                <p className="healing-multiplier" data-testid="healing-multiplier">
                  草药后速率为原来的 <strong className="healing-number">{num(multiplier)} 倍</strong>，即增加{' '}
                  <strong className="healing-number">{num((multiplier - 1) * 100)}%</strong>。 百分比表示新增部分；免费草药不会再重复乘一次。
                </p>
              )}
              {result.warnings.length > 0 && (
                <ul className="healing-warning">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {!locked && (
            <button type="button" className="btn" onClick={reset}>
              重置回血方案
            </button>
          )}
        </section>
      </div>

      <section className="healing-card healing-boundary" aria-labelledby="healing-boundary-title">
        <h2 id="healing-boundary-title">来源与计算范围</h2>
        <p>固定数据：DE Update 185872。建筑速率、相关科技与治疗资格由固定版 .dat 可复现导出，驻留权限复用驻军兼容性模型，最大 HP 使用单位科技模型。</p>
        <p>假定一个目标已在建筑内、没有继续受伤，只计算建筑提供的静态治疗。机械等机制尚未核实的组合会暂停；未经过当前版本游戏客户端实测。</p>
        <p>不计单位自身再生、僧侣主动治疗或范围治疗，不模拟往返、微操、战斗与批次调度，也不据此判断治疗是否回本。</p>
        <p>
          <Link className="ulink" to="/about-data">
            查看本站数据来源
          </Link>
        </p>
      </section>
    </section>
  );
}
