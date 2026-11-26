import { useRef, type ReactNode } from 'react';
import type { FormationEntityView, FormationScenarioView } from '../../../domain/civFormations';
import { Icon } from '../../../shared/ui/Icon';
import { FormationDecisionText, FormationText } from './FormationPresentation';
import './formation-scenarios.css';

interface FormationScenariosProps {
  anchor: string;
  scenarios: readonly FormationScenarioView[];
  openId: string | null;
  onChangeOpen: (id: string | null) => void;
  renderEntity: (row: FormationEntityView, scenarioId: string) => ReactNode;
}

export function FormationScenarios({ anchor, scenarios, openId, onChangeOpen, renderEntity }: FormationScenariosProps) {
  const chipRefs = useRef(new Map<string, HTMLButtonElement | null>());
  if (scenarios.length === 0) return null;

  const active = openId ? (scenarios.find((sc) => sc.id === openId) ?? null) : null;
  const grouped = scenarios.length >= 6;
  const opponentItems = grouped ? scenarios.filter((sc) => sc.group === 'opponent') : [];
  const conditionItems = grouped ? scenarios.filter((sc) => sc.group === 'condition') : [];
  const slotId = `${anchor}-scenario-panel`;
  const titleId = `${anchor}-scenario-title`;

  function closeAndFocusTrigger(scenarioId: string) {
    onChangeOpen(null);
    chipRefs.current.get(scenarioId)?.focus();
  }

  const renderChip = (sc: FormationScenarioView) => {
    const isOpen = active?.id === sc.id;
    return (
      <button
        key={sc.id}
        id={`${anchor}-chip-${sc.id}`}
        ref={(node) => {
          chipRefs.current.set(sc.id, node);
        }}
        type="button"
        className={`formation-chip${isOpen ? ' is-active' : ''}`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? slotId : undefined}
        onClick={() => onChangeOpen(isOpen ? null : sc.id)}
      >
        <span className="formation-chip-main">
          <span className="formation-chip-label">
            <FormationText text={sc.chipLabel} />
          </span>
          {sc.actionHint && (
            <span className="formation-chip-hint nw">
              <FormationText text={sc.actionHint} />
            </span>
          )}
        </span>
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="formation-chip-chev" />
      </button>
    );
  };

  return (
    <section className="formation-scenarios" aria-labelledby={`${anchor}-scenarios-title`}>
      <div className="formation-scenarios-head">
        <div className="formation-scenarios-title-row">
          <Icon name="compass" className="formation-scenarios-icon" />
          <h4 id={`${anchor}-scenarios-title`}>遇到哪种局面？</h4>
        </div>
        <p className="formation-scenarios-status">{active ? '已展开 1 项 · 再次点击或按 Esc 收起' : '默认收起 · 点选 1 个局面查看对应方案'}</p>
      </div>

      {grouped ? (
        <div className="formation-chip-groups">
          {opponentItems.length > 0 && (
            <div className="formation-chip-group">
              <p className="formation-chip-group-label">
                <Icon name="swords" className="formation-group-icon" />
                <span>
                  对手压力与克制（<span className="num nw">{opponentItems.length}</span>）
                </span>
              </p>
              <div className="formation-chip-list">{opponentItems.map(renderChip)}</div>
            </div>
          )}
          {conditionItems.length > 0 && (
            <div className="formation-chip-group">
              <p className="formation-chip-group-label">
                <Icon name="flag" className="formation-group-icon" />
                <span>
                  我方资源与阵线条件（<span className="num nw">{conditionItems.length}</span>）
                </span>
              </p>
              <div className="formation-chip-list">{conditionItems.map(renderChip)}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="formation-chip-list">{scenarios.map(renderChip)}</div>
      )}

      {active && (
        <div
          id={slotId}
          className="formation-scenario-panel"
          role="region"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              closeAndFocusTrigger(active.id);
            }
          }}
        >
          <div className="formation-slot-head">
            <div className="formation-slot-title-wrap">
              <span className="formation-slot-badge">{active.group === 'opponent' ? '对手压力' : '资源与阵线'}</span>
              <h5 id={titleId}>
                <FormationText text={active.title} />
              </h5>
            </div>
            <button type="button" className="formation-slot-close" onClick={() => closeAndFocusTrigger(active.id)}>
              <Icon name="x" className="formation-slot-close-icon" />
              <span>收起</span>
            </button>
          </div>

          <dl className="formation-slot-kv">
            <div>
              <dt>触发条件</dt>
              <dd>
                <FormationText text={active.when} />
              </dd>
            </div>
            {active.summary && (
              <div>
                <dt>行动结论</dt>
                <dd>
                  <FormationText text={active.summary} />
                </dd>
              </div>
            )}
          </dl>

          {active.adjustments.length > 0 && (
            <div className="formation-slot-blocks">
              {active.adjustments.map((block) => (
                <div key={block.id} className="formation-slot-block">
                  {active.adjustments.length >= 2 && (
                    <h6>
                      <FormationText text={block.when} />
                    </h6>
                  )}
                  {block.available ? (
                    <>
                      {block.text &&
                        (block.decision ? (
                          <FormationDecisionText action={block.text} decision={block.decision} />
                        ) : (
                          <p className="formation-slot-text">
                            <FormationText text={block.text} />
                          </p>
                        ))}
                      {block.candidateBoundary && (
                        <p className="formation-meta">
                          候选边界：
                          <FormationText text={block.candidateBoundary} />
                        </p>
                      )}
                      {block.fallback && (
                        <p className="formation-slot-fallback">
                          <b>兜底</b>
                          <span>
                            <FormationText text={block.fallback} />
                          </span>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="formation-slot-fallback">
                      <b>兜底</b>
                      <span>
                        <FormationText text={block.fallback ?? '这项补充资料暂不可用'} /> <span className="formation-meta">部分补充资料暂不可用</span>
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {active.branches.length > 0 && (
            <div className="formation-slot-blocks">
              {active.branches.map((branch) => (
                <div key={branch.id} className="formation-slot-block formation-slot-branch">
                  {(active.branches.length >= 2 || active.adjustments.length > 0) && (
                    <h6>
                      <FormationText text={branch.title} />
                    </h6>
                  )}
                  {branch.state === 'available' && branch.context && branch.decision ? (
                    <dl className="formation-slot-kv">
                      {[branch.context, branch.decision].map(({ label, text }) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>
                            <FormationText text={text} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="formation-slot-fallback">
                      <b>兜底</b>
                      <span>
                        <FormationText text={branch.partialFallback ?? '这项补充资料暂不可用'} /> <span className="formation-meta">部分补充资料暂不可用</span>
                      </span>
                    </p>
                  )}
                  <p className="formation-meta">
                    <FormationText text={branch.evidence} />
                  </p>
                </div>
              ))}
            </div>
          )}

          {active.supplementNotes.length > 0 && (
            <div className="formation-slot-blocks">
              {active.supplementNotes.map((note) => (
                <div key={note.sourceIndex} className="formation-slot-block">
                  {note.partialNotice ? (
                    <p className="formation-meta">部分补充资料暂不可用</p>
                  ) : (
                    <>
                      {note.condition && (
                        <p className="formation-slot-text">
                          <FormationText text={note.condition} />
                        </p>
                      )}
                      {note.choiceHint && <p className="formation-meta">按当前可用项按需选择</p>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {active.showPartialNotice && <p className="formation-meta">部分补充资料暂不可用</p>}

          {active.entities.length > 0 && (
            <ul className="formation-entities formation-slot-entities">
              {active.entities.map((row) => (
                <li key={`${row.kind}-${row.entity.id}-${row.rawOccurrence ?? 0}`}>{renderEntity(row, active.id)}</li>
              ))}
            </ul>
          )}

          {active.caveats.length > 0 && (
            <div className="formation-slot-caveats">
              {active.caveats.map((text, idx) => (
                <p key={idx} className="formation-slot-caveat">
                  <Icon name="triangle-alert" className="formation-caveat-icon" />
                  <span>
                    <b>边界提醒：</b>
                    <FormationText text={text} />
                  </span>
                </p>
              ))}
            </div>
          )}

          {active.fallbacks.length > 0 && (
            <div className="formation-slot-fallbacks">
              {active.fallbacks.map((fb, idx) => (
                <p key={idx} className="formation-slot-fallback">
                  <b>兜底</b>
                  <span>
                    <FormationText text={fb} />
                  </span>
                </p>
              ))}
            </div>
          )}

          {active.links.length > 0 && (
            <div className="formation-slot-links">
              {active.links.map(({ label, href }) => (
                <a key={href} href={href} target="_blank" rel="noreferrer">
                  <Icon name="external-link" className="formation-link-icon" />
                  <span>
                    <FormationText text={label} />
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
