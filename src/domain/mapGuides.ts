export interface MapGuide {
  resources: string;
  opening: string;
  builds: string[];
  civs: [string, string][];
  sources: [string, string][];
}

/** 保留原有四类地图的已核对攻略和链接。 */
export const mapGuides: Record<string, MapGuide> = {
  arabia: {
    resources: '羊、野猪、鹿和浆果支撑前期食物；树林和矿点分散，部分资源可能暴露在进攻方向。先侦察再决定围墙位置，陆图开局不依赖渔船。',
    opening: '优先练习侦察骑兵或步弓开局，利用封建兵力保护资源。裸直城需要先确认安全，不能仅凭文明适合骑士就跳过防守。',
    builds: ['scouts-18', 'archers-19'],
    civs: [
      ['Franks', '骑兵和食物经济加成适合侦察转骑士。'],
      ['Britons', '弓手路线清晰，城堡时代可利用射程优势。'],
    ],
    sources: [['AOE2 Guide · Arabia（2021-06-15）', 'https://aoe2.guide/arabia/']],
  },
  arena: {
    resources: '出生自带石墙，前期食物和部分矿点在墙内，侧后方通常有树林；墙外资源和圣物需要争夺。墙内空间有限，扩张前先侦察。',
    opening: '可用速升城堡作为起点，再选择补城镇中心、僧侣争圣物或攻城推进。看到前置城堡和攻城器时，先保住墙内经济。',
    builds: ['fast-castle-boom'],
    civs: [
      ['Teutons', '农田经济与防御加成适合先稳住经济。'],
      ['Bohemians', '僧侣和火药路线适合城堡之后的推进。'],
    ],
    sources: [['AOE2 Guide · Arena（2024-09-30）', 'https://aoe2.guide/arena/']],
  },
  nomad: {
    resources: '开局没有城镇中心，村民位置分散。优先选择靠树林、能取得食物的落脚点；海岸提供捕鱼机会，野猪等陆上食物要靠探索寻找。',
    opening: '先落城镇中心并安排码头，保持村民与渔船生产；侦察近邻后决定速封抢水还是安全直城。下面的直城流程仅参考陆上经济转型，不能照搬它的出生配置和时间。',
    builds: ['fast-castle-boom'],
    civs: [
      ['Spanish', '建造加成与城堡兵路线提供可练习的转型。'],
      ['Koreans', '船只和战车方向可结合邻近敌人的位置选择。'],
    ],
    sources: [['Sitaux · Nomad（2026 网站，2026-10-18 核对）', 'https://sitaux.com/nomad/']],
  },
  islands: {
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
};
