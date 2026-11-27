# 角色文档

给接下来接手这个站点的人。角色文档保留各自的判断和做法，游戏经验单独维护，名单负责找到它们。

| 文件                                               | 用途                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [product-management.md](product-management.md)     | 产品：怎么看这个站、怎么裁范围、怎样算验收                                                                 |
| [experience-design.md](experience-design.md)       | 体验设计：可复用界面原则、先看哪些源码、一次交付交什么、哪些界面问题会反复出现                             |
| [software-development.md](software-development.md) | 软件开发：改哪里、游戏数字边界、最小验证、何时算上线                                                       |
| [product-operations.md](product-operations.md)     | 产品运营：面向平台本身，负责信息能否找到、操作是否顺、结果能否看懂，复现核实反馈并整理 BRD                 |
| [game-analyst.md](game-analyst.md)                 | 游戏分析师（独立于五阶段之外的深度用户 / 领域专家）：文明阵容分析、工具与机制压测、发现缺口向平台提需求    |
| [game-strategy.md](game-strategy.md)               | 游戏经验（由游戏分析师主维护）：阵容分析方法、讨论前先用的站内工具、各文明阵容案例、建筑驻军与前线施工配合 |

范围和授权仍以仓库根目录的 [CONTRIBUTING.md](../CONTRIBUTING.md#角色) 为准。全站文档路径见 [docs/README.md](../docs/README.md)，当前体验设计原则与交接规范统一维护在 [experience-design.md](experience-design.md)。

五阶段流水线仍由产品运营、产品经理、体验设计、软件开发四个平台角色按同一 Issue 正文单向依序交接：UX 完成直接进入软件开发，不设返回 PM 的设计确认阶段；进入软件开发即获既定范围内的开发授权，无需维护者再次批准，符合阶段与认领协议的事项允许自动认领。五个阶段分别产出 BRD、PRD、UI/UX 设计稿、TRD 与上线证据/复盘，都写在同一 Issue 正文对应小节。游戏分析师独立于五阶段之外、不纳入四角色自动调度，在深度分析中发现平台缺口时按模板提 Issue 进入现有五阶段流程。阶段、正文结构、授权、认领和终态以 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle) 为唯一流程规范。不同 Issue 的分支并行处理/开发及合并发布顺序见 [MAINTENANCE「按事项并行、合并发布串行」](../docs/MAINTENANCE.md#按事项并行合并发布串行)。角色文档提供可复用的职责知识，不作为单个 Issue 的状态记录。

## 经验回写

执行会话不保留记忆，这里的角色指南就是各角色的长期经验。四角色完成阶段交接后（游戏分析师在深度分析或共创讨论后）按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 回看本次工作：有跨 Issue 或跨会话可复用且已核实的经验，就写进对应文档的小节；没有就不写。

| 角色       | 写到哪里                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 产品经理   | [product-management.md「已经付过代价的经验」](product-management.md#6-已经付过代价的经验)                                                                                                             |
| 体验设计   | [experience-design.md「可迁移案例」](experience-design.md#可迁移案例)                                                                                                                                 |
| 软件开发   | [software-development.md「已经核对过的失败和后续上线」](software-development.md#8-已经核对过的失败和后续上线)                                                                                         |
| 产品运营   | [product-operations.md「用好工具再提需求」](product-operations.md#用好工具再提需求)                                                                                                                   |
| 游戏分析师 | [game-analyst.md「深度分析与工具压测经验」](game-analyst.md#深度分析与工具压测经验)；文明阵容等游戏经验按[该文件的维护要求](game-strategy.md#怎样读与继续维护)写 [game-strategy.md](game-strategy.md) |

单份平台角色指南建议控制在 **~30 KB** 以内；回写须归入既有主题桶并优先合并或修订相近条目，每条 3–5 行写清「触发场景 → 规则/做法 → 关键反例与 Issue/PR 链接」，禁止混塞无关主题或抄录长篇复盘；过时或已由 CI、静态检查与单测彻底锁死的条目直接删除或改写。四角色只改本角色指南，游戏分析师仅可按规则维护 [game-analyst.md](game-analyst.md) 与 [game-strategy.md](game-strategy.md)；本文件不在回写范围内。
