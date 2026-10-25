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
  app/              路由 routes.tsx（由登记表生成）、pageRegistry.tsx（懒加载 import 表）、布局 Layout.tsx、App
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
    raw/*.ts          核心 JSON 唯一的同步入口：civs/units/techs/buildings/eco.ts，原样转出
  features/<name>/  civs units techs tree simulator dlc compare matchup
    components/       页面组件（路由级组件经 React.lazy 拆包）
    hooks/            特性内状态
    logic/            特性内纯逻辑（如 tree/layout.ts 布局计算、civs/filter.ts）
  shared/
    ui/               Icon（Lucide）、art（CivIcon/UnitLink/CostView/StatIcon/DlcBadge…）、widgets（Radar/PosBox/Linked/DlcBar…）
    styles/           tokens.css（设计令牌）+ base.css（全局主题样式）
    ui/sim/           跨页面复用的单位模拟器（SimPanel / Simulator，单位详情、PK、建筑模拟共用）
    hooks/            跨页面状态（如 useSimState：状态以 URL 为唯一来源）
    nav/pageRegistry.ts  页面登记表（路径、分组、文案、元数据、搜索别名；唯一来源）
    nav/sections.ts      从登记表派生导航、首页卡片、面包屑与搜索
    utils/sticky.ts   跨路由保留的筛选状态（等价于旧版隐藏面板保留输入）
public/img/         游戏美术（civs/units/techs/buildings/dlc/stats，WebP）
tests/unit/         Vitest：模拟器数值、前置链、DLC 映射、自动链接器
tests/e2e/          Playwright：逐路由无控制台错误 + 关键交互
```

## 分层边界（#281）

`scripts/check-layers.mjs` 检查四条规则：`features/X` 不 import `features/Y`；`shared/` 不 import `features/`、`app/`；`domain/` 不 import react、`features/`、`app/`、`shared/ui`；核心数据 JSON 只能经下面登记的入口读取。`import type`、动态 `import()` 和 eager 的 `import.meta.glob` 都计入。CI 以 `npm run lint:layers -- --strict` 运行，有任何违规即失败；本地不带 `--strict` 只报告、总以 0 退出。

## 核心数据 JSON 的读取入口（#281）

`src/data/{civs,units,techs,buildings,trees,eco,effects}.json` 只能由下面 7 个文件直接 import（`scripts/check-layers.mjs` 的 `LOADERS`，逐个列名）。src 下其他任何文件，包括 `shared/`、`app/` 和 `data/` 层的其他文件，直接 import 都会报 `core-json-direct`：

| 文件                        | 角色                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `src/data/index.ts`         | 异步入口：civs 随主包；units/techs/buildings、trees 动态 import 拆包并缓存 |
| `src/data/raw/civs.ts`      | 同步入口（原样转出 civs.json）                                             |
| `src/data/raw/units.ts`     | 同步入口（原样转出 units.json）                                            |
| `src/data/raw/techs.ts`     | 同步入口（原样转出 techs.json）                                            |
| `src/data/raw/buildings.ts` | 同步入口（原样转出 buildings.json）                                        |
| `src/data/raw/eco.ts`       | 同步入口（原样转出 eco.json）                                              |
| `src/domain/datEffects.ts`  | 特例：effects.json 的类型与转换                                            |

新增入口要登记进 `LOADERS`，并同步更新本表和 `AGENTS.md`。

## 数据流

`aoe2techtree` → `npm run data` → `src/data/*.json`（提交入库）→ 加载器附加派生字段（`dlc`）、建立索引与链接器 → 特性组件通过 `useCore()/useTrees()` 读取 → 领域纯函数计算 → 共享 UI 渲染。

## 路由（与旧版兼容）

### 实体更新历史（#435）

`scripts/history_*` 的独立历史输入生成 `src/data/patches/<build>.json`；历史前后值依据当时官方公告，不用当前游戏数值校验旧补丁。覆盖报告将官方平衡项目映射到记录或明确的排除原因。

`src/data/patchHistory.ts` 仅登记 JSON 资源 URL，在打开版本页或更新历史页签时按需读取并缓存；失败后可重试真实 JSON 请求。`domain/patchHistory.ts` 负责实体主目标/历史关系匹配、去重、日期与交集筛选。`shared/ui/PatchHistory.tsx` 共用时间线与档案缺失状态，三类详情通过 `?tab=history` 接入，历史筛选使用 `hist` 前缀参数。

文明关系只采用记录中明确保存的历史范围；普通/精锐和被替换科技分别保留身份。`archivedTargets` 为当前目录未收录的科技保留地址与名称，元数据脚本据此生成独立静态分享入口，避免分享时退回首页。已有数值模拟、科技树及当前数据加载链不读历史记录。

旧链接 `#civ/X` 与新链接 `#/civ/X` 等价（HashRouter 会补全前导 `/`）。
路径、重定向和详情页都在页面登记表里（见下节），`routes.tsx` 按登记表生成 `<Route>`。
模拟器状态全部写入 URL（replace），可分享。

## 页面登记表（#283 / #388）

`src/shared/nav/pageRegistry.ts` 的 `PAGES` 是全站页面的唯一登记表。路由、导航、首页和静态页标题/说明都从这里派生。不要在 `routes.tsx`、`sections.ts`、首页或 `scripts/page_metadata.mjs` 里另维护一份平行名单。

一条登记（`PageDef`）写这些：

- **path**：路由 pattern，与 `<Route path>` 一致。`kind` 为 `page`、`redirect` 或 `detail`。
- **component**：懒加载组件 id，名字来自 `LAZY_COMPONENTS`。首页是同步组件 `Home`，不进这份懒加载名单。重定向写 `redirectTo`；`/tree` 用 `redirectDefaultTree` 跳到默认文明科技树，没有组件。
- **lane / group**：`lane` 为 `wiki`、`tool`、`secondary` 或 `future`，`group` 取 `SECTION_GROUPS`（新手入门、对局计划、经济计算、资料）。两者都有才进入导航和首页。首页分组和导航分组目前是同一个 `group`（issue 272，不在登记表里拆开）。`hideNav` 的页面不作为顶部百科快捷入口，分组工具菜单仍收录。`status: 'planned'`（如天梯）不进首页卡片。
- **metaTitle / metaDescription**：静态页标题和说明。带具体 id 的单位、科技、建筑、文明、科技树、开局、术语、补丁仍由数据生成，不在登记表里逐条写。
- **searchAliases**：全局搜索俗称，经 `sections.ts` 进入搜索。`aliases` 是 404「你是不是要找」的常见写法和旧路径。
- **omitShareSearch**：分享用的 `og:url` 不带查询。目前只有复盘 `/match-review` 和团战计划 `/team-plan`。
- **entry: 'none'**：不进首页也不进导航时必须写 `entryReason`。现有三类：首页本身（`/`）、旧路径重定向（`/list` → `/civs`，`/trade` → `/trade-income`，`/garrison` 与 `/garrison-general` → `/garrison-healing`）、详情页（文明、单条加成、单位、科技、某文明科技树、建筑、术语条目、单条补丁；入口在对应列表）。没有 `lane`、又没有 `entry: 'none'` 的页面只能出现在 `PLACEMENT_ALLOWLIST`。这是 issue 272 的已知缺口：`about-data` 仍没有首页或导航位置；`market` 与 `eco-payoff` 已经在经济计算分组里，名单先留着，不要借登记表改它们的导航。

`src/app/pageRegistry.tsx` 持有 `LOADERS`：每个懒加载 id 对应一次 `lazy(() => import(...))`。`shared/` 不能 import `features/` 里的页面，所以 `import()` 放在 `app/`，再和 `PAGES` 合成 `PAGE_REGISTRY`。`Home` 同步打进入口包，其余页面按 id 懒加载。

消费者只读登记表：

| 消费者                            | 用法                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/routes.tsx`              | `PAGE_REGISTRY.map` 生成路由。重定向、页面组件，以及传给 `PageMeta` 的 `pattern`（登记表 `path`）和 `omitShareSearch`，都来自登记项。未知路径是 `*`。         |
| `src/shared/nav/sections.ts`      | 按 `lane` 得到导航条目。`HOME_GROUPS`（`TOOL_GROUPS` 与它相同）按 `SECTION_GROUPS` 分组，首页渲染 `HOME_GROUPS`。面包屑和搜索里的页面结果也用这里派生的字段。 |
| `scripts/page_metadata.mjs`       | 读取登记表里的 `path`、`metaTitle`、`metaDescription`，写入 `src/data/page-metadata.json`。动态条目仍按游戏数据生成。                                         |
| `src/features/share/PageMeta.tsx` | 标题和说明来自生成的 `PAGE_META`。匹配的是登记表上的路由 pattern，不看地址栏里的大小写或编码。`omitShareSearch` 为真时 `og:url` 去掉查询。                    |

新增或改动页面：先改 `pageRegistry.ts`；若是新组件，再在 `src/app/pageRegistry.tsx` 的 `LOADERS` 补上同名懒加载。单测锁住这条规则：`tests/unit/pageRegistry283.test.ts`（路由只从登记表生成、懒加载 id 一一对应、要么有入口要么写明 `entry: 'none'`、静态元数据对齐、首页从分组派生）、`tests/unit/pageMeta287.test.ts`（元信息跟随匹配到的路由；复盘和团战去掉查询后仍是该页）。

## 如何添加

- **新页面**：按上一节先改登记表和懒加载表，不要另写一份路由或导航名单。纯计算放 `domain/` 或特性 `logic/` 并写单测。
- **新数据源**：在 `scripts/` 写 `<x>_build.py`（读取 `AOE_CACHE`，输出到 `src/data/`），加入 `build_data.py` 列表；在 `domain/types.ts` 定义类型，在 `data/index.ts` 写加载器（大文件用 dynamic import）。
- **新科技效果**：在 `domain/effects.ts` 的 `TECH_EFFECTS` / `CIV_BONUSES` 添加规则，并在 `tests/unit/simulator.test.ts` 加已知数值用例。

## 部署

部署：GitHub Actions（`.github/workflows/ci.yml`）在 push main 时依次 lint → 类型检查 → Vitest → Python 测试 → 数据检查 → 构建 → Playwright，全部通过后用 `actions/deploy-pages` 发布；Pages 源为 GitHub Actions。详见 README「部署」与 docs/DATA-UPDATE.md。
