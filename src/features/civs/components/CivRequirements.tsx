import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { TechIcon, UnitIcon } from '../../../shared/ui/art';
import { DATA_SOURCES, versionLabel } from '../../../shared/utils/dataInfo';
import { requirementToken, resolveRequirements, searchRequirements, type RequirementCondition, type RequirementContext } from '../../../domain/civRequirements';
import type { Tech, Unit } from '../../../domain/types';
import './civ-requirements.css';

export default function CivRequirements({
  context,
  conditions,
  onChange,
  share,
  stateKey,
}: {
  context: RequirementContext | null;
  conditions: RequirementCondition[];
  onChange: (conditions: RequirementCondition[]) => void;
  share: () => Promise<string>;
  stateKey: string;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'unit' | 'tech'>('all');
  const [feedback, setFeedback] = useState<{ key: string; status: string; link: string } | null>(null);
  const shareStatus = feedback?.key === stateKey ? feedback.status : '';
  const manualLink = feedback?.key === stateKey ? feedback.link : '';
  const input = useRef<HTMLInputElement>(null);
  const resolved = context ? resolveRequirements(conditions, context) : [];
  const selected = new Set(conditions.map((r) => r.token));
  const options = context && query.trim() ? searchRequirements(context, query, kind).filter((r) => !selected.has(requirementToken(r.ref))) : [];
  const shown = options.slice(0, 20);
  const copy = async () => {
    const link = await share();
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      setFeedback({ key: stateKey, status: '筛选链接已复制，包含全部条件。', link: '' });
    } catch {
      setFeedback({ key: stateKey, status: '自动复制失败，请复制下方链接。', link });
    }
  };
  const update = (next: RequirementCondition[]) => {
    onChange(next);
    setFeedback(null);
  };
  return (
    <section className="civ-requirements" data-testid="civ-requirements" aria-labelledby="requirements-title">
      <div className="requirements-heading">
        <div>
          <h2 id="requirements-title">必备单位与科技</h2>
          <p className="note">查找同时拥有全部项目的文明。单位按具体形态筛选，普通、精锐及替代单位分别选择。</p>
        </div>
        <button type="button" onClick={() => void copy()} disabled={!context}>
          <Icon name="copy" /> 复制筛选链接
        </button>
      </div>
      <div className="requirements-search">
        <label>
          搜索必备单位或科技
          <input
            ref={input}
            aria-label="搜索必备单位或科技"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如：游侠、血统、精锐掷矛手"
            disabled={!context}
          />
        </label>
        <label>
          条件类型
          <select aria-label="条件类型" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} disabled={!context}>
            <option value="all">单位与科技</option>
            <option value="unit">仅单位</option>
            <option value="tech">仅科技</option>
          </select>
        </label>
      </div>
      {!context ? (
        <p className="note" data-testid="requirements-loading" role="status">
          正在加载单位与科技条件…
        </p>
      ) : query.trim() ? (
        <div className="requirements-options" aria-label="可添加的条件">
          {shown.map(({ ref, entity }) => (
            <button
              type="button"
              key={requirementToken(ref)}
              aria-label={`添加${ref.kind === 'unit' ? '单位' : '科技'} ${entity.zh}`}
              onClick={() => {
                update([...conditions, { token: requirementToken(ref), ref }]);
                input.current?.focus();
              }}
            >
              {ref.kind === 'unit' ? <UnitIcon u={entity as Unit} /> : <TechIcon t={entity as Tech} />}
              <span>
                <b>{entity.zh}</b>
                <small>
                  {ref.kind === 'unit' ? '单位' : '科技'} · {entity.en} · {entity.bz.replace(/\n/g, '')}
                </small>
              </span>
              <Icon name="plus" />
            </button>
          ))}
          {!shown.length && (
            <p className="note" role="status">
              没有可添加的匹配项目，已选项目不会重复显示。
            </p>
          )}
          {options.length > shown.length && <p className="note">先显示前 {shown.length} 项，请继续输入完整名称缩小范围。</p>}
        </div>
      ) : (
        <p className="note requirements-search-note">输入中文、英文或拼音名称后添加条件；不会自动补齐科技或替换兵种。</p>
      )}
      <div className="requirements-selected" aria-label="已选组合条件">
        {context &&
          resolved.map((condition, index) => (
            <div className={`requirement-chip${condition.error ? ' invalid' : ''}`} key={`${condition.token}-${index}`} data-testid="requirement-chip">
              {condition.error ? (
                <span data-testid="requirement-invalid">
                  <b>无效条件：{condition.token || '空条件'}</b>
                  <small>{condition.error}</small>
                </span>
              ) : (
                <>
                  <span className="requirement-kind">{condition.ref!.kind === 'unit' ? '单位' : '科技'}</span>
                  <Link className="ulink" to={`/${condition.ref!.kind}/${condition.ref!.id}`}>
                    {condition.entity!.zh}
                  </Link>
                </>
              )}
              <button
                type="button"
                aria-label={
                  condition.error
                    ? `移除无效条件 ${condition.token || '空条件'}`
                    : `移除${condition.ref!.kind === 'unit' ? '单位' : '科技'} ${condition.entity!.zh}`
                }
                onClick={() => update(conditions.filter((_, i) => i !== index))}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        {conditions.length > 0 && (
          <button type="button" onClick={() => update([])}>
            清空组合条件
          </button>
        )}
      </div>
      {!conditions.length && <p className="note">尚未添加组合条件，当前仅按上方筛选显示文明。</p>}
      {shareStatus && (
        <p className="note" role="status">
          {shareStatus}
        </p>
      )}
      {manualLink && (
        <label className="requirements-manual">
          筛选链接
          <input readOnly value={manualLink} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      <p className="note requirements-version">可用性依据 {versionLabel(DATA_SOURCES)} 科技树；包含免费科技，不计队友解锁，不代表该兵种满科技。</p>
    </section>
  );
}
