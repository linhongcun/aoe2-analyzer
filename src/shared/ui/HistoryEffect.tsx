import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CivUpdatesData, EntityRef, UpdateEffect, UpdateScope } from '../../domain/civUpdates';
import { TECH_EFFECT_LABELS } from '../../domain/techUpdates';
import { Icon } from './Icon';
import { UpdateText } from './CivUpdatePrimitives';
import './civ-updates.css';

function ChangeArrow() {
  return (
    <span className="civ-update-transition" role="img" aria-label="变为">
      <Icon name="arrow-right" />
    </span>
  );
}

function Quantity({ value, unit }: { value: number | null; unit?: string | null }) {
  return value === null ? (
    <>未知</>
  ) : (
    <span className="num nw">
      {value}
      {unit ? ` ${unit}` : ''}
    </span>
  );
}

function EntityLabel({ data, reference }: { data: CivUpdatesData; reference: EntityRef }) {
  if ('unresolvedName' in reference)
    return (
      <span>
        <UpdateText>{reference.unresolvedName}</UpdateText> <small>（尚未解析；暂无可确认的详情，历史身份待核）</small>
      </span>
    );
  const entity = data.entities.find((row) => row.id === reference.entityId)!;
  return (
    <span>
      {entity.linkPath ? <Link to={entity.linkPath}>{entity.nameZh}</Link> : entity.nameZh}
      {entity.status === 'retired' && <small>（退役身份）</small>}
    </span>
  );
}

export function ScopeText({ data, scope }: { data: CivUpdatesData; scope: UpdateScope }) {
  const name = (id: string) => data.civilizations.find((civ) => civ.civId === id)!.nameZh;
  const kind = { civ: '文明专属', team: '团队', global: '全局', unknown: '适用范围待核' }[scope.scopeKind];
  const beneficiaries = { self: '自身', allies: '队友', team: '团队成员', all: '全体', unknown: '未注明' }[scope.beneficiary];
  return (
    <p className="civ-update-scope">
      {kind} · 受益关系：{beneficiaries}
      {scope.providerCivIds.length > 0 && <> · 提供者：{scope.providerCivIds.map(name).join('、')}</>}
      {scope.affectedCivIds.length > 0 && <> · 明确适用：{scope.affectedCivIds.map(name).join('、')}</>}
      {scope.scopeKind === 'team' && !scope.affectedCivIds.length && ' · 受益文明未列明'}
      {scope.conditions.map((condition) => (
        <span key={condition}>
          {' '}
          · <UpdateText>{condition}</UpdateText>
        </span>
      ))}
    </p>
  );
}

export function HistoryEffect({ data, effect, fallbackScope }: { data: CivUpdatesData; effect: UpdateEffect; fallbackScope?: UpdateScope }) {
  const scope = effect.scope ?? fallbackScope;
  let content: ReactNode;
  switch (effect.type) {
    case 'numeric':
    case 'bonus': {
      const beforeUnit = effect.beforeUnit === undefined ? effect.unit : effect.beforeUnit;
      const afterUnit = effect.afterUnit === undefined ? effect.unit : effect.afterUnit;
      content = (
        <>
          <strong>{effect.attribute}</strong>
          <div className="civ-update-values">
            {effect.type === 'bonus' && effect.operation === 'absolute-discount' ? (
              <>
                本版绝对折扣 <Quantity value={effect.after} unit={afterUnit} />
                ；旧折扣：
                <Quantity value={effect.before} unit={beforeUnit} />
              </>
            ) : effect.before === null && effect.after === null && effect.delta !== null ? (
              <>
                变化量{' '}
                <span className="num nw">
                  {effect.delta > 0 ? '+' : ''}
                  {effect.delta}
                  {effect.unit ? ` ${effect.unit}` : ''}
                </span>
                ；前后值未知
              </>
            ) : (
              <>
                <Quantity value={effect.before} unit={beforeUnit} /> <ChangeArrow /> <Quantity value={effect.after} unit={afterUnit} />
              </>
            )}
          </div>
        </>
      );
      break;
    }
    case 'availability':
      content = (
        <>
          <strong>
            <UpdateText>{effect.text}</UpdateText>
          </strong>
          <p>
            可用性：{effect.before === null ? '此前未知' : effect.before ? '可用' : '不可用'} <ChangeArrow />{' '}
            {effect.after === null ? '此后未知' : effect.after ? '可用' : '不可用'}
          </p>
        </>
      );
      break;
    case 'rename':
      content = (
        <p>
          <strong>名称变化</strong>：{effect.beforeName} <ChangeArrow /> {effect.afterName}
        </p>
      );
      break;
    case 'lifecycle':
      content = (
        <p>
          <strong>{effect.action === 'introduced' ? '加入' : '退役'}</strong> · <UpdateText>{effect.text}</UpdateText>
        </p>
      );
      break;
    default:
      content = (
        <>
          <p>
            <UpdateText>{effect.text}</UpdateText>
          </p>
          {(effect.legacyBefore !== null || effect.legacyAfter !== null) && (
            <p>
              改动前：{effect.legacyBefore === null ? '未知' : <UpdateText>{effect.legacyBefore}</UpdateText>} <ChangeArrow /> 改动后：
              {effect.legacyAfter === null ? '未知' : <UpdateText>{effect.legacyAfter}</UpdateText>}
            </p>
          )}
        </>
      );
  }
  return (
    <div className="civ-update-effect" data-effect-type={effect.type}>
      {data.techs?.effectKinds[effect.id] && <p className="civ-update-pill">{TECH_EFFECT_LABELS[data.techs.effectKinds[effect.id]!]}</p>}
      <div className="civ-update-entities">
        {effect.entityRefs.map((reference, index) => (
          <Fragment key={index}>
            {index > 0 && '、'}
            <EntityLabel data={data} reference={reference} />
          </Fragment>
        ))}
      </div>
      {content}
      {effect.conditions.length > 0 && (
        <p className="civ-update-condition">
          条件：
          {effect.conditions.map((condition, index) => (
            <Fragment key={index}>
              {index > 0 && '；'}
              <UpdateText>{condition}</UpdateText>
            </Fragment>
          ))}
        </p>
      )}
      {scope && <ScopeText data={data} scope={scope} />}
    </div>
  );
}
