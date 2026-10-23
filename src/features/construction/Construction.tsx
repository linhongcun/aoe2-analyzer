import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civs } from '../../data';
import { useCore, useTrees } from '../../data/hooks';
import { AGE_ZH } from '../../domain/ratings';
import { Loading } from '../../shared/ui/widgets';
import { CalcDock } from '../../shared/ui/CalcDock';
import { GameClockLink } from '../../shared/ui/GameClockLink';
import {
  calculateConstruction,
  constructionBuildings,
  constructionTechs,
  decodeConstruction,
  encodeConstruction,
  toggleConstructionTech,
  CONSTRUCTION_TASKS,
  DEFAULT_CONSTRUCTION,
  type ConstructionConfig,
  type ConstructionTask,
} from '../../domain/construction';
import './construction.css';

const num = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
export default function Construction() {
  const core = useCore(),
    trees = useTrees(),
    loc = useLocation(),
    nav = useNavigate();
  const decoded = useMemo(() => decodeConstruction(loc.search, core && trees ? { core, trees } : undefined), [loc.search, core, trees]);
  const [draft, setDraft] = useState<{ search: string; config: ConstructionConfig } | null>(null);
  const [status, setStatus] = useState(''),
    [manual, setManual] = useState('');
  if (!core || !trees)
    return (
      <section className="pane">
        <Loading />
      </section>
    );
  const ctx = { core, trees },
    config = draft?.search === loc.search ? draft.config : decoded.config,
    result = calculateConstruction(ctx, config);
  const errors = [...decoded.errors, ...result.errors],
    locked = decoded.errors.length > 0;
  const update = (next: ConstructionConfig) => {
    if (locked) return;
    const search = '?' + encodeConstruction(next);
    if (decodeConstruction(search, ctx).errors.length) setDraft({ search: loc.search, config: next });
    else {
      setDraft(null);
      nav({ pathname: '/construction', search }, { replace: true });
    }
    setStatus('');
    setManual('');
  };
  const reset = () => {
    setDraft(null);
    nav({ pathname: '/construction', search: '?' + encodeConstruction({ ...DEFAULT_CONSTRUCTION, techs: [] }) }, { replace: true });
    setStatus('');
    setManual('');
  };
  const share = async () => {
    const url = new URL(window.location.href);
    url.hash = '/construction?' + encodeConstruction(config);
    try {
      await navigator.clipboard.writeText(url.href);
      setStatus('链接已复制，包含当前全部设置。');
      setManual('');
    } catch {
      setStatus('自动复制失败，请手动复制下方链接。');
      setManual(url.href);
    }
  };
  const available = constructionTechs(ctx, config),
    buildings = constructionBuildings(ctx, config);
  const changeScope = (civ: string, age: number) => {
    const next = { ...config, civ, age, techs: [] };
    const list = constructionBuildings(ctx, next);
    if (!list.some((b) => b.id === next.buildingId)) next.buildingId = list[0]?.id ?? 70;
    update(next);
  };
  return (
    <section className="pane construction-page" data-testid="construction-page">
      <header className="construction-heading">
        <div>
          <h1>多人施工</h1>
          <p className="note">比较提前完工的时间与村民工时。时间均为游戏时间。</p>
        </div>
      </header>
      <CalcDock
        note={status}
        resultId="construction-result-title"
        actions={[
          { label: '复制方案链接', icon: 'copy', disabled: errors.length > 0, onClick: () => void share() },
          { label: '重置为默认方案', onClick: reset },
        ]}
      />
      {manual && (
        <label className="construction-manual">
          方案链接
          <input readOnly value={manual} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      {locked && (
        <div className="construction-errors" role="alert">
          <p>方案链接损坏，已暂停计算与编辑。请显式重置。</p>
          <ul>
            {decoded.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="construction-grid">
        <section className="construction-panel" aria-labelledby="construction-config-title">
          <h2 id="construction-config-title">施工配置</h2>
          <fieldset disabled={locked}>
            <div className="construction-settings">
              <label>
                文明
                <select aria-label="施工文明" value={config.civ} onChange={(e) => changeScope(e.target.value, config.age)}>
                  {civs.map((c) => (
                    <option key={c.en} value={c.en}>
                      {c.zh}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                时代
                <select aria-label="施工时代" value={config.age} onChange={(e) => changeScope(config.civ, Number(e.target.value))}>
                  {[1, 2, 3, 4].map((a) => (
                    <option key={a} value={a}>
                      {AGE_ZH[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="construction-wide">
                建筑
                <select aria-label="施工建筑" value={config.buildingId} onChange={(e) => update({ ...config, buildingId: Number(e.target.value) })}>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.zh}
                      {b.id === 199 ? '（非村民施工）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                施工人数
                <input aria-label="施工人数" inputMode="numeric" value={config.builders} onChange={(e) => update({ ...config, builders: e.target.value })} />
              </label>
              <label>
                基准人数
                <input aria-label="基准人数" inputMode="numeric" value={config.baseline} onChange={(e) => update({ ...config, baseline: e.target.value })} />
              </label>
            </div>
            <label className="construction-check">
              <input type="checkbox" checked={config.hasTownCenter} onChange={(e) => update({ ...config, hasTownCenter: e.target.checked })} />
              已完成过首座城镇中心
            </label>
            <p className="note">关闭表示尚未建成首座城镇中心。此条件也影响西西里的城堡与防御工事；起始城镇中心目前仅支持黑暗时代。</p>
            <h3>已研究科技</h3>
            <p className="note">
              默认未研究；免费与前置科技自动联动。切换文明或时代会重置所选科技。保留从建筑模拟器带入的合法科技，没有施工效果的项目不改变工期。
            </p>
            <div className="construction-techs">
              {available.map((t) => (
                <label className="construction-check" key={t.id}>
                  <input
                    type="checkbox"
                    checked={result.selected.has(t.id)}
                    disabled={result.free.has(t.id)}
                    onChange={() => update({ ...config, techs: toggleConstructionTech(ctx, config, t.id) })}
                  />
                  {t.zh}
                  {result.free.has(t.id) ? '（免费生效）' : ''}
                </label>
              ))}
            </div>
            {!available.length && <p className="note">当前条件没有可选择的施工科技。</p>}
          </fieldset>
        </section>
        <section className="construction-panel construction-summary" aria-labelledby="construction-result-title">
          <h2 id="construction-result-title" className="calc-dock-target" tabIndex={-1}>
            完工与工时
          </h2>
          {errors.length > 0 ? (
            <div className="construction-errors" role="alert">
              <p>当前方案无法计算，请修正以下项目：</p>
              <ul>
                {[...new Set(errors)].map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <button type="button" className="btn" onClick={reset}>
                重置为默认方案
              </button>
            </div>
          ) : (
            result.target &&
            result.baseline && (
              <>
                <dl className="construction-stats">
                  <div>
                    <dt>理论完工时间</dt>
                    <dd data-testid="construction-seconds">{num(result.target.seconds)} 秒</dd>
                  </div>
                  <div>
                    <dt>{result.target.saved < 0 ? '较基准晚完工' : '较基准提前完工'}</dt>
                    <dd data-testid="construction-saved">{num(Math.abs(result.target.saved))} 秒</dd>
                  </div>
                  <div>
                    <dt>总村民工时</dt>
                    <dd data-testid="construction-work">{num(result.target.villagerSeconds)} 村民秒</dd>
                  </div>
                  <div>
                    <dt>基准完工时间</dt>
                    <dd>{num(result.baseline.seconds)} 秒</dd>
                  </div>
                </dl>
                <GameClockLink seconds={result.target.seconds} label="换算这段施工时间" />
                <p>村民工时是全部施工者的占用时间之和；增加人数通常能提前完工，也会增加总工时。</p>
                <p>
                  再增加 <span className="construction-number">1 人</span>：
                  {result.target.marginalSeconds === null ? (
                    '已达本工具人数上限。'
                  ) : (
                    <>
                      提前 <span className="construction-number">{num(result.target.marginalSeconds)} 秒</span>，增加{' '}
                      <span className="construction-number">{num(result.target.marginalVillagerSeconds!)} 村民秒</span>。
                    </>
                  )}
                </p>
                {result.target.forgone !== null && (
                  <div className="construction-loss">
                    <h3>原任务停采估算</h3>
                    <p>
                      该方案总少采<span className="construction-number"> {num(result.target.forgone)} </span>
                      {CONSTRUCTION_TASKS[config.task as Exclude<ConstructionTask, ''>]}。
                    </p>
                    <p>
                      比基准{result.target.extraForgone! < 0 ? '少' : '多'}占用的采集量：
                      <span className="construction-number">{num(Math.abs(result.target.extraForgone!))}</span>。这是工时差，不是提前完工收益。
                    </p>
                  </div>
                )}
              </>
            )
          )}
          <p className="construction-limit">理论同时施工：所有普通村民已到场。不计步行、阻挡、分批到达、战斗或维修；没有在游戏里实测。</p>
        </section>
      </div>
      <section className="construction-panel" aria-labelledby="construction-gather-title">
        <h2 id="construction-gather-title">可选：原采集任务</h2>
        <p className="note">同一批村民原本执行相同任务。仅在显式选择后输出该资源的停采量；经济科技使用上方已研究状态。</p>
        <fieldset disabled={locked}>
          <div className="construction-settings">
            <label>
              原任务
              <select aria-label="原采集任务" value={config.task} onChange={(e) => update({ ...config, task: e.target.value as ConstructionTask })}>
                <option value="">不估算资源，只看村民工时</option>
                {Object.entries(CONSTRUCTION_TASKS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              木金石单程距离
              <input
                aria-label="施工停采木金石单程距离"
                inputMode="decimal"
                value={config.walk}
                onChange={(e) => update({ ...config, walk: e.target.value })}
              />
            </label>
            <label>
              农田单程距离
              <input aria-label="施工停采农田单程距离" inputMode="decimal" value={config.farm} onChange={(e) => update({ ...config, farm: e.target.value })} />
            </label>
          </div>
        </fieldset>
        {result.gather && (
          <p className="note">
            采用本站有效采集模型，距离单位为格；
            {result.gather.applied.length ? result.gather.applied.map((x) => x.label).join('；') : '未叠加已支持的文明采集加成'}。
          </p>
        )}
      </section>
      {!errors.length && (
        <section className="construction-panel" aria-labelledby="construction-table-title">
          <h2 id="construction-table-title">人数对照</h2>
          <div className="construction-comparison">
            {result.rows.map((row) => (
              <article key={row.builders} className={row.builders === Number(config.builders) ? 'construction-current' : ''}>
                <h3>{row.builders} 人</h3>
                <dl>
                  <div>
                    <dt>完工时间</dt>
                    <dd>{num(row.seconds)} 秒</dd>
                  </div>
                  <div>
                    <dt>总村民工时</dt>
                    <dd>{num(row.villagerSeconds)} 村民秒</dd>
                  </div>
                  <div>
                    <dt>较基准{row.saved < 0 ? '晚' : '早'}</dt>
                    <dd>{num(Math.abs(row.saved))} 秒</dd>
                  </div>
                  {row.forgone !== null && (
                    <div>
                      <dt>总停采量</dt>
                      <dd>{num(row.forgone)}</dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="construction-panel">
        <h2>来源与支持范围</h2>
        <p>
          数据固定为 DE185872。当前目录 <span className="construction-number">38 类</span>建筑中，<span className="construction-number">37 类</span>
          可由村民建造；渔栅由渔船建造，暂停计算。文明、时代、升级前置与特殊条件仍需逐项满足。特殊建造者与盟友施工加成暂不计算。
        </p>
        {result.applied.length > 0 && (
          <>
            <h3>当前生效来源</h3>
            <ul>
              {result.applied.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </>
        )}
        {result.form !== null && (
          <p className="note">
            计入科技与文明效果后，单个村民建造需 {num(result.baseTime!)} 秒，建造者工作速率 {num(result.builderRate!)}。
          </p>
        )}
        <ul className="construction-warnings">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <p className="note">理论多人工期 = 单人工期 × 3 ÷（人数 + 2）；总村民秒 = 人数 × 完工秒数；停采量 = 总村民秒 × 所选原任务的有效采集速率。</p>
        <p>
          <a href="https://github.com/linhongcun/aoe2-analyzer/blob/main/docs/CONSTRUCTION-MODEL.md" target="_blank" rel="noreferrer">
            施工数据说明
          </a>{' '}
          ·{' '}
          <a href="https://github.com/SFTtech/openage/blob/master/doc/reverse_engineering/game_mechanics/build_speed.md" target="_blank" rel="noreferrer">
            公开多人施工规则
          </a>{' '}
          · <Link to={`/building/${config.buildingId}`}>返回建筑详情</Link>
        </p>
      </section>
    </section>
  );
}
