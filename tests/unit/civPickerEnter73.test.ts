import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { civMatches, enterTarget } from '../../src/shared/ui/CivPicker';

/** #73：Enter 只能选中匹配当前输入的文明，或什么都不选 */
const all = [{ en: '' }, ...civs.map((c) => ({ en: c.en, c }))];
const filtered = (q: string) => civs.filter((c) => civMatches(c, q.trim().toLowerCase())).map((c) => ({ en: c.en, c }));

describe('#73 enterTarget', () => {
  it('过滤未完成（列表仍是全部）时，按输入框文字取第一个匹配', () => {
    const act = all.findIndex((o) => o.en === 'Britons');
    expect(enterTarget('法兰克', '', all, act, civs, true)).toBe('Franks');
    expect(enterTarget('法兰克', '', all, 0, civs, true)).toBe('Franks');
  });
  it('高亮项不匹配当前输入时绝不选它', () => {
    const act = all.findIndex((o) => o.en === 'Aztecs');
    expect(enterTarget('法兰克', '', all, act, civs, true)).not.toBe('Aztecs');
  });
  it('没有匹配时什么都不选', () => {
    expect(enterTarget('zzzz', '', all, 3, civs, true)).toBeUndefined();
    expect(enterTarget('zzzz', 'zzzz', [], 0, civs, true)).toBeUndefined();
  });
  it('列表已按当前输入过滤：取高亮项（方向键行为不变）', () => {
    const f = filtered('an');
    expect(f.length).toBeGreaterThan(1);
    expect(enterTarget('an', 'an', f, 1, civs, true)).toBe(f[1]!.en);
  });
  it('空输入：高亮「无」选项照常选「无」', () => {
    expect(enterTarget('', '', all, 0, civs, true)).toBe('');
  });
});
