# 角色文档

给接下来接手这个站点的人。角色文档保留各自的判断和做法，游戏经验单独维护，名单负责找到它们。

| 文件                                               | 用途                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| [product-management.md](product-management.md)     | 产品：怎么看这个站、怎么裁范围、怎样算验收                                       |
| [experience-design.md](experience-design.md)       | 体验设计：先看哪些源码、一次交付交什么、哪些界面问题会反复出现                   |
| [software-development.md](software-development.md) | 软件开发：改哪里、游戏数字边界、最小验证、何时算上线                             |
| [product-operations.md](product-operations.md)     | 产品运营：信息能否找到、操作是否顺、结果能否看懂                                 |
| [game-strategy.md](game-strategy.md)               | 游戏经验：阵容分析方法、讨论前先用的站内工具、八文明案例、建筑驻军与前线施工配合 |

范围和授权仍以仓库根目录的 [CONTRIBUTING.md](../CONTRIBUTING.md#角色) 为准。全站文档路径见 [docs/README.md](../docs/README.md)，当前设计原则见 [docs/design/DESIGN-SYSTEM.md](../docs/design/DESIGN-SYSTEM.md)。

所有角色按同一 Issue 正文单向依序交接：UX 完成直接进入软件开发，不设返回 PM 的设计确认阶段；进入软件开发即获既定范围内的开发授权，无需维护者再次批准，符合阶段与认领协议的事项允许自动认领。五个阶段分别产出 BRD、PRD、UI/UX 设计稿、TRD 与上线证据/复盘，都写在同一 Issue 正文对应小节。阶段、正文结构、授权、认领和终态以 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle) 为唯一流程规范。不同 Issue 的分支并行处理/开发及合并发布顺序见 [MAINTENANCE「按事项并行、合并发布串行」](../docs/MAINTENANCE.md#按事项并行合并发布串行)。角色文档提供可复用的职责知识，不作为单个 Issue 的状态记录。

## 经验回写

执行会话不保留记忆，这里的角色指南就是各角色的长期经验。完成阶段交接后按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 回看本次工作：有跨 Issue 可复用且已核实的经验，就写进本角色指南的对应小节；没有就不写。

| 角色     | 写到哪里                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| 产品经理 | [product-management.md「已经付过代价的经验」](product-management.md)                                                      |
| 体验设计 | [experience-design.md「可迁移案例」](experience-design.md)                                                                |
| 软件开发 | [software-development.md「已经核对过的失败和后续上线」](software-development.md)                                          |
| 产品运营 | [product-operations.md「用好工具再提需求」](product-operations.md)；阵容等游戏经验写 [game-strategy.md](game-strategy.md) |

每条写清现象、原因、以后怎么做并附出处链接；相近条目合并，过时条目改正或删除。
