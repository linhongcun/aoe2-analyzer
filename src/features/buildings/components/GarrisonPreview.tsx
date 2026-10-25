import { Link, useSearchParams } from 'react-router-dom';
import { useCore, useTrees } from '../../../data/hooks';
import { civByEn } from '../../../data';
import {
  calculateGarrison,
  garrisonFreeTechs,
  garrisonTechs,
  readGarrison,
  toggleGarrisonTech,
  writeGarrison,
  GARRISON_DATA,
  type GarrisonConfig,
  type GarrisonContext,
} from '../../../domain/garrison';
import { AGE_ZH } from '../../../domain/ratings';
import { sharePageUrl } from '../../../domain/sharePage';
import type { Building } from '../../../domain/types';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Loading } from '../../../shared/ui/widgets';
import { useShareLink } from '../../../shared/ui/useShareLink';
import './garrison.css';

export default function GarrisonPreview({ b }: { b: Building }) {
  const core = useCore(),
    trees = useTrees();
  if (!core || !trees) return <Loading />;
  return <ReadyGarrison b={b} ctx={{ core, trees }} />;
}

function ReadyGarrison({ b, ctx }: { b: Building; ctx: GarrisonContext }) {
  const [params, setParams] = useSearchParams();
  const { config, errors: parseErrors } = readGarrison(params, b);
  const result = calculateGarrison(ctx, b, config);
  const errors = [...parseErrors, ...result.errors];
  const available = garrisonTechs(ctx, b, config.civ, config.age);
  const free = new Set(garrisonFreeTechs(ctx, b, config));
  const selected = new Set([...config.techs, ...free]);
  const shareParams = errors.length ? params : writeGarrison(config);
  const shareUrl = sharePageUrl(`/building/${b.id}`, shareParams.toString(), document.baseURI);
  const {
    copy: copyLink,
    status,
    manualLink,
    statusProps,
  } = useShareLink({
    stateKey: `${b.id}:${params.toString()}`,
    successMessage: '驻军方案链接已复制。',
    failureMessage: '无法自动复制，请手动复制链接',
  });
  // Parsing failures have no lossless editable config. Only an explicit reset
  // may replace the original URL, never an unrelated count/age/technology edit.
  const update = (next: GarrisonConfig) => {
    if (!parseErrors.length) setParams(writeGarrison(next), { replace: true });
  };
  const copy = async () => {
    if (parseErrors.length) return;
    await copyLink(shareUrl);
  };
  const checkpoints: { n: number; total: number }[] = [];
  if (!errors.length)
    for (let n = 0; n <= result.capacity; n++) {
      const at = calculateGarrison(ctx, b, { ...config, villagers: String(n) });
      if (!checkpoints.length || at.totalArrows !== checkpoints[checkpoints.length - 1]!.total || n === result.capacity)
        checkpoints.push({ n, total: at.totalArrows });
    }
  return (
    <section className="garrison-preview" data-testid="garrison-preview" aria-labelledby="garrison-title">
      <div className="garrison-heading">
        <div>
          <h2 id="garrison-title">村民驻军箭矢</h2>
          <p className="note">看看驻多少村民会多一箭。仅限村民，建筑形态视为已解锁。</p>
        </div>
        <button type="button" disabled={parseErrors.length > 0} onClick={() => void copy()}>
          复制驻军方案
        </button>
      </div>
      <fieldset className="garrison-controls" aria-label="驻军配置" disabled={parseErrors.length > 0}>
        <div>
          <label htmlFor="garrison-civ">文明</label>
          <CivPicker
            id="garrison-civ"
            label="驻军文明"
            value={config.civ}
            allowed={b.civs}
            onChange={(civ) => update({ ...config, civ, techs: [], villagers: '0' })}
          />
        </div>
        <label>
          时代
          <select
            aria-label="驻军时代"
            value={String(config.age)}
            onChange={(e) => {
              const age = Number(e.target.value);
              const allowed = new Set(garrisonTechs(ctx, b, config.civ, age).map((t) => t.id));
              update({ ...config, age, techs: config.techs.filter((id) => allowed.has(id)) });
            }}
          >
            {(!Number.isSafeInteger(config.age) || config.age < b.age || config.age > 4) && <option value={String(config.age)}>无效时代</option>}
            {[1, 2, 3, 4]
              .filter((age) => age >= b.age)
              .map((age) => (
                <option key={age} value={age}>
                  {AGE_ZH[age]}
                </option>
              ))}
          </select>
        </label>
        <label>
          驻军人数
          <input
            aria-label="驻军人数"
            type="number"
            min="0"
            max={errors.length ? undefined : result.capacity}
            step="1"
            value={config.villagers}
            onChange={(e) => update({ ...config, villagers: e.target.value })}
          />
        </label>
      </fieldset>
      {!civByEn(config.civ) && <p className="garrison-error">链接中的文明“{config.civ}”无效，请重新选择。</p>}
      <fieldset className="garrison-techs" disabled={parseErrors.length > 0}>
        <legend>影响箭数的已研究科技</legend>
        <p className="note">只选择已完成的科技；前置联动，免费科技自动生效。未选择的独特科技按未研究处理。</p>
        <div className="garrison-tech-grid">
          {available.map((t) => (
            <label key={t.id}>
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                disabled={free.has(t.id)}
                onChange={() => update({ ...config, techs: toggleGarrisonTech(ctx, b, config, t.id) })}
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
            {[...new Set(errors)].map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setParams(writeGarrison({ civ: b.civs[0]!, age: Math.max(b.age, 3), techs: [], villagers: '0' }), { replace: true })}
          >
            重置驻军方案
          </button>
        </div>
      ) : (
        <div data-testid="garrison-result">
          <dl className="garrison-numbers">
            <div>
              <dt>基础箭（无驻军）</dt>
              <dd data-testid="garrison-base">{result.baseArrows}</dd>
            </div>
            <div>
              <dt>村民增加的副箭</dt>
              <dd data-testid="garrison-extra">{result.extraArrows}</dd>
            </div>
            <div className="garrison-total">
              <dt>本轮总箭数</dt>
              <dd data-testid="garrison-total">{result.totalArrows}</dd>
            </div>
          </dl>
          <p className="garrison-status" role="status">
            {result.totalArrows === 0 ? '空驻军时不会开火。' : `可发射 ${result.totalArrows} 箭。`}{' '}
            {result.totalArrows >= result.maxArrows
              ? '已达箭矢上限。'
              : result.nextAt === null
                ? '当前容量内无法再增加箭矢。'
                : `再驻 ${result.nextAt - Number(config.villagers)} 个村民，总驻军 ${result.nextAt} 人时会多一箭。`}
          </p>
          <dl className="garrison-facts">
            <div>
              <dt>实际驻扎容量</dt>
              <dd>{result.capacity} 人</dd>
            </div>
            <div>
              <dt>箭矢上限</dt>
              <dd>{result.maxArrows} 箭</dd>
            </div>
            <div>
              <dt>满容量总箭数</dt>
              <dd>{result.maxAtCapacity} 箭</dd>
            </div>
            <div>
              <dt>达到箭矢上限</dt>
              <dd>{result.saturationAt === null ? '容量内无法达到' : `${result.saturationAt} 人`}</dd>
            </div>
          </dl>
          <details className="garrison-thresholds">
            <summary>查看人数阈值表</summary>
            <table>
              <thead>
                <tr>
                  <th>总驻军人数</th>
                  <th>总箭数</th>
                </tr>
              </thead>
              <tbody>
                {checkpoints.map((x) => (
                  <tr key={x.n}>
                    <td>{x.n} 人</td>
                    <td>{x.total} 箭</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
      {status && !manualLink && <p {...statusProps}>{status}</p>}
      {manualLink && (
        <label className="garrison-manual">
          <span {...statusProps}>{status}</span>
          <input aria-label="驻军方案链接" readOnly value={manualLink} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <div className="garrison-notes">
        <h3>计算口径与限制</h3>
        <p>仅计算健康建筑在射程内有目标时的理论箭数。实际箭数仍受目标、射击和游戏状态影响，不代表齐射伤害或实战胜负。</p>
        <p>
          村民驻军贡献与建筑单箭火力的比值向下取整，再受箭矢上限限制。城镇中心空驻军通常不开火；科技提供的常驻箭数单独计入基础箭。驻扎容量与箭矢上限是两件事。
        </p>
        <p>仅支持城镇中心、瞭望塔、防御箭塔、大型箭塔的村民驻军；不含军事单位、混合驻军、城堡、火炮塔、强化教堂、其他盟友加成、DPS、命中率和地形。</p>
        <p>斯万箭塔仅计建筑攻击与村民驻军火力对箭数的修正，不计算穿透伤害。</p>
        <p className="note">
          数据：{GARRISON_DATA.meta.patch}。<Link to="/about-data">关于数据</Link> ·{' '}
          <a href="https://ugc.aoe2.rocks/general/attributes/attributes/#130-garrison-firepower" target="_blank" rel="noreferrer">
            驻军贡献字段
          </a>{' '}
          ·{' '}
          <a
            href="https://www.ageofempires.com/news/a-sneak-peek-at-new-content-coming-to-age-of-empires-ii-definitive-edition/"
            target="_blank"
            rel="noreferrer"
          >
            官方驻军修正说明
          </a>
        </p>
      </div>
    </section>
  );
}
