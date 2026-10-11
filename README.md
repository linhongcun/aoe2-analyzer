# 帝国时代2 分析器 (AoE2 DE Analyzer)

在线访问：https://linhongcun.github.io/aoe2-analyzer/

帝国时代 II 决定版分析工具（中文界面）。当前模块：文明分析、单位（248 个单位详情）、科技（199 项科技详情），DLC/版本（每个文明及其独特单位/科技所属资料片）、科技模拟器（单位页内：选择文明与科技查看满科技属性和累计研究费用）、科技树（每个文明的完整科技树，含差异对比），均可从文明页点击跳转（56 个文明的列表/筛选、详情、雷达图、对比、对局助手）。评分为主观近似值。

## 数据与素材来源 / Credits

- 界面图标：[Lucide](https://lucide.dev)（ISC License），经 lucide-react 本地打包（不使用 CDN）
- DLC/资料片列表与图标（`public/img/dlc/`，缩放为 64px WebP）：来自 [seicing.com 文明发售列表](https://seicing.com/html/aoe2/index-aoe2.html)，并与 ageofempires.com 官方公告核对
- 科技/文明加成/团队加成数值效果（`src/data/effects.json`，`scripts/effects_build.py`）：全部取自 DE 原版游戏数据文件 `empires2_x2_p1.dat`（DE Update 185872），文件来自 [SiegeEngineers/auto-mods](https://github.com/SiegeEngineers/auto-mods) 提交 `0c38027`，构建时下载并校验 sha256 与补丁标记（`npm run dat:check`），用 [genieutils-py](https://github.com/SiegeEngineers/genieutils-py)（LGPL-3.0）解析。**.dat © Microsoft Corporation，本仓库与站点均不包含、不再分发该文件**，只发布由它派生的数值。基础数值仍取自 aoe2techtree，并与 .dat 对账（`npm run stats:check`）。参考对账：[linhongcun/lhc-aoe2](https://github.com/linhongcun/lhc-aoe2)。差异见 `docs/EFFECTS-AUDIT.md`
- 文明数据：[SiegeEngineers/aoe2techtree](https://github.com/SiegeEngineers/aoe2techtree)
- 单位/科技数据与图标（`public/img/units/`、`img/techs/`）：高清版取自 [denniske/aoe2companion](https://github.com/denniske/aoe2companion) 的 256px DE 图标（缩放为 128px WebP，`scripts/icons_hires.py`），未覆盖的少数图标回退到 aoe2techtree 48px 原图（游戏图像 © Microsoft）
- 属性/资源图标（`public/img/stats/`，40px WebP）：来自 [Age of Empires Fandom Wiki](https://ageofempires.fandom.com/)（如 Hpicon_aoe2de.png、Attack_cur.png、Armoricon_aoe2de.png、AoE2DE_icon_*.png、Aoe2de_food.png 等；Wiki 内容 CC BY-SA，游戏图像 © Microsoft）
- 文明图标（`public/img/civs/`）：取自 [denniske/aoe2companion](https://github.com/denniske/aoe2companion)（`assets/civilizations/de/`），缩放为 96px WebP。原始素材 © Microsoft Corporation。

Age of Empires II © Microsoft Corporation. 本项目依据 Microsoft 的 [Game Content Usage Rules](https://www.xbox.com/en-us/developers/rules) 使用游戏素材，为非商业粉丝项目，未获 Microsoft 认可或赞助。

## 开发 / Development

```bash
npm install          # 已配置 legacy-peer-deps
npm run dev          # 本地开发
npm run build        # tsc 严格检查 + Vite 构建到 dist/
npm test             # Vitest 单元测试（domain 逻辑）
npm run e2e          # Playwright 冒烟测试（需 npx playwright install chromium）
npm run lint         # ESLint；npm run format 用 Prettier 格式化
npm run data         # 从 aoe2techtree 重新生成 src/data/*.json 与 public/img/*
```

技术栈：Vite + React 18 + TypeScript（strict）+ react-router HashRouter + lucide-react。架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 项目约定 / Conventions

- 自定义界面图标禁止使用 emoji 或 Unicode 符号字形（如 ⚔ ← → ★ ✓ ✕ ▲▼ 🔍 等），统一使用成熟图标库 [Lucide](https://lucide.dev)（ISC），经 `lucide-react` 本地打包（不走 CDN，保证国内可用），通过 `<Icon name="..." />` 使用，尺寸/颜色由 CSS 控制（`currentColor`）。
- 游戏美术图标（文明/单位/科技/建筑/DLC/属性，`public/img/`）不受此约定影响。
- 详见 [CONTRIBUTING.md](CONTRIBUTING.md)。
