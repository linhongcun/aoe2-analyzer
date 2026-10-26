import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { useShareLink } from '../../shared/ui/useShareLink';
import { DATA_SOURCES } from '../../shared/utils/dataInfo';
import { duelPresetPath, duelPresetShareUrl, mountedCrossbowPresetsFor, type MountedCrossbowPreset } from './mountedCrossbowPresets';

function PresetCard({ preset, stateKey }: { preset: MountedCrossbowPreset; stateKey: string }) {
  const { copy, copied, status, manualLink, statusProps } = useShareLink({
    stateKey,
    successMessage: '对照链接已复制。',
    failureMessage: '自动复制失败，请手动复制下方完整对照链接。',
  });
  return (
    <article className="mounted-crossbow-card" data-preset={preset.key}>
      <h4>{preset.title}</h4>
      <p className="note">
        双方无可选科技、无团队加成，<span className="num nw">1v1</span>。
      </p>
      {preset.note && <p className="note">{preset.note}</p>}
      <div className="mounted-crossbow-actions">
        <Link to={duelPresetPath(preset)}>
          <Icon name="swords" />
          打开对照
        </Link>
        <button type="button" aria-label={`复制对照链接：${preset.title}`} onClick={() => void copy(() => duelPresetShareUrl(preset, document.baseURI))}>
          <Icon name={copied ? 'check' : 'copy'} />
          复制链接
        </button>
      </div>
      {status && (
        <p className="note" {...statusProps}>
          {status}
        </p>
      )}
      {manualLink && (
        <label className="mounted-crossbow-fallback">
          完整对照链接
          <input readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
    </article>
  );
}

export function MountedCrossbowPresets({ patchId }: { patchId: string | undefined }) {
  const location = useLocation();
  const presets = mountedCrossbowPresetsFor(patchId, DATA_SOURCES.patch.build);
  if (!presets.length) return null;
  return (
    <section className="mounted-crossbow-presets" aria-label="骑马弩兵与骑射手预置">
      <h3>骑马弩兵与骑射手预置</h3>
      <p className="note">
        以下对照指定文明，保留常驻文明加成；结果采用现有 PK 近似模型。数据 <span className="num nw">DE {DATA_SOURCES.patch.build}</span>。
      </p>
      <div className="mounted-crossbow-grid">
        {presets.map((preset) => (
          <PresetCard key={preset.key} preset={preset} stateKey={`${location.pathname}${location.search}|${preset.key}`} />
        ))}
      </div>
    </section>
  );
}
