import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  baselineChanceText,
  baselineIntervalText,
  CONVERSION_ANCHOR,
  conversionFacts,
  DEVOTION_ID,
  FAITH_ID,
  formatSigned,
  MONK_ID,
  showsConversion,
  UPDATE_99311,
  type ConversionTech,
  type ConversionTechSource,
} from '../conversion';
import { DAT, type DatFile } from '../../../domain/datEffects';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';

const numerals = (text: string) =>
  text.split(/(\d+(?:\.\d+)?%?)/).map((part, index) =>
    /\d/.test(part) ? (
      <span key={index} className="num nw">
        {part}
      </span>
    ) : (
      part
    ),
  );

function TechDelta({ tech, field }: { tech: ConversionTech; field: 'devotion' | 'faith' }) {
  return (
    <>
      <p>
        <Link className="community-tool-entry" to={`/tech/${tech.id}`}>
          {tech.zh}
        </Link>
        ：最短招降时间{' '}
        <span className="num nw" data-conversion={`${field}-min`}>
          {formatSigned(tech.delta.min)}
        </span>
        ，最长招降时间{' '}
        <span className="num nw" data-conversion={`${field}-max`}>
          {formatSigned(tech.delta.max)}
        </span>
        。
      </p>
      <p className="note">游戏内说明：{numerals(tech.desc)}这是平均时间的近似说法，不是另一套数值。</p>
    </>
  );
}

export function ConversionMechanics({ unitId, techs, source = DAT }: { unitId: number; techs: readonly ConversionTechSource[]; source?: DatFile }) {
  const location = useLocation();
  const shown = showsConversion(unitId);
  useEffect(() => {
    if (!shown || location.hash !== `#${CONVERSION_ANCHOR}`) return;
    document.getElementById(CONVERSION_ANCHOR)?.scrollIntoView({ block: 'start' });
  }, [shown, location.hash]);
  if (!shown) return null;
  const facts = conversionFacts(techs, source);
  return (
    <div id={unitId === MONK_ID ? CONVERSION_ANCHOR : undefined}>
      <DetailSection title="招降机制">
        <p>
          官方 Update <span className="num nw">{UPDATE_99311.build}</span>（<span className="num nw">{UPDATE_99311.date}</span>
          ）记载的基准招降间隔与概率如下。
        </p>
        <dl className="detail-cost-grid">
          <div>
            <dt>基准间隔</dt>
            <dd data-conversion="interval">
              <span className="num nw">{baselineIntervalText()}</span>
            </dd>
          </div>
          <div>
            <dt>基准概率</dt>
            <dd data-conversion="chance">
              <span className="num nw">{baselineChanceText()}</span>
            </dd>
          </div>
        </dl>
        <p className="note" data-conversion="baseline-status">
          待确认（无站内 DAT）
        </p>
        {facts.devotion ? <TechDelta tech={facts.devotion} field="devotion" /> : <p data-conversion="devotion-pending">虔诚的最短、最长增量待确认。</p>}
        {facts.faith ? <TechDelta tech={facts.faith} field="faith" /> : <p data-conversion="faith-pending">信念的最短、最长增量待确认。</p>}
        <p className="note">
          最短与最长增量来自 effects.json 资源 <span className="num nw">178</span>（最短）和资源 <span className="num nw">179</span>（最长）。
          {facts.matchesOfficial ? '当前站内增量与 Update 99311 的记载相同。' : '当前增量以站内数据为准。'}
        </p>
        <p className="note" data-conversion="resistance">
          部分单位另有抗性。待确认。
        </p>
        <p className="note">
          数据版本：DE <span className="num nw">{DATA_SOURCES.patch?.build ?? '待确认'}</span>。游戏内「更难」百分比只作平均时间的近似说法。
        </p>
        <p>
          <a className="community-tool-entry" href={UPDATE_99311.url} target="_blank" rel="noreferrer">
            Update <span className="num nw">{UPDATE_99311.build}</span>（<span className="num nw">{UPDATE_99311.date}</span>）
          </a>{' '}
          <Link className="community-tool-entry" to={`/tech/${facts.devotion?.id ?? DEVOTION_ID}`}>
            {facts.devotion?.zh ?? '虔诚'}
          </Link>{' '}
          <Link className="community-tool-entry" to={`/tech/${facts.faith?.id ?? FAITH_ID}`}>
            {facts.faith?.zh ?? '信念'}
          </Link>{' '}
          <Link className="community-tool-entry" to="/about-data">
            数据说明
          </Link>
        </p>
      </DetailSection>
    </div>
  );
}
