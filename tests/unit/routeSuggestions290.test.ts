import { describe, expect, it } from 'vitest';
import { suggestRoutes } from '../../src/domain/routeSuggestions';

const routes = [
  { path: '/trade-income', label: '商路供给' },
  { path: '/garrison-healing', label: '驻军回血' },
  { path: '/team-bonuses', label: '队伍加成' },
  { path: '/team-plan', label: '团战分工' },
  { path: '/game-guide', label: '一局与观赛' },
  { path: '/game-clock', label: '时间换算' },
];

describe('#290 未知路由建议', () => {
  it('匹配前缀、包含关系和连字符分词', () => {
    expect(suggestRoutes('/trade', routes)).toEqual([routes[0]]);
    expect(suggestRoutes('/income', routes)).toEqual([routes[0]]);
    expect(suggestRoutes('/garrison-general', routes)).toEqual([routes[1]]);
    expect(suggestRoutes('/team', routes)).toEqual([routes[2], routes[3]]);
  });

  it('忽略查询、hash 前缀、大小写和末尾斜线', () => {
    expect(suggestRoutes('#/TRADE/?q=team', routes)).toEqual([routes[0]]);
  });

  it('无关路径、首页和已匹配路径没有建议', () => {
    for (const path of ['', '/', '/this-page-does-not-exist-xyz', '/trade-income']) {
      expect(suggestRoutes(path, routes)).toEqual([]);
    }
  });

  it('优先前缀，去重，最多返回三个已登记的链接', () => {
    const candidates = [
      { path: '/', label: '首页' },
      { path: '/income-trade', label: '包含' },
      routes[0]!,
      routes[0]!,
      { path: '/trade-history', label: '前缀' },
      { path: '/trade-tools', label: '前缀' },
    ];
    expect(suggestRoutes('/trade', candidates).map((route) => route.path)).toEqual(['/trade-income', '/trade-history', '/trade-tools']);
  });
});
