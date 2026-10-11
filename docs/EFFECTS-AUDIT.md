# 效果审计：.dat 原始效果 vs 历史手工规则

> 本文件由 `scripts/effects_audit.ts` 生成（`npx vite-node scripts/effects_audit.ts`），请勿手改。

## 数据源与新鲜度

| 源 | 仓库@提交 | 文件 | 对应补丁 | 用途 |
|---|---|---|---|---|
| A | HSZemi/aoe2dat@c0cec9b | `data/full.json.xz` | DE Update 147949 (2025-06-26) | 战斗属性 EffectCommands |
| B | PeterWhiteJavascript/aoe2-de-tools@34e889c | `tools/gamedata/snapshot.json` | 2026-10-03 快照（DE Update 185872 之后，datVersion VER 8.9，build 25464371） | 当前补丁的加成清单、科技前置、经济/费用 EffectCommands |
| C | linhongcun/lhc-aoe2@6fdb912 | `lib/data/unitTechFx.ts` | 作者本机 .dat（2026-08） | 新鲜度对账 |

- 源 A 是唯一公开、含**全部** EffectCommands 的 DE .dat 转储，但停在 2025-06（DE Update 147949）；其后 5 个补丁（162286 / 169123 / 170934 / 177723 / 185872）与 6 个新文明（Danes、Mapuche、Muisca、Saxons、Tupi、Varangians）不在其中。
- 源 B 是当前补丁（2026-10-03）由 genieutils 读取的快照，56 文明齐全，但只保留经济/费用类命令；用来校验科技 id 是否仍是同一科技（内部名比对），并提供当前的经济数值。
- 同一 tech id 在 A、B 内部名不同（id 被重用或新增）→ 视为 A 无战斗数据（`combat=false`），回退手工表。
- **新鲜度检查**：每条加成把 .dat 累计数值（按时代）与当前补丁的游戏内加成文本（civs.json，来自当前 aoe2techtree 字符串）里的数字比对；不一致即判定 A 已过时，回退手工表/文本。
- 源 A 中不存在的单位/建筑（31 个：Champi Scout、Champi Warrior、Elite Champi Warrior、Settlement、Guecha Warrior、Elite Guecha Warrior、Kona、Elite Kona、Bolas Rider、Elite Bolas Rider、Blackwood Archer、Elite Blackwood Archer、Ibirapema Warrior、Elite Ibirapema Warrior、Temple Guard、Elite Temple Guard、Champi Runner、Hulk、War Hulk、Carrack、Catapult Galleon、Mounted Crossbowman、Heavy Mounted Crossbowman、Varangian Guard、Elite Varangian Guard、Hearth Troop、Elite Hearth Troop、Jarl、Elite Jarl、Jomsviking、Elite Jomsviking）：科技/加成对它们的作用范围沿用手工判定。

## 覆盖率

| | 之前（手工） | 现在 |
|---|---|---|
| 加成条目总数（文明加成 + 团队加成） | 281 | 281 |
| 数值编码（进模拟器/对比/作用对象） | 66（51 条文明加成 + 15 条团队加成） | **97**（.dat 83 + 手工回退 14） |
| 仅经济/费用类 .dat 结构化效果（文本展示） | 0 | 117 |
| 仅文本 | 215 | 67 |
| 数值编码的科技 | 32 | **98**（.dat 98 + 手工 0） |
| 通用隐藏科技（时代自动/组合触发） | 0 | 16 |

（手工 CivBonus 条目 45 个，按加成文本序号去重后 51 条。）

## 一、科技：手工规则 vs .dat

对每个手工编码的科技，逐单位/建筑把两边效果套到基础属性上比较**最终增量**（因此 `+1 攻击` 与 `×1.x` 等价写法不算差异）。
「.dat」侧含组合触发的通用隐藏科技（如 Arrowslits + Keep），不含新单位回退部分。

### Forging

- 手工 `atk +1` → .dat `—`：火焰骆驼(Flaming Camel)
- 手工 `—` → .dat `atk +1`：掷斧兵(Throwing Axeman)、马穆鲁克(Mameluke)、飞刀女兵(Gbeto)、飞轮刃投掷手(Chakram Thrower)、精锐掷斧兵(Elite Throwing Axeman)、精锐马穆鲁克(Elite Mameluke)、精锐飞刀女兵(Elite Gbeto)、精锐飞轮刃投掷手(Elite Chakram Thrower)

### Iron Casting

- 手工 `atk +1` → .dat `—`：火焰骆驼(Flaming Camel)
- 手工 `—` → .dat `atk +1`：掷斧兵(Throwing Axeman)、马穆鲁克(Mameluke)、飞刀女兵(Gbeto)、飞轮刃投掷手(Chakram Thrower)、精锐掷斧兵(Elite Throwing Axeman)、精锐马穆鲁克(Elite Mameluke)、精锐飞刀女兵(Elite Gbeto)、精锐飞轮刃投掷手(Elite Chakram Thrower)

### Blast Furnace

- 手工 `atk +2` → .dat `—`：火焰骆驼(Flaming Camel)
- 手工 `—` → .dat `atk +2`：掷斧兵(Throwing Axeman)、马穆鲁克(Mameluke)、飞刀女兵(Gbeto)、飞轮刃投掷手(Chakram Thrower)、精锐掷斧兵(Elite Throwing Axeman)、精锐马穆鲁克(Elite Mameluke)、精锐飞刀女兵(Elite Gbeto)、精锐飞轮刃投掷手(Elite Chakram Thrower)

### Fletching

- 手工 `—` → .dat `atk +1, rng +1, los +1`：楼船(Thirisadai)、城楼(Donjon)
- 手工 `atk +1, rng +1, los +1` → .dat `—`：飞镖骑兵(Arambai)、精锐飞镖骑兵(Elite Arambai)、巨港(Harbor)

### Bodkin Arrow

- 手工 `—` → .dat `atk +1, rng +1, los +1`：楼船(Thirisadai)、城楼(Donjon)
- 手工 `atk +1, rng +1, los +1` → .dat `—`：飞镖骑兵(Arambai)、精锐飞镖骑兵(Elite Arambai)、巨港(Harbor)

### Bracer

- 手工 `—` → .dat `atk +1, rng +1, los +1`：楼船(Thirisadai)、城楼(Donjon)
- 手工 `atk +1, rng +1, los +1` → .dat `—`：飞镖骑兵(Arambai)、精锐飞镖骑兵(Elite Arambai)、巨港(Harbor)

### Scale Barding Armor

- 手工 `ma +1, pa +1` → .dat `—`：火焰骆驼(Flaming Camel)

### Chain Barding Armor

- 手工 `ma +1, pa +1` → .dat `—`：火焰骆驼(Flaming Camel)

### Plate Barding Armor

- 手工 `ma +1, pa +2` → .dat `—`：火焰骆驼(Flaming Camel)

### Gambesons

- 手工 `—` → .dat `pa +1`：罗马军(Legionary)

### Thumb Ring

- 手工 `rof -0.45, acc +15` → .dat `rof -0.6, acc +15`：诸葛弩(Chu Ko Nu)、精锐诸葛弩(Elite Chu Ko Nu)
- 手工 `rof -0.38` → .dat `rof -0.25`：高丽战车(War Wagon)、精锐高丽战车(Elite War Wagon)
- 手工 `rof -0.3, acc +80` → .dat `—`：飞镖骑兵(Arambai)
- 手工 `rof -0.3, acc +70` → .dat `—`：精锐飞镖骑兵(Elite Arambai)
- 手工 `rof -0.3, acc +50` → .dat `rof -0.2, acc +50`：骑射手(Cavalry Archer)
- 手工 `rof -0.3, acc +20` → .dat `rof -0.2, acc +20`：重装骑射手(Heavy Cavalry Archer)

### Parthian Tactics

- 手工 `ma +1, pa +2, vs 长矛兵 +2` → .dat `—`：西班牙征服者(Conquistador)、精锐西班牙征服者(Elite Conquistador)

### Chemistry

- 手工 `—` → .dat `atk +1`：楼船(Thirisadai)、德罗蒙战舰(Dromon)、楼船(Lou Chuan)、城镇中心(Town Center)、城楼(Donjon)

### Masonry

- 手工 `hp +48, ma +1, pa +1, barm +3` → .dat `—`：农田(Farm)
- 手工 `hp +15, ma +1, pa +1, barm +3` → .dat `—`：木栅栏(Palisade Wall)
- 手工 `hp +24, ma +1, pa +1, barm +3` → .dat `—`：木城门(Palisade Gate)
- 手工 `hp +56, ma +1, pa +1, barm +3` → .dat `—`：牧场(Pasture)
- 手工 `hp +108, ma +1, pa +1, barm +3` → .dat `—`：石墙(Stone Wall)
- 手工 `hp +25, ma +1, pa +1, barm +3` → .dat `—`：养鱼场(Fish Trap)
- 手工 `hp +165, ma +1, pa +1, barm +3` → .dat `—`：城门(Gate)
- 手工 `hp +300, ma +1, pa +1, barm +3` → .dat `—`：垛墙(Fortified Wall)

### Architecture

- 手工 `hp +48, ma +1, pa +1, barm +3` → .dat `—`：农田(Farm)
- 手工 `hp +15, ma +1, pa +1, barm +3` → .dat `—`：木栅栏(Palisade Wall)
- 手工 `hp +24, ma +1, pa +1, barm +3` → .dat `—`：木城门(Palisade Gate)
- 手工 `hp +56, ma +1, pa +1, barm +3` → .dat `—`：牧场(Pasture)
- 手工 `hp +108, ma +1, pa +1, barm +3` → .dat `—`：石墙(Stone Wall)
- 手工 `hp +25, ma +1, pa +1, barm +3` → .dat `—`：养鱼场(Fish Trap)
- 手工 `hp +165, ma +1, pa +1, barm +3` → .dat `—`：城门(Gate)
- 手工 `hp +300, ma +1, pa +1, barm +3` → .dat `—`：垛墙(Fortified Wall)

### Arrowslits

- 手工 `atk +3` → .dat `atk +1`：城楼(Donjon)

### Murder Holes

- 手工 `—` → .dat `minr -1`：船坞(Dock)、巨港(Harbor)、强化教堂(Fortified Church)

### Heated Shot

- 手工 `vs 船只 +4` → .dat `—`：船坞(Dock)、巨港(Harbor)、强化教堂(Fortified Church)
- 手工 `vs 船只 +4` → .dat `vs 渔船 +4, vs 船只 +4`：城堡(Castle)、营垒(Krepost)

### Town Watch

- 手工 `los +4` → .dat `—`：农田(Farm)、木栅栏(Palisade Wall)、木城门(Palisade Gate)、牧场(Pasture)、石墙(Stone Wall)、养鱼场(Fish Trap)、城门(Gate)、垛墙(Fortified Wall)

### Town Patrol

- 手工 `los +4` → .dat `—`：农田(Farm)、木栅栏(Palisade Wall)、木城门(Palisade Gate)、牧场(Pasture)、石墙(Stone Wall)、养鱼场(Fish Trap)、城门(Gate)、垛墙(Fortified Wall)

### 由 .dat 新增数值编码的科技（之前仅文本或未编码）

Andean Sling、Artillery、Atlatl、Bagains、Ballistas、Block Printing、Bogsveigar、Caravan、Careening、Chatras、Chieftains、Cilician Fleet、Citadels、Comitatenses、Counterweights、Crenellations、Drill、Dry Dock、Eupseong、Fabric Shields、Farimba、Fereters、Fervor、Frontier Guards、Furor Celtica、Garland Wars、Great Wall、Greek Fire、Hand Cart、Hauberk、Hill Forts、Holcans、Howdah、Illumination、Inquisition、Ironclad、Kataparuto、Logistica、Loom、Manipur Cavalry、Ming-Kuang Armor、Paiks、Pirotechnia、Recurve Bow、Rocketry、Sanctity、Sappers、Shatagni、Shinkichon、Shipwright、Siege Engineers、Silk Armor、Sipahi、Steppe Husbandry、Stirrups、Stronghold、Supremacy、Svan Towers、Thalassocracy、Timurid Siegecraft、Tower Shields、Tusk Swords、Wagenburg Tactics、Warwolf、Wheelbarrow、Yeomen

## 二、文明加成：手工规则 vs .dat

逐条（按加成文本序号）、逐单位/建筑、逐时代比较最终增量。「采用」列为现在模拟器使用的来源。

### 不列颠（Britons）#2：步弓手在城堡/帝王时代的射程 +1/+2

- 英文原文：Foot Archers +1/+2 range in Castle/Imperial Age
- .dat 条目：382 `C-Bonus, +1 Archer range`（时代 3）；403 `C-Bonus, archer range +1`（时代 4）
- 新鲜度：吻合（.dat 累计 [1,2,1,2]；文本数字 [1,2]）
- 采用：**dat**
- 时代3: 手工 `rng +1, los +1` / .dat `—`；时代4: 手工 `rng +2, los +2` / .dat `—`：掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)

### 勃艮第（Burgundians）#3：火药单位攻击力 +25%

- 英文原文：Gunpowder Units +25% attack
- .dat 条目：769 `C-Bonus, Gunpowder units +25% attack`（时代 1）
- 新鲜度：吻合（.dat 累计 [[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25]]；文本数字 [25]）
- 采用：**dat**
- 时代1: 手工 `atk +12.5` / .dat `atk +12.5, vs 所有建筑 +50, vs 攻城武器 +6.25`；时代2: 手工 `atk +12.5` / .dat `atk +12.5, vs 所有建筑 +50, vs 攻城武器 +6.25`；时代3: 手工 `atk +12.5` / .dat `atk +12.5, vs 所有建筑 +50, vs 攻城武器 +6.25`；时代4: 手工 `atk +12.5` / .dat `atk +12.5, vs 所有建筑 +50, vs 攻城武器 +6.25`：炮舰(Cannon Galleon)
- 时代1: 手工 `atk +15` / .dat `atk +15, vs 所有建筑 +68.75, vs 攻城武器 +6.25`；时代2: 手工 `atk +15` / .dat `atk +15, vs 所有建筑 +68.75, vs 攻城武器 +6.25`；时代3: 手工 `atk +15` / .dat `atk +15, vs 所有建筑 +68.75, vs 攻城武器 +6.25`；时代4: 手工 `atk +15` / .dat `atk +15, vs 所有建筑 +68.75, vs 攻城武器 +6.25`：精锐炮舰(Elite Cannon Galleon)
- 时代1: 手工 `atk +10` / .dat `atk +10, vs 所有建筑 +50, vs 船只 +10, vs 攻城武器 +5, vs 石质防御 +10, vs 类别37 +10`；时代2: 手工 `atk +10` / .dat `atk +10, vs 所有建筑 +50, vs 船只 +10, vs 攻城武器 +5, vs 石质防御 +10, vs 类别37 +10`；时代3: 手工 `atk +10` / .dat `atk +10, vs 所有建筑 +50, vs 船只 +10, vs 攻城武器 +5, vs 石质防御 +10, vs 类别37 +10`；时代4: 手工 `atk +10` / .dat `atk +10, vs 所有建筑 +50, vs 船只 +10, vs 攻城武器 +5, vs 石质防御 +10, vs 类别37 +10`：手推炮(Bombard Cannon)
- 时代1: 手工 `atk +4.25` / .dat `atk +4.25, vs 长矛兵 +0.25, vs 步兵 +2.5, vs 冲车 +0.5`；时代2: 手工 `atk +4.25` / .dat `atk +4.25, vs 长矛兵 +0.25, vs 步兵 +2.5, vs 冲车 +0.5`；时代3: 手工 `atk +4.25` / .dat `atk +4.25, vs 长矛兵 +0.25, vs 步兵 +2.5, vs 冲车 +0.5`；时代4: 手工 `atk +4.25` / .dat `atk +4.25, vs 长矛兵 +0.25, vs 步兵 +2.5, vs 冲车 +0.5`：火枪手(Hand Cannoneer)

### 拜占庭（Byzantines）#4：喷火船和德罗蒙战舰的攻击速度 +25%

- 英文原文：Fire Ships and Dromons attack +25% faster
- .dat 条目：397 `C-Bonus, Navy attack speed`（时代 1）
- 新鲜度：**不一致**（.dat 累计 [20]；文本数字 [25]）
- 采用：**manual**
- 时代1: 手工 `rof -1.6` / .dat `rof -1.33`；时代2: 手工 `rof -1.6` / .dat `rof -1.33`；时代3: 手工 `rof -1.6` / .dat `rof -1.33`；时代4: 手工 `rof -1.6` / .dat `rof -1.33`：德罗蒙战舰(Dromon)

### 凯尔特（Celts）#3：攻城武器攻击速度 +25%

- 英文原文：Siege Weapons attack +25% faster
- .dat 条目：386 `C-Bonus, Siege fire rate`（时代 1）
- 新鲜度：吻合（.dat 累计 [25]；文本数字 [25]）
- 采用：**dat**
- 时代1: 手工 `rof -2` / .dat `—`；时代2: 手工 `rof -2` / .dat `—`；时代3: 手工 `rof -2` / .dat `—`；时代4: 手工 `rof -2` / .dat `—`：巨型投石机(Trebuchet (Packed))

### 中国（Chinese）#3：火矛兵和喷火船在城堡/帝王时代移动速度 +5/10%

- 英文原文：Fire Lancers and Fire Ships move +5/10% faster in Castle/Imperial Age
- .dat 条目：983 `C-Bonus, Fire Lancer/Ship speed Castle`（时代 3）；984 `C-Bonus, Fire Lancer/Ship speed Imp`（时代 4）
- 新鲜度：吻合（.dat 累计 [5,[9,10]]；文本数字 [5,10]）
- 采用：**dat**
- 时代3: 手工 `—` / .dat `spd +0.08`；时代4: 手工 `—` / .dat `spd +0.16`：龙舟(Dragon Ship)

### 埃塞俄比亚（Ethiopians）#1：步弓手攻击速度 +18%

- 英文原文：Foot Archers attack +18% faster
- .dat 条目：607 `C-Bonus, Archers fire +15% fas`（时代 1）
- 新鲜度：吻合（.dat 累计 [18]；文本数字 [18]）
- 采用：**dat**
- 时代1: 手工 `rof -0.46` / .dat `—`；时代2: 手工 `rof -0.46` / .dat `—`；时代3: 手工 `rof -0.46` / .dat `—`；时代4: 手工 `rof -0.46` / .dat `—`：掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)

### 意大利（Italians）#1：步弓手和意大利佣兵的近战护甲 +1/远程护甲 +1

- 英文原文：Foot Archers and Condottieri +1 melee/+1 pierce armor
- .dat 条目：901 `C-Bonus, Archers +1/+1 armor`（时代 1）
- 新鲜度：吻合（.dat 累计 [1,1]；文本数字 [1]）
- 采用：**dat**
- 时代1: 手工 `ma +1, pa +1` / .dat `—`；时代2: 手工 `ma +1, pa +1` / .dat `—`；时代3: 手工 `ma +1, pa +1` / .dat `—`；时代4: 手工 `ma +1, pa +1` / .dat `—`：掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)

### 日本（Japanese）#3：捕鱼船在黑暗/封建/城堡/帝王时代的工作速度 +5/10/15/20%；生命值 +100%

- 英文原文：Fishing Ships work +5/10/15/20% faster in Dark/Feudal/Castle/Imperial Age; +100% HP
- .dat 条目：306 `C-Bonus, Better Fishing Ships`（时代 1）；422 `C-Bonus`（时代 2）；423 `C-Bonus`（时代 3）；424 `C-Bonus`（时代 4）
- 新鲜度：**不一致**（.dat 累计 [[50,100],2,5,[9,10],[13,15],[17,20]]；文本数字 [5,10,15,20,100]）
- 采用：**manual**
- 时代1: 手工 `hp +50` / .dat `hp +50, pa +2`；时代2: 手工 `hp +50` / .dat `hp +50, pa +2`；时代3: 手工 `hp +50` / .dat `hp +50, pa +2`；时代4: 手工 `hp +50` / .dat `hp +50, pa +2`：渔船(Fishing Ship)

### 女真（Jurchens）#1：从封建时代开始，骑乘单位和火枪骑兵的攻击速度 +25%

- 英文原文：Mounted Units and Fire Lancers attack +25% faster starting in Feudal Age
- .dat 条目：无（源 A 无该文明/该加成的战斗命令）
- 新鲜度：无可比数值（.dat 累计 []；文本数字 [25]）
- 采用：**manual**
- 时代2: 手工 `rof -0.43` / .dat `—`；时代3: 手工 `rof -0.43` / .dat `—`；时代4: 手工 `rof -0.43` / .dat `—`：铁浮屠(Iron Pagoda)、精锐铁浮屠(Elite Iron Pagoda)
- 时代2: 手工 `rof -0.4` / .dat `—`；时代3: 手工 `rof -0.4` / .dat `—`；时代4: 手工 `rof -0.4` / .dat `—`：火矛兵(Fire Lancer)、精锐火矛兵(Elite Fire Lancer)、骑射手(Cavalry Archer)、重装骑射手(Heavy Cavalry Archer)、斥候骑兵(Scout Cavalry)、轻型骑兵(Light Cavalry)、草原枪兵(Steppe Lancer)、精锐草原枪兵(Elite Steppe Lancer)
- 时代2: 手工 `rof -0.38` / .dat `—`；时代3: 手工 `rof -0.38` / .dat `—`；时代4: 手工 `rof -0.38` / .dat `—`：翼骑兵(Hussar)

### 马普切（Mapuche）#2：步兵、投石手和掷矛手在封建/城堡/帝王时代的生命值 +5/10/15

- 英文原文：Infantry, Slingers and Skirmishers +5/10/15 HP in Feudal/Castle/Imperial Age
- .dat 条目：无（源 A 无该文明/该加成的战斗命令）
- 新鲜度：无可比数值（.dat 累计 []；文本数字 [5,10,15]）
- 采用：**manual**
- 时代2: 手工 `hp +5` / .dat `—`；时代3: 手工 `hp +10` / .dat `—`；时代4: 手工 `hp +15` / .dat `—`：长矛兵(Spearman)、长枪兵(Pikeman)、长戟兵(Halberdier)、掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)、投石手(Slinger)

### 蒙古（Mongols）#2：斥候骑兵系和草原枪兵在城堡/帝王时代的生命值 +20/30%

- 英文原文：Scout Cavalry-line and Steppe Lancers +20/30% HP in Castle/Imperial Age
- .dat 条目：288 `C-Bonus, Light Cavalry +20% HP`（时代 3）；388 `C-Bonus, Light Cavalry +30% HP`（时代 4）
- 新鲜度：吻合（.dat 累计 [[17,20],[23,30]]；文本数字 [20,30]）
- 采用：**dat**
- 时代4: 手工 `hp +22.5` / .dat `hp +22.56`：翼骑兵(Hussar)
- 时代4: 手工 `hp +24` / .dat `hp +24.06`：精锐草原枪兵(Elite Steppe Lancer)

### 穆伊斯卡（Muisca）#2：蔷琵战士和靶场单位在封建/城堡/帝王时代的近战护甲 +1/2/3

- 英文原文：Champi Warriors and Archery Range Units +1/2/3 melee armor in Feudal/Castle/Imperial Age
- .dat 条目：无（源 A 无该文明/该加成的战斗命令）
- 新鲜度：无可比数值（.dat 累计 []；文本数字 [1,2,3]）
- 采用：**manual**
- 时代2: 手工 `ma +1` / .dat `—`；时代3: 手工 `ma +2` / .dat `—`；时代4: 手工 `ma +3` / .dat `—`：步弓手(Archer)、掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)、弩手(Crossbowman)、投石手(Slinger)、劲弩手(Arbalester)

### 葡萄牙（Portuguese）#3：船只在封建/城堡/帝王时代的生命值 +10/15/20%

- 英文原文：Ships +10/15/20% HP in Feudal/Castle/Imperial Age
- .dat 条目：无（源 A 无该文明/该加成的战斗命令）
- 新鲜度：无可比数值（.dat 累计 []；文本数字 [10,15,20]）
- 采用：**manual**
- 时代2: 手工 `hp +13` / .dat `—`；时代3: 手工 `hp +19.5` / .dat `—`；时代4: 手工 `hp +26` / .dat `—`：卡拉维尔战舰(Caravel)
- 时代2: 手工 `hp +15` / .dat `—`；时代3: 手工 `hp +22.5` / .dat `—`；时代4: 手工 `hp +30` / .dat `—`：精锐卡拉维尔战舰(Elite Caravel)、精锐炮舰(Elite Cannon Galleon)
- 时代2: 手工 `hp +5` / .dat `—`；时代3: 手工 `hp +7.5` / .dat `—`；时代4: 手工 `hp +10` / .dat `—`：渔船(Fishing Ship)
- 时代2: 手工 `hp +7` / .dat `—`；时代3: 手工 `hp +10.5` / .dat `—`；时代4: 手工 `hp +14` / .dat `—`：运输船(Transport Ship)
- 时代2: 手工 `hp +8` / .dat `—`；时代3: 手工 `hp +12` / .dat `—`；时代4: 手工 `hp +16` / .dat `—`：贸易船(Trade Cog)
- 时代2: 手工 `hp +11` / .dat `—`；时代3: 手工 `hp +16.5` / .dat `—`；时代4: 手工 `hp +22` / .dat `—`：箭船(Galley)、火艨艟(Fire Galley)
- 时代2: 手工 `hp +12.5` / .dat `—`；时代3: 手工 `hp +18.75` / .dat `—`；时代4: 手工 `hp +25` / .dat `—`：战船(War Galley)
- 时代2: 手工 `hp +12` / .dat `—`；时代3: 手工 `hp +18` / .dat `—`；时代4: 手工 `hp +24` / .dat `—`：喷火船(Fire Ship)、炮舰(Cannon Galleon)
- 时代2: 手工 `hp +15.5` / .dat `—`；时代3: 手工 `hp +23.25` / .dat `—`；时代4: 手工 `hp +31` / .dat `—`：大型战舰(Galleon)

### 撒克逊人（Saxons）#3：维京长船和大型投石战舰的生命值 +20%

- 英文原文：Longships and Catapult Galleons +20% HP
- .dat 条目：无（源 A 无该文明/该加成的战斗命令）
- 新鲜度：无可比数值（.dat 累计 []；文本数字 [20]）
- 采用：**manual**
- 时代1: 手工 `hp +25` / .dat `—`；时代2: 手工 `hp +25` / .dat `—`；时代3: 手工 `hp +25` / .dat `—`；时代4: 手工 `hp +25` / .dat `—`：维京长船(Longship)
- 时代1: 手工 `hp +26` / .dat `—`；时代2: 手工 `hp +26` / .dat `—`；时代3: 手工 `hp +26` / .dat `—`；时代4: 手工 `hp +26` / .dat `—`：精锐维京长船(Elite Longship)

### 西西里（Sicilians）#4：防御工事建造速度 +50%，城镇中心建造速度 +100%

- 英文原文：Fortifications built +50% faster; Town Centers built +100% faster
- .dat 条目：770 `C-Bonus, Fast Castle and TC`（时代 1）
- 新鲜度：吻合（.dat 累计 [[33,50]]；文本数字 [50,100]）
- 采用：**dat**
- 时代1: 手工 `—` / .dat `bt -2.33`；时代2: 手工 `—` / .dat `bt -2.33`；时代3: 手工 `—` / .dat `bt -2.33`；时代4: 手工 `—` / .dat `bt -2.33`：木栅栏(Palisade Wall)
- 时代1: 手工 `bt -50` / .dat `—`；时代2: 手工 `bt -50` / .dat `—`；时代3: 手工 `bt -50` / .dat `—`；时代4: 手工 `bt -50` / .dat `—`：城镇中心(Town Center)、营垒(Krepost)
- 时代1: 手工 `—` / .dat `bt -10`；时代2: 手工 `—` / .dat `bt -10`；时代3: 手工 `—` / .dat `bt -10`；时代4: 手工 `—` / .dat `bt -10`：木城门(Palisade Gate)
- 时代1: 手工 `—` / .dat `bt -3.33`；时代2: 手工 `—` / .dat `bt -3.33`；时代3: 手工 `—` / .dat `bt -3.33`；时代4: 手工 `—` / .dat `bt -3.33`：石墙(Stone Wall)、垛墙(Fortified Wall)
- 时代1: 手工 `—` / .dat `bt -23.33`；时代2: 手工 `—` / .dat `bt -23.33`；时代3: 手工 `—` / .dat `bt -23.33`；时代4: 手工 `—` / .dat `bt -23.33`：城门(Gate)

### 西班牙（Spanish）#0：建筑工的工作速度 +30%

- 英文原文：Builders work +30% faster
- .dat 条目：-1 `Tech tree #1`（时代 1）
- 新鲜度：吻合（.dat 累计 [[23,30]]；文本数字 [30]）
- 采用：**dat**
- 时代1: 手工 `bt -807.69` / .dat `—`；时代2: 手工 `bt -807.69` / .dat `—`；时代3: 手工 `bt -807.69` / .dat `—`；时代4: 手工 `bt -807.69` / .dat `—`：世界奇观(Wonder)

### 西班牙（Spanish）#3：火药单位攻击速度 +18%

- 英文原文：Gunpowder Units attack +18% faster
- .dat 条目：-2 `Tech tree #2`（时代 1）
- 新鲜度：吻合（.dat 累计 [18]；文本数字 [18]）
- 采用：**dat**
- 时代1: 手工 `rof -0.44` / .dat `—`；时代2: 手工 `rof -0.44` / .dat `—`；时代3: 手工 `rof -0.44` / .dat `—`；时代4: 手工 `rof -0.44` / .dat `—`：西班牙征服者(Conquistador)、精锐西班牙征服者(Elite Conquistador)

### 条顿（Teutons）#1：城镇中心驻扎容量 +10；塔驻扎容量 +5

- 英文原文：Town Centers +10 garrison capacity; Towers +5 garrison capacity
- .dat 条目：336 `C-Bonus, TC + Atk`（时代 1）；353 `C-Bonus, Tower Arrows`（时代 1）
- 新鲜度：吻合（.dat 累计 [10,5]；文本数字 [5,10]）
- 采用：**dat**
- 时代1: 手工 `—` / .dat `gar +5`；时代2: 手工 `—` / .dat `gar +5`；时代3: 手工 `—` / .dat `gar +5`；时代4: 手工 `—` / .dat `gar +5`：城楼(Donjon)、炮塔(Bombard Tower)

### 条顿（Teutons）#2：步兵和骑兵单位在城堡/帝王时代的近战护甲 +1/+2

- 英文原文：Infantry and Mounted Units +1/+2 melee armor in Castle/Imperial Age
- .dat 条目：334 `C-Bonus, Inf Cav +1 armor Age3`（时代 3）；335 `C-Bonus, Inf Cav +1 armor Age4`（时代 4）
- 新鲜度：吻合（.dat 累计 [1,2]；文本数字 [1,2]）
- 采用：**dat**
- 时代3: 手工 `ma +1` / .dat `—`；时代4: 手工 `ma +2` / .dat `—`：条顿骑士(Teutonic Knight)、精锐条顿骑士(Elite Teutonic Knight)

### 瓦兰吉人（Varangians）#2：瓦兰吉卫队的攻击速度 +25%，产生的黄金 +50%

- 英文原文：Varangian Guards attack +25% faster and generate +50% gold
- .dat 条目：无（源 A 无该文明/该加成的战斗命令）
- 新鲜度：无可比数值（.dat 累计 []；文本数字 [25,50]）
- 采用：**manual**

### 瓦兰吉人（Varangians）#3：维京长船和大型投石战舰的攻击速度 +15%

- 英文原文：Longships and Catapult Galleons attack +15% faster
- .dat 条目：无（源 A 无该文明/该加成的战斗命令）
- 新鲜度：无可比数值（.dat 累计 []；文本数字 [15]）
- 采用：**manual**
- 时代1: 手工 `rof -0.39` / .dat `—`；时代2: 手工 `rof -0.39` / .dat `—`；时代3: 手工 `rof -0.39` / .dat `—`；时代4: 手工 `rof -0.39` / .dat `—`：维京长船(Longship)、精锐维京长船(Elite Longship)

### 越南（Vietnamese）#2：步弓手和掷矛手生命值 +20%

- 英文原文：Foot Archers and Skirmishers +20% HP
- .dat 条目：632 `C-Bonus, Archers +20% HP`（时代 1）
- 新鲜度：吻合（.dat 累计 [[17,20]]；文本数字 [20]）
- 采用：**dat**
- 时代1: 手工 `hp +7` / .dat `—`；时代2: 手工 `hp +7` / .dat `—`；时代3: 手工 `hp +7` / .dat `—`；时代4: 手工 `hp +7` / .dat `—`：藤弓兵(Rattan Archer)
- 时代1: 手工 `hp +8` / .dat `—`；时代2: 手工 `hp +8` / .dat `—`；时代3: 手工 `hp +8` / .dat `—`；时代4: 手工 `hp +8` / .dat `—`：精锐藤弓兵(Elite Rattan Archer)
- 时代1: 手工 `—` / .dat `hp +13`；时代2: 手工 `—` / .dat `hp +13`；时代3: 手工 `—` / .dat `hp +13`；时代4: 手工 `—` / .dat `hp +13`：火矛兵(Fire Lancer)
- 时代1: 手工 `—` / .dat `hp +17`；时代2: 手工 `—` / .dat `hp +17`；时代3: 手工 `—` / .dat `hp +17`；时代4: 手工 `—` / .dat `hp +17`：精锐火矛兵(Elite Fire Lancer)
- 时代1: 手工 `—` / .dat `hp +10`；时代2: 手工 `—` / .dat `hp +10`；时代3: 手工 `—` / .dat `hp +10`；时代4: 手工 `—` / .dat `hp +10`：骑射手(Cavalry Archer)
- 时代1: 手工 `—` / .dat `hp +12`；时代2: 手工 `—` / .dat `hp +12`；时代3: 手工 `—` / .dat `hp +12`；时代4: 手工 `—` / .dat `hp +12`：重装骑射手(Heavy Cavalry Archer)

### 魏（Wei）#1：黑光铠骑兵和鲜卑掠骑兵在城堡/帝王时代的生命值 +20/30%

- 英文原文：Hei Guang Cavalry and Xianbei Raider +20/30% HP in Castle/Imperial Age
- .dat 条目：1058 `C-Bonus, Heavy Cav +15% HP`（时代 3）；1059 `C-Bonus, Heavy Cav +30% HP`（时代 4）
- 新鲜度：**不一致**（.dat 累计 [[13,15],[23,30]]；文本数字 [20,30]）
- 采用：**manual**
- 时代3: 手工 `hp +6` / .dat `hp +4.5`：鲜卑掠骑兵(Xianbei Raider)
- 时代3: 手工 `hp +12` / .dat `hp +9`：黑光铠骑兵(Hei Guang Cavalry)
- 时代3: 手工 `hp +18` / .dat `hp +13.5`：重装黑光铠骑兵(Heavy Hei Guang Cavalry)

## 三、团队加成：手工规则 vs .dat

### 法兰克：骑士系视野 +2

- 采用：**dat**；新鲜度：{"ok":true,"dat":[2],"text":[2]}
- 手工 `—` → .dat `los +2`：萨瓦尔(Savar)

### 波斯：骑士系对远程士兵攻击 +2

- 采用：**dat**；新鲜度：{"ok":true,"dat":[2],"text":[2]}
- 手工 `—` → .dat `vs 弓手 +2`：萨瓦尔(Savar)

### 萨拉森：步弓手和散兵对建筑攻击 +2

- 采用：**manual**；新鲜度：{"ok":false,"dat":[3],"text":[2]}
- 手工 `vs 标准建筑 +2` → .dat `vs 标准建筑 +3`：长弓兵(Longbowman)、诸葛弩(Chu Ko Nu)、羽箭手(Plumed Archer)、热那亚弩手(Genoese Crossbowman)、藤弓兵(Rattan Archer)、复合弓箭手(Composite Bowman)、火焰弓箭手(Fire Archer)、精锐长弓兵(Elite Longbowman)、精锐诸葛弩(Elite Chu Ko Nu)、精锐羽箭手(Elite Plumed Archer)、精锐热那亚弩手(Elite Genoese Crossbowman)、精锐藤弓兵(Elite Rattan Archer) 等 21 个
- 手工 `vs 标准建筑 +2` → .dat `—`：标枪骑兵(Genitour)、精锐标枪骑兵(Elite Genitour)

### 丹麦：攻城武器视野 +2

- 采用：**manual**（源 A 无该文明）；新鲜度：{"ok":null,"dat":[],"text":[2]}
- 手工 `los +2` → .dat `—`：战车(War Chariot)、榴弹炮(Houfnice)、骆驼投石机(Mounted Trebuchet)、风琴炮(Organ Gun)、重弩战象(Ballista Elephant)、胡斯派战车(Hussite Wagon)、精锐风琴炮(Elite Organ Gun)、精锐重弩战象(Elite Ballista Elephant)、精锐胡斯派战车(Elite Hussite Wagon)、弩炮(Scorpion)、轻型投石车(Mangonel)、攻城塔(Siege Tower) 等 25 个

### 高棉：蝎式弩炮射程 +1

- 采用：**dat**；新鲜度：{"ok":true,"dat":[1,1],"text":[1]}
- 手工 `rng +1` → .dat `rng +1, los +1`：弩炮(Scorpion)、重型弩炮(Heavy Scorpion)

### 高丽：村民视野 +3

- 采用：**dat**；新鲜度：{"ok":true,"dat":[3],"text":[3]}
- 手工 `los +3` → .dat `—`：火焰骆驼(Flaming Camel)、骆驼投石机(Mounted Trebuchet)、马穆鲁克(Mameluke)、骆驼射手(Camel Archer)、弯刀勇士(Shotel Warrior)、精锐马穆鲁克(Elite Mameluke)、精锐骆驼射手(Elite Camel Archer)、精锐弯刀勇士(Elite Shotel Warrior)、骆驼斥候(Camel Scout)、帝王骆驼兵(Imperial Camel Rider)、骆驼兵(Camel Rider)、重装骆驼兵(Heavy Camel Rider)
- 手工 `—` → .dat `los +3`：村民(Villager)

### 马普切：长矛兵系与散兵视野 +2

- 采用：**manual**（源 A 无该文明）；新鲜度：{"ok":null,"dat":[],"text":[2]}
- 手工 `los +2` → .dat `—`：标枪骑兵(Genitour)、精锐标枪骑兵(Elite Genitour)、帝王掷矛手(Imperial Skirmisher)、长矛兵(Spearman)、长枪兵(Pikeman)、长戟兵(Halberdier)、掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)、投石手(Slinger)、长矛兵(Spearman)、长枪兵(Pikeman)、长戟兵(Halberdier)

### 蜀：步弓手视野 +2

- 采用：**dat**；新鲜度：{"ok":true,"dat":[2],"text":[2]}
- 手工 `los +2` → .dat `—`：帝王掷矛手(Imperial Skirmisher)、掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)

### 鞑靼：骑射单位视野 +2

- 采用：**dat**；新鲜度：{"ok":true,"dat":[2],"text":[2]}
- 手工 `los +2` → .dat `—`：西班牙征服者(Conquistador)、飞镖骑兵(Arambai)、精锐西班牙征服者(Elite Conquistador)、精锐飞镖骑兵(Elite Arambai)

### 瓦兰吉：骑士系对步兵攻击 +1

- 采用：**manual**（源 A 无该文明）；新鲜度：{"ok":null,"dat":[],"text":[1]}
- 手工 `vs 步兵 +1` → .dat `—`：骑士(Knight)、重装骑士(Cavalier)、游侠(Paladin)

### 魏：骑兵对攻城武器攻击 +2

- 采用：**dat**；新鲜度：{"ok":true,"dat":[2],"text":[2]}
- 手工 `vs 攻城武器 +2` → .dat `—`：传教士(Missionary)

## 四、.dat（2025-06）与当前补丁文本不一致的加成（已回退）

| 文明 | 条目 | 当前文本 | .dat 累计值 | 现在采用 |
|---|---|---|---|---|
| 拜占庭 | #4 | Fire Ships and Dromons attack +25% faster | [20] | manual |
| 瞿折罗 | #2 | Mounted Units deal +20/30/40% bonus damage in Feudal/Castle/Imperial Age | [[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40]] | text |
| 印加 | #2 | Military Units cost -15/20/25/30% food in Dark/Feudal/Castle/Imperial Age | [[15,18],0,[20,25],[40,66]] | eco |
| 日本 | #3 | Fishing Ships work +5/10/15/20% faster in Dark/Feudal/Castle/Imperial Age; +100% HP | [[50,100],2,5,[9,10],[13,15],[17,20]] | manual |
| 萨拉森 | 团队 | Foot Archers and Skirmishers +2 attack vs. buildings | [3] | manual |
| 瓦兰吉人 | #1 | Bloodlines and Caravan effects +50% | [8] | eco |
| 魏 | #1 | Hei Guang Cavalry and Xianbei Raider +20/30% HP in Castle/Imperial Age | [[13,15],[23,30]] | manual |
| 吴 | #1 | Infantry regenerates 10/15/30 HP per minute in Feudal/Castle/Imperial Age | [10,20,30] | eco |

## 五、与 linhongcun/lhc-aoe2（作者本机 .dat，2026-08）科技数值对账

可比科技 66 个，一致 62 个；不一致（lhc 的「代表值」取自 2026-08 本机 .dat，A 为 2025-06）：

| 科技 | 差异 |
|---|---|
| Andean Sling | atk: lhc 1 / .dat(A) — |
| Ballistas | atk: lhc 2 / .dat(A) — |
| Fabric Shields | pa: lhc 1 / .dat(A) 2 |
| Dry Dock | pa: lhc 1 / .dat(A) — |

## 六、.dat 中存在、加成文本未列出的效果（已计入模拟器，标注为「隐藏加成」）

- 中国：396 `C-Bonus, +50% Demo HP` → 3 个目标 [{"op":"mul","s":"hp","v":1.5}]
- 西班牙：-3 `Tech tree #3` → 1 个目标 [{"op":"mul","s":"bt","v":0.833308}]

## 七、通用隐藏科技（所有文明，时代自动或组合触发）

- 20 `Auto upgrade Scout Feudal Age`：时代 ≥ 2 → 3 个目标 [{"s":"los","v":2}]；1 个目标 [{"s":"atk","v":2},{"s":"los","v":2},{"s":"spd","v":0.35}]；1 个目标 [{"s":"los","v":1}]；1 个目标 [{"s":"atk","v":2},{"s":"bonus","v":2,"vs":"渔船"},{"s":"bonus","v":2,"vs":"船只"},{"s":"bonus","v":2,"vs":"骆驼"},{"s":"bonus","v":4,"vs":"骑兵"},{"s":"los","v":1},{"s":"spd","v":0.25}]
- 71 `Walls HP castle age`：时代 ≥ 3 → 2 个目标 [{"op":"mul","s":"hp","v":1.66667}]
- 72 `Palisade Walls HP feudal age`：时代 ≥ 2 → 2 个目标 [{"op":"mul","s":"hp","v":1.66667}]
- 90 `Tracking`：时代 ≥ 2 → 76 个目标 [{"s":"los","v":2}]
- 610 `Arrowslits (Guard tower)`：时代 ≥ 1，需 Arrowslits + Guard Tower → 4 个目标 [{"s":"atk","v":1}]
- 611 `Arrowslits (Keep)`：时代 ≥ 1，需 Arrowslits + Keep → 4 个目标 [{"s":"atk","v":1}]
- 669 `Thalassocracy + Fletching`：时代 ≥ 1，需 Fletching + Thalassocracy → 2 个目标 [{"s":"atk","v":1},{"s":"los","v":1},{"s":"rng","v":1}]
- 670 `Thalassocracy + Bodkin`：时代 ≥ 1，需 Bodkin Arrow + Thalassocracy → 2 个目标 [{"s":"atk","v":1},{"s":"los","v":1},{"s":"rng","v":1}]
- 671 `Thalassocracy + Bracer`：时代 ≥ 1，需 Bracer + Thalassocracy → 2 个目标 [{"s":"atk","v":1},{"s":"los","v":1},{"s":"rng","v":1}]
- 734 `Thalassocracy + Chemistry`：时代 ≥ 1，需 Chemistry + Thalassocracy → 2 个目标 [{"s":"atk","v":1}]
- 735 `Thalassocracy + Murder Holes`：时代 ≥ 1，需 Murder Holes + Thalassocracy → 2 个目标 [{"s":"minr","v":-1}]
- 736 `Thalassocracy + Heated Shot`：时代 ≥ 1，需 Heated Shot + Thalassocracy → 2 个目标 [{"s":"bonus","v":4,"vs":"渔船"},{"s":"bonus","v":4,"vs":"船只"}]
- 774 `Flemish Militia Age3`：时代 ≥ 3 → 1 个目标 [{"s":"atk","v":3},{"s":"bonus","v":1,"vs":"渔船"},{"s":"bonus","v":1,"vs":"船只"},{"s":"bonus","v":1,"vs":"骆驼"},{"s":"bonus","v":1,"vs":"骑兵"},{"s":"hp","v":10}]
- 797 `Flemish Militia Age4`：时代 ≥ 4 → 1 个目标 [{"s":"atk","v":3},{"s":"bonus","v":1,"vs":"渔船"},{"s":"bonus","v":1,"vs":"船只"},{"s":"bonus","v":1,"vs":"骆驼"},{"s":"bonus","v":1,"vs":"骑兵"},{"s":"hp","v":5}]
- 1163 `Shadow Transport Ship -- Age Three`：时代 ≥ 3 → 1 个目标 [{"s":"gar","v":5}]
- 1164 `Shadow Transport Ship -- Age Four`：时代 ≥ 4 → 1 个目标 [{"s":"gar","v":10}]

---
差异小计：科技 46 组、文明加成 23 条、团队加成 11 条。
