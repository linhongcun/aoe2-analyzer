import type { Tech } from '../../domain/types';

// 仅用于预设分组；实际效果仍全部读取固定数据，并由领域层校验文明和时代。
const ECO_GATHER_IDS = new Set([12, 13, 14, 55, 182, 202, 203, 213, 221, 249, 278, 279, 506]);

export function ProductionTechs({
  available,
  free,
  selected,
  onSelectEco,
  onClear,
  onToggle,
}: {
  available: Tech[];
  free: Set<number>;
  selected: Set<number>;
  onSelectEco: (ids: number[]) => void;
  onClear: () => void;
  onToggle: (id: number) => void;
}) {
  const groups = [...new Set(available.map((t) => t.bz.replace(/\n/g, '')))];
  return (
    <section className="production-techs" aria-labelledby="production-techs-title">
      <h2 id="production-techs-title">已研究科技</h2>
      <div className="production-actions">
        <button type="button" className="btn" onClick={() => onSelectEco(available.filter((t) => ECO_GATHER_IDS.has(t.id)).map((t) => t.id))}>
          经济科技全研究
        </button>
        <button type="button" className="btn" onClick={onClear}>
          清空手动选择
        </button>
      </div>
      <p className="note">
        免费科技自动生效；前置联动选择。本文明团队训练加成自动计入，其他盟友加成未计入。选择单位形态视为已经完成其升级；下列科技控制额外训练地点、费用和生产速度。
      </p>
      <div className="production-tech-groups">
        {groups.map((group) => (
          <fieldset className="production-tech-group" key={group}>
            <legend>{group}</legend>
            {available
              .filter((t) => t.bz.replace(/\n/g, '') === group)
              .map((t) => (
                <label key={t.id} className="production-checkbox">
                  <input type="checkbox" aria-label={t.zh} checked={selected.has(t.id)} disabled={free.has(t.id)} onChange={() => onToggle(t.id)} />
                  <span>
                    {t.zh}
                    {free.has(t.id) && <small>免费，已计入</small>}
                  </span>
                </label>
              ))}
          </fieldset>
        ))}
      </div>
      {!available.length && <p className="note">当前时代没有可选的相关科技。</p>}
    </section>
  );
}
