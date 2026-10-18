import RushDefense from './RushDefense';
import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { civs } from '../../../data';
import { useCore } from '../../../data/hooks';
import { COUNTER_EXTRA, EMPTY_COUNTERS_COPY, EMPTY_STRENGTHS_COPY, STRONG_THRESHOLD, TYPE_ZH, filterCounterUnits, matchup } from '../../../domain/ratings';
import { CivIcon, UnitIcon } from '../../../shared/ui/art';
import { RatingLabel } from '../../../shared/ui/RatingHelp';
import { useSticky } from '../../../shared/utils/sticky';
import { Loading } from '../../../shared/ui/widgets';
import { Link } from 'react-router-dom';

export default function Matchup() {
  const core = useCore();
  const [ia, setA] = useSticky('mu.a', 16),
    [ie, setE] = useSticky('mu.e', 5);
  const a = civs[ia]!,
    e = civs[ie]!,
    m = matchup(a, e);
  const counters = core ? filterCounterUnits(a.en, e.ty, core.units) : [];
  return (
    <section id="matchup" className="pane">
      <ListHead title="对局助手" desc="根据双方文明给出反制建议" />
      <div className="bar fbar">
        我的文明 <CivPicker id="ma" label="我的文明" value={civs[ia]!.en} onChange={(en) => setA(civs.findIndex((c) => c.en === en))} /> 对手文明{' '}
        <CivPicker id="me" label="对手文明" value={civs[ie]!.en} onChange={(en) => setE(civs.findIndex((c) => c.en === en))} />
      </div>
      <RushDefense />
      {!core ? (
        <Loading />
      ) : (
        <div id="mres">
          <h3>
            <CivIcon c={a} /> {a.zh} vs <CivIcon c={e} /> {e.zh}
          </h3>
          <p>
            <b>对手强项：</b>
            {m.oppStrong.length ? (
              m.oppStrong.join('、')
            ) : (
              <span className="note" data-t="empty-strengths">
                {EMPTY_STRENGTHS_COPY}
              </span>
            )}
            <span className="tag note" style={{ marginLeft: 8 }} title="评分达到该值才列入强项">
              评分 ≥ {STRONG_THRESHOLD}
            </span>
            ；<b>弱项：</b>
            {m.oppWeak.join('、')}
          </p>
          <p>
            <b>你的相对优势：</b>
            {m.myEdge}
          </p>
          <p>
            <b>推荐反制</b>
          </p>
          {e.ty.map((t) => (
            <p key={t} className="note">
              <b>{TYPE_ZH[t]}：</b>
              {COUNTER_EXTRA[t]}
            </p>
          ))}
          {counters.length === 0 ? (
            <p className="note">{EMPTY_COUNTERS_COPY}</p>
          ) : (
            <ul className="matchup-counter-list">
              {counters.map((u) => {
                const unit = core.units.find((x) => x.id === u.id);
                return (
                  <li key={u.id}>
                    <Link className="ulink matchup-counter-link" to={`/unit/${u.id}`}>
                      {unit && <UnitIcon u={unit} />}
                      <span>{u.nameZh}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p>
            <b>建议：</b>
            {m.tips}
          </p>
          <p className="note rating-foot">
            自动生成的建议 · <RatingLabel />
          </p>
        </div>
      )}
    </section>
  );
}
