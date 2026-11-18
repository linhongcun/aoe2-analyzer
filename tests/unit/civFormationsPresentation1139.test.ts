import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormationText } from '../../src/features/civs/components/CivFormations';

describe('#1139 文明阵容数字文本呈现', () => {
  it('仅将版本、日期、整数、小数、比例、范围和数字单位分别标记为不换行', () => {
    const html = renderToStaticMarkup(
      createElement(FormationText, {
        text: 'v0.77.105 · DE 188329（2026-10-28）；构建 40c323a；约 13 射程、14–16 射程、19/85、1.25 倍。',
      }),
    );

    for (const token of ['v0.77.105', '188329', '2026-10-28', '40c323a', '13 射程', '14–16 射程', '19/85', '1.25 倍']) {
      expect(html).toContain(`<span class="num nw">${token}</span>`);
    }
    expect(html).not.toContain('40c323a；');
    expect(html).toContain(' · DE ');
    expect(html).toContain('；构建 ');
  });
});
