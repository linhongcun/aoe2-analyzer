import type { ReactNode } from 'react';
import type { explainGeneralGarrison, GeneralGarrisonResult } from '../../../domain/garrisonGeneral';
import { FEMALE_VILLAGER_ID, VILLAGER_UNIT_ID } from '../../../domain/gameIds';
import { Icon } from '../../../shared/ui/Icon';

type ExplainedResult = ReturnType<typeof explainGeneralGarrison>;
type GarrisonRowResult = ExplainedResult['rows'][number];

const sourceLabels: Record<GarrisonRowResult['powerSource'], string> = {
  fixed: '固定火力',
  'pierce-plus-fixed': '攻速折算 + 固定火力',
  pierce: '穿刺攻速折算',
  'multi-projectile': '多弹丸模型估算',
  relic: '强化教堂圣物规则',
  'zero-factor': '不增加弹丸',
  storage: '不增加弹丸',
  unknown: '待核实',
};

const attackSources = { secondary: '副弹丸', primary: '主弹丸', building: '建筑面板' };
const formatPower = (power: number) => Number(power.toFixed(2));

function formulaRelation(displayed: number, fromDisplayedOperands: number, modelValue: number) {
  return Math.max(Math.abs(displayed - fromDisplayedOperands), Math.abs(displayed - modelValue)) < 1e-10 ? '=' : '≈';
}

export function GarrisonNumber({ children }: { children: ReactNode }) {
  return <span className="num nw">{children}</span>;
}

function Power({ value }: { value: number | null }) {
  return value === null ? '待核实' : <GarrisonNumber>{formatPower(value)}</GarrisonNumber>;
}

function Contribution({ row }: { row: GarrisonRowResult }) {
  return (
    <>
      单兵贡献{' '}
      <strong>
        <Power value={row.powerEach} />
      </strong>{' '}
      · 本行小计{' '}
      <strong>
        <Power value={row.powerTotal} />
      </strong>
      {row.powerSource === 'zero-factor' ? (
        <>
          （火力系数为 <GarrisonNumber>0</GarrisonNumber>）
        </>
      ) : (
        row.powerEach !== null && (
          <>
            （<Power value={row.powerEach} /> × <GarrisonNumber>{row.countValue}</GarrisonNumber>）
          </>
        )
      )}
    </>
  );
}

export function GarrisonContributionBar({ row }: { row: GarrisonRowResult }) {
  const tone = row.powerSource === 'unknown' ? 'warn' : row.powerEach === 0 ? 'neutral' : 'link';
  return (
    <div className="garrison-contribution">
      <div>
        <Contribution row={row} />
      </div>
      <span className={`garrison-badge garrison-badge-${tone}`}>{sourceLabels[row.powerSource]}</span>
    </div>
  );
}

function ContributionTable({ rows, church }: { rows: GarrisonRowResult[]; church: boolean }) {
  return (
    <table className="garrison-contribution-table" aria-label="各单位驻军火力">
      <thead>
        <tr>
          <th scope="col">单位</th>
          <th scope="col">数量</th>
          <th scope="col">单兵</th>
          <th scope="col">小计</th>
          <th scope="col">来源</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.unitId}-${row.entry}`}>
            <th scope="row">
              {row.zh}
              {church && (row.entry === 'deposit' ? '（存放）' : [VILLAGER_UNIT_ID, FEMALE_VILLAGER_ID].includes(row.unitId) && '（进入）')}
            </th>
            <td>
              <GarrisonNumber>{row.countValue}</GarrisonNumber>
            </td>
            <td>
              <Power value={row.powerEach} />
            </td>
            <td>
              <Power value={row.powerTotal} />
            </td>
            <td>
              {row.powerSource === 'zero-factor' ? (
                <>
                  系数为 <GarrisonNumber>0</GarrisonNumber>，不加弹丸
                </>
              ) : (
                sourceLabels[row.powerSource]
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type ProjectileLabels = { projectile: '炮弹' | '箭矢'; shortProjectile: '发' | '箭' };

export function GarrisonFiringStatus({
  result,
  projectile,
  shortProjectile,
  singleVillager,
}: { result: GeneralGarrisonResult; singleVillager: boolean } & ProjectileLabels) {
  const { totalProjectiles, usedSlots, maxProjectiles, singleUnitId, nextAt, rows } = result;
  return (
    <p className="garrison-status" role="status">
      {totalProjectiles === null ? (
        '当前组合存在未核实机制，保留容量结果，暂不显示弹丸总数。'
      ) : usedSlots === 0 ? (
        totalProjectiles === 0 ? (
          '空驻军时不会开火。'
        ) : (
          <>
            可发射{' '}
            <GarrisonNumber>
              {totalProjectiles} {shortProjectile}
            </GarrisonNumber>
            （建筑自身基础{projectile === '炮弹' ? '炮弹' : '箭'}）。 空驻军不增加{projectile}，添加可贡献火力的单位后再按下方原理折算。
          </>
        )
      ) : (
        <>
          {totalProjectiles === 0 ? (
            '当前驻军组合不会使建筑开火。'
          ) : (
            <>
              可发射{' '}
              <GarrisonNumber>
                {totalProjectiles} {shortProjectile}
              </GarrisonNumber>
              。
            </>
          )}{' '}
          {totalProjectiles >= maxProjectiles ? (
            `已达${projectile}上限。`
          ) : singleUnitId === null ? (
            '混合驻军先合计贡献，再统一向下取整。'
          ) : nextAt === null ? (
            `当前容量内无法再增加${projectile}。`
          ) : (
            <>
              再驻{' '}
              <GarrisonNumber>
                {nextAt - usedSlots} 个{singleVillager ? '村民' : (rows[0]?.zh ?? '单位')}
              </GarrisonNumber>
              ，总驻军{' '}
              <GarrisonNumber>
                {nextAt} {singleVillager ? '人' : '个'}
              </GarrisonNumber>
              时会增加{projectile}。
            </>
          )}
        </>
      )}
    </p>
  );
}

function FiringSteps({ result, projectile, shortProjectile }: { result: ExplainedResult } & ProjectileLabels) {
  const {
    firingSteps: steps,
    garrisonPower,
    buildingPower,
    totalProjectiles,
    extraProjectiles,
    baseProjectiles,
    maxProjectiles,
    rows,
    usedSlots,
    capacity,
  } = result;
  if (!steps || garrisonPower === null || buildingPower === null || totalProjectiles === null || extraProjectiles === null) return null;
  const mixed = rows.length > 1;
  const atLimit = totalProjectiles >= maxProjectiles;
  const capped = steps.uncappedProjectiles > totalProjectiles;
  const zeroUnits = rows.filter((row) => row.countValue > 0 && row.powerEach === 0).map((row) => row.zh);
  const quotient = steps.quotient.toFixed(2);
  const fraction = Math.max(0, steps.quotient - steps.wholeSlots);
  const roundedPastSlot = Math.floor(Number(quotient)) !== steps.wholeSlots;
  const extension = result.nextAt === null ? null : result.nextAt - usedSlots;
  const cannotExtend = result.singleUnitId !== null && extension === null;
  const advice = atLimit ? (
    <strong>已达{projectile}上限</strong>
  ) : extension !== null ? (
    <strong>
      再驻 <GarrisonNumber>{extension} 个</GarrisonNumber>即增加
    </strong>
  ) : cannotExtend ? (
    <>
      {result.remainingSlots === 0 && (
        <strong>
          容量已满（
          <GarrisonNumber>
            {usedSlots} / {capacity}
          </GarrisonNumber>
          ）
        </strong>
      )}
      <p>当前容量内无法再增加{projectile}</p>
    </>
  ) : zeroUnits.length ? (
    <>
      <strong>
        含 <GarrisonNumber>0</GarrisonNumber> 火力占格
      </strong>
      <p>{[...new Set(zeroUnits)].join('、')}仅占容量、不贡献弹丸</p>
    </>
  ) : (
    <strong>混合驻军先合计贡献，再统一向下取整</strong>
  );
  return (
    <ol className="garrison-fire-steps" role="list">
      <li>
        <h4>
          第 <GarrisonNumber>1</GarrisonNumber> 步 · {mixed ? '先合计再除' : '除门槛'}
        </h4>
        <strong>
          <Power value={garrisonPower} /> ÷ <Power value={buildingPower} />{' '}
          {formulaRelation(Number(quotient), formatPower(garrisonPower) / formatPower(buildingPower), steps.quotient)}{' '}
          <GarrisonNumber>{quotient}</GarrisonNumber>
        </strong>
        <p>{mixed ? '各行小计先相加，不逐行单独取整' : `驻军总火力除以当前单${shortProjectile}门槛`}</p>
      </li>
      <li>
        <h4>
          第 <GarrisonNumber>2</GarrisonNumber> 步 · 向下取整
        </h4>
        <strong>
          向下取整{' '}
          <GarrisonNumber>
            {steps.wholeSlots} {steps.primaryMinimum ? '档' : shortProjectile}
          </GarrisonNumber>
        </strong>
        <p>
          {roundedPastSlot ? (
            '按未舍入的商和模型精度取整'
          ) : mixed ? (
            <>
              余数 <Power value={fraction} /> 不进位
            </>
          ) : (
            `不满一${shortProjectile}的部分不进位`
          )}
        </p>
      </li>
      <li>
        <h4>
          第 <GarrisonNumber>3</GarrisonNumber> 步 · 叠基础与上限
        </h4>
        <strong>
          基础 <GarrisonNumber>{baseProjectiles}</GarrisonNumber> + 驻军 <GarrisonNumber>{extraProjectiles}</GarrisonNumber> ={' '}
          <GarrisonNumber>
            {totalProjectiles} {shortProjectile}
          </GarrisonNumber>
        </strong>
        {steps.primaryMinimum && (
          <p>
            主弹丸保留最低 <GarrisonNumber>1 {shortProjectile}</GarrisonNumber>，超过基础的部分计为驻军增加。
          </p>
        )}
        <p>
          {capped ? (
            <>
              理论{' '}
              <GarrisonNumber>
                {steps.uncappedProjectiles} {shortProjectile}
              </GarrisonNumber>
              ，受本建筑{' '}
              <GarrisonNumber>
                {maxProjectiles} {shortProjectile}
              </GarrisonNumber>
              上限截断
            </>
          ) : (
            <>
              {atLimit ? '达到' : '未触及'}本建筑{' '}
              <GarrisonNumber>
                {maxProjectiles} {shortProjectile}
              </GarrisonNumber>
              上限
            </>
          )}
        </p>
      </li>
      <li>
        <h4>
          第 <GarrisonNumber>4</GarrisonNumber> 步 · 配置判断
        </h4>
        {advice}
      </li>
    </ol>
  );
}

export function GarrisonFirepower({
  result,
  building,
  projectile,
  shortProjectile,
}: {
  result: ExplainedResult;
  building: { id: number; zh: string };
} & ProjectileLabels) {
  const { garrisonPower, buildingPower, buildingThreshold, firingSteps, usedSlots, capacity, remainingSlots, rows, baseProjectiles, maxProjectiles } = result;
  const church = building.id === 1806;
  const unknownUnits = rows.filter((row) => row.countValue > 0 && row.powerEach === null).map((row) => row.zh);
  const empty = usedSlots === 0;
  const mixed = rows.length > 1;
  const attackSource = buildingThreshold ? attackSources[buildingThreshold.source] : null;
  const next = empty ? null : firingSteps?.nextThreshold;
  const shortfall = next && garrisonPower !== null ? next.power - garrisonPower : null;
  const badge =
    garrisonPower === null ? (
      <>
        含未核实单位 · 不按 <GarrisonNumber>0</GarrisonNumber> 计入
      </>
    ) : empty ? (
      <>
        空驻军（<GarrisonNumber>0 格</GarrisonNumber>已占）
      </>
    ) : mixed ? (
      '混编合计 · 统一向下取整'
    ) : church ? (
      '强化教堂 · 圣物与村民合计'
    ) : attackSource ? (
      `${building.zh} · ${attackSource}${projectile === '炮弹' ? '（炮弹）' : ''}口径`
    ) : (
      '门槛待核实'
    );

  return (
    <section className="garrison-firepower" aria-label="驻军火力计算原理">
      <div className="garrison-fire-heading">
        <h3>
          <Icon name="calculator" /> 驻军火力计算原理
        </h3>
        <span className={`garrison-badge garrison-badge-${garrisonPower === null ? 'warn' : 'neutral'}`}>{badge}</span>
      </div>
      <p className="garrison-fire-note">
        <GarrisonNumber>DE {__DATA_SOURCES__.patch.build}</GarrisonNumber> 驻军火力模型数值，用于换算驻军增加的{projectile}数，不是对敌单位的实际伤害。
        读数最多显示两位小数，取整按模型原值计算。
        {rows.some((row) => row.powerSource === 'multi-projectile') && '多弹丸单位按公开公式估算。'}
        {church && (
          <>
            强化教堂空驻军不开火（基础{' '}
            <GarrisonNumber>
              {baseProjectiles} {shortProjectile}
            </GarrisonNumber>
            ），圣物与村民合计上限{' '}
            <GarrisonNumber>
              {maxProjectiles} {shortProjectile}
            </GarrisonNumber>
            。
          </>
        )}
      </p>
      <div className="garrison-fire-metrics">
        <div>
          <h4>驻军合计火力</h4>
          <strong className="garrison-fire-value">
            <Power value={garrisonPower} />
          </strong>
          {empty ? (
            <p>当前未驻扎任何单位，不产生额外{projectile}。</p>
          ) : mixed ? (
            <ContributionTable rows={rows} church={church} />
          ) : (
            rows[0] && (
              <p>
                {rows[0].zh}
                {rows[0].powerEach === null || rows[0].powerTotal === null ? (
                  <>
                    （<GarrisonNumber>{rows[0].countValue} 个</GarrisonNumber>）：
                    <Contribution row={rows[0]} />
                  </>
                ) : (
                  <>
                    （{sourceLabels[rows[0].powerSource]}）：
                    <Power value={rows[0].powerEach} /> ×{' '}
                    <GarrisonNumber>
                      {rows[0].countValue} {rows[0].entry === 'deposit' ? '个' : '人'}
                    </GarrisonNumber>{' '}
                    {formulaRelation(formatPower(rows[0].powerTotal), formatPower(rows[0].powerEach) * rows[0].countValue, rows[0].powerTotal)}{' '}
                    <Power value={rows[0].powerTotal} />
                  </>
                )}
              </p>
            )
          )}
        </div>
        <div>
          <h4>{projectile === '炮弹' ? '单发炮弹火力门槛' : '单箭火力门槛'}</h4>
          <strong className="garrison-fire-value">
            <Power value={buildingThreshold ? buildingPower : null} />
          </strong>
          {buildingThreshold && buildingPower !== null && (
            <p>
              本建筑按{attackSource}计算：{attackSource}攻击 <Power value={buildingThreshold.attack} /> ÷ 攻击间隔{' '}
              <GarrisonNumber>{formatPower(buildingThreshold.reload)} 秒</GarrisonNumber>{' '}
              {formulaRelation(formatPower(buildingPower), formatPower(buildingThreshold.attack) / formatPower(buildingThreshold.reload), buildingPower)}{' '}
              <Power value={buildingPower} />
            </p>
          )}
          {next && shortfall !== null && (
            <p className="garrison-fire-note">
              距下一{shortProjectile}：需合计火力 <Power value={next.power} />（<GarrisonNumber>{next.slots}</GarrisonNumber> × <Power value={buildingPower} />
              ），当前差{' '}
              {shortfall > 0 && formatPower(shortfall) === 0 ? (
                <>
                  小于 <GarrisonNumber>0.01</GarrisonNumber>
                </>
              ) : (
                <Power value={shortfall} />
              )}
              ；
              {remainingSlots ? (
                <>
                  剩余容量 <GarrisonNumber>{remainingSlots} 格</GarrisonNumber>。
                </>
              ) : (
                <>
                  容量已满（
                  <GarrisonNumber>
                    {usedSlots} / {capacity}
                  </GarrisonNumber>
                  ），无法再加人。
                </>
              )}
            </p>
          )}
        </div>
      </div>
      {garrisonPower === null ? (
        <p className="garrison-fire-unknown">
          因「{[...new Set(unknownUnits)].join('、')}」的驻军火力贡献尚未核实，驻军合计火力、驻军增加{projectile}与本轮总{projectile}
          数均保持「待核实」，绝不显示为 <GarrisonNumber>0</GarrisonNumber>；当前保留建筑容量（
          <GarrisonNumber>
            {usedSlots} / {capacity}
          </GarrisonNumber>
          ）与基础{' '}
          <GarrisonNumber>
            {baseProjectiles} {shortProjectile}
          </GarrisonNumber>
          读数。
        </p>
      ) : !buildingThreshold ? (
        <p className="garrison-fire-unknown">建筑火力门槛待核实，暂不能换算本轮{projectile}数。</p>
      ) : empty ? (
        <p className="garrison-fire-empty">
          推导：<GarrisonNumber>0</GarrisonNumber> ÷ <Power value={buildingPower} /> = <GarrisonNumber>0 {shortProjectile}</GarrisonNumber>，仅保留建筑自身基础{' '}
          <GarrisonNumber>
            {baseProjectiles} {shortProjectile}
          </GarrisonNumber>
          （本建筑上限{' '}
          <GarrisonNumber>
            {maxProjectiles} {shortProjectile}
          </GarrisonNumber>
          ）。
        </p>
      ) : (
        <FiringSteps result={result} projectile={projectile} shortProjectile={shortProjectile} />
      )}
    </section>
  );
}
