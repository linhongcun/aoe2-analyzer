import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import {
  armTeam,
  backStep,
  choose1v1,
  chooseLane,
  chooseMap,
  chooseTeamSize,
  decisionSteps,
  finishFlow,
  jumpTo,
  skipStep,
  stepPhase,
  type Lane,
  type StartState,
  type StepId,
  type TeamSize,
} from '../../../domain/startGame';
import { CivIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';

const STEP_LABEL: Record<StepId, string> = {
  mode: '模式',
  map: '地图',
  lane: '路位',
  civ: '文明',
  opponent: '对手',
};
export const LANE_LABEL: Record<Lane, string> = { pocket: '中路', flank: '边路' };
export const LANE_EN: Record<Lane, string> = { pocket: 'Pocket', flank: 'Flank' };
const SIZES: TeamSize[] = ['2v2', '3v3', '4v4'];
const EMPTY = '暂无建议';
export const EDITORIAL = '编辑口径，不是胜率';

export interface MapEntry {
  id: string;
  name: string;
  en: string;
  preview: { image: string };
}

let mapCache: MapEntry[] | null = null;

/** 地图目录不进首页主包。点到地图步之前就开始读，避免主包超过入口预算。 */
export function loadMaps(): Promise<MapEntry[]> {
  if (mapCache) return Promise.resolve(mapCache);
  return import('../../../data/mapCatalog.json').then((mod) => {
    mapCache = mod.default.maps;
    return mapCache;
  });
}

function useMapCatalog() {
  const [maps, setMaps] = useState(mapCache);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void loadMaps()
      .then((list) => {
        if (live) setMaps(list);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  return {
    maps,
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
  };
}

export function useMaps(): MapEntry[] | null {
  return useMapCatalog().maps;
}

export const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

export type Update = Dispatch<SetStateAction<StartState>>;

export function findMap(id: string | null, maps: MapEntry[] | null) {
  if (!id || !maps) return undefined;
  return maps.find((map) => map.id === id);
}

export function Practice() {
  return (
    <p className="start-practice" data-testid="start-practice">
      按文明练习 · 即将提供
    </p>
  );
}

export function EmptySlot({ skipped = false }: { skipped?: boolean }) {
  return (
    <p className="start-emptyline">
      <span data-testid="start-empty">{EMPTY}</span>
      {skipped ? <span className="start-skipped">已跳过</span> : null}
    </p>
  );
}

export function ModeText({ state }: { state: StartState }) {
  if (state.choice.mode === '1v1')
    return (
      <>
        <span className="num nw">1v1</span> 随机地图
      </>
    );
  if (state.choice.mode === 'team' && state.choice.teamSize)
    return (
      <>
        组队 · <span className="num nw">{state.choice.teamSize}</span> 随机地图
      </>
    );
  return null;
}

export function StepBar({ state, onChange }: { state: StartState; onChange: Update }) {
  return (
    <ol className="start-steps" data-testid="start-steps" aria-label={state.current == null ? '已走过的步骤' : '本局步骤'}>
      {decisionSteps(state).map((step) => {
        const phase = stepPhase(state, step);
        if (phase === 'done') {
          return (
            <li key={step}>
              <button type="button" className="start-chip is-done" onClick={() => onChange((current) => jumpTo(current, step))}>
                {STEP_LABEL[step]}
              </button>
            </li>
          );
        }
        return (
          <li key={step} className={phase === 'current' ? 'is-on' : undefined} aria-current={phase === 'current' ? 'step' : undefined}>
            <span className="start-chip">{STEP_LABEL[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Picked({ state }: { state: StartState }) {
  const maps = useMaps();
  const current = state.current;
  if (current == null) return null;
  const order = decisionSteps(state);
  const here = order.indexOf(current);
  const show = (step: StepId) => {
    const index = order.indexOf(step);
    return index >= 0 && index < here;
  };
  const map = findMap(state.choice.mapId, maps);
  const mode = show('mode') && state.choice.mode != null ? <ModeText state={state} /> : null;
  if (!mode && !(show('map') && map) && !(show('lane') && state.choice.lane)) return null;
  return (
    <ul className="start-picked">
      {mode ? (
        <li>
          <span className="start-k">{state.prefilled.mode ? '模式 · 已预填' : '模式'}</span>
          <span>{mode}</span>
        </li>
      ) : null}
      {show('map') && map ? (
        <li>
          <span className="start-k">{state.prefilled.map ? '地图 · 已预填' : '地图'}</span>
          <span>
            {map.name}{' '}
            <span className="start-en" lang="en">
              {map.en}
            </span>
          </span>
        </li>
      ) : null}
      {show('lane') && state.choice.lane ? (
        <li>
          <span className="start-k">路位</span>
          <span>
            {LANE_LABEL[state.choice.lane]}{' '}
            <span className="start-en" lang="en">
              {LANE_EN[state.choice.lane]}
            </span>
          </span>
        </li>
      ) : null}
    </ul>
  );
}

export function Actions({ state, onChange, finish = false }: { state: StartState; onChange: Update; finish?: boolean }) {
  return (
    <div className="start-actions">
      <button
        type="button"
        className="start-btn"
        data-testid="start-back"
        disabled={state.current === 'mode'}
        onClick={() => onChange((current) => backStep(current))}
      >
        上一步
      </button>
      <button type="button" className="start-btn" data-testid="start-skip" onClick={() => onChange((current) => skipStep(current))}>
        跳过此步
      </button>
      {finish ? (
        <button type="button" className="start-btn" onClick={() => onChange((current) => finishFlow(current))}>
          完成本局
        </button>
      ) : null}
    </div>
  );
}

export function CivRow({ en, reason, pressed, onPick }: { en: string; reason?: string; pressed: boolean; onPick: () => void }) {
  const civ = civByEn(en);
  if (!civ) return null;
  return (
    <div className="start-civrow">
      <button type="button" className="start-row" aria-pressed={pressed} onClick={onPick}>
        <CivIcon alt="" c={civ} />
        <span>
          <b>{civ.zh}</b>{' '}
          <span className="start-en" lang="en">
            {civ.en}
          </span>
          {reason ? <small>{reason}</small> : null}
          {reason ? <span className="start-tag">{EDITORIAL}</span> : null}
        </span>
      </button>
      <Link className="start-link" to={`/civ/${civ.en}`} aria-label={`查看${civ.zh}`}>
        查看
      </Link>
    </div>
  );
}

export function ModeStep({ state, onChange }: { state: StartState; onChange: Update }) {
  const sizesOn = state.teamArmed || state.choice.mode === 'team';
  return (
    <section className="start-ask" data-testid="start-step" data-step="mode" aria-labelledby="start-mode-h">
      <p id="start-mode-h" className="start-ask-title">
        选模式
      </p>
      <p className="start-why">先定这局是单挑还是组队。模式定了，后面才看地图；组队才问路位。</p>
      <div className="start-choices">
        <button type="button" className="start-choice" aria-pressed={state.choice.mode === '1v1'} onClick={() => onChange((current) => choose1v1(current))}>
          <Icon name="swords" />
          <span>
            <strong className="num nw">1v1 随机地图</strong>
            <small>单挑无需选择路位。</small>
          </span>
        </button>
        <div>
          <button type="button" className="start-choice" aria-pressed={sizesOn} onClick={() => onChange((current) => armTeam(current))}>
            <Icon name="users" />
            <span>
              <strong>组队随机地图</strong>
              <small>选择组队后，再选对战人数。</small>
            </span>
          </button>
          <div className="start-sizes" role="group" aria-label="组队人数">
            {SIZES.map((size) => (
              <button
                key={size}
                type="button"
                disabled={!sizesOn}
                aria-pressed={state.choice.teamSize === size}
                onClick={() => onChange((current) => chooseTeamSize(current, size))}
              >
                <span className="num nw">{size}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {sizesOn ? <p className="start-hint">请选择对战人数，继续选地图。</p> : <p className="start-hint">先点组队，再选对战人数。</p>}
      <Actions state={state} onChange={onChange} />
    </section>
  );
}

export function MapStep({ state, onChange }: { state: StartState; onChange: Update }) {
  const [query, setQuery] = useState('');
  const { maps, failed, retry } = useMapCatalog();
  const term = normalize(query);
  const visible = (maps ?? []).filter((map) => !term || [map.name, map.en, map.id].some((part) => normalize(part).includes(term)));
  return (
    <section className="start-ask" data-testid="start-step" data-step="map" aria-labelledby="start-map-h">
      <p id="start-map-h" className="start-ask-title">
        选地图
      </p>
      <p className="start-why">输入中文或英文名搜索，或从目录中选择这局的地图。</p>
      <p className="start-k">建议</p>
      <EmptySlot />
      <p className="start-hint" data-testid="start-scenario-scope">
        机制场景建议目前仅支持阿拉伯半岛的组队 <span className="num nw">4v4</span>，且需选择路位（中路或边路）；其它条件暂无机制建议，仍可自主选择文明。
      </p>
      <div className="start-rowhead">
        <p className="start-col-title">地图目录</p>
        <Link className="start-link" to="/maps">
          地图页
        </Link>
      </div>
      <label className="start-search">
        <span>搜索地图</span>
        <input type="search" value={query} placeholder="中文或英文名" onChange={(event) => setQuery(event.target.value)} />
      </label>
      {!maps ? (
        failed ? (
          <p role="alert">
            地图目录加载失败。
            <button type="button" className="start-btn" onClick={retry}>
              重试地图目录
            </button>
          </p>
        ) : (
          <p className="start-hint">正在读取地图目录</p>
        )
      ) : null}
      {maps && visible.length ? (
        <div className="start-catalog">
          {visible.map((map) => (
            <button
              key={map.id}
              type="button"
              className="start-map"
              aria-pressed={state.choice.mapId === map.id}
              onClick={() => onChange((current) => chooseMap(current, map.id))}
            >
              <img alt="" width={48} height={48} src={`${import.meta.env.BASE_URL}${map.preview.image}`} />
              <span>
                <b>{map.name}</b>{' '}
                <span className="start-en" lang="en">
                  {map.en}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : maps ? (
        <p className="start-hint">没有匹配的地图</p>
      ) : null}
      <Actions state={state} onChange={onChange} />
    </section>
  );
}

export function LaneStep({ state, onChange }: { state: StartState; onChange: Update }) {
  return (
    <section className="start-ask" data-testid="start-step" data-step="lane" aria-labelledby="start-lane-h">
      <p id="start-lane-h" className="start-ask-title">
        选路位
      </p>
      <p className="start-why">按队伍安排选择中路或边路。路位不表示文明强弱。</p>
      <Picked state={state} />
      <div className="start-choices">
        {(['pocket', 'flank'] as const).map((side) => (
          <button
            key={side}
            type="button"
            className="start-choice"
            aria-pressed={state.choice.lane === side}
            onClick={() => onChange((current) => chooseLane(current, side))}
          >
            <Icon name="git-branch" />
            <span>
              <strong>{LANE_LABEL[side]}</strong>
              <small>{LANE_EN[side]}</small>
            </span>
          </button>
        ))}
      </div>
      <Actions state={state} onChange={onChange} />
    </section>
  );
}
