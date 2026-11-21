import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { entityCivLink } from '../../../domain/civRoute';
import { DPS_UNAVAILABLE_REASON } from '../../../domain/duel';
import { formatHp } from '../../../domain/hpFormat';
import { AGE_ZH } from '../../../domain/ratings';
import { DEFAULT_AGE, fmtClock, gatherModel, realCost } from '../../../domain/realCost';
import type { UnitRelatedTech } from '../../../domain/relatedTechs';
import type { Cost, Unit } from '../../../domain/types';
import { BuildingIcon, TechLink } from '../../../shared/ui/art';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { RangeB } from '../../../shared/ui/RangeB';
import { RangeHelp } from '../../../shared/ui/RangeHelp';
import { Basis } from '../../../shared/ui/RealCost';

export function StatTile({ icon, label, value, sub, stat }: { icon: IconName; label: string; value: ReactNode; sub?: ReactNode; stat: string }) {
  return (
    <div className="ud-stat" data-stat={stat}>
      <div className="ud-stat-lab">
        <Icon name={icon} />
        {label}
      </div>
      <div className="ud-stat-val">{value}</div>
      {sub ? <div className="ud-stat-sub">{sub}</div> : null}
    </div>
  );
}

export function EliteDelta({ n, hp, lower }: { n: number | undefined; hp?: boolean; lower?: boolean }) {
  if (n == null || n === 0) return null;
  const good = lower ? n < 0 : n > 0;
  const text = `${n > 0 ? '+' : ''}${hp ? formatHp(n) : Math.round(n * 100) / 100}`;
  return (
    <span className={good ? 'ud-up' : 'ud-down'}>
      相对普通 <span className="num nw">{text}</span>
    </span>
  );
}

function CatalogAttackTiming({ u, base, elite }: { u: Unit; base: Unit; elite: boolean }) {
  const packed = u.id === 331;
  const hasAttack = u.atk > 0 || u.atks.some(([, amount]) => amount > 0);
  const canShowInterval = packed || hasAttack;
  const delay = u.attackDelaySeconds;
  const hasDelay = typeof delay === 'number' && Number.isFinite(delay) && delay >= 0;
  const repeats = canShowInterval && u.rof > 0;
  return (
    <div className="ud-attack-timing" role="group" aria-label="目录基础攻击计时">
      {hasAttack && !packed && (
        <StatTile
          icon="sword"
          stat="attack-delay"
          label="出手前摇"
          value={hasDelay ? <span className="num nw">{delay} 秒</span> : <span className="ud-stat-reason">暂无数据</span>}
          sub={hasDelay ? '从攻击动作开始到出手，不含弹道飞行时间。' : '当前形态未收录前摇秒数。'}
        />
      )}
      <StatTile
        icon="clock"
        stat="rof"
        label={packed ? '攻击间隔（展开态）' : '攻击间隔'}
        value={
          repeats ? (
            <span className="num nw">
              {u.rof}
              {packed ? '秒' : ' 秒'}
            </span>
          ) : (
            <span className="ud-stat-reason" data-t={canShowInterval ? 'rof-reason' : undefined}>
              {canShowInterval ? DPS_UNAVAILABLE_REASON : '不适用：无普通攻击'}
            </span>
          )
        }
        sub={
          repeats ? (
            <>
              {!packed && <div>连续攻击时，两次出手的间隔。</div>}
              <EliteDelta n={elite && base.rof > 0 ? u.rof - base.rof : undefined} lower />
            </>
          ) : undefined
        }
      />
    </div>
  );
}

export function CatalogStats({ u, base, elite }: { u: Unit; base: Unit; elite: boolean }) {
  return (
    <div className="ud-stat-grid">
      <CatalogAttackTiming u={u} base={base} elite={elite} />
      <StatTile
        icon="heart"
        stat="hp"
        label="生命值"
        value={<span className="num nw">{formatHp(u.hp)}</span>}
        sub={<EliteDelta n={elite ? u.hp - base.hp : undefined} hp />}
      />
      <StatTile
        icon={u.rng > 1 ? 'bow-arrow' : 'sword'}
        stat="atk"
        label={u.id === 331 ? '攻击力（展开态）' : '攻击力'}
        value={<span className="num nw">{u.atk}</span>}
        sub={<EliteDelta n={elite ? u.atk - base.atk : undefined} />}
      />
      <StatTile
        icon="shield"
        stat="ma"
        label={u.id === 331 ? '近战护甲（打包态）' : '近战护甲'}
        value={<span className="num nw">{u.ma}</span>}
        sub={<EliteDelta n={elite ? u.ma - base.ma : undefined} />}
      />
      <StatTile
        icon="shield-half"
        stat="pa"
        label={u.id === 331 ? '穿刺护甲（打包态）' : '穿刺护甲'}
        value={<span className="num nw">{u.pa}</span>}
        sub={<EliteDelta n={elite ? u.pa - base.pa : undefined} />}
      />
      <StatTile
        icon="crosshair"
        stat="rng"
        label={u.id === 331 ? '射程（展开态）' : '射程'}
        value={<span className="num nw">{u.rng}</span>}
        sub={
          <>
            <EliteDelta n={elite ? u.rng - base.rng : undefined} />
            <RangeB u={u} />
            <RangeHelp u={u} />
            {u.minr ? (
              <span>
                最小射程 <span className="num nw">{u.minr}</span>
              </span>
            ) : null}
          </>
        }
      />
      <StatTile
        icon="footprints"
        stat="spd"
        label={u.id === 331 ? '移动速度（打包态）' : '移动速度'}
        value={<span className="num nw">{u.spd}</span>}
        sub={<EliteDelta n={elite ? u.spd - base.spd : undefined} />}
      />
      <StatTile
        icon="eye"
        stat="los"
        label="视野"
        value={<span className="num nw">{u.los}</span>}
        sub={<EliteDelta n={elite ? u.los - base.los : undefined} />}
      />
    </div>
  );
}

export function BuildingTag({ id, zh, building, civ }: { id: number; zh: string; building?: { pic: number }; civ?: string }) {
  if (!building) return <span className="ud-tag">{zh}</span>;
  return (
    <Link className="ud-tag" to={entityCivLink('building', id, civ)}>
      <BuildingIcon b={building} />
      {zh}
    </Link>
  );
}

export function GatherLine({ u, cost, age, civ }: { u: Unit; cost: Cost; age?: number; civ: string }) {
  const a = Math.max(u.age, age ?? DEFAULT_AGE);
  const rc = realCost(cost, gatherModel(a, civ));
  if (!(rc.total > 0)) return null;
  return (
    <section className="ud-section" id="unit-gather" aria-label="采集时间估算">
      <h2>采集时间估算</h2>
      <p className="ud-kicker">采集时间估算，不是训练价。训练资源按本页已出示的造价；没有折后训练价时用目录造价。未选时代按城堡时代。食物按农田，不含播种。</p>
      <p className="ud-gather" data-t="rc-uline">
        <Icon name="clock" />
        <span className="num nw" data-t="rc-uline-time">
          ≈ 1个村民 {fmtClock(rc.total)}
        </span>
        <span className="ud-kicker">
          {AGE_ZH[a]}
          {rc.hasFood ? ' · 按农田计' : ''}
          {rc.hasFood ? ' · 不含播种' : ''}
        </span>
      </p>
      <Basis age={a} food={rc.hasFood} compact />
    </section>
  );
}

export function RelatedTechs({ items, civ }: { items: UnitRelatedTech[]; civ?: string }) {
  return (
    <div data-t="unit-related-techs">
      <p className="ud-kicker">已建模的数值科技；{civ ? `按${civByEn(civ)?.zh ?? civ}科技树筛选` : '通用科技仍以各文明科技树为准'}。未建模的说明效果未列入。</p>
      {items.length ? (
        <div className="uchips">
          {items.map(({ t, civs: owners }) => (
            <span key={t.id} className="unit-related-tech">
              <TechLink t={t} />
              {!!owners.length && <small>{owners.map((c) => civByEn(c)?.zh ?? c).join('、')}限定</small>}
            </span>
          ))}
        </div>
      ) : (
        <p className="ud-kicker">当前单位暂无已建模的数值科技</p>
      )}
    </div>
  );
}
