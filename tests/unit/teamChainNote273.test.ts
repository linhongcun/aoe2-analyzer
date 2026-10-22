// issue 273：队伍加成页来自 team_bonuses.json 的说明在显示时换成玩家能懂的话（不显示科技编号、原始前置编号与开发用语）；数据文件不改。
// 文案按 Steve 2026-10-22 设计审（PR #360 第 2、9–12 条）。
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, type Core } from '../../src/data';
import TEAM from '../../src/data/team_bonuses.json';
import { playerTeamNote } from '../../src/features/teamBonuses/TeamBonuses';

let core: Core;
beforeAll(async () => {
  core = await loadCore();
});
const ALL = [
  ...new Set(
    JSON.stringify(TEAM)
      .match(/"[^"]*[\u4e00-\u9fff][^"]*"/g)!
      .map((s) => JSON.parse(s) as string),
  ),
];
const CHAIN = ALL.filter((n) => n.startsWith('关联科技编号'));
const NOTES = [...new Set([...TEAM.meta.scopeNotes, ...TEAM.permanent.flatMap((s) => s.notes), ...TEAM.technologies.flatMap((s) => s.notes)])];
/** 界面上不能出现的开发用语（Steve 第 9–12 条） */
const DEV = /编号|原始前置|所需数量|原始命令|原始团队命令|引擎|已审计|跨时代来源审计|目录外对象|模拟器数值|\.dat|客户端实测/;

describe('#273 关联科技说明去掉内部编号', () => {
  it('数据里确有这类说明（对照，防空转）', () => {
    expect(CHAIN.length).toBeGreaterThanOrEqual(6);
  });
  it.each(CHAIN)('%s', (note) => {
    const out = playerTeamNote(note, core);
    // 玩家看得到的科技写名字（如 599 精锐标枪骑兵）；看不到的写「游戏内部用来实现这条加成的科技（科技树里看不到）」（Steve 第 2 条定稿）
    expect(out).toMatch(/^关联科技(「[^」]+」：|：游戏内部用来实现这条加成的科技（科技树里看不到），)/);
    expect(out).not.toMatch(/\d{2,}/);
    expect(out).not.toMatch(DEV);
  });
  it('不认识的说明原样显示', () => {
    expect(playerTeamNote('本人及盟友均包含在团队范围内。', core)).toBe('本人及盟友均包含在团队范围内。');
  });
});

const SRC = (id: string) => TEAM.permanent.find((s) => s.id === id)!;
const civZh = (en: string) => ({ Berbers: '柏柏尔', Incas: '印加', Italians: '意大利', Wu: '吴' })[en]!;
const chainOf = (id: string, tech: number) => SRC(id).notes.find((n) => n.startsWith(`关联科技编号${tech}：`))!;
/** Kent f41d0ef 的裸编号检查 */
const BARE = /后台科技\s?\d|科技\s?\d{3,}|前置为\s?\d/;

describe('#273 关联科技前置写法（Steve 2026-10-22：需先研究 / 需先进入时代 / 内部前置写触发方式）', () => {
  it('599 精锐标枪骑兵：帝王时代 + 依赖 601（601 是内部科技，写成怎么获得标枪骑兵）', () => {
    expect(playerTeamNote(chainOf('Berbers-team', 599), core, civZh('Berbers'))).toBe(
      '关联科技「精锐标枪骑兵」：需先进入帝王时代；需先获得标枪骑兵（进入城堡时代后，队伍中有柏柏尔文明时自动开放）；仅启用，不代表已经研究；仍需在靶场完成研究。',
    );
  });
  it('601 开放标枪骑兵（内部科技）：需先进入城堡时代', () => {
    expect(playerTeamNote(chainOf('Berbers-team', 601), core, civZh('Berbers'))).toBe(
      '关联科技：游戏内部用来实现这条加成的科技（科技树里看不到），需先进入城堡时代；仅启用，不代表已经研究。',
    );
  });
  it('730（前置 639、307 都是开局内部条件）：写成「开局自动生效」，不再写「不限时代」', () => {
    const out = playerTeamNote(chainOf('Incas-team', 730), core, civZh('Incas'));
    expect(out).toBe('关联科技：游戏内部用来实现这条加成的科技（科技树里看不到），队伍中有印加文明时开局自动生效；仅启用，不代表已经研究。');
    expect(out).not.toContain('不限时代');
  });
  it('522（意大利佣兵）与 1089（吴，无前置）', () => {
    expect(playerTeamNote(chainOf('Italians-team', 522), core, civZh('Italians'))).toBe(
      '关联科技：游戏内部用来实现这条加成的科技（科技树里看不到），需先进入帝王时代；仅启用，不代表已经研究。',
    );
    expect(playerTeamNote(chainOf('Wu-team', 1089), core, civZh('Wu'))).toBe(
      '关联科技：游戏内部用来实现这条加成的科技（科技树里看不到），仅将研究时间改为0，不按无条件立即完成处理。',
    );
  });
  it('全部关联科技说明：没有裸科技编号（Kent f41d0ef 正则）、没有「不限时代」、不出现「对应文明」占位', () => {
    for (const s of [...TEAM.permanent, ...TEAM.technologies])
      for (const n of s.notes.filter((x) => x.startsWith('关联科技编号'))) {
        const civ = 'civ' in s ? civZh(s.civ as string) : '库曼';
        const out = playerTeamNote(n, core, civ);
        expect([n, BARE.test(out)]).toEqual([n, false]);
        expect(out).not.toMatch(/不限时代|对应文明/);
      }
  });
});

describe('#273 队伍加成数据说明换成玩家能懂的话（Steve 第 9–12 条）', () => {
  it.each([
    ['单位目标关联未完全核实；未知资源、科技修改与引擎函数不按文案猜测。', '有些单位是否适用还没核对完；核对不了的效果不按说明文字猜测。'],
    ['存在资源/引擎函数、科技修改或目录外对象，适用目标关联仅部分核实。', '部分效果无法从游戏数据核对，适用单位只核对了一部分。'],
    ['只枚举站内56文明的常驻来源和固定.dat中可研究的团队命令科技。', '只列出本站 56 个文明的常驻团队加成和可研究的团队科技。'],
    ['未知资源、引擎函数和启用/研究条件均不从说明文案推断目标。', '核对不了的效果和研究条件，都不按说明文字推断适用目标。'],
    ['仅按原始团队命令辨识；默认未研究，不改变任何现有模拟器数值。', '默认按未研究处理，不影响本站其他工具的数值。'],
    ['依赖链保留启用、研究和修改研究时间的区别；启用升级科技不代表已经研究。', '区分「可以研究」「已研究」「研究时间被改」；可以研究不等于已经研究。'],
    [
      '原始命令直接列出掷石绳骑兵；其余城堡独特单位的引擎目标未核实，保留说明但不编造关联。',
      '游戏数据只直接列出掷石绳骑兵；其他城堡独特单位是否适用还没核实，暂不列出。',
    ],
  ])('%s', (from, to) => {
    expect(NOTES, '数据里有这句（防空转）').toContain(from);
    expect(playerTeamNote(from, core)).toBe(to);
  });
  it('「目标关系是跨时代来源审计」只换这半句，其余不变', () => {
    const n = TEAM.meta.scopeNotes.find((s) => s.includes('跨时代来源审计'))!;
    expect(playerTeamNote(n, core)).toBe(n.replace('目标关系是跨时代来源审计，不表示当前已解锁', '目标按所有时代一起列出，不表示当前已解锁'));
  });
  it('「原始命令为研究触发，未作客户端实测」在关联科技说明里换成「研究后生效，没有在游戏里实测」', () => {
    const n = CHAIN.find((s) => s.includes('原始命令为研究触发'))!;
    expect(playerTeamNote(n, core)).toContain('研究后生效，没有在游戏里实测');
  });
  it('换完后：Steve 列出的这些说明都不再含开发用语', () => {
    const left = NOTES.map((n) => playerTeamNote(n, core)).filter((n) => /引擎|已审计|原始命令|原始团队命令|目录外对象|\.dat|跨时代来源审计/.test(n));
    expect(left).toEqual([]);
  });
});
