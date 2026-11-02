import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Core } from '../../data';
import { civByEn } from '../../data';
import type { Trees } from '../../domain/types';
import type { TeamFitConfig } from '../../domain/teamFitQuery';
import { FIT_ROLES, projectTeamFit, fitToolLinks, type FitSource, type FitShape, type FitRoute } from '../../domain/teamFit';
import { playerTeamNote, teamPrereqLabel } from '../../domain/teamSourceLabels';
import { AGE_ZH, RES_ZH } from '../../domain/ratings';
import { Linked } from '../../shared/ui/widgets';

export interface TeamFitResultsProps {
  config: TeamFitConfig;
  core: Core;
  trees: Trees;
}
const name = (civ: string) => civByEn(civ)?.zh ?? civ;
function UnitLinks({ ids, core }: { ids: number[]; core: Core }) {
  return (
    <>
      {ids.map((id, index) => (
        <span key={id}>
          {index > 0 && '、'}
          <Link to={'/unit/' + id}>{core.unitById[id]?.zh ?? '单位详情'}</Link>
        </span>
      ))}
    </>
  );
}
function SourceCard({ row, core, reverse }: { row: FitSource; core: Core; reverse: boolean }) {
  const source = row.source;
  const isTech = typeof source.id === 'number';
  const tech = typeof source.id === 'number' ? core.techById[source.id] : undefined;
  const civ = 'civ' in source ? source.civ : source.civs[0]!;
  const title = tech?.zh ?? name(civ) + ' · 团队加成';
  const relations = row.relations.filter((r) => (reverse ? r.player === 1 : true)).filter((r) => r.direct.length || r.production.length || r.buildings.length);
  return (
    <article className="tf-source" data-testid={'fit-source-' + row.key}>
      <header>
        <h3>{title}</h3>
        <div className="tf-tags">
          <span className={row.isNew ? 'tf-tag tf-new' : 'tf-tag'}>{row.isNew ? '新增来源' : '已有来源'}</span>
          <span className="tf-tag">{isTech ? '需研究' : '常驻'}</span>
          <span className="tf-tag">
            {source.targetCoverage === 'complete' ? '目标已核对' : source.targetCoverage === 'partial' ? '部分已核对' : '目标待核实'}
          </span>
        </div>
      </header>
      <p>
        <Linked text={tech?.desc ?? civByEn(civ)?.tb ?? '原说明待核实'} />
      </p>
      <p className="tf-providers">
        提供者：
        {row.providers.map((provider, i) => (
          <span key={provider.player}>
            {i > 0 && '、'}
            <Link to={'/civ/' + provider.civ}>
              {provider.player === 1 ? '你' : '队友' + (provider.player - 1)} · {name(provider.civ)}
            </Link>
          </span>
        ))}
      </p>
      {'age' in source && (
        <p className="tf-condition">
          需进入{AGE_ZH[source.age]} · 在{core.buildingById[source.building]?.zh ?? '对应建筑'}研究 ·{' '}
          {Object.entries(source.cost).map(([res, value]) => (
            <span className="tf-number" key={res}>
              {value}
              {RES_ZH[res] ?? res}{' '}
            </span>
          ))}
          <span className="tf-number">{source.researchTime}秒</span>；未记录研究完成。
        </p>
      )}
      {!!row.unlocks.length && (
        <div className="tf-condition">
          <strong>条件开放 / 特殊提供：</strong>
          <UnitLinks ids={row.unlocks} core={core} />
          <p>{isTech ? '按此来源的研究条件与数量提供，不并入普通训练线。' : '开放不等于已完成升级；可研究与已研究分开。'}</p>
          {!isTech && source.notes.filter((note) => note.startsWith('关联科技编号')).map((note) => <p key={note}>{playerTeamNote(note, core, name(civ))}</p>)}
        </div>
      )}
      {relations.length > 0 && (
        <div className="tf-related-preview">
          {relations.map((r) => (
            <p key={r.player}>
              <strong>
                {r.player === 1 ? '你' : '队友' + (r.player - 1)} · {name(r.civ)}
              </strong>
              ：
              {r.direct.length ? (
                <>
                  <UnitLinks ids={r.direct.slice(0, 3)} core={core} />
                  {r.direct.length > 3 && <span className="tf-number">等{r.direct.length}项直接关联</span>}
                </>
              ) : r.buildings.length ? (
                <>
                  {r.buildings.slice(0, 3).map((id, i) => (
                    <span key={id}>
                      {i > 0 && '、'}
                      <Link to={'/building/' + id}>{core.buildingById[id]?.zh}</Link>
                    </span>
                  ))}
                  {r.buildings.length > 3 && <span className="tf-number">等{r.buildings.length}项建筑关联</span>}
                </>
              ) : (
                <span className="tf-number">{r.production.length}项生产地点关联</span>
              )}
            </p>
          ))}
        </div>
      )}
      {relations.length > 0 && (
        <details className="tf-detail">
          <summary>查看具体关联与提供者</summary>
          {relations.map((r) => (
            <div className="tf-relation" key={r.player}>
              <strong>
                {r.player === 1 ? '你' : '队友' + (r.player - 1)} · {name(r.civ)}
              </strong>
              {!!r.direct.length && (
                <p>
                  直接单位关联：
                  <UnitLinks ids={r.direct} core={core} />
                </p>
              )}
              {!!r.production.length && (
                <p>
                  生产地点关联：
                  <UnitLinks ids={r.production} core={core} />
                  ；不表示直接改变单位属性。
                </p>
              )}
              {!!r.buildings.length && (
                <p>
                  建筑关联：
                  {r.buildings.map((id, i) => (
                    <span key={id}>
                      {i > 0 && '、'}
                      <Link to={'/building/' + id}>{core.buildingById[id]?.zh}</Link>
                    </span>
                  ))}
                </p>
              )}
            </div>
          ))}
        </details>
      )}
      {source.targetCoverage !== 'complete' && <p className="note">已核对目标见关联；其余适用范围待核实，未列出不表示没有效果。</p>}
      <details className="tf-detail">
        <summary>原来源与解锁条件</summary>
        <Link to={isTech ? '/tech/' + source.id : '/civ/' + civ + '/bonus/team'}>查看原来源详情</Link>
        {'prerequisites' in source && source.prerequisites.length > 0 && (
          <p>前置：{source.prerequisites.map((id) => teamPrereqLabel(id, core)).join('、')}。</p>
        )}
        <ul>
          {source.notes.map((note) => (
            <li key={note}>{playerTeamNote(note, core, name(civ))}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
function Shape({ shape, core }: { shape: FitShape; core: Core }) {
  return (
    <div className="tf-shape" data-shape={shape.key}>
      <div>
        <Link to={'/unit/' + shape.unit.id}>{shape.unit.zh}</Link>
        {shape.transport && <span className="tf-tag">运输用途</span>}
      </div>
      <p className="note">{shape.providers.map((p) => name(p.civ)).join('、')}可选</p>
      <details>
        <summary>地点与研究条件</summary>
        <ul>
          {shape.locations.map((loc, index) => (
            <li key={index}>
              {name(loc.civ)} · <Link to={'/building/' + loc.building}>{core.buildingById[loc.building]?.zh ?? '目录地点'}</Link>
              {loc.techs.length ? <>；需研究{loc.techs.map((id) => core.techById[id]?.zh ?? '对应科技').join('、')}</> : '；完整树目录选项'}（
              <Link to={'/unit/' + loc.rawId}>单位详情</Link>）
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
function Route({ route, core, added }: { route: FitRoute; core: Core; added: boolean }) {
  const representatives = route.forms.filter((s) => route.terminalKeys.includes(s.key));
  return (
    <div className="tf-route">
      <span className={added ? 'tf-tag tf-new' : 'tf-tag'}>{added ? (route.isNewRoute ? '新增路线' : '新增形态') : '代表选项'}</span>
      {representatives.map((shape) => (
        <Shape key={shape.key} shape={shape} core={core} />
      ))}
      {route.forms.some((s) => !representatives.includes(s)) && (
        <details>
          <summary>本路线全部形态（{route.forms.length}）</summary>
          {route.forms.map((shape) => (
            <Shape key={shape.key} shape={shape} core={core} />
          ))}
        </details>
      )}
    </div>
  );
}
function Routes({ routes, core, added }: { routes: FitRoute[]; core: Core; added: boolean }) {
  const limit = added ? 3 : 2;
  return (
    <>
      {routes.slice(0, limit).map((route) => (
        <Route key={route.key} route={route} core={core} added={added} />
      ))}
      {routes.length > limit && (
        <details className="tf-more">
          <summary>
            查看{added ? '全部新增' : '已有完整清单'}（{routes.length}条路线）
          </summary>
          {routes.slice(limit).map((route) => (
            <Route key={route.key} route={route} core={core} added={added} />
          ))}
        </details>
      )}
    </>
  );
}
export default function TeamFitResults({ config, core, trees }: TeamFitResultsProps) {
  const projection = useMemo(() => projectTeamFit(core, trees, config), [core, trees, config]);
  const links = fitToolLinks(config)!;
  const reverse = projection.reverse.filter(
    (row) =>
      row.unlocks.length ||
      row.source.targetCoverage !== 'complete' ||
      row.relations.some((r) => r.player === 1 && (r.direct.length || r.production.length || r.buildings.length)),
  );
  return (
    <div className="tf-results" data-testid="team-fit-results">
      {config.mates.length === 0 && <p className="tf-solo">当前只有你的候选；以下查看自身潜力，加入队友后再比较新增。</p>}
      <div className="tf-source-grid">
        <section>
          <h2>{name(config.candidate)}带来的团队来源</h2>
          <p className="note">包含本人；已有同一来源保留提供者，不再新增一份效果。</p>
          {projection.forward.map((row) => (
            <SourceCard key={row.key} row={row} core={core} reverse={false} />
          ))}
        </section>
        <section>
          <h2>队友也能关联到候选</h2>
          {config.mates.length === 0 ? (
            <p className="tf-neutral">加入已定队友后查看反向关联。</p>
          ) : reverse.length === 0 ? (
            <p className="tf-neutral">当前来源中暂无已核对到候选的目标关联。</p>
          ) : (
            reverse.map((row) => <SourceCard key={row.key} row={row} core={core} reverse />)
          )}
        </section>
      </div>
      <section className="tf-units">
        <h2>兵种选择多了什么</h2>
        <p className="note">完整树的具体形态 · 编辑口径，非官方推荐。实际出兵与分工仍需另行约定。</p>
        <p className="note">
          比较步兵、骑兵、弓兵、攻城与对骑兵额外攻击；护甲分类可交叉，不含船只与非作战单位。僧侣等其他选择请查看文明详情。运输攻城单位单独标注。
        </p>
        {projection.directions.map((direction) => (
          <section className="tf-direction" key={direction.role} data-testid={'fit-role-' + direction.role}>
            <h3>{FIT_ROLES[direction.role]}</h3>
            {direction.added.length === 0 ? (
              <div className="tf-unchanged">
                <p className="note">
                  暂无新增形态{projection.candidate.some((shape) => shape.roles.includes(direction.role)) ? '；同形态仍可由候选提供。' : '。'}
                </p>
                {direction.existing.length > 0 ? (
                  <details className="tf-existing-list">
                    <summary>查看已有完整清单（{direction.existing.length}条路线）</summary>
                    {direction.existing.map((route) => (
                      <Route key={route.key} route={route} core={core} added={false} />
                    ))}
                  </details>
                ) : (
                  <p className="note">{config.mates.length ? '暂无本方向已核对形态' : '尚未加入队友'}</p>
                )}
              </div>
            ) : (
              <div className="tf-comparison">
                <div>
                  <h4>队友已可提供</h4>
                  {config.mates.length === 0 ? (
                    <p className="note">尚未加入队友</p>
                  ) : direction.existing.length ? (
                    <Routes routes={direction.existing} core={core} added={false} />
                  ) : (
                    <p className="note">暂无本方向已核对形态</p>
                  )}
                </div>
                <div>
                  <h4>{config.mates.length ? '候选可补充' : '候选可选'}</h4>
                  {direction.added.length ? (
                    <Routes routes={direction.added} core={core} added />
                  ) : (
                    <p className="note">暂无新增形态；同形态仍可由候选提供。</p>
                  )}
                </div>
              </div>
            )}
          </section>
        ))}
      </section>
      <aside className="tf-bottom">
        <p className="note">同一来源只汇总一次，不计算重复倍率；关联来自固定数据，未作客户端实测声明。</p>
        <div className="tf-actions">
          <Link className="btn" to={links.bonuses}>
            查看完整队伍加成
          </Link>
          {links.plan ? (
            <Link className="btn" to={links.plan}>
              带入团战分工
            </Link>
          ) : (
            <span className="note">加入至少一名队友后可带入团战分工。</span>
          )}
        </div>
        <p className="note">只带入实际文明；研究完成、兵种与任务均留空。</p>
      </aside>
    </div>
  );
}
