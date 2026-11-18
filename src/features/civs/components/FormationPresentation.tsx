import { Fragment, type ReactNode } from 'react';

const FORMATION_NUMERIC_TOKENS =
  /(\d{4}-\d{2}-\d{2}|v\d+(?:\.\d+){1,3}|[a-f\d]{7,40}|[+\-−]?\d+(?:\.\d+)?(?:\s*(?:\/|[–—-至])\s*[+\-−]?\d+(?:\.\d+)?(?:\s*(?:%|射程|近甲|穿甲|生命值|生命|护甲|伤害|HP|倍|点|格|个|名|人|兵|座|条|次|秒|分钟|年|人口|食物|黄金|木材|石料))?)?(?:\s*(?:%|射程|近甲|穿甲|生命值|生命|护甲|伤害|HP|倍|点|格|个|名|人|兵|座|条|次|秒|分钟|年|人口|食物|黄金|木材|石料))?)/giu;

export function FormationText({ text }: { text: string }) {
  return text.split(FORMATION_NUMERIC_TOKENS).map((part, index) =>
    index % 2 ? (
      <span className="num nw" key={index}>
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
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
