import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import civs from '../../data/raw/civs';
import {
  ATHEISM_STATES,
  calculateRelicIncome,
  decodeRelicIncome,
  encodeRelicIncome,
  newRelicIncomeConfig,
  RELIC_INPUT_MAX,
  RELIC_RESOURCES,
  relicIncomeShareUrl,
  validateRelicIncomeConfig,
  validRelicIncomeData,
  type RelicAtheism,
  type RelicIncomeConfig,
  type RelicIncomeData,
} from '../../domain/relicIncome';
import { Breadcrumbs } from '../../shared/ui/layout';
import { Icon } from '../../shared/ui/Icon';
import { GameClockLink } from '../../shared/ui/GameClockLink';
import './relicIncome.css';

const resourceNames = { Gold: '黄金', Food: '食物', Wood: '木材', Stone: '石料' };
const units = { Gold: '金', Food: '食物', Wood: '木材', Stone: '石料' };
const atheismNames: Record<RelicAtheism, string> = {
  none: '未生效（默认假设）',
  one: '一个对手来源，全期间已生效',
  multiple: '多个已生效来源（未核实）',
  unknown: '是否生效未知',
  changing: '期间状态或外交变化',
};
const num = (n: number) =>
  n.toLocaleString(
    'zh-CN',
    Math.abs(n) >= 1e7 || (n !== 0 && Math.abs(n) < 0.01) ? { notation: 'scientific', maximumFractionDigits: 4 } : { maximumFractionDigits: 2 },
  );

export default function RelicIncome() {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeRelicIncome(location.search), [location.search]);
  const [draft, setDraft] = useState<{ search: string; config: RelicIncomeConfig } | null>(null);
  const [loaded, setLoaded] = useState<{ data: RelicIncomeData | null; error: boolean }>({ data: null, error: false });
  const [retry, setRetry] = useState(0);
  const [shared, setShared] = useState<{ key: string; message: string; manual: string } | null>(null);
  useEffect(() => {
    let active = true;
    import('../../data/relic_income.json')
      .then((module) => {
        const data: unknown = module.default;
        if (!validRelicIncomeData(data)) throw new Error('Invalid relic data');
        if (active) setLoaded({ data, error: false });
      })
      .catch(() => {
        if (active) setLoaded({ data: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const c = draft?.search === location.search ? draft.config : decoded.config;
  const locked = decoded.structuralErrors.length > 0;
  const data = loaded.data;
  const r = data ? calculateRelicIncome(c, data) : null;
  const errors = [...decoded.structuralErrors, ...(r?.errors ?? [])];
  const key = encodeRelicIncome(c);
  const feedback = shared?.key === key ? shared : null;
  const write = (next: RelicIncomeConfig) => {
    setDraft(null);
    setShared(null);
    navigate({ pathname: '/relic-income', search: '?' + encodeRelicIncome(next) }, { replace: true });
  };
  const update = (next: RelicIncomeConfig) => {
    if (locked) return;
    setShared(null);
    if (validateRelicIncomeConfig(next).length) setDraft({ search: location.search, config: next });
    else write(next);
  };
  const copy = async () => {
    if (errors.length || !data) return;
    let link = '';
    try {
      link = relicIncomeShareUrl(c, document.baseURI);
      await navigator.clipboard.writeText(link);
      setShared({ key, message: '方案链接已复制，包含数量、时长、队友与研究状态。', manual: '' });
    } catch {
      setShared({ key, message: link ? '自动复制失败，请手动复制完整方案链接。' : '无法生成完整方案链接，请核对输入。', manual: link });
    }
  };
  const selectCiv = (value: string, change: (civ: string) => void, label: string, optional = false) => (
    <select aria-label={label} value={value} onChange={(e) => change(e.target.value)}>
      {optional && <option value="">未提供相关来源</option>}
      {value && !civs.some((civilization) => civilization.en === value) && <option value={value}>无效文明：{value}</option>}
      {civs.map((civilization) => (
        <option key={civilization.en} value={civilization.en}>
          {civilization.zh}
        </option>
      ))}
    </select>
  );
  return (
    <section className="pane relic-income" data-testid="relic-income-page">
      <Breadcrumbs />
      <header className="relic-heading">
        <h1>圣物收入</h1>
        <p>估算已存放且生效的固定圣物，在一段游戏时间内提供的分资源收入。</p>
      </header>
      {!data ? (
        <div className="relic-card">
          {loaded.error ? (
            <>
              <p role="alert">固定圣物数据加载失败，已暂停计算。</p>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setLoaded({ data: null, error: false });
                  setRetry((n) => n + 1);
                }}
              >
                重试加载数据
              </button>
            </>
          ) : (
            <p role="status">正在加载固定圣物数据…</p>
          )}
        </div>
      ) : (
        r && (
          <>
            <div className="relic-actions">
              <button className="btn" type="button" onClick={() => void copy()} disabled={errors.length > 0}>
                <Icon name="copy" />
                复制方案链接
              </button>
              <button className="btn" type="button" onClick={() => write(newRelicIncomeConfig())}>
                重置圣物方案
              </button>
            </div>
            {feedback && (
              <p role="status" className="relic-note">
                {feedback.message}
              </p>
            )}
            {feedback?.manual && (
              <label className="relic-manual">
                完整方案链接
                <textarea aria-label="完整方案链接" readOnly value={feedback.manual} onFocus={(e) => e.currentTarget.select()} />
              </label>
            )}
            {errors.length > 0 && (
              <div role="alert" className="relic-error">
                <ul>
                  {[...new Set(errors)].map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
                <p>{locked ? '链接结构损坏，未将默认结果当作恢复。请保留原链接，显式重置后重新配置。' : '输入已保留，请直接修正；当前结果已暂停。'}</p>
              </div>
            )}
            {locked && (
              <label className="relic-manual">
                原方案链接
                <textarea aria-label="原方案链接" readOnly value={window.location.href} onFocus={(e) => e.currentTarget.select()} />
              </label>
            )}
            <div className="relic-columns">
              <section className="relic-card" aria-labelledby="relic-input-title">
                <h2 id="relic-input-title">已生效的本局条件</h2>
                <fieldset className="relic-settings" disabled={locked}>
                  <legend className="relic-sr-only">圣物条件与目标</legend>
                  <label>本方文明{selectCiv(c.civ, (civ) => update({ ...c, civ }), '圣物文明')}</label>
                  <label>
                    已存放且生效的圣物数
                    <input aria-label="已生效圣物数量" inputMode="numeric" value={c.count} onChange={(e) => update({ ...c, count: e.target.value })} />
                  </label>
                  <label>
                    持续游戏分钟
                    <input aria-label="持续游戏分钟" inputMode="decimal" value={c.minutes} onChange={(e) => update({ ...c, minutes: e.target.value })} />
                  </label>
                  <label>
                    目标黄金／游戏分钟
                    <input aria-label="目标黄金／游戏分钟" inputMode="decimal" value={c.target} onChange={(e) => update({ ...c, target: e.target.value })} />
                  </label>
                  <p className="relic-note relic-span">
                    数量只填已存放、生效且整个期间固定的圣物。时长为游戏时间；每项输入上限 {RELIC_INPUT_MAX.toLocaleString('zh-CN')} 是工具限制。
                  </p>
                  <label className="relic-check relic-span">
                    <input type="checkbox" checked={c.grandTrunkRoad} onChange={(e) => update({ ...c, grandTrunkRoad: e.target.checked })} />
                    <span>本方已研究大干道（仅印度斯坦）</span>
                  </label>
                  <p className="relic-note relic-span">研究状态须在整个期间不变；盟友的大干道不会提高本方收入。切换文明后仍保留选择，若不适用请取消。</p>
                  <label className="relic-span">
                    对手无神论状态
                    <select aria-label="无神论状态" value={c.atheism} onChange={(e) => update({ ...c, atheism: e.target.value as RelicAtheism })}>
                      {!ATHEISM_STATES.includes(c.atheism) && <option value={c.atheism}>无效状态：{c.atheism}</option>}
                      {ATHEISM_STATES.map((state) => (
                        <option key={state} value={state}>
                          {atheismNames[state]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="relic-note relic-span">“未生效”是默认假设。一个来源仅施加一次敌对或中立分支；多个、未知或期间变化会暂停黄金与食物结果。</p>
                  <div className="relic-span">
                    <h3>已确认的队伍来源</h3>
                    <p className="relic-note">
                      本方团队来源自动计入。可记录最多三名队友；相同文明可以重复，团队效果按来源文明只计一次。留空表示本方案未提供该来源。
                    </p>
                  </div>
                  {c.allies.map((ally, i) => (
                    <label className="relic-span" key={i}>
                      队友{i + 1}文明
                      {selectCiv(
                        ally,
                        (civ) => {
                          const allies: RelicIncomeConfig['allies'] = [...c.allies];
                          allies[i] = civ;
                          update({ ...c, allies });
                        },
                        `队友${i + 1}文明`,
                        true,
                      )}
                    </label>
                  ))}
                </fieldset>
              </section>
              <section
                className="relic-card relic-result"
                aria-labelledby="relic-result-title"
                data-testid="relic-result"
                data-status={locked ? 'invalid' : r.status}
              >
                <h2 id="relic-result-title">{errors.length ? '输入无效，暂停计算' : r.status === 'paused' ? '部分资源未核实' : '分资源收入'}</h2>
                {!errors.length && (
                  <>
                    {r.status === 'paused' && (
                      <p role="alert" className="relic-warning">
                        黄金、食物与金耗覆盖已暂停，不能将未核实结果写成零。
                      </p>
                    )}
                    <div className="relic-resources">
                      {RELIC_RESOURCES.map((resource) => (
                        <section className="relic-resource" key={resource} aria-label={`${resourceNames[resource]}收入`}>
                          <h3>{resourceNames[resource]}</h3>
                          <dl>
                            <div>
                              <dt>每游戏分钟</dt>
                              <dd className="relic-number" data-testid={`relic-rate-${resource}`}>
                                {r.resources[resource].perMinute === null
                                  ? '未核实，暂停'
                                  : `${num(r.resources[resource].perMinute!)} ${units[resource]}／游戏分钟`}
                              </dd>
                            </div>
                            <div>
                              <dt>期间总量</dt>
                              <dd className="relic-number" data-testid={`relic-total-${resource}`}>
                                {r.resources[resource].total === null ? '未核实，暂停' : `${num(r.resources[resource].total!)} ${units[resource]}`}
                              </dd>
                            </div>
                          </dl>
                        </section>
                      ))}
                    </div>
                    <h3>目标黄金供需</h3>
                    <dl className="relic-target">
                      <div>
                        <dt>目标金耗／游戏分钟</dt>
                        <dd className="relic-number">{num(r.target!)} 金</dd>
                      </div>
                      <div>
                        <dt>圣物覆盖／游戏分钟</dt>
                        <dd className="relic-number" data-testid="relic-covered">
                          {r.covered === null ? '暂停计算' : `${num(r.covered)} 金`}
                        </dd>
                      </div>
                      <div>
                        <dt>缺口／游戏分钟</dt>
                        <dd className="relic-number" data-testid="relic-gap">
                          {r.gap === null ? '暂停计算' : `${num(r.gap)} 金`}
                        </dd>
                      </div>
                    </dl>
                    <p className="relic-note">只比较黄金，不代表仅靠黄金便可维持部队；食物、木材、石料分别计算，不相加为总收益。</p>
                    {r.warnings.length > 0 && (
                      <ul className="relic-note" data-testid="relic-warnings">
                        {r.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                    <GameClockLink seconds={+c.minutes * 60} label="换算这段游戏时间" />
                    <details className="relic-details">
                      <summary>来源贡献与计算顺序</summary>
                      <p className="relic-note">
                        按通用规则、团队来源、大干道、无神论顺序逐步计算。下面列出每一步的增减贡献，各资源分别对账。计算直接使用 .dat 原始 Float32
                        参数；界面显示四舍五入，显示项的合计可能有末位差异。
                      </p>
                      <ul className="relic-ledger">
                        {r.sources.map((row) => (
                          <li key={row.id} data-testid={`relic-source-${row.id}`}>
                            <strong>
                              {row.label} · {resourceNames[row.resource]}
                            </strong>
                            <p>
                              {row.providers.join('、')}；{row.rule}
                              {row.effectId !== null ? `；效果 ${row.effectId}` : ''}
                            </p>
                            <p>
                              {row.perMinute === null ? (
                                '受影响贡献暂停计算'
                              ) : (
                                <>
                                  <span className="relic-number">
                                    {row.perMinute > 0 ? '+' : ''}
                                    {num(row.perMinute)} {units[row.resource]}／游戏分钟
                                  </span>
                                  ；期间{' '}
                                  <span className="relic-number">
                                    {row.total! > 0 ? '+' : ''}
                                    {num(row.total!)} {units[row.resource]}
                                  </span>
                                </>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              </section>
            </div>
            {c.civ === 'Lithuanians' && (
              <section className="relic-card" data-testid="relic-lithuanian">
                <h2>立陶宛圣物效果说明</h2>
                <p>适用于{data.lithuanians.units.map((unit) => unit.zh).join('、')}。不适用于翼骑兵。</p>
                <p>
                  已存放圣物的触发阈值为 {data.lithuanians.thresholds.map((threshold) => threshold.count).join('、')} 件；每级攻击加成 +
                  {data.lithuanians.attackIncrement}，最高 +{data.lithuanians.cap * data.lithuanians.attackIncrement}，超出上限不继续叠加。
                </p>
                {!errors.length && r.lithuanian && (
                  <p data-testid="relic-lithuanian-bonus">
                    当前数量对应的加成说明：+{r.lithuanian.bonus}（最高 +{r.lithuanian.cap}）。
                  </p>
                )}
                <p className="relic-note">只说明固定版本效果，不计算改变后的单位攻击面板、战斗或取出圣物后的过程；不修改单位PK及科技模拟器。</p>
              </section>
            )}
            <details className="relic-card relic-details">
              <summary>支持范围、字段与来源</summary>
              <p>
                按 {data.meta.patch} 固定数据估算。支持全部{Object.keys(data.civs).length}个本站常规文明；阿兹特克团队黄金倍率{' '}
                {data.modifiers.aztecs.displayValue}
                ，勃艮第团队每件食物 {data.modifiers.burgundians.displayValue}／游戏分钟，本方大干道黄金倍率 {data.modifiers.grandTrunkRoad.displayValue}
                ，单一对手无神论黄金及食物倍率 {data.modifiers.atheism.displayValue}。
              </p>
              <p>
                参数来自固定 .dat
                的文明资源191（黄金）、225（食物）、264（木材）、265（石料）及效果命令；资源7作为已存放数量阈值。圣物和修道院没有直接产生这项收入的151任务，不能把修道院工作速率当作收益倍率。
              </p>
              <p>
                时间单位与引擎效果语义来自下列字段文档；文档中的历史示例数字没有用于本模型。全局扫描 {data.audit.unitTaskCount.toLocaleString('zh-CN')}{' '}
                项单位任务、{data.audit.headerTaskCount.toLocaleString('zh-CN')} 项header任务和相关资源命令，未运行 DE185872 游戏客户端逐帧结算验证。
              </p>
              <p>
                亚美尼亚免费圣物如已存放，计入输入数量，不再自动加一件。修道院与强化教堂采用相同收入参数；立陶宛团队修道院工作速度不额外放大收入。其他普通队伍加成不会凭文案套用成圣物收益。
              </p>
              <p>
                仅算固定数量、固定生效状态和固定期间；不模拟抢夺、携带路程、途中增减、研究完成时刻、外交改变、战役触发或自制场景奖励。多个无神论来源尚未核实其执行叠加，暂停黄金、食物及金耗覆盖。
              </p>
              <p className="relic-note">
                原立陶宛效果还含{data.lithuanians.extraRawTargets.map((unit) => `${unit.zh}（${unit.id}）`).join('、')}
                ，普通立陶宛科技树不可用，未列入上述普通适用单位。
              </p>
              <p className="relic-provenance">
                数据所用游戏 .dat 的固定版本与校验信息见<Link to="/about-data">关于数据</Link>。核对日：{data.meta.semanticsChecked}。原字段与导出方式见仓库
                docs/RELIC-INCOME.md；参数能由 scripts/relic_income_build.py --check 复现。
              </p>
              <div className="relic-links">
                <a
                  className="relic-link"
                  href={`https://github.com/${data.meta.datSource.repo}/blob/${data.meta.datSource.commit}/${data.meta.datSource.path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  固定数据提交
                </a>
                <a className="relic-link" href={data.meta.fieldSemantics.resources} target="_blank" rel="noreferrer">
                  资源字段与时间单位
                </a>
                <a className="relic-link" href={data.meta.fieldSemantics.effectTypes} target="_blank" rel="noreferrer">
                  引擎效果类型语义
                </a>
              </div>
            </details>
            <nav className="relic-links" aria-label="相关工具">
              <Link className="relic-link" to="/team-bonuses">
                队伍加成来源
              </Link>
              <Link className="relic-link" to="/building/104?tab=garrison">
                修道院驻军容量
              </Link>
              <Link className="relic-link" to="/building/1806?tab=garrison">
                强化教堂驻军容量
              </Link>
              <Link className="relic-link" to="/production">
                持续生产工具
              </Link>
            </nav>
          </>
        )
      )}
    </section>
  );
}
