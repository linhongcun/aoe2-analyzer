# #712 投石车溅射字段说明

基线main `2a9088f621c42fe550655957ac5862e53f7110e8`。仅280/550/588单位概览增加原表外说明与局部空括号清理；不改engine、数据、pins、全局CSS、共享RangeHelp/Linked、原table或保护golden/capture，保留331既有视图修正和708区。

来源：[固定aoe2techtree字段标签](https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/js/main.js#L387)称BlastWidth为Blast Radius，[生成器](https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/scripts/generateDataFiles.py#L416)读取DAT type_50.blast_width。公开来源预审comment6661963731已核“半径”，但格单位、满伤区、边缘衰减/碰撞几何仍未核；blast_damage=1不能证明范围内全额伤害。产品只读现有DE188329目录u.blast/u.minr，不写游戏常量。

可测呈现：

- “溅射与最小射程”放在“其他属性”表的相邻外侧，使用DetailSection与DL/段落，不新增table。三单位落点溅射半径读u.blast=1/1.25/1.5；最小射程独立读u.minr=3。正finite半径显示数值；0/负/缺失/NaN/Infinity显示数据待确认，不补0。最小射程finite且≥0保留真实0，其余待确认；两个字段互不掩盖。
- 明示“落点周围的溅射半径；半径数值的单位（是否以格计）待确认；满伤区与边缘伤害/衰减待确认”，不把已知半径语义也称未知。
- 一句明确最小射程是攻击者至瞄准点的发射限制；溅射围绕落点，最小射程不是免伤圈，不能直接瞄准近处不代表不会被瞄向别处的溅射波及。不引入伤害模拟。
- 具名“固定版本字段说明”外链到以上固定标签（repo/commit从DATA_SOURCES读），另数据说明Link真实打开about-data既有h2。补丁号动态读，正文不印长pin/hash。
- 三单位view-only仅删除空平衡ASCII()/全角（）及水平邻接空隙。相邻文字间原有空隙保留一个，不把“甲 () 乙”拼成甲乙；保留newline、非空/非平衡括号以及原生Linked链接。非目标desc字节原样；331已有纠正分支不动，原JSON不变。

布局沿用DetailSection、detail-cost-grid、note，颜色/字号沿现有--color-text/--color-muted，不写CSS。数值用.num.nw；两个新增community-tool-entry实际≥44×44，不叠ulink。四宽360/375/390/1280×light/dark不溢出、不拆数字、无console/pageerror，新区axe WCAG A/AA为零。fullPage真实截图前blur/scrollTo0，不隐藏DOM；最终图含实际SHA页脚。

验证：真实baseline SSR/浏览器缺说明、原desc空括号及CI常驻缺口先红；SSR三记录/双字段独立扰动、0与异常、完整输入不变、空括号/有义括号/newline/非目标不变；真实Linked输出保大学/修道院/攻城武器厂原生href。浏览器三页和负向38/331，来源/数据说明真实href/跳转及几何/主题/axe/错误。invalid fixture只核新区域，不扩大改旧table的异常值行为。

新splash712 unit/e2e常驻units，ciScope659仅UnitDetail与本地组件源码diff证明选择；local相关CI固定整份releasePlan。若既有工程精确集合合法受新增影响，仅加成员保原equal/排除语义，独立核定，不改策略。实际full/data=false；保护61、原338结构/style和正文hash边界保留。按新节奏commit实际SHA后先快新browser+全页首图自检，再push/full；独立实际SHA终审与完整门禁齐后由集成代理交付。
