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
 * #123 原始范围：civs、units、techs、buildings；#162 B 扩展的加成和页面见 search-pinyin162.test.ts。
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
  // Steve 定（#123 评论 6206063202）：枪兵长的「长」读 zhǎng
  ['units', 879, '印加枪兵长', 'yinjiaqiangbingzhang', 'yjqbz'],
  ['units', 881, '精锐印加枪兵长', 'jingruiyinjiaqiangbingzhang', 'jryjqbz'],
];
/** ü 一律写成 v（Steve 定），搜索时输入 u 也要命中 */
const UMLAUT: [string, string | number, string, string, string][] = [
  ['civs', 'Jurchens', '女真', 'nvzhen', 'nz'],
  ['units', 1013, '飞刀女兵', 'feidaonvbing', 'fdnb'],
  ['buildings', 1754, '商队旅馆', 'shangduilvguan', 'sdlg'],
];
const ALL = [...CASES, ...POLY, ...UMLAUT];

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
  it('多音字不按错误读音命中：「zhanggongbing」「chongxing」「xinghui」「danshe」「yinjiaqiangbingchang」搜不到', () => {
    for (const q of ['zhanggongbing', 'chongxingnupao', 'xinghui', 'danshe', 'yinjiaqiangbingchang']) expect(names(q), q).toEqual([]);
  });
  it('印加枪兵长：py 含 yinjiaqiangbingzhang、pyi 为 yjqbz；搜「yjqbz」命中，「yjqbc」不命中', () => {
    const r = find('units', 879);
    expect(String(r.py)).toContain('yinjiaqiangbingzhang');
    expect(r.pyi).toBe('yjqbz');
    expect(names('yjqbz')).toContain('印加枪兵长');
    expect(names('yjqbc')).not.toContain('印加枪兵长');
  });
  it('ü 写 v 和写 u 都能命中：「nvzhen」「nuzhen」「shangduilv」「shangduilu」「fdnb」', () => {
    expect(names('nvzhen')).toContain('女真');
    expect(names('nuzhen')).toContain('女真');
    expect(names('shangduilv')).toContain('商队旅馆');
    expect(names('shangduilu')).toContain('商队旅馆');
    expect(names('feidaonubing')).toContain('飞刀女兵');
  });
  it('拼音只认前缀：全拼中段「gongbing」「sheshou」、首字母中段「ss」「jqbz」不命中', () => {
    expect(names('gongbing')).not.toContain('长弓兵');
    expect(names('sheshou')).not.toContain('骑射手');
    expect(names('sheshou')).not.toContain('重装骑射手');
    expect(names('ss')).not.toContain('骑射手');
    // jqbz 是 yjqbz（印加枪兵长）的中段；先确认它不是任何条目中英文名的子串，免得英文/中文命中混进来
    const all = Object.values(DATA).flat();
    expect(all.filter((x) => x.en.toLowerCase().replace(/\s+/g, '').includes('jqbz') || x.zh.includes('jqbz')).map((x) => x.en)).toEqual([]);
    expect(names('jqbz')).not.toContain('印加枪兵长');
  });
  it('排序：中英文名称前缀排在拼音命中前面（「ba」英文 Ballistics/Banking 在拼音 baifuzhang 之前）', () => {
    const r = names('ba');
    expect(r).toContain('百夫长');
    const py = r.indexOf('百夫长');
    for (const zh of ['弹道学', '银行业']) {
      expect(r, zh).toContain(zh);
      expect(r.indexOf(zh), zh).toBeLessThan(py);
    }
  });
  it('拼音前缀「chang」命中长弓兵、长剑士、长矛兵', () => {
    const r = names('chang');
    // 「chang」只是拼音前缀；长弓兵/长剑士/长矛兵 都应命中
    for (const zh of ['长弓兵', '长剑士', '长矛兵']) expect(r).toContain(zh);
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

describe('#123 CivPicker 只认拼音前缀', () => {
  it('CivPicker 也走前缀：「iongnu」不命中匈奴', () => {
    const huns = find('civs', 'Huns') as unknown as Parameters<typeof civMatches>[0];
    expect(civMatches(huns, 'iongnu')).toBe(false);
  });
});
describe('#123 拼音库只在构建时用，不打进前端（Steve 补充决定）', () => {
  it('package.json 的 dependencies 里没有拼音库（只能放 devDependencies）', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).filter((d) => /pinyin/i.test(d))).toEqual([]);
  });
  it('src 下没有 import 拼音库', () => {
    const src = ['src/domain/search.ts', 'src/features/search/hooks.ts', 'src/shared/ui/CivPicker.tsx'].map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/from ['"][^'"]*pinyin/i);
  });
});
// 构建产物不含拼音库代码；主包 gzip 预算为 10 KB 加 #162 的额外索引大小，见 tests/e2e/v080-123.spec.ts。
