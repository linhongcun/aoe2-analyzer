import { Link } from 'react-router-dom';
import type { Unit } from '../../../domain/types';
import { formatSigned, UPDATE_99311 } from '../conversion';

const reading = (value: number | undefined) => (Number.isFinite(value) ? value : '暂无数据');
const signed = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? formatSigned(value) : '暂无数据');

export function CasterResistance({ guardian, elephant }: { guardian?: Unit; elephant?: Unit }) {
  const interval = (unit?: Unit) => {
    const min = unit?.conversionResistance?.minTimeMod,
      max = unit?.conversionResistance?.maxTimeMod;
    return min !== undefined && min === max ? (
      <>
        各 <span className="num nw">{signed(min)}</span>
      </>
    ) : (
      <span className="num nw">
        {signed(min)} / {signed(max)}
      </span>
    );
  };
  return (
    <p className="note" data-conversion="resistance">
      目标单位可能自带基础招降抗性（例如<Link to="/unit/2586">神庙护卫</Link>最短／最长{interval(guardian)}、<Link to="/unit/1132">象兵</Link>
      {interval(elephant)}，可在对应单位详情页查看），文明加成（如孟加拉象兵另加{' '}
      <span className="num nw">
        {signed(elephant?.bengaliConversion?.minTimeMod)} / {signed(elephant?.bengaliConversion?.maxTimeMod)}
      </span>
      ）与上方修道院科技分属不同层；站内不合成最终招降耗时。
    </p>
  );
}

export function CasterTasks({ unit }: { unit: Unit }) {
  const convert = unit.casterTasks?.find((t) => t.action === 104),
    heal = unit.casterTasks?.find((t) => t.action === 105);
  const matchesWindow = convert?.value1 === UPDATE_99311.intervalMin && convert?.value2 === UPDATE_99311.intervalMax;
  return (
    <section className="ud-caster-tasks" aria-label="施术任务与主动治疗边界" data-conversion="caster-tasks">
      <h3>施术任务与主动治疗边界</h3>
      <div className="ud-caster-grid">
        <div className="ud-caster-card">
          <h4>招降任务</h4>
          <span className="ud-cr-badge is-resist">
            动作 <span className="num nw">104</span>
          </span>
          <p>
            通用目标行原始参数为{' '}
            <span className="num nw">
              {reading(convert?.value1)} / {reading(convert?.value2)}
            </span>
            ，
            {matchesWindow ? (
              <>
                可与上方 Update <span className="num nw">{UPDATE_99311.build}</span> 基准窗口互证
              </>
            ) : (
              '以固定数据的原始读数为准'
            )}
            ；不单独证明 <span className="num nw">{UPDATE_99311.chancePercent}%</span> 概率或各专类目标全条件实测。
          </p>
        </div>
        <div className="ud-caster-card">
          <h4>主动治疗任务</h4>
          <span className="ud-cr-badge is-warn">
            动作 <span className="num nw">105</span> · 未核实
          </span>
          <p>
            通用目标行记录原始值 <span className="num nw">{reading(heal?.value1)}</span>；主动治疗距离与恢复速率（HP/秒）均未核实，本期不提供主动治疗耗时计算。
          </p>
        </div>
      </div>
      <p>
        口径边界：不能把{unit.zh}的目录射程（<span className="num nw">{reading(unit.rng)}</span>）当作主动治疗距离，也不能把动作{' '}
        <span className="num nw">105</span> 的原始值 <span className="num nw">{reading(heal?.value1)}</span> 直接写成
        {Number.isFinite(heal?.value1) ? <span className="num nw">{heal?.value1} HP/秒</span> : '主动治疗速率'}，更不用建筑
        <Link to="/garrison-healing">驻军回血</Link>估算主动治疗时间。
      </p>
    </section>
  );
}
