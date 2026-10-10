import { civs } from '../../../data';
import { AXES } from '../../../domain/ratings';
import type { Civ } from '../../../domain/types';
import { CivIcon } from '../../../shared/ui/art';
import { CivOptions, PosBox, Radar, Steps } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';

const ROWS: [string, 'uu' | 'ct' | 'it' | 'tb' | 'op'][] = [
  ['特色兵种', 'uu'],
  ['城堡科技', 'ct'],
  ['帝王科技', 'it'],
  ['团队加成', 'tb'],
  ['开局', 'op'],
];
const cell = (c: Civ, k: (typeof ROWS)[number][1]) => (k === 'op' ? <Steps s={c.op} /> : c[k]);

export default function Compare() {
  const [ia, setA] = useSticky('cmp.a', 16),
    [ib, setB] = useSticky('cmp.b', 5);
  const a = civs[ia]!,
    b = civs[ib]!;
  return (
    <section id="compare" className="pane">
      <div className="bar">
        <select id="ca" value={ia} onChange={(e) => setA(+e.target.value)}>
          <CivOptions />
        </select>{' '}
        VS{' '}
        <select id="cb" value={ib} onChange={(e) => setB(+e.target.value)}>
          <CivOptions />
        </select>
      </div>
      <div className="two">
        <table id="ctab">
          <tbody>
            <tr>
              <th />
              <th style={{ color: 'var(--c-gold)' }}>
                <CivIcon c={a} />
                <br />
                {a.zh}
              </th>
              <th style={{ color: 'var(--c-blue)' }}>
                <CivIcon c={b} />
                <br />
                {b.zh}
              </th>
            </tr>
            {AXES.map((l, i) => (
              <tr key={l}>
                <td>{l}</td>
                <td className={a.s[i]! > b.s[i]! ? 'win' : ''}>{a.s[i]}</td>
                <td className={b.s[i]! > a.s[i]! ? 'win' : ''}>{b.s[i]}</td>
              </tr>
            ))}
            {ROWS.map(([l, k]) => (
              <tr key={k}>
                <td>{l}</td>
                <td>{cell(a, k)}</td>
                <td>{cell(b, k)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <Radar id="crd" list={[a, b]} />
          <p className="note">金色=左侧文明，蓝色=右侧文明；主观近似评分</p>
        </div>
      </div>
      <div id="cpos">
        <PosBox list={[a, b]} />
      </div>
    </section>
  );
}
