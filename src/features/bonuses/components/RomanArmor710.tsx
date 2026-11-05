import { Link } from 'react-router-dom';
import type { CivBonusEnt } from '../../../domain/civBonus';
import { useCore, useTrees } from '../../../data/hooks';
import { romanArmor } from '../romanArmor710';
import { AGE_ZH } from '../../../domain/ratings';
import { DATA_SOURCES, commitUrl } from '../../../shared/utils/dataInfo';
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
export default function RomanArmor710({ b }: { b: CivBonusEnt }) {
  const core = useCore(),
    trees = useTrees();
  if (!core || !trees) return <p>护甲对照加载中</p>;
  const result = romanArmor(b, core.units, core.techs, trees);
  if (!result) return null;
  const example = result.example;
  const pin = DATA_SOURCES.sources?.dat;
  return (
    <section className="panel" aria-label="步兵护甲科技对照">
      <h2>步兵护甲科技对照</h2>
      <p>
        以下分别比较一项科技的普通贡献与罗马总贡献；罗马总贡献已包含普通贡献，不再重复相加。对象须同时在罗马目录及科技树中可用，不代表其它文明或每个时代都可训练这些形态。
      </p>
      {result.rows.length ? (
        result.rows.map((row, index) => (
          <article key={`${row.t.id}-${index}`} data-armor-tech={row.t.id}>
            <h3>{row.t.zh}</h3>
            <p>{AGE_ZH[row.t.age]}起，可研究时生效。</p>
            <dl className="detail-cost-grid">
              {(['ma', 'pa'] as const).map((stat) => (
                <div key={stat}>
                  <dt>普通单项{stat === 'ma' ? '近战' : '穿刺'}护甲</dt>
                  <dd data-armor-field={`normal-${stat}`} className="num nw">
                    {signed(row.normal[stat])}
                  </dd>
                  <dt>罗马单项总{stat === 'ma' ? '近战' : '穿刺'}护甲</dt>
                  <dd data-armor-field={`roman-${stat}`} className="num nw">
                    {signed(row.roman[stat])}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              适用对象：
              {row.units.map((u) => (
                <Link key={u.id} className="community-tool-entry" data-armor-unit={u.id} to={`/unit/${u.id}`}>
                  {u.zh}
                </Link>
              ))}
            </p>
          </article>
        ))
      ) : (
        <p>科技或作用对象待确认。</p>
      )}
      {result.unavailable.map((t) => (
        <p key={t.id}>罗马无法研究{t.zh}，本例不计入</p>
      ))}
      {example ? (
        <article data-armor-example={example.u.id}>
          <h3>{example.u.zh}：合法累计示例</h3>
          <p>{AGE_ZH[example.u.age]}同一形态的基础目录护甲，加上已研究科技；不是逐时代的单位解锁，也不含其它科技/团队加成。</p>
          {example.stages.map((s, index) => (
            <div key={index} data-armor-stage={index === 0 ? 'base' : index === 1 ? 'scale' : 'chain'}>
              <h4>
                {index === 0
                  ? '未研究护甲科技'
                  : `已研究${example.stages
                      .slice(1, index + 1)
                      .map((x) => x.t!.zh)
                      .join('及')}`}
              </h4>
              <dl className="detail-cost-grid">
                <div>
                  <dt>近战护甲</dt>
                  <dd className="num nw" data-armor-field="ma">
                    {s.ma}
                  </dd>
                </div>
                <div>
                  <dt>穿刺护甲</dt>
                  <dd className="num nw" data-armor-field="pa">
                    {s.pa}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </article>
      ) : (
        <p>累计示例的前置或对象待确认。</p>
      )}
      <p className="note">与模拟器的科技效果及罗马条件加成同源；仅做护甲字段对照，不模拟战斗。</p>
      <p>
        {pin && (
          <a className="community-tool-entry" href={commitUrl(pin)}>
            固定DE数据
          </a>
        )}
        <Link className="community-tool-entry" to="/about-data">
          数据说明
        </Link>
      </p>
    </section>
  );
}
