/** 混编 PK 团队加成两层结构与折叠外本方常驻条（issue 1481） */
import type { ReactNode } from 'react';
import { TEAM_BONUSES } from '../../../domain/effects';
import type { MixedSideInput } from '../../../domain/mixedDuelParams';
import type { Unit } from '../../../domain/types';
import { Icon } from '../../../shared/ui/Icon';
import { NumWrappedText } from '../../../shared/ui/widgets';
import '../../../shared/ui/sim/sim-team.css';
import type { MixedRowView } from '../logic/mixedDuel';

export interface MixedOwnTeamEntry {
  index: number;
  label: string;
  rows: number[];
}

export interface MixedAllyTeamOption {
  index: number;
  label: string;
  rows: number[];
  checked: boolean;
}

const isValidTeamIndex = (raw: string) => /^(0|[1-9]\d*)$/.test(raw) && Number.isSafeInteger(+raw) && Boolean(TEAM_BONUSES[+raw]);

export function computeMixedTeamState(civ: string, rows: readonly MixedRowView[], rawTeam: readonly string[]) {
  const validRows = (applies: (u: Unit) => boolean) => rows.map((r, i) => (r.unit && applies(r.unit) ? i + 1 : null)).filter((n): n is number => n !== null);
  const own: MixedOwnTeamEntry[] = [];
  const ally: MixedAllyTeamOption[] = [];
  const selectedAllies = new Set<number>();
  for (const raw of rawTeam) {
    if (!isValidTeamIndex(raw)) continue;
    const id = +raw;
    if (TEAM_BONUSES[id]![0] !== civ) selectedAllies.add(id);
  }
  TEAM_BONUSES.forEach(([teamCiv, label, applies], index) => {
    const matched = validRows(applies);
    if (teamCiv === civ) {
      if (matched.length > 0) own.push({ index, label, rows: matched });
      return;
    }
    const checked = selectedAllies.has(index);
    if (matched.length > 0 || checked) ally.push({ index, label, rows: matched, checked });
  });
  return { own, ally, extraAllyCount: selectedAllies.size };
}

export function formatMixedRowTeamEffects(civ: string, u: Unit, rawTeam: readonly string[]): string {
  const own = TEAM_BONUSES.filter(([teamCiv, , applies]) => teamCiv === civ && applies(u)).map(([, label]) => `${label}（本方常驻，已自动计入）`);
  const allyIds = new Set<number>();
  for (const raw of rawTeam) {
    if (!isValidTeamIndex(raw)) continue;
    const id = +raw;
    if (TEAM_BONUSES[id]![0] !== civ && TEAM_BONUSES[id]![2](u)) allyIds.add(id);
  }
  const ally = [...allyIds].map((id) => `${TEAM_BONUSES[id]![1]}（额外盟友）`);
  return [...own, ...ally].join('；') || '无';
}

export function MixedOwnTeamSummary({ side, own }: { side: 'a' | 'b'; own: readonly MixedOwnTeamEntry[] }) {
  if (!own.length) return null;
  return (
    <div className="mix-own-team-summary" data-t={`mix-${side}-own-team`}>
      <Icon name="check" className="ic sim-team-own-ic" />
      <div className="mix-own-team-summary-body">
        {own.map((item) => (
          <p key={item.index}>
            本方常驻团队加成（已自动计入）：
            <NumWrappedText text={item.label} /> · 适用<span className="num nw">第 {item.rows.join('、')} 行</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function MixedTeamChecklist({
  prefix,
  label,
  input,
  own,
  ally,
  fieldErrors,
  onChange,
}: {
  prefix: string;
  label: string;
  input: MixedSideInput;
  own: readonly MixedOwnTeamEntry[];
  ally: readonly MixedAllyTeamOption[];
  fieldErrors: ReactNode;
  onChange: (next: MixedSideInput) => void;
}) {
  const withoutOwn = (team: readonly string[]) => team.filter((raw) => !(isValidTeamIndex(raw) && TEAM_BONUSES[+raw]![0] === input.civ));
  const toggleAlly = (index: number, checked: boolean) => {
    const cleaned = withoutOwn(input.team);
    const key = String(index);
    const nextTeam = checked ? (cleaned.includes(key) ? cleaned : [...cleaned, key]) : cleaned.filter((raw) => raw !== key);
    onChange({ ...input, team: nextTeam });
  };
  return (
    <div id={`${prefix}-team`} tabIndex={-1} className="mix-checklist" aria-label={`${label}团队加成`}>
      <h3>团队加成</h3>
      {fieldErrors}
      {input.team
        .filter((id) => !isValidTeamIndex(id))
        .map((id, i) => (
          <p className="mix-field-error" key={`${id}-${i}`}>
            未知团队效果：{id || '空值'}{' '}
            <button type="button" onClick={() => onChange({ ...input, team: input.team.filter((raw) => raw !== id) })}>
              移除此效果
            </button>
          </p>
        ))}
      {own.length === 0 && ally.length === 0 ? (
        <p className="note sim-team-empty">当前阵容无适用的已编码团队加成。</p>
      ) : (
        <>
          {own.length > 0 && (
            <div className="sim-team-sub" data-t={`${prefix}-team-own`}>
              <div className="sim-team-subhead">
                <p className="sim-team-kicker">本方常驻团队加成</p>
                <span className="sim-team-auto-badge nw">已自动计入</span>
              </div>
              {own.map((item) => (
                <div className="sim-team-own-item" key={item.index}>
                  <div className="sim-team-own-main">
                    <Icon name="check" className="ic sim-team-own-ic" />
                    <span>
                      <NumWrappedText text={item.label} />
                    </span>
                  </div>
                  <p className="sim-team-own-meta">
                    适用<span className="num nw">第 {item.rows.join('、')} 行</span> · 1v1 与团战均常驻生效，不可关闭。
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="sim-team-sub" data-t={`${prefix}-team-ally`}>
            <p className="sim-team-kicker">额外盟友团队加成（开关）</p>
            {ally.length > 0 ? (
              ally.map((item) => (
                <label key={item.index} className="mix-check">
                  <input type="checkbox" checked={item.checked} onChange={(e) => toggleAlly(item.index, e.target.checked)} />
                  <span>
                    <NumWrappedText text={item.label} />
                    <small>
                      {item.rows.length > 0 ? (
                        <>
                          适用<span className="num nw">第 {item.rows.join('、')} 行</span>
                        </>
                      ) : (
                        '适用行：当前全部不适用'
                      )}
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <p className="note sim-team-empty">当前阵容无其他文明的适用额外盟友团队加成。</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
