# 架构说明 / Architecture

技术栈：Vite 6 + React 18 + TypeScript（strict + noUncheckedIndexedAccess）+ react-router 6 `HashRouter`（GitHub Pages 无服务端路由）+ lucide-react。无运行时 CDN，所有资源本地打包。

## 分层

```
scripts/            数据管线（Python）：npm run data
  build_data.py       入口：下载 aoe2techtree data.json / 中英文字符串 / 每文明 trees → scripts/.cache
  civs_build.py       文明（游戏文本解析 + scripts/civ_ratings.json 主观评分/开局）
  units_build.py      单位（属性、护甲类别 cls、升级路线、图标 → public/img/units）
  techs_build.py      科技（费用、前置、图标 → public/img/techs）
  trees_build.py      每文明科技树布局（建筑分列/时代分行/连线、建筑图标）
  catalog_introductions.json / .mjs  单位、建筑首发版本的逐ID来源清单与编译校验
src/
  app/              路由（routes.tsx，兼容全部旧 hash）、布局（Layout.tsx：页眉/导航/页脚）、App
  domain/           纯 TS：类型模型 + 纯逻辑，不依赖 React
    types.ts          Civ / Unit / Tech / Dlc / Effect / StatSet / Trees
    dlc.ts            DLC 表、文明→DLC、科技既有版本标记、筛选
    introductions.ts  按单位/建筑各自ID查首发版本；未知返回null，不按文明推断
    ratings.ts        能力轴、优势/劣势、对局建议
    unitClass.ts      按护甲类别 id 判定单位类型（步兵/骑乘/弓手/火药…）
    effects.ts        结构化效果表：通用科技、文明加成、团队加成
    simulator.ts      效果引擎（baseStats → 文明加成 → 已选科技 → 团队加成）、费用汇总、URL 编解码
    prereq.ts         前置链解析与级联选择/取消
    linker.ts         自动链接器（文本中识别单位/科技名）
    units.ts          升级路线
  data/             生成的 JSON + 类型化加载器
    index.ts          civs 随主包；units+techs、trees 通过 dynamic import 懒加载并缓存
    hooks.ts          useCore() / useTrees()
  features/<name>/  civs units techs tree simulator dlc compare matchup
    components/       页面组件（路由级组件经 React.lazy 拆包）
    hooks/            特性内状态
    logic/            特性内纯逻辑（如 tree/layout.ts 布局计算、civs/filter.ts）
  shared/
    ui/               Icon（Lucide）、art（CivIcon/UnitLink/CostView/StatIcon/DlcBadge…）、widgets（Radar/PosBox/Linked/DlcBar…）
    styles/           tokens.css（设计令牌）+ base.css（全局主题样式）
    ui/sim/           跨页面复用的单位模拟器（SimPanel / Simulator，单位详情、PK、建筑模拟共用）
    hooks/            跨页面状态（如 useSimState：状态以 URL 为唯一来源）
    nav/sections.ts   导航分组与模块注册表（导航、首页卡片、面包屑、搜索共用）
    utils/sticky.ts   跨路由保留的筛选状态（等价于旧版隐藏面板保留输入）
public/img/         游戏美术（civs/units/techs/buildings/dlc/stats，WebP）
tests/unit/         Vitest：模拟器数值、前置链、DLC 映射、自动链接器
tests/e2e/          Playwright：逐路由无控制台错误 + 关键交互
```

## 数据流

`aoe2techtree` → `npm run data` → `src/data/*.json`（提交入库）→ 加载器附加派生字段（`dlc`）、建立索引与链接器 → 特性组件通过 `useCore()/useTrees()` 读取 → 领域纯函数计算 → 共享 UI 渲染。

## 路由（与旧版兼容）

旧链接 `#civ/X` 与新链接 `#/civ/X` 等价（HashRouter 会补全前导 `/`）。
`/` `/civs`（旧 `/list` 跳转） `/civ/:en` `/units` `/unit/:id[/:civ[/:age[/:ids[/:team]]]]` `/techs` `/tech/:id` `/tree[/:civ]` `/dlc` `/compare` `/matchup`；未知路由回到文明列表。
模拟器状态全部写入 URL（replace），可分享。

## 如何添加

- **新特性**：建 `src/features/<x>/{components,hooks,logic}`，在 `app/routes.tsx` 用 `lazy()` 注册路由，在 `app/Layout.tsx` 的 `TABS` 加导航。纯计算放 `domain/` 或特性 `logic/` 并写单测。
- **新数据源**：在 `scripts/` 写 `<x>_build.py`（读取 `AOE_CACHE`，输出到 `src/data/`），加入 `build_data.py` 列表；在 `domain/types.ts` 定义类型，在 `data/index.ts` 写加载器（大文件用 dynamic import）。
- **新科技效果**：在 `domain/effects.ts` 的 `TECH_EFFECTS` / `CIV_BONUSES` 添加规则，并在 `tests/unit/simulator.test.ts` 加已知数值用例。

## 部署

部署：GitHub Actions（`.github/workflows/ci.yml`）在 push main 时依次 lint → 类型检查 → Vitest → Python 测试 → 数据检查 → 构建 → Playwright，全部通过后用 `actions/deploy-pages` 发布；Pages 源为 GitHub Actions。详见 README「部署」与 docs/DATA-UPDATE.md。
