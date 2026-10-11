# 补丁数据更新流程

## 固定版本：`scripts/data_sources.json`

唯一记录上游版本的文件：

| 字段                                 | 含义                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `patch.build/date/name/detectedFrom` | 当前数据对应的游戏补丁及识别依据                                                                                         |
| `sources.dat`                        | SiegeEngineers/auto-mods 的 `dat/empires2_x2_p1.dat`：`commit`、`sha256`、`markers`（文明/科技/效果数量、最新 3 个文明） |
| `sources.aoe2techtree`               | SiegeEngineers/aoe2techtree `data/` 的固定提交（`npm run data` 按此提交下载，不再跟随 master）                           |
| `sources.halfon`                     | SiegeEngineers/halfon：仅用于从提交信息（`Implement DE Update N`）识别补丁号                                             |

构建时 `vite.config.ts` 读入该文件，站点页头/页脚显示「数据版本：DE 185872（2026-09-22）」，并在 `#/about-data` 列出来源、提交、sha256 和补丁说明链接。

## 一条命令：`npm run data:update`

```bash
npm run data:status            # 只检查：打印固定 vs 上游最新提交；有更新时退出码 10
npm run data:update            # 有更新才执行
npm run data:update -- --force # 无更新也重跑全部生成
GITHUB_TOKEN=... npm run data:update   # 可选，提高 GitHub API 限额
```

步骤（`scripts/data_update.py`）：

1. 查询三个上游仓库对应路径的最新提交；从 halfon / aoe2techtree / auto-mods 的提交信息中识别补丁号（`scripts/data_diff.py: detect_patch`，取最大 build 号）。
2. 有更新时：快照当前 `src/data/*.json`；下载新 `.dat`、计算 sha256、解析并计算特征标记（先过最小常识检查：≥40 文明、≥1000 科技/效果）；写回 `data_sources.json`（提交、日期、sha256、markers、补丁号、`updated`）。
3. 重新生成：aoe2techtree 有变化时 `scripts/build_data.py`；然后 `dat:check` → `effects_build.py` → `effects_audit.ts`（重写 `docs/EFFECTS-AUDIT.md`）→ `stats_crosscheck.py`。
4. 生成差异摘要（单位/建筑/科技数值、.dat 科技效果、文明加成文本与 .dat 加成数值、新文明）写入 `docs/PATCH-NOTES/<补丁号>.md` 并打印。
5. **从不自动提交。** 自行检查后：

```bash
git diff --stat && npm test && npm run build && npm run e2e
git add -A && git commit -m "Data: DE Update <补丁号>" && git push   # CI 通过后自动部署
```

如果 `.dat` 有新提交但没识别到新补丁号（热修复），脚本会提示并沿用原补丁号。
之后每次构建 / CI 都按 `data_sources.json` 校验 sha256 与已记录的标记；文件被改动或换错版本会直接失败。

## CI（`.github/workflows/ci.yml`）

push / PR 到 `main` 时运行 lint、类型检查、Vitest、Python 测试（`tests/py`：补丁号识别、差异摘要、标记校验，含 fixtures）、数据检查（缓存的 `.dat` + sha256/标记 + `effects.json` 可复现）、构建、Playwright 冒烟；全部通过且为 push 到 `main` 才通过 `actions/deploy-pages` 部署。

## 版权

`.dat` © Microsoft Corporation：只在本地/CI 缓存目录 `scripts/.cache/`（gitignore）中使用，从不提交、不随站点发布。
