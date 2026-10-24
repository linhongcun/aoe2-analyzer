import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCore, useTrees } from '../../../data/hooks';
import {
  calculateGeneralGarrison,
  getFreeGarrisonTechs,
  getGarrisonCandidates,
  getGarrisonBuildingAge,
  getGarrisonTechs,
  readGeneralGarrison,
  toggleGeneralGarrisonTech,
  writeGeneralGarrison,
  GENERAL_GARRISON_LIMIT,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
  type GarrisonEntry,
} from '../../../domain/garrisonGeneral';
import { AGE_ZH } from '../../../domain/ratings';
import { sharePageUrl } from '../../../domain/sharePage';
import type { Building } from '../../../domain/types';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Loading } from '../../../shared/ui/widgets';
import './garrison.css';
import './garrisonGeneral.css';
import { healingLink } from '../../../domain/garrisonHealing';

const ENTRY_LABEL: Record<GarrisonEntry, string> = { enter: '从外部进入', created: '生产后留驻', deposit: '存放圣物' };

function GarrisonNote({ text }: { text: string }) {
  return text.split(/(\+?\d+(?:\.\d+)?(?:\s*支箭)?)/g).map((part, index) =>
    /^\+?\d/.test(part) ? (
      <span className="garrison-number" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export default function GeneralGarrisonPreview({ b }: { b: Building }) {
  const core = useCore(),
    trees = useTrees();
  if (!core || !trees) return <Loading />;
  return <ReadyGarrison key={b.id} b={b} ctx={{ core, trees }} />;
}

function ReadyGarrison({ b, ctx }: { b: Building; ctx: GeneralGarrisonContext }) {
  const [params, setParams] = useSearchParams();
  const { config, errors: parseErrors } = readGeneralGarrison(params, b);
  const minAge = getGarrisonBuildingAge(b, config.civ, ctx.trees);
  const result = calculateGeneralGarrison(ctx, b, config);
  const errors = [...new Set([...parseErrors, ...result.errors])];
  const available = getGarrisonTechs(ctx, b, config);
  const free = new Set(getFreeGarrisonTechs(ctx, b, config));
  const selected = new Set([...config.techs, ...free]);
  const candidates = getGarrisonCandidates(ctx, b, config);
  const compatible = candidates.filter((u) => u.canEnter || u.canCreate || u.canDeposit);
  const [copied, setCopied] = useState('');
  const [manual, setManual] = useState('');
  const shareUrl = sharePageUrl(`/building/${b.id}`, writeGeneralGarrison(config).toString(), document.baseURI);
  const update = (next: GeneralGarrisonConfig) => {
    if (!parseErrors.length) setParams(writeGeneralGarrison(next), { replace: true });
  };
  const reset = () =>
    setParams(
      writeGeneralGarrison({
        civ: b.civs[0]!,
        age: Math.max(b.age, 3),
        techs: [],
        rows: [109, 79, 234, 235].includes(b.id) ? [{ unitId: 83, count: '0', entry: 'enter' }] : [],
      }),
      { replace: true },
    );
  const copy = async () => {
    if (errors.length) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(shareUrl);
      setManual('');
    } catch {
      setCopied('');
      setManual(shareUrl);
    }
  };
  const entries = (id: number): GarrisonEntry[] => {
    const u = candidates.find((item) => item.id === id);
    return [...(u?.canEnter ? ['enter' as const] : []), ...(u?.canCreate ? ['created' as const] : []), ...(u?.canDeposit ? ['deposit' as const] : [])];
  };
  const rowEntries = (id: number, index: number) =>
    entries(id).filter((entry) => !config.rows.some((row, n) => n !== index && row.unitId === id && row.entry === entry));
  const unused = compatible
    .flatMap((u) => entries(u.id).map((entry) => ({ unitId: u.id, count: '1', entry })))
    .find((row) => !config.rows.some((r) => r.unitId === row.unitId && r.entry === row.entry));
  const singleVillager = config.rows.length === 1 && [83, 293].includes(config.rows[0]!.unitId);
  const firing = result.mode === 'arrows' || result.mode === 'cannon';
  const projectile = result.mode === 'cannon' ? '炮弹' : '箭矢';
  const shortProjectile = result.mode === 'cannon' ? '发' : '箭';
  const singleOccupant = config.rows.length === 1 ? config.rows[0] : undefined;
  const healingHref = !errors.length
    ? healingLink(ctx, {
        buildingId: b.id,
        civ: config.civ,
        age: config.age,
        techs: config.techs,
        ...(singleOccupant ? { unitId: singleOccupant.unitId, entry: singleOccupant.entry } : {}),
      })
    : null;
  return (
    <section className="garrison-preview" data-testid="garrison-preview" aria-labelledby="garrison-title">
      <div className="garrison-heading">
        <div>
          <h2 id="garrison-title">驻军配置与弹丸预览</h2>
          <p className="note">按文明、时代和科技配置混合驻军，区分外部进入、生产后留驻与圣物存放。</p>
        </div>
        <button type="button" disabled={errors.length > 0} onClick={() => void copy()}>
          复制驻军方案
        </button>
      </div>
      {compatible.some((unit) => unit.canDeposit) && (
        <p>
          <Link className="community-tool-entry" to="/relic-income">
            按已生效数量预览圣物收益
          </Link>
        </p>
      )}
      {healingHref && (
        <p>
          <Link className="btn community-tool-entry" to={healingHref}>
            {singleOccupant ? '按此单位查看驻军回血' : '查看单目标回血，进入后选择对象'}
          </Link>
        </p>
      )}
      {healingHref && <p className="note">回血为独立的单目标预览，不迁移混合数量；可迁移的文明、时代、单位和相关科技会保留。</p>}
      <fieldset className="garrison-controls garrison-general-controls" aria-label="驻军配置" disabled={parseErrors.length > 0}>
        <div>
          <label htmlFor="garrison-civ">文明</label>
          <CivPicker
            id="garrison-civ"
            label="驻军文明"
            value={config.civ}
            allowed={b.civs}
            onChange={(civ) => update({ ...config, civ, techs: [], rows: [] })}
          />
        </div>
        <label>
          时代
          <select
            aria-label="驻军时代"
            value={String(config.age)}
            onChange={(e) => {
              const next = { ...config, age: Number(e.target.value), rows: [] };
              const allowed = new Set(getGarrisonTechs(ctx, b, next).map((t) => t.id));
              update({ ...next, techs: config.techs.filter((id) => allowed.has(id)) });
            }}
          >
            {(!Number.isSafeInteger(config.age) || config.age < minAge || config.age > 4) && <option value={String(config.age)}>无效时代</option>}
            {[1, 2, 3, 4]
              .filter((age) => age >= minAge)
              .map((age) => (
                <option key={age} value={age}>
                  {AGE_ZH[age]}
                </option>
              ))}
          </select>
        </label>
      </fieldset>
      <p className="note">切换文明或时代会清空驻军清单，请按当前可用单位重新添加。仅模拟所选文明自己的单位与科技。</p>
      <fieldset className="garrison-army" disabled={parseErrors.length > 0}>
        <legend>混合驻军清单</legend>
        {config.rows.length === 0 && <p className="note">清单为空。添加单位后可查看容量占用及驻军贡献。</p>}
        {config.rows.map((row, i) => {
          const choices = rowEntries(row.unitId, i);
          const known = candidates.find((u) => u.id === row.unitId);
          const change = (patch: Partial<typeof row>) => update({ ...config, rows: config.rows.map((r, n) => (n === i ? { ...r, ...patch } : r)) });
          return (
            <div className="garrison-army-row" key={i}>
              <label>
                驻军单位
                <select
                  aria-label={`驻军单位 ${i + 1}`}
                  value={row.unitId}
                  onChange={(e) => {
                    const unitId = Number(e.target.value);
                    change({ unitId, entry: rowEntries(unitId, i)[0] ?? 'enter' });
                  }}
                >
                  {!compatible.some((u) => u.id === row.unitId) && (
                    <option value={row.unitId}>
                      {ctx.core.unitById[row.unitId]?.zh ?? ctx.core.buildingById[row.unitId]?.zh ?? `单位 ${row.unitId}`}（当前不可用）
                    </option>
                  )}
                  {compatible
                    .filter((u) => u.id === row.unitId || rowEntries(u.id, i).length > 0)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.zh} · {u.category}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                驻扎方式
                <select aria-label={`驻扎方式 ${i + 1}`} value={row.entry} onChange={(e) => change({ entry: e.target.value as GarrisonEntry })}>
                  {!choices.includes(row.entry) && <option value={row.entry}>{ENTRY_LABEL[row.entry]}（不适用）</option>}
                  {choices.map((entry) => (
                    <option key={entry} value={entry}>
                      {ENTRY_LABEL[entry]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {singleVillager ? '驻军人数' : '数量'}
                <input
                  type="number"
                  min="0"
                  step="1"
                  aria-label={singleVillager ? '驻军人数' : `驻军数量 ${i + 1}`}
                  value={row.count}
                  onChange={(e) => change({ count: e.target.value })}
                />
              </label>
              <button type="button" aria-label={`移除驻军单位 ${i + 1}`} onClick={() => update({ ...config, rows: config.rows.filter((_, n) => n !== i) })}>
                移除
              </button>
              <p className="note garrison-row-note">
                <GarrisonNote text={`${known?.reason ?? ''} ${firing ? (result.rows[i]?.reason ?? '') : ''}`} />
              </p>
            </div>
          );
        })}
        <button
          type="button"
          disabled={!unused || config.rows.length >= GENERAL_GARRISON_LIMIT}
          onClick={() => unused && update({ ...config, rows: [...config.rows, unused] })}
        >
          添加驻军单位
        </button>
        {compatible.length === 0 && <p className="note">当前文明和时代没有可用驻军入口；其他文明的特殊加成不会自动套用。</p>}
      </fieldset>
      <fieldset className="garrison-techs" disabled={parseErrors.length > 0}>
        <legend>影响驻军的已研究科技</legend>
        <p className="note">只选择已完成的科技；前置联动，免费科技自动生效。建筑形态视为已解锁，单位按所选时代筛选。</p>
        <div className="garrison-tech-grid">
          {available.map((t) => (
            <label key={t.id}>
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                disabled={free.has(t.id)}
                onChange={() => update({ ...config, techs: toggleGeneralGarrisonTech(ctx, b, config, t.id) })}
              />
              <span>
                {t.zh}
                {free.has(t.id) ? '（免费）' : ''}
              </span>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => update({ ...config, techs: [] })}>
          清空自选科技
        </button>
        {config.techs
          .filter((id) => !available.some((t) => t.id === id))
          .map((id) => (
            <button type="button" className="garrison-invalid" key={id} onClick={() => update({ ...config, techs: config.techs.filter((tid) => tid !== id) })}>
              移除 {ctx.core.techById[id]?.zh ?? `科技 ${id}`}
            </button>
          ))}
      </fieldset>
      {errors.length > 0 ? (
        <div role="alert" className="garrison-error">
          <h3>暂不能计算</h3>
          {parseErrors.length > 0 && <p>链接格式无效，常规编辑和复制已停用。请重置驻军方案后重新配置。</p>}
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <button type="button" onClick={reset}>
            重置驻军方案
          </button>
        </div>
      ) : (
        <div data-testid="garrison-result">
          <dl className="garrison-numbers garrison-capacity">
            <div>
              <dt>实际驻扎容量</dt>
              <dd data-testid="garrison-capacity">{result.capacity}</dd>
            </div>
            <div>
              <dt>已占用容量</dt>
              <dd data-testid="garrison-used">{result.usedSlots}</dd>
            </div>
            <div>
              <dt>剩余容量</dt>
              <dd data-testid="garrison-remaining">{result.remainingSlots}</dd>
            </div>
          </dl>
          {firing ? (
            <>
              <dl className="garrison-numbers">
                <div>
                  <dt>基础{projectile}（无驻军）</dt>
                  <dd data-testid="garrison-base">{result.baseProjectiles}</dd>
                </div>
                <div>
                  <dt>驻军增加的{projectile}</dt>
                  <dd data-testid="garrison-extra">{result.extraProjectiles ?? '待核实'}</dd>
                </div>
                <div className="garrison-total">
                  <dt>本轮总{projectile}数</dt>
                  <dd data-testid="garrison-total">{result.totalProjectiles ?? '待核实'}</dd>
                </div>
              </dl>
              <p className="garrison-status" role="status">
                {result.totalProjectiles === null
                  ? '当前组合存在未核实机制，保留容量结果，暂不显示弹丸总数。'
                  : result.totalProjectiles === 0
                    ? result.usedSlots === 0
                      ? '空驻军时不会开火。'
                      : '当前驻军组合不会使建筑开火。'
                    : `可发射 ${result.totalProjectiles} ${shortProjectile}。`}{' '}
                {result.totalProjectiles !== null &&
                  (result.totalProjectiles >= result.maxProjectiles
                    ? `已达${projectile}上限。`
                    : result.singleUnitId !== null
                      ? result.nextAt === null
                        ? `当前容量内无法再增加${projectile}。`
                        : `再驻 ${result.nextAt - result.usedSlots} 个${singleVillager ? '村民' : (result.rows[0]?.zh ?? '单位')}，总驻军 ${result.nextAt} ${singleVillager ? '人' : '个'}时会增加${projectile}。`
                      : '混合驻军先合计贡献，再统一向下取整。')}
              </p>
              <dl className="garrison-facts">
                <div>
                  <dt>实际驻扎容量</dt>
                  <dd>
                    {result.capacity} {singleVillager ? '人' : '格'}
                  </dd>
                </div>
                <div>
                  <dt>{projectile}上限</dt>
                  <dd>
                    {result.maxProjectiles} {shortProjectile}
                  </dd>
                </div>
                {result.singleUnitId !== null && (
                  <>
                    <div>
                      <dt>该单位满容量总{projectile}数</dt>
                      <dd>
                        {result.maxAtCapacity ?? '待核实'} {shortProjectile}
                      </dd>
                    </div>
                    <div>
                      <dt>达到{projectile}上限</dt>
                      <dd>{result.singleUnitSaturationAt === null ? '容量内无法达到' : `${result.singleUnitSaturationAt} ${singleVillager ? '人' : '个'}`}</dd>
                    </div>
                  </>
                )}
              </dl>
              {result.thresholds.length > 0 && (
                <details className="garrison-thresholds">
                  <summary>{singleVillager ? '查看人数阈值表' : '查看单一单位数量阈值表'}</summary>
                  <table>
                    <thead>
                      <tr>
                        <th>总驻军{singleVillager ? '人数' : '数量'}</th>
                        <th>总{projectile}数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.thresholds.map((x) => (
                        <tr key={x.count}>
                          <td>
                            {x.count} {singleVillager ? '人' : '个'}
                          </td>
                          <td>
                            {x.totalProjectiles} {shortProjectile}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
              {!singleVillager && result.rows.length > 1 && (
                <ul className="garrison-next">
                  {result.rows.map((row) => {
                    const next = result.nextByUnit[row.unitId];
                    return (
                      <li key={`${row.unitId}-${row.entry}`}>
                        {row.zh}（{ENTRY_LABEL[row.entry]}）：
                        {next
                          ? `再加 ${next.additionalUnits} 个，总弹丸变为 ${next.totalProjectiles}。`
                          : row.powerEach === null
                            ? '贡献尚待核实。'
                            : '当前剩余容量内无法增加弹丸。'}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <p className="garrison-status" role="status">
              {result.mode === 'economic'
                ? '此建筑用于特殊存放或经济用途，本页仅计算存放容量，不计算食物或黄金收益。'
                : '此建筑仅提供驻扎收容，不会因驻军发射箭矢或炮弹。'}
            </p>
          )}
        </div>
      )}
      {result.warnings.length > 0 && (
        <aside className="garrison-warnings" aria-label="计算提示">
          <h3>计算提示</h3>
          <ul>
            {[...new Set(result.warnings)].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      )}
      {copied === shareUrl && <p role="status">驻军方案链接已复制。</p>}
      {manual === shareUrl && (
        <label className="garrison-manual">
          无法自动复制，请手动复制链接
          <input aria-label="驻军方案链接" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <div className="garrison-notes">
        <h3>计算口径与限制</h3>
        <p>使用固定 DE 185872 数据和公开驻军公式，尚未完成该版本客户端逐项对账。弹丸数为健康建筑有合法目标时的理论预览，不代表齐射伤害或胜负。</p>
        <p>
          只显示当前文明、时代可用的普通单位及明确的特殊存放对象。生产后留驻不代表可以从外部重新进入；国王属于弑君模式。盟友、转换单位、战役英雄、治疗和经济收益不在此页模拟。
        </p>
        <p>多弹丸单位使用公开公式估算；蓄力额外弹丸按未蓄力状态处理。不能确认的贡献显示“待核实”，不会当作零。</p>
        <a href="https://ugc.aoe2.rocks/general/attributes/attributes/#130-garrison-firepower" target="_blank" rel="noreferrer">
          查看驻军火力属性说明
        </a>
      </div>
    </section>
  );
}
