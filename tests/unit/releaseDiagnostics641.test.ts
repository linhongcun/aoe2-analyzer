import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Release scripts are plain Node modules.
import { checkSite } from '../../scripts/deployment-smoke.mjs';

const version = 'v0.74.9';
const commit = 'a'.repeat(40);
const directories: string[] = [];
const temporary = () => {
  const path = mkdtempSync(join(tmpdir(), 'release-diagnostics641-'));
  directories.push(path);
  return path;
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function listen(server: Server) {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
}
const footer = `<main><h1>诊断受控页面</h1><p>DOM-EVIDENCE-641</p></main><footer id="footer"><span data-t="footer-app-version">${version}</span><span data-t="footer-build">构建 aaaaaaa</span></footer>`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');

function readReport(directory: string) {
  const file = join(directory, 'diagnostics.json');
  expect(existsSync(file), '提前失败必须保留诊断 JSON，不能只在流程末尾检查浏览器错误').toBe(true);
  return { report: JSON.parse(readFileSync(file, 'utf8')), raw: readFileSync(file, 'utf8') };
}

describe('Release 提前失败证据 #641', () => {
  it('真实页脚先绘出、再报错卸载：原检查仍失败，并保留浏览器、资源、DOM和截图证据', async () => {
    let gate: ServerResponse | undefined;
    let painted = false;
    const server = createServer((request, response) => {
      const path = new URL(request.url!, 'http://fixture.invalid');
      if (path.pathname === '/gate.png') {
        gate = response;
        return;
      }
      if (path.pathname === '/unmounted') {
        painted = path.searchParams.get('painted') === '1';
        gate!.writeHead(200, { 'content-type': 'image/png' });
        gate!.end(png);
        response.end('released');
        return;
      }
      if (path.pathname === '/fails.js') {
        request.socket.destroy();
        return;
      }
      if (path.pathname === '/ok.js') {
        response.writeHead(200, { 'content-type': 'application/javascript' });
        response.end('window.fixture641 = true;');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><title>Release evidence 641</title>${footer}<img src="/gate.png" alt=""><script src="/ok.js?token=fixture-secret-641"></script><script>
          requestAnimationFrame(() => requestAnimationFrame(async () => {
            const painted = document.querySelector('#footer').getBoundingClientRect().height > 0;
            for (let index = 0; index < 75; index++) console.error('bounded-641-' + index + ':' + 'x'.repeat(1600));
            console.error('CONSOLE-EVIDENCE-641 https://fixture.invalid/?token=fixture-secret-641');
            try { await fetch('/fails.js?key=fixture-secret-641'); } catch {}
            document.querySelector('#footer').remove();
            fetch('/unmounted?painted=' + Number(painted));
            setTimeout(() => { throw new Error('PAGEERROR-EVIDENCE-641'); }, 0);
          }));
        </script>`);
    });
    const site = await listen(server);
    const diagnosticsDir = temporary();
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failure = await checkSite({ site, version, commit, features: [], diagnosticsDir }).then(
        () => null,
        (error: Error) => error,
      );
      expect(painted, '受控页脚必须先真实渲染，才卸载并释放load').toBe(true);
      expect(failure?.message).toMatch(/footer-app-version|toBeVisible/);
      const { report, raw } = readReport(diagnosticsDir);
      expect(report.expected).toEqual({ version, commit });
      expect(report.phase).toBe('footer-visible');
      expect(report.url).toContain(site);
      expect(raw).toContain('CONSOLE-EVIDENCE-641');
      expect(raw).toContain('PAGEERROR-EVIDENCE-641');
      expect(raw).toContain('fails.js');
      expect(report.events.requestFailed.length).toBeGreaterThan(0);
      expect(report.events.responses.some((item: { url: string; status: number }) => item.url.includes('/ok.js') && item.status === 200)).toBe(true);
      expect(report.events.console.length).toBeLessThanOrEqual(20);
      expect(report.counts.console).toBeGreaterThan(20);
      expect(report.dom.text).toContain('DOM-EVIDENCE-641');
      expect(report.dom.text.length).toBeLessThanOrEqual(8000);
      expect(raw).not.toContain('fixture-secret-641');
      expect(output.mock.calls.flat().join('\n')).toContain('PAGEERROR-EVIDENCE-641');
      expect(output.mock.calls.flat().join('\n')).not.toContain('fixture-secret-641');
      expect(readFileSync(join(diagnosticsDir, 'failure.png')).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    } finally {
      await close(server);
    }
  }, 20_000);

  it('launch 失败也保留阶段与原异常对象', async () => {
    const primary = new Error('launch-primary-641');
    vi.spyOn(chromium, 'launch').mockRejectedValue(primary);
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagnosticsDir = temporary();
    await expect(checkSite({ site: 'http://127.0.0.1/', version, commit, features: [], diagnosticsDir })).rejects.toBe(primary);
    const { report } = readReport(diagnosticsDir);
    expect(report.phase).toBe('browser-launch');
    expect(report.expected).toEqual({ version, commit });
    expect(output.mock.calls.flat().join('\n')).toContain('launch-primary-641');
  });

  it('取证目录写入失败、close再失败时，仍抛出同一个主异常', async () => {
    const primary = new Error('context-primary-641');
    const browser = {
      newContext: vi.fn().mockRejectedValue(primary),
      close: vi.fn().mockRejectedValue(new Error('cleanup-secondary-641')),
    };
    vi.spyOn(chromium, 'launch').mockResolvedValue(browser as unknown as Browser);
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagnosticsDir = join(temporary(), 'not-a-directory');
    writeFileSync(diagnosticsDir, 'fixture');
    await expect(checkSite({ site: 'http://127.0.0.1/', version, commit, features: [], diagnosticsDir })).rejects.toBe(primary);
    const logged = output.mock.calls.flat().join('\n');
    expect(logged).toContain('context-primary-641');
    expect(logged).toMatch(/ENOTDIR|EEXIST|not a directory/i);
    expect(logged).toContain('cleanup-secondary-641');
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('页面已关闭时仍保存异常与期待值，不用截图异常覆盖原失败', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.close();
    vi.spyOn(chromium, 'launch').mockResolvedValue(browser);
    vi.spyOn(browser, 'newContext').mockResolvedValue(context);
    vi.spyOn(context, 'newPage').mockResolvedValue(page);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagnosticsDir = temporary();
    await expect(checkSite({ site: 'http://127.0.0.1/', version, commit, features: [], diagnosticsDir })).rejects.toThrow(/closed/i);
    const { report } = readReport(diagnosticsDir);
    expect(report.expected).toEqual({ version, commit });
    expect(report.error.message).toMatch(/closed/i);
    expect(JSON.stringify(report.captureErrors)).toMatch(/closed|unavailable/i);
  });

  it('成功仍返回真实已检查路由，不写失败产物', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><title>success</title>${footer}`);
    });
    const site = await listen(server);
    const diagnosticsDir = join(temporary(), 'success');
    try {
      expect(await checkSite({ site, version, commit, features: [], diagnosticsDir })).toEqual(['/']);
      expect(existsSync(diagnosticsDir)).toBe(false);
    } finally {
      await close(server);
    }
  });

  it('真实 CLI 提前失败仍退出1，并在现有artifact目录留下证据', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><title>mismatch</title>${footer}`);
    });
    const site = await listen(server);
    const directory = temporary();
    try {
      const result = await new Promise<{ code: number | null; output: string }>((done, reject) => {
        const child = spawn(process.execPath, [resolve('scripts/deployment-smoke.mjs'), '--site', site], {
          cwd: directory,
          env: { ...process.env, RELEASE_VERSION: version, EXPECTED_DEPLOYED_SHA: 'b'.repeat(40) },
        });
        let output = '';
        child.stdout.on('data', (chunk) => (output += String(chunk)));
        child.stderr.on('data', (chunk) => (output += String(chunk)));
        child.on('error', reject);
        child.on('close', (code) => done({ code, output }));
      });
      expect(result.code).toBe(1);
      expect(result.output).toContain('Published build must identify the exact main commit');
      expect(readReport(join(directory, 'test-results/deployment-smoke')).report.expected.commit).toBe('b'.repeat(40));
    } finally {
      await close(server);
    }
  });
});
