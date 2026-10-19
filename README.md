# 帝国时代 II 分析器 (AoE2 DE Analyzer)

在线访问：https://linhongcun.github.io/aoe2-analyzer/

帝国时代 II 决定版（DE）的中文百科与分析工具。数值对应 **DE Update 185872**（2026-09-22），效果数据直接派生自游戏原版 `.dat`。所有评分（1-10）为主观近似值，仅供参考。

## 模块 / Modules

### 百科

| 模块     | 路由                                | 内容                                                                                                                         |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 文明     | `#/civs`、`#/civ/:en`               | 56 个文明：按必备单位与科技组合筛选、复制完整筛选链接；详情含定位、雷达图、独特单位/科技、文明加成；`#/list` 跳转到 `#/civs` |
| 单位     | `#/units`、`#/unit/:id`             | 163 个单位：属性、克制、升级路线、普通/精锐切换、内嵌科技模拟器                                                              |
| 科技     | `#/techs`、`#/tech/:id`             | 199 项科技：效果、费用、前置、「作用对象」（与模拟器同一判定）                                                               |
| 科技树   | `#/tree/:civ`                       | 每个文明的完整科技树与差异对照                                                                                               |
| 建筑     | `#/buildings`、`#/building/:id`     | 38 种建筑：属性、生产单位、可研究科技、建筑模拟器                                                                            |
| DLC      | `#/dlc`                             | 14 个资料片与对应文明、独特单位/科技                                                                                         |
| 文明加成 | `#/bonuses`、`#/civ/:en/bonus/:idx` | 文明加成与团队加成：中英原文、适用时代、数值示例、作用对象、.dat 原始效果（含经济/费用项）                                   |

### 工具

| 工具       | 路由           | 说明                                                                                                                  |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| 文明对比   | `#/compare`    | 两个文明的能力雷达与关键差异                                                                                          |
| 对局助手   | `#/matchup`    | 根据双方文明给出反制建议                                                                                              |
| 科技模拟器 | `#/simulator`  | 单位与建筑：选择文明、时代、科技与团队加成，查看满科技属性、克制加成与累计研究费用                                    |
| 单位 PK    | `#/duel`       | 1v1 / N vs M / 等资源对战、伤害拆解与回放；可保存同一对局的升级前方案，对比科技收益、击杀次数与新增基础研究投入并分享 |
| 持续生产   | `#/production` | 按文明、时代、显式科技和多座专用建筑估算单位与资源/分钟、理论及取整村民配置；可复制方案链接                           |
| 开局流程   | `#/builds`     | 开局时间线与瓶颈估算；专注跟练手动推进当前/下一步，完整清单支持 A4 打印与保存 PDF，保留来源、文明限制与模拟参数       |

### 通用

- **全局搜索**：`Ctrl+K`（macOS `Cmd+K`）搜索文明、单位、科技、建筑、文明加成。
- **报错/反馈**：页脚与各详情页/工具页右上角的「报错/反馈」按钮会打开预填好的 [GitHub issue](https://github.com/linhongcun/aoe2-analyzer/issues/new)（页面地址、类型/ID、文明、数据版本、浏览器）；模板见 `.github/ISSUE_TEMPLATE/`。

## 数据与流水线 / Data pipeline

| 数据                                                                                       | 来源                                                                                                                                                   | 脚本                                                                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 文明、单位、科技、建筑、科技树、中英文本、图标                                             | [SiegeEngineers/aoe2techtree](https://github.com/SiegeEngineers/aoe2techtree)（固定提交见 `scripts/data_sources.json`，185872）                        | `npm run data`（`scripts/build_data.py`）                                         |
| 科技/文明加成/团队加成的结构化效果（`src/data/effects.json`）                              | DE 原版 `empires2_x2_p1.dat`，来自 [SiegeEngineers/auto-mods](https://github.com/SiegeEngineers/auto-mods) 提交 `0c38027`，sha256 `4aa2f0a7…7baa` 固定 | `npm run effects`（`scripts/effects_build.py` + 审计 `scripts/effects_audit.ts`） |
| 经济/开局数据（训练/建造/研究时间与费用、村民采集速率、文明经济效果，`src/data/eco.json`） | 同上                                                                                                                                                   | `npm run eco`（`scripts/eco_build.py`，对账见 `docs/ECO-DATA.md`）                |
| 开局库（`src/data/build-orders/*.json`）                                                   | 社区开局转写，逐个注明出处（见 [docs/BUILD-ORDERS.md](docs/BUILD-ORDERS.md)）                                                                          | `npm run bo:check`                                                                |
| 基础数值对账（aoe2techtree vs .dat）                                                       | 同上                                                                                                                                                   | `npm run stats:check`                                                             |

- 全部上游固定版本（仓库、提交、sha256、补丁号、日期）集中在 **`scripts/data_sources.json`**；站点页头徽章「数据版本：DE 185872（2026-09-22）」链接到 [关于数据](https://linhongcun.github.io/aoe2-analyzer/#/about-data) 页。
- `.dat` 仅在构建时下载到 `scripts/.cache/`（已 gitignore），校验 **sha256 + 补丁标记**（标记由 `data:update` 从新文件计算并记录：文明/科技/效果数量、最新文明；另有最小常识检查）：`npm run dat:check`。用 [genieutils-py](https://github.com/SiegeEngineers/genieutils-py) 解析（首次运行自动建立 `scripts/.cache/venv`）。
- **.dat © Microsoft Corporation：本仓库与站点均不包含、不分发该文件**，只发布由它派生的数值。
- 效果差异与覆盖率见 [docs/EFFECTS-AUDIT.md](docs/EFFECTS-AUDIT.md)；新补丁：`npm run data:update`（检查上游 → 更新固定版本 → 重新生成全部数据、审计、对账 → 写 `docs/PATCH-NOTES/<补丁号>.md`，**不自动提交**），详见 [docs/DATA-UPDATE.md](docs/DATA-UPDATE.md)。

## 开发 / Development

需要 Node 20+、Python 3.10+（仅数据脚本需要）。

```bash
npm ci               # .npmrc 已配置 legacy-peer-deps
npm run dev          # 本地开发（http://localhost:5173）
npm run build        # tsc 严格检查 + Vite 构建到 dist/
npm test             # Vitest 单元测试（domain 逻辑与生成数据）
npm run e2e          # Playwright 冒烟测试（需 npx playwright install chromium）；BASE_URL=<线上地址> 可测线上
npm run lint         # ESLint；npm run format 用 Prettier 格式化
npm run data         # 从 aoe2techtree 重新生成 src/data/*.json 与 public/img/*
npm run dat:check    # 下载并校验 .dat（sha256 + 补丁标记）
npm run effects      # 由 .dat 生成 effects.json 并重写 docs/EFFECTS-AUDIT.md
npm run stats:check  # 基础数值与 .dat 对账
npm run data:status  # 只检查上游是否有新补丁（有更新退出码 10）
npm run data:update  # 补丁数据更新全流程（见 docs/DATA-UPDATE.md）
npm run eco          # 由 .dat 导出 eco.json（时间/费用/采集速率/经济效果）
npm run bo:check     # 开局数据校验
npm run test:py      # Python 测试：补丁号识别、差异摘要、标记校验
```

技术栈：Vite + React 18 + TypeScript（strict）+ react-router `HashRouter` + lucide-react。架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 部署 / Deploy

**GitHub Actions 自动部署**（`.github/workflows/ci.yml`），Pages 源为 GitHub Actions：

- push / PR 到 `main`：安装 → ESLint → `tsc` 类型检查 → Vitest → Python 测试 → 数据检查（`.dat` sha256 + 补丁标记；`.dat` 与 genieutils 环境按 `data_sources.json` 哈希缓存；并校验 `effects.json` 可由固定 `.dat` 原样复现）→ 构建 → Playwright（chromium）冒烟。
- 仅当以上全部通过且为 push 到 `main` 时，`deploy` 作业用 `actions/deploy-pages` 发布 `dist/`。PR 只测试不部署。
- 线上验证：`BASE_URL=https://linhongcun.github.io/aoe2-analyzer/ npm run e2e`。

## 数据与素材来源 / Credits

- 界面图标：[Lucide](https://lucide.dev)（ISC License），经 lucide-react 本地打包（不使用 CDN）
- DLC/资料片列表与图标（`public/img/dlc/`，缩放为 64px WebP）：来自 [seicing.com 文明发售列表](https://seicing.com/html/aoe2/index-aoe2.html)，并与 ageofempires.com 官方公告核对
- 科技/文明加成/团队加成数值效果（`src/data/effects.json`，`scripts/effects_build.py`）：全部取自 DE 原版游戏数据文件 `empires2_x2_p1.dat`（DE Update 185872），文件来自 [SiegeEngineers/auto-mods](https://github.com/SiegeEngineers/auto-mods) 提交 `0c38027`，构建时下载并校验 sha256 与补丁标记（`npm run dat:check`），用 [genieutils-py](https://github.com/SiegeEngineers/genieutils-py)（LGPL-3.0）解析。**.dat © Microsoft Corporation，本仓库与站点均不包含、不再分发该文件**，只发布由它派生的数值。基础数值仍取自 aoe2techtree，并与 .dat 对账（`npm run stats:check`）。参考对账：[linhongcun/lhc-aoe2](https://github.com/linhongcun/lhc-aoe2)。差异见 `docs/EFFECTS-AUDIT.md`
- 文明数据：[SiegeEngineers/aoe2techtree](https://github.com/SiegeEngineers/aoe2techtree)
- 单位/科技数据与图标（`public/img/units/`、`img/techs/`）：高清版取自 [denniske/aoe2companion](https://github.com/denniske/aoe2companion) 的 256px DE 图标（缩放为 128px WebP，`scripts/icons_hires.py`），未覆盖的少数图标回退到 aoe2techtree 48px 原图（游戏图像 © Microsoft）
- 属性/资源图标（`public/img/stats/`，40px WebP）：来自 [Age of Empires Fandom Wiki](https://ageofempires.fandom.com/)（如 Hpicon_aoe2de.png、Attack_cur.png、Armoricon_aoe2de.png、AoE2DE_icon_*.png、Aoe2de_food.png 等；Wiki 内容 CC BY-SA，游戏图像 © Microsoft）
- 文明图标（`public/img/civs/`）：取自 [denniske/aoe2companion](https://github.com/denniske/aoe2companion)（`assets/civilizations/de/`），缩放为 96px WebP。原始素材 © Microsoft Corporation。

Age of Empires II © Microsoft Corporation. 本项目依据 Microsoft 的 [Game Content Usage Rules](https://www.xbox.com/en-us/developers/rules) 使用游戏素材，为非商业粉丝项目，未获 Microsoft 认可或赞助。

## 项目约定 / Conventions

- 界面图标只用 [Lucide](https://lucide.dev)（`<Icon name="..." />`，本地打包），禁止 emoji / Unicode 符号作图标；游戏美术图标不受此限。
- 数值必须可溯源：效果来自 `.dat`，手工规则仅在 `.dat` 确实缺失时保留并在审计中列出。
- 详见 [CONTRIBUTING.md](CONTRIBUTING.md)；AI 编码代理请先读 [AGENTS.md](AGENTS.md)。

## 第三方组件 / Third-party

- 字体 Inter：SIL Open Font License 1.1，随站点打包，许可文本见 [src/shared/fonts/OFL.txt](src/shared/fonts/OFL.txt)
- 图标 Lucide（通过 lucide-react）：ISC License

## 许可证 / License

本项目代码以 [MIT 许可证](LICENSE) 发布。MIT 只覆盖本项目自己的代码；游戏数据、名称、图标和图像归各自权利人所有（Microsoft / Age of Empires II: Definitive Edition；第三方来源见上文「数据与素材来源」，例如文明图标取自 aoe2companion），不在 MIT 许可范围内。
