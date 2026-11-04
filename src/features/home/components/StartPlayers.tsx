import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { encodeTeamFit } from '../../../domain/teamFitQuery';
import { editStep, setMate, type StartState } from '../../../domain/startGame';
import type { Update } from './startGameEarly';

export function OwnCivChip({ state }: { state: StartState }) {
  return (
    <ul className="start-picked" aria-label="本局己方文明" data-testid="start-own-civ">
      <li>
        <span className="start-k">己方文明</span>
        <span>{state.choice.civ ? civByEn(state.choice.civ)?.zh : '未选择'}</span>
      </li>
    </ul>
  );
}
export function TeamFitLink({ state }: { state: StartState }) {
  return (
    <Link className="start-link" to={'/team-fit?' + encodeTeamFit({ candidate: state.choice.civ ?? '', mates: state.choice.mates })}>
      文明搭配
    </Link>
  );
}
export function TeamMates({ state, onChange }: { state: StartState; onChange: Update }) {
  if (state.choice.mode !== 'team' || state.choice.teamSize == null) return null;
  return (
    <div data-testid="start-team-mates">
      <p className="start-ask-title">队友已选文明（可选）</p>
      <p className="start-hint">手工填写，没有连上游戏大厅。队友不参与当前场景排序，可在文明搭配里查看互补。</p>
      {state.choice.mates.map((en, index) => (
        <div className="start-actions" key={index}>
          <CivPicker
            id={'start-mate-' + index}
            label={'队友' + (index + 1)}
            value={en}
            onChange={(value) => onChange((current) => setMate(current, index, value || null))}
          />
          <button
            type="button"
            className="start-btn"
            aria-label={'移除队友' + (index + 1)}
            onClick={() => onChange((current) => setMate(current, index, null))}
          >
            移除
          </button>
        </div>
      ))}
      <div className="start-actions">
        {state.choice.mates.length < 3 ? (
          <CivPicker
            id="start-add-mate"
            label="加入队友文明"
            none="加入队友"
            value=""
            onChange={(en) => {
              if (en) onChange((current) => setMate(current, current.choice.mates.length, en));
            }}
          />
        ) : (
          <p className="start-hint">
            已填 <span className="num nw">3 名队友</span>，可修改或移除。
          </p>
        )}
        <TeamFitLink state={state} />
      </div>
    </div>
  );
}
export function TeamMatesSummary({ state, onChange }: { state: StartState; onChange: Update }) {
  if (state.choice.mode !== 'team' || state.choice.teamSize == null) return null;
  return (
    <div className="start-sumrow" data-testid="start-team-summary">
      <p className="start-sumkey">队友</p>
      <div className="start-sumval">
        {state.choice.mates.length ? (
          <ul className="start-picked">
            {state.choice.mates.map((en, index) => (
              <li key={index}>
                <span className="start-k">队友{index + 1}</span>
                {civByEn(en)?.zh}
              </li>
            ))}
          </ul>
        ) : (
          '未填写'
        )}
      </div>
      <button type="button" className="start-btn" aria-label="修改队友" onClick={() => onChange((current) => editStep(current, 'civ'))}>
        修改
      </button>
    </div>
  );
}
