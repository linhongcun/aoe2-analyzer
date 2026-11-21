import { Link } from 'react-router-dom';
import type { Tech, Unit } from '../../../domain/types';
import { DATA_PATCH, SOURCE_PINS } from '../../../data/sources';
import { Icon } from '../../../shared/ui/Icon';
import { baselineIntervalText, CONVERSION_ANCHOR, conversionFacts, DEVOTION_ID, FAITH_ID, formatSigned, MONK_ID } from '../conversion';
import './unit-conversion.css';

const fields = [
  ['chanceMod', '招降机会修正', 'scale'],
  ['minTimeMod', '最短时间修正', 'clock'],
  ['maxTimeMod', '最长时间修正', 'clock'],
] as const;
const known = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function ConversionTarget({ unit, civ, techs }: { unit: Unit; civ?: string; techs: Tech[] }) {
  const base = unit.conversionResistance;
  const partial = fields.some(([key]) => !known(base?.[key]));
  const zero = fields.every(([key]) => base?.[key] === 0);
  const bonus = !civ || civ === 'Bengalis' ? unit.bengaliConversion : undefined;
  const facts = conversionFacts(techs);
  return (
    <section className="ud-cr-box" aria-label="目标招降抗性" data-conversion-target="panel">
      <h3>目标单位基础抗性</h3>
      <span className={'ud-cr-badge ' + (partial ? 'is-warn' : zero ? 'is-neutral' : 'is-resist')}>
        <Icon name={partial ? 'triangle-alert' : zero ? 'info' : 'shield'} />
        {partial ? (
          '部分抗性字段缺失'
        ) : zero ? (
          <>
            目标基础无额外抗性（<span className="num nw">0 / 0 / 0</span>）
          </>
        ) : (
          '含目标基础抗性'
        )}
      </span>
      <p>
        {partial
          ? '固定源缺少部分招降抗性修正字段，缺失项显示「暂无数据」且不会补成 0。'
          : zero
            ? '零修正仅表示该单位不自带额外招降抗性，不代表无法招降或招降概率为零；实际窗口仍受文明加成与修道院科技影响。'
            : '以下为目标单位自带的静态修正量（第一层），不是必定招降耗时；不自动叠加文明加成或修道院科技合成保证时长。'}
      </p>
      <dl className="ud-cr-grid">
        {fields.map(([key, label, icon]) => {
          const n = base?.[key];
          const note = !known(n)
            ? '当前形态未收录，不补 0。'
            : key === 'chanceMod'
              ? n === 0
                ? '零修正，非免疫或零概率。'
                : '静态原始修正量（非百分比）。'
              : n === 0
                ? '不附加' + label.replace('时间', '招降时间') + '。'
                : '目标基础静态修正量。';
          return (
            <div className="ud-cr-stat" key={key} data-conversion-field={key}>
              <dt>
                <Icon name={icon} />
                {label}
              </dt>
              <dd className="num nw">{known(n) ? (key === 'chanceMod' ? n : formatSigned(n)) : '暂无数据'}</dd>
              <dd className="ud-cr-note">{note}</dd>
            </div>
          );
        })}
      </dl>
      {bonus && (
        <div className="ud-cr-civ" data-conversion-target="bengali">
          <h4>文明修正层：孟加拉象兵抗招降加成</h4>
          <span className="ud-cr-badge is-civ">{civ ? '当前已选：孟加拉' : '仅孟加拉文明适用'}</span>
          <p>
            最短招降时间修正 <span className="num nw">{formatSigned(bonus.minTimeMod)}</span>　最长招降时间修正{' '}
            <span className="num nw">{formatSigned(bonus.maxTimeMod)}</span>
          </p>
          <p>
            来源于固定 DAT 孟加拉象兵效果（属性 <span className="num nw">111 / 112</span>）。孟加拉文明说明中的「受到的额外伤害{' '}
            <span className="num nw">{formatSigned(-100 * bonus.bonusDamageReduction)}%</span>
            」对应克制伤害减免，不是招降概率；此文明层修正与上方单位基础修正及下方科技层分列，站内不合成保证招降时长。
          </p>
        </div>
      )}
      <p className="ud-cr-links">
        修道院科技修正层（另列，不合成总耗时）：
        {(
          [
            [DEVOTION_ID, '虔诚', facts.devotion],
            [FAITH_ID, '信念', facts.faith],
          ] as const
        ).map(([id, label, tech]) => {
          const delta = tech?.delta;
          return (
            <Link key={id} to={'/tech/' + id}>
              {label}（<span className="num nw">{delta ? formatSigned(delta.min) + ' / ' + formatSigned(delta.max) : '待确认'}</span>）
            </Link>
          );
        })}
        　
        <Link to={'/unit/' + MONK_ID + '#' + CONVERSION_ANCHOR}>
          查看僧侣招降机制（基准 <span className="num nw">{baselineIntervalText()}</span>）
        </Link>
      </p>
      <p className="note ud-cr-links">
        基础抗性与文明层数据来源：<a href={`https://github.com/${SOURCE_PINS.dat.repo}/blob/${SOURCE_PINS.dat.commit}/${SOURCE_PINS.dat.path}`}>固定 DE DAT</a>
        （
        <span className="num nw">
          DE {DATA_PATCH.build}，{DATA_PATCH.date}
        </span>
        ）。
      </p>
    </section>
  );
}
