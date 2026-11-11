import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/features/matchup/components/Matchup.tsx', 'utf8');
const rush = readFileSync('src/features/matchup/components/RushDefense.tsx', 'utf8');

describe('#939 对局助手主页信息层级', () => {
  it('跟文明走的入口和通用 PK 分开，文案逐字落在主页', () => {
    expect(page).toContain('下面的开局、文明页和练习入口会带上这对文明。');
    expect(page).toContain('不自动带入当前双方');
    expect(page).toContain('aria-label="单位 PK，不自动带入当前双方"');
    expect(page).toContain('to="/duel"');
    expect(page).not.toMatch(/to=\{`\/duel\?/);
    expect(page).not.toContain('以下正文不随');
    expect(page).not.toContain('推荐反制');
    expect(page).not.toContain('当前对局：');
    expect(page).toContain('请补选双方文明后查看跟对阵走的入口。');
    expect(page).toContain('请补选我方文明后查看跟对阵走的入口。');
    expect(page).toContain('请补选对手文明后查看跟对阵走的入口。');
    expect(page).toContain('当前我方暂无可用的类型对照单位');
    expect(page).toContain('选定双方文明后，会按对手登记类型取出通用对照表，再只列出我方能造的单位。这里不生成针对某个对手的专属分析。');
    expect(page).toContain('三份指南仍在原路由，内容不并进本页，也不新增情境。');
    expect(page).toContain('to="/matchup/scouting"');
    expect(page).toContain('to="/match-review"');
    expect(page).toContain('to="/team-plan"');
  });

  it('练习资格与早期四稿仍调用现有函数，限制收入折叠', () => {
    expect(rush).toContain('rushDrill');
    expect(rush).toContain('unavailableBuildUnits');
    expect(rush).toContain('unitAvailable');
    expect(rush).toContain('techAvailable');
    expect(rush).toContain('打开 PK 演练：');
    expect(rush).toContain('参考开局：');
    expect(rush).toContain('本方防守单位或所需科技不可用，暂不提供出兵建议。');
    expect(rush).toContain('此预设只比较村民近战，不模拟打塔。敌塔已完工时不适用。');
    expect(rush).toContain('参考开局取其升时代和建造顺序，遇到快攻优先调整防守，不必照抄全部出兵步骤。文明经济加成的计入范围以开局页提示为准。');
    expect(rush).toContain('数量是本站的起步练习建议，需要按侦察结果增减。');
    expect(rush).toContain('演练限制');
    expect(rush).toContain('塔爆仅研究织布机（双方均须可用）');
    expect(rush).toContain('下列四段是固定的通用稿，只随「对手打法」切换');
    expect(rush).toContain('来源与适用范围');
    expect(rush).toContain('{ replace: true }');
    expect(page).toContain('filterCounterUnits');
    expect(page).toContain('counterExtra');
    expect(page).toContain('模拟默认与 PK 限制');
    expect(page).toContain('查看 PK 模型能力与限制');
  });
});
