import { useEffect, useMemo, useState } from 'react';
import { civByEn, loadCore, loadTrees } from '../../../data';
import {
  DEFAULT_FLANK_SCENE,
  DEFAULT_SCENE,
  SCENARIO_CIVS,
  scenarioRows,
  scenarioVersion,
  type SceneConfig,
  type SceneContext,
  type SceneRow,
} from '../../../domain/positionScenarios';
import { pickCiv, type StartState } from '../../../domain/startGame';
import { CivRow, type Update } from './startGameEarly';

const number = (n: number) => Number(n.toFixed(3)).toString();
function Value({ n, unit = '' }: { n: number; unit?: string }) {
  return (
    <span className="num nw">
      {number(n)}
      {unit}
    </span>
  );
}
export default function ScenarioSuggestions({ state, onChange }: { state: StartState; onChange: Update }) {
  const lane = state.choice.lane!;
  const [cfg, setCfg] = useState<SceneConfig>(() => ({ ...(lane === 'flank' ? DEFAULT_FLANK_SCENE : DEFAULT_SCENE) }));
  const [context, setContext] = useState<SceneContext | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all([loadCore(), loadTrees()])
      .then(([core, trees]) => {
        if (live) setContext({ core, trees });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  const rows = useMemo(() => (context ? scenarioRows(context, lane, cfg) : []), [context, lane, cfg]);
  const update = <K extends keyof SceneConfig>(key: K, value: SceneConfig[K]) => setCfg((c) => ({ ...c, [key]: value }));
  const version = scenarioVersion();
  const selectedOutside = state.choice.civ && !SCENARIO_CIVS[lane].includes(state.choice.civ);
  return (
    <section className="start-scenes" data-testid="scenario-suggestions" aria-labelledby="scene-heading">
      <h2 id="scene-heading">城堡时代场景建议</h2>
      <p className="start-hint">
        阿拉伯 <span className="num nw">4v4</span> · {lane === 'flank' ? '边路弩手' : '中路骑士'}。仅比较本场景指标，不是整局强度榜，也不覆盖全部文明。
      </p>
      <p className="start-hint">已升城堡，建筑和人口就绪，资源预付、科技已完成。军事投入预算不等于同一游戏分钟。</p>
      {selectedOutside ? <p role="status">已选{civByEn(state.choice.civ!)?.zh}保留；该文明的此路线机制待核验，不能据此判为弱。</p> : null}
      <details className="start-scene-details">
        <summary>调整场景与投入</summary>
        <p className="start-hint">以下是可调整假设，不是阿拉伯地图距离统计。返回此步后恢复默认场景。</p>
        <div className="start-scene-controls">
          <label>
            军事投入（标准采集工秒）
            <select aria-label="军事投入" value={cfg.budget} onChange={(e) => update('budget', +e.target.value)}>
              {[0, 2000, 12000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            {lane === 'flank' ? '接战初距（格）' : '支援距离（格）'}
            <select aria-label="场景距离" value={cfg.distance} onChange={(e) => update('distance', +e.target.value)}>
              {(lane === 'flank' ? [2, 12] : [10, 30, 60]).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {lane === 'flank' ? (
            <>
              <label>
                反应延迟（秒）
                <select aria-label="反应延迟" value={cfg.reaction} onChange={(e) => update('reaction', +e.target.value)}>
                  {[0, 0.5, 1.25].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                纯后撤空间（格）
                <select aria-label="后撤空间" value={cfg.room} onChange={(e) => update('room', +e.target.value)}>
                  {[0, 4, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                部队状态
                <select aria-label="部队状态" value={cfg.mode} onChange={(e) => update('mode', e.target.value as SceneConfig['mode'])}>
                  <option value="new">新训练 · 一座空闲马厩</option>
                  <option value="ready">已准备好 · 最多6兵</option>
                </select>
              </label>
              <label>
                支援期限（秒）
                <select aria-label="支援期限" value={cfg.deadline} onChange={(e) => update('deadline', +e.target.value)}>
                  {[60, 120, 1200].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                畜牧状态
                <select aria-label="畜牧状态" value={String(cfg.husbandry)} onChange={(e) => update('husbandry', e.target.value === 'true')}>
                  <option value="true">已研究 · 计入费用</option>
                  <option value="false">未研究</option>
                </select>
              </label>
            </>
          )}
        </div>
      </details>
      <p className="start-hint">
        投入 <span className="num nw">{cfg.budget} 工秒</span> · 距离 <Value n={cfg.distance} unit=" 格" /> ·{' '}
        {lane === 'flank' ? (
          <>
            反应 <Value n={cfg.reaction} unit=" 秒" />
            ；目标为同科技包的参考弩手。
          </>
        ) : (
          <>
            {cfg.mode === 'new' ? '新训练部队' : '现成部队'}，期限 <Value n={cfg.deadline} unit=" 秒" />
            （含截止时刻）。
          </>
        )}
      </p>
      <p className="start-hint">
        {lane === 'flank'
          ? '优先组比较可负担人数与每兵先手机会；未比较生命、伤害和完整战力。零前摇机会不是实际发射，命中与伤害未知。纯后撤不射击，不计入优先分组。'
          : '优先组比较期限前人数与首兵到达；未比较生命和作战强度。两种部队状态分别使用预算，不重复花费；新兵必须完成首个训练周期。'}
      </p>
      {failed ? (
        <p role="alert">
          场景数据加载失败。仍可搜索文明。
          <button
            type="button"
            className="start-btn"
            onClick={() => {
              setFailed(false);
              retry((n) => n + 1);
            }}
          >
            重试场景
          </button>
        </p>
      ) : !context ? (
        <p role="status">正在计算场景建议…</p>
      ) : (
        <>
          {!rows.some((r) => r.preferred) ? <p role="status">当前预算或期限没有可优先建议的部队。</p> : null}
          {rows.map((row) => (
            <article className="start-scene-card" key={row.civ} data-testid={`scene-${row.civ}`}>
              <p className="start-k">{row.preferred ? '本场景指标优先' : row.status === 'ok' ? '其它候选 · 可比较侧重' : row.reason}</p>
              <CivRow en={row.civ} pressed={state.choice.civ === row.civ} onPick={() => onChange((c) => pickCiv(c, row.civ))} />
              <SceneEvidence row={row} lane={lane} />
            </article>
          ))}
        </>
      )}
      <details className="start-scene-details">
        <summary>范围、科技包与来源</summary>
        <p className="start-hint">首批核验：{SCENARIO_CIVS[lane].map((c) => civByEn(c)?.zh ?? c).join('、')}。名单是机制覆盖范围，不是强势文明白名单。</p>
        <p className="start-hint">
          {lane === 'flank' ? '共同包：弩手升级、箭羽、锥子箭、弓兵鳞甲；不自动购买指环。' : '共同包：锻造、骑兵鳞甲；畜牧按所选状态。'}{' '}
          科技费用先扣；研究时间未放入真实对局时间线。合法包缺项则不比较，未搜索最优科技投资。
        </p>
        <p className="start-hint">经济、队友、敌军伤亡、寻路、碰撞、弹道和操作收益未计入。只适用于城堡时代这条路线，封建衔接、帝王上限与特殊路线待验证。</p>
        <p className="start-hint">
          模型 {version.model} · 配置 {version.config}。输入摘要随各候选显示；新效果结构需重新核验。
        </p>
        {version.sources.map((source) => (
          <p className="start-hint" key={source.id}>
            {source.patch} · {source.repo} · {source.commit.slice(0, 8)}
          </p>
        ))}
      </details>
    </section>
  );
}
function SceneEvidence({ row, lane }: { row: SceneRow; lane: 'flank' | 'pocket' }) {
  if (!row.stats) return <p className="start-hint">{row.reason}；仍可自主选择，不参与当前比较。</p>;
  return (
    <>
      <p className="start-hint">
        预算可负担 <span className="num nw">{row.count} 兵</span> · 科技及升级 <Value n={row.fixedSeconds!} unit=" 工秒" /> · 每兵{' '}
        <Value n={row.unitSeconds!} unit=" 工秒" />
      </p>
      {lane === 'flank' && row.opening ? (
        <p className="start-hint">
          先手窗口 <Value n={row.opening.window} unit=" 秒" />
          ；每兵 <span className="num nw">{row.opening.opportunities} 次</span>条件机会。
          {row.opening.opportunities === 0 ? '本条件下没有先手发射机会。' : '贴身接战或反应较慢可能失去优势。'}{' '}
          另一个纯后撤情景从自身射程起步（非上方初距），至目标进入射程约 {row.retreat == null ? '未知' : <Value n={row.retreat} unit=" 秒" />}
          ，不代表无伤输出。
        </p>
      ) : null}
      {lane === 'pocket' && row.support ? (
        <p className="start-hint">
          行军 <Value n={row.support.travel} unit=" 秒" /> · 首兵 {row.support.first == null ? '无可负担部队' : <Value n={row.support.first} unit=" 秒" />} ·
          期限前 <span className="num nw">{row.support.count} 兵</span>。更快训练未必在每个期限多一兵，长期受预算限制。
        </p>
      ) : null}
      <details className="start-scene-details">
        <summary>查看计算输入</summary>
        <p className="start-hint">
          生命 <Value n={row.stats.hp} /> · 攻击 <Value n={row.stats.atk} /> · 射程 <Value n={row.stats.rng} /> · 速度 <Value n={row.stats.spd} /> · 攻击周期{' '}
          <Value n={row.stats.rof} unit=" 秒" /> · 训练周期 <Value n={row.cycle!} unit=" 秒" />
          。这些属性不额外加分。
        </p>
        <p className="start-hint">
          单位费用：
          {Object.entries(row.cost!).map(([k, v]) => (
            <span className="num nw" key={k}>
              {({ Food: '食', Wood: '木', Gold: '金', Stone: '石' } as Record<string, string>)[k]} {v}{' '}
            </span>
          ))}
          。科技耗时（均假定已完成）：
          {row.technologies?.map((t) => (
            <span className="nw" key={t.id}>
              {t.name} <span className="num">{t.seconds} 秒</span>；
            </span>
          ))}
          。
        </p>
        <p className="start-hint">输入摘要 {row.signature}</p>
      </details>
    </>
  );
}
