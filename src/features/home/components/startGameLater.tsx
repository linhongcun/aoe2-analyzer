import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, civs } from '../../../data';
import {
  civPanels,
  decisionSteps,
  editStep,
  editorialReason,
  jumpTo,
  laneRowVisible,
  openLane,
  pickCiv,
  resetStart,
  type StartState,
  type StepId,
} from '../../../domain/startGame';
import { Actions, CivRow, EDITORIAL, EmptySlot, LANE_EN, LANE_LABEL, ModeText, Picked, findMap, normalize, useMaps, type Update } from './startGameEarly';

export function CivSearch({ shown, onChange }: { shown: ReadonlySet<string>; onChange: Update }) {
  const [query, setQuery] = useState('');
  const term = normalize(query);
  const visible = civs.filter((civ) => {
    if (shown.has(civ.en)) return false;
    if (!term) return shown.size === 0;
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
      {term || shown.size === 0 ? (
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

export function CivStep({ state, onChange }: { state: StartState; onChange: Update }) {
  const panel = civPanels(state);
  const shown = new Set<string>();
  if (panel.kind === 'side') for (const tip of panel.tips) shown.add(tip.civ);
  if (panel.kind === 'split') for (const group of panel.groups) for (const tip of group.tips) shown.add(tip.civ);
  const split = panel.kind === 'split';
  return (
    <section className="start-ask" data-testid="start-step" data-step="civ" aria-labelledby="start-civ-h">
      <p id="start-civ-h" className="start-ask-title">
        选我方文明
      </p>
      {split ? (
        <p className="start-why">还没选路位，所以按侧分开。不是一张胜率榜。</p>
      ) : panel.kind === 'side' ? (
        <p className="start-why">按这一侧编辑稿的原顺序全列。不按天梯重排，理由用稿里的原句。</p>
      ) : (
        <p className="start-why">没有可以沿用的编辑稿。可以自己选一个文明，也可以跳过。</p>
      )}
      <Picked state={state} />
      {state.lobby && state.choice.mode === 'team' && !decisionSteps(state).includes('lane') ? (
        <div className="start-actions">
          <button type="button" className="start-btn" onClick={() => onChange((current) => openLane(current))}>
            补路位
          </button>
          <button type="button" className="start-btn" onClick={() => onChange((current) => jumpTo(current, 'mode'))}>
            修改模式和地图
          </button>
        </div>
      ) : null}
      {panel.kind === 'empty' ? (
        <>
          <p className="start-k">建议</p>
          <EmptySlot />
          <Link className="start-link" to="/civs">
            文明页
          </Link>
        </>
      ) : null}
      {panel.kind === 'side' ? (
        <div className="start-stack">
          <p className="start-col-title">
            {LANE_LABEL[panel.side]}{' '}
            <span className="start-en" lang="en">
              {LANE_EN[panel.side]}
            </span>
          </p>
          {panel.tips.map((tip) => (
            <CivRow
              key={tip.civ}
              en={tip.civ}
              reason={tip.reason}
              pressed={state.choice.civ === tip.civ}
              onPick={() => onChange((current) => pickCiv(current, tip.civ, panel.side))}
            />
          ))}
        </div>
      ) : null}
      {panel.kind === 'split' ? (
        <div className="start-cols">
          {panel.groups.map((group) => (
            <div key={group.side}>
              <p className="start-col-title">
                {LANE_LABEL[group.side]}{' '}
                <span className="start-en" lang="en">
                  {LANE_EN[group.side]}
                </span>
              </p>
              {group.tips.length ? (
                group.tips.map((tip) => (
                  <CivRow
                    key={tip.civ}
                    en={tip.civ}
                    reason={tip.reason}
                    pressed={state.choice.civ === tip.civ && state.choice.lane === group.side}
                    onPick={() => onChange((current) => pickCiv(current, tip.civ, group.side))}
                  />
                ))
              ) : (
                <EmptySlot />
              )}
            </div>
          ))}
        </div>
      ) : null}
      <CivSearch shown={shown} onChange={onChange} />
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
  const reason = editorialReason(state);
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
              {reason ? (
                <small>
                  {reason}
                  {EDITORIAL}。
                </small>
              ) : null}
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
