import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildOrders } from '../../src/data/buildOrders';
import { visibleSources } from '../../src/features/builds/sources';
import guide from '../../src/content/game-guide.json';
import { publicBuildLicense, publicBuildPresentation, publicGameGuideSources } from '../../src/domain/sourcePresentation.mjs';
import { checkSourcePresentation, validateSourcePresentation } from '../../scripts/check-source-presentation.mjs';

const rawGuide = () => structuredClone(guide);
const rawBuild = (id = 'scouts-18') => structuredClone(buildOrders.find((build) => build.id === id)!);
const buildFile = (id: string) => `src/data/build-orders/${id}.json`;
const GUIDE_FILE = 'src/content/game-guide.json';

describe('#442 公开开局来源与原始证据分离', () => {
  it.each(buildOrders)('$id 的公开来源不带内部 ref/path，保留链接、作者与日期', (order) => {
    const before = JSON.stringify(order);
    const sources = visibleSources(order.sources);
    expect(sources).toHaveLength(order.sources.length);
    expect(sources.map(({ title, url, author, accessed }) => ({ title, url, author, accessed }))).toEqual(
      order.sources.map(({ title, url, author, accessed }) => ({ title, url, author, accessed })),
    );
    for (const source of sources) {
      expect(Object.hasOwn(source, 'ref')).toBe(false);
      expect(source.section ?? '').not.toMatch(/src\/content\/build-orders\//);
    }
    expect(JSON.stringify(order)).toBe(before);
  });

  it('清理后严格命令通过，不再依赖22条来源迁移告警', () => {
    const checked = spawnSync(process.execPath, ['scripts/check-content.mjs', '--strict'], { encoding: 'utf8' });
    expect(checked.status, checked.stdout + checked.stderr).toBe(0);
    expect(checked.stdout).toContain('0 条告警，0 个错误');
  });

  it.each(buildOrders)('$id 原始结构与公开来源均合法，原许可只移除已识别提交片段', (order) => {
    const before = JSON.stringify(order);
    expect(validateSourcePresentation(buildFile(order.id), order)).toEqual({ valid: true, problems: [] });
    const presentation = publicBuildPresentation(order);
    expect(presentation.license).toBe(order.id === 'hybrid-fish-18' ? order.license : order.license.replace('，提交 f09ed56', ''));
    expect(presentation.license).toContain('Microsoft');
    if (order.id !== 'hybrid-fish-18') {
      expect(presentation.license).toContain('MIT License，© 2026 Mehmet Kaan Demir');
    }
    expect(JSON.stringify(order)).toBe(before);
  });

  it('入门只公开固定科技的DE版本，链接/日期/其它来源与原始证据保留', () => {
    const before = JSON.stringify(guide);
    const sources = publicGameGuideSources(guide.sources);
    expect(sources['pinned-techs']!.version).toBe('DE185872');
    expect(sources['pinned-techs']!.url).toBe(guide.sources['pinned-techs'].url);
    expect(sources['pinned-techs']!.checkedAt).toBe(guide.sources['pinned-techs'].checkedAt);
    for (const id of Object.keys(guide.sources).filter((key) => key !== 'pinned-techs')) {
      expect(sources[id]).toEqual(guide.sources[id as keyof typeof guide.sources]);
    }
    expect(JSON.stringify(guide)).toBe(before);
    expect(validateSourcePresentation(GUIDE_FILE, guide)).toEqual({ valid: true, problems: [] });
  });

  it.each(['main 1234567 / DE185872', 'main abcdefa / DE185872', 'MAIN 1234567 / DE185872', 'main ABCDEFA / DE185872'])(
    '未知或错配的技术版本 %s 不能绕过公开格式',
    (value) => {
      for (const field of ['title', 'author', 'section', 'ref'] as const) {
        const build = rawBuild('hybrid-fish-18');
        build.sources[0]![field] = value;
        expect(validateSourcePresentation(buildFile(build.id), build).valid, field).toBe(false);
      }
      const build = rawBuild('hybrid-fish-18');
      build.license = value;
      expect(validateSourcePresentation(buildFile(build.id), build).valid).toBe(false);
      for (const field of ['title', 'kind', 'version', 'locator', 'note'] as const) {
        const content = rawGuide();
        content.sources['official-start'][field] = value;
        expect(validateSourcePresentation(GUIDE_FILE, content).valid, field).toBe(false);
      }
      const content = rawGuide();
      content.sources['pinned-techs'].version = value;
      expect(validateSourcePresentation(GUIDE_FILE, content).valid).toBe(false);
    },
  );

  it('AOE2的URL、文件slug和pin、许可pin必须相互匹配才是已识别证据', () => {
    const mutations = [
      (build: ReturnType<typeof rawBuild>) => {
        build.sources[0]!.section = 'src/content/build-orders/wrong-build.yaml';
      },
      (build: ReturnType<typeof rawBuild>) => {
        build.sources[0]!.ref = 'another/repository@f09ed56';
      },
      (build: ReturnType<typeof rawBuild>) => {
        build.sources[0]!.url += '?pin=f09ed56';
      },
      (build: ReturnType<typeof rawBuild>) => {
        build.license = build.license.replace('提交 f09ed56', '提交 1234567');
      },
      (build: ReturnType<typeof rawBuild>) => {
        build.license += ' （MIT License，© 2026 Mehmet Kaan Demir，提交 f09ed56）';
      },
    ];
    for (const mutate of mutations) {
      const build = rawBuild();
      mutate(build);
      expect(publicBuildLicense(build.license, build.sources)).toBe(build.license);
      expect(validateSourcePresentation(buildFile(build.id), build).valid).toBe(false);
    }
  });

  it('公开的新内部文案和URL/未知字段不能被投影隐藏后放行', () => {
    for (const field of ['title', 'author'] as const) {
      const build = rawBuild();
      build.sources[0]![field] = 'SHA256 internal CSV';
      expect(validateSourcePresentation(buildFile(build.id), build).valid).toBe(false);
    }
    const build = rawBuild();
    build.sources[0]!.url = 'file:///cache/private.json';
    expect(validateSourcePresentation(buildFile(build.id), build).valid).toBe(false);
    const unknown = { ...rawBuild(), privateCsv: 'hidden.csv' };
    expect(validateSourcePresentation(buildFile(unknown.id), unknown).valid).toBe(false);
    const badLicense = rawBuild();
    badLicense.license += ' 依据 CSV 行号';
    expect(validateSourcePresentation(buildFile(badLicense.id), badLicense).valid).toBe(false);
    const content = rawGuide();
    content.sources['pinned-techs'].url += '#unrecognized-pin';
    expect(validateSourcePresentation(GUIDE_FILE, content).valid).toBe(false);
  });

  it('独立checker发现新增文件并在真实CLI中阻断合法raw内的公开泄露', () => {
    const root = mkdtempSync(join(tmpdir(), 'source-presentation-442-'));
    mkdirSync(join(root, 'src/data/build-orders'), { recursive: true });
    mkdirSync(join(root, 'src/content'), { recursive: true });
    writeFileSync(join(root, GUIDE_FILE), JSON.stringify(guide));
    writeFileSync(join(root, buildFile('scouts-18')), JSON.stringify(rawBuild()));
    const run = () => spawnSync(process.execPath, [resolve('scripts/check-source-presentation.mjs'), '--root', root], { encoding: 'utf8' });
    try {
      expect(run().status).toBe(0);
      const bad = rawBuild('hybrid-fish-18');
      bad.sources[0]!.title = 'main 1234567 / DE185872';
      writeFileSync(join(root, buildFile('new-source')), JSON.stringify(bad));
      const checked = checkSourcePresentation(root);
      expect(checked.files).toHaveLength(3);
      expect(checked.problems.some((issue) => issue.file === buildFile('new-source') && issue.path === '/public/sources/0/title')).toBe(true);
      const failed = run();
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain('new-source.json/public/sources/0/title');
      writeFileSync(join(root, buildFile('new-source')), '{broken');
      expect(checkSourcePresentation(root).problems.some((issue) => issue.code === 'syntax')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
