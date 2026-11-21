import { Link } from 'react-router-dom';
import type { Unit } from '../../../domain/types';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { DATA_SOURCES, versionLabel } from '../../../shared/utils/dataInfo';
import './unit-charge.css';

type Charge = Pick<Unit, 'chargeType' | 'chargeEvent' | 'maxCharge' | 'rechargeRate' | 'rechargeDuration'>;
interface ChargeKind {
  label: string;
  icon: IconName;
  tone: 'attack' | 'defense' | 'warn';
  description: string;
}

const kinds: Record<number, ChargeKind> = {
  1: { label: '攻击蓄力', icon: 'swords', tone: 'attack', description: '充能用于蓄力攻击，与上方目录基础攻击力分列；容量不直接等同于首击额外伤害。' },
  2: { label: '生命值充能', icon: 'heart', tone: 'defense', description: '固定源归类为生命值充能；具体换算与触发条件未核实。' },
  3: { label: '范围蓄力攻击', icon: 'swords', tone: 'attack', description: '充能用于范围蓄力攻击，与上方目录基础攻击力分列；容量不直接等同于实际伤害。' },
  4: { label: '投射物闪避', icon: 'shield', tone: 'defense', description: '充能用于投射物闪避，并非额外攻击；容量不直接等同于实际可躲次数。' },
  5: { label: '近战格挡', icon: 'shield', tone: 'defense', description: '充能用于格挡近战攻击，并非额外攻击；实际减免与触发条件未核实。' },
  6: { label: '蓄力远程攻击（类型 1）', icon: 'bow-arrow', tone: 'attack', description: '固定源归类为蓄力远程攻击（类型 1）；本期不推导目标类别或弹丸伤害。' },
  7: { label: '蓄力远程攻击（类型 2）', icon: 'bow-arrow', tone: 'attack', description: '固定源归类为蓄力远程攻击（类型 2）；具体触发条件与发射效果未核实。' },
};
const unknown: ChargeKind = {
  label: '充能用途待核实',
  icon: 'triangle-alert',
  tone: 'warn',
  description: '当前版本尚未收录该充能类型的可靠语义说明，以下仅展示固定源静态字段。',
};
const usable = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const unusual = (u: Charge) =>
  (u.chargeEvent ?? 0) < 0 || (usable(u.rechargeDuration) && u.rechargeDuration > 0 && u.rechargeDuration < 0.1) || (u.rechargeRate ?? 0) >= 1000;

interface Reading {
  value: string;
  note: string;
}
function capacity(n?: number): Reading {
  if (!usable(n)) return { value: '待核实', note: '暂无可靠的静态容量记录。' };
  return { value: String(n), note: n === 0 ? '固定源显式记录为 0。' : '静态容量，不含实际效果换算。' };
}
function duration(n: number | undefined, rare: boolean): Reading {
  if (rare) return { value: '不作冷却解读', note: '源换算值极小，非无冷却或无限触发。' };
  if (!usable(n)) return { value: '暂无数据', note: '当前形态未收录满充时长。' };
  if (n === 0) return { value: '0 秒', note: '固定源显式为 0 秒，非无限触发。' };
  const integer = Math.round(n);
  const label = Math.abs(n - integer) < 0.005 ? String(integer) : '约 ' + Number(n.toFixed(2));
  return { value: label + ' 秒', note: '从空到满静态换算，非开局状态。' };
}
function rate(n: number | undefined, rare: boolean): Reading {
  if (rare) return { value: '非常规源值', note: '原始静态值仅作版本对账保留。' };
  if (!usable(n)) return { value: '暂无数据', note: '当前形态未收录恢复速率。' };
  if (n === 0) return { value: '0 /秒', note: '固定源显式记录为 0 /秒。' };
  const rounded = Number(n.toFixed(3));
  const label = Math.abs(rounded - n) < 0.00001 ? String(rounded) : '约 ' + rounded;
  return { value: label + ' /秒', note: '区别于普通攻击间隔。' };
}

function difference(n: number | undefined, previous: number | undefined, threshold = 0): number | undefined {
  if (!usable(n) || !usable(previous)) return undefined;
  const delta = n - previous;
  return Math.abs(delta) < threshold ? 0 : delta;
}

function ChargeStat({
  field,
  title,
  icon,
  reading,
  delta,
  showEqual,
}: {
  field: 'max' | 'duration' | 'rate';
  title: string;
  icon: IconName;
  reading: Reading;
  delta?: number;
  showEqual?: boolean;
}) {
  const seconds = field === 'duration';
  const change = delta ? (delta > 0 ? '+' : '') + Number(delta.toFixed(seconds ? 2 : 3)) + (seconds ? ' 秒' : '') : undefined;
  return (
    <div className="ud-charge-stat" data-charge-stat={field}>
      <dt className="ud-stat-lab">
        <Icon name={icon} />
        {title}
      </dt>
      <dd>
        <strong>
          <span className="num nw">{reading.value}</span>
        </strong>
        {change && (
          <small className={(seconds ? delta! < 0 : delta! > 0) ? 'ud-up' : 'ud-down'}>
            相对普通 <span className="num nw">{change}</span>
          </small>
        )}
        {showEqual && delta === 0 && <small>与普通相同</small>}
        <small>{reading.note}</small>
      </dd>
    </div>
  );
}

export function UnitCharge({ unit, base }: { unit: Charge; base?: Charge }) {
  if (unit.chargeType === undefined || !Number.isFinite(unit.chargeType) || unit.chargeType === 0) return null;
  const kind = kinds[unit.chargeType] ?? unknown;
  const rare = unusual(unit);
  const previous = base && base.chargeType === unit.chargeType && !rare && !unusual(base) ? base : undefined;
  const maxDiff = difference(unit.maxCharge, previous?.maxCharge);
  const timeDiff = difference(unit.rechargeDuration, previous?.rechargeDuration, 0.05);
  const source = DATA_SOURCES.sources.aoe2techtree!;
  const description =
    rare && unit.chargeType === 6
      ? '固定源归类为蓄力远程攻击（类型 1），但含非常规参数（负触发事件或极小换算值），不可解读为 0 秒冷却或无限触发；本期不推导目标类别或弹丸伤害。'
      : kind.description;
  return (
    <section className="ud-charge" aria-label="目录蓄力与充能参数" data-t="unit-charge">
      <header>
        <h3>蓄力与充能</h3>
        <span className={'ud-charge-badge is-' + kind.tone}>
          <Icon name={kind.icon} />
          {kind.label}
        </span>
        {rare && (
          <span className="ud-charge-badge is-warn">
            <Icon name="triangle-alert" />
            非常规源值
          </span>
        )}
      </header>
      <p>{description}</p>
      <dl className="ud-charge-grid">
        <ChargeStat
          field="max"
          title="充能容量"
          icon={kind === unknown ? 'info' : kind.icon}
          reading={capacity(unit.maxCharge)}
          delta={maxDiff}
          showEqual={!!timeDiff}
        />
        <ChargeStat field="duration" title="从空到满" icon="clock" reading={duration(unit.rechargeDuration, rare)} delta={timeDiff} showEqual={!!maxDiff} />
        <ChargeStat
          field="rate"
          title="恢复速率"
          icon="rotate-ccw"
          reading={rate(unit.rechargeRate, rare)}
          delta={difference(unit.rechargeRate, previous?.rechargeRate, 0.001)}
        />
      </dl>
      <footer className="ud-charge-source">
        <p>目录基础攻击力与攻击间隔不含蓄力；当前单位 PK 未计入蓄力／充能。</p>
        来源：aoe2techtree 固定源 · <span className="num nw">{versionLabel(DATA_SOURCES)}</span> ·{' '}
        <a href={`https://github.com/${source.repo}/blob/${source.commit}/scripts/generateDataFiles.py#L416-L424`}>固定版本字段说明</a> ·{' '}
        <Link to="/about-data">数据说明</Link>
      </footer>
    </section>
  );
}
