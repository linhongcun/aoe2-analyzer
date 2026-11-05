# #711 巨型投石机两态说明

范围：`/unit/331` 与 `/siege?unit=331&n=4&bldg=82`；基线 main `064cd319079ec227f9a9acd1a973a1b71ec279cb`。本项只解释状态与目录字段，不实现两态切换或修改模拟模型。

来源：DE Update 188329，固定 [auto-mods DAT](https://github.com/SiegeEngineers/auto-mods/blob/e293dc106b0f3b0ceac2db98409fbcc5c921190b/dat/empires2_x2_p1.dat)，SHA256 `d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f`；`civs[1].units[331/42]` 分别为打包/展开记录，互相 transform。目录生成器直接读331，未合并42。原始独立审计见 issue comment6661963209；task工作值尚不足认证拆装秒数。

可测呈现：

- 331概览新增“打包与展开”语义分栏DL。打包态：可移动、不能攻击，读 `u.spd/u.ma/u.pa`；展开态：可攻击、固定位置，读已逐字段核同的 `u.atk/u.rng/u.minr/u.rof`。真实目录分别为0.8、2/8与200、16/4、10s。展开护甲与准确度尚未导出，不写前端常量。
- “展开／打包耗时：待确认”独立呈现；造价区的生产时间仍读 `u.tt=50s`，不能冒充拆装耗时。331旧属性卡逐项标打包/展开；现有准确度表92%近旁说明“目录打包记录的准确度，不代表展开命中率”；护甲类别明确是目录打包记录，攻击加成可按已核同字段解释为展开攻击。
- 331页各tab上方提示科技模拟器与单位PK沿用目录数值、不模拟两态切换，目录护甲和准确度不代表展开态。只在331视图把原说明歧义句改成“打包后可移动，展开后可攻击”；原始生成desc和其它单位不改。
- Siege选择331时结果近旁提示“按展开态持续攻击；不含打包／展开切换，耗时待确认”。4台拆城堡仍20游戏秒、首轮t=0，全局既有不含走位/展开等口径保留；改选攻城锤专用提示消失。没有新状态开关、入口、42路由或计算。
- 来源显示具名固定DAT链接与数据说明，补丁号来自DATA_SOURCES；长pin/hash仅在本规格或href，不印页面正文。

布局沿用DetailSection、detail-cost-grid和note，不新增table、共享组件或全局CSS。打包/展开使用h3与各自DL；宽度不足自然换行。数字片段与数字+单位用.num.nw；正文沿用--color-text、note沿用--color-muted（现有字号/行高），入口用community-tool-entry且实际≥44×44px。360/375/390/1280四宽、明暗主题均无溢出、数字拆行、console/pageerror；新区域axe WCAG A/AA无违规。非331不出现专用区或提示。空/加载/错误/不可用沿用原路由行为，不制造新数值。

验证：先在真实基线渲染UnitDetail与浏览器路由形成缺状态区/口径的first-red；SSR改变传入目录字段验证数据绑定与输入不变，非331无特例。浏览器核真实单位字段归属、50s生产与待确认分离、sim tab可见模型边界、siege结果与单位选择负路径；四宽明暗保存最终SHA生产截图。保护v0290-322中的331.Dravidians及其它61场期望/捕获不变；338冻结的是现有table结构/display/overflow签名与正文哈希边界，原table保留，不重录或放宽。

新trebuchet711回归常驻units与siege profiles；ciScope659用仅UnitDetail/本地组件/Siege源码diff证明选择，不把测试路径混入模拟diff。不更改选择策略，CI策略文件自身变更使实际门禁full、data=false；本地只做必要相关验证，最终远端full必须真实通过。

必要诊断依赖：PR721提交263742da的远端full unit真实退出1，但原JSON-only reporter只记录输出文件路径，失败时没有可读取的具体case，不能猜测根因或把负向子进程trace当成失败。经本轮明确授权，unit命令仅追加Vitest内置default人读reporter；原JSON reporter/outputFile、精确选择、maxWorkers2/minWorkers1、预算、退出码和证据门禁保持。Vitest3.2.7真实临时失败fixture验证同时写JSON失败结果、stdout包含具体失败case，退出仍1；fixture已清理且不提交。新head须执行实际完整CI取得诊断，不能盲重跑原红head或放宽timeout/保护期望。

后续真实诊断：58af67a完整unit明确唯一失败为releasePlan.test.ts的#533精确siege选择集合，旧期望未计入本项合法新增的trebuchet711常驻unit/e2e；本地同case已真实复现红。按授权仅在两份expected集合追加对应711成员，保留所有旧成员、toEqual、scope/data/full与site-wide排除约束，不改变实际选择策略。该工程断言不是保护产品golden；后续PROFILES登记的本地相关CI验证包含现有releasePlan整文件，避免漏掉此消费者。不能由58的已知失败反推263不可恢复的未知case。
