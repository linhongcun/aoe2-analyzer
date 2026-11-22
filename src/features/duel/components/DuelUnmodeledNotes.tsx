/**
 * issue 1296：单位 PK 统一未建模机制精准提示卡，整合既有 VgNotes 并按同侧已选科技去重。
 * 常规无特殊未建模机制且无瓦兰吉卫队条目时返回 null，零噪音。
 */
import { civByEn } from '../../../data';
import { collectDuelUnmodeled, type DuelUnmodeledInput } from '../../../domain/duelUnmodeled';
import { UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { prepareVgDisplay, VgNotes, type VgSide } from './VgNotes';
import '../unmodeled-notes.css';

export function DuelUnmodeledNotes({
  entries,
  vgSides,
  group = false,
  mixed = false,
}: {
  entries: readonly DuelUnmodeledInput[];
  vgSides: readonly VgSide[];
  group?: boolean;
  mixed?: boolean;
}) {
  const items = collectDuelUnmodeled(entries);
  const suppressedTechs = { a: new Set<string>(), b: new Set<string>() };
  for (const item of items) {
    for (const techEn of item.techEns) suppressedTechs[item.side].add(techEn);
  }
  const vg = prepareVgDisplay(vgSides, { group, suppressedTechs });

  if (!items.length && !vg.hasContent) return null;

  if (!items.length) {
    return (
      <aside className="pk-unmodeled" role="region" aria-label="本场未计入机制与专项说明">
        <VgNotes sides={vgSides} group={group} suppressedTechs={suppressedTechs} />
      </aside>
    );
  }

  const subtitle = vg.hasContent
    ? '已合并展示本场未建模机制与瓦兰吉卫队专项说明（同项去重，不重复刷屏）：'
    : mixed
      ? '混编按参战兵种去重汇总；无特殊机制的常规兵种不产生冗余告警：'
      : '以下参战单位包含当前模拟未建模的核心战斗机制，请结合机制差异判断实战克制：';

  return (
    <aside className="pk-unmodeled is-warn" data-t="pk-unmodeled" role="region" aria-label="本场未计入机制与专项说明">
      <div className="pk-unm-head">
        <Icon name="triangle-alert" className="ic" />
        <div className="pk-unm-head-copy">
          <h3 className="pk-unm-title">本场存在未计入机制，结果可能明显偏离实战</h3>
          <p className="pk-unm-sub">{subtitle}</p>
        </div>
      </div>
      <div className="pk-unm-list">
        {items.map((item) => {
          const civZh = civByEn(item.civ)?.zh ?? item.civ;
          const details = [...new Set(item.mechanisms.map((m) => m.detail))].join(' ');
          return (
            <div key={`${item.side}-${item.unit.id}`} className="pk-unm-item" data-t="pk-unmodeled-item" data-side={item.side} data-unit={item.unit.id}>
              <div className="pk-unm-row">
                <span className={`pk-unm-side is-${item.side}`}>{item.badge}</span>
                <span className="pk-unm-unit">
                  <UnitIcon u={item.unit} />
                  <span>
                    {civZh} · {item.unit.zh}
                  </span>
                </span>
                <span className="pk-unm-pills">
                  {item.mechanisms.map((m, i) => (
                    <span key={`${m.kind}-${m.techId ?? i}`} className="pk-unm-pill" data-kind={m.kind}>
                      {m.pill}
                    </span>
                  ))}
                </span>
              </div>
              <p className="pk-unm-desc">{details}</p>
            </div>
          );
        })}
      </div>
      {vg.hasContent && <VgNotes sides={vgSides} group={group} embedded suppressedTechs={suppressedTechs} />}
    </aside>
  );
}
