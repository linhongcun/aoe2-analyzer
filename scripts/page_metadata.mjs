import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => JSON.parse(readFileSync(path.join(root, 'src/data', name + '.json'), 'utf8'));
const pages = {};
const add = (route, title, description, extra = {}) => (pages[route] = { title, description, ...extra });
const staticPages = {
  '/': ['帝国时代 II 分析器', '查看决定版文明、单位、科技与开局流程，比较单位对战和文明加成。'],
  '/civs': ['文明百科', '查看全部文明的加成、特色科技、单位与开局建议。'],
  '/units': ['单位百科', '查询单位属性、费用、克制关系与升级路线。'],
  '/techs': ['科技百科', '查询科技效果、费用、前置要求与适用文明。'],
  '/buildings': ['建筑百科', '查询建筑属性、可生产单位和科技。'],
  '/bonuses': ['文明加成百科', '查看文明与团队加成的数值效果和适用对象。'],
  '/builds': ['开局流程', '查看主流开局的分步时间线、资源分配与卡点估算。'],
  '/compare': ['文明对比', '比较两个文明的能力与科技树差异。'],
  '/matchup': ['对局助手', '查看双方文明特点、反制建议和早期防守思路。'],
  '/simulator': ['科技模拟器', '计算文明与科技作用后的单位属性和投入费用。'],
  '/duel': ['单位 PK', '设置单位、文明、科技和数量，比较击杀时间与模拟结果。'],
  '/market': ['市场买卖预算', '按文明、库存、行情和交易顺序估算逐笔买卖报价，比较两份方案的资源收支。'],
  '/trade-income': ['商路供给', '按实际交金量与完整周期估算车船收入、目标数量和逐资源投资。'],
  '/construction': ['多人施工', '比较建筑施工人数、理论完工时间、村民工时和显式采集条件下的停采估算。'],
  '/team-bonuses': ['队伍加成', '按一至四名玩家的文明汇总团队加成来源，区分常驻效果与需要研究的团队科技。'],
  '/garrison-healing': ['驻军回血', '核对驻留与治疗资格，按草药和单位生命科技估算单目标理论恢复时间。'],
  '/game-clock': ['游戏与现实时间换算', '填写速度倍率，双向换算游戏时间与理论现实时长，解释攻略和计算工具中的时点。'],
  '/hotkeys': ['游戏快捷键速查', '按中英文操作查找说明，保存单人和多人个人按键表并完整打印。'],
  '/castle-defense': ['城堡前置分阶段应对', '按竞技场侦察、施工和落堡后的资源状况，查看行动条件、投入代价与复查信号。'],
  '/production': ['持续生产', '按文明、时代、已研究科技和生产建筑数量估算每分钟开销与村民分配。'],
  '/eco-payoff': ['经济科技收益', '固定村民人数与采集条件，比较伐木、采矿科技的研究投入、增量收入和等采集时间收支平衡。'],
  '/glossary': ['术语与缩写', '查询中英社区缩写、开局用语以及速率和科技增强措辞。'],
  '/about-data': ['关于数据', '查看游戏数据版本、固定来源与可复现校验。'],
  '/dlc': ['资料片', '查看决定版资料片及其文明。'],
  '/tree': ['文明科技树', '查看各文明可用单位和科技。'],
  '/maps': ['地图与开局', '查看常见地图的资源特点与开局建议。'],
  '/patches': ['版本补丁', '按版本与文明查看游戏平衡改动。'],
  '/ladder': ['天梯数据', '文明统计入口；可靠的新版本统计数据仍在准备中。'],
};
for (const [route, [title, description]] of Object.entries(staticPages)) add(route, title, description);
for (const term of JSON.parse(readFileSync(path.join(root, 'src/content/glossary.json'), 'utf8'))) add(`/glossary/${term.id}`, term.zh, term.meaning);
for (const [file, type] of [
  ['units', 'unit'],
  ['techs', 'tech'],
  ['buildings', 'building'],
])
  for (const x of read(file)) {
    const stats =
      type === 'unit'
        ? [
            ['基础生命', x.hp],
            ['基础攻击', x.atk],
            ['基础射程', x.rng],
          ]
        : type === 'tech'
          ? [
              ['研究时间', `${x.rt} 秒`],
              ['资源总量', Object.values(x.cost).reduce((a, b) => a + b, 0)],
              ['适用文明', x.civs.length],
            ]
          : [
              ['生命', x.hp],
              ['建造时间', `${x.bt} 秒`],
              ['驻扎容量', x.gar],
            ];
    add(
      `/${type}/${x.id}`,
      x.zh,
      `${x.zh}（${x.en}）：${type === 'unit' ? '基础属性、克制与升级路线' : type === 'tech' ? '科技效果、费用与前置' : '建筑属性、单位与科技'}。数据版本 DE 185872。`,
      {
        stats,
        icon: `img/${file}/${x.pic}.webp`,
        kind: type,
        note:
          type === 'unit' ? '基础属性，未计文明与科技加成。' : type === 'tech' ? '资源总量为各资源数量相加，未计文明折扣。' : '基础属性，未计文明与科技加成。',
      },
    );
  }
for (const c of read('civs')) {
  add(`/civ/${c.en}`, c.zh, `${c.zh}（${c.en}）：文明加成、特色单位、科技与开局建议。`, {
    kind: 'civ',
    icon: `img/civs/${c.en.toLowerCase()}.webp`,
    stats: [
      ['骑兵评分', `${c.s[0]} / 10`],
      ['经济评分', `${c.s[3]} / 10`],
      ['防御评分', `${c.s[4]} / 10`],
    ],
    note: '评分是本站主观参考，不代表胜率。',
  });
  add(`/tree/${c.en}`, `${c.zh}科技树`, `查看${c.zh}可用的单位、科技及其前置关系。`);
  c.bon.forEach((text, i) => add(`/civ/${c.en}/bonus/${i}`, `${c.zh}加成 ${i + 1}`, text));
  add(`/civ/${c.en}/bonus/team`, `${c.zh}团队加成`, c.tb);
}
for (const f of readdirSync(path.join(root, 'src/data/build-orders')).filter((f) => f.endsWith('.json'))) {
  const b = read('build-orders/' + f.slice(0, -5));
  add(`/builds/${b.id}`, b.name.zh, b.summary, {
    route: `/builds?bo=${encodeURIComponent(b.id)}`,
    kind: 'build',
    stats: [
      ['目标村民', b.target.vils],
      ['步骤', b.steps.length],
      ['目标时代', b.target.age],
    ],
    note: '时间以模拟结果为准；实战受地图和操作影响。',
  });
}
try {
  for (const f of readdirSync(path.join(root, 'src/data/patches')).filter((f) => f.endsWith('.json'))) {
    const p = read('patches/' + f.slice(0, -5));
    add(`/patches/${p.id}`, `DE Update ${p.id}`, `查看 ${p.id} 的平衡调整、新内容和文明改动。`);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const target = path.join(root, 'src/data/page-metadata.json');
const contents = JSON.stringify(pages) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== contents) throw new Error('page-metadata.json 需要重新生成');
} else writeFileSync(target, contents);
console.log(`页面元数据：${Object.keys(pages).length} 页`);
