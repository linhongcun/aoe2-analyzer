import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import { buildsPath, explicitMatchupPath } from '../../../domain/matchupRoute';
import { sceneSupported } from '../../../domain/startGameInputs';
import { mapGuides } from '../../../domain/mapGuides';
import MapEditorial from './MapEditorial';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { OwnCivChip, TeamMates, TeamMatesSummary, TeamFitLink } from './StartPlayers';
import { editStep, jumpTo, laneRowVisible, openLane, pickCiv, pickOpponent, resetStart, type StartState, type StepId } from '../../../domain/startGame';
import { Actions, CivRow, EmptySlot, LANE_EN, LANE_LABEL, ModeText, Picked, findMap, normalize, useMaps, type Update } from './startGameEarly';

export function CivSearch({
  shown,
  onChange,
  state,
  searchOnly = false,
}: {
  shown: ReadonlySet<string>;
  onChange: Update;
  state: StartState;
  searchOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const term = normalize(query);
  const all = !searchOnly && (shown.size === 0 || browsing);
  const visible = civs.filter((civ) => {
    if (shown.has(civ.en)) return false;
    if (!term) return all;
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
      {shown.size > 0 && !searchOnly && !term ? (
        <button className="start-btn" type="button" aria-expanded={browsing} onClick={() => setBrowsing((value) => !value)}>
          {browsing ? '收起其余文明' : '浏览其余文明'}
        </button>
      ) : null}
      {browsing && shown.size > 0 && !term && !searchOnly ? (
        <p className="start-hint">
          其余 <span className="num nw">{visible.length} 个文明</span>
        </p>
      ) : null}
      {term || all ? (
        visible.length ? (
          <div className="start-catalog">
            {visible.map((civ) => (
              <CivRow key={civ.en} en={civ.en} state={state} pressed={false} onPick={() => onChange((current) => pickCiv(current, civ.en))} />
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
  const supported = sceneSupported(state.choice);
  const ready = state.choice.mode != null && (state.choice.mode !== 'team' || state.choice.teamSize != null) && state.choice.mapId != null;
  const guide = !supported && ready ? mapGuides[state.choice.mapId!] : undefined;
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
      ) : guide ? (
        <MapEditorial guide={guide} state={state} onChange={onChange} />
      ) : (
        <>
          <p className="start-why">
            {!ready
              ? '模式、组队人数或地图尚未选择，当前条件暂无机制建议。可以补选条件，或自主选择文明。'
              : '当前条件暂无机制建议；暂无这张地图的文明编辑参考。可以自主选择文明。'}
          </p>
          <EmptySlot />
        </>
      )}
      <TeamMates state={state} onChange={onChange} />
      <CivSearch shown={new Set(guide?.civs.map(([en]) => en))} state={state} onChange={onChange} searchOnly={supported} />
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
      <p className="start-why">对手文明可选，也可以清空或跳过。手工选择不代表已连接游戏大厅。</p>
      <OwnCivChip state={state} />
      <CivPicker
        id="start-opponent"
        label="对手文明（可选）"
        value={state.choice.opponent ?? ''}
        none="未选择"
        onChange={(en) => onChange((current) => pickOpponent(current, en || null))}
      />
      <Picked state={state} />
      <Link className="start-link" to={explicitMatchupPath(state.choice.civ, state.choice.opponent)}>
        对局助手
      </Link>
      <MatchupNotice />
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
      <OwnCivChip state={state} />
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
        <SummaryRow
          label="对手"
          step="opponent"
          state={state}
          onChange={onChange}
          filled={state.choice.opponent != null}
          empty={state.skipped.opponent === true ? '已跳过' : '未选择'}
        >
          {state.choice.opponent ? civByEn(state.choice.opponent)?.zh : null}
        </SummaryRow>
        <TeamMatesSummary state={state} onChange={onChange} />
      </div>
      <div className="start-links">
        {state.choice.mode === 'team' && state.choice.teamSize != null ? <TeamFitLink state={state} /> : null}
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
        <Link className="start-link" to={explicitMatchupPath(state.choice.civ, state.choice.opponent)}>
          对局助手
        </Link>
        {!sceneSupported(state.choice) ? (
          <Link className="start-link" to={buildsPath(civ?.en)}>
            开局流程
          </Link>
        ) : null}
      </div>
      <MatchupNotice />
      <p className="start-hint">
        开局流程：
        {sceneSupported(state.choice)
          ? '具体流程见本局开局；地图、路位未带入目标页。'
          : civ
            ? '当前条件未指定已核验打法；仅带入文明上下文，列表仍为全部开局；地图、路位未带入，具体流程需自行选择。'
            : '未带入本局文明，列表仍为全部开局，具体流程需自行选择。'}
      </p>
      <p className="start-hint">{map ? `地图页不保证已选中${map.name}，请在页内选择。` : '地图页未带入本局地图，请在页内选择。'}</p>
      <p className="start-hint">天梯打开的是现有静态快照，未按本局筛选，不是这一局的胜率。</p>
      {sceneSupported(state.choice) ? <PlanLoader state={state} /> : null}
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
  empty,
}: {
  label: string;
  step: StepId;
  state: StartState;
  onChange: Update;
  filled: boolean;
  children: ReactNode;
  empty?: string;
}) {
  return (
    <div className="start-sumrow">
      <p className="start-sumkey">{label}</p>
      <div className="start-sumval">{filled ? children : empty != null ? empty : <EmptySlot skipped={state.skipped[step] === true} />}</div>
      <button type="button" className="start-btn" aria-label={`修改${label}`} onClick={() => onChange((current) => editStep(current, step))}>
        修改
      </button>
    </div>
  );
}

function MatchupNotice() {
  return <p className="start-hint">仅带入本局手动选择的文明；未选一方保持空白，补齐双方后查看分析。</p>;
}

function PlanLoader({ state }: { state: StartState }) {
  const [Component, setComponent] = useState<ComponentType<{ state: StartState }> | null>(null);
  const [attempt, retry] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void import('./StartPlanSummary')
      .then((m) => {
        if (live) setComponent(() => m.default);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  if (Component) return <Component state={state} />;
  if (failed)
    return (
      <p role="alert">
        本局打法模块加载失败，选择和输入保留。
        <button
          type="button"
          className="start-btn"
          onClick={() => {
            setFailed(false);
            retry((n) => n + 1);
          }}
        >
          重试本局打法
        </button>
      </p>
    );
  return <p role="status">正在整理本局打法…</p>;
}
