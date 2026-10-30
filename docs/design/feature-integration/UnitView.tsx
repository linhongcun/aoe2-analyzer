import { Icon } from '../../../src/shared/ui/Icon';
import { AGE_ZH } from '../../../src/domain/ratings';
import { Go, Notice, productHref, type ViewProps } from './ui';

export function UnitView({ model, stageLink }: ViewProps) {
  const { unit, own, config, unitRoute } = model;
  return (
    <div className="content-grid">
      <section className="panel">
        <div className="section-kicker">
          <Icon name="book-open" />
          从资料继续分析
        </div>
        <div className="unit-hero">
          {unit && <img src={`/img/units/${unit.pic}.webp`} alt="" />}
          <div>
            <h2>{unit?.zh ?? '单位不可用'}</h2>
            <p className="muted">
              {unit?.en} · {own.zh} · {AGE_ZH[config.age]}
            </p>
          </div>
        </div>
        <p>百科负责解释单位，模拟器负责核对科技后的属性。决定尝试这个兵种后，可以直接进入生产规划。</p>
        <Notice>当前没有选用战斗科技。生产工具会重新核对可用单位与建筑，不会把战斗科技当作经济科技。</Notice>
        <a className="text-link" href={productHref(unitRoute)}>
          在现有单位模拟器中核对 <Go />
        </a>
      </section>
      <aside className="panel next-panel">
        <div className="section-kicker">
          <Icon name="lightbulb" />
          接下来可以验证
        </div>
        <h2>能持续生产吗？</h2>
        <p className="muted">带入当前文明、时代和单位。建筑数量由你决定。</p>
        <div className="carried">
          <span>
            <Icon name="check" />
            {own.zh}
          </span>
          <span>
            <Icon name="check" />
            {AGE_ZH[config.age]}
          </span>
          <span>
            <Icon name="check" />
            {unit?.zh}
          </span>
        </div>
        {stageLink(
          'production',
          <>
            按这个单位规划生产 <Go />
          </>,
          'button primary full',
        )}
      </aside>
    </div>
  );
}
