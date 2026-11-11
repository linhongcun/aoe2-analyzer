import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { civByEn } from '../../../data';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import {
  BUILDING_REPAIR_RES,
  GEORGIANS_EN,
  REPAIR_ANCHOR,
  UGC_BUILDING_REPAIR_EN,
  UGC_REPAIR_CHECKED,
  UGC_REPAIR_HREF,
  UGC_UNIT_REPAIR_EN,
  UNIT_REPAIR_RES,
  formatRepairFactor,
  repairCostFacts,
  type RepairCostFacts,
} from '../repairCost';

function Num({ children, field }: { children: ReactNode; field?: string }) {
  return (
    <span className="detail-number num nw" data-field={field}>
      {children}
    </span>
  );
}

/**
 * 每座建筑的造价下都挂出。用既有 detail-cost-grid，不新增 table。
 * 城镇中心等页在 issue 338 里的表格基准是空列表。
 */
export function RepairCosts({ facts }: { facts?: RepairCostFacts }) {
  const location = useLocation();
  const data = facts ?? repairCostFacts();
  const civ = civByEn(GEORGIANS_EN)?.zh ?? GEORGIANS_EN;
  useEffect(() => {
    if (location.hash !== `#${REPAIR_ANCHOR}`) return;
    const timer = window.setTimeout(() => document.getElementById(REPAIR_ANCHOR)?.scrollIntoView({ block: 'start' }), 0);
    return () => window.clearTimeout(timer);
  }, [location.hash]);
  return (
    <div id={REPAIR_ANCHOR}>
      <DetailSection title="修复费用">
        <div data-t="repair-cost">
          <div data-t="repair-cost-main">
            <p>修理攻城单位和船、修理建筑分开计算，都按造价计算的比例。</p>
            <p className="note">这里不估算要花多少资源，也不把建造时间当成修复时间。</p>
            <dl className="detail-cost-grid" data-t="repair-cost-table">
              <div data-step="georgians">
                <dt>{civ}团队</dt>
                <dd>
                  <Num field="mul">{data.georgians ? data.georgians.text : '待确认'}</Num>
                </dd>
              </div>
              <div data-step="tc-gate">
                <dt>城镇中心与城门</dt>
                <dd>
                  <Num field="limit">待确认</Num>
                </dd>
              </div>
              <div data-step="rate">
                <dt>修复速率</dt>
                <dd>
                  <Num field="limit">待确认</Num>
                </dd>
              </div>
            </dl>
            <p data-t="repair-cost-pending">
              {data.georgians ? null : <>{civ}建筑修复倍率待确认。</>}
              {data.otherRepairEffects ? <>基准比例仍待确认。</> : <>基准比例待确认。</>}
              城镇中心、城门复合体倍率待确认。固定每分钟修复量待确认。
            </p>
          </div>
          <div data-t="repair-cost-source">
            <h3>来源</h3>
            <p className="note">
              修理攻城单位和船，看资源 <Num>{UNIT_REPAIR_RES}</Num>。修理建筑，看资源 <Num>{BUILDING_REPAIR_RES}</Num>。UGC 把这两项写成按造价计算的比例。
            </p>
            <dl className="detail-cost-grid">
              <div data-step="unit">
                <dt>单位修复</dt>
                <dd>
                  <Num field="res">{UNIT_REPAIR_RES}</Num>
                </dd>
              </div>
              <div data-step="building">
                <dt>建筑修复</dt>
                <dd>
                  <Num field="res">{BUILDING_REPAIR_RES}</Num>
                </dd>
              </div>
            </dl>
            <p className="note" data-t="repair-cost-ugc">
              资源 <Num>{UNIT_REPAIR_RES}</Num> 的 UGC 名称是 {UGC_UNIT_REPAIR_EN}，用于攻城单位和船。资源 <Num>{BUILDING_REPAIR_RES}</Num> 的 UGC 名称是{' '}
              {UGC_BUILDING_REPAIR_EN}，用于建筑。核对 <Num>{UGC_REPAIR_CHECKED}</Num>。这不是 DE 导出的基准比例。
            </p>
            <p className="note" data-t="repair-cost-georgians">
              {data.georgians ? (
                <>
                  {civ}团队加成把资源 <Num>{data.georgians.res}</Num> 乘以 <Num>{formatRepairFactor(data.georgians.v)}</Num>
                  。来源：eco.json civEco.{GEORGIANS_EN} 的 team 行，与 effects.json 同一条相乘对上
                  {data.patch ? (
                    <>
                      {' '}
                      · <Num>{data.patch}</Num>
                    </>
                  ) : (
                    <> · 版本待确认</>
                  )}
                  。
                </>
              ) : (
                <>{civ}建筑修复倍率待确认。</>
              )}
            </p>
            <p className="note" data-t="repair-cost-limits">
              {data.otherRepairEffects ? (
                <>
                  站内的资源 <Num>{UNIT_REPAIR_RES}</Num> 或 <Num>{BUILDING_REPAIR_RES}</Num> 效果对不上单独这一条团队相乘，基准比例仍待确认。
                </>
              ) : (
                <>
                  站内 eco.json 与 effects.json 没有资源 <Num>{UNIT_REPAIR_RES}</Num> 或 <Num>{BUILDING_REPAIR_RES}</Num>{' '}
                  的基准比例，也没有城镇中心、城门复合体倍率或固定每分钟修复量。
                </>
              )}
              城镇中心、城门复合体倍率待确认。固定每分钟修复量待确认。
            </p>
            <div className="community-tool-row">
              <Link className="community-tool-entry" to={`/civ/${GEORGIANS_EN}`}>
                {civ}
              </Link>
              <a className="community-tool-entry" href={UGC_REPAIR_HREF} target="_blank" rel="noreferrer">
                UGC 资源表
              </a>
            </div>
          </div>
        </div>
      </DetailSection>
    </div>
  );
}
