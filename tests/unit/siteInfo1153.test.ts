import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FEEDBACK_NOTE, SiteVersionInfo, SourceUsageStatement } from '../../src/shared/ui/SiteInfo';
import CivAboutFeedback from '../../src/features/civs/components/CivAboutFeedback';
import { CivIllustrationCredit } from '../../src/features/civs/components/CivBackground';
import { appVersion } from '../../src/shared/utils/feedback';
import { DATA_SOURCES, versionLabel } from '../../src/shared/utils/dataInfo';

vi.mock('../../src/features/civs/backgrounds', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/features/civs/backgrounds')>();
  return { ...original, civBackground: (civ: string) => (civ === 'MissingAsset' ? undefined : original.civBackground(civ)) };
});

describe('文明关于与反馈的共享内容', () => {
  it('版本跟随构建且保留数据说明链接', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SiteVersionInfo)));
    expect(html).toContain(appVersion());
    expect(html).toContain(versionLabel(DATA_SOURCES));
    expect(html).toContain(__BUILD__);
    expect(html).toContain('href="/about-data"');
  });
  it('完整保留来源链接与许可', () => {
    const html = renderToStaticMarkup(createElement(SourceUsageStatement));
    for (const value of [
      'SiegeEngineers/aoe2techtree',
      'denniske/aoe2companion',
      'https://lucide.dev',
      'https://ageofempires.fandom.com/',
      'https://seicing.com/html/aoe2/index-aoe2.html',
      'https://www.xbox.com/en-us/developers/rules',
      'MIT 代码',
      'ISC 许可',
      'CC BY-SA',
      '未获 Microsoft 认可或赞助',
      '首页氛围插画为本项目自制（AI 辅助生成）的装饰视觉，不属于 Microsoft 原版游戏素材。',
    ])
      expect(html).toContain(value);
  });
  it.each(['Wei', 'Unknown', 'MissingAsset'])('%s 初始收起且按钮控制隐藏内容', (civ) => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/civ/' + civ] }, createElement(CivAboutFeedback, { civ })));
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    const id = html.match(/aria-controls="([^"]+)"/)![1];
    expect(html).toContain(`id="${id}" hidden=""`);
    expect(html).toContain(FEEDBACK_NOTE);
    expect(html).not.toContain('<details');
    expect(html.includes('背景插画 · AoE2 Companion')).toBe(civ === 'Wei');
  });
  it('资源缺失时不输出虚构署名', () => {
    expect(renderToStaticMarkup(createElement(CivIllustrationCredit, { civ: 'MissingAsset' }))).toBe('');
  });
});
