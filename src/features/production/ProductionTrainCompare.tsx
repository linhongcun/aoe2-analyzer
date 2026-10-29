import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { civs, civByEn } from '../../data';
import type { ProductionContext } from '../../domain/production';
import { CostView } from '../../shared/ui/art';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import { commitUrl } from '../../shared/utils/dataInfo';
import { encodeTrainCompare, TRAIN_COMPARE_ENTRY, TRAIN_COMPARE_UNITS, type TrainCompareConfig } from './trainCompareCodec';
import { availableTrainingCivs, compareTraining } from './trainCompareModel';
import { CompareNumberText } from './CompareNumberText';

const num = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
export function ProductionTrainCompare({ context, config }: { context: ProductionContext; config: TrainCompareConfig }) {
  const location = useLocation(),
    navigate = useNavigate();
  const available = useMemo(() => availableTrainingCivs(context, config.unit), [context, config.unit]);
  const result = useMemo(() => compareTraining(context, { ...config, civs: config.civs ?? available }), [context, config, available]);
  const [draft, setDraft] = useState(String(config.n));
  const [observedSearch, setObservedSearch] = useState(location.search);
  if (observedSearch !== location.search) {
    setObservedSearch(location.search);
    setDraft(String(config.n));
  }
  const changed = draft !== String(config.n);
  const invalidDraft = !/^[1-9]\d*$/.test(draft) || !Number.isSafeInteger(+draft) || +draft < 1 || +draft > 1000;
  const { copy, status, manualLink, statusProps, reset } = useShareLink({
    stateKey: location.search,
    successMessage: '对照链接已复制，包含当前全部选择。',
    failureMessage: '自动复制失败，请手动复制下方完整链接。',
  });
  const resolved = { ...config, civs: result.civs };
  const update = (fields: Partial<TrainCompareConfig>) => {
    reset();
    navigate('/production?' + encodeTrainCompare({ ...resolved, ...fields }));
  };
  const share = () =>
    copy(() => {
      const url = new URL(window.location.href);
      url.hash = '/production?' + encodeTrainCompare(resolved);
      return url.href;
    });
  return (
    <section className="pane train-compare-page" data-testid="train-compare-page">
      <header className="train-compare-heading">
        <div>
          <h1>跨文明训练对照</h1>
          <p className="note">同一单位形态、同一座马厩，比较已选文明的训练间隔与费用。</p>
        </div>
        <div className="train-compare-actions">
          <button className="btn" type="button" disabled={changed || !!result.errors.length} onClick={() => void share()}>
            <Icon name="copy" />
            复制对照链接
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              reset();
              navigate(TRAIN_COMPARE_ENTRY);
            }}
          >
            重置对照
          </button>
        </div>
      </header>
      {!changed && status && (
        <p className="note" {...statusProps}>
          {status}
        </p>
      )}
      {!changed && manualLink && (
        <label className="train-compare-manual">
          手动复制对照链接
          <textarea aria-label="手动复制对照链接" value={manualLink} readOnly rows={3} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <div className="train-compare-settings">
        <label>
          对照单位
          <select aria-label="对照单位" value={config.unit} disabled={changed} onChange={(event) => update({ unit: +event.target.value })}>
            {TRAIN_COMPARE_UNITS.map((id) => (
              <option key={id} value={id}>
                {context.core.unitById[id]?.zh ?? id}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            reset();
            if (invalidDraft) {
              const params = new URLSearchParams(encodeTrainCompare(resolved));
              params.set('n', draft);
              navigate('/production?' + params.toString());
            } else update({ n: +draft });
          }}
        >
          <label>
            目标数量
            <input
              aria-label="目标数量"
              type="text"
              inputMode="numeric"
              value={draft}
              aria-invalid={invalidDraft}
              onChange={(event) => {
                setDraft(event.target.value);
                reset();
              }}
            />
          </label>
          <button className="btn" type="submit">
            应用数量
          </button>
        </form>
      </div>
      <p className="note">
        固定城堡时代，<span className="num nw">1 座马厩</span>。所选形态已解锁，且本时代可用的生产相关科技已研究；不计研究时间和费用。
      </p>
      <p className="note">
        {context.core.techById[315]?.zh}、{context.core.techById[493]?.zh}属于帝王时代科技，本城堡档不计入。
      </p>
      {changed && (
        <p className="note" role={invalidDraft ? 'alert' : 'status'}>
          <CompareNumberText text={invalidDraft ? '目标数量须为 1–1000 的整数，请修正后应用。' : '应用数量后更新对照。'} />
          当前未生成结果或可复制链接。
        </p>
      )}
      <details className="train-compare-selection">
        <summary>
          选择文明（已选 <span className="num nw">{result.civs.length} 个</span>）
        </summary>
        <div className="train-compare-actions">
          <button className="btn" type="button" disabled={changed} onClick={() => update({ civs: available })}>
            选择当前可用文明
          </button>
          <button className="btn" type="button" disabled={changed} onClick={() => update({ civs: [] })}>
            清空文明
          </button>
        </div>
        <div className="train-compare-civ-options">
          {civs.map((civ) => (
            <label key={civ.en}>
              <input
                type="checkbox"
                value={civ.en}
                checked={result.civs.includes(civ.en)}
                disabled={changed}
                onChange={(event) => update({ civs: event.target.checked ? [...result.civs, civ.en] : result.civs.filter((name) => name !== civ.en) })}
              />
              <span>
                {civ.zh}
                {!available.includes(civ.en) && <small>当前形态不可用</small>}
              </span>
            </label>
          ))}
        </div>
      </details>
      {!changed &&
        (result.errors.length ? (
          <p role="alert">
            <CompareNumberText text={result.errors.join(' ')} />
          </p>
        ) : !result.civs.length ? (
          <p className="note" data-testid="train-compare-empty">
            选择文明后对照。
          </p>
        ) : (
          <>
            <h2>训练对照结果</h2>
            {result.rows.length > 0 && (
              <table className="train-compare-table">
                <caption>
                  城堡时代 · <span className="num nw">1 座马厩</span> · 目标 <span className="num nw">{config.n} 个</span>
                </caption>
                <thead>
                  <tr>
                    <th scope="col">文明</th>
                    <th scope="col">单个间隔</th>
                    <th scope="col">单个费用</th>
                    <th scope="col">
                      <span className="num nw">{config.n} 个</span>总耗时
                    </th>
                  </tr>
                </thead>
                {result.rows.map((row) => (
                  <tbody key={row.civ} data-testid="train-compare-row" data-civ={row.civ}>
                    <tr>
                      <th scope="row">{civByEn(row.civ)?.zh ?? row.civ}</th>
                      <td>
                        <span className="num nw">{num(row.line.seconds)} 秒</span>
                      </td>
                      <td>
                        <span className="train-compare-cost">
                          <CostView c={row.line.cost} />
                        </span>
                      </td>
                      <td>
                        <span className="num nw">{num(row.total)} 秒</span>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="train-compare-details-cell">
                        <details>
                          <summary>来源与限制：{civByEn(row.civ)?.zh ?? row.civ}</summary>
                          <p>已计入训练/费用：{row.line.applied.join('；') || '固定单位基础训练时间与费用，无额外已计入项。'}</p>
                          <p>
                            城堡时代，所选形态已解锁；<span className="num nw">1 座马厩</span>，本时代可用生产相关科技已研究。
                          </p>
                          {row.warnings.length > 0 && (
                            <ul>
                              {row.warnings.map((warning) => (
                                <li key={warning}>
                                  <CompareNumberText text={warning} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </details>
                      </td>
                    </tr>
                  </tbody>
                ))}
              </table>
            )}
            {result.unavailable.length > 0 && (
              <section className="train-compare-unavailable-list" aria-label="不可用请求">
                <h3>所选形态不可用</h3>
                {result.unavailable.map((entry) => (
                  <div key={entry.civ} data-testid="train-compare-unavailable" data-civ={entry.civ}>
                    <b>{civByEn(entry.civ)?.zh ?? entry.civ}</b>
                    <p>{entry.reason}</p>
                    {entry.warnings?.map((warning) => (
                      <p key={warning}>
                        <CompareNumberText text={warning} />
                      </p>
                    ))}
                  </div>
                ))}
              </section>
            )}
          </>
        ))}
      <p className="note train-compare-boundary">
        时间为游戏时间。仅按资源充足、连续训练估算；不模拟资源短缺、队列空档、建筑建设或初始免费单位，不代表最优文明或实战训练保证。
      </p>
      <details className="train-compare-sources">
        <summary>固定数据来源</summary>
        <p>
          DE Update <span className="num nw">{__DATA_SOURCES__.patch.build}</span>（<span className="num nw">{__DATA_SOURCES__.patch.date}</span>
          ），本站数据核对：<span className="num nw">{__DATA_SOURCES__.updated}</span>。
        </p>
        <ul>
          {Object.entries(__DATA_SOURCES__.sources).map(([key, source]) => (
            <li key={key}>
              <a href={commitUrl(source)} target="_blank" rel="noopener noreferrer">
                {source.repo}
              </a>
              （<span className="num nw">{source.date}</span>）
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
