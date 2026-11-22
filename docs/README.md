# 文档入口

按任务阅读：

1. [系统架构](ARCHITECTURE.md)：产品边界、主要模块、数据流和扩展点。
2. [体验设计接手指南](../role/experience-design.md)：可复用界面设计原则、代码入口与 Issue 交接。
3. [数据更新与来源](DATA-UPDATE.md)、[开局模拟边界](BUILD-SIM-COVERAGE.md)及[可复现来源说明](BUILD-SIM-SOURCES.md)。
4. [测试规则](TESTING.md)、[发布流程](RELEASING.md)与[静态页面分享](SHARING.md)。
5. [贡献与授权规则](../CONTRIBUTING.md)、[维护说明](MAINTENANCE.md)及[角色指南索引](../role/README.md)，包括[产品管理](../role/product-management.md)、[体验设计](../role/experience-design.md)、[软件开发](../role/software-development.md)、[产品运营](../role/product-operations.md)与独立的[游戏分析师](../role/game-analyst.md)。
6. [文明阵容经验与分析方法](../role/game-strategy.md)（由[游戏分析师](../role/game-analyst.md)维护）：用户认可的文明打法、资源与科技取舍、建筑驻军、村民施工和推进阶段，以及供游戏分析师与产品运营共用的讨论前先用站内工具表。

当前需求、授权、设计图和交付证据以原 Issue 为准；版本摘要见 [CHANGELOG](../CHANGELOG.md)，发布核验流程见[发布流程](RELEASING.md)。数据目录的归属、文档与数据的边界见[数据目录说明](DATA-LAYOUT.md)：Markdown 只给人看并放在 `docs/`，代码、测试和 CI 读 `data/` 下的 JSON。[`reports/`](reports/) 与 [`patch-notes/`](patch-notes/) 是 `../data/reports/`、`../data/patch-notes/` 里 JSON 记录的排版，由生成器重排，不手改；机器可读证据位于 `../data/evidence/`，冻结字节和历史路径字符串保持不变。仓库不另存一次性功能规格或逐版本交付日志。
