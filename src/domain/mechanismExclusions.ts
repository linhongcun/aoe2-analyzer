/**
 * issue 821 机制文明清单的显式排除项。
 *
 * 两份清单都从 `CIV_MECHANISM_KEYS` 派生；这里只保留确实不覆盖的文明和原因。
 * 新增机制文明会默认进入 parity / bonusUsage；若要排除，必须在这里补一条原因。
 */
export const PARITY_EXCLUDED: Readonly<Record<string, string>> = {
  Romans: 'parity special 列表只覆盖 issue 197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
  Poles: 'parity special 列表只覆盖 issue 197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
  Gurjaras: 'parity special 列表只覆盖 issue 197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
  Mapuche: 'parity special 列表只覆盖 issue 197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
  Chinese: 'parity special 列表只覆盖 issue 197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
  Jurchens: 'parity special 列表只覆盖 issue 197 后续批次；该文明由通用 metadata/timeline 快照覆盖',
  Franks: 'parity special 列表不单列；freeResearchOnce 由通用快照覆盖',
};

export const BONUS_USAGE_EXCLUDED: Readonly<Record<string, string>> = {
  Gurjaras: '当前模板未驻畜，eco/text 行由通用 scope 分类，未进逐条科技清单',
  Jurchens: '尸体腐烂/攻城折扣不在当前模板，eco/text 行由通用 scope 分类',
  Portuguese: '采果兼产木材走 assumptions，未进逐条科技清单',
  Shu: '伐木兼产食物走 assumptions，未进逐条科技清单',
  Malians: '采金交仓/建筑木费走 assumptions，未进逐条科技清单',
  Varangians: '牧羊/狩猎/捕鱼兼产黄金走 assumptions，未进逐条科技清单',
  Tatars: '牧羊配对走 assumptions，未进逐条科技清单',
  Mayans: '资源配对/骑兵模板走 assumptions，未进逐条科技清单',
  Franks: 'freeResearchOnce 没有逐条科技解释，未进清单',
};
