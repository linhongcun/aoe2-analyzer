import { Fragment, type ReactNode } from 'react';

const FORMATION_NUMBER = String.raw`[+\-−]?\d+(?:\.\d+)?`;
const FORMATION_UNIT = String.raw`(?:%|射程|近甲|穿甲|生命值|生命|护甲|伤害|HP|倍|点|格|个村民|个|名|人|兵|箭|座|条|次|秒|分钟|年|人口|食物|黄金|木材|石料|食|木|金|石|血|攻|甲|F|G|W|S|s)`;
const FORMATION_COUNTED_NOUN = String.raw`${FORMATION_NUMBER}\s*(?:个|名|只|座|条|辆)\s*[\u4e00-\u9fff]{1,10}?(?:兵|弩|炮|车|塔|民|船|象|士|手|侣|机|城|堡|从)(?=$|[\s,，。；：.!?！？、/（(]|(?:仅|显示|达到|在|仍|可|需|要|已|未|与|和|及|并|但|而|则|会|能|后|中|内|外|前|时|把|用|从|到|对|被|由|等|于|正在|保持|继续|保留))`;
const FORMATION_NUMBER_WITH_UNIT = String.raw`(?:${FORMATION_COUNTED_NOUN}|${FORMATION_NUMBER}(?:\s*${FORMATION_UNIT})?)`;
const FORMATION_HEX_HASH = String.raw`(?<![a-f\d])(?=[a-f\d]{12,40}(?![a-f\d]))(?=[a-f\d]{0,39}[a-f])[a-f\d]{12,40}(?![a-f\d])`;
const FORMATION_TOKENS = new RegExp(
  String.raw`(?<longHash>${FORMATION_HEX_HASH})|(?<protected>v\d+(?:\.\d+){1,3}|\d{4}-\d{2}-\d{2}|(?<![a-f\d])[a-f\d]{7,11}(?![a-f\d])|${FORMATION_NUMBER_WITH_UNIT}(?:\s*(?:/|:|–|—|-|至)\s*${FORMATION_NUMBER_WITH_UNIT})*)`,
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
      parts.push(<Fragment key={`hash-${index}`}>{token}</Fragment>);
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

export function FormationFold({ id, label, closeLabel, children }: { id: string; label: string; closeLabel?: string; children: ReactNode }) {
  return (
    <details id={id} className="formation-fold" data-formation-fold>
      <summary>
        {closeLabel ? (
          <>
            <span className="formation-fold-closed">{label}</span>
            <span className="formation-fold-open">{closeLabel}</span>
          </>
        ) : (
          label
        )}
      </summary>
      <div className="formation-fold-body">{children}</div>
    </details>
  );
}
