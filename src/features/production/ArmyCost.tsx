import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civByEn } from '../../data';
import { ARMY_RESEARCH } from '../../data/armyResearch';
import { armyResearchChoices, evaluateArmyCost, researchKey } from '../../domain/armyCost';
import { ARMY_RESEARCH_STATES as STATES } from '../../domain/armyResearchEvidence';
import { ARMY_COST_DATA, emptyArmyCost, type ArmyCostConfig } from '../../domain/armyCostConfig';
import { productionUnits, PRODUCTION_UNLOCK_TECH_IDS, type ProductionContext } from '../../domain/production';
import { AGE_ZH } from '../../domain/ratings';
import { CostView, UnitIcon } from '../../shared/ui/art';
import { CivPicker } from '../../shared/ui/CivPicker';
import { Icon } from '../../shared/ui/Icon';
import { ToolPageHeader } from '../../shared/ui/ToolPageHeader';
import { SHARE_STATUS_PROPS, useShareLink } from '../../shared/ui/useShareLink';
import { ProductionCrumbs, ProductionModeNav } from './ProductionModeNav';
import { PRODUCTION_MODE_LABELS } from '../../domain/productionMode';
import { decodeArmyCost, encodeArmyCost } from './armyCostCodec';
import { ArmyResultsPanel } from './ArmyResultsPanel';
import { ArmyUnitPicker } from './ArmyUnitPicker';
import { armySupplyHref } from './armySupplyCodec';
import './armyCost.css';

export default function ArmyCost({ context, loadingError }: { context: ProductionContext | null; loadingError: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const decoded = useMemo(() => decodeArmyCost(location.search), [location.search]);
  const config = decoded.config;
  const civ = config?.civ;
  const age = config?.age;
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<number | null>(null);
  const [doneSearch, setDoneSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const resultRef = useRef<HTMLHeadingElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const editorTitle = useRef<HTMLHeadingElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const manualLinkRef = useRef<HTMLInputElement>(null);
  const share = useShareLink({ stateKey: location.search });
  const result = useMemo(() => (context && config && !decoded.dataChanged ? evaluateArmyCost(context, config) : null), [context, config, decoded.dataChanged]);
  const supplyHref = config && result && !result.blocked.length ? armySupplyHref(config) : null;
  const units = useMemo(
    () =>
      context && civ && age && civByEn(civ) && /^[1-4]$/.test(age)
        ? productionUnits(context, { civ, age: Number(age), techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 })
        : [],
    [context, civ, age],
  );
  const choices = useMemo(() => {
    const keys = new Set<string>(config ? [...config.done, ...config.targets] : []);
    const scoped = new Set(context && config ? armyResearchChoices(context, config, false).map(researchKey) : []);
    if (context && config) for (const id of armyResearchChoices(context, config)) keys.add(researchKey(id));
    for (const e of result?.ledger ?? []) keys.add(e.key);
    return [...keys].map((key) => ({
      key,
      scoped: scoped.has(key),
      entry: result?.ledger.find((e) => e.key === key),
      name: result?.ledger.find((e) => e.key === key)?.name ?? ARMY_RESEARCH.nodes[key.slice(2)]?.name ?? `未识别研究 ${key}`,
    }));
  }, [context, config, result]);
  const update = (next: ArmyCostConfig, confirmData = false) => {
    share.reset();
    navigate(
      '/production?' + encodeArmyCost(next, decoded.dataChanged && !confirmData ? new URLSearchParams(location.search).get('acdata')! : ARMY_COST_DATA),
      { replace: true },
    );
  };
  const focus = (element: HTMLElement | null) => {
    element?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    element?.focus({ preventScroll: true });
  };
  const toggle = (field: 'done' | 'targets', key: string) => {
    if (!config) return;
    const next = config[field].includes(key) ? config[field].filter((k) => k !== key) : [...config[field], key];
    update({ ...config, [field]: next });
  };
  const copy = () => {
    const url = new URL(window.location.href);
    url.hash = '/production?' + encodeArmyCost(config!);
    void share.copy(url.href);
  };
  const rowEdit = (index: number, patch: Partial<ArmyCostConfig['rows'][number]>) =>
    config && update({ ...config, rows: config.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  const closePicker = () => {
    const index = picker;
    setPicker(null);
    if (index !== null) requestAnimationFrame(() => (document.getElementById(`army-unit-${index}`) ?? addRef.current)?.focus());
  };
  const openEditor = () => {
    setEditing(true);
    requestAnimationFrame(() => focus(editorTitle.current));
  };
  const renderResearch = (field: 'done' | 'targets', query: string, setQuery: (value: string) => void) => (
    <fieldset className="army-card">
      <legend>{field === 'done' ? '已完成' : '本次目标'}</legend>
      <p className="note">{field === 'done' ? '只标记已经研究的项目；低级前置自动推导，不重收历史费用。' : '可选强化默认不选；形态必需和必要前置自动保留。'}</p>
      <label>
        搜索{field === 'done' ? '已完成研究' : '目标研究'}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {choices
        .filter((c) => c.name.includes(query) || c.key.includes(query))
        .map((c) => {
          const manual = !!config?.[field].includes(c.key);
          const derived = field === 'done' ? c.entry && ['inferred-done', 'free'].includes(c.entry.status) : c.entry?.status === 'planned' && !manual;
          return (
            <div key={c.key} className="army-research-choice">
              <label>
                <input type="checkbox" checked={manual || !!derived} disabled={!!derived && !manual} onChange={() => toggle(field, c.key)} />
                <span>
                  {c.name}
                  <small>
                    {c.entry ? STATES[c.entry.status] : field === 'targets' && !c.scoped ? '作用域未核实，本次目标暂不计入' : '可选'}
                    {derived ? ' · 由当前目标或形态推导' : ''}
                  </small>
                </span>
              </label>
              {manual && c.entry?.status === 'invalid' && (
                <button className="btn" type="button" onClick={() => toggle(field, c.key)}>
                  移除无效项
                </button>
              )}
            </div>
          );
        })}
      {!choices.length && <p className="note">先添加兵种，再选择相关研究。</p>}
    </fieldset>
  );
  return (
    <section className="pane army-cost-page" data-testid="army-cost-page">
      <ToolPageHeader
        title={PRODUCTION_MODE_LABELS.army}
        description="从当前科技出发，核对一套阵容还要投入多少资源。"
        top={<ProductionCrumbs crumb={PRODUCTION_MODE_LABELS.army} />}
        subnav={<ProductionModeNav />}
        dock={
          <div className="army-actions">
            <button type="button" className="btn" disabled={!config || decoded.dataChanged} onClick={copy}>
              <Icon name="copy" />
              复制方案链接
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(false);
                requestAnimationFrame(() => focus(resultRef.current));
              }}
            >
              查看费用
            </button>
          </div>
        }
      />
      <p className="army-boundary">
        <Icon name="info" />
        <span>
          本期只算新增训练与研究。假设已具备必要的训练与研究建筑，不核实建筑存量、不计建筑投资、升时代、人口住房、维修及其它转型投入；不提供成型时间。
        </span>
      </p>
      {['rows', 'units', 'techs'].some((key) => new URLSearchParams(location.search).has(key)) && (
        <p className="note">链接中的旧模式兵种与科技字段未用于此模式；请分别设置本次阵容、已完成和目标研究。</p>
      )}
      {location.state?.fromArmySupply === true && (
        <p className="note" role="status">
          原兵种、数量和研究状态未更改。
        </p>
      )}
      {share.status && <p {...(share.manualLink ? { role: 'alert' } : SHARE_STATUS_PROPS)}>{share.status}</p>}
      {share.manualLink && (
        <label>
          手动复制完整链接
          <input readOnly ref={manualLinkRef} value={share.manualLink} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className="btn"
            onClick={() => {
              manualLinkRef.current?.focus();
              manualLinkRef.current?.select();
            }}
          >
            选中链接
          </button>
        </label>
      )}
      {!config ? (
        <section className="army-card">
          <h2 ref={resultRef} tabIndex={-1}>
            无法打开这个方案链接
          </h2>
          <div role="alert">
            {decoded.errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
          <div className="army-actions">
            <label>
              原始参数
              <textarea readOnly value={location.search} />
            </label>
            <button className="btn" type="button" onClick={() => void share.copy(location.search)}>
              复制原始参数
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (window.confirm('重新开始会清空当前无法解析的方案，是否继续？')) update(emptyArmyCost());
              }}
            >
              重新开始
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="army-context army-card">
            <h2>文明与时代</h2>
            <div className="army-fields">
              <div className="army-field">
                <label htmlFor="army-civ">文明</label>
                <CivPicker
                  id="army-civ"
                  label="阵容文明"
                  value={config.civ}
                  emptyText={!civByEn(config.civ) ? `无效文明：${config.civ}` : undefined}
                  invalid={!civByEn(config.civ)}
                  onChange={(nextCiv) => update({ ...config, civ: nextCiv })}
                />
              </div>
              <label>
                已到达时代
                <select value={config.age} onChange={(e) => update({ ...config, age: e.target.value })}>
                  {!/^[1-4]$/.test(config.age) && <option value={config.age}>无效时代：{config.age}</option>}
                  {[1, 2, 3, 4].map((age) => (
                    <option key={age} value={age}>
                      {AGE_ZH[age]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="note">按当前已到达时代计价，不比较跨时代研究顺序。切换后保留原有项，并重新核验。</p>
          </div>
          {decoded.dataChanged && (
            <section className="army-card" role="alert">
              <h2>数据版本已变化</h2>
              <p>
                输入已保留，旧版金额不会沿用。确认后按当前 DE Update <span className="num">{ARMY_COST_DATA}</span> 重新核算。
              </p>
              <label>
                原始参数
                <textarea readOnly value={location.search} />
              </label>
              <button className="btn" type="button" onClick={() => void share.copy(location.search)}>
                复制原始参数
              </button>
              <button className="btn" type="button" onClick={() => update(config, true)}>
                按当前数据重新核算
              </button>
            </section>
          )}
          {loadingError ? (
            <section className="army-card" role="alert">
              <h2>研究与训练资料加载失败</h2>
              <p>方案输入已保留，尚未生成报价。</p>
              <button className="btn" type="button" onClick={() => window.location.reload()}>
                重试加载
              </button>
            </section>
          ) : !context ? (
            <p role="status">正在加载研究与训练资料，方案输入已保留。</p>
          ) : null}
          {editing ? (
            <section className="army-editor">
              <div className="army-section-heading">
                <h2 ref={editorTitle} tabIndex={-1}>
                  编辑研究
                </h2>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    requestAnimationFrame(() => editRef.current?.focus());
                  }}
                >
                  完成编辑
                </button>
              </div>
              <p>选择即时应用。取消手动标记只撤销手动意图，仍被需要的前置会继续保留。</p>
              <div className="army-editor-columns">
                {renderResearch('done', doneSearch, setDoneSearch)}
                {renderResearch('targets', targetSearch, setTargetSearch)}
              </div>
            </section>
          ) : (
            <div className="army-workspace">
              <div className="army-inputs">
                <section className="army-card">
                  <div className="army-section-heading">
                    <h2>新增训练兵种</h2>
                    <span className="nw num">{config.rows.length} / 12 行</span>
                  </div>
                  <p className="note">数量是从现在起额外训练的单位数，不是建筑数或现有兵力。</p>
                  {config.rows.map((row, index) => {
                    const unit = context?.core.unitById[row.unit];
                    const line = result?.training.lines[index];
                    return (
                      <article className="army-unit-row" key={index}>
                        <div className="army-section-heading">
                          <button
                            id={`army-unit-${index}`}
                            className="army-unit-button"
                            type="button"
                            onClick={() => {
                              setPicker(index);
                            }}
                          >
                            {unit && <UnitIcon u={unit} />}
                            <span>
                              {unit?.zh ?? (row.unit ? `未知单位 ${row.unit}` : '选择兵种')}
                              <small>
                                第 <span className="num">{index + 1}</span> 行 · 点击更换形态
                              </small>
                            </span>
                            <Icon name="chevron-down" />
                          </button>
                          <button
                            className="btn"
                            type="button"
                            aria-label={`删除兵种 ${index + 1}`}
                            onClick={() => {
                              setPicker(null);
                              update({ ...config, rows: config.rows.filter((_, i) => i !== index) });
                              requestAnimationFrame(() => (document.getElementById(`army-unit-${Math.max(0, index - 1)}`) ?? addRef.current)?.focus());
                            }}
                          >
                            <Icon name="x" />
                          </button>
                        </div>
                        <div className="army-fields">
                          <label>
                            新增训练数量
                            <input
                              aria-label={`兵种 ${index + 1} 数量`}
                              id={`army-qty-${index}`}
                              aria-describedby={`army-row-error-${index}`}
                              className="num"
                              inputMode="numeric"
                              value={row.qty}
                              aria-invalid={!/^\d+$/.test(row.qty) || +row.qty < 1 || +row.qty > 1000}
                              onChange={(e) => rowEdit(index, { qty: e.target.value })}
                            />
                          </label>
                          <div>
                            <span className="note">目标状态单价</span>
                            {line?.cost ? <CostView c={line.cost} /> : <span>待核算</span>}
                          </div>
                        </div>
                        {line?.status !== 'ok' && line?.reason && (
                          <p className="army-warning" id={`army-row-error-${index}`}>
                            <Icon name="triangle-alert" />
                            {line.reason.replace(/研究费用不计。?/g, '')}
                          </p>
                        )}
                        {line?.subtotal && (
                          <div className="army-line-total">
                            <span>本行训练费</span>
                            <CostView c={line.subtotal} />
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {picker !== null && (
                    <ArmyUnitPicker
                      units={units}
                      civ={civByEn(config.civ) ? config.civ : undefined}
                      onClose={closePicker}
                      onSelect={(u) => {
                        const index = picker;
                        update({
                          ...config,
                          rows:
                            index === config.rows.length
                              ? [...config.rows, { unit: u.id, qty: '1' }]
                              : config.rows.map((r, i) => (i === index ? { ...r, unit: u.id } : r)),
                        });
                        setPicker(null);
                        requestAnimationFrame(() => document.getElementById(`army-qty-${index}`)?.focus());
                      }}
                    />
                  )}
                  <button
                    type="button"
                    className="btn"
                    ref={addRef}
                    disabled={config.rows.length >= 12 || !context}
                    onClick={() => {
                      const index = config.rows.length;
                      setPicker(index);
                    }}
                  >
                    <Icon name="plus" />
                    添加兵种
                  </button>
                  <p className="note">
                    每行 <span className="nw num">1–1000 名</span>，最多 <span className="nw num">12 行</span>。
                    {config.rows.length >= 12 && '已达行数上限，请删除一行后再添加。'}
                  </p>
                  <div className="army-supply-entry">
                    {supplyHref ? (
                      <Link className="community-tool-entry" to={supplyHref}>
                        用这些兵种规划持续生产
                      </Link>
                    ) : (
                      <button className="btn" type="button" disabled>
                        用这些兵种规划持续生产
                      </button>
                    )}
                    <p className="note">
                      {supplyHref ? '带入原兵种和研究记录。生产建筑与座数在下一页设置。' : '请先准备带兵种、有效文明与时代的当前版本账本。'}
                    </p>
                  </div>
                </section>
                <section className="army-card">
                  <div className="army-section-heading">
                    <h2>研究状态</h2>
                    <button className="btn" type="button" ref={editRef} onClick={openEditor}>
                      <Icon name="filter" />
                      编辑研究
                    </button>
                  </div>
                  <div className="army-fields">
                    <div>
                      <h3>已完成</h3>
                      <strong className="num">{config.done.length} 项</strong>
                      <p className="note">你已支付的历史费用，不再计入。</p>
                    </div>
                    <div>
                      <h3>本次目标</h3>
                      <strong className="num">{result?.ledger.filter((e) => e.status === 'planned').length ?? 0} 项</strong>
                      <p className="note">所选强化，加必要升级与前置。</p>
                    </div>
                  </div>
                  <div className="army-tags">
                    {result?.ledger.map((e) => (
                      <span key={e.key}>
                        {e.name} · {STATES[e.status]}
                      </span>
                    ))}
                  </div>
                  <p className="note">可选强化默认不勾选；形态必需由系统补入，并说明原因。</p>
                </section>
              </div>
              <ArmyResultsPanel
                config={config}
                result={result}
                resultRef={resultRef}
                onRemoveResearch={(key) => update({ ...config, done: config.done.filter((k) => k !== key), targets: config.targets.filter((k) => k !== key) })}
              />
            </div>
          )}
        </>
      )}
      <footer className="army-footer">
        <span>
          数据版本：DE Update <span className="num">{ARMY_COST_DATA}</span>
        </span>
        <span>输入是当前方案；分享链接不是旧版价格快照。</span>
      </footer>
    </section>
  );
}
