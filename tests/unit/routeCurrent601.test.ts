import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('../../src/shared/styles/tokens.css', import.meta.url), 'utf8');
const details = readFileSync(new URL('../../src/shared/styles/editorial-details.css', import.meta.url), 'utf8');
const darkAt = tokens.indexOf(":root[data-theme='dark']");
const lightTokens = tokens.slice(0, darkAt);
const darkTokens = tokens.slice(darkAt);

function token(css: string, name: string): string {
  const matched = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  const value = matched?.[1];
  if (!value) throw new Error(`缺少 ${name}`);
  return value.toLowerCase();
}

/** 与 docs/design/contrast.py 相同的 WCAG 相对亮度。 */
function channel(value: number): number {
  const encoded = value / 255;
  return encoded <= 0.03928 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  };
  const [lighter, darker] = [lum(foreground), lum(background)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe('#601 升级路线当前芯片', () => {
  it('浅色用浅琥珀底和正文色字，深色令牌保持灰底白字', () => {
    expect(token(lightTokens, '--color-route-current')).toBe('#f4ebe3');
    expect(token(lightTokens, '--color-on-route-current')).toBe('#1d1d1f');
    expect(token(darkTokens, '--color-route-current')).toBe('#48484a');
    expect(token(darkTokens, '--color-on-route-current')).toBe('#ffffff');
    expect(lightTokens).toContain('--color-route-selected: var(--color-route-current)');
    expect(lightTokens).toContain('--color-on-route-selected: var(--color-on-route-current)');
  });

  it('浅色当前字对底对比至少 4.5:1，深色当前与非当前底色不同', () => {
    const light = contrast(token(lightTokens, '--color-on-route-current'), token(lightTokens, '--color-route-current'));
    const dark = contrast(token(darkTokens, '--color-on-route-current'), token(darkTokens, '--color-route-current'));
    expect(light).toBeGreaterThan(14);
    expect(light).toBeGreaterThanOrEqual(4.5);
    expect(dark).toBeGreaterThanOrEqual(4.5);
    expect(token(darkTokens, '--color-route-current')).not.toBe(token(darkTokens, '--color-surface'));
    expect(token(darkTokens, '--color-route-current')).not.toBe(token(darkTokens, '--color-bg'));
  });

  it('当前芯片沿用路线令牌，并加 accent 内描边', () => {
    const start = details.indexOf('.detail .vline .cur {');
    const block = details.slice(start, details.indexOf('}', start));
    expect(block.startsWith('.detail .vline .cur {')).toBe(true);
    expect(block).toContain('background: var(--color-route-current, var(--color-text))');
    expect(block).toContain('color: var(--color-on-route-current, var(--color-surface))');
    expect(block).toContain('box-shadow: inset 0 0 0 1.5px var(--color-accent)');
  });
});
