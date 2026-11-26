import { Fragment, type ReactNode } from 'react';
import type { FormationDecision, FormationEntityView } from '../../../domain/civFormations';
import { AGE_ZH, RES_ZH } from '../../../domain/ratings';
import type { SharedFormationClause } from '../../../domain/formationDedup';
import { RESOURCE_IDS } from '../../../domain/resourceValue';
import type { Cost } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';

const FORMATION_NUMBER = String.raw`[+\-−]?\d+(?:\.\d+)?`;
const FORMATION_UNIT = String.raw`(?:%|射程|近甲|穿甲|生命值|生命|护甲|伤害|HP|倍|点|格|个村民|个|名|人|兵|箭|座|条|次|秒|分钟|年|人口|食物|黄金|木材|石料|食|木|金|石|血|攻|甲|F|G|W|S|s)`;
const FORMATION_COUNTED_NOUN = String.raw`${FORMATION_NUMBER}\s*(?:个|名|只|座|条|辆)\s*[\u4e00-\u9fff]{1,10}?(?:兵|弩|炮|车|塔|民|船|象|士|手|侣|机|城|堡|从)(?=$|[\s,，。；：.!?！？、/（(]|(?:仅|显示|达到|在|仍|可|需|要|已|未|与|和|及|并|但|而|则|会|能|后|中|内|外|前|时|把|用|从|到|对|被|由|等|于|正在|保持|继续|保留))`;
const FORMATION_NUMBER_WITH_UNIT = String.raw`(?:${FORMATION_COUNTED_NOUN}|${FORMATION_NUMBER}(?:\s*${FORMATION_UNIT})?)`;
const FORMATION_HEX_HASH = String.raw`(?<![a-f\d])(?=[a-f\d]{12,40}(?![a-f\d]))(?=[a-f\d]{0,39}[a-f])[a-f\d]{12,40}(?![a-f\d])`;
const FORMATION_TOKENS = new RegExp(
  String.raw`(?<longHash>${FORMATION_HEX_HASH})|(?<protected>v\d+(?:\.\d+){1,3}|\d{4}-\d{2}-\d{2}|(?<![a-f\d])[a-f\d]{7,11}(?![a-f\d])|${FORMATION_NUMBER_WITH_UNIT}(?:\s*(?:/|:|–|—|-|至|\u2192)\s*${FORMATION_NUMBER_WITH_UNIT})*)`,
  'giu',
);

export function FormationText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(FORMATION_TOKENS)) {
    const token = match[0];
    const index = match.index;
    if (index > cursor) parts.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor, index)}</Fragment>);
    if (match.groups?.longHash) {
      parts.push(
        <span className="formation-hash" key={`hash-${index}`}>
          {token}
        </span>,
      );
    } else {
      parts.push(
        <span className="num nw" key={`numeric-${index}`}>
          {token}
        </span>,
      );
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) parts.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor)}</Fragment>);
  return parts;
}

export function FormationDecisionText({ action, decision }: { action: string; decision: FormationDecision }) {
  const lines = [
    ['条件', decision.condition],
    ['行动', action],
    ['同时', decision.also],
    ['例外', decision.exception],
  ] as const;
  return (
    <div className="formation-decision">
      {lines.map(([label, text]) =>
        text ? (
          <p key={label}>
            <b>{label}</b>
            <span>
              <FormationText text={text} />
            </span>
          </p>
        ) : null,
      )}
    </div>
  );
}

export function FormationCost({ cost, showZero = false }: { cost: Cost; showZero?: boolean }) {
  return RESOURCE_IDS.filter((resource) => {
    const amount = cost[resource] ?? -1;
    return amount > 0 || (showZero && amount === 0);
  }).map((resource) => (
    <span className="num nw" key={resource}>
      {cost[resource]} {RES_ZH[resource]}
    </span>
  ));
}

export function FormationFold({ id, label, closeLabel, children }: { id: string; label: string; closeLabel?: string; children: ReactNode }) {
  return (
    <details id={id} className="formation-fold" data-formation-fold>
      <summary>
        <Icon name="chevron-right" className="formation-fold-chev" />
        {closeLabel ? (
          <>
            <span className="formation-fold-closed">{label}</span>
            <span className="formation-fold-open">{closeLabel}</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </summary>
      <div className="formation-fold-body">{children}</div>
    </details>
  );
}

export function SharedFormationNotice({ items }: { items: readonly SharedFormationClause[] }) {
  if (!items.length) return null;
  return (
    <aside className="civ-formations-shared" aria-label="共同前提与适用限制">
      <p className="civ-formations-shared-title">共同前提与适用限制（由多条路线相同限制自动汇总，以下路线面板内不再重复）</p>
      <ul>
        {items.map((item, index) => (
          <li key={index}>
            {!item.allRoutes && <span className="civ-formations-shared-scope">仅适用「{item.routeTitles.join('」「')}」：</span>}
            <FormationText text={item.text} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

type RenderFormationEntity = (row: FormationEntityView, showAge?: boolean) => ReactNode;

export function renderFormationAgeProgression(required: FormationEntityView[], continuations: FormationEntityView[], renderEntity: RenderFormationEntity) {
  const stages = [...required.map((row) => ({ row, optional: false })), ...continuations.map((row) => ({ row, optional: true }))].sort(
    (a, b) => a.row.age - b.row.age,
  );
  return (
    <section className="formation-expanded-group">
      <h4>时代进阶</h4>
      <ol className="formation-age-progression">
        {stages.map(({ row, optional }, index) => (
          <li key={`${row.kind}-${row.entity.id}-${row.rawOccurrence ?? index}`}>
            <p className="formation-stage-age">
              <span>{AGE_ZH[row.age]}</span>
              {optional && <span>有条件</span>}
            </p>
            {renderEntity(row, false)}
            {index < stages.length - 1 && <Icon name="chevron-right" className="formation-stage-arrow" />}
          </li>
        ))}
      </ol>
    </section>
  );
}
