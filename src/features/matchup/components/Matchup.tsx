import { ListHead } from '../../../shared/ui/layout';
import { civs } from '../../../data';
import { COUNTERS, matchup, TYPE_ZH } from '../../../domain/ratings';
import { CivIcon } from '../../../shared/ui/art';
import { CivOptions } from '../../../shared/ui/widgets';
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
        我的文明{' '}
        <select id="ma" value={ia} onChange={(x) => setA(+x.target.value)}>
          <CivOptions />
        </select>{' '}
        对手文明{' '}
        <select id="me" value={ie} onChange={(x) => setE(+x.target.value)}>
          <CivOptions />
        </select>
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
        <p className="note">自动生成的建议，基于主观评分，仅供参考</p>
      </div>
    </section>
  );
}
