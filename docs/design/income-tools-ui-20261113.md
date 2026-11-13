# 收益与市场工具界面优化

基线：bf1347f76074ddd53864a515a6c6a1d4bd032257。玩家在设置参数、比较收益与复制方案时，需要清楚区分输入、结果和计算边界。

## 冻结规格

- 下一批冻结范围：仅优化 /market、/eco-payoff、/relic-income、/trade-income 四页CSS，不改TSX逻辑和计算。

- 四页参数/结果卡统一使用 --radius-lg、--color-surface、--color-border，内层资源/成本卡用 --radius-md/--color-surface-2。
- 卡片h2用18px/700、--color-text，保留h1与说明/来源层级；选择器、非checkbox单行输入、独立按钮使用--radius-pill，手动复制textarea保持--radius-md，保持44px热区和focus-visible。
- 市场保留桌面输入/结果双栏、两份方案和交易排序/删除；卡片间距16px，桌面主卡padding20px，<=540px16px；只强化表头surface-2，不改thead隐藏/手机data-label方案，表格读屏候选不在本次纯样式范围。
- 经济回本和贸易卡padding统一16px（删除<=800px降至12px规则），资源/成本层级用内层卡；回本结果保持18px但加粗/强调色，不改变告警颜色。保留手机现有两列输入和<=420px单列成本/资源。
- 圣物保留现有20px/手机16px卡padding，参数区及结果区h2由22px统一18px；保留<=480px单列、禁用修道院/手动复制/无效/未计入状态与所有说明。
- 360/375/390/1280设计范围内无隐藏内容、数字不折行、无横向溢出；浅/深色跟随令牌。保留每页加载、空、无效、禁用、上限、未计入和无有限回本状态，不新增模型、推荐或视觉隐藏。
- 保持共享tool-workspace布局、sticky行为、页面DOM/文本/标签/ARIA、值和URL协议不变；不碰domain、生成数据、全局CSS或共享控件。旧巡检的字段级aria关联另列保留，不声称已修。
- 验证以每页现有直接相关E2E的代表性desktop-light与mobile-dark加边界用例为限；tsc/lint/build一次，格式仅变更文件。无需整站/整套计算/数据管线。

## 交付门禁

- 工作流 income-market 独立规格预审通过后实施；其余组只做后续边界预检，不扩大本批范围。
- 一个 issue、一个 PR、单源写者。CSS 改动不增加新行为，既有错误/警告保持原有语义色。
- 本地直接相关验证、独立实现复核、远端 CI、main/Pages、线上构建身份与正式 Release 完整核验后关闭。
