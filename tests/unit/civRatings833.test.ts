import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AXIS_NAMES, validateCivRatings } from '../../scripts/check-civ-ratings.mjs';
import { RATING_BASIS, RATING_FILE_VERIFIED_AT } from '../../src/data/ratingBasis';
import { AXES } from '../../src/domain/ratings';

type Ratings = Record<string, unknown>;
type Row = Record<string, unknown>;

const ratings = JSON.parse(readFileSync('scripts/civ_ratings.json', 'utf8')) as Ratings;
const civNames = (JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as { en: string }[]).map((civ) => civ.en);
const clone = () => JSON.parse(JSON.stringify(ratings)) as Ratings;
const row = (data: Ratings, civ: string) => data[civ] as Row;

function problemsFor(mutate: (data: Ratings) => void): string[] {
  const data = clone();
  mutate(data);
  return validateCivRatings(data, civNames);
}

const META = ['_doc', 'verifiedAt', 'schemaVersion', 'basis'];
const scoreDigest = createHash('sha256')
  .update(JSON.stringify(Object.fromEntries(Object.entries(ratings).filter(([key]) => !META.includes(key)))))
  .digest('hex');

describe('civ_ratings 结构校验', () => {
  it('当前 56 个文明与元数据通过，且分数没有被重写', () => {
    expect(validateCivRatings(ratings, civNames)).toEqual([]);
    expect(Object.keys(ratings).filter((key) => !META.includes(key))).toHaveLength(56);
    expect(scoreDigest).toBe('f38986a07b7eacb9d44faf7874ecc2088ab194c568d6a264898718d310acfd7a');
    expect(AXES).toEqual([...AXIS_NAMES]);
    expect(RATING_BASIS.axes).toEqual([...AXES]);
    expect(RATING_BASIS.alignedPatch).toBeNull();
    expect(RATING_BASIS.alignedPatchStatus).toBe('unknown');
    expect(RATING_BASIS.positions.alignedPatch).toBeNull();
    expect(RATING_BASIS.positions.independentOfAxes).toBe(true);
    expect(RATING_FILE_VERIFIED_AT).toBe(ratings.verifiedAt);
    expect(JSON.stringify(RATING_BASIS)).not.toContain('188329');
    const civRows = JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as { en: string; s: number[]; fl: number; pk: number }[];
    for (const civ of civRows) {
      const source = ratings[civ.en] as { s: number[]; fl: number; pk: number };
      expect(civ.s, civ.en).toEqual(source.s);
      expect(civ.fl, civ.en).toBe(source.fl);
      expect(civ.pk, civ.en).toBe(source.pk);
    }
  });

  it('口径不能冒充补丁对齐、社区实证或新模型', () => {
    const basis = (data: Ratings) => data.basis as Record<string, unknown>;
    const positions = (data: Ratings) => basis(data).positions as Record<string, unknown>;
    expect(problemsFor((data) => delete data.basis).join('\n')).toContain('basis');
    expect(problemsFor((data) => (basis(data).alignedPatch = 188329)).join('\n')).toContain('alignedPatch');
    expect(problemsFor((data) => (basis(data).alignedPatchStatus = 'aligned')).join('\n')).toContain('unknown');
    expect(problemsFor((data) => (basis(data).communityClaim = 'verified')).join('\n')).toContain('unverified');
    expect(problemsFor((data) => (basis(data).axes = [...(basis(data).axes as string[])].reverse())).join('\n')).toContain('basis.axes');
    expect(problemsFor((data) => (positions(data).independentOfAxes = false)).join('\n')).toContain('independentOfAxes');
    expect(problemsFor((data) => (basis(data).highlight = '这是赢面')).join('\n')).toContain('赢面');
    expect(problemsFor((data) => (data._doc = '只有主观')).join('\n')).toContain('待核');
  });

  it('缺少元数据、非法日期或版本号会失败', () => {
    expect(problemsFor((data) => delete data._doc).join('\n')).toContain('_doc');
    expect(problemsFor((data) => (data.verifiedAt = '2026-13-40')).join('\n')).toContain('verifiedAt');
    expect(problemsFor((data) => (data.schemaVersion = 0)).join('\n')).toContain('schemaVersion');
  });

  it('缺文明、多文明或字段不齐会失败', () => {
    expect(problemsFor((data) => delete data.Armenians).join('\n')).toContain('Armenians: 评分文件缺少该文明');
    expect(problemsFor((data) => (data.Fake = structuredClone(row(data, 'Armenians')))).join('\n')).toContain('Fake: 评分文件包含 civs.json 中不存在的文明');
    expect(
      problemsFor((data) => {
        row(data, 'Armenians').extra = 1;
      }).join('\n'),
    ).toContain('字段必须恰好是');
    expect(
      problemsFor((data) => {
        delete row(data, 'Armenians').op;
      }).join('\n'),
    ).toContain('字段必须恰好是');
  });

  it('ty 必须是非空、无重复且属于固定枚举', () => {
    expect(problemsFor((data) => (row(data, 'Armenians').ty = [])).join('\n')).toContain('1–3 项数组');
    expect(problemsFor((data) => (row(data, 'Armenians').ty = ['inf', 'inf'])).join('\n')).toContain('不能重复');
    expect(problemsFor((data) => (row(data, 'Armenians').ty = ['fake'])).join('\n')).toContain('未知类型');
  });

  it('s 必须恰好 8 项且每项是 1–10 的整数', () => {
    expect(problemsFor((data) => (row(data, 'Armenians').s = [1, 2, 3, 4, 5, 6, 7])).join('\n')).toContain('必须恰好 8 项');
    expect(problemsFor((data) => (row(data, 'Armenians').s = [0, 2, 3, 4, 5, 6, 7, 8])).join('\n')).toContain('s[0]');
    expect(problemsFor((data) => (row(data, 'Armenians').s = [11, 2, 3, 4, 5, 6, 7, 8])).join('\n')).toContain('s[0]');
    expect(problemsFor((data) => (row(data, 'Armenians').s = [5.5, 2, 3, 4, 5, 6, 7, 8])).join('\n')).toContain('s[0]');
  });

  it('fl/pk 必须是 1–10 的整数，op 必须非空', () => {
    for (const field of ['fl', 'pk']) {
      expect(
        problemsFor((data) => {
          row(data, 'Armenians')[field] = 0;
        }).join('\n'),
      ).toContain(`${field}: 必须是 1–10`);
      expect(
        problemsFor((data) => {
          row(data, 'Armenians')[field] = 11;
        }).join('\n'),
      ).toContain(`${field}: 必须是 1–10`);
    }
    expect(
      problemsFor((data) => {
        row(data, 'Armenians').op = '';
      }).join('\n'),
    ).toContain('op: 必须是非空字符串');
  });

  it('CLI 对缺文明的 fixture 非 0 退出', () => {
    const root = mkdtempSync(join(tmpdir(), 'civ-ratings-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'src/data'), { recursive: true });
      const broken = clone();
      delete broken.Armenians;
      writeFileSync(join(root, 'scripts/civ_ratings.json'), JSON.stringify(broken));
      writeFileSync(join(root, 'src/data/civs.json'), JSON.stringify(civNames.map((en) => ({ en }))));
      const result = spawnSync(process.execPath, ['scripts/check-civ-ratings.mjs', '--root', root], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Armenians');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
