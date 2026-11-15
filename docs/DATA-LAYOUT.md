# data/ 目录

仓库中受版本控制的数据集中放在 `data/`，只放 `.json`。源码和生成工具仍在 `src/`、`scripts/`，图片仍由 `public/img/` 提供，测试代码、图片基线与快照仍留在 `tests/`。

## 文档与数据的边界

Markdown 只给人看，放在 `docs/`；代码、测试和 CI 要用的内容写成 `data/` 下的 JSON。

- 生成器先把结果写进 JSON 记录，再把同一份记录排成 `docs/` 下的 Markdown。两份都提交，生成器的 `--check` 核对排版与记录一致。
- 代码、测试和 CI 读 JSON 字段，不读 Markdown 正文，也不对它跑正则。需要新字段时加进 JSON 记录。
- 例外只有两类：发版脚本按 Keep a Changelog 解析根目录 `CHANGELOG.md`；检查文档本身的脚本（死链、索引）。
- `npm run lint` 里的 [`scripts/check-docs-boundary.mjs`](../scripts/check-docs-boundary.mjs) 检查 Markdown 的位置、`data/` 的文件类型和代码里的 Markdown 读取，例外在该脚本里逐条登记。

| 记录（机器读）                                | 排版（给人看）                                         | 生成器                                             |
| --------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| `data/reports/effects-audit.json`             | [`reports/EFFECTS-AUDIT.md`](reports/EFFECTS-AUDIT.md) | `scripts/effects_audit.ts`                         |
| `data/reports/eco-data.json`                  | [`reports/ECO-DATA.md`](reports/ECO-DATA.md)           | `scripts/eco_build.py`                             |
| `data/sources/history_inputs/*-coverage.json` | [`reports/HISTORY-DATA.md`](reports/HISTORY-DATA.md)   | `scripts/history_build.py`                         |
| `data/patch-notes/<补丁号>.json`              | [`patch-notes/<补丁号>.md`](patch-notes/)              | `scripts/data_update.py`、`scripts/patch_notes.py` |

## 子目录

| 目录           | 用途与边界                                                                                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game/`        | 游戏数据与生成目录。生成流程见 [数据更新](DATA-UPDATE.md)；`src/data/` 保留同步、惰性与异步读取适配器。                                                                                                                                                                    |
| `content/`     | 可编辑的站点内容。结构校验由 [`scripts/content-schema.mjs`](../scripts/content-schema.mjs) 和 [`scripts/content-schema-catalog.mjs`](../scripts/content-schema-catalog.mjs) 登记。                                                                                         |
| `schemas/`     | JSON Schema 输入。策略代码与编译后的校验器仍在 `src/content/schema/`；用 `npm run content:validators` 生成并用 `--check` 验证。                                                                                                                                            |
| `reference/`   | 经审阅的参考资料。`src/domain/routeProfiles.ts`、`src/domain/castleScenarioProfile.ts`、`src/domain/positionScenarios.ts` 与 `src/features/civs/backgrounds.ts` 读取对应 JSON，沿用现有领域与文明页面逻辑。                                                                |
| `sources/`     | 固定上游输入、来源清单与生成器元数据（历史补丁的人工核对输入见 [HISTORY-INPUTS.md](HISTORY-INPUTS.md)），处理规则见 [数据更新](DATA-UPDATE.md)。现有 `src/data/ratingBasis.ts` 与 `src/data/sources.ts` 会读取评分及来源清单。`.dat` 与下载缓存 `scripts/.cache/` 不提交。 |
| `evidence/`    | 冻结的来源快照与机器证据。大小、历史指纹和验证命令见 [来源证据流程](BUILD-SIM-SOURCES.md)。运行时不得导入或打包这些证据。                                                                                                                                                  |
| `fixtures/`    | 仅供测试使用的 JSON fixture，不是产品输入，不得进入运行时 bundle。                                                                                                                                                                                                         |
| `reports/`     | 审计与对账的结果记录，由对应脚本生成；测试和 CI 读这里的字段。                                                                                                                                                                                                             |
| `patch-notes/` | 每次数据更新的差异记录，由 `scripts/data_update.py` 生成。构建时按这里的文件名列出「关于数据」页的补丁说明；不打包进运行时。                                                                                                                                               |

内容校验器只扫描 `data/content/` 与 `data/game/`，不扫描 `reference/` 或 `sources/`。参考资料和来源清单中被现有适配器读取的部分继续保留既有行为，不因此扩展校验范围。`evidence/` 与 `fixtures/` 禁止进入运行时 bundle；`reports/` 和 `patch-notes/` 的记录也不是运行时输入。

迁入的证据与历史 fixture 保持原始字节和指纹。冻结文件中的旧路径是来源记录；只有活动导入、生成路径和清单键改用当前路径。
