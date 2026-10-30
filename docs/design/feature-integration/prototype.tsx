import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCore, loadTrees } from '../../../src/data';
import { Icon } from '../../../src/shared/ui/Icon';
import type { ProductionConfig, ProductionContext } from '../../../src/domain/production';
import type { EcoPayoffConfig } from '../../../src/domain/ecoPayoff';
import { AGE_ZH } from '../../../src/domain/ratings';
import { readState, stateHash, initial, type State, type View } from './state';
import { Avatar, Go, productHref } from './ui';
import { modelFor } from './model';
import { UnitView } from './UnitView';
import { ProductionView } from './ProductionView';
import { PayoffView } from './PayoffView';
import './prototype.css';

function App({ ctx }: { ctx: ProductionContext }) {
  const [state, setState] = useState(readState);
  const [dark, setDark] = useState(false);
  const [shared, setShared] = useState('');
  const [manualLink, setManualLink] = useState('');
  useEffect(() => {
    const restore = () => {
      try {
        setState(readState());
        setShared('');
      } catch (error) {
        setShared(String(error));
      }
    };
    window.addEventListener('hashchange', restore);
    return () => window.removeEventListener('hashchange', restore);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  function write(next: State, push = false) {
    window.history[push ? 'pushState' : 'replaceState'](null, '', stateHash(next));
    setState(next);
    setShared('');
    setManualLink('');
    if (push) requestAnimationFrame(() => document.getElementById('page-title')?.focus());
  }
  const model = modelFor(ctx, state);
  const { config, payoff, result, own, enemy, sourceOwn, eligible, known, payoffResult } = model;
  const { view } = state;
  const updateConfig = (patch: Partial<ProductionConfig>) => write({ ...state, config: { ...config, ...patch }, people: 'none' });
  const nextState = (next: View): State => {
    if (next === 'payoff' && state.people !== 'none') return { ...state, view: next };
    if (next === 'payoff' && view !== 'payoff') {
      const target = eligible.find((t) => t.id === payoff.target) ?? eligible.find((t) => !t.pre) ?? eligible[0];
      return {
        ...state,
        view: next,
        people: 'none',
        payoff: {
          ...payoff,
          civ: config.civ,
          age: config.age,
          known,
          target: target?.id ?? payoff.target,
          distance: String(config.walk),
          workers: { Food: '0', Wood: '0', Gold: '0', Stone: '0' },
        },
      };
    }
    return { ...state, view: next };
  };
  const visit = (next: View) => write(nextState(next), true);
  const previewHref = (next: View) => stateHash(nextState(next));
  const stageLink = (next: View, children: ReactNode, className = '') =>
    next !== view && result.errors.length ? (
      <span className={className} aria-disabled="true">
        {children}
      </span>
    ) : (
      <a
        className={className}
        aria-current={view === next ? 'page' : undefined}
        href={previewHref(next)}
        onClick={(event) => {
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
            event.preventDefault();
            visit(next);
          }
        }}
      >
        {children}
      </a>
    );
  const copy = async () => {
    const link = new URL(window.location.href);
    link.hash = stateHash(state);
    try {
      await navigator.clipboard.writeText(link.href);
      setShared('原型链接已复制，包含当前方案和返回情境。');
    } catch {
      setManualLink(link.href);
      setShared('请手动复制原型链接。');
    }
  };
  const applyTheory = () =>
    write({
      ...state,
      people: 'theory',
      payoff: { ...payoff, workers: Object.fromEntries(result.resources.map((r) => [r.key, String(r.rounded)])) as EcoPayoffConfig['workers'] },
    });
  const updatePayoff = (patch: Partial<EcoPayoffConfig>) => write({ ...state, payoff: { ...payoff, ...patch } });
  const viewProps = { ctx, state, model, write, stageLink, updateConfig, updatePayoff, applyTheory };
  const stageNames: Record<View, string> = { unit: '单位资料', production: '持续生产', payoff: '经济科技收益' };
  return (
    <>
      <a
        href="#page-title"
        className="skip"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('page-title')?.focus();
        }}
      >
        跳到内容
      </a>
      <div className="prototype-bar">
        <span>
          <span className="status-dot" />
          交互设计原型<span className="wide-only"> · 现有工具之间的连续分析</span>
        </span>
        <a href="./SPEC.md">
          完整方案 <Go />
        </a>
      </div>
      <header className="site-header">
        <div className="site-inner">
          <a href={productHref('/')} className="brand">
            <Icon name="shield" />
            <span>
              帝国时代 II <b>分析器</b>
            </span>
          </a>
          <span className="header-note wide-only">查资料、比较方案、验证投入</span>
          <button className="icon-button" aria-label={dark ? '切换浅色主题' : '切换深色主题'} onClick={() => setDark(!dark)}>
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>
      <main>
        <nav className="breadcrumbs" aria-label="位置">
          <a href={productHref('/')}>首页</a>
          <Icon name="chevron-right" />
          <span>经济计算</span>
          <Icon name="chevron-right" />
          <span>{stageNames[view]}</span>
        </nav>
        <div className="page-heading">
          <div>
            <p className="eyebrow">同一个问题，继续往下分析</p>
            <h1 id="page-title" tabIndex={-1}>
              {stageNames[view]}
            </h1>
            <p className="muted">
              {view === 'production'
                ? '知道想出什么兵之后，再看经济能否持续供给。'
                : view === 'payoff'
                  ? '沿用生产方案的条件，核对一项经济科技的投入与增量。'
                  : '查看单位之后，直接带着文明与时代规划生产。'}
            </p>
          </div>
          <button
            className="button secondary"
            disabled={!!result.errors.length || (view === 'payoff' && state.people !== 'none' && !!payoffResult.errors.length)}
            title={result.errors.length ? '请先修正生产方案' : undefined}
            onClick={() => void copy()}
          >
            <Icon name="copy" />
            复制原型链接
          </button>
        </div>
        <section className="context-strip" aria-label="当前分析情境">
          <div className="context-label">
            <Icon name="git-branch" />
            <span>原始对局</span>
          </div>
          <div className="context-pair">
            <a href={productHref('/civ/' + sourceOwn.en)}>
              <Avatar civ={sourceOwn.en} />
              {sourceOwn.zh}
            </a>
            <span className="muted small">对阵</span>
            <a href={productHref('/civ/' + enemy.en)}>
              <Avatar civ={enemy.en} />
              {enemy.zh}
            </a>
          </div>
          <span className="context-age">{AGE_ZH[config.age]}</span>
          {own.en !== sourceOwn.en && <span className="context-age">当前分析：{own.zh}</span>}
          <a className="context-return" href={productHref('/matchup?' + new URLSearchParams({ me: sourceOwn.en, opp: enemy.en }))}>
            <Icon name="arrow-left" />
            原对局助手
          </a>
        </section>
        <nav className="journey" aria-label="原型页面切换">
          {(['unit', 'production', 'payoff'] as View[]).map((stage, index) => (
            <span key={stage}>
              {stageLink(
                stage,
                <>
                  <span className="step-number num">{index + 1}</span>
                  {stageNames[stage]}
                </>,
                view === stage ? 'current' : '',
              )}
              {index < 2 && <Icon className="journey-arrow" name="chevron-right" />}
            </span>
          ))}
        </nav>
        <p role="status" className="share-status">
          {shared}
        </p>
        {manualLink && (
          <label className="manual-link">
            原型分享链接
            <input readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} />
          </label>
        )}
        {view === 'unit' ? <UnitView {...viewProps} /> : view === 'production' ? <ProductionView {...viewProps} /> : <PayoffView {...viewProps} />}
        <section className="evidence panel">
          <details>
            <summary>
              <Icon name="database" />
              依据、条件与模型边界 <Icon name="chevron-down" />
            </summary>
            <div className="evidence-body">
              <p>数值直接调用仓库现有的持续生产与经济科技收益计算器，未新增游戏公式。时间均为游戏时间。</p>
              <p className="small muted">资料版本：{__DATA_VERSION__}</p>
              <p>持续生产使用稳态采集模型，食物按农田估算；不能据此断言开局羊、猎物等来源可持续，也不能推导实战胜率。</p>
              {(view === 'payoff' && state.people !== 'none' ? payoffResult.warnings : result.warnings).map((text) => (
                <p className="warning" key={text}>
                  {text}
                </p>
              ))}
              <p className="small muted">这份原型演示页面间的情境保留和收益确认；正式工具的全部设置仍在原工具内。</p>
            </div>
          </details>
        </section>
        <footer>
          <span>设计提案 · 尚未作为产品更新上线</span>
          <button className="text-link" onClick={() => write(initial, true)}>
            <Icon name="rotate-ccw" />
            重置原型
          </button>
        </footer>
      </main>
    </>
  );
}

const root = createRoot(document.getElementById('root')!);
Promise.all([loadCore(), loadTrees()])
  .then(([core, trees]) => {
    // Parse before React rendering so a malformed link has a usable reset action.
    readState();
    root.render(<App ctx={{ core, trees }} />);
  })
  .catch((error) =>
    root.render(
      <main>
        <h1>原型暂时无法显示</h1>
        <p role="alert">{String(error)}</p>
        <a
          href={window.location.pathname}
          onClick={() => {
            window.location.hash = '';
            window.location.reload();
          }}
        >
          重置原型并重试
        </a>
      </main>,
    ),
  );
