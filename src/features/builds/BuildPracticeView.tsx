import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { buildOrders } from '../../data/buildOrders';
import { civByEn } from '../../data';
import { useCore } from '../../data/hooks';
import { HOUSE, type BuildOrder } from '../../domain/buildOrder';
import type { BuildTimeline } from '../../domain/buildSim';
import { practiceAction, practiceProgress, practiceSteps, type PracticeNames, type PracticeStep } from '../../domain/buildPractice';
import { simSupport } from '../../domain/simSupport';
import { CivPicker } from '../../shared/ui/CivPicker';
import { Icon } from '../../shared/ui/Icon';
import { mmss, noteParts, rowTime, type TimelineQuery } from './timelineModel';
import { GameClockLink } from '../../shared/ui/GameClockLink';
import { visibleSources } from './sources';
import { NumUnitText } from './NumUnitText';
import './practice.css';

export function buildPracticeUrl(params: URLSearchParams, view: 'practice' | 'print' | null): string {
  const next = new URLSearchParams(params);
  if (view) next.set('view', view);
  else next.delete('view');
  return `/builds?${next.toString()}`;
}

function StepContent({ item, timeline, name }: { item: PracticeStep; timeline: BuildTimeline; name: PracticeNames }) {
  const { step, simulation } = item;
  const noNeed = `${civByEn(timeline.civ)?.zh ?? timeline.civ}不需要`;
  return (
    <>
      <div className="bp-step-meta">
        <span className="nw">步骤村民 {step.vils} 人</span>
        <span className="nw">估算时点约 {mmss(rowTime(simulation))}</span>
        <span className="nw">
          开始人口 {simulation.pop.used}/{simulation.pop.cap}
        </span>
      </div>
      {step.note && (
        <p className="bp-instruction">
          {noteParts(step.note, step.houseText, timeline.noHouses).map((part, i) =>
            part.skip ? (
              <span key={i}>
                <s>
                  <NumUnitText text={part.text} />
                </s>
                <small>（{noNeed}）</small>
              </span>
            ) : (
              <span key={i}>
                <NumUnitText text={part.text} />
              </span>
            ),
          )}
        </p>
      )}
      {step.siteAdded && <p className="bp-added">本站补充，来源未列</p>}
      {step.actions.length > 0 && (
        <ul className="bp-actions" aria-label="全部动作">
          {step.actions.map((action, i) => {
            const skip = timeline.noHouses && action.type === 'build' && action.building === HOUSE;
            const text = practiceAction(action, name);
            return (
              <li key={i} data-testid="practice-action">
                {skip ? (
                  <>
                    <s>
                      <NumUnitText text={text} />
                    </s>
                    （跳过，{noNeed}）
                  </>
                ) : (
                  <NumUnitText text={text} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {step.split && (
        <div className="bp-allocation">
          <span>开局分配检查点</span>
          {(['food', 'wood', 'gold', 'stone', 'build'] as const)
            .filter((resource) => step.split![resource] !== undefined)
            .map((resource) => (
              <span className="nw" key={resource}>
                {{ food: '食', wood: '木', gold: '金', stone: '石', build: '建造' }[resource]} {step.split![resource]} 人
              </span>
            ))}
        </div>
      )}
      <div className="bp-allocation">
        <span>模拟开始分配</span>
        {(['food', 'wood', 'gold', 'stone', 'build', 'idle'] as const).map((resource, i) => (
          <span className="nw" key={resource}>
            {['食', '木', '金', '石', '建造', '空闲'][i]} {simulation.villagers[resource]} 人
          </span>
        ))}
      </div>
      {simulation.anomalies.length > 0 && (
        <ul className="bp-anomalies" aria-label="模拟等待与限制">
          {simulation.anomalies.map((anomaly, i) => (
            <li key={i}>{anomaly.reasonZh}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function BuildPracticeView({
  order,
  timeline,
  query,
  params,
  mode,
  onChange,
  civNotes,
}: {
  order: BuildOrder;
  timeline: BuildTimeline;
  query: TimelineQuery;
  params: URLSearchParams;
  mode: 'practice' | 'print';
  onChange: (values: Record<string, string | null>) => void;
  civNotes: string[];
}) {
  const core = useCore();
  const rows = useMemo(() => practiceSteps(order, timeline), [order, timeline]);
  const [completed, setCompleted] = useState(0);
  const zone = useRef<HTMLDivElement>(null);
  const currentCard = useRef<HTMLElement>(null);
  const previousCompleted = useRef(0);
  const done = completed === rows.length;
  const current = rows[Math.min(completed, rows.length - 1)]!;
  const next = done ? undefined : rows[completed + 1];
  const selectedCiv = query.civ ? (civByEn(query.civ)?.zh ?? query.civ) : '通用';
  const unsupported = !!query.civ && !simSupport(query.civ);
  const move = (command: 'next' | 'previous' | 'reset') => setCompleted((count) => practiceProgress(count, rows.length, command));
  const name: PracticeNames = (kind, id) =>
    (kind === 'unit' ? core?.unitById[id] : kind === 'tech' ? core?.techById[id] : core?.buildingById[id])?.zh ??
    `${{ unit: '单位', tech: '科技', building: '建筑' }[kind]} ${id}`;
  useEffect(() => {
    if (mode === 'practice') zone.current?.focus({ preventScroll: true });
  }, [mode]);
  useEffect(() => {
    if (previousCompleted.current === completed) return;
    previousCompleted.current = completed;
    if (mode !== 'practice') return;
    // 手机按钮在两张卡片之后；推进后把真正的当前步骤带回视野。
    currentCard.current?.scrollIntoView({ block: 'start' });
    zone.current?.focus({ preventScroll: true });
  }, [completed, mode]);
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
    if (
      (event.target as HTMLElement).closest(
        'input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="combobox"], [role="listbox"], [role="menu"]',
      )
    )
      return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowRight' ? 'next' : 'previous');
  };
  const sources = visibleSources(order.sources);

  return (
    <section className="pane bo-practice" data-testid="build-practice" data-mode={mode}>
      <header className="bp-screen-only bp-header">
        <div>
          <p className="bp-eyebrow">{mode === 'practice' ? '专注跟练' : '完整步骤单'}</p>
          <h1>{order.name.zh}</h1>
          <p className="note">{mode === 'practice' ? '按自己的节奏，手动跟完每一步。' : '核对全部步骤后，可用浏览器打印或保存为 PDF。'}</p>
        </div>
        <nav className="bp-toolbar" aria-label="跟练视图">
          <Link className="bp-button" to={buildPracticeUrl(params, null)}>
            <Icon name="arrow-left" />
            返回时间线
          </Link>
          <Link className="bp-button" to={buildPracticeUrl(params, mode === 'practice' ? 'print' : 'practice')}>
            {mode === 'practice' ? '查看完整清单' : '专注跟练'}
          </Link>
          <button className="bp-button" type="button" onClick={() => window.print()}>
            <Icon name="printer" />
            打印 / 保存 PDF
          </button>
        </nav>
      </header>
      <div className="bp-settings bp-screen-only" role="group" aria-label="跟练配置">
        <label>
          开局
          <select aria-label="跟练开局" value={order.id} onChange={(event) => onChange({ bo: event.target.value })}>
            {buildOrders.map((build) => (
              <option key={build.id} value={build.id}>
                {build.name.zh}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span>文明</span>
          <CivPicker
            id="practice-civ"
            label="跟练文明"
            none="通用"
            value={query.civ}
            onChange={(civ) => onChange({ civ: civ || null })}
            isEnabled={simSupport}
            disabledGroup="暂不支持 · 文明加成尚未计入"
            disabledNote="文明加成尚未计入"
          />
        </div>
        <p className="note">
          切换开局、文明或参数后重新开始；刷新不保存进度。<Link to={buildPracticeUrl(params, null)}>调整模拟参数</Link>
        </p>
      </div>
      <div className="bp-context">
        <p data-testid="practice-parameters">
          <b>{selectedCiv}</b> · <span className="nw">走路距离 {query.dist} 格</span> · 自动造房{query.house ? '开启' : '关闭'}
          {timeline.noHouses && '（不需要房子，不执行）'} · 团队加成未计入
        </p>
        <p className="note">
          地图：{order.map}。推荐文明：{order.civs.length ? order.civs.map((civ) => civByEn(civ)?.zh ?? civ).join('、') : '通用'}。
        </p>
        {unsupported && (
          <p className="bp-warning" role="status" data-testid="practice-civ-warning">
            链接里的{selectedCiv}加成尚未计入，已按通用计算。以下数字不是该文明的完整估算。
          </p>
        )}
        {query.variant && <p className="note">链接的{query.variant === 'aggr' ? '激进' : '保守'}变体尚无独立步骤数据，当前仍按本开局的相同步骤估算。</p>}
        {civNotes.length > 0 && (
          <ul className="note">
            {civNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}
        <p className="note">时间均为模拟估算，不是倒计时或游戏监测。步骤村民数来自开局标记；人口与分配为模拟步骤开始快照，研究类估算时点可能晚于该快照。</p>
        <nav className="bar bp-screen-only" aria-label="跟练辅助资料">
          <GameClockLink seconds={rowTime(current.simulation)} label="换算当前步骤时点" />
          <Link className="community-tool-entry" to="/hotkeys">
            查游戏操作与个人按键表
          </Link>
        </nav>
      </div>

      {mode === 'practice' && (
        <div className="bp-screen-only bp-zone" ref={zone} tabIndex={0} role="region" aria-label="手动跟练区域" onKeyDown={keyboard}>
          <div className="bp-progress">
            <p role="status" aria-live="polite" data-testid="practice-progress">
              {done ? '本轮跟练已完成' : `当前第 ${completed + 1} / ${rows.length} 步`}
              <span>
                已手动跟完 {completed} / {rows.length} 步
              </span>
            </p>
            <progress value={completed} max={rows.length} aria-label="已手动跟完的步骤" />
          </div>
          <div className="bp-cards">
            <article className="bp-current" ref={currentCard} data-testid="practice-current">
              <h2>
                {done ? '最后一步回顾' : '当前步骤'}
                <span className="nw">第 {current.index + 1} 步</span>
              </h2>
              <StepContent item={current} timeline={timeline} name={name} />
            </article>
            <article className="bp-next" data-testid="practice-next">
              <h2>
                {done ? '本轮完成' : '接下来'}
                {next && <span className="nw">第 {next.index + 1} 步</span>}
              </h2>
              {next ? (
                <StepContent item={next} timeline={timeline} name={name} />
              ) : (
                <p>
                  {done ? '你已手动跟完全部步骤。可以回顾、打印清单，或重新开始练习。进度不代表游戏已经完成这些动作。' : '这是最后一步，完成后确认本轮结束。'}
                </p>
              )}
            </article>
          </div>
          <div className="bp-controls">
            <button className="bp-button" type="button" disabled={completed === 0} onClick={() => move('previous')}>
              <Icon name="arrow-left" />
              上一步
            </button>
            <button className="bp-button bp-primary" type="button" disabled={done} onClick={() => move('next')}>
              <Icon name={done ? 'check' : 'arrow-right'} />
              {done ? '已跟完全部步骤' : completed === rows.length - 1 ? '完成最后一步' : '完成这一步，继续'}
            </button>
            <button className="bp-button" type="button" disabled={completed === 0} onClick={() => move('reset')}>
              <Icon name="rotate-ccw" />
              重新开始
            </button>
          </div>
          <p className="note">在跟练区域使用左右方向键后退 / 前进。快捷键仅在此网页获得焦点时生效；不会自动推进或读取游戏状态。</p>
        </div>
      )}

      <div className={`bp-checklist${mode === 'practice' ? ' bp-print-only' : ''}`} data-testid="practice-checklist">
        <header className="bp-print-heading">
          <h2>{order.name.zh} · 完整步骤单</h2>
          <p>{order.summary}</p>
        </header>
        <ol>
          {rows.map((item) => (
            <li key={item.index} data-testid="practice-checklist-step">
              <h3>第 {item.index + 1} 步</h3>
              <StepContent item={item} timeline={timeline} name={name} />
            </li>
          ))}
        </ol>
      </div>

      <section className="bp-sources" aria-label="开局来源与估算限制">
        <h2>来源与估算限制</h2>
        <p className="note">
          DE Update {__DATA_SOURCES__.patch.build} · 模型 {timeline.model.version}。以下来源用于开局编排；时间、人口和分配由本站模拟估算。
        </p>
        {sources.length > 0 && (
          <ul>
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                {source.section && `（${source.section}）`} · {source.author} · 核对 {source.accessed}
                {source.ref && <span className="bp-source-url">固定版本：{source.ref}</span>}
                <span className="bp-source-url">{source.url}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="note">{order.license}</p>
        <h3>完整估算假设</h3>
        <ul className="note">
          {timeline.model.assumptions.map((assumption, i) => (
            <li key={i}>{assumption}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
