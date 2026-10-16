import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import units from '../../src/data/units.json';
import techs from '../../src/data/techs.json';
import buildings from '../../src/data/buildings.json';
import { search, type SearchItem } from '../../src/domain/search';
import { civMatches } from '../../src/shared/ui/CivPicker';

/**
 * #123 搜索支持拼音（全拼和首字母）。
 * 草案字段名：每条数据加 py（全拼，无声调，小写，无空格）和 pyi（每个字的首字母）。字段名 Linus 可改，改了这里跟着改。
 * 所有例子取自 src/data/*.json 的真实中文名；多音字按游戏内词义定读音（见 /workspace/v080-specs-123.md）。
 */
type Row = { zh: string; en: string; id?: number; py?: unknown; pyi?: unknown };
const DATA = { civs, units, techs, buildings } as unknown as Record<string, Row[]>;
const find = (file: string, key: string | number) => DATA[file]!.find((x) => (typeof key === 'number' ? x.id === key : x.en === key))!;

/** [数据文件, id 或英文名, 中文名, 全拼, 首字母] */
const CASES: [string, string | number, string, string, string][] = [
  ['civs', 'Huns', '匈奴', 'xiongnu', 'xn'],
  ['civs', 'Franks', '法兰克', 'falanke', 'flk'],
  ['units', 39, '骑射手', 'qisheshou', 'qss'],
  ['buildings', 12, '兵营', 'bingying', 'by'],
];
/** 多音字（修正表必须覆盖）：长 cháng/zhǎng、重 zhòng、行 háng、弹 dàn/tán */
const POLY: [string, string | number, string, string, string][] = [
  ['units', 8, '长弓兵', 'changgongbing', 'cgb'],
  ['units', 77, '长剑士', 'changjianshi', 'cjs'],
  ['units', 93, '长矛兵', 'changmaobing', 'cmb'],
  ['units', 1790, '百夫长', 'baifuzhang', 'bfz'],
  ['units', 542, '重型弩炮', 'zhongxingnupao', 'zxnp'],
  ['units', 474, '重装骑射手', 'zhongzhuangqisheshou', 'zzqss'],
  ['techs', 15, '行会', 'hanghui', 'hh'],
  ['techs', 17, '银行业', 'yinhangye', 'yhy'],
  ['techs', 93, '弹道学', 'dandaoxue', 'ddx'],
  ['units', 1911, '掷弹兵', 'zhidanbing', 'zdb'],
  ['techs', 59, '弹射器', 'tansheqi', 'tsq'],
];
const ALL = [...CASES, ...POLY];

describe('#123 数据字段：每个中文名都有全拼和首字母', () => {
  for (const file of Object.keys(DATA))
    it(`${file}.json 每条都有 py、pyi，只含小写字母，首字母个数等于中文名字数`, () => {
      const bad = DATA[file]!.filter(
        (x) =>
          typeof x.py !== 'string' ||
          typeof x.pyi !== 'string' ||
          !/^[a-z]+$/.test(x.py) ||
          !/^[a-z]+$/.test(x.pyi) ||
          x.pyi.length !== [...x.zh.replace(/[^\u4e00-\u9fff]/g, '')].length,
      );
      expect(bad.map((x) => x.zh)).toEqual([]);
    });
  for (const [file, key, zh, py, pyi] of ALL)
    it(`${file}.json「${zh}」py=${py} pyi=${pyi}`, () => {
      const r = find(file, key);
      expect(r.zh).toBe(zh);
      expect({ py: r.py, pyi: r.pyi }).toEqual({ py, pyi });
    });
});

/** 搜索用的条目：拼音值直接给定，只测打分逻辑会不会比对拼音字段 */
const items = ALL.map(([file, key, zh, py, pyi]) => ({
  kind: file === 'civs' ? 'civ' : file === 'techs' ? 'tech' : file === 'buildings' ? 'building' : 'unit',
  id: String(key),
  zh,
  en: find(file, key).en,
  href: '',
  sub: '',
  py,
  pyi,
})) as unknown as SearchItem[];
const names = (q: string) => search(items, q).map((r) => r.zh);

describe('#123 全局搜索比对拼音', () => {
  for (const [, , zh, py, pyi] of ALL) {
    it(`全拼「${py}」能搜到「${zh}」`, () => expect(names(py)).toContain(zh));
    it(`首字母「${pyi}」能搜到「${zh}」`, () => expect(names(pyi)).toContain(zh));
  }
  it('全拼前缀「xiong」能搜到「匈奴」', () => expect(names('xiong')).toContain('匈奴'));
  it('不分大小写：「XiongNu」「XN」「QSS」', () => {
    expect(names('XiongNu')).toContain('匈奴');
    expect(names('XN')).toContain('匈奴');
    expect(names('QSS')).toContain('骑射手');
  });
  it('忽略空格：「xiong nu」「qi she shou」', () => {
    expect(names('xiong nu')).toContain('匈奴');
    expect(names('qi she shou')).toContain('骑射手');
  });
  it('多音字不按错误读音命中：「zhanggongbing」「chongxing」「xinghui」「danshe」搜不到', () => {
    for (const q of ['zhanggongbing', 'chongxingnupao', 'xinghui', 'danshe']) expect(names(q), q).toEqual([]);
  });
  it('中文和英文照旧：「匈奴」「Huns」第一个是匈奴，「长弓」能搜到长弓兵', () => {
    expect(names('匈奴')[0]).toBe('匈奴');
    expect(names('Huns')[0]).toBe('匈奴');
    expect(names('长弓')).toContain('长弓兵');
  });
  it('无结果：「zzzz」返回空', () => expect(names('zzzz')).toEqual([]));
});

describe('#123 CivPicker 比对拼音', () => {
  const huns = find('civs', 'Huns') as unknown as Parameters<typeof civMatches>[0];
  it('「xiongnu」「xn」「xiong」命中匈奴（输入已转小写）', () => {
    for (const q of ['xiongnu', 'xn', 'xiong']) expect(civMatches(huns, q), q).toBe(true);
  });
  it('中文、英文照旧，「zzzz」不命中', () => {
    expect(civMatches(huns, '匈奴')).toBe(true);
    expect(civMatches(huns, 'huns')).toBe(true);
    expect(civMatches(huns, 'zzzz')).toBe(false);
  });
});

describe('#123 不把拼音库打进前端', () => {
  it('package.json 的 dependencies 里没有拼音库（只能放 devDependencies）', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).filter((d) => /pinyin/i.test(d))).toEqual([]);
  });
  it('src 下没有 import 拼音库', () => {
    const src = ['src/domain/search.ts', 'src/features/search/hooks.ts', 'src/shared/ui/CivPicker.tsx'].map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/from ['"][^'"]*pinyin/i);
  });
});
