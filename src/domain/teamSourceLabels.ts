import type { Core } from '../data';

/**
 * issue 273：team_bonuses.json 的说明由脚本从游戏数据生成，带编号和开发用语；界面上显示时换成玩家能懂的话，数据文件不改。
 * 文案按 Steve 2026-10-22 设计审（PR 360）。
 */
const PLAYER_NOTE: [string, string][] = [
  [
    '属性单位/类别目标与生产目录为静态关联；不合成队伍倍率，不作客户端实测声明。',
    '受影响的单位、类别和可训练单位只列出对应关系；不计算队伍总倍率，没有在游戏里实测。',
  ],
  ['生产单位是全目录间接关联，不限定为加成来源文明。', '通过生产建筑关联到的单位按所有文明列出，不限于提供加成的文明。'],
  ['单位目标关联未完全核实；未知资源、科技修改与引擎函数不按文案猜测。', '有些单位是否适用还没核对完；核对不了的效果不按说明文字猜测。'],
  ['存在资源/引擎函数、科技修改或目录外对象，适用目标关联仅部分核实。', '部分效果无法从游戏数据核对，适用单位只核对了一部分。'],
  ['只枚举站内56文明的常驻来源和固定.dat中可研究的团队命令科技。', '只列出本站 56 个文明的常驻团队加成和可研究的团队科技。'],
  ['目标关系是跨时代来源审计，不表示当前已解锁', '目标按所有时代一起列出，不表示当前已解锁'],
  ['未知资源、引擎函数和启用/研究条件均不从说明文案推断目标。', '核对不了的效果和研究条件，都不按说明文字推断适用目标。'],
  ['仅按原始团队命令辨识；默认未研究，不改变任何现有模拟器数值。', '默认按未研究处理，不影响本站其他工具的数值。'],
  ['依赖链保留启用、研究和修改研究时间的区别；启用升级科技不代表已经研究。', '区分「可以研究」「已研究」「研究时间被改」；可以研究不等于已经研究。'],
  ['原始命令为研究触发，未作客户端实测', '研究后生效，没有在游戏里实测'],
  [
    '原始命令直接列出掷石绳骑兵；其余城堡独特单位的引擎目标未核实，保留说明但不编造关联。',
    '游戏数据只直接列出掷石绳骑兵；其他城堡独特单位是否适用还没核实，暂不列出。',
  ],
];
/** 关联科技与前置的玩家写法（Steve 2026-10-22）：前置写「需先研究 / 需先进入…时代」；前置是科技树看不到的内部科技时写触发方式，写不出就写「需先满足游戏内部条件」，都不写编号 */
const AGE_PREREQ: Record<number, string> = { 101: '需先进入封建时代', 102: '需先进入城堡时代', 103: '需先进入帝王时代' };
/** 玩家在游戏里看得到、但不在本站科技表里的科技：用它升级出的单位名称 */
const VISIBLE_TECH_UNIT: Record<number, number> = { 599: 1012 };
/** 内部前置 → 玩家的触发方式（civ 为加成来源文明） */
const INTERNAL_PREREQ: Record<number, (civ: string, core: Core) => string> = {
  601: (civ, core) => `需先获得${core.unitById[1010]?.zh ?? '该单位'}（进入城堡时代后，队伍中有${civ}文明时自动开放）`,
  639: (civ) => `队伍中有${civ}文明时开局自动生效`,
  307: (civ) => `队伍中有${civ}文明时开局自动生效`,
};
/** issue 273：研究条件列表的名字；站内查不到名字的是科技树看不到的内部条件，不显示编号（Steve 2026-10-22） */
export function teamPrereqLabel(id: number, core: Core): string {
  return core.techById[id]?.zh ?? '游戏内部条件（科技树里看不到）';
}
export function playerTeamNote(note: string, core: Core, civ?: string): string {
  let out = note;
  const m = /^关联科技编号(\d+)：[^；]+；(.+?)；原始前置为([^，]*)，所需数量为\d+。$/.exec(note);
  if (m) {
    const id = +m[1]!;
    const unit = VISIBLE_TECH_UNIT[id];
    const zh = core.techById[id]?.zh ?? (unit !== undefined ? core.unitById[unit]?.zh : undefined);
    const prereqs = m[3] === '空' ? [] : m[3]!.split('、').map(Number);
    const parts = [
      ...new Set(
        prereqs.map(
          (p) =>
            AGE_PREREQ[p] ??
            (core.techById[p] ? `需先研究${core.techById[p]!.zh}` : (INTERNAL_PREREQ[p]?.(civ ?? '对应', core) ?? '需先满足游戏内部条件（科技树里看不到）')),
        ),
      ),
    ];
    out = `${zh ? `关联科技「${zh}」：` : '关联科技：游戏内部用来实现这条加成的科技（科技树里看不到），'}${[...parts, m[2]!].join('；')}。`;
  }
  for (const [from, to] of PLAYER_NOTE) out = out.replace(from, to);
  return out;
}
