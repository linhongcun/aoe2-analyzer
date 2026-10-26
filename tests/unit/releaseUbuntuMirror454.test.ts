import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

// actions/runner-images configure-apt-sources.sh, 6d35e16176367288d91febefafbd221cb2da6ca1.
const mirrorList = [
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1',
  'https://archive.ubuntu.com/ubuntu/\tpriority:2',
  'https://security.ubuntu.com/ubuntu/\tpriority:3',
  '',
].join('\n');
const deb822Mirror = `Types: deb
URIs: mirror+file:/etc/apt/apt-mirrors.txt
Suites: noble noble-updates noble-backports
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: https://security.ubuntu.com/ubuntu/
Suites: noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
`;
const legacyMirror = 'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] mirror+file:/etc/apt/apt-mirrors.txt jammy main restricted\n';
const directLegacy = `deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] http://azure.archive.ubuntu.com/ubuntu/ noble main restricted
deb https://security.ubuntu.com/ubuntu/ noble-security main restricted
`;
const directDeb822 = deb822Mirror.replace('mirror+file:/etc/apt/apt-mirrors.txt', 'http://azure.archive.ubuntu.com/ubuntu/');
const vendorSource = `Types: deb
URIs: https://packages.microsoft.com/repos/azure-cli/
Suites: noble
Components: main
Signed-By: /usr/share/keyrings/microsoft.gpg
`;

function mirrorStep(workflow: string) {
  const yaml = readFileSync(`.github/workflows/${workflow}.yml`, 'utf8');
  const step = yaml.match(/^ {6}- name: Use Ubuntu public package mirror\r?\n([\s\S]*?)(?=^ {6}- )/m)?.[1];
  const run = step?.match(/^ {8}run: \|\r?\n((?: {10}[^\n]*\n)+)/m)?.[1];
  if (!step || !run) throw new Error(`Missing executable Ubuntu mirror step in ${workflow}.yml`);
  return { step, run: run.replace(/^ {10}/gm, '') };
}

function fixture(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'ubuntu-mirror-454-'));
  directories.push(directory);
  const path = (name: string) => join(directory, 'etc/apt', name);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(path(name)), { recursive: true });
    writeFileSync(path(name), content);
  }
  return { directory, path };
}

function runMirrorStep(workflow: string, directory: string) {
  // Execute the workflow's shell itself; only redirect its filesystem and remove privilege escalation.
  const run = mirrorStep(workflow)
    .run.replaceAll('/etc/apt/', `${directory}/etc/apt/`)
    .replace(/\bsudo\s+/g, '');
  execFileSync('bash', ['-e', '-o', 'pipefail', '-c', run], { encoding: 'utf8' });
}

function referencedMirrors(directory: string, source: string) {
  const mirrorPath = source.match(/mirror\+file:(\/etc\/apt\/\S+)/)?.[1];
  if (!mirrorPath) throw new Error('Fixture must retain its mirror+file source');
  return readFileSync(`${directory}${mirrorPath}`, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const entry = line.match(/^(\S+)\s+priority:(\d+)$/);
      if (!entry?.[1] || !entry[2]) throw new Error(`Invalid mirror list entry: ${line}`);
      return { uri: entry[1], priority: Number(entry[2]) };
    });
}

describe.each(['ci', 'release'])('%s workflow Ubuntu mirror repair #454', (workflow) => {
  it.each([
    ['deb822', 'sources.list.d/ubuntu.sources', deb822Mirror, 'sources.list', directLegacy],
    ['legacy', 'sources.list', legacyMirror, 'sources.list.d/ubuntu.sources', directDeb822],
  ])('changes the selected %s mirror through the real mirror+file source', (_format, mirrorSourcePath, mirrorSource, directPath, directSource) => {
    const files = {
      'apt-mirrors.txt': mirrorList,
      [mirrorSourcePath]: mirrorSource,
      [directPath]: directSource,
      'sources.list.d/vendor.sources': vendorSource,
    };
    const { directory, path } = fixture(files);
    runMirrorStep(workflow, directory);

    const entries = referencedMirrors(directory, readFileSync(path(mirrorSourcePath), 'utf8'));
    const selected = [...entries].sort((a, b) => a.priority - b.priority)[0];
    expect(new URL(selected?.uri ?? '').hostname).toBe('archive.ubuntu.com');
    expect(selected).toEqual({ uri: 'http://archive.ubuntu.com/ubuntu/', priority: 1 });
    expect(entries.slice(1)).toEqual([
      { uri: 'https://archive.ubuntu.com/ubuntu/', priority: 2 },
      { uri: 'https://security.ubuntu.com/ubuntu/', priority: 3 },
    ]);
    // Exact file checks preserve protocols, priorities, suites, components, signatures and other sources.
    for (const [name, before] of Object.entries(files))
      expect(readFileSync(path(name), 'utf8')).toBe(before.replaceAll('azure.archive.ubuntu.com', 'archive.ubuntu.com'));
  });

  it.each([
    ['sources.list', directLegacy],
    ['sources.list.d/ubuntu.sources', directDeb822],
    ['apt-mirrors.txt', mirrorList],
  ])('also repairs %s when the other optional source files are absent', (name, content) => {
    const { directory, path } = fixture({ [name]: content });
    runMirrorStep(workflow, directory);
    expect(readFileSync(path(name), 'utf8')).toBe(content.replaceAll('azure.archive.ubuntu.com', 'archive.ubuntu.com'));
    for (const missing of ['sources.list', 'sources.list.d/ubuntu.sources', 'apt-mirrors.txt'].filter((file) => file !== name))
      expect(existsSync(path(missing))).toBe(false);
  });

  it('tolerates every optional source file being absent', () => {
    const { directory, path } = fixture({});
    expect(() => runMirrorStep(workflow, directory)).not.toThrow();
    expect(existsSync(path('apt-mirrors.txt'))).toBe(false);
  });

  if (workflow === 'release')
    it('retains the should_release gate', () => {
      expect(mirrorStep(workflow).step).toContain("if: steps.verify.outputs.should_release == 'true'");
    });
});
