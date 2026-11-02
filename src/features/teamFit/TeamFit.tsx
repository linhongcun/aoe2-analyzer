import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadCore, loadTrees } from '../../data';
import { DATA_PATCH_BUILD } from '../../data/meta';
import { decodeTeamFit, emptyTeamFit, encodeTeamFit, type TeamFitConfig } from '../../domain/teamFitQuery';
import { CivPicker } from '../../shared/ui/CivPicker';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import type { TeamFitResultsProps } from './TeamFitResults';
import './teamFit.css';

type Loaded = { props: Pick<TeamFitResultsProps, 'core' | 'trees'>; Results: ComponentType<TeamFitResultsProps> };
export default function TeamFit() {
  const location = useLocation(),
    navigate = useNavigate();
  const decoded = useMemo(() => decodeTeamFit(location.search), [location.search]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const share = useShareLink({ stateKey: location.search, successMessage: '搭配链接已复制。', failureMessage: '自动复制失败，请手动复制下方完整链接。' });
  useEffect(() => {
    let active = true;
    void Promise.all([loadCore(), loadTrees(), import('./TeamFitResults')])
      .then(([core, trees, module]) => {
        if (active) setLoaded({ props: { core, trees }, Results: module.default });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const pendingFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target) document.getElementById(target)?.focus();
  }, [location.key]);
  const config = decoded.config;
  const update = (next: TeamFitConfig, replace = false, focusTarget = 'tf-candidate') => {
    pendingFocus.current = focusTarget;
    navigate({ pathname: '/team-fit', search: '?' + encodeTeamFit(next) }, { replace });
    share.reset();
  };
  const copy = () => {
    if (decoded.locked || !config.candidate || !loaded || failed) return;
    void share.copy(() => {
      const url = new URL(document.baseURI);
      url.hash = '/team-fit?' + encodeTeamFit(config);
      return url.href;
    });
  };
  const Results = loaded?.Results;
  return (
    <section className="pane team-fit-page" data-testid="team-fit-page">
      <header className="tf-heading">
        <p className="tf-eyebrow">选文明前</p>
        <h1>文明搭配</h1>
        <p>先选候选，看它和队友有哪些关联。</p>
        <p className="note">完整科技树潜力 · DE {DATA_PATCH_BUILD} · 编辑口径，非官方推荐</p>
      </header>
      {decoded.locked ? (
        <div className="tf-error" role="alert">
          <h2>无法恢复这份搭配</h2>
          <p>{decoded.errors.join(' ')}</p>
          <p>原链接已保留；重置后可重新选择。</p>
          <button className="btn" onClick={() => update(emptyTeamFit(), true)}>
            重置搭配
          </button>
        </div>
      ) : (
        <>
          <div className="tf-selectors">
            <section className="tf-candidate">
              <h2>你的候选</h2>
              <CivPicker
                id="tf-candidate"
                label="你的候选"
                none="选择候选文明"
                value={config.candidate}
                onChange={(candidate) => update({ ...config, candidate })}
              />
              <div className="tf-clear">
                {config.candidate && (
                  <button type="button" className="btn" onClick={() => update({ ...config, candidate: '' })}>
                    清空候选
                  </button>
                )}
                <p className="note">可随时更换；清空后保留队友。</p>
              </div>
            </section>
            <section data-testid="team-fit-mates">
              <h2>
                已选队友 <span className="tf-count">{config.mates.length} / 3</span>
              </h2>
              <div className="tf-mates">
                {config.mates.map((civ, i) => (
                  <div className="tf-mate" key={i}>
                    <CivPicker
                      id={'tf-mate-' + i}
                      label={'队友' + (i + 1)}
                      value={civ}
                      onChange={(next) => update({ ...config, mates: config.mates.map((value, index) => (index === i ? next : value)) }, false, 'tf-mate-' + i)}
                    />
                    <button
                      type="button"
                      className="tf-remove"
                      aria-label={'移除队友' + (i + 1)}
                      onClick={() =>
                        update(
                          { ...config, mates: config.mates.filter((_, index) => index !== i) },
                          false,
                          config.mates.length > 1 ? 'tf-mate-' + Math.min(i, config.mates.length - 2) : 'tf-add',
                        )
                      }
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
              </div>
              {config.mates.length < 3 && (
                <CivPicker
                  id="tf-add"
                  label="加入队友"
                  none="加入队友"
                  value=""
                  onChange={(civ) => {
                    if (civ) update({ ...config, mates: [...config.mates, civ] }, false, 'tf-mate-' + config.mates.length);
                  }}
                />
              )}
              <p className="note">只加入已定文明的队友；重复文明可保留。</p>
            </section>
          </div>
          {!config.candidate && (
            <div className="tf-empty">
              <h2>先选一个想玩的文明</h2>
              <p>可独自查看，也可加入最多三名队友后比较。</p>
            </div>
          )}
          {failed ? (
            <div className="tf-error" role="alert">
              <h2>搭配资料加载失败</h2>
              <p>你的选择已保留。重新加载后再查看关联。</p>
              <button className="btn" onClick={() => window.location.reload()}>
                重新加载资料
              </button>
            </div>
          ) : !loaded ? (
            <p className="tf-loading" role="status">
              正在加载科技树与团队来源…
            </p>
          ) : config.candidate && Results ? (
            <Results {...loaded.props} config={config} />
          ) : null}
        </>
      )}
      <div className="tf-actions">
        <button type="button" className="btn" disabled={decoded.locked || !config.candidate || !loaded || failed} onClick={copy}>
          <Icon name="copy" />
          复制搭配链接
        </button>
        {!decoded.locked && (
          <button type="button" className="btn" onClick={() => update(emptyTeamFit(), true)}>
            重置搭配
          </button>
        )}
      </div>
      {!decoded.locked && !config.candidate && <p className="note">选好候选后可分享，或带入队伍工具。</p>}
      {share.status && <p {...share.statusProps}>{share.status}</p>}
      {share.manualLink && (
        <label className="tf-manual">
          完整搭配链接
          <input aria-label="完整搭配链接" readOnly value={share.manualLink} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </section>
  );
}
