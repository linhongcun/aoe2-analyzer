/**
 * issue 1296：单位 PK 统一未建模机制精准提示卡，整合既有 VgNotes 并按同侧已选科技去重。
 * 常规无特殊未建模机制且无瓦兰吉卫队条目时返回 null，零噪音。
 */
import { civByEn } from '../../../data';
import { collectDuelUnmodeled, type DuelUnmodeledInput, type UnmodeledMechanism } from '../../../domain/duelUnmodeled';
import { UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { prepareVgDisplay, VgNotes, type VgSide } from './VgNotes';
import '../unmodeled-notes.css';

export type DuelUnmodeledNoteEntry = DuelUnmodeledInput & {
  /** issue 1322：目录准确度 0% 的特殊远程单位，本场按每击命中主目标估算 */
  assumeHit?: boolean;
};

function renderCoexistingMechanism(m: UnmodeledMechanism, key: string) {
  if (m.kind === 'multi-projectile') {
    return (
      <p key={key} className="pk-unm-desc">
        <strong>额外弹丸未计入：</strong>
        额外弹丸造成的伤害未计入{m.techId ? `（${m.pill}）` : ''}；因此上面的上限只指主弹对单个目标。
      </p>
    );
  }
  if (m.kind === 'splash') {
    return (
      <p key={key} className="pk-unm-desc">
        <strong>波及伤害未计入：</strong>
        落点周围受波及的伤害未计入{m.techId ? `（${m.pill}）` : ''}；因此上面的上限只指主弹对单个目标。
      </p>
    );
  }
  return (
    <p key={key} className="pk-unm-desc">
      <strong>{m.pill}：</strong>
      {m.detail}
    </p>
  );
}

export function DuelUnmodeledNotes({
  entries,
  vgSides,
  group = false,
  usesContact,
  mixed = false,
}: {
  entries: readonly DuelUnmodeledNoteEntry[];
  vgSides: readonly VgSide[];
  group?: boolean;
  usesContact?: boolean;
  mixed?: boolean;
}) {
  const items = collectDuelUnmodeled(entries);
  const assumeHitKeys = new Set(entries.filter((e) => e.assumeHit).map((e) => `${e.side}:${e.unit.id}`));
  const coveredKeys = new Set(items.map((item) => `${item.side}:${item.unit.id}`));
  const standaloneAssumeHit: DuelUnmodeledNoteEntry[] = [];
  const seenStandalone = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.side}:${entry.unit.id}`;
    if (!entry.assumeHit || coveredKeys.has(key) || seenStandalone.has(key)) continue;
    seenStandalone.add(key);
    standaloneAssumeHit.push(entry);
  }

  const effectiveContact = usesContact ?? group;
  const vg = prepareVgDisplay(vgSides, { group, usesContact: effectiveContact });

  if (!items.length && !standaloneAssumeHit.length && !vg.hasContent) return null;

  const assumeHitCallout = standaloneAssumeHit.length > 0 && (
    <aside className="pk-callout is-info" data-t="pk-assume-hit" role="region" aria-label="按每击命中估算说明">
      {standaloneAssumeHit.map((entry) => (
        <p key={`${entry.side}-${entry.unit.id}`} className="pk-callout-title">
          <strong>{mixed ? `${entry.badge} · ${entry.unit.zh} · 按每击命中估算` : `${entry.badge} 方${entry.unit.zh} · 按每击命中估算`}</strong>
        </p>
      ))}
      <p className="pk-callout-body">
        目录准确度 <span className="num nw">0%</span> 不表示打不中。本场把每次主弹都算作命中主目标，这是主弹对单个目标的输出上限。
      </p>
    </aside>
  );

  if (!items.length) {
    return (
      <>
        {assumeHitCallout}
        {vg.hasContent && (
          <aside className="pk-unmodeled" role="region" aria-label="本场未计入机制与专项说明">
            <VgNotes sides={vgSides} group={group} usesContact={effectiveContact} />
          </aside>
        )}
      </>
    );
  }

  const subtitle = vg.hasContent
    ? '已合并展示本场未建模机制与瓦兰吉卫队专项说明（同项去重，不重复刷屏）：'
    : mixed
      ? '混编按参战兵种去重汇总；无特殊机制的常规兵种不产生冗余告警：'
      : '以下参战单位包含当前模拟未建模的核心战斗机制，请结合机制差异判断实战克制：';

  return (
    <>
      {assumeHitCallout}
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
            const hasAssumeHit = assumeHitKeys.has(`${item.side}:${item.unit.id}`);
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
                      <span key={`${m.kind}-${m.techId ?? 'base'}-${i}`} className="pk-unm-pill" data-kind={m.kind}>
                        {m.pill}
                      </span>
                    ))}
                  </span>
                </div>
                {hasAssumeHit ? (
                  <>
                    <p className="pk-unm-desc" data-t="pk-assume-hit-inline">
                      <strong>主弹 · 按每击命中估算：</strong>
                      目录准确度 <span className="num nw">0%</span> 不表示打不中。本场把每次主弹都算作命中主目标，这是主弹对单个目标的输出上限。
                    </p>
                    {item.mechanisms.map((m, i) => renderCoexistingMechanism(m, `${m.kind}-${m.techId ?? 'base'}-${i}`))}
                  </>
                ) : item.mechanisms.length === 1 ? (
                  <p className="pk-unm-desc">{item.mechanisms[0]!.detail}</p>
                ) : (
                  item.mechanisms.map((m, i) => (
                    <p key={`${m.kind}-${m.techId ?? 'base'}-${i}`} className="pk-unm-desc">
                      <strong>{m.pill}：</strong>
                      {m.detail}
                    </p>
                  ))
                )}
              </div>
            );
          })}
        </div>
        {vg.hasContent && <VgNotes sides={vgSides} group={group} usesContact={effectiveContact} embedded />}
      </aside>
    </>
  );
}
