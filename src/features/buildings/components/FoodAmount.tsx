import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import {
  FARM_BUILDING_ID,
  FARM_FOOD_TECH_IDS,
  FISH_TRAP_BUILDING_ID,
  UGC_RESOURCES_CHECKED,
  UGC_RESOURCES_HREF,
  farmFoodAmount,
  fishTrapFoodAmount,
  formatFoodAmount,
  type FarmFoodAmount,
  type FishTrapFoodAmount,
  type FoodAmountStep,
  type FoodEcoSlice,
} from '../foodAmount';

function Amount({ value, prefix = '' }: { value: number | null; prefix?: string }) {
  return <span className="detail-number nw">{value == null ? '待确认' : `${prefix}${formatFoodAmount(value)}`}</span>;
}

function TechName({ id }: { id: string }) {
  const core = useCore();
  return <>{core?.techById[Number(id)]?.zh ?? id}</>;
}

function SourcePatch({ patch }: { patch: string | null }) {
  return patch ? (
    <>
      {' '}
      · <span className="detail-number nw">{patch}</span>
    </>
  ) : (
    <> · 版本待确认</>
  );
}

function FarmRow({ step }: { step: FoodAmountStep }) {
  return (
    <tr data-step={step.key}>
      <th scope="row">{step.techId ? <TechName id={step.techId} /> : '基准'}</th>
      <td data-field="total">
        <Amount value={step.total} />
      </td>
      <td data-field="add">{step.techId ? <Amount value={step.add} prefix="+" /> : '无'}</td>
    </tr>
  );
}

function FarmTable({ steps, marker }: { steps: FoodAmountStep[]; marker: string }) {
  return (
    <table className="stat" data-t={marker}>
      <thead>
        <tr>
          <th scope="col">阶段</th>
          <th scope="col">满额食物</th>
          <th scope="col">本级增加</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step) => (
          <FarmRow key={step.key} step={step} />
        ))}
      </tbody>
    </table>
  );
}

function FarmFood({ data }: { data: FarmFoodAmount }) {
  const chinese = civByEn('Chinese')?.zh ?? 'Chinese';
  return (
    <DetailSection title="食物总量">
      <div data-t="farm-food">
        <p>一块新农田在磨坊科技之后的满额食物。表内只累加资源 36。已有农田提供的食物数量较少。</p>
        <p className="note">不含采集速率，也不含其它文明或团队加成。这里不做补种或配田。</p>
        <h3>通用新田</h3>
        <FarmTable steps={data.steps} marker="farm-food-generic" />
        <h3>{chinese}</h3>
        {data.chineseFromUgc ? (
          <>
            <p className="note" data-t="farm-food-chinese-note">
              {chinese}新田使用另一条起始量，再累加同一组磨坊科技。起始量来自 UGC 资源 36；eco.json 的 civEco.Chinese 没有导出这条起始行。
            </p>
            <FarmTable steps={data.chineseSteps} marker="farm-food-chinese" />
          </>
        ) : (
          <p data-t="farm-food-chinese-note">中国队起始量待确认。</p>
        )}
        <p className="note">重犁另有携带量，不在这张表里。</p>
        <p className="note" data-t="farm-food-source">
          来源：通用基准与{chinese}起始见 UGC 资源表（核对日期 <span className="detail-number nw">{UGC_RESOURCES_CHECKED}</span>
          ）资源 <span className="detail-number nw">36</span>
          。磨坊科技增量来自 eco.json ecoTechs
          <SourcePatch patch={data.patch} />。
        </p>
        <div className="community-tool-row">
          {FARM_FOOD_TECH_IDS.map((id) => (
            <Link key={id} className="community-tool-entry" to={`/tech/${id}`}>
              <TechName id={id} />
            </Link>
          ))}
          <a className="community-tool-entry" href={UGC_RESOURCES_HREF} target="_blank" rel="noreferrer">
            UGC 资源表
          </a>
          <Link className="community-tool-entry" to="/production">
            持续生产
          </Link>
        </div>
        <p className="note">持续生产不计磨坊科技的农田食物容量。</p>
      </div>
    </DetailSection>
  );
}

function FishTrapFood({ data }: { data: FishTrapFoodAmount }) {
  const malay = civByEn('Malay')?.zh ?? 'Malay';
  return (
    <DetailSection title="食物总量">
      <div data-t="fish-trap-food">
        <p>养鱼场提供的食物总量。这里不算采集速率，也不含其它文明加成。</p>
        <table className="stat" data-t="fish-trap-food-table">
          <thead>
            <tr>
              <th scope="col">范围</th>
              <th scope="col">食物总量</th>
            </tr>
          </thead>
          <tbody>
            <tr data-step="base">
              <th scope="row">通用</th>
              <td data-field="total">
                <Amount value={data.base} />
              </td>
            </tr>
            <tr data-step="malay">
              <th scope="row">{malay}</th>
              <td data-field="total">
                <Amount value={data.malay?.value ?? null} />
              </td>
            </tr>
          </tbody>
        </table>
        {data.malay?.triple ? (
          <p className="note" data-t="fish-trap-triple">
            {malay}把资源 <span className="detail-number nw">88</span> 直接设为上表数值（civEco tech <span className="detail-number nw">{data.malay.tech}</span>
            ），等于通用基准的 <span className="detail-number nw">3</span> 倍。
          </p>
        ) : data.malay ? (
          <p className="note" data-t="fish-trap-malay">
            {malay}把资源 <span className="detail-number nw">88</span> 直接设为上表数值（civEco tech <span className="detail-number nw">{data.malay.tech}</span>
            ）。
          </p>
        ) : (
          <p className="note" data-t="fish-trap-malay">
            马来食物总量待确认。
          </p>
        )}
        <p className="note" data-t="fish-trap-source">
          来源：通用基准见 UGC 资源表（核对日期 <span className="detail-number nw">{UGC_RESOURCES_CHECKED}</span>
          ）资源 <span className="detail-number nw">88</span>。{malay}见 eco.json civEco.Malay
          <SourcePatch patch={data.patch} />。
        </p>
        <div className="community-tool-row">
          <a className="community-tool-entry" href={UGC_RESOURCES_HREF} target="_blank" rel="noreferrer">
            UGC 资源表
          </a>
          <Link className="community-tool-entry" to="/civ/Malay">
            {malay}
          </Link>
        </div>
      </div>
    </DetailSection>
  );
}

/** 只在农田和养鱼场详情挂出。其它建筑不显示。 */
export function FoodAmount({ buildingId, source }: { buildingId: number; source?: FoodEcoSlice }) {
  if (buildingId === FARM_BUILDING_ID) return <FarmFood data={farmFoodAmount(source)} />;
  if (buildingId === FISH_TRAP_BUILDING_ID) return <FishTrapFood data={fishTrapFoodAmount(source)} />;
  return null;
}
