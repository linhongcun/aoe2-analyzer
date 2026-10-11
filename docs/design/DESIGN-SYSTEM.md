# aoe2-analyzer 设计规范 · 方向 C：浅色编辑风

> 状态：草案 v1（2026-10-11，Jony）。样稿见 `mockups/*-desktop.png` / `mockups/*-mobile.png`，总览 `overview.png`。

## 1. 原则
1. **内容是主角**：大量留白，页面只用一个强调色（琥珀色 `#a65a14`）。游戏图标本身就有颜色，界面其余部分保持中性。
2. **关键数字先行**：每张卡片、每个详情页都先给出最重要的那个数字，表格放到后面。
3. **一种控件只表达一种意思**：标签页用来切换页面里的内容区，分段控件用来切换同一份数据的显示方式（详见 §5.4）。
4. **手机端优先保证可读**：第一屏要能看到搜索框和至少 4 个入口。

## 2. 颜色
所有文字颜色都已经算过 WCAG 对比度，算法见 `contrast.py`。“标签底”这一列指文字放在标签或 chip 底色上的对比度。

| 令牌 | 浅色 | 在卡片上 | 在页面背景上 | 在标签底上 | 深色 | 在卡片上 | 用途 |
|---|---|---|---|---|---|---|---|
| `--color-text` | #1d1d1f | 16.8 | 16.3 | 15.1 | #f5f5f7 | 15.6 | 正文、标题 |
| `--color-muted` | #636366 | 5.99 | 5.79 | 5.37 | #a1a1a6 | 6.61 | 说明、英文名、表头 |
| `--color-accent` | #a65a14 | 5.13 | 4.96 | 4.60 | #f0a454 | 8.22 | 品牌、当前项、强调数字 |
| `--color-link` | #0066cc | 5.57 | 5.39 | 4.99 | #4da3ff | 6.48 | 链接、“全部 →” |
| `--color-good` | #1f7a35 | 5.39 | 5.22 | 4.83 | #4cd964 | 9.25 | +n 增益 |
| `--color-bad` | #c4281c | 5.73 | 5.54 | 5.13 | #ff6b5e | 6.09 | 卡点、减益 |
| `--color-warn` | #a15c00 | 5.19 | 5.02 | 4.65 | #ffb340 | 9.54 | 提醒 |

全部 ≥ 4.5:1，达到 AA 标准。按钮上的白字放在琥珀底上是 5.13:1。
面与线：浅色是背景 `#fbfbfd`、卡片 `#fff`、次级面板 `#f5f5f7`、控件槽 `#ececf0`、描边 `#e5e5ea`、分隔线 `#f0f0f2`；深色依次是 `#000`、`#1c1c1e`、`#2c2c2e`、`#2c2c2e`、`#38383a`、`#2c2c2e`。
资源色（食物 `#e0864a`、木头 `#8a6b3d`、金子 `#d4a72c`、石头 `#8e8e93`）**只做色块**，上面不放正文；色块里的文字一律用白字 11px 以上，并在旁边附图例。

**规则（2026-10-11 更新，见 #6）**
- `--color-muted` 从 `#6e6e73` 改为 `#636366`。实测对比度：#fff 5.99 · #fbfbfd 5.79 · #f5f5f7 5.50 · #ececf0 5.08（旧值在 #ececf0 上只有 4.30，不达标）。
- `#ececf0`（`--color-control`）**只用作 chip 和输入框的底色**，上面不能放比 `--color-muted` 更浅的文字（包括占位文字和 `Ctrl K` 提示）；卡片、面板、手风琴行都不用它做底色。
- 琥珀色只用在关键数字、当前选中项和卡点警告三种地方；背景保持纯色，不加渐变和纹理；阶段 2 把 axe 接入 CI，要求 0 个对比度问题。

规则：页面里琥珀色的面积不超过约 5%；红色只用于卡点和减益，不做装饰。

## 3. 字体
- **修复 Times 回退**：现在 `base.css` 写的是 `font-family: 'Noto Serif SC', Georgia, serif`，但站点没有加载 Noto Serif SC，所以拉丁字母和数字都回退到了 Georgia / Times。改成 `font-family: var(--font-sans)`，删掉衬线字体。
- 中文字体顺序：PingFang SC → HarmonyOS Sans SC → Noto Sans SC → 微软雅黑 → 系统字体。不需要自托管中文字体，体积为零。
- 拉丁字母和数字用 **Inter**：自托管 woff2，只取 latin 子集的 400、600、700 三个字重，约 70KB，加 `font-display: swap`。所有数字加 `font-variant-numeric: tabular-nums`，表格、统计数字、时间轴的数字就能对齐。
- 字号：展示 56 / H1 40 / H2 28 / H3 18 / 正文 15 / 小字 13 / 极小 12 / 大数字 28（手机端分别降为 36 / 28 / 22 / 16 / 15 / 13 / 12 / 22）。标题字重 700，字间距 -0.02em；正文行高 1.65。
- 英文名统一用“中文名 + 浅灰英文名”的格式，例如 `精锐掷斧兵 Elite Throwing Axeman`，英文名用 `--color-muted`、字重 400，比中文名小一级。

## 4. 间距、圆角、阴影
- 间距（4 的倍数）：4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 64 / 96。卡片内边距 22–26，卡片之间 16，区块之间 40，首页大标题区上方 96。
- 圆角：控件 8，小卡片和统计块 12–14，卡片 18，页头大卡片 22，chip、搜索框、按钮用全圆角（999）。
- 阴影：`--shadow-1` 用于卡片，`--shadow-2` 用于搜索框和下拉，`--shadow-3` 用于命令面板和弹窗。深色模式不用阴影，改用 1px 描边。
- 内容区最大宽度 1200，两侧边距 40（手机端 16）。

## 5. 组件
### 5.1 顶部导航
高 52，背景是白色 80% 不透明加毛玻璃模糊，底部 1px 描边，吸顶。左边是品牌，中间是一级导航（首页、文明、单位、科技、科技树、开局、工具 ▾），右边是一个灰色全圆角的搜索按钮。**当前项用正文黑加粗表示，其他项用灰色**，不用金色色块。高亮由路由的模块匹配决定，详情页要高亮它所属的模块，比如单位详情页高亮“单位”。样稿里原来的高亮问题已修好。
手机端（≤ 900px）只保留品牌、搜索图标和菜单按钮，点开菜单是按“百科 / 工具”分组的抽屉。

### 5.2 搜索
首页大号搜索框：全圆角，`--shadow-2`，最大宽度 560，右侧显示 `Ctrl K` 提示。命令面板：圆角 18，`--shadow-3`，结果行左边是图标，然后是中文名、浅灰英文名，最右边是类型标签；当前选中行用 `--color-surface-2` 做底色。

### 5.3 卡片（带关键数字）
白底，圆角 18，`--shadow-1`。右上角放一个关键数字（文明 56、单位 248…），浅色淡化成 `#e8e8ed`，作为装饰性的大字。标题 18/700，下面一行英文名 12，再下面是说明 14。工具卡片底部加“打开 →”，用 `--color-link`。悬停时阴影加深一档，并上移 1px。

### 5.4 分段控件和标签页（必须区分）
| | 标签页 Tabs | 分段控件 Segmented |
|---|---|---|
| 含义 | 切换页面里的**内容区**（概览 / 科技模拟器 / 相关） | 切换**同一份数据**的显示方式或参数（普通 / 精锐，近 / 中 / 远） |
| 样式 | 灰色槽 `#ececf0` 里放白色滑块，圆角 10，放在页头下方，左对齐 | 文字按钮，当前项用琥珀色加粗，不加槽；或者做成小号槽 |
| 位置 | 每页只有一组，页头正下方 | 紧挨着它控制的数据，可以有多组 |
| URL | 写入 `?tab=` | 写入参数（`?elite=1`），不当作页面导航 |

### 5.5 单位页统计主块（Stat hero）
页头卡片（圆角 22）：左边是 84px 的图标（圆角 16），中间是中英文名和标签（所属文明、单位类型、生产建筑、时代），右边是造价和生产时间，数字 18/700。
页头下面是 4 列统计块（手机端 2 列），底色 `#f5f5f7`，圆角 14：上面是 12px 的属性名，下面是 28/600 的等宽数字。选“精锐”时，右上角用 `--color-good` 显示相对普通版的变化（例如 +10）。这样就能替掉原来的“普通与精锐对比”整张表。

### 5.6 表格
不画竖线，只用 1px `--color-line` 的横线分隔；表头 12px 灰色，字重 500；数字右对齐、等宽；增益列用 `--color-good`。行高 40（手机端 36）；超过 6 列时在手机端横向滚动，并固定第一列。

### 5.7 Chip / 标签
Chip（快捷入口）：白底，加 `0 0 0 1px` 描边，全圆角，左边是 22px 的圆形文明徽章。标签（只做元信息，不能点）：`--color-tag` 底，全圆角，12px。“全部 56 个文明 →”用纯文字链接。

### 5.8 开局时间线（#3，浅色版）
- 顶部是参数条：开局下拉、文明下拉、走路距离分段控件（近 2 / 中 4 / 远 7，默认中 4）、自动造房开关（默认开）。
- 摘要条有 4 个统计块：卡点（有卡点时用 `--color-bad-soft` 底加红字，排第一）、到达封建或城堡（“约 8:50”，下面一行写早晚范围）、城镇中心闲置约 x 秒、到达时的村民数。
- 主时间线：白色卡片，横轴是分钟，每行一类（城镇中心 / 食物 / 木头 / 金子 / 军事 / 到达时代）。用资源色做色块，色块里写人数；升级时代的色块用琥珀色；**估算范围**用琥珀色 13% 透明度的浅带表示，左右不对称，分别对应 M2 给出的早和晚两个值。
- 卡点：在对应区间盖一层红色 10% 底，两边各一条 2px 红线，上方挂一个红色标签，写“卡人口 · 约 24 秒”或“木头差 35”。三种卡点用同一套样式：城镇中心闲置换城镇中心图标并排第一，其次是卡人口和断资源。
- 步骤列表放在时间线下面，异常行用 `--color-bad-soft` 底，左边加 3px 红条，最右边写 M2 给的原因文案。
- 空数据：显示一块虚线占位，文案是“选择一个开局开始模拟”。超时：摘要的卡点块写“60 分钟内到不了城堡”。
- 手机竖屏：标签列宽缩到 64，时间轴刻度每 2 分钟一个，步骤列表放在时间线下面，异常原因换行显示。

## 6. 手机端规则（≤ 600px，导航在 ≤ 900px 时折叠）
- 两侧边距 16；网格：入口卡片和单位卡片 2 列，统计块 2 列，侧栏移到正文下方。
- 标签页内容超出时横向滑动，不换行；可点区域最小 44×44。
- 页头大卡片：图标缩到 60，英文名换到下一行，造价和生产时间改成一行左右排开。
- 首页第一屏：大标题 36、搜索框、文明 chip（最多 2 行，其余收进“全部”）。
- 文字不小于 12px；时间轴色块里的文字可以小到 9px，但必须有图例。

## 7. 替换 `src/shared/styles/tokens.css`
见下方完整文件（实现以 `src/shared/styles/tokens.css` 为准）。旧令牌名全部保留，只改值；新组件请用 `--color-*` 等语义名。

| 旧令牌 | 旧值 | 新映射 | 说明 |
|---|---|---|---|
| `--c-bg-deep` | #120d08 | `--color-bg` #fbfbfd | |
| `--c-panel` | #1f170e | `--color-surface` #fff | |
| `--c-control` | #2a1f13 | `--color-control` #ececf0 | |
| `--c-tag` | #4a3518 | `--color-tag` #f2f2f7 | |
| `--c-border` | #6b5020 | `--color-border` #e5e5ea | |
| `--line`（代码在用，但 tokens 里没有定义） | — | `--color-line` | 本次补上定义 |
| `--c-text` | #e8d5a3 | `--color-text` | |
| `--c-muted` | #b08d57 | `--color-muted` | |
| `--c-gold-hi`（用了 34 处，多是标题） | #f0c75e | `--color-text` | 需要强调的地方逐个改用 `--color-accent` |
| `--c-gold` / `--c-bronze` | #d4a017 / #8b6914 | `--color-accent` | |
| `--c-blue` | #50a0dc | `--color-link` | |
| `--c-good` / `--c-up` | #8fd18f / #5fd35f | `--color-good` | |
| `--c-bad` | #e08080 | `--color-bad` | |

**注意**：代码里还有 54 处写死的十六进制颜色（`grep -rE "#[0-9a-f]{6}" src`），换完令牌后必须逐个改掉，否则浅色背景上会出现深棕色块。深色模式那一段（`[data-theme="dark"]` 和 `prefers-color-scheme`）请在第 4 阶段再启用；前三个阶段先注释掉，以免跟随系统时自动切到还没检查过的深色界面。

```css
/* 设计令牌：浅色编辑风（方向 C），附深色模式
 * 旧令牌名全部保留，只是换了值，现有组件不用改就能用；新组件请用语义名 --color-* / --space-* 等。
 * 字体由 base.css 改为 font-family: var(--font-sans);
 */
:root {
  color-scheme: light;
  /* —— 语义色（新） —— */
  --color-bg: #fbfbfd;          /* 页面背景 */
  --color-surface: #ffffff;     /* 卡片 / 面板 */
  --color-surface-2: #f5f5f7;   /* 次级面板、关键数字块、表头 */
  --color-control: #ececf0;     /* 分段控件槽、输入框底 */
  --color-tag: #f2f2f7;         /* 标签 / chip 底 */
  --color-border: #e5e5ea;      /* 1px 描边 */
  --color-line: #f0f0f2;        /* 表格分隔线 */
  --color-text: #1d1d1f;        /* 正文 16.8:1 */
  --color-text-2: #3a3a3c;      /* 次级正文 */
  --color-muted: #636366;       /* 说明文字 5.99:1（#ececf0 上 5.08:1） */
  --color-accent: #a65a14;      /* 品牌琥珀（文字可用 5.13:1；白字在其上 5.13:1） */
  --color-accent-soft: #a65a141f;
  --color-link: #0066cc;        /* 链接 5.57:1 */
  --color-good: #1f7a35;        /* 增益 +n 5.39:1 */
  --color-bad: #c4281c;         /* 卡点 / 减益 5.73:1 */
  --color-bad-soft: #fdeeec;    /* 卡点行底色 */
  --color-warn: #a15c00;        /* 5.19:1 */
  /* 资源色（仅作色块，不承载文字） */
  --res-food: #e0864a; --res-wood: #8a6b3d; --res-gold: #d4a72c; --res-stone: #8e8e93;

  /* —— 字体 —— */
  --font-sans: "Inter", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", system-ui, sans-serif;
  --font-num: "Inter", "SF Pro Text", system-ui, sans-serif; /* 配合 font-variant-numeric: tabular-nums */
  --font-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  --fs-display: 56px; --fs-h1: 40px; --fs-h2: 28px; --fs-h3: 18px; --fs-body: 15px; --fs-sm: 13px; --fs-xs: 12px; --fs-num-xl: 28px;
  --lh-tight: 1.15; --lh-body: 1.65;

  /* —— 间距（4 的倍数） —— */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-16: 64px; --space-24: 96px;
  /* —— 圆角 —— */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 18px; --radius-xl: 22px; --radius-pill: 999px;
  /* —— 阴影 —— */
  --shadow-1: 0 1px 2px #0000000a, 0 4px 16px #0000000a;   /* 卡片 */
  --shadow-2: 0 2px 12px #0000000f, 0 0 0 1px var(--color-border); /* 搜索框、浮层 */
  --shadow-3: 0 12px 40px #0000001f;                       /* 命令面板、弹窗 */
  --focus-ring: 0 0 0 3px #0066cc55;
  --nav-h: 52px; --content-max: 1200px;

  /* —— 旧令牌 → 新值（兼容层） —— */
  --c-bg-deep: var(--color-bg);
  --c-panel: var(--color-surface);
  --c-control: var(--color-control);
  --c-tag: var(--color-tag);
  --c-border: var(--color-border);
  --line: var(--color-line);
  --c-text: var(--color-text);
  --c-muted: var(--color-muted);
  --c-gold-hi: var(--color-text);    /* 旧“高亮金”多用于标题，改为正文黑；需要强调处改用 --color-accent */
  --c-gold: var(--color-accent);
  --c-bronze: var(--color-accent);
  --c-blue: var(--color-link);
  --c-good: var(--color-good);
  --c-up: var(--color-good);
  --c-bad: var(--color-bad);
}

/* 深色模式：用户切换为 [data-theme="dark"]，或跟随系统 */
:root[data-theme="dark"] { 
  --color-bg: #000000; --color-surface: #1c1c1e; --color-surface-2: #2c2c2e; --color-control: #2c2c2e; --color-tag: #2c2c2e;
  --color-border: #38383a; --color-line: #2c2c2e; --color-text: #f5f5f7; --color-text-2: #d1d1d6; --color-muted: #a1a1a6;
  --color-accent: #f0a454; --color-accent-soft: #f0a45429; --color-link: #4da3ff; --color-good: #4cd964; --color-bad: #ff6b5e;
  --color-bad-soft: #3a1714; --color-warn: #ffb340;
  --shadow-1: 0 0 0 1px var(--color-border); --shadow-2: 0 0 0 1px var(--color-border); --shadow-3: 0 12px 40px #000a;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --color-bg: #000000; --color-surface: #1c1c1e; --color-surface-2: #2c2c2e; --color-control: #2c2c2e; --color-tag: #2c2c2e;
    --color-border: #38383a; --color-line: #2c2c2e; --color-text: #f5f5f7; --color-text-2: #d1d1d6; --color-muted: #a1a1a6;
    --color-accent: #f0a454; --color-accent-soft: #f0a45429; --color-link: #4da3ff; --color-good: #4cd964; --color-bad: #ff6b5e;
    --color-bad-soft: #3a1714; --color-warn: #ffb340;
    --shadow-1: 0 0 0 1px var(--color-border); --shadow-2: 0 0 0 1px var(--color-border); --shadow-3: 0 12px 40px #000a;
  }
}
```
