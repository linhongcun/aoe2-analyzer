import type { CivFormationContent, FormationEvidenceLink } from '../../../domain/civFormations';
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

export function FormationTacticsFold({ route }: { route: Route }) {
  const hasDetails = Boolean(route.attack || route.defense || route.alternatives);
  if (!hasDetails) return null;
  return (
    <FormationFold id={`${formationAnchor(route.id)}-detail`} label="攻守配合与不默认加入" closeLabel="收起攻守配合与不默认加入">
      {route.attack && (
        <div>
          <h4>进攻怎样配合</h4>
          <p>
            <FormationText text={route.attack} />
          </p>
        </div>
      )}
      {route.defense && (
        <div>
          <h4>防守怎样配合</h4>
          <p>
            <FormationText text={route.defense} />
          </p>
        </div>
      )}
      {route.alternatives && (
        <div>
          <h4>为什么不默认加入</h4>
          <p>
            <FormationText text={route.alternatives} />
          </p>
        </div>
      )}
    </FormationFold>
  );
}

function SourceLinks({ source, links }: { source: Source | null; links?: readonly FormationEvidenceLink[] }) {
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
            <span>
              <FormationText text={label} />
            </span>
          </a>
        ))}
      </div>
    </>
  );
}

export function FormationEvidence({ route, source, links }: { route: Route; source: Source | null; links?: readonly FormationEvidenceLink[] }) {
  const displayLinks = links ?? route.evidence.links;
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
      <SourceLinks source={source} links={displayLinks} />
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

export function HistoricalFormationDetail({ route, source }: { route: Route; source: Source | null }) {
  const relocatedCaveats = (route.scenarios ?? []).flatMap((sc) =>
    (sc.caveats ?? []).map((caveat) => ({ title: sc.title ?? sc.chipLabel, text: caveat.text })),
  );
  return (
    <>
      <p>
        <FormationText text={route.condition} />
      </p>
      <HistoricalEntities route={route} />
      {route.reason && (
        <p>
          <FormationText text={route.reason} />
        </p>
      )}
      {route.limitation && (
        <p>
          <FormationText text={route.limitation} />
        </p>
      )}
      {relocatedCaveats.length > 0 && (
        <div>
          <h4>原记录补充边界</h4>
          <dl className="formation-adjustments">
            {relocatedCaveats.map(({ title, text }, index) => (
              <div key={`${title}-${index}`}>
                <dt>
                  <FormationText text={title} />
                </dt>
                <dd>
                  <FormationText text={text} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {route.attack && (
        <div>
          <h4>进攻怎样配合</h4>
          <p>
            <FormationText text={route.attack} />
          </p>
        </div>
      )}
      {route.defense && (
        <div>
          <h4>防守怎样配合</h4>
          <p>
            <FormationText text={route.defense} />
          </p>
        </div>
      )}
      {(route.adjustments ?? []).length > 0 && (
        <div>
          <h4>对手变化时怎样调整</h4>
          <dl className="formation-adjustments">
            {route.adjustments!.map(({ id, when, text, decision, fallback }) => (
              <div key={id} className={decision ? 'formation-adjustment-decision' : undefined}>
                <dt>
                  <FormationText text={when} />
                </dt>
                <dd>
                  {decision ? <FormationDecisionText action={text} decision={decision} /> : <FormationText text={text} />}
                  {fallback && (
                    <span className="formation-meta">
                      {' 兜底：'}
                      <FormationText text={fallback} />
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {(route.conditionBranches ?? []).length > 0 && (
        <div>
          <h4>条件分支</h4>
          <dl className="formation-adjustments">
            {route.conditionBranches!.map((branch) => (
              <div key={branch.id}>
                <dt>
                  <FormationText text={branch.title} />
                </dt>
                <dd>
                  <p>
                    <b>{branch.context.label}：</b>
                    <FormationText text={branch.context.text} />
                  </p>
                  <p>
                    <b>{branch.decision.label}：</b>
                    <FormationText text={branch.decision.text} />
                  </p>
                  <p className="formation-meta">
                    <FormationText text={branch.evidence} />
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {route.alternatives && (
        <div>
          <h4>为什么不默认加入</h4>
          <p>
            <FormationText text={route.alternatives} />
          </p>
        </div>
      )}
      <FormationEvidence route={route} source={source} />
    </>
  );
}
