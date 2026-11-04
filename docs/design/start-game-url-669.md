# 开一局完整URL与来源恢复（#669）

v0.77.11，基线main `d184d93ed16b6d7b2b95ae7814819e8d6f998c1f`（#674已实际交付）。独立设计预审v4认可本规格；实际提交与四宽图仍须最终独立复核。

## 格式与边界

首页HashRouter地址为 `#/?sgv=1&sg=<完整state JSON>`，参数固定顺序sgv、sg，各出现一次；只有空search表示无URL来源，非空时缺失、重复、未知键、空值、版本非字符串1均非法。只解析hash内的search，不触碰外层cache query。

沿用[#674严格本局schema](start-game-lobby-674.md)：真实文明/完整地图目录ID、所有选择与current、lobby、skipped/prefilled及false保持，不用local补URL缺字段。sg先独立解析为单个JSON值，再构造数字version=1的envelope；不把原字符串拼入外层JSON。解码前raw search UTF-8上限为3×4096+64字节，sg原始JSON加envelope固定开销不超过4096字节；检查坏百分号和UTF-8，URLSearchParams只实际解码一次。

编码包括完整null/空局和所有许可flags；再开一局用显式完整空局，不用删除query表达。没有新增步骤、机制覆盖、真实大厅或跨工具协议。

## 来源与写入

| 来源                | 当前界面                          | 允许写入                                               |
| ------------------- | --------------------------------- | ------------------------------------------------------ |
| 合法完整URL         | URL完整状态；优先于冲突local      | 验证后可同步local、canonical replace                   |
| 空search+合法local  | 沿#674完整恢复                    | 验证后canonical replace；无需重写相同local             |
| 空search+无local    | 空局                              | replace完整显式空局URL                                 |
| 非法URL或非法local  | 安全空态+固定中文提示，不回显输入 | 玩家动作前不改URL/local；非法URL不读取旧local          |
| 候选地图待目录验证  | 恢复中，禁止流程操作              | URL/local零写入                                        |
| 目录加载失败        | 保留候选，可重试/放弃             | 不当坏ID、不回退旧local、不写入                        |
| 玩家操作/reset/放弃 | 完整新状态                        | 提交后尝试写local并replace完整URL；storage拒绝仍可操作 |

新外部地址、浏览器back/forward重新执行来源规则；地址改变先遮蔽旧来源。自身replace仅在实际地址等于当前state canonical时确认，不对历史地址建忽略名单。replace不新增history。

## React与异步门控

首页专用hook保存address、纯计算递增epoch、revision、当前候选及允许发布状态。地址不同时有条件调整当前组件自己的session，使新session地址立即等于实际search；所有hooks顺序固定，不在effect同步setState，也不在render递增ref。自身canonical确认保留state/epoch，不再等待地图。

Home提供实时地址bridge：仅当实际hash仍在首页且search等于expected时允许读写发布；replace在navigate前再核对。这样浏览器已改hash而Router新prop未提交的间隙，旧effect也不能覆盖新URL或local。纯codec与functional updater不读window。

地图success/catch和旧onChange/retry/abandon捕获address+epoch，在enqueue前查实时bridge，并在functional updater再核当前pending/raw/attempt及代次；保留cleanup live。放弃/新地址/卸载/迟到promise不能覆盖新状态。持久化在effect；每个epoch/revision只尝试一次local写入，去重不屏蔽地址恢复。StrictMode不循环导航，不重复地图恢复。

## 验证

真实red在已交付#674公开构建：组队4v4→阿拉伯→中路→选文明后复制URL到 `browser.newContext()`，接收方旧版回模式，证明URL尚不自足。不能用共享local的新page代替独立context，也不能沿用#674刷新red。

- 纯codec保留合法事件roundtrip，拒绝缺/重/unknown参数、版本、坏percent/UTF-8/JSON、独立JSON注入式拼接、超长、ID/组合错误与双重编码。
- 实际hook覆盖URL/local冲突、storage异常、pending/失败零写、重试/未知ID、新地址与旧success/reject同act、同raw不同来源、旧UI回调、实时hash先于prop变化、canonical确认无重载、back曾写过的地址、卸载和StrictMode。
- 360/375/390/1280各自从新context分享完整组队选择/current；再以冲突local接收证明URL优先。非法URL保留原local字节与地址，首次玩家动作才替换。大厅和摘要reload、reset后新context仍空，history长度稳定、真实back/forward与outer query保留。
- 四宽接收后的对手/摘要图附PR；截图隐藏顶栏仅用于避免locator截图滚动伪影。无横溢、console error/pageerror，保留既有明暗主题与670/673/632/机制原断言。隔离fixture只清专用key，不清theme或全localStorage。

按实际消费者适用CI，不改策略求窄；独立finalPASS→准确PR CI→main/Pages→线上跨context功能→正式Release/tag/全部公开文件hash后关闭本项，再进入#671。
