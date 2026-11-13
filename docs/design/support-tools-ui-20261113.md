# 生产与建筑辅助工具界面

基线 cb2c933d3bf9ec22078445dccf54c3166df9bf02。用户希望继续批量优化工具页；玩家需要清楚区分配置、结果与适用边界。

## 冻结范围

- 仅改 production.css、construction.css、garrisonHealing.css 三份页面CSS；不改TSX/DOM/文本/ARIA、事件、URL、计算、生成数据、共享样式/工具壳层。
- /production 仅持续生产模式：基础条件 .production-settings 增加16px内边距、1px border、surface、radius-lg卡片；摘要/需求行/科技卡同为radius-lg，移动端不再从16px降至12px；科技内层fieldset改radius-md。保持1024px双栏门槛、条件在前、结果不吸顶、需求1和摘要在1280×900首屏、两列基础选择/700px需求控件单列。训练总价、跨文明训练对照、模式导航和加载错误分支不改。
- /construction 主卡由24px改20px内边距、radius-lg，<=600px保留16px；卡片h2为18px/700。非checkbox输入和select为radius-pill、control底色；数值块、人数对照、说明/告警块radius-md。保留900px三列/600px两列人数对照及600px单列配置/数值块，当前人数高亮和告警语义色不变。
- /garrison-healing 主卡radius-lg，保留20px/<=760px16px内边距；卡片h2为18px/700，指标18px/700；输入/select、手动复制单行输入与按钮/btn为radius-pill；指标、草药对照、告警块radius-md；保留760px对照单列、所有数字nowrap和现有focus-visible。
- 持续生产的h2保持18px并加粗700；三页单行非checkbox输入/select及独立按钮用radius-pill。checkbox原生样式/尺寸不动，不新增隐藏、截断或吸顶行为。44px热区不缩小，沿用语义颜色令牌。
- 设计边界360/375/390/1280：保留内容、数字+单位不折行、不横向溢出；不把四宽/全主题矩阵设为本批测试门禁。

## 状态与边界

- 生产增删需求、零数量暂停、上限禁用、不可用选项、免费科技、空方案、错误抑制合计与手动复制不变。
- 施工可编辑无效草稿与坏链接锁定区分、首TC条件、停采任务、非线性人数对照、理论/未实测说明不变。
- 治疗valid/complete/invalid/ineligible/zero-rate/unverified独立语义不变，零秒不是未知；原始HP草稿、URL恢复、禁用/空科技、草药比较、来源与未计入说明不变。
- 复用上批workflow production-support预检；独立规格预审后实施，独立实现复核、适用CI、main/Pages与正式Release核验后关issue。
- 只跑相关现有E2E代表状态，变更文件格式检查、lint与build（含tsc）各一次；不跑全站/全量计算/数据管线，不删断言掩盖问题。
