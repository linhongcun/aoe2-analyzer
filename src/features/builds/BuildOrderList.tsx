import { buildOrders } from '../../data/buildOrders';
import type { Phase } from '../../domain/buildOrder';
import { ListHead } from '../../shared/ui/layout';
import FeedbackLink from '../feedback/FeedbackLink';

const PHASE: Record<Phase, string> = {
  'feudal-click': '点封建',
  feudal: '到达封建',
  'castle-click': '点城堡',
  castle: '到达城堡',
  'imperial-click': '点帝王',
  imperial: '到达帝王',
};
const AGE = ['', '黑暗', '封建', '城堡', '帝王'];

/** #/builds：开局库只读列表（时间轴视图见 #2/#3） */
export default function BuildOrderList() {
  return (
    <section className="pane" id="builds">
      <ListHead title="开局流程" desc={`${buildOrders.length} 个主流开局（草稿，待内容审核）；时间轴视图开发中`} />
      {buildOrders.map((b) => (
        <details key={b.id} className="bo" data-t="build-order">
          <summary>
            <b>{b.name.zh}</b> <span className="note">{b.name.en}</span> · {b.target.vils} 人口{AGE[b.target.age]}
            {b.target.time ? `（${b.target.time}）` : ''} · {b.civs.length ? b.civs.join('、') : '通用'}
          </summary>
          <p>{b.summary}</p>
          <ol className="bo-steps">
            {b.steps.map((s, i) => (
              <li key={i}>
                <span className="bo-vils">{s.vils}</span>
                {s.phase && <span className="tag">{PHASE[s.phase]}</span>} {s.note}
              </li>
            ))}
          </ol>
          <p className="note">
            来源：
            {b.sources.map((s, i) => (
              <span key={i}>
                {i > 0 && '；'}
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
                {s.section ? `（${s.section}）` : ''}
              </span>
            ))}
            。{b.license}
          </p>
        </details>
      ))}
      <p>
        <FeedbackLink kind="data" />
      </p>
    </section>
  );
}
