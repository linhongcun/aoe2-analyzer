import { Link } from 'react-router-dom';
import { civByEn } from '../../data';
import { buildOrders } from '../../data/buildOrders';
import './maps.css';

const maps = [
  {
    id: 'arabia',
    name: '阿拉伯',
    type: '开放陆图',
    resources: '羊、野猪、鹿和浆果支撑前期食物；树林和矿点分散，部分资源可能暴露在进攻方向。先侦察再决定围墙位置，陆图开局不依赖渔船。',
    opening: '优先练习侦察骑兵或步弓开局，利用封建兵力保护资源。裸直城需要先确认安全，不能仅凭文明适合骑士就跳过防守。',
    builds: ['scouts-18', 'archers-19'],
    civs: [
      ['Franks', '骑兵和食物经济加成适合侦察转骑士。'],
      ['Britons', '弓手路线清晰，城堡时代可利用射程优势。'],
    ],
    sources: [['AOE2 Guide · Arabia（2021-06-15）', 'https://aoe2.guide/arabia/']],
  },
  {
    id: 'arena',
    name: '竞技场',
    type: '封闭陆图',
    resources: '出生自带石墙，前期食物和部分矿点在墙内，侧后方通常有树林；墙外资源和圣物需要争夺。墙内空间有限，扩张前先侦察。',
    opening: '可用速升城堡作为起点，再选择补城镇中心、僧侣争圣物或攻城推进。看到前置城堡和攻城器时，先保住墙内经济。',
    builds: ['fast-castle-boom'],
    civs: [
      ['Teutons', '农田经济与防御加成适合先稳住经济。'],
      ['Bohemians', '僧侣和火药路线适合城堡之后的推进。'],
    ],
    sources: [['AOE2 Guide · Arena（2024-09-30）', 'https://aoe2.guide/arena/']],
  },
  {
    id: 'nomad',
    name: '游牧',
    type: '自行选址、陆海并重',
    resources: '开局没有城镇中心，村民位置分散。优先选择靠树林、能取得食物的落脚点；海岸提供捕鱼机会，野猪等陆上食物要靠探索寻找。',
    opening: '先落城镇中心并安排码头，保持村民与渔船生产；侦察近邻后决定速封抢水还是安全直城。下面的直城流程仅参考陆上经济转型，不能照搬它的出生配置和时间。',
    builds: ['fast-castle-boom'],
    civs: [
      ['Spanish', '建造加成与城堡兵路线提供可练习的转型。'],
      ['Koreans', '船只和战车方向可结合邻近敌人的位置选择。'],
    ],
    sources: [['Sitaux · Nomad（2026 网站，2026-10-18 核对）', 'https://sitaux.com/nomad/']],
  },
  {
    id: 'water',
    name: '海图',
    type: '岛屿及以水域为主的地图',
    resources: '岛屿之间缺少陆路，渔场成为重要食物来源。陆上树林同时负担码头、渔船、军舰和房屋，木材调配比纯陆图更紧；猪、岸鱼和树林位置以实图侦察为准。',
    opening:
      '先用单码头建立捕鱼经济，升封建时判断是否补军用码头。敌方码头近时重视抢先出船，距离远时可以多投渔船。下面的单码头开局适合有安全近岸渔场的水陆混合图，纯岛图仍需按敌方距离调整造船。',
    builds: ['hybrid-fish-18'],
    civs: [
      ['Japanese', '渔船加成有助于发展和保护海上经济。'],
      ['Italians', '升时代和海军相关加成适合练习水战节奏。'],
    ],
    sources: [
      ['Sitaux · Water Maps（2026 网站，2026-10-18 核对）', 'https://sitaux.com/water-maps/'],
      ['Survivalist 开局整理 · AoE Buddy（2026-10-18 核对）', 'https://aoebuddy.com/build-orders/18-fishing-ship-build'],
    ],
  },
];

export default function Maps() {
  return (
    <section className="pane map-guide">
      <h2>地图与开局</h2>
      <p className="note">
        常见地图的资源与打法参考。地图生成会随版本和随机种子变化；这里不表示当前天梯地图池。文明推荐是学习路线建议，实际加成请查看文明详情。
      </p>
      <nav aria-label="选择地图">
        {maps.map((m) => (
          <button type="button" key={m.id} onClick={() => document.getElementById(`map-${m.id}`)?.scrollIntoView()}>
            {m.name}
          </button>
        ))}
      </nav>
      {maps.map((m) => (
        <article key={m.id} id={`map-${m.id}`} aria-label={m.name}>
          <h3>
            {m.name} <small>{m.type}</small>
          </h3>
          <h4>资源特点</h4>
          <p>{m.resources}</p>
          <h4>主流开局</h4>
          <p>{m.opening}</p>
          <div className="map-links">
            {m.builds.map((id) => (
              <Link key={id} to={`/builds?bo=${id}`}>
                {buildOrders.find((b) => b.id === id)!.name.zh}
              </Link>
            ))}
          </div>
          {m.id === 'water' && (
            <section aria-label="码头与渔船经济">
              <h4>码头与渔船经济</h4>
              <p>混合图速封参考：先建一座码头，安排三艘渔船，再以封建军舰保护捕鱼。村民数、渔船数与总人口要分开读，渔船也占人口。</p>
              <p>
                第一个码头放在可持续捕鱼且容易保护的位置。补码头前先检查木材和持续造船能力；一开始连铺多个空码头会挤占经济。保持造房，受攻击时把渔船撤到军舰保护范围，失去水域后及时转农田。
              </p>
              <p>
                <a href="https://aoebuddy.com/build-orders/18-fishing-ship-build" target="_blank" rel="noopener noreferrer">
                  查看已核对的单码头速封流程（外部）
                </a>
              </p>
            </section>
          )}
          <h4>推荐文明</h4>
          <ul>
            {m.civs.map(([id, why]) => (
              <li key={id}>
                <Link to={`/civ/${id}`}>{civByEn(id!)?.zh}</Link>：{why}
              </li>
            ))}
          </ul>
          <details>
            <summary>来源与核对日期</summary>
            <ul>
              {m.sources.map(([name, url]) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {name}
                  </a>
                </li>
              ))}
            </ul>
            <p className="note">2026-10-18 核对。仅整理上述来源中的地图特征和开局思路；资源具体数量与产出不作固定承诺。</p>
          </details>
        </article>
      ))}
    </section>
  );
}
