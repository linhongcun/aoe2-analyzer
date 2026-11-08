import { Icon } from '../../shared/ui/Icon';

/** 官方 Support 文章。updatedAt 用页面上的 Updated 日期，不猜发布日。 */
export const OFFICIAL_MULTIPLAYER_SOURCE = {
  title: '官方 Support：如何创建多人游戏',
  url: 'https://support.ageofempires.com/hc/en-us/articles/360047306372-How-do-I-create-a-multiplayer-match-in-Age-of-Empires-II-Definitive-Edition',
  updatedAt: '2026-01-16',
} as const;

/** T-West 公开手册。页面没有 Updated 行，checkedAt 是本站阅读日。 */
export const SD3_HANDBOOK_SOURCE = {
  title: 'T-West：Sudden Dessaster 3 公开手册',
  url: 'https://www.twestaoe.net/events/suddendessaster3',
  checkedAt: '2026-11-06',
} as const;

/** AoE Buddy 新闻页。updatedAt 用该页的 Updated 日期。 */
export const AOE_BUDDY_SD3_SOURCE = {
  title: 'AoE Buddy：Sudden Dessaster 3',
  url: 'https://aoebuddy.com/news/sudden-dessaster-3',
  updatedAt: '2026-10-11',
} as const;

export const VICTORY_MODE_COPY = {
  kicker: '胜利条件 / 游戏模式',
  title: '房间设置和赛事口径分开看',
  lead: '猝死、弑君和其他设置不能用征服示例代替。',
  conquestHeading: '征服',
  /** 与本局目标卡第一段保持同一句。 */
  conquest: '本页示例采用征服设置：通过军事与战略击败所有敌方，或让对方投降结束比赛。分数领先只是当前局势的一个提示，不是已经获胜。',
  suddenDeathHeading: '猝死（Sudden Death）',
  suddenDeath: '官方 Support 把它列为可另选的次要游戏模式：主城（home Town Center）被毁就会输掉，而且不能再建城镇中心。',
  regicideHeading: '弑君（Regicide）',
  regicide: '同一篇官方说明把它列为可另选的次要游戏模式：开局会生成一位国王，并额外带村民。失去国王即负。',
  sd3Heading: 'Sudden Dessaster 3',
  sd3: '主办方公开手册写：不能再建城镇中心；最后一座城镇中心被毁就会立刻输掉。这只说明该赛事图包。',
} as const;

export function victoryModeVisibleText(): string {
  return Object.values(VICTORY_MODE_COPY).join('\n');
}

export default function VictoryModesCard() {
  const copy = VICTORY_MODE_COPY;
  return (
    <section className="gg-modes" id="victory-modes" data-testid="victory-modes" aria-labelledby="victory-modes-title">
      <p className="gg-kicker gg-modes-kicker">
        <Icon name="scroll" />
        {copy.kicker}
      </p>
      <h2 id="victory-modes-title">{copy.title}</h2>
      <p>{copy.lead}</p>
      <h3>{copy.conquestHeading}</h3>
      <p>{copy.conquest}</p>
      <h3>{copy.suddenDeathHeading}</h3>
      <p>{copy.suddenDeath}</p>
      <h3>{copy.regicideHeading}</h3>
      <p>{copy.regicide}</p>
      <h3>{copy.sd3Heading}</h3>
      <p>{copy.sd3}</p>
      <div className="gg-mode-sources" aria-label="胜利条件出处">
        <section className="gg-source">
          <a href={OFFICIAL_MULTIPLAYER_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {OFFICIAL_MULTIPLAYER_SOURCE.title}
          </a>
          <p className="note">
            更新于{' '}
            <time className="gg-number nw" dateTime={OFFICIAL_MULTIPLAYER_SOURCE.updatedAt}>
              {OFFICIAL_MULTIPLAYER_SOURCE.updatedAt}
            </time>
          </p>
        </section>
        <section className="gg-source">
          <a href={SD3_HANDBOOK_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {SD3_HANDBOOK_SOURCE.title}
          </a>
          <p className="note">
            本站核对{' '}
            <time className="gg-number nw" dateTime={SD3_HANDBOOK_SOURCE.checkedAt}>
              {SD3_HANDBOOK_SOURCE.checkedAt}
            </time>
            。页面未标更新日。
          </p>
        </section>
        <section className="gg-source">
          <a href={AOE_BUDDY_SD3_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {AOE_BUDDY_SD3_SOURCE.title}
          </a>
          <p className="note">
            更新于{' '}
            <time className="gg-number nw" dateTime={AOE_BUDDY_SD3_SOURCE.updatedAt}>
              {AOE_BUDDY_SD3_SOURCE.updatedAt}
            </time>
            。同样写明不能另建城镇中心，最后一座被毁即负。
          </p>
        </section>
      </div>
    </section>
  );
}
