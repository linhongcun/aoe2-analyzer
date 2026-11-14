# data/ 目录

仓库中受版本控制的数据集中放在这里。源码和生成工具仍在 `src/`、`scripts/`，图片仍由 `public/img/` 提供，测试代码、图片基线与快照仍留在 `tests/`。

| 目录 | 用途与边界 |
| --- | --- |
| `game/` | 游戏数据与生成目录。生成流程见 [`docs/DATA-UPDATE.md`](../docs/DATA-UPDATE.md)；`src/data/` 保留同步、惰性与异步读取适配器。 |
| `content/` | 可编辑的站点内容。结构校验由 [`scripts/content-schema.mjs`](../scripts/content-schema.mjs) 和 [`scripts/content-schema-catalog.mjs`](../scripts/content-schema-catalog.mjs) 登记。 |
| `schemas/` | JSON Schema 输入。策略代码与编译后的校验器仍在 `src/content/schema/`；用 `npm run content:validators` 生成并用 `--check` 验证。 |
| `reference/` | 经审阅的参考资料。`src/domain/routeProfiles.ts`、`src/domain/castleScenarioProfile.ts`、`src/domain/positionScenarios.ts` 与 `src/features/civs/backgrounds.ts` 读取对应 JSON，沿用现有领域与文明页面逻辑。 |
| `sources/` | 固定上游输入、来源清单与生成器元数据，处理规则见 [`docs/DATA-UPDATE.md`](../docs/DATA-UPDATE.md)。现有 `src/data/ratingBasis.ts` 与 `src/data/sources.ts` 会读取评分及来源清单。`.dat` 与下载缓存 `scripts/.cache/` 不提交。 |
| `evidence/` | 冻结的来源快照与机器证据。大小、历史指纹和验证命令见 [`docs/BUILD-SIM-SOURCES.md`](../docs/BUILD-SIM-SOURCES.md)。运行时不得导入或打包这些证据。 |
| `fixtures/` | 仅供测试使用的 JSON fixture，不是产品输入，不得进入运行时 bundle。 |
| `reports/` | 生成的数据审计报告，由对应脚本生成。 |
| `patch-notes/` | 数据更新记录，由 `scripts/data_update.py` 生成；不是运行时内容。 |

内容校验器只扫描 `data/content/` 与 `data/game/`，不扫描 `reference/` 或 `sources/`。参考资料和来源清单中被现有适配器读取的部分继续保留既有行为，不因此扩展校验范围。`evidence/` 与 `fixtures/` 禁止进入运行时 bundle；报告和补丁说明也不是运行时输入。

迁入的证据与历史 fixture 保持原始字节和指纹。冻结文件中的旧路径是来源记录；只有活动导入、生成路径和清单键改用当前路径。
