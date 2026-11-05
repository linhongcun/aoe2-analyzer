import { Link } from 'react-router-dom';
import { damageByClass } from '../../../domain/duel';
import { AGE_ZH } from '../../../domain/ratings';
import type { Unit } from '../../../domain/types';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';

type Contribution = { state: 'ready'; attack: number; armor: number; damage: number } | { state: 'pending' | 'no-bonus' | 'unmatched' };
const tupleList = (value: unknown): value is [string, number][] =>
  Array.isArray(value) &&
  value.every((item) => Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && item[0].length > 0 && Number.isFinite(item[1]));

function contribution(a: Unit | undefined, d: Unit | undefined, category: string): Contribution {
  if (!a || !d || !tupleList(a.atks) || !tupleList(d.armc)) return { state: 'pending' };
  const attack = a.atks.filter(([name]) => name === category);
  const armor = d.armc.filter(([name]) => name === category);
  if (attack.length > 1 || armor.length > 1) return { state: 'pending' };
  if (!attack.length) return { state: 'no-bonus' };
  if (!armor.length) return { state: 'unmatched' };
  const result = damageByClass({ attack: { [category]: attack[0]![1] } }, { armor: { [category]: armor[0]![1] } })[0]!;
  return Number.isFinite(result.damage) ? { state: 'ready', attack: result.attack, armor: result.armor, damage: result.damage } : { state: 'pending' };
}

function CounterRow({ a, d, category, age, unitById }: { a: number; d: number; category: string; age: number; unitById: Readonly<Record<number, Unit>> }) {
  const attacker = unitById[a],
    defender = unitById[d];
  const result = contribution(attacker, defender, category);
  return (
    <article data-counter-pair={`${a}-${d}`}>
      <h4>
        {attacker?.zh ?? '攻方资料待确认'} 对 {defender?.zh ?? '目标资料待确认'}
      </h4>
      {attacker && attacker.age < age && <p className="note">{AGE_ZH[attacker.age]?.replace('时代', '')}形态沿用</p>}
      {result.state === 'ready' ? (
        <dl className="detail-cost-grid">
          <div>
            <dt>{category}攻击加成</dt>
            <dd>
              <span className="num nw">{result.attack}</span>
            </dd>
          </div>
          <div>
            <dt>目标{category}类护甲</dt>
            <dd>
              <span className="num nw">{result.armor}</span>
            </dd>
          </div>
          <div>
            <dt>该类别贡献</dt>
            <dd>
              <span className="num nw">{result.damage}</span>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="note">{result.state === 'pending' ? '数据待确认' : result.state === 'no-bonus' ? '无该类加成' : '不匹配，不参与该类别伤害'}</p>
      )}
    </article>
  );
}

/** 有限基础目录示例，独立于当前文明、科技与PK总伤害模型。 */
export function AgeCounterBonuses({ unitId, unitById }: { unitId: number; unitById: Readonly<Record<number, Unit>> }) {
  const knight = [38, 283, 569].includes(unitId);
  if (!knight && ![8, 530].includes(unitId)) return null;
  const cards = knight
    ? [
        {
          age: 3,
          pairs: [
            [358, 38],
            [329, 38],
          ],
        },
        {
          age: 4,
          pairs: [
            [359, 283],
            [330, 283],
            [359, 569],
            [330, 569],
          ],
        },
      ]
    : [
        {
          age: 3,
          pairs: [
            [7, 8],
            [6, 8],
          ],
        },
        { age: 4, pairs: [[6, 530]] },
      ];
  return (
    <DetailSection title="按时代类别加成对照">
      <p className="note">固定基础参考，未含科技、文明和团队加成。仅比较指定类别贡献，不是单次总伤害或胜负。</p>
      <p className="note">常规目录时代示例；文明提前解锁、禁训及升级以科技树为准。只列常见基础形态，特殊文明／团队形态未列。</p>
      <div className="two">
        {cards.map((card) => (
          <div key={card.age}>
            <h3>{AGE_ZH[card.age]}</h3>
            {card.pairs.map(([a, d]) => (
              <CounterRow key={`${a}-${d}`} a={a!} d={d!} category={knight ? '骑兵' : '弓手'} age={card.age} unitById={unitById} />
            ))}
          </div>
        ))}
      </div>
      <p className="note">
        来源：aoe2techtree目录的攻击加成与护甲类别，按站内同类别规则结算；DE <span className="num nw">{DATA_SOURCES.patch.build}</span>。
      </p>
      <Link className="community-tool-entry" to="/about-data">
        数据说明
      </Link>
    </DetailSection>
  );
}
