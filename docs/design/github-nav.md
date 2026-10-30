# 顶部 GitHub 仓库入口（#511）

维护者要求开源项目在顶部导航显示 GitHub 图标并可跳转仓库。

- 搜索按钮右侧、桌面外观按钮左侧放原生链接，所有页面共享；手机关闭抽屉时也直接可见。
- 地址复用 `dataInfo.ts` 的 `REPO`；新标签打开，`rel="noopener noreferrer"`。中文名称与提示为「GitHub 仓库（在新标签页打开）」。
- 点击区复用 `.iconbtn`，至少 44×44px；图标继承 `currentColor`，普通、hover、focus 使用现有 `--color-text-2`、`--color-text`、`--color-surface`、`--color-surface-2` 与焦点令牌。浅色/深色均可见。
- 当前 Lucide 版本无 GitHub 品牌图标；依用户明确品牌需求采用官方 [Octicons mark-github-24](https://github.com/primer/octicons/blob/main/icons/mark-github-24.svg)，通过 `createLucideIcon` 注册统一 Icon 入口。SVG 本地打包，MIT 许可全文随代码保存。此例外仅用于 GitHub 品牌标识。
- 600px 以下顶栏横向 padding 为 8px、gap 为 2px；保留完整品牌标题及原菜单、版本、搜索入口。其它宽度沿用现有间距。

验收：360 / 375 / 390 / 1280px 的明暗模式均检查可见性、44×44、无横向溢出、字体加载后品牌文字和控件无重叠、无 console error / pageerror；补查 901 / 1024 / 1100px。键盘 Tab 可到达且有焦点，Enter 和点击在新标签打开准确仓库，原页面保留。现有导航/搜索/外观交互沿用导航回归。

实施前失败场景：当前顶栏不存在仓库链接，无法通过顶部操作区打开仓库。规格已由实现者之外的 `nav_review` 代理复核通过。

不在范围：Star 数、运行时 GitHub API、登录、其它页面和游戏数据/计算。依现有 CI 策略检查共享壳变更；不为本项更改 CI 或生成未变数据。
