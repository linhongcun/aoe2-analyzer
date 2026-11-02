/** Bounded evidence only: this module never decides whether a deployment passes. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EVENT_LIMIT = 20;
const FIELD_LIMIT = 1000;
const CAPTURE_TIMEOUT = 2000;
const sensitive = /token|key|auth|password|passwd|secret|signature|credential|session|cookie|jwt|bearer|^sig$|^code$/i;
const clip = (value, limit = FIELD_LIMIT) => String(value ?? '').slice(0, limit);

function redactParams(params) {
  for (const key of new Set(params.keys())) if (sensitive.test(key)) params.set(key, '[REDACTED]');
  return params.toString();
}

export function diagnosticUrl(value) {
  try {
    const url = new URL(String(value));
    url.username = '';
    url.password = '';
    url.search = redactParams(url.searchParams);
    const hash = url.hash.slice(1);
    const query = hash.indexOf('?');
    if (query >= 0) url.hash = hash.slice(0, query + 1) + redactParams(new URLSearchParams(hash.slice(query + 1)));
    else if (hash.includes('=')) url.hash = redactParams(new URLSearchParams(hash));
    return clip(url.href);
  } catch {
    return '[unavailable URL]';
  }
}

export function diagnosticText(value, limit = FIELD_LIMIT) {
  return clip(
    String(value ?? '')
      .replace(/https?:\/\/[^\s<>"']+/gi, diagnosticUrl)
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]'),
    limit,
  );
}

function errorSummary(error) {
  return {
    name: diagnosticText(error?.name ?? 'Error'),
    message: diagnosticText(error?.message ?? error),
    stack: diagnosticText(error?.stack ?? '', 4000),
  };
}

function log(value) {
  try {
    console.error(JSON.stringify(value));
  } catch {
    // A broken log stream cannot replace the deployment failure.
  }
}

async function boundedCapture(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Diagnostic capture timed out')), CAPTURE_TIMEOUT);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createSmokeDiagnostics({ site, version, commit, diagnosticsDir }) {
  const events = { console: [], pageErrors: [], requestFailed: [], responses: [] };
  const counts = { console: 0, pageErrors: 0, requestFailed: 0, responses: 0 };
  const state = { phase: 'configuration', feature: 'home', route: '/' };
  const record = (kind, value) => {
    counts[kind]++;
    events[kind].push(value);
    if (events[kind].length > EVENT_LIMIT) events[kind].shift();
  };
  const secondary = (phase, error) => log({ diagnosticFailure: phase, error: errorSummary(error) });
  return {
    phase(phase, details = {}) {
      Object.assign(state, { phase }, details);
    },
    observe(page) {
      page.on('console', (message) => {
        if (message.type() === 'error') record('console', { text: diagnosticText(message.text()), url: diagnosticUrl(page.url()) });
      });
      page.on('pageerror', (error) => record('pageErrors', { name: diagnosticText(error.name), message: diagnosticText(error.message) }));
      page.on('requestfailed', (request) => {
        record('requestFailed', { url: diagnosticUrl(request.url()), error: diagnosticText(request.failure()?.errorText) });
      });
      page.on('response', (response) => {
        if (response.request().resourceType() === 'script' || /\.m?js(?:[?#]|$)/i.test(response.url()))
          record('responses', { url: diagnosticUrl(response.url()), status: response.status() });
      });
    },
    secondary,
    async capture(error, page) {
      // Each operation is best effort. In particular a closed page must still yield a JSON report.
      const report = {
        timestamp: new Date().toISOString(),
        expected: { version: diagnosticText(version), commit: diagnosticText(commit) },
        phase: diagnosticText(state.phase),
        feature: diagnosticText(state.feature),
        route: diagnosticUrl(new URL(state.route, 'https://route.invalid/')).replace('https://route.invalid', ''),
        url: diagnosticUrl(page?.url() || site),
        error: errorSummary(error),
        counts,
        events,
        dom: null,
        captureErrors: [],
      };
      const failedCapture = (phase, problem) => {
        report.captureErrors.push({ phase, error: errorSummary(problem) });
      };
      let canWrite = false;
      try {
        mkdirSync(diagnosticsDir, { recursive: true });
        canWrite = true;
      } catch (problem) {
        failedCapture('directory', problem);
      }
      if (!page || page.isClosed()) {
        failedCapture('page', new Error('Page closed or unavailable; DOM and screenshot unavailable'));
      } else {
        try {
          const dom = await boundedCapture(() =>
            page.evaluate(() => {
              const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
              let text = '',
                count = 0,
                node;
              while ((node = walker.nextNode()) && count++ < 10000 && text.length < 8000) {
                const parent = node.parentElement;
                if (parent && !parent.closest('script,style,template,noscript,input,textarea,select,option') && parent.checkVisibility())
                  text += (node.textContent ?? '') + ' ';
              }
              return {
                title: document.title.slice(0, 1000),
                heading: (document.querySelector('main h1, main h2')?.textContent ?? '').slice(0, 1000),
                version: (document.querySelector('[data-t="footer-app-version"]')?.textContent ?? '').slice(0, 1000),
                build: (document.querySelector('[data-t="footer-build"]')?.textContent ?? '').slice(0, 1000),
                text: text.slice(0, 8000),
              };
            }),
          );
          report.dom = Object.fromEntries(Object.entries(dom).map(([key, value]) => [key, diagnosticText(value, key === 'text' ? 8000 : FIELD_LIMIT)]));
        } catch (problem) {
          failedCapture('dom', problem);
        }
        if (canWrite) {
          try {
            await page.screenshot({ path: join(diagnosticsDir, 'failure.png'), mask: [page.locator('input,textarea,select')], timeout: CAPTURE_TIMEOUT });
          } catch (problem) {
            failedCapture('screenshot', problem);
          }
        }
      }
      if (canWrite) {
        try {
          writeFileSync(join(diagnosticsDir, 'diagnostics.json'), JSON.stringify(report, null, 2) + '\n');
        } catch (problem) {
          failedCapture('write', problem);
        }
      }
      log({ deploymentSmokeFailure: report });
    },
  };
}
