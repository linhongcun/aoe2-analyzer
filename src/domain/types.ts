/** 资源费用，键为 aoe2techtree 资源名 */
export type Cost = Partial<Record<'Food' | 'Wood' | 'Gold' | 'Stone', number>> & Record<string, number>;
export type CivType = 'cav' | 'arch' | 'inf' | 'naval' | 'monk' | 'siege' | 'def' | 'eco';

export interface Civ {
  /** issue 123 全拼 / 首字母，构建时生成 */
  py?: string;
  pyi?: string;
  en: string;
  zh: string;
  ty: CivType[];
  desc: string;
  uu: string;
  ct: string;
  it: string;
  bon: string[];
  bonEn: string[];
  tb: string;
  tbEn: string;
  /** 8 项能力评分：骑兵 弓手 步兵 经济 防御 攻城 僧侣 海军 */
  s: number[];
  fl: number;
  pk: number;
  op: string;
  /** 派生：DLC 序号 */
  dlc: number | null;
}
/** Alternate battle state, nested under its trainable catalog unit. */
export type UnitForm = Pick<
  Unit,
  | 'id'
  | 'en'
  | 'zh'
  | 'hp'
  | 'atk'
  | 'ma'
  | 'pa'
  | 'rng'
  | 'minr'
  | 'spd'
  | 'los'
  | 'rof'
  | 'acc'
  | 'blast'
  | 'atks'
  | 'arms'
  | 'armc'
  | 'cls'
  | 'attackDelaySeconds'
  | 'frameDelay'
  | 'garrisonCapacity'
  | 'combatAbility'
> & { kind: 'weapon' | 'barrage' | 'dismount' };

export interface ConversionResistance {
  chanceMod?: number;
  minTimeMod?: number;
  maxTimeMod?: number;
}

export interface Unit {
  conversionResistance?: ConversionResistance;
  bengaliConversion?: { minTimeMod: number; maxTimeMod: number; bonusDamageReduction: number };
  casterTasks?: { action: number; value1: number; value2: number }[];
  form?: UnitForm;
  /** issue 123 全拼 / 首字母，构建时生成 */
  py?: string;
  pyi?: string;
  id: number;
  en: string;
  zh: string;
  type: string;
  age: number;
  b: number;
  pic: number | string;
  from_: number | null;
  cost: Cost;
  hp: number;
  atk: number;
  ma: number;
  pa: number;
  rng: number;
  /** 对建筑射程 − 对单位射程（.dat 蓄力远程单位 Range − DisplayedRange）；仅当不为 0 时存在。
   *  对建筑射程由模拟器按 rng + rngBd 计算，随射程科技变化（#38） */
  rngBd?: number;
  minr: number;
  spd: number;
  los: number;
  rof: number;
  /** 固定源目录充能字段。回复速率单位为每秒，满充时长单位为秒。 */
  chargeType?: number;
  chargeEvent?: number;
  /** issue 1522：固定 DAT 充能目标位掩码（u.creatable.charge_target，非零整数含 -1 与正整数掩码，0 省略）。 */
  chargeTarget?: number;
  maxCharge?: number;
  rechargeRate?: number;
  rechargeDuration?: number;
  /** issue 1296：固定 DAT 固有副弹丸/多弹丸总数（仅大于 1 且非纯视觉装饰时导出）。 */
  totalProjectiles?: number;
  /** issue 1296：固定 DAT 充能多弹丸齐射标记（chargeType 为 6/7 且上限大于 1、基础非固有齐射时导出）。 */
  chargeMultiProjectiles?: boolean;
  /** 目录基础出手前摇（秒）。可缺失，零是有效读数。 */
  attackDelaySeconds?: number;
  /** 同一目录形态的上游原始帧值。 */
  frameDelay?: number;
  tt: number;
  acc: number;
  /** 由固定 DAT 读取的落点散布原值；缺失与显式零分别处理。 */
  accuracyDispersion?: number;
  /** 固定 DAT 的 X/Y 碰撞半径（格），用于群战接敌近似。 */
  collisionRadiusX?: number;
  collisionRadiusY?: number;
  /** 固定 DAT 的显示用间隔（秒）；仅收录与目录基础间隔不同的读数。 */
  displayedReloadTime?: number;
  blast: number;
  /** 固定 DAT 目录模板：次要目标系数／编码、对象层级、受方友方范围伤害倍率。 */
  blastDamage?: number;
  blastAttackLevel?: number;
  friendlyFireDamage?: number;
  /** 固定目录的 GarrisonCapacity 原值，缺字段时为未知。 */
  garrisonCapacity?: number;
  /** 固定 DAT 属性 63（type_50.break_off_combat）完整位掩码（bit 1 无视护甲、bit 2 抵抗无视护甲等）。 */
  combatAbility?: number;
  /** issue 1367：固定 DAT 主投射物直线穿透标记（Projectiles[0].hit_mode === 1）。 */
  projectilePassThrough?: boolean;
  /** issue 1367：固定 DAT 命中特效细分枚举（action_type 157 参数确定性映射；参数不明时省略并由运行时兜底）。 */
  onHitEffect?: 'dot' | 'slow' | 'attack-speed';
  /** issue 1367：固定 DAT 对受伤目标递增伤害标记（action_type 160，属性 9）。 */
  damagedTargetBonus?: boolean;
  /** issue 1367：固定 DAT 低血量破盾变形态标记（action_type 158，v2 < 0）。 */
  lowHpTransform?: boolean;
  /** issue 1403：固定 DAT 阵亡回血光环标记（BloodUnitID 指向 CombatAbility & 32 实体）。 */
  deathHealAura?: boolean;
  /** issue 1446：固定 DAT 单位固有每分钟生命回复速率（仅正值时导出，如狂战士 40、刘备 15）。 */
  regenRate?: number;
  /** issue 1384：固定 DAT Task 156 每批训练产出数（仅 > 1 时导出，如黑檀木步弓手为 2）。 */
  trainCount?: number;
  atks: [string, number][];
  arms: [string, number][];
  desc: string;
  civs: string[];
  /** 原始护甲类别 id（用于模拟器判定单位类别） */
  cls: number[];
  /** 护甲类别（不含近战/穿刺）：[类别名, 护甲值]，决定受到哪些克制加成 */
  armc: [string, number][];
  up: [Cost, number] | null;
  bz: string;
  ben: string;
  dlc: number | null;
}
export interface Tech {
  /** issue 123 全拼 / 首字母，构建时生成 */
  py?: string;
  pyi?: string;
  id: number;
  en: string;
  zh: string;
  type: string;
  age: number;
  b: number;
  pic: number | string;
  pre: number | null;
  cost: Cost;
  rt: number;
  /** 固定源中的 256 倍科技模式标记；缺失表示未知。 */
  repeatable?: boolean;
  desc: string;
  descEn: string;
  civs: string[];
  bz: string;
  ben: string;
  dlc: number | null;
  /** 独立免费更新引入的当前具名科技；与 DLC 首发互斥。 */
  introducedUpdate?: string;
}
/** 科技树格子：[行, 列, 类型 u/t, id, 是否可用 0/1, 连线父级 id] */
/** 格子类型：u=单位 t=科技 b=建筑（如鱼栅、港口） */
export type TreeCell = [number, number, 'u' | 't' | 'b', number, number, number | null];
export type TreeBlock = [number, number, number, TreeCell[]];
export interface Trees {
  b: Record<string, [string, string, string | number, number]>;
  t: Record<string, TreeBlock[]>;
}
export interface Dlc {
  zh: string;
  en: string;
  year: number;
  civs: string[];
}

/** 模拟结果：StatSet + 对建筑射程（仅蓄力远程单位，= rng + Unit.rngBd，#38） */
export type SimStats = StatSet & { rngB?: number };
export interface StatSet {
  hp: number;
  atk: number;
  ma: number;
  pa: number;
  rng: number;
  spd: number;
  /** 最小射程 / 驻扎容量 / 建造或生产时间 / 建筑护甲（建筑模拟器用） */
  minr: number;
  gar: number;
  bt: number;
  barm: number;
  los: number;
  rof: number;
  acc: number;
  bonus: Record<string, number>;
  /** 护甲类别当前值（不含近战/穿刺）。来自单位 armc，可被 armc 效果修改。 */
  armc: Record<string, number>;
  /** 生效 combatAbility（属性 63）位掩码，由基础值经 a:63 科技算术叠加得出。 */
  ca: number;
  /** 额外伤害减免比例（属性 24，0..1，如孟加拉象兵 0.25、西西里陆军 0.4；基础值为 0）。 */
  bdr: number;
  rofx: number;
}
export type NumStat = Exclude<keyof StatSet, 'bonus' | 'rofx' | 'armc' | 'ca' | 'bdr'>;
/** 效果：add 加值、mul 乘、set 设定；rof 表示攻速 +x%（攻击间隔 /(1+x)）；bonus 为对某类别的加成伤害（op=mul 时按倍率放大已有加成）；armc 为护甲类别加减；ca 为属性 63 位掩码算术改写；bdr 为属性 24 额外伤害减免 */
export type Effect =
  | { s: Exclude<NumStat, 'rof'>; op?: 'add' | 'mul' | 'set'; v: number }
  | { s: 'ca'; op?: 'add' | 'mul' | 'set'; v: number }
  | { s: 'bdr'; op?: 'add' | 'mul' | 'set'; v: number }
  | { s: 'rof'; v: number }
  | { s: 'bonus'; vs: string; v: number; op?: 'add' | 'mul' }
  | { s: 'armc'; vs: string; v: number; op?: 'add' | 'mul' };
export type UnitPred = (u: Unit) => boolean;

export type BuildingType = 'military' | 'economy' | 'defense' | 'other';
export interface BuildingAttackClass {
  classId: number;
  amount: number;
  label?: string;
}

export interface Building {
  /** issue 123 全拼 / 首字母，构建时生成 */
  py?: string;
  pyi?: string;
  id: number;
  en: string;
  zh: string;
  age: number;
  pic: number;
  cost: Cost;
  hp: number;
  ma: number;
  pa: number;
  /** 所有建筑护甲（护甲类别 11） */
  barm: number;
  /** 建造时间（秒） */
  bt: number;
  gar: number;
  atk: number;
  /** 目录攻击类别。缺字段表示无来源，空数组表示来源明确为空。 */
  atks?: BuildingAttackClass[];
  rng: number;
  /** 对建筑射程；仅当与 rng 不同时存在 */
  rngB?: number;
  minr: number;
  rof: number;
  los: number;
  /** 提供人口（仅当游戏说明中明确写出时） */
  pop: number;
  desc: string;
  descEn: string;
  civs: string[];
  /** 该建筑格子中出现过的单位/科技（所有文明并集） */
  units: number[];
  techs: number[];
  dlc: number | null;
  type: BuildingType;
}
