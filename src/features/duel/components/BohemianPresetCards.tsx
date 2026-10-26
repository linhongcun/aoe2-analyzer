import type { MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { useShareLink } from '../../../shared/ui/useShareLink';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import { bohemianPresetPath, bohemianPresetShareUrl, bohemianPresetsFor, type BohemianPreset } from '../logic/bohemianPresets';

function focusPresetTarget(id: 'duel' | 'duel-presets') {
  const section = document.getElementById(id);
  if (!section) return;
  if (!section.hasAttribute('tabindex')) {
    section.setAttribute('tabindex', '-1');
    section.addEventListener('blur', () => section.removeAttribute('tabindex'), { once: true });
  }
  section.focus({ preventScroll: true });
  const title = section.querySelector('h1, h2') ?? section;
  const barBottom = document.querySelector('header.topbar')?.getBoundingClientRect().bottom ?? 0;
  window.scrollTo({ top: window.scrollY + title.getBoundingClientRect().top - Math.max(0, barBottom) - 8 });
}

export function BohemianPresetJump() {
  if (!bohemianPresetsFor(DATA_SOURCES.patch.build).length) return null;
  return (
    <div className="bar">
      <button type="button" onClick={() => focusPresetTarget('duel-presets')}>
        查看波希米亚预置
      </button>
    </div>
  );
}

function revealCalculator(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  focusPresetTarget('duel');
}

function PresetCard({ preset, stateKey }: { preset: BohemianPreset; stateKey: string }) {
  const { copy, copied, status, manualLink, statusProps } = useShareLink({
    stateKey,
    successMessage: '对照链接已复制。',
    failureMessage: '自动复制失败，请手动复制下方完整对照链接。',
  });
  return (
    <article className="posbox" data-preset={preset.key}>
      <h3>{preset.title}</h3>
      <div className="bar">
        <Link
          className="ulink"
          to={bohemianPresetPath(preset)}
          onClick={revealCalculator}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44 }}
        >
          <Icon name="swords" /> 打开对照
        </Link>
        <button type="button" aria-label={'复制对照链接：' + preset.title} onClick={() => void copy(() => bohemianPresetShareUrl(preset, document.baseURI))}>
          <Icon name={copied ? 'check' : 'copy'} /> 复制链接
        </button>
      </div>
      {status && (
        <p className="note" {...statusProps}>
          {status}
        </p>
      )}
      {manualLink && (
        <label className="share-link-manual">
          完整对照链接
          <textarea readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
    </article>
  );
}

export function BohemianPresetCards() {
  const location = useLocation();
  const presets = bohemianPresetsFor(DATA_SOURCES.patch.build);
  if (!presets.length) return null;
  return (
    <section id="duel-presets" tabIndex={-1} className="pane" aria-label="波希米亚预置对战">
      <h2>波希米亚预置对战</h2>
      <p className="note">
        波希米亚对法兰克，双方当前时代满科技、无团队加成，<span className="num nw">1v1</span>。数据{' '}
        <span className="num nw">DE {DATA_SOURCES.patch.build}</span>。
      </p>
      <p className="note">沿用上方 PK 近似模型及其限制，结果不等同实战。</p>
      <div className="two">
        {presets.map((preset) => (
          <PresetCard key={preset.key} preset={preset} stateKey={location.pathname + location.search + '|' + preset.key} />
        ))}
      </div>
    </section>
  );
}
