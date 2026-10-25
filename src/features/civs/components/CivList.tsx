import { ListHead } from '../../../shared/ui/layout';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { civs } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import { TYPE_ZH } from '../../../domain/ratings';
import type { CivType } from '../../../domain/types';
import { CivIcon } from '../../../shared/ui/art';
import { DlcBar, SearchInput } from '../../../shared/ui/widgets';
import CatalogFilters from '../../../shared/ui/CatalogFilters';
import { useSticky } from '../../../shared/utils/sticky';
import { filterCivs } from '../logic/filter';
import {
  EMPTY_CIV_FILTERS,
  filterCivsByRequirements,
  readCivRequirements,
  resolveRequirements,
  writeCivRequirements,
  type CivRequirementFilters,
  type RequirementCondition,
} from '../../../domain/civRequirements';
import CivRequirements from './CivRequirements';

export default function CivList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const core = useCore(),
    trees = useTrees();
  const [stickyQ, setQ] = useSticky('civ.q', ''),
    [stickyTy, setTy] = useSticky('civ.ty', ''),
    [stickyPos, setPos] = useSticky('civ.pos', ''),
    [stickyDlc, setDlc] = useSticky('civ.dlc', '');
  const { filters, conditions, owned } = readCivRequirements(params, { q: stickyQ, ty: stickyTy, pos: stickyPos, dlc: stickyDlc });
  const { q, ty, pos, dlc } = filters;
  const context = core && trees ? { units: core.units, techs: core.techs, trees } : null;
  const invalid = context ? resolveRequirements(conditions, context).some((r) => !!r.error) : false;
  const loading = !context && conditions.length > 0;
  const legacy = filterCivs(civs, filters);
  const r = conditions.length ? (context ? filterCivsByRequirements(legacy, conditions, context) : []) : legacy;
  const update = (nextFilters: CivRequirementFilters, nextConditions: RequirementCondition[]) => {
    setQ(nextFilters.q);
    setTy(nextFilters.ty);
    setPos(nextFilters.pos);
    setDlc(nextFilters.dlc);
    if (owned || nextConditions.length > 0) setParams(writeCivRequirements(params, nextFilters, nextConditions), { replace: true });
  };
  const changeFilter = (values: Partial<CivRequirementFilters>) => update({ ...filters, ...values }, conditions);
  return (
    <section id="list" className="pane">
      <ListHead title="文明" desc="56 个文明 · 按类型、DLC、团战位置与必备单位、科技组合筛选" />
      <CatalogFilters
        search={<SearchInput id="q" value={q} onChange={(q) => changeFilter({ q })} placeholder="搜索文明（中/英）" />}
        count={
          <span id="cnt">
            {loading ? '加载中' : invalid ? '条件无效' : r.length} / {civs.length}
          </span>
        }
        active={[ty, pos, dlc].filter(Boolean).length + conditions.length}
        dirty={Boolean(q || ty || pos || dlc || conditions.length)}
        onReset={() => update(EMPTY_CIV_FILTERS, [])}
      >
        <select id="ty" aria-label="文明类型" value={ty} onChange={(e) => changeFilter({ ty: e.target.value })}>
          <option value="">全部类型</option>
          {(['cav', 'arch', 'inf', 'naval', 'monk', 'siege', 'def'] as CivType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_ZH[t]}
            </option>
          ))}
        </select>
        <select id="pos" aria-label="团战位置" value={pos} onChange={(e) => changeFilter({ pos: e.target.value })}>
          <option value="">全部位置</option>
          <option value="fl">适合边位 Flank (7分及以上)</option>
          <option value="pk">适合口袋 Pocket (7分及以上)</option>
        </select>
      </CatalogFilters>
      <DlcBar value={dlc} onChange={(dlc) => changeFilter({ dlc })} />
      <CivRequirements
        context={context}
        conditions={conditions}
        stateKey={writeCivRequirements(params, filters, conditions).toString()}
        onChange={(next) => update(filters, next)}
        share={async () => {
          const url = new URL(window.location.href);
          url.hash = '/civs?' + writeCivRequirements(params, filters, conditions).toString();
          return url.href;
        }}
      />
      {invalid && (
        <p className="requirements-blocked" data-testid="requirements-blocked" role="alert">
          组合含无效条件，暂不显示文明。请移除上方无效项目或清空组合条件后再查询。
        </p>
      )}
      <div id="grid">
        {loading ? (
          <p className="note" role="status">
            正在核对科技树可用性，请稍候。
          </p>
        ) : invalid ? null : r.length ? (
          r.map((c) => (
            <div className="card" key={c.en} data-civ={c.en} onClick={() => nav('/civ/' + c.en)}>
              <CivIcon c={c} />
              <h3>{c.zh}</h3>
              <small>{c.en}</small>
              <div>
                {c.ty.map((t) => (
                  <span key={t} className="tag">
                    {TYPE_ZH[t]}
                  </span>
                ))}
              </div>
              <div className="mini">
                边位 {c.fl} · 口袋 {c.pk}
              </div>
            </div>
          ))
        ) : (
          <p>无匹配文明</p>
        )}
      </div>
    </section>
  );
}
