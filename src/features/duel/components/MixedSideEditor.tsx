import { useMemo } from 'react';
import { civByEn, type Core } from '../../../data';
import { militaryTechAge } from '../../../domain/availabilityAge';
import { fighterCanAttack, fighterUsesAssumeHit, NO_NORMAL_ATTACK_REASON } from '../../../domain/duel';
import { TEAM_BONUSES } from '../../../domain/effects';
import { formatHp } from '../../../domain/hpFormat';
import type { MixedSideInput } from '../../../domain/mixedDuelParams';
import { toggleTech } from '../../../domain/prereq';
import { AGE_ZH } from '../../../domain/ratings';
import { civBonusNotes, type SimContext } from '../../../domain/simulator';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { CivIcon } from '../../../shared/ui/art';
import { CivArtLayer } from '../../../shared/ui/CivArtLayer';
import { Icon } from '../../../shared/ui/Icon';
import { resolveSideArtCiv } from '../../../shared/utils/civBackgrounds';
import { resolveMixedSide, type MixedSideView } from '../logic/mixedDuel';
import type { MixedTrainingTransfer } from '../logic/mixedTrainingTransfer';
import { MixedTrainingAction } from './MixedTrainingAction';
import { UnitPicker } from '../../../shared/ui/UnitPicker';
import '../unmodeled-notes.css';

export function MixedSideEditor({
  side,
  input,
  view,
  core,
  ctx,
  transfer,
  focusField,
  onChange,
}: {
  side: 'a' | 'b';
  input: MixedSideInput;
  view: MixedSideView;
  core: Core;
  ctx: SimContext;
  transfer: MixedTrainingTransfer;
  focusField: (id: string) => void;
  onChange: (next: MixedSideInput, announcement?: string) => void;
}) {
  const prefix = `mix-${side}`,
    label = `${side.toUpperCase()} 方`;
  const units = useMemo(() => core.units.filter((u) => u.civs.length).map((u) => ({ u })), [core]);
  const age = +input.age;
  const focus = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
  const changeRow = (index: number, value: Partial<MixedSideInput['rows'][number]>) =>
    onChange({ ...input, rows: input.rows.map((r, i) => (i === index ? { ...r, ...value } : r)) });
  const errors = (field: string) => view.errors.filter((e) => e.field === `${prefix}-${field}`);
  const fieldErrors = (field: string) =>
    errors(field).length ? (
      <p id={`${prefix}-${field}-error`} className="mix-field-error">
        {errors(field)
          .map((e) => e.message)
          .join('；')}
      </p>
    ) : null;
  const preset = (scope: 'none' | 'current' | 'full') => {
    const targetAge = scope === 'full' ? 4 : age;
    const options = resolveMixedSide(ctx, core, { ...input, age: String(targetAge) }, side).techs;
    const selected =
      scope === 'none'
        ? []
        : options.filter((t) => (t.numeric || (t.cost && !t.partial)) && militaryTechAge(input.civ, t.t.id, t.t.age) <= targetAge).map((t) => String(t.t.id));
    onChange(
      { ...input, age: String(targetAge), techs: selected },
      `${label}已应用${scope === 'none' ? '无科技' : scope === 'full' ? '帝王时代满科技' : '当前时代科技'}预设`,
    );
  };
  const numeric = input.techs.filter((id) => view.techs.some((o) => String(o.t.id) === id && o.numeric)).length;
  const known = new Set(view.techs.map((o) => String(o.t.id)));
  const percentage = (qty: string) =>
    view.total !== null && view.total > 0 && input.rows.every((r) => /^[1-9]\d*$/.test(r.qty) && Number.isSafeInteger(+r.qty))
      ? `${((+qty / view.total) * 100).toFixed(1)}%`
      : '—';
  const move = (index: number, delta: number) => {
    const next = [...input.rows],
      target = index + delta;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...input, rows: next }, `${label}单位已移至受击优先级 ${target + 1}`);
    const direction = delta < 0 ? (target > 0 ? 'up' : 'down') : target < next.length - 1 ? 'down' : 'up';
    focus(`${prefix}-${direction}-${target}`);
  };
  const civObj = civByEn(input.civ);
  const artCiv = resolveSideArtCiv([civObj?.en]);
  return (
    <section className={`mix-side side-${side} civ-art-host`} aria-labelledby={`${prefix}-title`}>
      <CivArtLayer civ={artCiv} side={side} variant="head-band" mirror={side === 'b'} />
      <header className="mix-side-head">
        <div className="mix-side-head-main">
          <h2 id={`${prefix}-title`}>
            <span className={`civ-side-badge is-${side}`}>{side.toUpperCase()} 方</span>
            <span>军队</span>
          </h2>
          {civObj && (
            <p className="mix-side-civ">
              <CivIcon c={civObj} alt="" />
              <span>{civObj.zh}</span>
            </p>
          )}
        </div>
        <span className="mix-side-total num nw">{view.total === null ? '数量待修正' : `${view.total} 个单位`}</span>
      </header>
      <div className="mix-context">
        <div>
          <label htmlFor={`${prefix}-civ`}>文明</label>
          <CivPicker
            id={`${prefix}-civ`}
            label={`${label}文明`}
            value={input.civ}
            emptyText="选择文明"
            compactTrigger
            onChange={(civ) => onChange({ ...input, civ })}
          />
          {fieldErrors('civ')}
        </div>
        <div>
          <label htmlFor={`${prefix}-age`}>本方共用时代</label>
          <select
            id={`${prefix}-age`}
            value={input.age}
            aria-invalid={!!errors('age').length}
            aria-describedby={errors('age').length ? `${prefix}-age-error` : undefined}
            onChange={(e) => onChange({ ...input, age: e.target.value })}
          >
            {!/^[1-4]$/.test(input.age) && <option value={input.age}>无效时代：{input.age || '空'}</option>}
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {AGE_ZH[n]}
              </option>
            ))}
          </select>
          {fieldErrors('age')}
        </div>
      </div>
      <MixedTrainingAction side={side} input={input} transfer={transfer} focusField={focusField} />
      <p className="note">本方共用科技 / 团队效果；修改上下文不会自动替换单位或删除科技。</p>
      <div className="bar mix-presets" aria-label={`${label}科技预设`}>
        <button type="button" onClick={() => preset('none')}>
          无科技
        </button>
        <button type="button" onClick={() => preset('current')}>
          当前时代科技
        </button>
        <button type="button" onClick={() => preset('full')}>
          满科技
        </button>
      </div>
      <details className="mix-techs">
        <summary>
          自选科技与团队效果 <span className="num nw">（数值科技 {numeric} 项）</span>
        </summary>
        <div id={`${prefix}-techs`} tabIndex={-1} className="mix-checklist" aria-label={`${label}共用科技`}>
          <h3>共用科技</h3>
          <p className="note">按本方各行适用科技取并集，效果只作用于匹配单位；选中自动补齐可选前置，取消级联移除后继。</p>
          {fieldErrors('techs')}
          {input.techs
            .filter((id) => !known.has(id))
            .map((id, i) => (
              <p className="mix-field-error" key={`${id}-${i}`}>
                无效或不再适用的科技：{id || '空值'}{' '}
                <button type="button" onClick={() => onChange({ ...input, techs: input.techs.filter((_, n) => n !== input.techs.indexOf(id)) })}>
                  移除此科技
                </button>
              </p>
            ))}
          {view.techs.map(({ t, numeric, cost, partial, rows }) => (
            <label key={t.id} className="mix-check">
              <input
                type="checkbox"
                checked={input.techs.includes(String(t.id))}
                disabled={militaryTechAge(input.civ, t.id, t.age) > age && !input.techs.includes(String(t.id))}
                onChange={() =>
                  onChange({
                    ...input,
                    techs: [
                      ...toggleTech(
                        t.id,
                        new Set(input.techs.map(Number)),
                        view.techs.filter((o) => militaryTechAge(input.civ, o.t.id, o.t.age) <= age).map((o) => o.t),
                        core.techById,
                      ),
                    ].map(String),
                  })
                }
              />
              <span>
                {t.zh}
                <small>
                  {AGE_ZH[t.age]} · 适用第 {rows.map((i) => i + 1).join('、')} 行 ·{' '}
                  {numeric
                    ? '匹配行数值计入'
                    : partial
                      ? '部分费用已解码，另含未解码效果（不影响混编战果；带入训练费用时将保守拦截）'
                      : cost
                        ? '仅费用记录，不影响混编战果'
                        : '文本效果未计入战斗'}
                </small>
              </span>
            </label>
          ))}
          {!view.techs.length && <p className="note">选择有效单位与文明后显示适用科技。</p>}
        </div>
        <div id={`${prefix}-team`} tabIndex={-1} className="mix-checklist" aria-label={`${label}团队效果`}>
          <h3>团队效果</h3>
          {fieldErrors('team')}
          {input.team
            .filter((id) => !/^(0|[1-9]\d*)$/.test(id) || !TEAM_BONUSES[+id])
            .map((id, i) => (
              <p className="mix-field-error" key={`${id}-${i}`}>
                未知团队效果：{id || '空值'}{' '}
                <button type="button" onClick={() => onChange({ ...input, team: input.team.filter((raw) => raw !== id) })}>
                  移除此效果
                </button>
              </p>
            ))}
          {TEAM_BONUSES.map(([, name, applies], i) => (
            <label key={i} className="mix-check">
              <input
                type="checkbox"
                checked={input.team.includes(String(i))}
                onChange={(e) => onChange({ ...input, team: e.target.checked ? [...input.team, String(i)] : input.team.filter((id) => id !== String(i)) })}
              />
              <span>
                {name}
                <small>
                  适用行：
                  {view.rows
                    .map((r, i) => (r.unit && applies(r.unit) ? i + 1 : null))
                    .filter((n) => n !== null)
                    .join('、') || '当前全部不适用'}
                </small>
              </span>
            </label>
          ))}
        </div>
      </details>
      <p className="note mix-queue-note">从上到下依次受击。最前一行清空后，下一行顶上。</p>
      <div id={`${prefix}-rows`} tabIndex={-1}>
        {fieldErrors('rows')}
        {input.rows.map((row, i) => {
          const state = view.rows[i],
            u = state?.unit,
            r = state?.resolved;
          const numericIds = new Set(r?.avail.filter((o) => o.ef).map((o) => o.t.id));
          return (
            <div className="mix-row" key={i} data-testid={`${prefix}-row-${i}`}>
              <div className="mix-row-head">
                <strong>
                  受击优先级 <span className="num nw">{i + 1}</span>
                </strong>
                <div className="mix-row-actions">
                  <button type="button" id={`${prefix}-up-${i}`} disabled={i === 0} aria-label={`${label}第 ${i + 1} 行上移`} onClick={() => move(i, -1)}>
                    <Icon name="arrow-up" />
                  </button>
                  <button
                    type="button"
                    id={`${prefix}-down-${i}`}
                    disabled={i === input.rows.length - 1}
                    aria-label={`${label}第 ${i + 1} 行下移`}
                    onClick={() => move(i, 1)}
                  >
                    <Icon name="arrow-down" />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除${label}第 ${i + 1} 行`}
                    onClick={() => {
                      onChange({ ...input, rows: input.rows.filter((_, n) => n !== i) }, `${label}已删除第 ${i + 1} 行`);
                      focus(input.rows.length > 1 ? `${prefix}-unit-${Math.min(i, input.rows.length - 2)}` : `${prefix}-add`);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
              <div className="mix-row-inputs">
                <div className="mix-unit-control">
                  <UnitPicker
                    id={`${prefix}-unit-${i}`}
                    label={`${label}第 ${i + 1} 行单位`}
                    value={u}
                    civ={input.civ}
                    unavailableGroupTitle={civByEn(input.civ) ? `${civByEn(input.civ)!.zh}不可用（选择后需修改本方文明）` : undefined}
                    list={units}
                    invalid={!!errors(`unit-${i}`).length}
                    describedBy={errors(`unit-${i}`).length ? `${prefix}-unit-${i}-error` : `${prefix}-identity-${i}`}
                    onChange={(unit) => changeRow(i, { uid: String(unit.id) })}
                  />
                </div>
                <label className="mix-qty" htmlFor={`${prefix}-qty-${i}`}>
                  数量
                  <input
                    id={`${prefix}-qty-${i}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={row.qty}
                    className="num"
                    aria-label={`${label}第 ${i + 1} 行数量`}
                    aria-invalid={!!errors(`qty-${i}`).length}
                    aria-describedby={errors(`qty-${i}`).length ? `${prefix}-qty-${i}-error` : undefined}
                    onChange={(e) => changeRow(i, { qty: e.target.value })}
                  />
                </label>
                <div className="mix-ratio">
                  <small>单位数占比</small>
                  <strong className="num nw">{percentage(row.qty)}</strong>
                </div>
              </div>
              <p id={`${prefix}-identity-${i}`} className="note mix-identity">
                {u ? `${u.en} · 具体 ID ${u.id} · ${AGE_ZH[age] ?? '时代待修正'}` : `单位 ID：${row.uid || '未选择'}`} · {civByEn(input.civ)?.zh ?? input.civ}
              </p>
              {fieldErrors(`unit-${i}`)}
              {fieldErrors(`qty-${i}`)}
              <details className="mix-row-stats">
                <summary>生效属性与未计入效果</summary>
                {r ? (
                  <>
                    <dl className="mix-stats">
                      <div>
                        <dt>生命值</dt>
                        <dd className="num nw">{formatHp(r.F.hp)}</dd>
                      </div>
                      <div>
                        <dt>攻击力</dt>
                        <dd className={fighterCanAttack(r.F) ? 'num nw' : undefined}>
                          {fighterCanAttack(r.F) ? `${formatHp(r.S.atk)}（${r.F.ranged ? '穿刺' : '近战'}）` : NO_NORMAL_ATTACK_REASON}
                        </dd>
                      </div>
                      <div>
                        <dt>护甲（近战 / 穿刺）</dt>
                        <dd className="num nw">{`${formatHp(r.S.ma)} / ${formatHp(r.S.pa)}`}</dd>
                      </div>
                      <div>
                        <dt>攻击间隔</dt>
                        <dd className={fighterCanAttack(r.F) && r.F.rof > 0 ? 'num nw' : undefined}>
                          {!fighterCanAttack(r.F) ? NO_NORMAL_ATTACK_REASON : r.F.rof > 0 ? `${formatHp(r.F.rof)} 游戏秒` : '—'}
                        </dd>
                      </div>
                      {!fighterCanAttack(r.F) ? (
                        <div>
                          <dt>本场命中口径</dt>
                          <dd>{NO_NORMAL_ATTACK_REASON}</dd>
                        </div>
                      ) : fighterUsesAssumeHit(r.F) ? (
                        <div className="mix-acc-row" data-t={`mix-assume-hit-stat-${side}-${i}`}>
                          <dt>
                            <span>本场命中口径</span>
                            <small className="note mix-acc-sub">
                              目录准确度 <span className="num nw">0%</span>
                            </small>
                          </dt>
                          <dd>
                            <span className="pk-acc-pill nw">按每击命中估算</span>
                          </dd>
                        </div>
                      ) : (
                        <div>
                          <dt>命中率</dt>
                          <dd className="num nw">{`${formatHp(r.F.acc * 100)}%`}</dd>
                        </div>
                      )}
                    </dl>
                    {(
                      [
                        ['实际攻击类别（含附加攻击）', r.F.attack],
                        ['实际护甲类别', r.F.armor],
                      ] as const
                    ).map(([title, values]) => (
                      <div key={title}>
                        <h4>{title}</h4>
                        <dl className="mix-stats" aria-label={title}>
                          {Object.entries(values).map(([category, value]) => (
                            <div key={category}>
                              <dt>{category}</dt>
                              <dd className="num nw">{formatHp(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                    <p className="note">以上类别直接用于逐击伤害；负类别攻击按原公式抵扣，零类别护甲不代表忽略该类攻击。</p>
                    <p className="note">
                      本行数值科技：
                      {[...r.sel]
                        .filter((id) => numericIds.has(id))
                        .map((id) => core.techById[id]?.zh)
                        .join('、') || '无'}
                    </p>
                    <p className="note">
                      本行文本 / 费用记录（不影响混编战果）：
                      {[...r.sel]
                        .filter((id) => !numericIds.has(id))
                        .map((id) => core.techById[id]?.zh)
                        .join('、') || '无'}
                    </p>
                    <p className="note">
                      本行团队数值效果：
                      {input.team
                        .map(Number)
                        .filter((id) => TEAM_BONUSES[id]?.[2](r.u))
                        .map((id) => TEAM_BONUSES[id]![1])
                        .join('、') || '无'}
                    </p>
                    <p className="note">常驻文明加成：{civBonusNotes(r.u, r.civ).join('；') || '无适用条目'}</p>
                  </>
                ) : (
                  <p className="note">请先修正本行单位与共享上下文，暂不展示有效属性。</p>
                )}
                <p className="note">
                  以本行接敌距离判断出手资格。前排近战受占位限制，后排远程在射程内可以出手。战斗沿用本站伤害类别、护甲与常规远程命中期望公式（目录准确度为{' '}
                  <span className="num nw">0%</span> 的特殊远程攻击按每击命中主目标估算）。
                </p>
                {!!view.errors.length && <p className="mix-field-error">本方配置尚有错误，以上仅供修正时核对；不可据此生成战果。</p>}
              </details>
            </div>
          );
        })}
      </div>
      {!input.rows.length && <p className="mix-info">军队为空，请添加第一行单位；不会自动填入默认单位。</p>}
      <footer className="mix-add">
        <button
          type="button"
          id={`${prefix}-add`}
          disabled={input.rows.length >= 3}
          onClick={() => {
            onChange({ ...input, rows: [...input.rows, { uid: '', qty: '1' }] }, `${label}已添加空白单位行`);
            focus(`${prefix}-unit-${input.rows.length}`);
          }}
        >
          <Icon name="plus" />
          添加兵种
        </button>
        <span className="note">
          {input.rows.length >= 3 ? (
            '已达 3 行上限；更换单位请在现有行选择'
          ) : (
            <>
              <span className="num nw">最多 3 行</span> · <span className="num nw">合计 1–200 个单位</span>
            </>
          )}
        </span>
      </footer>
    </section>
  );
}
