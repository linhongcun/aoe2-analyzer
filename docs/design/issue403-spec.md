# #403 文明对比 URL 与复制链接：实施规格

日期：2026-10-24。版本范围见 #407，目标 release/v0.31.0；前序 #371、#278、#279 已逐项合入。用户明确本批采用独立代理复核及完整 CI，通过后由 Codex 串行合入版本分支；main 发布后续处理。本规格记录本批已批准范围，不代表 Steve 或 Kent 本人签字。

## 1. 背景与授权边界

- Issue：https://github.com/linhongcun/aoe2-analyzer/issues/403。
- 问题：文明对比选择仅存在内存，刷新丢失，无法分享指定组合。
- 用户本轮已批准首批 #371、#278、#279、#403 开始；此前 #403 评论中的“本轮暂缓、v0.31.0 候选”不是再次要求批准的依据。本文件为本项实施与独立复核依据。
- 只完成文明对比页的两文明 URL 状态与“复制链接”。不捆绑 #286 的全站分享迁移，不改变其他页面的参数格式。

## 2. 现有实现与复用点

- `src/features/compare/components/Compare.tsx` 当前使用 `useSticky('cmp.a', 16)` 和 `useSticky('cmp.b', 5)` 保存数组下标，刷新回到初始组合。
- 文明数据来自 `civs`，选择器使用 `Civ.en`。新 URL 应存稳定英文标识，不存数组下标或中文显示名。
- `src/shared/ui/DetailBlocks.tsx` 的 `CopyPageLink` 已提供复制按钮、成功提示、失败时只读链接及聚焦全选。
- `src/domain/sharePage.ts` 的 `sharePageUrl` 生成项目根下的静态分享地址。
- `scripts/static_pages.mjs` 已为 `/compare/` 静态入口保留查询并启动 HashRouter。无需修改静态启动脚本。
- `tests/e2e/communityIntegration230.spec.ts` 已覆盖同文明 Berbers/Berbers 及进入队伍页后返回。须保留该行为。

## 3. URL 契约

### 参数与默认值

- 地址栏格式：`#/compare?a=Mapuche&b=Muisca`。
- `a` 对应文明 A，`b` 对应文明 B；取值必须是固定数据中精确匹配的 `Civ.en`。
- 默认组合固定为 `Franks` / `Britons`，通过文明名解析，不依赖数据数组排序。
- 允许 A/B 同一文明，保持两侧位置和顺序。
- 不引入格式版本参数，不支持中文名、数组下标、大小写别名或新旧参数迁移。

### 解析与无效回退

- 仅当 `a`、`b` 各出现恰好一次，且两值均为合法文明时采用输入组合。
- 任一侧缺失、为空、未知、大小写不匹配或重复，整组回退 `Franks` / `Britons`。
- 无参数链接同样使用默认组合。该规则明确“回退默认组合”，不保留一侧并悄悄拼出另一个对比。
- 依靠 `URLSearchParams` 完成正常百分号解码；解码结果不等于合法文明名时按无效参数处理，不抛页面异常。
- 不新增参数错误面板；页面显示实际采用的组合并同步地址。

### 规范化与未知参数

- URL 为页面的唯一选择状态。移除 Compare 对 `cmp.a` / `cmp.b` 的 sticky 依赖，不从本地存储或其他会话状态覆盖 URL。
- Compare 自身将大小写或编码别名路径一并 replace 为 `/compare`，使共享复制组件始终生成 Compare 静态入口；不更改全站路径或分享协议。
- 初次加载或无效参数回退时，用 `replace` 将实际显示的 `a` / `b` 写回当前查询，不新增历史条目。
- 对已有合法组合无需写入新历史；规范化函数须幂等，避免导航循环。
- 保留所有未知参数的值、重复项和相对顺序，只覆盖 `a` / `b`。标准序列化可以改变百分号编码表现，不要求保持原始 URL 字节。
- 规范化去除重复的 `a` / `b`，各留下一个最终值。不承诺已知参数的排列位置；测试按解析后的语义断言。

| 输入查询                      | 实际 A / B        | 其他行为             |
| ----------------------------- | ----------------- | -------------------- |
| 无查询                        | Franks / Britons  | replace 写入默认组合 |
| `a=Mapuche&b=Muisca`          | Mapuche / Muisca  | 保持组合             |
| `a=Berbers&b=Berbers`         | Berbers / Berbers | 允许重复文明         |
| `a=Mapuche`                   | Franks / Britons  | 整组回退             |
| `a=&b=Muisca`                 | Franks / Britons  | 整组回退             |
| `a=Unknown&b=Muisca`          | Franks / Britons  | 整组回退             |
| `a=mapuche&b=Muisca`          | Franks / Britons  | 不增加大小写别名     |
| `a=Mapuche&a=Franks&b=Muisca` | Franks / Britons  | 去除已知参数重复     |
| `a=Mapuche&b=Muisca&x=1&x=2`  | Mapuche / Muisca  | 保留两项 x 及其顺序  |
| `a=Unknown&b=Muisca&x=1`      | Franks / Britons  | 保留 x，规范化 a/b   |

## 4. 用户选择与前进后退

- CivPicker 确认一个不同文明时，以当前解析组合为底，只改变该侧，并 push 一条历史。
- 确认已经选中的文明不导航、不增加历史。
- 搜索文字、打开/关闭选择器、Esc 退出不更新 URL。
- 后退撤销上一项已确认的文明选择；前进恢复。控件、表格、雷达、定位信息、队伍入口必须一起响应当前 URL。
- 初次加载与无效参数的 replace 规范化不插入额外历史，也不能把浏览器后退拉回当前页面。
- 跳转到其他页面再返回时，以返回目标的 URL 为准，不用 sticky 恢复其他组合。

## 5. 必须保留的 DOM 与原有行为

无需重排现有对比内容；新入口添加在文明选择区之后、对比结果之前。

- 保留 `<section id="compare" className="pane">`、`ListHead` 标题“文明对比”及说明。
- 保留两个 `CivPicker` 的 `id="ca"` / `id="cb"`、标签“文明 A” / “文明 B”及其 `data-value` 文明英文值。
- 保留 `.bar.fbar` 选择区和两侧位置；现有选择器的底部抽屉、桌面弹层、键盘导航、关闭后焦点返回继续复用。
- 保留 `#ctab`、现有表格行顺序、文明标题、特色兵种/科技/团队加成/开局内容、`.compare-score` 与 `.win` 判定。
- 保留 `.two` 表格/雷达布局、`RatingHeading`、`Radar id="crd"`、颜色说明及 `#cpos` 内的 `PosBox`。
- 保留“查看这两个文明的队伍加成来源”的链接文案及现有 `defaultTeamBonusConfig`、`updateTeamRoster`、`encodeTeamBonuses` 组合。它必须携带当前 A/B 顺序，同文明仍对应两名玩家。
- 不改变评分数据、游戏数值、介绍文本、雷达绘制或图标来源。不为本项调整标题层级或重做页面布局。
- 保留现有 `/compare` 页面登记和静态元信息，无需维护第二份路由名单。

## 6. 复制入口和四宽设计状态

### 位置与基础视觉

- 在 `.fbar` 之后、`.two` 之前添加 Compare 局部分享容器，优先复用 `CopyPageLink`。
- 1280 宽：按钮左对齐、宽度随内容，置于结果上方，使用现有 copy/check 图标与按钮令牌。
- 360 / 375 / 390 宽：分享容器及按钮占满可用内容宽度；不加入底部固定栏。
- 按钮和手动复制输入框最小高度 44px；字号不低于 12px；间距、颜色、边框、圆角使用现有令牌。
- 页面对比内容继续使用现有 `.bar` 换行、`.fbar` 内边距、`.two` 响应式布局。不覆盖全站样式。

### 状态

1. 正常：按钮“复制链接”。
2. 成功：现有 `role="status"` 显示“链接已复制”，两秒后恢复；不增加独立 toast。
3. 失败或没有 clipboard：按钮下方在正常文档流显示“请复制页面链接”和只读完整 URL 输入框，聚焦时全选。输入框内部可横向查看长链接，页面不横向溢出。
4. 修改组合或前进后退后：成功状态与手动复制兜底重置，不再展示上一组链接。可按规范化查询给复用组件设 key，隔离上一次异步复制的状态。
5. CivPicker 打开：保持既有弹层/抽屉层级、焦点陷阱、Esc 与焦点归还；分享入口不能压住选项。

### 复用组件的已知样式注意点

- `.detail-copy` 的 `position: relative` 当前只在 `.detail .detail-copy` 下生效，Compare 不带 `.detail`。
- `.detail-copy-fallback` 默认绝对定位；直接裸放进 Compare 会使兜底位置失去局部锚点。
- 用 Compare 分享容器的局部样式将兜底改为正常文档流、`width: 100%` 和适当最大宽度，输入框使用 `box-sizing: border-box`、`min-width: 0`；不要为此修改所有详情页或给 Compare 冒加 `.detail`。
- 现有 `layout.tsx` 会载入 `editorial-details.css`，但仍须实际核对 Compare 页面上复制样式已生效。

## 7. 复制 URL 与部署路径

- 复制结果应等价于 `sharePageUrl('/compare', 当前规范化查询, document.baseURI)`。
- 线上示例：`https://linhongcun.github.io/aoe2-analyzer/compare/?a=Mapuche&b=Muisca`。
- 地址栏仍可为 HashRouter 的 `#/compare?a=...&b=...`。静态分享地址与地址栏无需字面相同，只须恢复同一组合与保留参数。
- 保留项目部署前缀，不丢 `/aoe2-analyzer/`，不重复 `/compare/`，不退回首页。
- 从 Hash 入口和 `/compare/` 静态入口分别复制时，应得到相同语义的有效地址。使用实际 `document.baseURI` 处理静态页 base，不自行拼域名或绝对根路径。
- 静态入口修改组合后，外层 HTTP 查询可能仍是旧值；选择和复制只读取 Router 当前 search，不能重新合并 `window.location.search`。
- 分享内容很小，无需为本项新增长度限制或分享图片功能。

## 8. 验证要求

### 纯函数测试

- 上表全部解析/回退案例，包括重复的已知参数、空值、未知文明和大小写不匹配。
- 合法组合 encode/decode 往返，重复文明不去重、不换位置。
- 未知参数的值、重复项和顺序保留，规范化幂等，不修改传入的查询对象。
- 默认值按文明标识解析而非数组下标；对数据存在 Franks/Britons 的前提作明确校验。

### 浏览器行为测试

- 直接打开 Mapuche/Muisca 参数链接，检查 `#ca` / `#cb`、表头及至少一项文明特有内容相符；刷新后不变。
- 分别切换 A 和 B，地址立即更新且另一侧保持；确认同一选项不添加历史；选择器搜索不改变 URL。
- 两次选择后后退/前进，控件、表格、雷达输入及队伍入口随 URL 还原，不被旧 sticky 状态覆盖。
- 无参数、单侧非法、重复参数整组回退且规范化，页面无报错。
- 带两个未知同名参数时，加载、选择和复制后仍完整保留。
- 同文明 Berbers/Berbers，进入队伍页仍有两个提供者，后退恢复对比；现有集成用例不改期望即可通过。

### 必须测试实际复制出来的链接

- 成功路径：授予浏览器 clipboard 权限或捕获真实 writeText 入参，点击页面按钮，读取所复制的完整 URL。断言实际协议/主机/项目 base/`compare/` 路径及解析后的参数，不能只调用 URL helper 代替用户点击。
- 将上述实际复制值交给另一个页面/新浏览器上下文打开，等待应用挂载，核对 A/B 及内容。再刷新一次核对；不得手工把分享链接改回 `#/compare` 才测试。
- 测试使用构建产物的真实 `/compare/` 静态入口，验证 bootstrap 恢复参数。可在已有测试服务器上按部署前缀验证，不要把线上生产写操作引入测试。
- 从静态 `/compare/?a=Mapuche&b=Muisca` 进入后再次复制，核对没有嵌套重复 `/compare/` 或遗失项目 base。
- 拒绝 clipboard 与 clipboard 不存在分别进入兜底，显示完整可聚焦、可全选的只读值；打开兜底中的实际 URL 仍恢复组合。
- 复制成功或出现兜底后再改变文明，原成功提示或原链接不得继续展示；再次复制得到新组合。
- 复制 Promise 延迟期间修改组合，再放行旧 Promise 的成功或失败，均不能污染新组合的反馈状态；key 仅加给复制组件，不重挂整页或选择器。
- 复制大小写/编码路径别名后实际打开仍为 Compare；从静态入口改选后复制应恢复新组合，且键盘选择不同文明后焦点仍返回原选择按钮。

### 设计与回归

- 360 / 375 / 390 / 1280 四宽，浅深两主题；正常、成功、失败、选择器打开状态均检查无横向溢出、无 console error/pageerror。
- 新按钮与输入框检查 44px 热区、键盘可达、可见焦点；手动链接完整而不撑开页面。
- 为 PR 准备四宽界面证据，失败态至少覆盖最窄宽度；截图留在测试产物中，不提交 png。
- 至少跑新专项、`civText402`、`communityIntegration230` 和相关 smoke/share 回归。实际合并前仍完成仓库规定的 lint、typecheck、Vitest、build 和全量 Playwright，并记录实际通过结果。
- 不改 `tests/**/v0*-acceptance*` 的期望值，不宣称本草案或软件测试等同于 Kent/Steve 本人签字。

## 9. 实施范围与交付

- 一个 issue、一个执行者、一个 PR；前序 PR #410 已完成后认领本项，由主代理统一集成，子代理分工及独立复核。
- 建议改动限于 Compare、局部样式、一个小型纯函数参数模块（如有必要）、专项测试及玩家可见 CHANGELOG。
- 不迁移全站 clipboard，不改其他页面参数，不引入新状态框架，不新增交换、重置、分享图或存储同步。
- 本项属于已冻结的 v0.31.0 四项范围，以 release/v0.31.0 为唯一合并目标；不代写角色签字，不发布 main。
