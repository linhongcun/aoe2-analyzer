# 效果审计：DE 188329 原版 .dat 效果 vs 上一版数据源 vs 历史手工规则

> 本文件由 `scripts/effects_audit.ts` 生成（`npx vite-node scripts/effects_audit.ts`），请勿手改。

## 数据源与新鲜度

| 源 | 仓库@提交 | 文件 | 对应补丁 | 用途 |
|---|---|---|---|---|
| DAT | SiegeEngineers/auto-mods@e293dc1 | `dat/empires2_x2_p1.dat` | DE Update 188329 (2026-10-28) | 全部 EffectCommands（战斗 + 经济/费用）、科技前置、文明科技树/团队加成；datVersion VER 8.9 |
| C | linhongcun/lhc-aoe2@6fdb912 | `lib/data/unitTechFx.ts` | 作者本机 .dat（2026-08） | 对账参考（仅 EFFECTS-AUDIT 第五节；不影响 effects.json） |

- 唯一数值来源：DE 原版 `empires2_x2_p1.dat`（SiegeEngineers/auto-mods@e293dc1，DE Update 188329），构建时下载并校验 sha256 与补丁标记（`python3 scripts/dat_source.py --check`），用 genieutils-py 解析。.dat © Microsoft，不提交、不随站点发布。
- 已移除：HSZemi/aoe2dat（DE 147949，2025-06）与 PeterWhite 快照（仅经济命令）的组合，以及「.dat 过时 → 回退手工表」的新鲜度回退。
- **文本一致性检查**（仅提示，不再回退）：把每条加成的 .dat 累计数值与游戏说明文字（civs.json）里的数字比对；不一致时以 .dat 为准，并在加成页标注。
- .dat 中缺失的站内单位/建筑：0 个。

## 零、更新前快照 → 当前 .dat（188329）的数值变化

逐科技 / 逐加成、逐单位（帝王时代、仅该条效果）比较最终增量；只列有变化的条目。

更新前快照来源：SiegeEngineers/auto-mods@0c38027（DE Update 185872 (2026-09-23)）；linhongcun/lhc-aoe2@6fdb912（作者本机 .dat（2026-08））。快照仅用于本次更新差分，不作为当前游戏参数来源。

### 科技


### 文明加成与团队加成


小计：科技 0 个、加成 0 条有数值变化（前后均比较固定 .dat 规则，不按文本一致性提示丢弃旧规则；历史手工规则 vs 当前 .dat 见第一~三节）。

## 覆盖率

| | 最初（手工） | 历史组合源（HSZemi+PeterWhite+回退） | 现在（188329 .dat） |
|---|---|---|---|
| 加成条目总数（文明加成 + 团队加成） | 281 | 281 | 281 |
| 数值编码（进模拟器/对比/作用对象） | 66（51 条文明加成 + 15 条团队加成） | 97（84 + 手工回退 13） | **103**（.dat 103 + 手工回退 0） |
| 仅经济/费用类 .dat 结构化效果（文本展示） | 0 | 117 | 134 |
| 仅文本 | 215 | 67 | 44 |
| 数值编码的科技 | 32 | 98 | **104**（.dat 104 + 手工 0） |
| 通用隐藏科技（时代自动/组合触发） | 0 | 16 | 13 |

（手工 CivBonus 条目 45 个，按加成文本序号去重后 51 条。）

## 一、科技：手工规则 vs .dat

对每个手工编码的科技，逐单位/建筑把两边效果套到基础属性上比较**最终增量**（因此 `+1 攻击` 与 `×1.x` 等价写法不算差异）。
「.dat」侧含组合触发的通用隐藏科技（如 Arrowslits + Keep），不含新单位回退部分。

### Forging

- 手工 `atk +1` → .dat `—`：火焰骆驼(Flaming Camel)
- 手工 `—` → .dat `atk +1`：掷斧兵(Throwing Axeman)、马穆鲁克(Mameluke)、飞刀女兵(Gbeto)、飞轮刃投掷手(Chakram Thrower)、首领(Jarl)、精锐掷斧兵(Elite Throwing Axeman)、精锐马穆鲁克(Elite Mameluke)、精锐飞刀女兵(Elite Gbeto)、精锐飞轮刃投掷手(Elite Chakram Thrower)、精锐首领(Elite Jarl)

### Iron Casting

- 手工 `atk +1` → .dat `—`：火焰骆驼(Flaming Camel)
- 手工 `—` → .dat `atk +1`：掷斧兵(Throwing Axeman)、马穆鲁克(Mameluke)、飞刀女兵(Gbeto)、飞轮刃投掷手(Chakram Thrower)、首领(Jarl)、精锐掷斧兵(Elite Throwing Axeman)、精锐马穆鲁克(Elite Mameluke)、精锐飞刀女兵(Elite Gbeto)、精锐飞轮刃投掷手(Elite Chakram Thrower)、精锐首领(Elite Jarl)

### Blast Furnace

- 手工 `atk +2` → .dat `—`：火焰骆驼(Flaming Camel)
- 手工 `—` → .dat `atk +2`：掷斧兵(Throwing Axeman)、马穆鲁克(Mameluke)、飞刀女兵(Gbeto)、飞轮刃投掷手(Chakram Thrower)、首领(Jarl)、精锐掷斧兵(Elite Throwing Axeman)、精锐马穆鲁克(Elite Mameluke)、精锐飞刀女兵(Elite Gbeto)、精锐飞轮刃投掷手(Elite Chakram Thrower)、精锐首领(Elite Jarl)

### Fletching

- 手工 `—` → .dat `atk +1, rng +1, los +1`：楼船(Thirisadai)、城楼(Donjon)
- 手工 `atk +1, rng +1, los +1` → .dat `—`：飞镖骑兵(Arambai)、精锐飞镖骑兵(Elite Arambai)
- 手工 `—` → .dat `los +1`：扈从部队(Hearth Troop)、精锐扈从部队(Elite Hearth Troop)
- 手工 `—` → .dat `atk +1`：船坞(Dock)
- 手工 `atk +1, rng +1, los +1` → .dat `atk +1`：巨港(Harbor)

### Bodkin Arrow

- 手工 `—` → .dat `atk +1, rng +1, los +1`：楼船(Thirisadai)、城楼(Donjon)
- 手工 `atk +1, rng +1, los +1` → .dat `—`：飞镖骑兵(Arambai)、精锐飞镖骑兵(Elite Arambai)
- 手工 `—` → .dat `los +1`：扈从部队(Hearth Troop)、精锐扈从部队(Elite Hearth Troop)
- 手工 `—` → .dat `atk +1`：船坞(Dock)
- 手工 `atk +1, rng +1, los +1` → .dat `atk +1`：巨港(Harbor)

### Bracer

- 手工 `—` → .dat `atk +1, rng +1, los +1`：楼船(Thirisadai)、城楼(Donjon)
- 手工 `atk +1, rng +1, los +1` → .dat `—`：飞镖骑兵(Arambai)、精锐飞镖骑兵(Elite Arambai)
- 手工 `—` → .dat `los +1`：扈从部队(Hearth Troop)、精锐扈从部队(Elite Hearth Troop)
- 手工 `—` → .dat `atk +1`：船坞(Dock)
- 手工 `atk +1, rng +1, los +1` → .dat `atk +1`：巨港(Harbor)

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
- 手工 `rof -0.38, acc +20` → .dat `rof -0.25, acc +20`：骑马弩兵(Mounted Crossbowman)、重装骑马弩兵(Heavy Mounted Crossbowman)
- 手工 `rof -0.3, acc +20` → .dat `rof -0.2, acc +20`：重装骑射手(Heavy Cavalry Archer)

### Parthian Tactics

- 手工 `ma +1, pa +2, vs 长矛兵 +2` → .dat `—`：西班牙征服者(Conquistador)、精锐西班牙征服者(Elite Conquistador)

### Chemistry

- 手工 `—` → .dat `atk +1`：楼船(Thirisadai)、德罗蒙战舰(Dromon)、楼船(Lou Chuan)、大型投石战舰(Catapult Galleon)、船坞(Dock)、城镇中心(Town Center)、城楼(Donjon)、巨港(Harbor)

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

- 手工 `—` → .dat `vs 船只 +4`：兵营(Barracks)、磨坊(Mill)、房屋(House)、城镇中心(Town Center)、伐木场(Lumber Camp)、采矿场(Mining Camp)、哨站(Outpost)、大庄园(Folwark)、骡车(Mule Cart)、聚落(Settlement)、市场(Market)、靶场(Archery Range) 等 20 个

### Town Watch

- 手工 `los +4` → .dat `—`：农田(Farm)、木栅栏(Palisade Wall)、木城门(Palisade Gate)、牧场(Pasture)、石墙(Stone Wall)、养鱼场(Fish Trap)、城门(Gate)、垛墙(Fortified Wall)

### Town Patrol

- 手工 `los +4` → .dat `—`：农田(Farm)、木栅栏(Palisade Wall)、木城门(Palisade Gate)、牧场(Pasture)、石墙(Stone Wall)、养鱼场(Fish Trap)、城门(Gate)、垛墙(Fortified Wall)

### 由 .dat 新增数值编码的科技（之前仅文本或未编码）

Andean Sling、Artillery、Atlatl、Bagains、Ballistas、Block Printing、Bogsveigar、Caciques、Caravan、Careening、Carvel Hull、Chatras、Chieftains、Cilician Fleet、Circumnavigation、Citadels、Clerical Recruitment、Clinker Construction、Comitatenses、Counterweights、Cranequins、Crenellations、Drill、Dry Dock、Eupseong、Fabric Shields、Farimba、Fereters、Fervor、Frontier Guards、Furor Celtica、Garland Wars、Great Wall、Greek Fire、Hand Cart、Hauberk、Herbalism、Hill Forts、Holcans、Howdah、Huaracas、Inquisition、Ironclad、Kataparuto、Loom、Manipur Cavalry、Ming-Kuang Armor、Northmen's Fury、Paiks、Pirotechnia、Recurve Bow、Rocketry、Sanctity、Sappers、Shatagni、Shinkichon、Shipwright、Siege Engineers、Silk Armor、Sipahi、Steppe Husbandry、Stirrups、Stronghold、Supremacy、Svan Towers、Timurid Siegecraft、Tower Shields、Tusk Swords、Wagenburg Tactics、Warwolf、Wheelbarrow、Yeomen

## 二、文明加成：手工规则 vs .dat

逐条（按加成文本序号）、逐单位/建筑、逐时代比较最终增量。「采用」列为现在模拟器使用的来源。

### 不列颠（Britons）#2：步弓手在城堡/帝王时代的射程 +1/+2

- 英文原文：Foot Archers +1/+2 range in Castle/Imperial Age
- .dat 条目：382 `C-Bonus, +1 Archer range`（时代 3）；403 `C-Bonus, archer range +1`（时代 4）
- 文本一致性：吻合（.dat 累计 [1,2,1,2]；文本数字 [1,2]）
- 采用：**dat**
- 时代3: 手工 `rng +1, los +1` / .dat `—`；时代4: 手工 `rng +2, los +2` / .dat `—`：掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)

### 勃艮第（Burgundians）#3：火药单位攻击力 +25%

- 英文原文：Gunpowder Units +25% attack
- .dat 条目：-25 `Tech tree #25`（时代 1）；769 `C-Bonus, Gunpowder units +25% attack`（时代 1）
- 文本一致性：吻合（.dat 累计 [[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25],[20,25]]；文本数字 [25]）
- 采用：**dat**
- 时代1: 手工 `atk +12.5` / .dat `atk +12.5, vs 所有建筑 +50, vs 攻城武器 +6.25`；时代2: 手工 `atk +12.5` / .dat `atk +12.5, vs 所有建筑 +50, vs 攻城武器 +6.25`；时代3: 手工 `atk +12.5` / .dat `atk +12.5, vs 所有建筑 +50, vs 攻城武器 +6.25`；时代4: 手工 `atk +12.5` / .dat `atk +12.5, vs 所有建筑 +50, vs 攻城武器 +6.25`：炮舰(Cannon Galleon)
- 时代1: 手工 `atk +15` / .dat `atk +15, vs 所有建筑 +68.75, vs 攻城武器 +6.25`；时代2: 手工 `atk +15` / .dat `atk +15, vs 所有建筑 +68.75, vs 攻城武器 +6.25`；时代3: 手工 `atk +15` / .dat `atk +15, vs 所有建筑 +68.75, vs 攻城武器 +6.25`；时代4: 手工 `atk +15` / .dat `atk +15, vs 所有建筑 +68.75, vs 攻城武器 +6.25`：精锐炮舰(Elite Cannon Galleon)
- 时代1: 手工 `atk +10` / .dat `atk +10, vs 所有建筑 +50, vs 船只 +10, vs 攻城武器 +5, vs 石质防御 +10, vs 重型攻城武器 +10`；时代2: 手工 `atk +10` / .dat `atk +10, vs 所有建筑 +50, vs 船只 +10, vs 攻城武器 +5, vs 石质防御 +10, vs 重型攻城武器 +10`；时代3: 手工 `atk +10` / .dat `atk +10, vs 所有建筑 +50, vs 船只 +10, vs 攻城武器 +5, vs 石质防御 +10, vs 重型攻城武器 +10`；时代4: 手工 `atk +10` / .dat `atk +10, vs 所有建筑 +50, vs 船只 +10, vs 攻城武器 +5, vs 石质防御 +10, vs 重型攻城武器 +10`：手推炮(Bombard Cannon)
- 时代1: 手工 `atk +4.25` / .dat `atk +4.25, vs 长矛兵 +0.25, vs 步兵 +2.5, vs 冲车 +0.5`；时代2: 手工 `atk +4.25` / .dat `atk +4.25, vs 长矛兵 +0.25, vs 步兵 +2.5, vs 冲车 +0.5`；时代3: 手工 `atk +4.25` / .dat `atk +4.25, vs 长矛兵 +0.25, vs 步兵 +2.5, vs 冲车 +0.5`；时代4: 手工 `atk +4.25` / .dat `atk +4.25, vs 长矛兵 +0.25, vs 步兵 +2.5, vs 冲车 +0.5`：火枪手(Hand Cannoneer)

### 凯尔特（Celts）#3：攻城武器攻击速度 +25%

- 英文原文：Siege Weapons attack +25% faster
- .dat 条目：386 `C-Bonus, Siege fire rate`（时代 1）
- 文本一致性：吻合（.dat 累计 [25]；文本数字 [25]）
- 采用：**dat**
- 时代1: 手工 `rof -2` / .dat `—`；时代2: 手工 `rof -2` / .dat `—`；时代3: 手工 `rof -2` / .dat `—`；时代4: 手工 `rof -2` / .dat `—`：巨型投石机(Trebuchet (Packed))

### 中国（Chinese）#3：火矛兵和喷火船在城堡/帝王时代移动速度 +5/10%

- 英文原文：Fire Lancers and Fire Ships move +5/10% faster in Castle/Imperial Age
- .dat 条目：983 `C-Bonus, Fire Lancer/Ship speed Castle`（时代 3）；984 `C-Bonus, Fire Lancer/Ship speed Imp`（时代 4）
- 文本一致性：吻合（.dat 累计 [5,[9,10]]；文本数字 [5,10]）
- 采用：**dat**
- 时代3: 手工 `—` / .dat `spd +0.08`；时代4: 手工 `—` / .dat `spd +0.16`：龙舟(Dragon Ship)

### 埃塞俄比亚（Ethiopians）#1：步弓手攻击速度 +18%

- 英文原文：Foot Archers attack +18% faster
- .dat 条目：607 `C-Bonus, Archers fire +15% fas`（时代 1）
- 文本一致性：吻合（.dat 累计 [18]；文本数字 [18]）
- 采用：**dat**
- 时代1: 手工 `rof -0.46` / .dat `—`；时代2: 手工 `rof -0.46` / .dat `—`；时代3: 手工 `rof -0.46` / .dat `—`；时代4: 手工 `rof -0.46` / .dat `—`：掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)

### 意大利（Italians）#1：步弓手和意大利佣兵的近战护甲 +1/远程护甲 +1

- 英文原文：Foot Archers and Condottieri +1 melee/+1 pierce armor
- .dat 条目：-1 `Tech tree #1`（时代 1）；901 `C-Bonus, Archers +1/+1 armor`（时代 1）
- 文本一致性：吻合（.dat 累计 [1,1]；文本数字 [1]）
- 采用：**dat**
- 时代1: 手工 `ma +1, pa +1` / .dat `—`；时代2: 手工 `ma +1, pa +1` / .dat `—`；时代3: 手工 `ma +1, pa +1` / .dat `—`；时代4: 手工 `ma +1, pa +1` / .dat `—`：掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)

### 蒙古（Mongols）#2：斥候骑兵系和草原枪兵在城堡/帝王时代的生命值 +20/30%

- 英文原文：Scout Cavalry-line and Steppe Lancers +20/30% HP in Castle/Imperial Age
- .dat 条目：288 `C-Bonus, Light Cavalry +20% HP`（时代 3）；388 `C-Bonus, Light Cavalry +30% HP`（时代 4）
- 文本一致性：吻合（.dat 累计 [[17,20],[23,30]]；文本数字 [20,30]）
- 采用：**dat**
- 时代4: 手工 `hp +22.5` / .dat `hp +22.56`：翼骑兵(Hussar)
- 时代4: 手工 `hp +24` / .dat `hp +24.06`：精锐草原枪兵(Elite Steppe Lancer)

### 穆伊斯卡（Muisca）#2：蔷琵战士和靶场单位在封建/城堡/帝王时代的近战护甲 +1/2/3

- 英文原文：Champi Warriors and Archery Range Units +1/2/3 melee armor in Feudal/Castle/Imperial Age
- .dat 条目：1369 `C-Bonus, Arch + Champi +1 armor Age2`（时代 2）；1370 `C-Bonus, Arch + Champi +1 armor Age3`（时代 3）；1371 `C-Bonus, Arch + Champi +1 armor Age4`（时代 4）
- 文本一致性：吻合（.dat 累计 [1,2,3]；文本数字 [1,2,3]）
- 采用：**dat**
- 时代2: 手工 `—` / .dat `ma +1`；时代3: 手工 `—` / .dat `ma +2`；时代4: 手工 `—` / .dat `ma +3`：蔷琵斥候(Champi Scout)、蔷琵步兵(Champi Runner)

### 波斯（Persians）#1：城镇中心和码头的生命值 +100%，在黑暗/封建/城堡/帝王时代的工作速度 +5/10/15/20%

- 英文原文：Town Centers and Docks +100% HP and work +5/10/15/20% faster in Dark/Feudal/Castle/Imperial Age
- .dat 条目：342 `C-Bonus, TC Productivity`（时代 1）；349 `C-Bonus, Super Dock`（时代 1）；409 `C-Bonus, TC and Dock work rate`（时代 1）
- 文本一致性：吻合（.dat 累计 [[50,100],[50,100],5]；文本数字 [5,10,15,20,100]）
- 采用：**dat**
- 时代1: 手工 `—` / .dat `hp +2000`；时代2: 手工 `—` / .dat `hp +2000`；时代3: 手工 `—` / .dat `hp +2000`；时代4: 手工 `—` / .dat `hp +2000`：巨港(Harbor)

### 葡萄牙（Portuguese）#3：船只在封建/城堡/帝王时代的生命值 +10/15/20%

- 英文原文：Ships +10/15/20% HP in Feudal/Castle/Imperial Age
- .dat 条目：560 `C-Bonus, Ships +10% HP`（时代 2）；1398 `C-Bonus, Ships +15% HP`（时代 3）；1399 `C-Bonus, Ships +20% HP`（时代 4）
- 文本一致性：吻合（.dat 累计 [[9,10],[13,15],[17,20]]；文本数字 [10,15,20]）
- 采用：**dat**
- 时代3: 手工 `hp +19.5` / .dat `hp +19.81`；时代4: 手工 `hp +26` / .dat `hp +26.62`：卡拉维尔战舰(Caravel)
- 时代3: 手工 `hp +22.5` / .dat `hp +22.86`；时代4: 手工 `hp +30` / .dat `hp +30.71`：精锐卡拉维尔战舰(Elite Caravel)、精锐炮舰(Elite Cannon Galleon)
- 时代3: 手工 `hp +7.5` / .dat `hp +7.62`；时代4: 手工 `hp +10` / .dat `hp +10.24`：渔船(Fishing Ship)
- 时代3: 手工 `hp +10.5` / .dat `hp +10.67`；时代4: 手工 `hp +14` / .dat `hp +14.33`：运输船(Transport Ship)
- 时代3: 手工 `hp +12` / .dat `hp +12.19`；时代4: 手工 `hp +16` / .dat `hp +16.38`：贸易船(Trade Cog)
- 时代3: 手工 `hp +16.5` / .dat `hp +16.76`；时代4: 手工 `hp +22` / .dat `hp +22.52`：箭船(Galley)、火艨艟(Fire Galley)、战争趸船(War Hulk)
- 时代3: 手工 `hp +12.75` / .dat `hp +12.95`；时代4: 手工 `hp +17` / .dat `hp +17.4`：趸船(Hulk)
- 时代3: 手工 `hp +18.75` / .dat `hp +19.05`；时代4: 手工 `hp +25` / .dat `hp +25.59`：战船(War Galley)
- 时代3: 手工 `hp +18` / .dat `hp +18.29`；时代4: 手工 `hp +24` / .dat `hp +24.57`：喷火船(Fire Ship)、炮舰(Cannon Galleon)
- 时代3: 手工 `hp +23.25` / .dat `hp +23.62`；时代4: 手工 `hp +31` / .dat `hp +31.74`：大型战舰(Galleon)
- 时代3: 手工 `hp +20.25` / .dat `hp +20.57`；时代4: 手工 `hp +27` / .dat `hp +27.64`：大帆船(Carrack)

### 西西里（Sicilians）#4：防御工事建造速度 +50%，城镇中心建造速度 +100%

- 英文原文：Fortifications built +50% faster; Town Centers built +100% faster
- .dat 条目：770 `C-Bonus, Fast Castle and TC`（时代 1）
- 文本一致性：吻合（.dat 累计 [[33,50]]；文本数字 [50,100]）
- 采用：**dat**
- 时代1: 手工 `—` / .dat `bt -2.33`；时代2: 手工 `—` / .dat `bt -2.33`；时代3: 手工 `—` / .dat `bt -2.33`；时代4: 手工 `—` / .dat `bt -2.33`：木栅栏(Palisade Wall)
- 时代1: 手工 `bt -50` / .dat `—`；时代2: 手工 `bt -50` / .dat `—`；时代3: 手工 `bt -50` / .dat `—`；时代4: 手工 `bt -50` / .dat `—`：城镇中心(Town Center)、营垒(Krepost)
- 时代1: 手工 `—` / .dat `bt -10`；时代2: 手工 `—` / .dat `bt -10`；时代3: 手工 `—` / .dat `bt -10`；时代4: 手工 `—` / .dat `bt -10`：木城门(Palisade Gate)
- 时代1: 手工 `—` / .dat `bt -3.33`；时代2: 手工 `—` / .dat `bt -3.33`；时代3: 手工 `—` / .dat `bt -3.33`；时代4: 手工 `—` / .dat `bt -3.33`：石墙(Stone Wall)、垛墙(Fortified Wall)
- 时代1: 手工 `—` / .dat `bt -23.33`；时代2: 手工 `—` / .dat `bt -23.33`；时代3: 手工 `—` / .dat `bt -23.33`；时代4: 手工 `—` / .dat `bt -23.33`：城门(Gate)

### 西班牙（Spanish）#0：建筑工的工作速度 +30%

- 英文原文：Builders work +30% faster
- .dat 条目：-1 `Tech tree #1`（时代 1）
- 文本一致性：吻合（.dat 累计 [[23,30]]；文本数字 [30]）
- 采用：**dat**
- 时代1: 手工 `bt -807.69` / .dat `—`；时代2: 手工 `bt -807.69` / .dat `—`；时代3: 手工 `bt -807.69` / .dat `—`；时代4: 手工 `bt -807.69` / .dat `—`：世界奇观(Wonder)

### 西班牙（Spanish）#3：火药单位攻击速度 +18%

- 英文原文：Gunpowder Units attack +18% faster
- .dat 条目：-2 `Tech tree #2`（时代 1）
- 文本一致性：吻合（.dat 累计 [18]；文本数字 [18]）
- 采用：**dat**
- 时代1: 手工 `rof -0.44` / .dat `—`；时代2: 手工 `rof -0.44` / .dat `—`；时代3: 手工 `rof -0.44` / .dat `—`；时代4: 手工 `rof -0.44` / .dat `—`：西班牙征服者(Conquistador)、精锐西班牙征服者(Elite Conquistador)

### 条顿（Teutons）#1：城镇中心驻扎容量 +10；塔驻扎容量 +5

- 英文原文：Town Centers +10 garrison capacity; Towers +5 garrison capacity
- .dat 条目：336 `C-Bonus, TC + Atk`（时代 1）；353 `C-Bonus, Tower Arrows`（时代 1）
- 文本一致性：吻合（.dat 累计 [10,5]；文本数字 [5,10]）
- 采用：**dat**
- 时代1: 手工 `—` / .dat `gar +5`；时代2: 手工 `—` / .dat `gar +5`；时代3: 手工 `—` / .dat `gar +5`；时代4: 手工 `—` / .dat `gar +5`：城楼(Donjon)、炮塔(Bombard Tower)

### 魏（Wei）#1：黑光铠骑兵和鲜卑掠骑兵在城堡/帝王时代的生命值 +20/30%

- 英文原文：Hei Guang Cavalry and Xianbei Raider +20/30% HP in Castle/Imperial Age
- .dat 条目：1058 `C-Bonus, Heavy Cav +15% HP`（时代 3）；1059 `C-Bonus, Heavy Cav +30% HP`（时代 4）
- 文本一致性：**不一致**（.dat 累计 [[17,20],[23,30],[9,10]]；文本数字 [20,30]）
- 采用：**dat**
- 时代4: 手工 `hp +9` / .dat `hp +9.53`：鲜卑掠骑兵(Xianbei Raider)

## 三、团队加成：手工规则 vs .dat

### 法兰克：骑士系视野 +2

- 采用：**dat**；文本一致性：{"ok":true,"dat":[2],"text":[2]}
- 手工 `—` → .dat `los +2`：萨瓦尔(Savar)

### 波斯：骑士系对远程士兵攻击 +2

- 采用：**dat**；文本一致性：{"ok":true,"dat":[2],"text":[2]}
- 手工 `—` → .dat `vs 弓手 +2`：萨瓦尔(Savar)

### 萨拉森：步弓手和散兵对建筑攻击 +2

- 采用：**dat**；文本一致性：{"ok":false,"dat":[3],"text":[2]}
- 手工 `vs 标准建筑 +2` → .dat `vs 标准建筑 +3`：长弓兵(Longbowman)、诸葛弩(Chu Ko Nu)、羽箭手(Plumed Archer)、热那亚弩手(Genoese Crossbowman)、藤弓兵(Rattan Archer)、复合弓箭手(Composite Bowman)、火焰弓箭手(Fire Archer)、格查战士(Guecha Warrior)、黑檀木步弓手(Blackwood Archer)、精锐长弓兵(Elite Longbowman)、精锐诸葛弩(Elite Chu Ko Nu)、精锐羽箭手(Elite Plumed Archer) 等 25 个
- 手工 `vs 标准建筑 +2` → .dat `—`：标枪骑兵(Genitour)、精锐标枪骑兵(Elite Genitour)

### 丹麦：攻城武器视野 +2

- 采用：**dat**；文本一致性：{"ok":true,"dat":[2],"text":[2]}
- 手工 `—` → .dat `los +2`：火焰骆驼(Flaming Camel)、爆破兵(Petard)

### 高棉：蝎式弩炮射程 +1

- 采用：**dat**；文本一致性：{"ok":true,"dat":[1,1],"text":[1]}
- 手工 `rng +1` → .dat `rng +1, los +1`：弩炮(Scorpion)、重型弩炮(Heavy Scorpion)

### 高丽：村民视野 +3

- 采用：**dat**；文本一致性：{"ok":true,"dat":[3],"text":[3]}
- 手工 `los +3` → .dat `—`：火焰骆驼(Flaming Camel)、骆驼投石机(Mounted Trebuchet)、马穆鲁克(Mameluke)、骆驼射手(Camel Archer)、弯刀勇士(Shotel Warrior)、精锐马穆鲁克(Elite Mameluke)、精锐骆驼射手(Elite Camel Archer)、精锐弯刀勇士(Elite Shotel Warrior)、骆驼斥候(Camel Scout)、帝王骆驼兵(Imperial Camel Rider)、骆驼兵(Camel Rider)、重装骆驼兵(Heavy Camel Rider)
- 手工 `—` → .dat `los +3`：村民(Villager)

### 马普切：长矛兵系与散兵视野 +2

- 采用：**dat**；文本一致性：{"ok":true,"dat":[2],"text":[2]}
- 手工 `los +2` → .dat `—`：格查战士(Guecha Warrior)、精锐格查战士(Elite Guecha Warrior)、标枪骑兵(Genitour)、精锐标枪骑兵(Elite Genitour)

### 蜀：步弓手视野 +2

- 采用：**dat**；文本一致性：{"ok":true,"dat":[2],"text":[2]}
- 手工 `los +2` → .dat `—`：帝王掷矛手(Imperial Skirmisher)、掷矛手(Skirmisher)、精锐掷矛手(Elite Skirmisher)

### 鞑靼：骑射单位视野 +2

- 采用：**dat**；文本一致性：{"ok":true,"dat":[2],"text":[2]}
- 手工 `los +2` → .dat `—`：西班牙征服者(Conquistador)、飞镖骑兵(Arambai)、精锐西班牙征服者(Elite Conquistador)、精锐飞镖骑兵(Elite Arambai)

### 瓦兰吉：骑士系对步兵攻击 +1

- 采用：**dat**；文本一致性：{"ok":true,"dat":[1],"text":[1]}
- 手工 `—` → .dat `vs 步兵 +1`：萨瓦尔(Savar)

### 魏：骑兵对攻城武器攻击 +2

- 采用：**dat**；文本一致性：{"ok":true,"dat":[2],"text":[2]}
- 手工 `vs 攻城武器 +2` → .dat `—`：传教士(Missionary)

## 四、游戏说明文字与 .dat 数值不一致的加成（以 .dat 为准，仅提示）

| 文明 | 条目 | 说明文字 | .dat 累计值 | 现在采用 |
|---|---|---|---|---|
| 瞿折罗 | #2 | Mounted Units deal +20/30/40% bonus damage in Feudal/Castle/Imperial Age | [[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40],[17,20],[25,33],[28,40]] | dat |
| 印加 | #2 | Military Units cost -15/20/25/30% food in Dark/Feudal/Castle/Imperial Age | [[15,18],0,[20,25],[40,66]] | eco |
| 萨拉森 | 团队 | Foot Archers and Skirmishers +2 attack vs. buildings | [3] | dat |
| 蜀 | #2 | Siege Weapons and Siege Warships move +10/15% faster in Castle/Imperial Age | [[9,10],[13,15],[4,5]] | dat |
| 瓦兰吉人 | #1 | Bloodlines and Caravan effects +50% | [8] | dat |
| 魏 | #1 | Hei Guang Cavalry and Xianbei Raider +20/30% HP in Castle/Imperial Age | [[17,20],[23,30],[9,10]] | dat |

## 五、与 linhongcun/lhc-aoe2（作者本机 .dat，2026-08）科技数值对账

（未取得 lhc-aoe2 数据：私有仓库需 GITHUB_TOKEN；跳过对账）

## 六、.dat 中存在、加成文本未列出的效果（已计入模拟器，标注为「隐藏加成」）

- 中国：396 `C-Bonus, +50% Demo HP` → 3 个目标 [{"op":"mul","s":"hp","v":1.5}]
- 西班牙：-3 `Tech tree #3` → 1 个目标 [{"op":"mul","s":"bt","v":0.833331}]

## 七、通用隐藏科技（所有文明，时代自动或组合触发）

- 20 `Auto upgrade Scout Feudal Age`：时代 ≥ 2 → 3 个目标 [{"s":"los","v":2}]；1 个目标 [{"s":"atk","v":2},{"s":"los","v":2},{"s":"spd","v":0.35}]；1 个目标 [{"s":"los","v":1}]；1 个目标 [{"s":"atk","v":3},{"s":"bonus","v":2,"vs":"船只"},{"s":"bonus","v":2,"vs":"骆驼"},{"s":"bonus","v":4,"vs":"骑兵"},{"s":"los","v":1},{"s":"spd","v":0.25}]
- 71 `Walls HP castle age`：时代 ≥ 3 → 2 个目标 [{"op":"mul","s":"hp","v":1.666667}]
- 72 `Palisade Walls HP feudal age`：时代 ≥ 2 → 2 个目标 [{"op":"mul","s":"hp","v":1.66667}]
- 90 `Tracking`：时代 ≥ 2 → 76 个目标 [{"s":"los","v":2}]
- 610 `Arrowslits (Guard tower)`：时代 ≥ 1，需 Arrowslits + Guard Tower → 4 个目标 [{"s":"atk","v":1}]
- 611 `Arrowslits (Keep)`：时代 ≥ 1，需 Arrowslits + Keep → 4 个目标 [{"s":"atk","v":1}]
- 669 `Thalassocracy + Fletching`：时代 ≥ 1，需 Fletching + Thalassocracy → 1 个目标 [{"s":"los","v":1},{"s":"rng","v":1}]；1 个目标 [{"s":"atk","v":1},{"s":"los","v":1},{"s":"rng","v":1}]
- 670 `Thalassocracy + Bodkin`：时代 ≥ 1，需 Bodkin Arrow + Thalassocracy → 2 个目标 [{"s":"los","v":1},{"s":"rng","v":1}]
- 671 `Thalassocracy + Bracer`：时代 ≥ 1，需 Bracer + Thalassocracy → 2 个目标 [{"s":"los","v":1},{"s":"rng","v":1}]
- 774 `Flemish Militia Age3`：时代 ≥ 3 → 1 个目标 [{"s":"atk","v":3},{"s":"bonus","v":1,"vs":"船只"},{"s":"bonus","v":1,"vs":"骆驼"},{"s":"bonus","v":1,"vs":"骑兵"},{"op":"mul","s":"bt","v":0.875},{"s":"hp","v":15}]
- 797 `Flemish Militia Age4`：时代 ≥ 4 → 1 个目标 [{"s":"atk","v":3},{"s":"bonus","v":1,"vs":"船只"},{"s":"bonus","v":1,"vs":"骆驼"},{"s":"bonus","v":1,"vs":"骑兵"},{"s":"hp","v":5}]
- 1163 `Shadow Transport Ship -- Age Three`：时代 ≥ 3 → 1 个目标 [{"s":"gar","v":5}]
- 1164 `Shadow Transport Ship -- Age Four`：时代 ≥ 4 → 1 个目标 [{"s":"gar","v":10}]

---
差异小计：科技 55 组、文明加成 15 条、团队加成 11 条。
