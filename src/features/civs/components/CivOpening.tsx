import { Link } from 'react-router-dom';
import { buildOrders } from '../../../data/buildOrders';
import { useCore } from '../../../data/hooks';
import { openingBuildIds, openingText } from '../../../domain/civOpening';
import type { Civ } from '../../../domain/types';
import { Linked } from '../../../shared/ui/widgets';

export function CivOpening({ c }: { c: Civ }) {
  const core = useCore();
  const ids = openingBuildIds(c.op);
  const builds = ids.flatMap((id) => buildOrders.filter((b) => b.id === id));
  return (
    <section className="civ-opening" aria-label="推荐开局">
      <p>
        <b>推荐开局：</b>
      </p>
      <p className="note">黑暗时代准备经济，封建时代选择开局兵种，再按路线转型。具体分配请查看开局流程。</p>
      <ol>
        {c.op.split('->').map((text, i) => (
          <li key={i}>
            <b>{i === 0 ? '黑暗至封建' : text.includes('帝王') ? '帝王时代' : '城堡及后续'}：</b>
            <Linked text={core ? openingText(text.trim(), core.units) : text.trim()} />
          </li>
        ))}
      </ol>
      <p className="note">对应开局流程（通用参考，请结合文明加成调整）：</p>
      <div className="civ-opening-links">
        {builds.map((b) => (
          <Link className="ulink" key={b.id} to={`/builds?bo=${b.id}`}>
            {b.name.zh}
          </Link>
        ))}
        <Link className="ulink" to="/builds">
          查看全部开局
        </Link>
      </div>
    </section>
  );
}
