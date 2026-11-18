import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormationText } from '../../src/features/civs/components/CivFormations';

const protectedCases = [
  { text: 'v0.77.105', token: 'v0.77.105' },
  { text: 'DE 188329', token: '188329' },
  { text: '2026-10-28', token: '2026-10-28' },
  { text: '40c323a', token: '40c323a' },
  { text: '80 食', token: '80 食' },
  { text: '95 血', token: '95 血' },
  { text: '14 攻', token: '14 攻' },
  { text: '45F/30G', token: '45F/30G' },
  { text: '1.43s', token: '1.43s' },
  { text: '1:12.19', token: '1:12.19' },
  { text: '1个村民', token: '1个村民' },
  { text: '1–2 秒', token: '1–2 秒' },
  { text: '−1.25%', token: '−1.25%' },
  { text: '+2.5%', token: '+2.5%' },
  { text: '13 射程', token: '13 射程' },
  { text: '14–16 射程', token: '14–16 射程' },
  { text: '19/85', token: '19/85' },
  { text: '5箭/1个村民', token: '5箭/1个村民' },
  { text: '1.25 倍', token: '1.25 倍' },
] as const;

describe('#1139 文明阵容数字文本呈现', () => {
  it.each(protectedCases)('keeps the complete token "$token" together', ({ text, token }) => {
    const html = renderToStaticMarkup(createElement(FormationText, { text }));

    expect(html).toContain(`<span class="num nw">${token}</span>`);
  });

  it('leaves long SHA text breakable', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const html = renderToStaticMarkup(createElement(FormationText, { text: sha }));

    expect(html).toBe(sha);
    expect(html).not.toContain(`<span class="num nw">${sha}</span>`);
  });

  it('keeps 12+ digit values numeric instead of treating them as hashes', () => {
    const digits = '123456789012345678901234';
    const html = renderToStaticMarkup(createElement(FormationText, { text: digits }));

    expect(html).toBe(`<span class="num nw">${digits}</span>`);
  });

  it('does not treat arbitrary Chinese between numbers as a range', () => {
    const html = renderToStaticMarkup(createElement(FormationText, { text: '1和2' }));

    expect(html).toBe('<span class="num nw">1</span>和<span class="num nw">2</span>');
  });

  it('leaves text following a counted noun outside the nowrap token', () => {
    const html = renderToStaticMarkup(createElement(FormationText, { text: '1个村民正在采集' }));

    expect(html).toBe('<span class="num nw">1个村民</span>正在采集');
  });

  it.each([
    ['5个火矛兵达到箭数上限', '5个火矛兵', '达到箭数上限'],
    ['3个精锐诸葛弩在塔内', '3个精锐诸葛弩', '在塔内'],
    ['5个火矛兵仍需操作', '5个火矛兵', '仍需操作'],
  ])('keeps counted-unit phrase "$1" together without swallowing following prose', (text, nounPhrase, rest) => {
    const html = renderToStaticMarkup(createElement(FormationText, { text }));

    expect(html).toBe(`<span class="num nw">${nounPhrase}</span>${rest}`);
  });
});
