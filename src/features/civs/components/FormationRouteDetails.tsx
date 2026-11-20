import type { ReactNode } from 'react';
import type { CivFormationContent, FormationAdjustmentView } from '../../../domain/civFormations';
import { AGE_ZH } from '../../../domain/ratings';
import { FormationDecisionText, FormationFold, FormationText } from './FormationPresentation';
import { formationAnchor } from './useFormationNavigation';

type Source = CivFormationContent['source'];
type Route = CivFormationContent['routes'][number];

export function Version({ patch }: { patch: Route['patch'] }) {
  return (
    <>
      <span className="num nw">DE {patch.build}</span> <span className="num nw">（{patch.date}）</span>
    </>
  );
}

export function StatusBadges({ route, grouped }: { route: Route; grouped: boolean }) {
  const recognition = route.status === 'candidate' ? '限定候选' : '讨论认可';
  const isAgeProgression = route.presentation === 'age-progression';
  const playtest =
    route.playtest === 'reported'
      ? '用户报告用过'
      : route.playtest === 'pending'
        ? '待实战验证'
        : route.presentation === 'separate-support'
          ? '未报告实战'
          : grouped || isAgeProgression
            ? '未说明实战使用'
            : '实战未说明';
  return (
    <div className="formation-status" aria-label="路线状态">
      <span className={route.status === 'candidate' ? 'formation-status-candidate' : ''}>{recognition}</span>
      <span>{playtest}</span>
      {isAgeProgression && (
        <span>
          <FormationText text={route.evidence.scope} />
        </span>
      )}
    </div>
  );
}

export function FormationDetail({ route, adjustments, support }: { route: Route; adjustments: FormationAdjustmentView[]; support?: ReactNode }) {
  const hasDetails = route.attack || route.defense || adjustments.length > 0 || route.alternatives || support;
  if (!hasDetails) return null;
  const expanded = route.presentation === 'age-progression';
  const Heading = expanded ? 'h5' : 'h4';
  const details = (
    <>
      {route.attack && (
        <div>
          <Heading>进攻怎样配合</Heading>
          <p>
            <FormationText text={route.attack} />
          </p>
        </div>
      )}
      {route.defense && (
        <div>
          <Heading>防守怎样配合</Heading>
          <p>
            <FormationText text={route.defense} />
          </p>
        </div>
      )}
      {adjustments.length > 0 && (
        <>
          <Heading>对手变化时怎样调整</Heading>
          <dl className="formation-adjustments">
            {adjustments.map(({ id, when, text, decision, unavailable, candidateBoundary }) => (
              <div key={id} className={decision ? 'formation-adjustment-decision' : undefined}>
                <dt>
                  <FormationText text={when} />
                </dt>
                <dd>
                  {text && (decision ? <FormationDecisionText action={text} decision={decision} /> : <FormationText text={text} />)}
                  {candidateBoundary && (
                    <span className="formation-meta">
                      {' 候选边界：'}
                      <FormationText text={candidateBoundary} />
                    </span>
                  )}
                  {unavailable && <span className="formation-meta"> 这项补充资料暂不可用</span>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {support}
      {route.alternatives && (
        <>
          <Heading>为什么不默认加入</Heading>
          <p>
            <FormationText text={route.alternatives} />
          </p>
        </>
      )}
    </>
  );
  if (expanded) {
    return (
      <section className="formation-expanded-group">
        <h4>攻守与对手调整</h4>
        {details}
      </section>
    );
  }
  return (
    <FormationFold id={`${formationAnchor(route.id)}-detail`} label="查看攻守与调整" closeLabel="收起攻守与调整">
      {details}
    </FormationFold>
  );
}

function SourceLinks({ source, links }: { source: Source | null; links: Route['evidence']['links'] }) {
  if (!source) return <p className="formation-meta">来源链接暂不可用。</p>;
  return (
    <>
      <p>
        <FormationText text={source.boundary} />
      </p>
      <div className="formation-source-links">
        <a href={source.content} target="_blank" rel="noreferrer">
          查看固定内容来源
        </a>
        <a href={source.discussion} target="_blank" rel="noreferrer">
          原讨论
        </a>
        {links?.map(({ label, href }) => (
          <a key={href} href={href} target="_blank" rel="noreferrer">
            <FormationText text={label} />
          </a>
        ))}
      </div>
    </>
  );
}

export function FormationEvidence({ route, source }: { route: Route; source: Source | null }) {
  return (
    <>
      <dl className="formation-evidence">
        <div>
          <dt>认可状态</dt>
          <dd>
            <FormationText text={route.evidence.recognition} />
          </dd>
        </div>
        <div>
          <dt>实战使用</dt>
          <dd>
            <FormationText text={route.evidence.playtest} />
          </dd>
        </div>
        <div>
          <dt>依据范围</dt>
          <dd>
            <FormationText text={route.evidence.scope} />
          </dd>
        </div>
        <div>
          <dt>记录时版本</dt>
          <dd>
            <FormationText text={route.evidence.recordedVersion} />
          </dd>
        </div>
        <div>
          <dt>核对数据</dt>
          <dd>
            <Version patch={route.patch} />
          </dd>
        </div>
        <div>
          <dt>内容修订</dt>
          <dd>
            <time className="num nw" dateTime={route.revised}>
              {route.revised}
            </time>
          </dd>
        </div>
      </dl>
      <SourceLinks source={source} links={route.evidence.links} />
    </>
  );
}

export function HistoricalEntities({ route }: { route: Route }) {
  return (
    <>
      <h4>原记录组成（非当前推荐）</h4>
      <ul>
        {[
          ...route.required,
          ...route.prerequisites,
          ...(route.choices ?? []).flatMap((choice) => choice.entities),
          ...route.supplements.flatMap((group) => group.entities),
        ].map((row, index) => (
          <li key={`${row.kind}-${row.id}-${index}`}>
            <FormationText text={`${row.historicalName} · ${row.role}`} />
            {row.age ? `（${AGE_ZH[row.age]}）` : ''}
          </li>
        ))}
      </ul>
    </>
  );
}
