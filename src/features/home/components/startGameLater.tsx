import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { editStep, jumpTo, laneRowVisible, openLane, pickCiv, resetStart, type StartState, type StepId } from '../../../domain/startGame';
import { Actions, CivRow, EmptySlot, LANE_EN, LANE_LABEL, ModeText, Picked, findMap, normalize, useMaps, type Update } from './startGameEarly';

export function CivSearch({ shown, onChange, searchOnly = false }: { shown: ReadonlySet<string>; onChange: Update; searchOnly?: boolean }) {
  const [query, setQuery] = useState('');
  const term = normalize(query);
  const visible = civs.filter((civ) => {
    if (shown.has(civ.en)) return false;
    if (!term) return shown.size === 0 && !searchOnly;
    return [civ.zh, civ.en, civ.py ?? '', civ.pyi ?? ''].some((part) => normalize(part).includes(term));
  });
  return (
    <div className="start-civsearch">
      <label className="start-search">
        <span>{shown.size ? '也可以搜全部文明' : '搜索文明'}</span>
        <input type="search" value={query} placeholder="中文或英文名" onChange={(event) => setQuery(event.target.value)} />
      </label>
      <p className="start-hint">
        共 <span className="num nw">{civs.length} 个文明</span>
      </p>
      {term || (shown.size === 0 && !searchOnly) ? (
        visible.length ? (
          <div className="start-catalog">
            {visible.map((civ) => (
              <CivRow key={civ.en} en={civ.en} pressed={false} onPick={() => onChange((current) => pickCiv(current, civ.en))} />
            ))}
          </div>
        ) : (
          <p className="start-hint">没有匹配的文明</p>
        )
      ) : null}
    </div>
  );
}

type SceneProps = { state: StartState; onChange: Update };
function ScenarioLoader(props: SceneProps) {
  const [attempt, retry] = useState(0);
  const [loaded, setLoaded] = useState<{ Component: ComponentType<SceneProps> } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void import('./ScenarioSuggestions')
      .then((module) => {
        if (live) setLoaded({ Component: module.default });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  if (loaded) {
    const Component = loaded.Component;
    return <Component {...props} />;
  }
  if (failed)
    return (
      <p role="alert">
        场景模块加载失败，已选文明保留。仍可搜索文明。
        <button
          className="start-btn"
          type="button"
          onClick={() => {
            setFailed(false);
            retry((n) => n + 1);
          }}
        >
          重试场景
        </button>
      </p>
    );
  return <p role="status">正在计算场景建议…</p>;
}
export function CivStep({ state, onChange }: { state: StartState; onChange: Update }) {
  const supported = state.choice.mode === 'team' && state.choice.teamSize === '4v4' && state.choice.mapId === 'arabia' && state.choice.lane != null;
  return (
    <section className="start-ask" data-testid="start-step" data-step="civ" aria-labelledby="start-civ-h">
      <p id="start-civ-h" className="start-ask-title">
        选我方文明
      </p>
      <Picked state={state} />
      {state.choice.civ ? <p className="start-hint">已选文明保留；建议按新条件更新。只有重新选择或跳过文明才会替换。</p> : null}
      {state.choice.civ ? (
        <button type="button" className="start-btn" onClick={() => onChange((c) => pickCiv(c, c.choice.civ!))}>
          保留此文明继续
        </button>
      ) : null}
      {state.lobby ? (
        <div className="start-actions">
          {state.choice.mode === 'team' && state.choice.teamSize != null && state.choice.lane == null ? (
            <button type="button" className="start-btn" onClick={() => onChange(openLane)}>
              补路位
            </button>
          ) : null}
          <button type="button" className="start-btn" onClick={() => onChange((c) => jumpTo(c, 'mode'))}>
            修改模式和地图
          </button>
        </div>
      ) : null}
      {supported ? (
        <ScenarioLoader key={state.choice.lane} state={state} onChange={onChange} />
      ) : (
        <>
          <p className="start-why">
            {state.choice.mode == null || state.choice.mapId == null
              ? '模式或地图尚未选择，当前条件暂无机制建议。可以补选条件，或自主选择文明。'
              : '场景建议仅支持明确选择阿拉伯 4v4 和路位；当前条件暂无机制建议。可以自主选择文明。'}
          </p>
          <EmptySlot />
        </>
      )}
      <CivSearch shown={new Set()} onChange={onChange} searchOnly={supported} />
      <Actions state={state} onChange={onChange} />
    </section>
  );
}

export function OpponentStep({ state, onChange }: { state: StartState; onChange: Update }) {
  return (
    <section className="start-ask" data-testid="start-step" data-step="opponent" aria-labelledby="start-opponent-h">
      <p id="start-opponent-h" className="start-ask-title">
        选对手
      </p>
      <p className="start-why">这一步没有已核对的对手数据。不列出对手文明。</p>
      <Picked state={state} />
      <p className="start-k">建议</p>
      <EmptySlot />
      <Link className="start-link" to="/matchup">
        对局助手
      </Link>
      <Actions state={state} onChange={onChange} finish />
    </section>
  );
}

export function Summary({ state, onChange }: { state: StartState; onChange: Update }) {
  const map = findMap(state.choice.mapId, useMaps());
  const civ = state.choice.civ ? civByEn(state.choice.civ) : undefined;

  const modeValue = <ModeText state={state} />;
  return (
    <article className="start-summary" data-testid="start-summary" aria-labelledby="start-sum-h">
      <p id="start-sum-h" className="start-ask-title">
        这一局
      </p>
      <div className="start-sumrows">
        <SummaryRow label="模式" step="mode" state={state} onChange={onChange} filled={state.choice.mode != null}>
          {modeValue}
        </SummaryRow>
        <SummaryRow label="地图" step="map" state={state} onChange={onChange} filled={map != null}>
          {map ? (
            <>
              {map.name}{' '}
              <span className="start-en" lang="en">
                {map.en}
              </span>
            </>
          ) : null}
        </SummaryRow>
        {laneRowVisible(state) ? (
          <SummaryRow label="路位" step="lane" state={state} onChange={onChange} filled={state.choice.lane != null}>
            {state.choice.lane ? (
              <>
                {LANE_LABEL[state.choice.lane]}{' '}
                <span className="start-en" lang="en">
                  {LANE_EN[state.choice.lane]}
                </span>
              </>
            ) : null}
          </SummaryRow>
        ) : null}
        <SummaryRow label="文明" step="civ" state={state} onChange={onChange} filled={civ != null}>
          {civ ? (
            <>
              <Link className="start-link" to={`/civ/${civ.en}`}>
                {civ.zh}
              </Link>{' '}
              <span className="start-en" lang="en">
                {civ.en}
              </span>
              <small>所选文明已保留。场景建议只比较声明条件下的城堡时代路线，不代表整局表现。</small>
            </>
          ) : null}
        </SummaryRow>
        <SummaryRow label="对手" step="opponent" state={state} onChange={onChange} filled={false}>
          {null}
        </SummaryRow>
      </div>
      <div className="start-links">
        <Link className="start-link" to="/maps">
          地图页
        </Link>
        {civ ? (
          <Link className="start-link" to={`/civ/${civ.en}`}>
            {civ.zh}
          </Link>
        ) : null}
        <Link className="start-link" to="/ladder">
          天梯数据
        </Link>
        <Link className="start-link" to="/matchup">
          对局助手
        </Link>
        <Link className="start-link" to="/builds">
          开局流程
        </Link>
      </div>
      <p className="start-hint">
        天梯打开的是现有静态快照，不是这一局的胜率。对局助手和开局流程不会自动带上{civ ? civ.zh : '所选文明'}。地图页不保证已经选中
        {map ? map.name : '刚才的地图'}。
      </p>
      <div className="start-actions">
        <button type="button" className="start-btn" onClick={() => onChange(() => resetStart())}>
          再开一局
        </button>
      </div>
    </article>
  );
}

export function SummaryRow({
  label,
  step,
  state,
  onChange,
  filled,
  children,
}: {
  label: string;
  step: StepId;
  state: StartState;
  onChange: Update;
  filled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="start-sumrow">
      <p className="start-sumkey">{label}</p>
      <div className="start-sumval">{filled ? children : <EmptySlot skipped={state.skipped[step] === true} />}</div>
      <button type="button" className="start-btn" aria-label={`修改${label}`} onClick={() => onChange((current) => editStep(current, step))}>
        修改
      </button>
    </div>
  );
}
