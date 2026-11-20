import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { civByEn } from '../../data';
import { armySupplyResearch, projectArmySupply, type ArmySupplyRow, type ArmySupplySettings } from '../../domain/armySupply';
import { BUILDING_LIMIT, calculateProduction, type ProductionContext } from '../../domain/production';
import { AGE_ZH } from '../../domain/ratings';
import { PRODUCTION_MODE_LABELS } from '../../domain/productionMode';
import { UnitIcon } from '../../shared/ui/art';
import { CalcDock } from '../../shared/ui/CalcDock';
import { ToolPageHeader } from '../../shared/ui/ToolPageHeader';
import { ToolFooter, ToolGrid } from '../../shared/ui/ToolShell';
import { Loading } from '../../shared/ui/widgets';
import { useShareLink } from '../../shared/ui/useShareLink';
import { decodeArmyCost } from './armyCostCodec';
import { decodeArmySupply, encodeArmySupply, SUPPLY_COUNT_INPUT_LIMIT, SUPPLY_FARM_DISTANCES, SUPPLY_WALK_DISTANCES } from './armySupplyCodec';
import { ProductionPageTop } from './ProductionModeNav';
import { formatProductionNumber as num, ProductionResources } from './ProductionResources';
import './armySupply.css';

type SupplyProjection = ReturnType<typeof projectArmySupply>;

export default function ArmySupply({ context, loadingError }: { context: ProductionContext | null; loadingError: boolean }) {
  const { search } = useLocation();
  const decoded = useMemo(() => decodeArmySupply(search), [search]);
  if (decoded.kind === 'valid' && context) return <SupplyPlanner context={context} sourceQuery={decoded.sourceQuery} settings={decoded.settings} />;
  const returnTo = decoded.kind === 'valid' ? '/production?' + decoded.sourceQuery : decoded.returnTo;
  return (
    <section className="pane production-page" data-testid="army-supply-page">
      <ToolPageHeader title={PRODUCTION_MODE_LABELS.legacy} top={<ProductionPageTop />} />
      {returnTo && <SupplyReturn to={returnTo} />}
      {decoded.kind === 'invalid' ? (
        <p role="alert">{decoded.reason}</p>
      ) : loadingError ? (
        <div role="alert">
          <p>生产资料加载失败。原账本和供给设置已保留。</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            刷新重试
          </button>
        </div>
      ) : (
        <>
          <Loading />
          <p role="status">正在加载持续生产资料。</p>
        </>
      )}
    </section>
  );
}

function SupplyReturn({ to }: { to: string }) {
  return (
    <Link className="community-tool-entry" to={to} state={{ fromArmySupply: true }}>
      返回原阵容账本
    </Link>
  );
}

function SupplyPlanner({ context, sourceQuery, settings }: { context: ProductionContext; sourceQuery: string; settings: ArmySupplySettings }) {
  const location = useLocation();
  const navigate = useNavigate();
  const source = useMemo(() => decodeArmyCost(sourceQuery).config!, [sourceQuery]);
  const research = useMemo(() => armySupplyResearch(context, source), [context, source]);
  const projected = projectArmySupply(context, source, settings, research);
  const result = projected.config && calculateProduction(context, projected.config);
  const complete = result && !result.errors.length;
  const share = useShareLink({ stateKey: location.search });
  const update = (next: ArmySupplySettings) => navigate({ pathname: '/production', search: '?' + encodeArmySupply(source, next) }, { replace: true });
  const editRow = (index: number, patch: Partial<ArmySupplyRow>) =>
    update({ ...settings, rows: settings.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const editResearch = (stance: ArmySupplySettings['stance'], planned = settings.planned) => {
    const next = { ...settings, stance, planned };
    const checked = projectArmySupply(context, source, next, research);
    update({
      ...next,
      rows: next.rows.map((row, index) => {
        const { buildings, availableBuilding } = checked.rows[index]!;
        return !buildings.length || (row.building > 0 && !availableBuilding) ? { building: 0, count: '', confirmed: false } : row;
      }),
    });
  };
  const copy = () => {
    const url = new URL(window.location.href);
    url.hash = '/production?' + encodeArmySupply(source, settings);
    void share.copy(url.href);
  };
  const civ = civByEn(source.civ)!;
  return (
    <section className="pane production-page army-supply" data-testid="army-supply-page">
      <ToolPageHeader
        title={PRODUCTION_MODE_LABELS.legacy}
        top={<ProductionPageTop />}
        description="在原阵容的基础上确认科技口径、形态和专用生产建筑。"
        dock={<CalcDock note={share.status} resultId="army-supply-result-title" actions={[{ label: '复制方案链接', icon: 'copy', onClick: copy }]} />}
      />
      <div className="supply-source">
        <SupplyReturn to={'/production?' + sourceQuery} />
        <span>
          {civ.zh} · {AGE_ZH[Number(source.age)]}
        </span>
      </div>
      {share.manualLink && (
        <label className="production-manual">
          方案链接
          <input readOnly value={share.manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <ToolGrid>
        <section className="production-demands" aria-labelledby="army-supply-rows-title">
          <h2 id="army-supply-rows-title">逐行设置生产建筑</h2>
          <p className="note">
            来源数量供对照。建筑选项只列供给模型确认的地点。每行确认原形态和专用生产建筑，手动填写 <span className="num nw">0–{BUILDING_LIMIT} 座</span>，
            <span className="num nw">0 座</span>
            暂停本行。
          </p>
          {projected.rows.map((row, index) => (
            <SupplyRow
              key={index}
              context={context}
              row={row}
              index={index}
              update={(patch) => editRow(index, patch)}
              perMinute={complete ? result.lines[index]?.perMinute : undefined}
            />
          ))}
        </section>
        <div className="production-conditions">
          <ResearchScope projected={projected} settings={settings} editResearch={editResearch} />
          <section className="production-summary" aria-labelledby="army-supply-result-title">
            <div className="production-section-title">
              <h2 id="army-supply-result-title" className="calc-dock-target" tabIndex={-1}>
                持续供给估算
              </h2>
              {complete && (
                <strong className="production-number" data-testid="production-total">
                  合计 {num(result.total)} 人
                </strong>
              )}
            </div>
            <div className="production-settings supply-distances">
              <label>
                木金石单程距离
                <select value={settings.walk} onChange={(event) => update({ ...settings, walk: Number(event.target.value) })}>
                  {SUPPLY_WALK_DISTANCES.map((distance) => (
                    <option key={distance} value={distance}>
                      {distance} 格
                    </option>
                  ))}
                </select>
              </label>
              <label>
                农田单程距离
                <select value={settings.farm} onChange={(event) => update({ ...settings, farm: Number(event.target.value) })}>
                  {SUPPLY_FARM_DISTANCES.map((distance) => (
                    <option key={distance} value={distance}>
                      {distance} 格
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {complete ? (
              <>
                <p className="supply-result-scope">{settings.stance === 'plan' ? '计划情景 · 按所选研究完成后估算' : '当前口径 · 按已确认研究与形态估算'}</p>
                <ProductionResources resources={result.resources} />
                {result.warnings.length > 0 && (
                  <ul className="production-warnings">
                    {result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p role="status">暂不显示完整供给。请核对科技口径与每行生产条件。</p>
                {result && (
                  <ul className="production-errors">
                    {result.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      </ToolGrid>
      <ToolFooter>
        <p>本页估算稳态每分钟开销与采集供给。每行建筑专用于该单位，按资源分别向上取整。</p>
      </ToolFooter>
    </section>
  );
}

function ResearchScope({
  projected,
  settings,
  editResearch,
}: {
  projected: SupplyProjection;
  settings: ArmySupplySettings;
  editResearch: (stance: ArmySupplySettings['stance'], planned?: number[]) => void;
}) {
  const { completed, planned, automatic } = projected.research;
  return (
    <section className="production-summary" aria-labelledby="army-supply-research-title">
      <h2 id="army-supply-research-title">确认科技口径</h2>
      <fieldset className="production-tech-group">
        <legend>供给方案的研究状态</legend>
        <label className="production-checkbox">
          <input type="radio" name="army-supply-stance" checked={settings.stance === 'current'} onChange={() => editResearch('current')} />
          仅按当前已完成研究
        </label>
        <label className="production-checkbox">
          <input type="radio" name="army-supply-stance" checked={settings.stance === 'plan'} onChange={() => editResearch('plan')} />
          按所选计划研究完成后估算
        </label>
        {projected.researchIssue && (
          <p className="note" role="status">
            {projected.researchIssue}
          </p>
        )}
        {settings.stance === 'plan' && projected.invalidPlan && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              editResearch(
                'plan',
                settings.planned.filter((id) => projected.availablePlan.includes(id)),
              )
            }
          >
            清除不可用计划研究
          </button>
        )}
      </fieldset>
      <h3>账本 · 已完成</h3>
      {completed.length ? (
        <ul>
          {completed.map(({ entry, supported }) => (
            <li key={entry.key}>
              {entry.name} · {supported ? '可带入当前科技条件' : nonAppliedResearch(entry.status)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="note">原账本暂无已完成研究。</p>
      )}
      <h3>账本 · 计划研究</h3>
      {planned.length ? (
        <>
          <p className="note">计划项仅在选定未来口径并勾选后参与估算。形态升级由逐行确认。</p>
          {planned.map(({ entry, supported }) => {
            const id = entry.id;
            return supported && id !== null ? (
              <label key={entry.key} className="production-checkbox">
                <input
                  type="checkbox"
                  disabled={settings.stance !== 'plan'}
                  checked={settings.stance === 'plan' && settings.planned.includes(id)}
                  onChange={(event) => editResearch('plan', event.target.checked ? [...settings.planned, id] : settings.planned.filter((item) => item !== id))}
                />
                纳入{entry.name}
              </label>
            ) : (
              <p className="note" key={entry.key}>
                {entry.name} · {nonAppliedResearch(entry.status)}
              </p>
            );
          })}
        </>
      ) : (
        <p className="note">原账本暂无计划研究。</p>
      )}
      {automatic.length > 0 && <p className="note">原账本自动项：{automatic.map((entry) => entry.name).join('、')}。供给按现有模型判定自动效果。</p>}
    </section>
  );
}

function nonAppliedResearch(status: 'done' | 'inferred-done' | 'free' | 'planned' | 'invalid'): string {
  return status === 'invalid' ? '账本研究待核对，供给不计入' : '供给模型无可直接带入的设置';
}

function SupplyRow({
  context,
  row,
  index,
  update,
  perMinute,
}: {
  context: ProductionContext;
  row: SupplyProjection['rows'][number];
  index: number;
  update: (patch: Partial<ArmySupplyRow>) => void;
  perMinute?: number;
}) {
  const { original, setup, unit, buildings, issue, availableBuilding, validCount } = row;
  const label = `第 ${index + 1} 行`;
  const id = `army-supply-row-${index}`;
  const sourceCount = /^\d+$/.test(original.qty) && Number(original.qty) >= 1 && Number(original.qty) <= 1000 ? Number(original.qty) : null;
  return (
    <article className="production-row supply-row" aria-labelledby={id + '-title'} data-testid="army-supply-row">
      <div className="supply-unit">
        {unit && <UnitIcon u={unit} />}
        <h3 id={id + '-title'}>
          <span className="num nw">{label}</span> ·{' '}
          {unit?.zh ??
            (original.unit ? (
              <>
                未知兵种形态 <span className="num nw">{original.unit}</span>
              </>
            ) : (
              '待选形态'
            ))}
        </h3>
        {sourceCount === null ? (
          <small className="note">来源数量待核对</small>
        ) : (
          <small className="note">
            来源 <span className="num nw">{sourceCount} 名</span>
          </small>
        )}
      </div>
      <label className="production-checkbox">
        <input
          type="checkbox"
          aria-label={label + ' 确认形态'}
          disabled={!buildings.length}
          checked={buildings.length > 0 && setup.confirmed}
          onChange={(event) => update({ confirmed: event.target.checked })}
        />
        确认该具体形态可训练
      </label>
      <div className="production-row-controls">
        <label>
          专用生产建筑
          <select
            aria-label={label + ' 专用生产建筑'}
            aria-describedby={issue ? id + '-issue' : undefined}
            disabled={!buildings.length}
            value={availableBuilding ? setup.building : ''}
            onChange={(event) => update({ building: Number(event.target.value) })}
          >
            <option value="">请选择建筑</option>
            {buildings.map((building) => (
              <option key={building} value={building}>
                {context.core.buildingById[building]?.zh}
              </option>
            ))}
          </select>
        </label>
        <label>
          建筑座数
          <input
            type="text"
            inputMode="numeric"
            maxLength={SUPPLY_COUNT_INPUT_LIMIT}
            aria-label={label + ' 建筑座数'}
            aria-describedby={issue ? id + '-issue' : undefined}
            aria-invalid={!!setup.count && !validCount}
            disabled={!buildings.length}
            value={setup.count}
            onChange={(event) => update({ count: event.target.value })}
          />
        </label>
      </div>
      {issue ? (
        <p className="note" id={id + '-issue'}>
          {issue}
        </p>
      ) : (
        <p className="note">本行生产条件已确认。</p>
      )}
      {perMinute !== undefined && (
        <p>
          产量{' '}
          <strong className="num nw" data-testid="army-supply-rate">
            {num(perMinute)} 名 / 分钟
          </strong>
        </p>
      )}
    </article>
  );
}
