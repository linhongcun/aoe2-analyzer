import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Unit } from '../../../domain/types';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import { hasSplashHelp } from './SplashMechanics';
import './unit-blast.css';

type BlastUnit = Pick<Unit, 'id' | 'blast' | 'blastDamage' | 'blastAttackLevel' | 'friendlyFireDamage'>;
const levelNames = ['含资源', '含树木', '周边单位', '仅主目标'] as const;
const known = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
// DAT stores single-precision floats. Keep their raw values in the catalog and drop binary tails for display.
const displayValue = (n: number) => Number(n.toPrecision(7));
const num = (value: string | number) => <span className="num nw">{value}</span>;

function BlastStat({ field, label, icon, value, note }: { field: string; label: string; icon: IconName; value: ReactNode; note: ReactNode }) {
  return (
    <div className="ud-blast-stat" data-blast-stat={field}>
      <dt className="ud-stat-lab">
        <Icon name={icon} />
        {label}
      </dt>
      <dd>
        <strong>{value}</strong>
        <small>{note}</small>
      </dd>
    </div>
  );
}

function AttackStats({ unit }: { unit: BlastUnit }) {
  const damage = unit.blastDamage,
    level = unit.blastAttackLevel;
  const hasLevel = known(level) && Number.isSafeInteger(level) && level >= 0;
  const decoded = hasLevel ? levelNames[level] : undefined;
  const unknownLevel = hasLevel && decoded === undefined;
  let damageValue: ReactNode = '暂无数据';
  let damageNote: ReactNode = '当前形态未收录次要目标系数，不会补成 0。';
  if (known(damage)) {
    if (damage < 0) {
      damageValue = '固定伤害编码';
      damageNote = <>固定源负值（{num(displayValue(damage))}）按 AGE 释义为固定伤害编码，非负百分比；实际扣血未核实。</>;
    } else if (damage === 0) {
      damageValue = num(0);
      damageNote = <>固定源显式记录为 {num(0)}。</>;
    } else {
      damageValue = num('×' + displayValue(damage));
      damageNote = '正值为基础攻击倍率，不等同于实际扣血或衰减。';
    }
  }
  const levelValue = hasLevel ? (
    decoded ? (
      <>
        等级 {num(level)}（{decoded}）
      </>
    ) : (
      <>编码 {num(level)}（未解码）</>
    )
  ) : (
    '暂无数据'
  );
  return (
    <>
      <div className="ud-blast-head">
        <h3>范围攻击与溅射参数</h3>
        <span className="ud-blast-badge is-offense">
          <Icon name="swords" />
          攻击方（本单位打出）
        </span>
        {unknownLevel && (
          <span className="ud-blast-badge is-warn">
            <Icon name="triangle-alert" />
            层级未解码
          </span>
        )}
      </div>
      <dl className="ud-blast-grid">
        <BlastStat field="radius" label="溅射范围" icon="crosshair" value={num(displayValue(unit.blast))} note="波及半径原始字段（非伤害比例；单位未核实）。" />
        <BlastStat field="damage" label="次要目标系数" icon="scale" value={damageValue} note={damageNote} />
        <BlastStat
          field="level"
          label="波及对象层级"
          icon="info"
          value={levelValue}
          note={
            decoded ? (
              '按 AGE 说明仅指波及对象层级，非敌我误伤开关。'
            ) : unknownLevel ? (
              <>超出 AGE {num('0–3')} 基础层级，不作敌我误伤判定。</>
            ) : (
              '当前形态未收录波及对象层级。'
            )
          }
        />
      </dl>
    </>
  );
}

export function UnitBlast({ unit, catalog }: { unit: BlastUnit; catalog: readonly Pick<Unit, 'id' | 'friendlyFireDamage'>[] }) {
  const recipient = unit.friendlyFireDamage;
  const hasRecipient = known(recipient) && recipient >= 0;
  const offense = known(unit.blast) && unit.blast > 0;
  if (!offense && (!hasRecipient || recipient === 1)) return null;
  const source = DATA_SOURCES.sources.dat!;
  const patch = DATA_SOURCES.patch;
  const onlyRecipient =
    hasRecipient &&
    recipient !== 1 &&
    catalog.some((row) => row.id === unit.id && row.friendlyFireDamage === recipient) &&
    catalog.every((row) => row.id === unit.id || row.friendlyFireDamage === 1);
  return (
    <div role="region" aria-label="范围攻击与友方误伤" className="ud-blast-box" data-blast="panel">
      {offense && <AttackStats unit={unit} />}
      {(!hasRecipient || recipient !== 1) && (
        <div className="ud-blast-ff">
          <div className="ud-blast-head">
            <h3>受到友方范围伤害倍率</h3>
            <span className="ud-blast-badge is-defense">
              <Icon name="shield" />
              受方修正 · 非打出误伤
            </span>
          </div>
          <strong>{hasRecipient ? num('×' + displayValue(recipient)) : '暂无数据'}</strong>
          <p>
            {hasRecipient ? (
              <>
                本单位<strong>受到</strong>友方范围攻击时的静态伤害倍率，{recipient === 0.5 ? '不代表本单位对友军打出的误伤减半' : '只描述承受伤害一侧'}
                {onlyRecipient ? (
                  <>
                    ；{num('DE ' + patch.build)} 编目模板记录中仅本单位非 {num(1)}，不推论为全游戏对象唯一。
                  </>
                ) : (
                  '。'
                )}
              </>
            ) : (
              <>
                当前形态未收录受方友军范围伤害倍率；不会补成 {num(0)} 或 {num(1)}。
              </>
            )}
          </p>
        </div>
      )}
      <div className="ud-blast-source">
        <p>
          {hasSplashHelp(unit.id)
            ? '此处列出范围与对象层级静态字段；落点溅射与最小射程见下方既有「溅射与最小射程」，与远程穿透（如弩炮）属不同机制。不承诺敌我误伤矩阵或边缘衰减，不改单位 PK 或攻城工具。'
            : '不承诺具体敌我误伤判定、实际扣血或边缘衰减；不与远程穿透（如弩炮）混同，也不改动单位 PK 或攻城拆建筑计算。'}
        </p>
        来源：固定 DE DAT（{num('DE ' + patch.build + '，' + patch.date)}）与 AGE 字段说明 ·{' '}
        <a href={`https://github.com/${source.repo}/blob/${source.commit}/${source.path}`}>固定版本 DAT</a> ·{' '}
        <a href="https://github.com/Tapsa/AGE/blob/eb1202b70bf3a45d4264212b53b70bbad4369e98/AGE_Frame/Units.cpp#L4456-L4463">AGE 释义</a> ·{' '}
        <Link to="/about-data">数据说明</Link>
      </div>
    </div>
  );
}
