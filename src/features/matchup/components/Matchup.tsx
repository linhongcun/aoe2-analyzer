import { ListHead } from '../../../shared/ui/layout';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { civs } from '../../../data';
import { COUNTERS, matchup, TYPE_ZH } from '../../../domain/ratings';
import { CivIcon } from '../../../shared/ui/art';
import { RatingLabel } from '../../../shared/ui/RatingHelp';
import { useSticky } from '../../../shared/utils/sticky';

export default function Matchup() {
  const [ia, setA] = useSticky('mu.a', 16),
    [ie, setE] = useSticky('mu.e', 5);
  const a = civs[ia]!,
    e = civs[ie]!,
    m = matchup(a, e);
  return (
    <section id="matchup" className="pane">
      <ListHead title="对局助手" desc="根据双方文明给出反制建议" />
      <div className="bar fbar">
        我的文明 <CivPicker id="ma" label="我的文明" value={civs[ia]!.en} onChange={(en) => setA(civs.findIndex((c) => c.en === en))} /> 对手文明{' '}
        <CivPicker id="me" label="对手文明" value={civs[ie]!.en} onChange={(en) => setE(civs.findIndex((c) => c.en === en))} />
      </div>
      <div id="mres">
        <h3>
          <CivIcon c={a} /> {a.zh} vs <CivIcon c={e} /> {e.zh}
        </h3>
        <p>
          <b>对手强项：</b>
          {m.oppStrong.join('、')}；<b>弱项：</b>
          {m.oppWeak.join('、')}
        </p>
        <p>
          <b>你的相对优势：</b>
          {m.myEdge}
        </p>
        <p>
          <b>针对对手兵种的反制：</b>
        </p>
        <ul>
          {e.ty.map((t) => (
            <li key={t}>
              <b>{TYPE_ZH[t]}：</b>
              {COUNTERS[t]}
            </li>
          ))}
        </ul>
        <p>
          <b>建议：</b>
          {m.tips}
        </p>
        <p className="note">
          自动生成的建议 · <RatingLabel />
        </p>
      </div>
    </section>
  );
}
