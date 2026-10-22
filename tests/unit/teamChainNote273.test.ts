// issue 273：队伍加成页「关联科技」说明在界面上改成科技名，不显示科技编号与原始前置编号；数据文件 team_bonuses.json 不改。
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, type Core } from '../../src/data';
import TEAM from '../../src/data/team_bonuses.json';
import { playerChainNote } from '../../src/features/teamBonuses/TeamBonuses';

let core: Core;
beforeAll(async () => {
  core = await loadCore();
});
const NOTES = [...new Set(JSON.stringify(TEAM).match(/关联科技编号[^"]*/g) ?? [])];

describe('#273 关联科技说明去掉内部编号', () => {
  it('数据里确有这类说明（对照，防空转）', () => {
    expect(NOTES.length).toBeGreaterThanOrEqual(6);
  });
  it.each(NOTES)('%s', (note) => {
    const id = +/^关联科技编号(\d+)/.exec(note)![1]!;
    const out = playerChainNote(note, core);
    const zh = core.techById[id]?.zh;
    // 有站内科技名就写名字；后台辅助科技没有名字，写明不在科技树中显示
    expect(out).toContain(zh ? `关联科技「${zh}」` : '关联的后台科技（不在科技树中显示）');
    expect(out).not.toMatch(/编号|原始前置|所需数量|\d{2,}/);
    // 时代与状态措辞原样保留
    const mode = note.split('；')[1]!;
    expect(out).toContain(mode);
  });
  it('不认识的说明原样显示', () => {
    expect(playerChainNote('本人及盟友均包含在团队范围内。', core)).toBe('本人及盟友均包含在团队范围内。');
  });
});
