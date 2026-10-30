import { describe, expect, it } from 'vitest';
import { buildListPath, buildNavigationParams, buildOrderPath, patchBuildParams } from '../../src/domain/buildNavigation531';

const query = (path: string) => new URLSearchParams(path.split('?')[1]);

describe('#531 开局导航', () => {
  it('旧我方和对手开局都还原同一原对阵，输入本身不修改', () => {
    for (const input of ['civ=Mongols&from=matchup&opp=Chinese', 'civ=Chinese&from=matchup&me=Mongols']) {
      const source = new URLSearchParams(input);
      const normalized = buildNavigationParams(source);
      expect(normalized.get('me')).toBe('Mongols');
      expect(normalized.get('opp')).toBe('Chinese');
      expect(source.toString()).toBe(input);
    }
  });

  it('完整原对阵独立于本页文明，改文明和普通参数不改原双方', () => {
    const current = 'civ=Chinese&from=matchup&me=Mongols&opp=Chinese&dist=7&house=0';
    const next = patchBuildParams(current, { civ: 'Franks', house: '1' });
    expect(next.get('civ')).toBe('Franks');
    expect(next.get('me')).toBe('Mongols');
    expect(next.get('opp')).toBe('Chinese');
    const migrated = patchBuildParams('civ=Mongols&from=matchup&opp=Chinese', { civ: 'Franks' });
    expect(migrated.get('me')).toBe('Mongols');
    expect(migrated.get('opp')).toBe('Chinese');
  });

  it('无来源或非法、重复文明不推断新对阵', () => {
    expect(buildNavigationParams('civ=Franks').has('me')).toBe(false);
    expect(buildNavigationParams('civ=Unknown&from=matchup&opp=Chinese').has('me')).toBe(false);
    expect(buildNavigationParams('civ=Franks&from=matchup&opp=Unknown').has('me')).toBe(false);
    expect(buildNavigationParams('civ=Franks&from=matchup&opp=Chinese&opp=Britons').has('me')).toBe(false);
    expect(buildNavigationParams('civ=Franks&civ=Mongols&from=matchup&opp=Chinese').has('me')).toBe(false);
  });

  it('分支保留距离、房屋、未知重复参数及来源，只清除旧步骤与视图', () => {
    const source = new URLSearchParams('bo=fast-castle-boom&civ=Franks&from=matchup&opp=Britons&dist=7&house=0&step=4&view=practice&x=1&x=2');
    source.set('ctxReturn', '/duel?a=38.Franks.3..&b=4.Britons.3..&m=1');
    const next = query(buildOrderPath(source, 'fast-castle-knights'));
    for (const key of ['civ', 'dist', 'house', 'ctxReturn']) expect(next.get(key)).toBe(source.get(key));
    expect(next.getAll('x')).toEqual(['1', '2']);
    expect(next.get('me')).toBe('Franks');
    expect(next.get('opp')).toBe('Britons');
    expect(next.get('bo')).toBe('fast-castle-knights');
    expect(next.has('step')).toBe(false);
    expect(next.has('view')).toBe(false);
    expect(next.get('ctxStepReset')).toBe('1');
  });

  it('返回列表后再进路线或跟练，保持兼容参数和来源', () => {
    const source = 'bo=fast-castle-boom&civ=Franks&from=matchup&opp=Britons&dist=7&house=0&step=4&view=print&ctxStepReset=1';
    const list = query(buildListPath(source));
    for (const key of ['bo', 'step', 'view', 'ctxStepReset']) expect(list.has(key)).toBe(false);
    const next = query(buildOrderPath(list, 'scouts-18', 'practice'));
    expect(next.get('civ')).toBe('Franks');
    expect(next.get('me')).toBe('Franks');
    expect(next.get('opp')).toBe('Britons');
    expect(next.get('dist')).toBe('7');
    expect(next.get('house')).toBe('0');
    expect(next.get('view')).toBe('practice');
  });

  it('跟练内切路线保留跟练模式但清步骤，选中新步骤后清重置提示', () => {
    const next = patchBuildParams('bo=fast-castle-boom&view=practice&step=4&civ=Franks', { bo: 'fast-castle-knights' });
    expect(next.get('view')).toBe('practice');
    expect(next.has('step')).toBe(false);
    expect(next.get('ctxStepReset')).toBe('1');
    expect(patchBuildParams(next, { step: '1' }).has('ctxStepReset')).toBe(false);
  });

  it('直接列表入口的原简单 URL 保持不变', () => {
    expect(buildListPath('')).toBe('/builds');
    expect(buildOrderPath('', 'scouts-18')).toBe('/builds?bo=scouts-18');
  });
});
