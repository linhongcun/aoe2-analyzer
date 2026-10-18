import { Link, useSearchParams } from 'react-router-dom';
import { buildOrders } from '../../../data/buildOrders';
import { fmtSide } from '../../duel/logic/state';
import './rushDefense.css';

const guides = [
  {
    id: 'militia',
    name: '民兵快攻',
    cue: '黑暗时代发现提前兵营、少量采金或民兵离家时。',
    army: '黑暗时代先用现有侦察观察，封建落地后可先补 2 个步弓手驱赶少量民兵。弓手未出前不要让村民在空地追打；敌方升级武士后需重新评估。',
    wall: '在伐木、浆果周围补短木墙，留回城镇中心的通道；不为堵整个地图拖延升时代。近战兵已经接近落单村民时，先退入城镇中心。通常先保经济，不急着投入箭塔。',
    build: 'archers-19',
    a: 4,
    b: 74,
    na: 2,
    nb: 3,
    label: '2 步弓手对 3 民兵',
  },
  {
    id: 'scouts',
    name: '肉马',
    cue: '对手到封建，看到马厩或侦察骑兵开始绕向资源点时。',
    army: '到封建后先补 2 个长矛兵，分别守最暴露的资源；看到对方继续加马再增援。矛兵保护村民，不追着骑兵跑出防线。',
    wall: '来袭前补齐伐木点和矿点缺口。短墙被拆或骑兵绕入时，村民优先进城镇中心；有安全后撤位置就不急着造箭塔。',
    build: 'scouts-18',
    a: 93,
    b: 448,
    na: 2,
    nb: 3,
    label: '2 长矛兵对 3 斥候骑兵',
  },
  {
    id: 'archers',
    name: '步弓',
    cue: '看到靶场、持续采金，或第一批弓手接近木线时。',
    army: '封建先补 4 个掷矛手作为第一批防守兵，聚齐再接战；若伴随骑兵，再补长矛兵保护。敌方数量和箭羽升级都会改变所需数量。',
    wall: '木墙挡不住射击，应把村民移出射程。没有安全木线或金矿可换时，考虑在能覆盖关键资源的位置补防守箭塔；来不及建塔就先进城镇中心。',
    build: 'archers-19',
    a: 7,
    b: 4,
    na: 4,
    nb: 4,
    label: '4 掷矛手对 4 步弓手',
  },
  {
    id: 'towers',
    name: '塔爆',
    cue: '看到敌方村民前压、采石，或关键资源附近出现塔基时。',
    army: '敌塔未完工且没有敌军掩护时，可集中 6 个已织布村民尝试驱赶 5 个前置村民；条件不满足就撤离。封建后可补 2 个步弓手压制后续建筑者。',
    wall: '先把采集村民撤出塔的覆盖范围，保留另一片木线。防守塔只在能覆盖关键资源且不会被对方多塔集火的位置建；不要逐个冲进已经完工的塔下。近身遭袭时用城镇中心驻扎保护村民。',
    build: 'archers-19',
    a: 83,
    b: 83,
    na: 6,
    nb: 5,
    label: '6 村民对 5 村民（均已织布）',
  },
];

function CountText({ text }: { text: string }) {
  return text.split(/(\d+ 个)/g).map((part, i) =>
    /^\d+ 个$/.test(part) ? (
      <span className="rush-count" key={i}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export default function RushDefense() {
  const [params, setParams] = useSearchParams();
  const guide = guides.find((g) => g.id === params.get('rush')) ?? guides[0]!;
  const techs = guide.id === 'towers' ? [22] : [];
  const side = (uid: number) => fmtSide({ uid, civ: 'Britons', age: 2, techs, team: [] });
  const duelUrl = `/duel?a=${side(guide.a)}&b=${side(guide.b)}&m=n&na=${guide.na}&nb=${guide.nb}`;
  return (
    <section className="rush-defense" aria-label="应对早期进攻">
      <h3>应对早期进攻</h3>
      <label>
        对手打法{' '}
        <select
          value={guide.id}
          onChange={(e) =>
            setParams(
              (p) => {
                const n = new URLSearchParams(p);
                n.set('rush', e.target.value);
                return n;
              },
              { replace: true },
            )
          }
        >
          {guides.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <h4>何时开始应对</h4>
      <p>{guide.cue}</p>
      <h4>先出什么、出几个</h4>
      <p>
        <CountText text={guide.army} />
      </p>
      <h4>补墙、箭塔与驻扎</h4>
      <p>{guide.wall}</p>
      <p>
        <Link className="ulink" to={duelUrl}>
          打开 PK 演练：{guide.label}
        </Link>
      </p>
      <p className="note">
        数量是本站的起步练习建议，需要按侦察结果增减。演练固定双方不列颠、封建时代、无团队加成，{guide.id === 'towers' ? '仅研究织布机' : '无主动科技'}；可在 PK
        页修改文明和科技。群战模拟不含射程拉扯、围墙、塔和城镇中心火力，不能把胜负直接当作防守保证。
      </p>
      {guide.id === 'towers' && <p className="note">此预设只比较村民近战，不模拟打塔。敌塔已完工时不适用。</p>}
      <p>
        <Link className="ulink" to={`/builds?bo=${guide.build}`}>
          参考开局：{buildOrders.find((b) => b.id === guide.build)!.name.zh}
        </Link>
      </p>
      <p className="note">参考其升时代和建造顺序，遇到快攻优先调整防守，不必照抄全部出兵步骤。</p>
      <details>
        <summary>来源与适用范围</summary>
        <ul>
          <li>
            <a href="https://www.ageofempires.com/learn-to-play/defending-your-empires-aoe2/" target="_blank" rel="noopener noreferrer">
              官方：侦察、防御建筑与村民驻扎
            </a>
          </li>
          <li>
            <a href="https://sitaux.com/skirms-and-spear-defence/" target="_blank" rel="noopener noreferrer">
              Sitaux：掷矛手与长矛兵防守
            </a>
          </li>
          <li>
            <a href="https://sitaux.com/tower-rush/" target="_blank" rel="noopener noreferrer">
              Sitaux：塔爆的前置村民与建塔节奏
            </a>
          </li>
        </ul>
        <p className="note">2026-10-18 已核对；Sitaux 网站为 2026 年。中文应对建议由本站整理，具体人数为可调整演练场景，未引用来源的胜率或胜负保证。</p>
      </details>
    </section>
  );
}
