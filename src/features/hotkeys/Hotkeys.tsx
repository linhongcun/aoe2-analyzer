import { useRef, useState } from 'react';
import {
  HOTKEY_BINDING_LIMIT,
  HOTKEY_STORAGE_KEY,
  applyHotkeyEdits,
  emptyHotkeyState,
  findHotkeys,
  hotkeyBindingError,
  hotkeyCheckedAt,
  hotkeyMenuNote,
  hotkeyProfileNames,
  hotkeys,
  hotkeySources,
  parseHotkeyStorage,
  serializeHotkeyState,
  updateHotkeyBinding,
  type HotkeyEdit,
  type HotkeyProfile,
} from '../../domain/hotkeys';
import { Icon } from '../../shared/ui/Icon';
import './hotkeys.css';

function loadPersonalTable() {
  try {
    const loaded = parseHotkeyStorage(window.localStorage.getItem(HOTKEY_STORAGE_KEY));
    return {
      state: loaded.state,
      warning: loaded.status === 'invalid' ? '已保存的按键表损坏或版本不兼容，现显示空表。旧数据未自动覆盖；编辑或清空时将保存一份新表。' : '',
    };
  } catch {
    return { state: emptyHotkeyState(), warning: '浏览器存储不可用，当前内容尚未保存。仍可编辑和打印；关闭页面后可能丢失。' };
  }
}

export default function Hotkeys() {
  const [initial] = useState(loadPersonalTable);
  const [state, setState] = useState(initial.state);
  const [warning, setWarning] = useState(initial.warning);
  const [notice, setNotice] = useState('个人表保存在此浏览器中。');
  const [profile, setProfile] = useState<HotkeyProfile>('single');
  const [query, setQuery] = useState('');
  // 非法输入留在编辑框供修正，但不能替换上次合法值或进入存储。
  const [drafts, setDrafts] = useState<Record<HotkeyProfile, Record<string, string>>>({ single: {}, multi: {} });
  const pendingEdits = useRef<HotkeyEdit[]>([]);
  const actions = findHotkeys(query);
  const bindings = state.profiles[profile].bindings;
  const hasInvalidDraft = Object.keys(drafts[profile]).length > 0;

  const save = (edit: HotkeyEdit) => {
    pendingEdits.current.push(edit);
    let base = state;
    try {
      const latest = parseHotkeyStorage(window.localStorage.getItem(HOTKEY_STORAGE_KEY));
      if (latest.status === 'valid') base = latest.state;
    } catch {
      // 读取不可用仍可编辑；保留待保存操作，稍后重试不能丢掉此前编辑。
    }
    const next = applyHotkeyEdits(base, pendingEdits.current);
    setState(next);
    const raw = serializeHotkeyState(next);
    try {
      if (raw === null) throw new Error('invalid hotkey table');
      window.localStorage.setItem(HOTKEY_STORAGE_KEY, raw);
      pendingEdits.current = [];
      setWarning('');
      setNotice(`${hotkeyProfileNames[profile]}已保存到此浏览器。`);
    } catch {
      setWarning('浏览器存储不可用，当前修改尚未保存。仍可编辑和打印；关闭页面后可能丢失。');
      setNotice('本页内容已更新，但没有保存到浏览器。');
    }
  };

  const changeBinding = (id: string, value: string) => {
    const updated = updateHotkeyBinding(state, profile, id, value);
    setDrafts((old) => {
      const current = { ...old[profile] };
      if (updated.ok) delete current[id];
      else current[id] = value;
      return { ...old, [profile]: current };
    });
    if (updated.ok) save({ kind: 'set', profile, id, value });
    else setNotice('有按键说明尚未保存，请修正该输入后再打印。');
  };

  const clearCurrent = () => {
    setDrafts((old) => ({ ...old, [profile]: {} }));
    save({ kind: 'clear', profile });
  };

  return (
    <section className="pane hotkeys-page" aria-labelledby="hk-title" data-testid="hotkeys-page">
      <header className="hk-screen">
        <h1 id="hk-title">游戏快捷键速查</h1>
        <p className="note hk-scope">{hotkeyMenuNote}</p>
      </header>

      <div className="hk-screen hk-search">
        <label htmlFor="hk-query">搜索操作（中文、英文或常见用语）</label>
        <input
          id="hk-query"
          type="search"
          value={query}
          maxLength={120}
          placeholder="如 训练村民、Select all Town Centers"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="hk-count">
          <p className="note" role="status">
            <span className="num hk-number">
              {actions.length} / {hotkeys.length} 个操作
            </span>
          </p>
          {query && (
            <button type="button" onClick={() => setQuery('')}>
              清空搜索
            </button>
          )}
        </div>
      </div>

      <section className="hk-screen hk-controls" aria-label="个人表设置">
        <div className="hk-profile" aria-label="选择个人表">
          {(['single', 'multi'] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={profile === value}
              onClick={() => {
                setProfile(value);
                setNotice(`已切换到${hotkeyProfileNames[value]}。`);
              }}
            >
              {hotkeyProfileNames[value]}
            </button>
          ))}
        </div>
        <p className="note">
          两份表独立保存，每项最多 <span className="num hk-number">{HOTKEY_BINDING_LIMIT} 个字符</span>；打印包含当前表的全部操作。
        </p>
        <div className="hk-buttons">
          <button type="button" onClick={clearCurrent}>
            只清空当前{hotkeyProfileNames[profile]}
          </button>
          <button type="button" disabled={hasInvalidDraft} onClick={() => window.print()}>
            <Icon name="printer" />
            打印完整{hotkeyProfileNames[profile]}
          </button>
        </div>
        {warning && (
          <p className="hk-warning" role="alert">
            {warning}
          </p>
        )}
        {hasInvalidDraft && (
          <p className="hk-error" role="alert">
            当前表有无效输入，尚未保存该项。请修正输入或清空当前表；打印暂不可用。
          </p>
        )}
        <p className="hk-feedback" role="status" aria-live="polite">
          {notice}
        </p>
      </section>

      <div className="hk-screen hk-list">
        {actions.map((action) => {
          const value = drafts[profile][action.id] ?? bindings[action.id] ?? '';
          const error = hotkeyBindingError(value);
          return (
            <article key={action.id} data-action={action.id} className="hk-card" aria-labelledby={`hk-action-${action.id}`}>
              <div className="hk-description">
                <h2 id={`hk-action-${action.id}`}>{action.zh}</h2>
                <p className="hk-en" lang="en">
                  {action.en}
                </p>
              </div>
              <div className="hk-default">
                <span>默认键</span>
                <kbd>{action.defaultBinding}</kbd>
                {action.bindingContext && <span className="note">（{action.bindingContext}）</span>}
              </div>
              <div className="hk-personal">
                <label htmlFor={`hk-binding-${action.id}`}>我的按键</label>
                <input
                  id={`hk-binding-${action.id}`}
                  type="text"
                  value={value}
                  maxLength={HOTKEY_BINDING_LIMIT + 1}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="未填写"
                  aria-label={`我的按键：${action.zh}`}
                  aria-invalid={!!error}
                  aria-describedby={error ? `hk-error-${action.id}` : undefined}
                  onChange={(event) => changeBinding(action.id, event.target.value)}
                />
                {error && (
                  <p className="hk-error" role="alert" id={`hk-error-${action.id}`}>
                    {error}
                  </p>
                )}
              </div>
              <details className="hk-action-source">
                <summary>来源与说明</summary>
                <p>{action.context}</p>
                <p>{action.meaning}</p>
                <ul>
                  {action.sourceIds.map((id) => {
                    const source = hotkeySources.find((item) => item.id === id)!;
                    return (
                      <li key={id}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </article>
          );
        })}
        {!actions.length && (
          <div className="hk-empty" role="status">
            <h2>没有匹配的操作</h2>
            <p>本目录只收录常用操作。试试英文用语或中文关键词，也可以清空搜索查看全部。</p>
          </div>
        )}
      </div>

      <section className="hk-screen hk-audit" aria-label="来源与核实范围">
        <details>
          <summary>查看来源与核对说明</summary>
          <p className="note">
            核对日期：<span className="num hk-number">{hotkeyCheckedAt}</span>。默认键来源为官方教学与 KeyCombiner；官方补丁仅作快捷键相关改动参考。
          </p>
          <ul>
            {hotkeySources.map((source) => (
              <li id={`hk-source-${source.id}`} key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                <p className="note">{source.note}</p>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="hk-print" aria-label="打印完整个人表">
        <h1>游戏快捷键速查 · {hotkeyProfileNames[profile]}</h1>
        <p>
          此表包含全部 <span className="hk-number">{hotkeys.length} 个操作</span>，不受屏幕搜索限制。
        </p>
        <p>{hotkeyMenuNote}</p>
        <p>核对日期：{hotkeyCheckedAt}。官方补丁仅作快捷键相关改动参考。</p>
        {warning && <p>{warning}</p>}
        {hasInvalidDraft && <p>注意：当前表含有无效输入，标为“未保存输入”的内容尚未保存，请修正后重新打印。</p>}
        <table>
          <thead>
            <tr>
              <th>操作与上下文</th>
              <th>我的按键</th>
              <th>默认键与来源</th>
            </tr>
          </thead>
          <tbody>
            {hotkeys.map((action) => (
              <tr key={action.id} data-print-action={action.id}>
                <td>
                  <b>{action.zh}</b>
                  <br />
                  <span lang="en">{action.en}</span>
                  <p>{action.context}</p>
                </td>
                <td>
                  {drafts[profile][action.id] !== undefined ? (
                    <>
                      <b>未保存输入：</b>
                      {drafts[profile][action.id]}
                    </>
                  ) : (
                    bindings[action.id] || '未填写'
                  )}
                </td>
                <td>
                  <kbd>{action.defaultBinding}</kbd>
                  {action.bindingContext && <p>（{action.bindingContext}）</p>}
                  {action.sourceIds.map((id) => (
                    <p key={id}>{hotkeySources.find((source) => source.id === id)!.title}</p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>来源</h2>
        <ol>
          {hotkeySources.map((source) => (
            <li key={source.id}>
              {source.title}
              <br />
              {source.url}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
