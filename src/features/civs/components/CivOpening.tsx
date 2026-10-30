import { Link } from 'react-router-dom';
import { buildOrders } from '../../../data/buildOrders';
import { useCore } from '../../../data/hooks';
import type { Civ } from '../../../domain/types';
import { contextPath, type EntityContext } from '../../../shared/nav/context';
import { Linked } from '../../../shared/ui/widgets';
import { civOpeningDisplayText } from '../displayNames';
import { selectOpeningBuilds } from '../openingBuildChoices';
import '../openingBuildChoices.css';

function BuildName({ text }: { text: string }) {
  return text.split(/(\d+\s*(?:人口|村民))/g).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function CivOpening({ c, context }: { c: Civ; context?: EntityContext }) {
  const core = useCore();
  const { kind, builds } = selectOpeningBuilds(c, buildOrders);
  const buildPath = (id?: string) => {
    if (!id && !context) return '/builds';
    const params = new URLSearchParams(id ? { bo: id, civ: c.en } : { civ: c.en });
    return contextPath(`/builds?${params}`, context?.search ?? '', context?.source);
  };
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
            <Linked text={civOpeningDisplayText(text.trim(), c.en, core)} />
          </li>
        ))}
      </ol>
      <p className="note">兵种转型是路线参考；下面按资料适用名单列出流程，无明确匹配时标注通用示意。</p>
      <p className="note">
        <b>{kind === 'listed' ? '资料标注适用的开局流程' : '通用流程示意'}</b>
      </p>
      {kind === 'generic' && <p className="note">暂无资料标注适用的流程，请结合文明加成调整。</p>}
      {builds.length === 0 && <p className="note">暂无匹配流程。</p>}
      <div className="civ-opening-links">
        {builds.map((b) => (
          <div className="civ-opening-choice" key={b.id}>
            <Link className="ulink" to={buildPath(b.id)} aria-label={b.name.zh}>
              <BuildName text={b.name.zh} />
            </Link>
            {kind === 'generic' && <span className="note civ-opening-generic">通用示意</span>}
          </div>
        ))}
        <Link className="ulink" to={buildPath()}>
          查看全部开局
        </Link>
      </div>
    </section>
  );
}
