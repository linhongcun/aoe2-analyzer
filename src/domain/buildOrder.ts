/**
 * 开局流程（build order）数据模型与校验。
 * 数据文件：src/data/build-orders/*.json（每个文件一个 BuildOrder）。
 * 步骤以「当前村民数」为主键（与社区写法一致：6 → 羊、+3 → 木……），可选时代事件标记。
 */

/** 村民任务。hunt = 城镇中心下的肉类（羊/野猪/鹿），sheep/boar/deer 为更细的写法，统计时都计入食物 */
export type Task = 'sheep' | 'boar' | 'deer' | 'hunt' | 'berries' | 'farm' | 'fish' | 'wood' | 'gold' | 'stone' | 'build';
export const TASKS: readonly Task[] = ['sheep', 'boar', 'deer', 'hunt', 'berries', 'farm', 'fish', 'wood', 'gold', 'stone', 'build'];
export const FOOD_TASKS: readonly Task[] = ['sheep', 'boar', 'deer', 'hunt', 'berries', 'farm', 'fish'];

/** 时代事件：xxx-click = 点击升级（TC 开始研究），xxx = 升级完成 */
export type Phase = 'feudal-click' | 'feudal' | 'castle-click' | 'castle' | 'imperial-click' | 'imperial';
export const PHASES: readonly Phase[] = ['feudal-click', 'feudal', 'castle-click', 'castle', 'imperial-click', 'imperial'];

export type Action =
  /** 新村民（无 from）或已有村民（from）去做 task */
  | { type: 'gather'; task: Task; count: number; from?: Task }
  | { type: 'build'; building: number; count?: number }
  | { type: 'train'; unit: number; count?: number }
  | { type: 'research'; tech: number }
  /** 单位升级（如民兵 → 武士），unit 为升级后的单位 id */
  | { type: 'upgrade'; unit: number }
  | { type: 'ageUp'; age: 2 | 3 | 4 }
  | { type: 'lure'; target: 'boar' | 'deer'; count?: number };

export interface Split {
  food: number;
  wood: number;
  gold: number;
  stone: number;
  build?: number;
}

export interface Step {
  /** 此步骤发生时的村民总数（含开局 3 个） */
  vils: number;
  phase?: Phase;
  actions: Action[];
  /** 中文说明（原创表述） */
  note?: string;
  /** 来源给出的资源分配检查点；校验时与按动作累计的分配比对 */
  split?: Split;
  /**
   * #42：说明里只和造房有关的片段（必须是 note 的子串）。不需要房子的文明（匈奴）显示时把这些片段置灰加删除线并标「匈奴不需要」。
   * 含造房动作的步骤必须填。
   */
  houseText?: string[];
  /** 本站补充、来源未列出的步骤（界面会标注「本站补充，来源未列」） */
  siteAdded?: boolean;
}

export interface Source {
  title: string;
  url: string;
  author: string;
  /** 来源中的章节/条目 */
  section?: string;
  /** 来源的固定版本（如 git 提交） */
  ref?: string;
  accessed: string;
}

export interface BuildOrder {
  id: string;
  name: { zh: string; en: string };
  /** 打法分类 */
  style: 'scouts' | 'drush' | 'militia' | 'fast-castle' | 'archers' | 'maa' | 'other';
  /** 推荐文明（civs.json 的 en）；空数组 = 通用 */
  civs: string[];
  map: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** 目标时代与预期村民数 */
  target: { age: 2 | 3 | 4; vils: number; time?: string };
  summary: string;
  sources: Source[];
  /** 许可与转写说明 */
  license: string;
  review: { status: 'draft' | 'reviewed'; by?: string; date?: string; notes?: string };
  steps: Step[];
}

export interface RefData {
  units: Record<number, { age: number; up?: unknown }>;
  techs: Record<number, { age: number }>;
  buildings: Record<number, { age: number }>;
  civs: Set<string>;
}

/** 房子 */
export const HOUSE = 70;
const AGE_TECH: Record<number, number> = { 101: 2, 102: 3, 103: 4 };
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min = 0): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min;

/** 结构校验（不依赖游戏数据）。返回错误列表 */
export function checkShape(bo: unknown): string[] {
  const e: string[] = [];
  if (!isObj(bo)) return ['不是对象'];
  const s = (k: string) => typeof bo[k] === 'string' && (bo[k] as string).length > 0;
  if (!s('id') || !/^[a-z0-9-]+$/.test(bo.id as string)) e.push('id 必须为小写短横线格式');
  if (!isObj(bo.name) || typeof bo.name.zh !== 'string' || typeof bo.name.en !== 'string') e.push('name.zh/name.en 缺失');
  if (!['scouts', 'drush', 'militia', 'fast-castle', 'archers', 'maa', 'other'].includes(bo.style as string)) e.push('style 无效');
  if (!Array.isArray(bo.civs)) e.push('civs 必须为数组');
  if (!s('map')) e.push('map 缺失');
  if (!['beginner', 'intermediate', 'advanced'].includes(bo.difficulty as string)) e.push('difficulty 无效');
  if (!isObj(bo.target) || ![2, 3, 4].includes(bo.target.age as number) || !isInt(bo.target.vils, 3)) e.push('target 无效');
  if (!s('summary')) e.push('summary 缺失');
  if (!s('license')) e.push('license 缺失');
  if (!Array.isArray(bo.sources) || bo.sources.length === 0) e.push('至少需要 1 个来源');
  else
    bo.sources.forEach((x, i) => {
      if (!isObj(x) || !['title', 'url', 'author', 'accessed'].every((k) => typeof x[k] === 'string' && (x[k] as string).length > 0))
        e.push(`sources[${i}] 需要 title/url/author/accessed`);
      else if (!/^https:\/\//.test(x.url as string)) e.push(`sources[${i}].url 必须为 https 链接`);
    });
  if (!isObj(bo.review) || !['draft', 'reviewed'].includes(bo.review.status as string)) e.push('review.status 无效');
  if (!Array.isArray(bo.steps) || bo.steps.length < 3) e.push('steps 至少 3 步');
  else
    bo.steps.forEach((st, i) => {
      const p = `steps[${i}]`;
      if (!isObj(st)) return e.push(`${p} 不是对象`);
      if (!isInt(st.vils, 3) || (st.vils as number) > 200) e.push(`${p}.vils 必须为 3–200 的整数`);
      if (st.phase !== undefined && !PHASES.includes(st.phase as Phase)) e.push(`${p}.phase 无效`);
      if (st.siteAdded !== undefined && typeof st.siteAdded !== 'boolean') e.push(`${p}.siteAdded 必须为布尔值`);
      if (st.note !== undefined && typeof st.note !== 'string') e.push(`${p}.note 必须为字符串`);
      if (st.houseText !== undefined) {
        if (!Array.isArray(st.houseText) || st.houseText.some((x) => typeof x !== 'string' || !x || !String(st.note ?? '').includes(x)))
          e.push(`${p}.houseText 必须是 note 中的非空片段`);
      } else if (Array.isArray(st.actions) && st.actions.some((a) => isObj(a) && a.type === 'build' && a.building === 70))
        e.push(`${p} 含造房动作，需要 houseText（#42）`);
      if (!Array.isArray(st.actions)) return e.push(`${p}.actions 必须为数组`);
      if (st.actions.length === 0 && !st.note) e.push(`${p} 既无动作也无说明`);
      st.actions.forEach((a, j) => {
        const q = `${p}.actions[${j}]`;
        if (!isObj(a)) return e.push(`${q} 不是对象`);
        switch (a.type) {
          case 'gather':
            if (!TASKS.includes(a.task as Task) || !isInt(a.count, 1) || (a.from !== undefined && !TASKS.includes(a.from as Task)))
              e.push(`${q} gather 字段无效`);
            break;
          case 'build':
            if (!isInt(a.building) || (a.count !== undefined && !isInt(a.count, 1))) e.push(`${q} build 字段无效`);
            break;
          case 'train':
            if (!isInt(a.unit) || (a.count !== undefined && !isInt(a.count, 1))) e.push(`${q} train 字段无效`);
            break;
          case 'research':
            if (!isInt(a.tech)) e.push(`${q} research 字段无效`);
            break;
          case 'upgrade':
            if (!isInt(a.unit)) e.push(`${q} upgrade 字段无效`);
            break;
          case 'ageUp':
            if (![2, 3, 4].includes(a.age as number)) e.push(`${q} ageUp.age 无效`);
            break;
          case 'lure':
            if (!['boar', 'deer'].includes(a.target as string)) e.push(`${q} lure.target 无效`);
            break;
          default:
            e.push(`${q} 未知动作 ${String(a.type)}`);
        }
      });
    });
  return e;
}

export type Alloc = Record<Task, number>;
export const splitOf = (a: Alloc): Split => ({
  food: FOOD_TASKS.reduce((s, t) => s + a[t], 0),
  wood: a.wood,
  gold: a.gold,
  stone: a.stone,
  build: a.build,
});

/**
 * 语义校验：引用 id 存在、村民数单调且与分配一致、移动不超过现有人数、时代顺序与可用性、检查点分配。
 * 返回 { errors, allocs }，allocs[i] 为第 i 步之后的分配。
 */
export function checkSemantics(bo: BuildOrder, ref: RefData): { errors: string[]; allocs: Alloc[] } {
  const e: string[] = [];
  bo.civs.forEach((c) => ref.civs.has(c) || e.push(`未知文明 ${c}`));
  const alloc = Object.fromEntries(TASKS.map((t) => [t, 0])) as Alloc;
  const allocs: Alloc[] = [];
  let assigned = 0;
  let prevVils = 3;
  let age = 1;
  let clicked = 1; // 已点击的最高时代
  bo.steps.forEach((st, i) => {
    const p = `第 ${i + 1} 步（${st.vils} 村民）`;
    if (st.vils < prevVils) e.push(`${p}：村民数回退（上一步 ${prevVils}）`);
    prevVils = st.vils;
    if (st.phase) {
      const n = { feudal: 2, castle: 3, imperial: 4 }[st.phase.replace('-click', '') as 'feudal' | 'castle' | 'imperial'];
      if (st.phase.endsWith('-click')) {
        if (n !== age + 1) e.push(`${p}：${st.phase} 不是下一个时代`);
      } else {
        if (n !== age + 1) e.push(`${p}：${st.phase} 跳过了时代`);
        if (clicked < n) e.push(`${p}：到达 ${st.phase} 前未点击升级`);
        age = n;
      }
    }
    const need = (what: string, a: number) => {
      if (a > age) e.push(`${p}：${what} 需要 ${['', '黑暗', '封建', '城堡', '帝王'][a]}时代，当前为 ${['', '黑暗', '封建', '城堡', '帝王'][age]}时代`);
    };
    for (const a of st.actions) {
      switch (a.type) {
        case 'gather':
          if (a.from) {
            // from: 'hunt' 表示「城镇中心下的肉类」：依次从 hunt / sheep / boar / deer 调人
            const pool: Task[] = a.from === 'hunt' ? ['hunt', 'sheep', 'boar', 'deer'] : [a.from];
            const have = pool.reduce((s, t) => s + alloc[t], 0);
            if (have < a.count) e.push(`${p}：从 ${a.from} 调出 ${a.count} 人，但只有 ${have} 人`);
            let left = a.count;
            for (const t of pool) {
              const k = Math.min(left, alloc[t]);
              alloc[t] -= k;
              left -= k;
            }
            alloc[pool[0]!] -= left;
          } else assigned += a.count;
          alloc[a.task] += a.count;
          break;
        case 'build':
          if (!ref.buildings[a.building]) e.push(`${p}：未知建筑 ${a.building}`);
          else need(`建筑 ${a.building}`, ref.buildings[a.building]!.age);
          break;
        case 'train':
          if (!ref.units[a.unit]) e.push(`${p}：未知单位 ${a.unit}`);
          else need(`单位 ${a.unit}`, ref.units[a.unit]!.age);
          break;
        case 'research':
          if (AGE_TECH[a.tech]) e.push(`${p}：升级时代请用 ageUp 动作`);
          else if (!ref.techs[a.tech]) e.push(`${p}：未知科技 ${a.tech}`);
          else need(`科技 ${a.tech}`, ref.techs[a.tech]!.age);
          break;
        case 'upgrade':
          if (!ref.units[a.unit] || !ref.units[a.unit]!.up) e.push(`${p}：${a.unit} 不是可升级单位`);
          else need(`升级 ${a.unit}`, ref.units[a.unit]!.age);
          break;
        case 'ageUp':
          if (a.age !== age + 1 || clicked >= a.age) e.push(`${p}：ageUp ${a.age} 顺序错误`);
          clicked = Math.max(clicked, a.age);
          if (st.phase !== (['', '', 'feudal-click', 'castle-click', 'imperial-click'] as const)[a.age]) e.push(`${p}：ageUp 所在步骤应标记 phase`);
          break;
        case 'lure':
          break;
      }
    }
    // 第一步包含开局 3 个村民：累计分配应等于当前村民数
    if (assigned !== st.vils) e.push(`${p}：累计分配 ${assigned} 人 ≠ 村民数 ${st.vils}`);
    if (st.split) {
      const s = splitOf(alloc);
      const keys = ['food', 'wood', 'gold', 'stone', 'build'] as const;
      const bad = keys.filter((k) => st.split![k] !== undefined && st.split![k] !== s[k]);
      if (bad.length) e.push(`${p}：检查点 ${bad.map((k) => `${k} 期望 ${st.split![k]} 实际 ${s[k]}`).join('，')}`);
    }
    allocs.push({ ...alloc });
  });
  // 开局规则：前 3 个村民（vils = 3 的步骤）必须包含盖房子
  const opening = bo.steps.filter((s) => s.vils === 3);
  if (!opening.some((s) => s.actions.some((a) => a.type === 'build' && a.building === HOUSE))) e.push('开局（前 3 个村民）缺少盖房子步骤');
  if (age < bo.target.age) e.push(`未到达目标时代 ${bo.target.age}`);
  const reach = bo.steps.find((s) => s.phase === (['', '', 'feudal-click', 'castle-click', 'imperial-click'] as const)[bo.target.age]);
  if (!reach) e.push('缺少目标时代的点击步骤');
  else if (reach.vils !== bo.target.vils) e.push(`目标时代点击时村民 ${reach.vils} ≠ target.vils ${bo.target.vils}`);
  return { errors: e, allocs };
}

export function validateBuildOrder(bo: unknown, ref: RefData): string[] {
  const shape = checkShape(bo);
  if (shape.length) return shape;
  return checkSemantics(bo as BuildOrder, ref).errors;
}
