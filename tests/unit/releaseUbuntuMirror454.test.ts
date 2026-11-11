import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error CI commands are plain Node modules.
import { installBrowser } from '../../scripts/ci-commands.mjs';

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

async function runMirrorStep(workflow: string, directory: string) {
  // Execute production shell, redirecting its filesystem and removing privilege escalation only.
  const executeShell = (command: string, args: string[]) => {
    const origin = Date.now();
    execFileSync(
      command,
      args.map((arg) => arg.replaceAll('/etc/apt/', `${directory}/etc/apt/`).replace(/\bsudo\s+/g, '')),
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CI_RUN_EPOCH_MS: String(origin),
          CI_DEADLINE_MS: String(origin + 30 * 60 * 1000),
          GITHUB_RUN_ID: '659',
          GITHUB_RUN_ATTEMPT: '1',
          CI_BUDGET_KIND: 'validation',
        },
      },
    );
  };
  if (workflow === 'release') executeShell('bash', ['-e', '-o', 'pipefail', '-c', mirrorStep(workflow).run]);
  else {
    // CI moved the same repair behind the shared-deadline installer. Keep exercising its actual shell.
    const commands: string[] = [];
    await installBrowser({
      run: async (command: string, args: string[]) => {
        commands.push(command);
        if (command === 'bash') executeShell(command, args);
        else {
          expect(command).toBe('npx');
          expect(args).toEqual(['playwright', 'install', '--with-deps', 'chromium']);
        }
      },
    });
    expect(commands).toEqual(['bash', 'npx']);
  }
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
  ])('keeps distinct %s mirror candidates through the real mirror+file source', async (_format, mirrorSourcePath, mirrorSource, directPath, directSource) => {
    const files = {
      'apt-mirrors.txt': mirrorList,
      [mirrorSourcePath]: mirrorSource,
      [directPath]: directSource,
      'sources.list.d/vendor.sources': vendorSource,
    };
    const { directory, path } = fixture(files);
    await runMirrorStep(workflow, directory);

    const entries = referencedMirrors(directory, readFileSync(path(mirrorSourcePath), 'utf8'));
    const selected = [...entries].sort((a, b) => a.priority - b.priority)[0];
    // Configured candidate order only. This does not show that any host answered.
    expect(entries.map((entry) => new URL(entry.uri).hostname)).toEqual([
      'azure.archive.ubuntu.com',
      'archive.ubuntu.com',
      'security.ubuntu.com',
    ]);
    expect(new Set(entries.map((entry) => new URL(entry.uri).hostname)).size).toBe(entries.length);
    expect(selected).toEqual({ uri: 'http://azure.archive.ubuntu.com/ubuntu/', priority: 1 });
    // Direct URIs still leave the Azure host. The mirror list stays three distinct candidates.
    for (const [name, before] of Object.entries(files)) {
      const expected = name === 'apt-mirrors.txt' ? before : before.replaceAll('azure.archive.ubuntu.com', 'archive.ubuntu.com');
      expect(readFileSync(path(name), 'utf8')).toBe(expected);
    }
  });

  it.each([
    ['sources.list', directLegacy, true],
    ['sources.list.d/ubuntu.sources', directDeb822, true],
    ['apt-mirrors.txt', mirrorList, false],
  ])('keeps %s usable when the other optional source files are absent', async (name, content, rewriteDirect) => {
    const { directory, path } = fixture({ [name]: content });
    await runMirrorStep(workflow, directory);
    const expected = rewriteDirect ? content.replaceAll('azure.archive.ubuntu.com', 'archive.ubuntu.com') : content;
    expect(readFileSync(path(name), 'utf8')).toBe(expected);
    for (const missing of ['sources.list', 'sources.list.d/ubuntu.sources', 'apt-mirrors.txt'].filter((file) => file !== name))
      expect(existsSync(path(missing))).toBe(false);
  });

  it('tolerates every optional source file being absent', async () => {
    const { directory, path } = fixture({});
    await expect(runMirrorStep(workflow, directory)).resolves.toBeUndefined();
    expect(existsSync(path('apt-mirrors.txt'))).toBe(false);
  });

  if (workflow === 'release')
    it('retains the should_release gate', () => {
      expect(mirrorStep(workflow).step).toContain("if: steps.verify.outputs.should_release == 'true'");
    });
});
