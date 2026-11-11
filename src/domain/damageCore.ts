/**
 * 伤害与击数的共享核心（D10 / issue 908）。
 *
 * 单位 PK 与攻城工具保留各自的可达性/建筑门禁，但每类伤害、单次总伤害和
 * 击数不再各写一套夹紧与取整。参数显式表达两处差异：
 * - `negativeAttack`：单位 PK 保留负攻击扣减，建筑伤害按 0 起算；
 * - `roundHp`：攻城工具先取整建筑生命值，单位 PK 使用原始生命值。
 */
export interface DamageRow {
  category: string;
  attack: number;
  armor: number;
  damage: number;
}

export interface DamageRowsOptions {
  /** true：max(min(0, attack), attack - armor)；false：max(0, attack - armor)。 */
  negativeAttack?: boolean;
  /** 缺少护甲类别时跳过（PK）还是列入 missing（攻城）。 */
  missingArmor?: 'skip' | 'error';
}

export interface DamageRowsResult {
  rows: DamageRow[];
  /** 按遍历顺序记录缺失/非有限类别；调用方可取第一条决定错误文案。 */
  problems: string[];
}

export function damageRows(
  attacks: Readonly<Record<string, number>>,
  armors: Readonly<Record<string, number>>,
  { negativeAttack = true, missingArmor = 'skip' }: DamageRowsOptions = {},
): DamageRowsResult {
  const rows: DamageRow[] = [];
  const problems: string[] = [];
  for (const [category, attack] of Object.entries(attacks)) {
    if (!Number.isFinite(attack)) {
      problems.push(category);
      continue;
    }
    const armor = armors[category];
    if (armor === undefined || !Number.isFinite(armor)) {
      if (missingArmor === 'error') problems.push(category);
      continue;
    }
    rows.push({
      category,
      attack,
      armor,
      damage: negativeAttack ? Math.max(Math.min(0, attack), attack - armor) : Math.max(0, attack - armor),
    });
  }
  return { rows, problems };
}

/** 单次命中伤害；至少 1。 */
export const totalDamage = (rows: readonly DamageRow[], minimum = 1): number =>
  Math.max(
    minimum,
    rows.reduce((sum, row) => sum + row.damage, 0),
  );

export interface HitCountOptions {
  /** 攻城工具先 Math.round 建筑生命值；PK 用原始值。 */
  roundHp?: boolean;
  /** PK 的浮点容差 1e-9；攻城保持精确 0。 */
  epsilon?: number;
}

/** 击杀所需命中次数；每次伤害为 0/非正时返回 Infinity。 */
export function hitCount(hp: number, perHit: number, { roundHp = false, epsilon = 1e-9 }: HitCountOptions = {}): number {
  if (!(perHit > 0)) return Number.POSITIVE_INFINITY;
  const target = roundHp ? Math.round(hp) : hp;
  return Math.ceil(target / perHit - epsilon);
}
