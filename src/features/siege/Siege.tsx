import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { civs, type Core } from '../../data';
import { useCore, useTrees } from '../../data/hooks';
import {
  calculateSiege,
  decideSiegeCanonical,
  decodeSiege,
  encodeSiege,
  siegeArmorTechs,
  siegeAttackerTechs,
  siegeUnitCounter,
  SIEGE_COMPARE_IDS,
  SIEGE_MANGONEL_IDS,
  SIEGE_MANGONEL_REASON,
  SIEGE_MAX_COUNT,
  SIEGE_STONE_DEFENSE_REASON,
  SIEGE_UNIT_IDS,
  toggleSiegeTech,
  type SiegeConfig,
} from '../../domain/siege';
import type { Trees } from '../../domain/types';
import FeedbackLink, { SiegeFeedbackNote } from '../../shared/ui/FeedbackLink';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { ToolPageHeader } from '../../shared/ui/ToolPageHeader';
import { Loading } from '../../shared/ui/widgets';
import { useShareLink } from '../../shared/ui/useShareLink';
import { siegeCivNote, siegeConditionSummary, siegeTechsEmptyNote, siegeTechsHint } from './siegeDisplay';
import './siege.css';

const num = (n: number) => String(Number(n.toFixed(2)));
// 现实秒按稿保留 1 位小数（75 → 44.1）。
const real = (n: number) => n.toFixed(1);
const buildingIcon = (id: number): IconName => (id === 82 ? 'castle' : id === 79 ? 'tower-control' : 'building-2');
const ONE_REASON = new Set([SIEGE_MANGONEL_REASON, SIEGE_STONE_DEFENSE_REASON]);
const unverifiedBody = (reason: string) => (ONE_REASON.has(reason) ? reason : `${reason} 核实前不显示击数与用时，避免给出错误数字。`);

export default function Siege() {
  const core = useCore();
  const trees = useTrees();
  return core && trees ? (
    <SiegeTool core={core} trees={trees} />
  ) : (
    <section className="pane">
      <Loading />
    </section>
  );
}

function SiegeTool({ core, trees }: { core: Core; trees: Trees }) {
  const location = useLocation();
  const navigate = useNavigate();
  const catalog = useMemo(() => ({ ...core, trees }), [core, trees]);
  const config = useMemo(() => decodeSiege(location.search, catalog), [location.search, catalog]);
  const canonical = '?' + encodeSiege(config);
  // HashRouter 的 replace 导航调用 history.replaceState，保持分享状态且不堆积编辑历史。
  // 读地址栏而不是这次渲染的 location：下一次导航可能已经写进 hash，旧的 replace 不能把它盖回去。
  useEffect(() => {
    if (decideSiegeCanonical(window.location.hash, canonical).kind === 'replace') navigate({ pathname: '/siege', search: canonical }, { replace: true });
  }, [canonical, location.search, navigate]);
  const [garrison, setGarrison] = useState(false);
  const [emptyCount, setEmptyCount] = useState<string | null>(null);
  const share = useShareLink({ stateKey: canonical });
  const u = core.unitById[config.unit]!;
  const b = core.buildingById[config.bldg]!;
  const attackerTechs = useMemo(() => siegeAttackerTechs(u, config.civ, catalog), [u, config.civ, catalog]);
  const result = calculateSiege(u, b, config.n, config.civ, config.armor, config.techs, catalog);
  const armorTechs = siegeArmorTechs(b);
  const counter = siegeUnitCounter(u.id);
  const civNote = siegeCivNote(u, config.civ, attackerTechs, config.techs);
  const techsHint = siegeTechsHint(u, attackerTechs, core.techById);
  const conditions = siegeConditionSummary(u, config.civ, attackerTechs, config.techs, armorTechs, config.armor, core.techById);
  const allTechsSelected = attackerTechs.length > 0 && config.techs.length === attackerTechs.length;
  const title = (
    <>
      <span className="num nw">
        {config.n} {counter}
      </span>
      {u.zh} 拆 {b.zh}
    </>
  );
  const update = (patch: Partial<SiegeConfig>) => {
    setEmptyCount(null);
    const next = decodeSiege('?' + encodeSiege({ ...config, ...patch }), catalog);
    if (next.bldg !== config.bldg) setGarrison(false);
    navigate({ pathname: '/siege', search: '?' + encodeSiege(next) }, { replace: true });
  };
  const changeCount = (value: number) => update({ n: Math.max(1, Math.min(SIEGE_MAX_COUNT, value)) });
  const shareControls = (
    <div className="siege-share">
      {/* 常驻 live region：只播报「已复制」等状态，改输入不重读结果卡。 */}
      <p className="siege-note siege-share-status" {...share.statusProps}>
        {share.status}
      </p>
      {share.manualLink && (
        <label className="siege-field">
          分享链接
          <input readOnly value={share.manualLink} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </div>
  );

  return (
    <section className="pane siege-page" data-testid="siege-page">
      <ToolPageHeader
        title="攻城拆建筑"
        description={
          <>
            几台攻城单位拆掉一座建筑要多久：击数、游戏秒、<span className="num">1.7</span> 倍速度下的现实秒。
          </>
        }
        actions={[
          {
            label: share.copied ? '已复制' : '复制分享链接',
            icon: 'copy',
            onClick: () => void share.copy(window.location.href),
          },
        ]}
      />
      <div className="siege-grid">
        <div className="siege-inputs">
          <section className="siege-panel" aria-labelledby="siege-attacker-title">
            <h2 id="siege-attacker-title">攻方</h2>
            <div className="siege-field">
              <label htmlFor="siege-unit">攻城单位</label>
              <select id="siege-unit" value={config.unit} onChange={(e) => update({ unit: Number(e.target.value) })}>
                {SIEGE_UNIT_IDS.flatMap((id) =>
                  core.unitById[id]
                    ? [
                        <option key={id} value={id}>
                          {core.unitById[id]!.zh}
                        </option>,
                      ]
                    : [],
                )}
              </select>
            </div>
            <div className="siege-field">
              <label htmlFor="siege-count">数量</label>
              <div className="siege-quantity">
                <div className="siege-stepper">
                  <button type="button" aria-label={`减少一${counter}`} disabled={config.n === 1} onClick={() => changeCount(config.n - 1)}>
                    <Icon name="minus" />
                  </button>
                  <input
                    id="siege-count"
                    className="num"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={SIEGE_MAX_COUNT}
                    step={1}
                    value={emptyCount === canonical ? '' : config.n}
                    onChange={(e) => {
                      if (!e.target.value) setEmptyCount(canonical);
                      else update({ n: Number(e.target.value) });
                    }}
                    onBlur={() => setEmptyCount(null)}
                  />
                  <button type="button" aria-label={`增加一${counter}`} disabled={config.n === SIEGE_MAX_COUNT} onClick={() => changeCount(config.n + 1)}>
                    <Icon name="plus" />
                  </button>
                </div>
                <div className="siege-chips" role="group" aria-label="常用数量">
                  {[1, 4, 6].map((n) => (
                    <button type="button" className="num" key={n} aria-pressed={config.n === n} onClick={() => changeCount(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="siege-field">
              <label htmlFor="siege-civ">攻方文明</label>
              <select id="siege-civ" value={config.civ} onChange={(e) => update({ civ: e.target.value })}>
                <option value="">不限文明（无文明加成）</option>
                {civs.map((c) => (
                  <option key={c.en} value={c.en}>
                    {c.zh}
                  </option>
                ))}
              </select>
              <p className="siege-note siege-civ-note">{civNote}</p>
            </div>
            <fieldset className="siege-field siege-techs" data-testid="siege-attacker-techs">
              <legend>攻方攻城科技</legend>
              {attackerTechs.length > 0 ? (
                <>
                  <div className="siege-techs-bar">
                    <button type="button" disabled={allTechsSelected} onClick={() => update({ techs: attackerTechs.map((t) => t.id) })}>
                      攻方满科技
                    </button>
                    <button type="button" disabled={config.techs.length === 0} onClick={() => update({ techs: [] })}>
                      清空
                    </button>
                    <span className="siege-techs-count nw">
                      已选{' '}
                      <span className="num nw">
                        {config.techs.length}/{attackerTechs.length}
                      </span>
                    </span>
                  </div>
                  <div className="siege-toggles">
                    {attackerTechs.map((t) => {
                      const checked = config.techs.includes(t.id);
                      return (
                        <label className={checked ? 'siege-check siege-check-active' : 'siege-check'} key={t.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => update({ techs: toggleSiegeTech(t.id, config.techs, attackerTechs, core.techById) })}
                          />
                          <span>{t.zh}</span>
                          {t.type === 'UniqueTech' && <span className="siege-tech-tag nw">独科</span>}
                        </label>
                      );
                    })}
                  </div>
                  {techsHint && <p className="siege-note siege-techs-hint">{techsHint}</p>}
                </>
              ) : (
                <p className="siege-note siege-techs-empty">{siegeTechsEmptyNote(u, config.civ)}</p>
              )}
            </fieldset>
          </section>
          <section className="siege-panel" aria-labelledby="siege-target-title">
            <h2 id="siege-target-title">目标</h2>
            <div className="siege-field">
              <label htmlFor="siege-building">目标建筑</label>
              <select id="siege-building" value={config.bldg} onChange={(e) => update({ bldg: Number(e.target.value) })}>
                {core.buildings.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.zh}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="siege-field siege-armor">
              <legend>守方建筑护甲科技</legend>
              <div className="siege-toggles">
                {armorTechs.map((t) => {
                  const checked = config.armor.includes(t.id);
                  return (
                    <label className={checked ? 'siege-check siege-check-active' : 'siege-check'} key={t.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => update({ armor: e.target.checked ? [...config.armor, t.id] : config.armor.filter((id) => id !== t.id) })}
                      />
                      {core.techById[t.id]!.zh}
                    </label>
                  );
                })}
              </div>
              {!armorTechs.length && <p className="siege-note">当前建筑没有可核实的砌石、建筑学效果，未提供选项。</p>}
            </fieldset>
            {b.gar > 0 && (
              <div className="siege-field">
                <span className="siege-label">驻军</span>
                <label className={garrison ? 'siege-check siege-check-active' : 'siege-check'}>
                  <input type="checkbox" checked={garrison} onChange={(e) => setGarrison(e.target.checked)} />
                  驻满村民
                </label>
                {garrison && (
                  <p className="siege-note siege-notice">
                    <Icon name="circle-alert" />
                    <span>驻满村民：未计入（暂无可核实数据，用时按未驻军计）</span>
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
        <div className="siege-output">
          {u.id === 331 && (
            <p className="siege-note" data-t="trebuchet-siege">
              按展开态持续攻击；不含打包／展开切换，耗时待确认。
            </p>
          )}
          <div aria-live="polite" aria-atomic="true">
            {result.verified ? (
              <section className="siege-result" data-testid="siege-result" aria-labelledby="siege-result-title">
                <h2 id="siege-result-title">{title}</h2>
                <div className="siege-conds" data-testid="siege-conditions">
                  <span className="siege-cond nw">{conditions.civText}</span>
                  <span className={conditions.techActive ? 'siege-cond siege-cond-active' : 'siege-cond siege-cond-muted'}>
                    {conditions.techActive && <Icon name="flask-conical" />}
                    <span>{conditions.techText}</span>
                  </span>
                  {conditions.armorText && <span className="siege-cond">{conditions.armorText}</span>}
                </div>
                <dl className="siege-metrics">
                  <div>
                    <dt>击数</dt>
                    <dd className="num" data-testid="siege-hits">
                      {result.hits}
                    </dd>
                  </div>
                  <div className="siege-primary">
                    <dt>游戏秒</dt>
                    <dd className="num" data-testid="siege-game-seconds">
                      {num(result.gameSeconds)}
                    </dd>
                  </div>
                  <div>
                    <dt>现实秒</dt>
                    <dd className="num" data-testid="siege-real-seconds">
                      {real(result.realSeconds)}
                    </dd>
                  </div>
                </dl>
                <div className="siege-result-foot">
                  <span>
                    现实秒 = 游戏秒 ÷ <span className="num">1.7</span>（标准速度）
                  </span>
                  <span className="siege-data">
                    <Icon name="database" />
                    <span className="num">DE {__DATA_SOURCES__.patch.build}</span>
                  </span>
                </div>
              </section>
            ) : (
              <section className="siege-unverified" data-testid="siege-unverified" role="status" aria-labelledby="siege-unverified-why">
                <h2 id="siege-unverified-why">
                  <Icon name="circle-alert" />
                  {SIEGE_MANGONEL_IDS.includes(u.id) ? '规则未核实' : '数据未核实'}，暂不计算
                </h2>
                <p data-testid="siege-unverified-reason">{unverifiedBody(result.reason)}</p>
                <div className="siege-gap-feedback">
                  <FeedbackLink kind="data" label="反馈数据缺口" />
                  <SiegeFeedbackNote />
                </div>
              </section>
            )}
          </div>
          {shareControls}
          {result.verified && (
            <section className="siege-panel siege-compare" data-testid="siege-compare">
              <table aria-label={`同组合对照：${config.n} ${counter}${u.zh}`}>
                <caption>
                  <span className="siege-compare-title">
                    同组合对照 ·{' '}
                    <span className="num nw">
                      {config.n} {counter}
                    </span>
                    {u.zh}
                  </span>
                  <span className="siege-compare-cond" data-testid="siege-compare-conditions">
                    {conditions.compareLine}
                  </span>
                </caption>
                <thead>
                  <tr>
                    <th scope="col">建筑</th>
                    <th scope="col">击数</th>
                    <th scope="col">游戏秒</th>
                    <th scope="col">现实秒</th>
                  </tr>
                </thead>
                <tbody>
                  {SIEGE_COMPARE_IDS.map((id) => {
                    const target = core.buildingById[id]!;
                    const row = calculateSiege(u, target, config.n, config.civ, config.armor, config.techs, catalog);
                    return (
                      <tr key={id} aria-current={config.bldg === id ? 'true' : undefined}>
                        <th scope="row">
                          <button type="button" onClick={() => update({ bldg: id })}>
                            <Icon name={buildingIcon(id)} />
                            <span className="nw">{target.zh}</span>
                          </button>
                        </th>
                        {row.verified ? (
                          <>
                            <td className="num">{row.hits}</td>
                            <td className="num">{num(row.gameSeconds)}</td>
                            <td className="num">{real(row.realSeconds)}</td>
                          </>
                        ) : (
                          <td colSpan={3} className="siege-note">
                            暂不计算 · 数据待补
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="siege-note">点一行设为目标建筑；当前目标高亮。</p>
            </section>
          )}
          <aside className="siege-model">
            <Icon name="info" />
            <span>模型口径：理想射击间隔，首轮 t=0；不含走位、展开、前摇、飞行、修理、反击。</span>
          </aside>
        </div>
      </div>
    </section>
  );
}
