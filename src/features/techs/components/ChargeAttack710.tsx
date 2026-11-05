import { Link } from 'react-router-dom';
import { useCore, useTrees } from '../../../data/hooks';
import { CHARGE_ATTACK_DATA as data, chargeExample } from '../chargeAttack710';
export default function ChargeAttack710() {
  const core = useCore(),
    trees = useTrees();
  return (
    <section aria-label="攻击类蓄力参数" className="panel">
      <h2>攻击类蓄力参数</h2>
      <p>
        以下是固定DE数据中，单次应用野战军效果的静态字段；容量不等于额外伤害，静态换算不是运行时冷却。初始蓄力、首次及部分蓄力攻击、冲锋额外伤害、每次攻击消耗、运行时恢复及触发距离均待确认，不计入PK。
      </p>
      {!core || !trees ? (
        <p>数据加载中</p>
      ) : (
        data.examples.map(({ unitId }) => {
          const e = chargeExample(data, unitId, core.unitById, core.techById, trees);
          return e ? (
            <article key={unitId} data-charge-unit={unitId}>
              <h3>{e.u.zh}</h3>
              <dl className="detail-cost-grid">
                <div>
                  <dt>研究前容量</dt>
                  <dd data-charge-field="beforeCapacity" className="num nw">
                    {e.before.max_charge}
                  </dd>
                </div>
                <div>
                  <dt>研究后容量（非伤害）</dt>
                  <dd data-charge-field="capacity" className="num nw">
                    {e.after.max_charge}
                  </dd>
                </div>
                <div>
                  <dt>研究后恢复率（静态字段）</dt>
                  <dd data-charge-field="rate" className="num nw">
                    {e.after.recharge_rate}/秒
                  </dd>
                </div>
                <div>
                  <dt>从零到满容量（容量÷恢复率）</dt>
                  <dd data-charge-field="duration" className="num nw">
                    {e.seconds == null ? '待确认' : `${e.seconds}秒`}
                  </dd>
                </div>
              </dl>
            </article>
          ) : (
            <p key={unitId}>对象或模式尚未核实：待确认</p>
          );
        })
      )}
      <p className="note">
        原始效果目标<span className="num nw">{data.rawTargets.length}种</span>，与罗马目录及科技树交集后
        <span className="num nw">{data.legalTargets.length}种</span>；上方仅列<span className="num nw">{data.examples.length}种</span>
        帝王时代合法形态示例，并非全部对象。
      </p>
      <p>
        <a
          className="community-tool-entry"
          href={`https://github.com/${data.meta.datSource.repo}/blob/${data.meta.datSource.commit}/${data.meta.datSource.path}`}
        >
          固定DE数据
        </a>
        {Object.entries(data.meta.fieldSemantics).map(([key, href]) => (
          <a key={key} className="community-tool-entry" href={href}>
            {{ attributes: '属性字段', mode: '攻击模式', duration: '时长换算', seconds: '秒单位展示' }[key]}
          </a>
        ))}
        <Link className="community-tool-entry" to="/about-data">
          数据说明
        </Link>
      </p>
    </section>
  );
}
