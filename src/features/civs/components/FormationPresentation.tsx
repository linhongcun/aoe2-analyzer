import { Fragment, type ReactNode } from 'react';

const FORMATION_NUMBER = String.raw`[+\-−]?\d+(?:\.\d+)?`;
const FORMATION_UNIT = String.raw`(?:%|射程|近甲|穿甲|生命值|生命|护甲|伤害|HP|倍|点|格|个|名|人|兵|座|条|次|秒|分钟|年|人口|食物|黄金|木材|石料|食|木|金|石|血|攻|甲|F|G|W|S|s)`;
const FORMATION_NUMBER_WITH_UNIT = String.raw`${FORMATION_NUMBER}(?:\s*${FORMATION_UNIT})?`;
const FORMATION_TOKENS = new RegExp(
  String.raw`(?<longHash>(?<![a-f\d])[a-f\d]{12,40}(?![a-f\d]))|(?<protected>v\d+(?:\.\d+){1,3}|\d{4}-\d{2}-\d{2}|(?<![a-f\d])[a-f\d]{7,11}(?![a-f\d])|${FORMATION_NUMBER_WITH_UNIT}(?:\s*(?:/|:|–|—|-|至)\s*${FORMATION_NUMBER_WITH_UNIT})*)`,
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
