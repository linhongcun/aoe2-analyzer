import type { Building } from '../../../domain/types';

type AttackData = Partial<Pick<Building, 'atk' | 'atks'>>;

const BASE_LABELS: Readonly<Partial<Record<number, string>>> = {
  3: '基础穿刺攻击',
  4: '基础近战攻击',
};

export function BuildingAttackDetails({ atk, atks }: AttackData) {
  const base = atks?.filter(({ classId }) => BASE_LABELS[classId]) ?? [];
  const extra = atks?.filter(({ classId }) => !BASE_LABELS[classId]);
  const shown = extra?.filter(({ amount }) => amount !== 0) ?? [];
  const extraStatus = !extra ? '缺少攻击类别来源，未核实。' : extra.length ? '目录列出的额外类别值均为 0。' : '仅有基础攻击，没有额外类别项。';

  return (
    <section className="bd-attack" aria-labelledby="building-attack-title">
      <h3 id="building-attack-title">攻击明细</h3>
      {atks?.length === 0 ? (
        <p className="bd-kicker">目录未列出攻击项。</p>
      ) : (
        <>
          <div className="bd-attack-grid">
            {base.length > 0 ? (
              <dl className="bd-attack-base bd-stat" data-stat="atk">
                {base.map(({ classId, amount }, index) => (
                  <div key={index}>
                    <dt className="bd-stat-lab">{BASE_LABELS[classId]}</dt>
                    <dd className="bd-stat-val num nw">{amount}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              atk != null && (
                <dl className="bd-attack-base bd-stat" data-stat="atk">
                  <dt className="bd-stat-lab">面板基础攻击</dt>
                  <dd className="bd-stat-val num nw">{atk}</dd>
                </dl>
              )
            )}
            <div>
              <h4 className="bd-attack-label">目标类别加成</h4>
              {shown.length > 0 ? (
                <dl className="bd-attack-targets">
                  {shown.map(({ classId, label, amount }, index) => (
                    <div key={index}>
                      <dt>
                        {label ?? (
                          <>
                            类别 <span className="num nw">{classId}</span>
                          </>
                        )}
                        {!label && <span className="bd-kicker">名称未核实</span>}
                      </dt>
                      <dd className="num nw">{amount > 0 ? `+${amount}` : amount}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="bd-kicker">{extraStatus}</p>
              )}
            </div>
          </div>
          <p className="bd-kicker">这里未计目标护甲或驻军效果；类别加成不是实际伤害。</p>
        </>
      )}
    </section>
  );
}
