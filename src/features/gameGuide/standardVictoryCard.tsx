import { Link } from 'react-router-dom';
import { DetailSection } from '../../shared/ui/DetailBlocks';
import {
  ATHEISM_ID,
  BASE_COUNTDOWN,
  FLAG_RES,
  OFFICIAL_185872,
  RANKED_ENDING,
  RELIC_TIME_NAME,
  RELIC_TIME_RES,
  UGC_VICTORY_TIME,
  WONDER_TIME_NAME,
  WONDER_TIME_RES,
  opLabel,
  standardVictoryFacts,
  type ResourceRule,
  type StandardVictoryFacts,
} from './standardVictory';

const num = (value: string | number) => <span className="num nw gg-number">{value}</span>;

function ruleText(id: number, name: string, rule: ResourceRule) {
  const label = opLabel(rule.op);
  if (rule.state === 'value' && label && rule.value !== null) {
    return (
      <>
        资源 {num(id)}（{name}）在效果导出里{label} {num(rule.value)}
      </>
    );
  }
  if (rule.state === 'pending')
    return (
      <>
        资源 {num(id)}（{name}）的规则待确认
      </>
    );
  return (
    <>
      资源 {num(id)}（{name}）没有规则，要加多少待确认
    </>
  );
}

export default function StandardVictoryCard({ facts = standardVictoryFacts() }: { facts?: StandardVictoryFacts }) {
  const techHref = facts.techId === ATHEISM_ID ? `/tech/${facts.techId}` : null;
  const who = facts.civZh ? `${facts.civZh}无神论` : '无神论';
  const flagLabel = opLabel(facts.flag.op);
  return (
    <div data-testid="standard-victory">
      <DetailSection title="Standard 奇观与圣物倒计时" className="gg-modes">
        <p>Standard 是房间里可以另选的胜利设置。世界奇观，或收齐圣物，可以靠倒计时结束。它不是本页六张卡使用的征服示例，也不是天梯默认。</p>
        <p data-standard="ranked">官方教学写明，天梯对局在对手的村民、军事单位和生产建筑都被消灭时结束。那是征服口径。不要用奇观或圣物倒计时代替它。</p>

        <h3>基础倒计时</h3>
        <p data-standard="base">基础倒计时{BASE_COUNTDOWN}。站内没有按地图尺寸导出的秒数，具体秒数待确认。</p>
        <p className="note">公开百科有按地图尺寸排列的秒表。站内没有对应的 DE 导出，所以不抄那些秒数。</p>

        <h3>{who}</h3>
        <p data-standard="years">
          {facts.years === null ? (
            <>科技说明里的倒计时延长年数待确认。中英说明对不上时不写年数。</>
          ) : (
            <>科技说明里，世界奇观和圣物胜利的倒计时延长是 {num(`+${facts.years} 年`)}。</>
          )}
        </p>
        <p data-standard="official">
          同一条说明还写敌方圣物产生的资源 {facts.relicCutPercent === null ? '削减比例待确认' : num(`-${facts.relicCutPercent}%`)}。官方 Update{' '}
          {num(OFFICIAL_185872.build)}（
          <time className="gg-number nw" dateTime={OFFICIAL_185872.publishedAt}>
            {OFFICIAL_185872.publishedAt}
          </time>
          ）另写明：倒计时延长只加给敌方和中立玩家；多次研究后这段延长可以叠加；圣物收入削减也作用于与{facts.civZh ?? '该文明'}
          玩家中立的人。产金仍到圣物收益页看，这里不把收入换算成倒计时。
        </p>
        <p data-standard="effects">
          {facts.flag.state === 'value' && flagLabel && facts.flag.value !== null ? (
            <>
              效果导出里，无神论把资源 {num(FLAG_RES)} {flagLabel} {num(facts.flag.value)}。
            </>
          ) : (
            <>效果导出里，无神论的资源标志待确认。</>
          )}
          {ruleText(WONDER_TIME_RES, WONDER_TIME_NAME, facts.wonder)}；{ruleText(RELIC_TIME_RES, RELIC_TIME_NAME, facts.relic)}
          。这些资源值不是按地图尺寸的基础秒数。
        </p>
        <p className="community-tool-row">
          <Link className="community-tool-entry" to="/relic-income">
            圣物收益（只算产金）
          </Link>
          {techHref && facts.techZh ? (
            <Link className="community-tool-entry" to={techHref}>
              {facts.techZh}
            </Link>
          ) : (
            <span>无神论科技页待确认</span>
          )}
        </p>

        <div className="gg-mode-sources" aria-label="Standard 倒计时出处">
          <section className="gg-source">
            <a className="community-tool-entry" href={OFFICIAL_185872.url} target="_blank" rel="noopener noreferrer">
              {OFFICIAL_185872.title}
            </a>
            <p className="note">
              发布于{' '}
              <time className="gg-number nw" dateTime={OFFICIAL_185872.publishedAt}>
                {OFFICIAL_185872.publishedAt}
              </time>
              。原文：{OFFICIAL_185872.timer} {OFFICIAL_185872.stack} {OFFICIAL_185872.income}
            </p>
          </section>
          <section className="gg-source">
            <a className="community-tool-entry" href={RANKED_ENDING.url} target="_blank" rel="noopener noreferrer">
              {RANKED_ENDING.title}
            </a>
            <p className="note">
              本站核对{' '}
              <time className="gg-number nw" dateTime={RANKED_ENDING.checkedAt}>
                {RANKED_ENDING.checkedAt}
              </time>
              。页面未标更新日。原文：{RANKED_ENDING.quote}
            </p>
          </section>
          <section className="gg-source">
            <a className="community-tool-entry" href={UGC_VICTORY_TIME.url} target="_blank" rel="noopener noreferrer">
              {UGC_VICTORY_TIME.title}
            </a>
            <p className="note">
              Last-Modified{' '}
              <time className="gg-number nw" dateTime={UGC_VICTORY_TIME.lastModified}>
                {UGC_VICTORY_TIME.lastModified}
              </time>
              ，本站核对{' '}
              <time className="gg-number nw" dateTime={UGC_VICTORY_TIME.checkedAt}>
                {UGC_VICTORY_TIME.checkedAt}
              </time>
              。这里只采用资源 {num(WONDER_TIME_RES)}、{num(RELIC_TIME_RES)} 的名称。页面上的附加时间数字不写进本卡。
            </p>
          </section>
          <section className="gg-source">
            <p className="note">
              科技说明与效果导出：DE Update {num(facts.patchBuild ?? '待确认')}
              {facts.patchDate ? (
                <>
                  （<time dateTime={facts.patchDate}>{facts.patchDate}</time>）
                </>
              ) : null}
              。年数只在中英说明一致时显示。
            </p>
          </section>
        </div>
      </DetailSection>
    </div>
  );
}
