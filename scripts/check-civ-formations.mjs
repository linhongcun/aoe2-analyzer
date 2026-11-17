export const FORMATIONS_FILE = 'data/content/civ-formations.json';

const strategySource = 'https://github.com/linhongcun/aoe2-analyzer/blob/9eded5cf510deda603558b37920431f9491b75b3/role/game-strategy.md';
const discussionSource = 'https://app.devin.ai/sessions/0324fdbe099145518bae6f421b8925c4';
const strategySections = { Spanish: '西班牙', Georgians: '格鲁吉亚' };

const release = {
  Spanish: {
    'conquistador-hussar': {
      required: ['unit:773', 'unit:441'],
      supplements: ['unit:6'],
      adjustments: { spears: [], ranged: ['unit:6'], siege: [] },
    },
    'paladin-skirmisher': {
      required: ['unit:569', 'unit:6'],
      supplements: ['unit:441'],
      adjustments: { camels: ['route:handcannon-halberdier'], ranged: [], spears: [], 'low-gold': ['unit:441'] },
    },
    'handcannon-halberdier': {
      required: ['unit:5', 'unit:359'],
      supplements: ['unit:36', 'unit:331'],
      adjustments: { infantry: [], ranged: [], 'anti-siege': ['unit:36'], 'break-defenses': ['unit:331'] },
    },
  },
  Georgians: {
    'monaspa-towers': {
      required: ['unit:1805', 'building:235', 'tech:923'],
      prerequisites: ['tech:63'],
      supplements: ['unit:331', 'unit:6', 'unit:359'],
      adjustments: { ranged: ['unit:6'], camels: ['unit:359'], siege: [], 'break-defenses': ['unit:331'] },
    },
  },
};

const refKey = ({ kind, id }) => `${kind}:${id}`;
const sameKeys = (actual, expected) =>
  actual.length === expected.length && new Set(actual).size === actual.length && actual.every((key) => expected.includes(key));

/** 首批交付合同。补丁过期属于显示状态，不改变此批已认可的发布集合。 */
export function formationProblems(content) {
  const problems = [];
  const add = (path, message) => problems.push({ path, message });
  if (
    !sameKeys(
      content.map(({ civ }) => civ),
      Object.keys(release),
    )
  )
    add('', '首批文明必须恰好为西班牙、格鲁吉亚，且各出现一次');
  for (const [i, entry] of content.entries()) {
    if (!Object.hasOwn(release, entry.civ)) continue;
    if (entry.source.content !== `${strategySource}#${strategySections[entry.civ]}`) {
      add(`/${i}/source/content`, '内容来源须指向批准的固定提交和文明章节');
    }
    if (entry.source.discussion !== discussionSource) {
      add(`/${i}/source/discussion`, '原讨论链接不符合首批批准来源');
    }
    const expectedRoutes = release[entry.civ];
    if (
      !sameKeys(
        entry.routes.map(({ id }) => id),
        Object.keys(expectedRoutes),
      )
    )
      add(`/${i}/routes`, '首批路线集合不匹配或出现重复');
    for (const [j, route] of entry.routes.entries()) {
      if (!Object.hasOwn(expectedRoutes, route.id)) continue;
      const expected = expectedRoutes[route.id];
      const path = `/${i}/routes/${j}`;
      if (route.status !== 'approved') add(`${path}/status`, '只允许发布已认可路线');
      for (const key of ['required', 'prerequisites', 'supplements']) {
        if (!sameKeys(route[key].map(refKey), expected[key] ?? [])) add(`${path}/${key}`, '实体类型、角色或 ID 不符合首批批准范围');
      }
      if (
        !sameKeys(
          route.adjustments.map(({ id }) => id),
          Object.keys(expected.adjustments),
        )
      )
        add(`${path}/adjustments`, '条件调整集合不匹配或出现重复');
      for (const [k, adjustment] of route.adjustments.entries()) {
        if (!Object.hasOwn(expected.adjustments, adjustment.id)) continue;
        if (!sameKeys((adjustment.requires ?? []).map(refKey), expected.adjustments[adjustment.id])) {
          add(`${path}/adjustments/${k}/requires`, '条件建议与当前实体或路线的依赖不匹配');
        }
      }
    }
  }
  return problems;
}
