import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Page } from '@playwright/test';

const raw = JSON.parse(readFileSync(new URL('../../src/content/events.json', import.meta.url), 'utf8'));

/** Replace the real seed array before the actual production reader validates it. */
export async function eventCatalogState(page: Page, state: 'empty' | 'unavailable') {
  let intercepted = false;
  await page.route(/\/assets\/Events-[^/]+\.js(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const source = ts.createSourceFile('events-bundle.js', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const arrays: ts.ArrayLiteralExpression[] = [];
    function visit(node: ts.Node) {
      if (
        ts.isArrayLiteralExpression(node) &&
        node.elements.some(
          (element) =>
            ts.isObjectLiteralExpression(element) &&
            element.properties.some(
              (property) =>
                ts.isPropertyAssignment(property) &&
                property.name.getText(source) === 'id' &&
                ts.isStringLiteral(property.initializer) &&
                property.initializer.text === 'the-garrison-2026',
            ),
        )
      )
        arrays.push(node);
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (arrays.length !== 1) throw new Error(`Expected one real event seed array, found ${arrays.length}`);
    const replacement = structuredClone(raw.events);
    if (state === 'empty') replacement.length = 0;
    else replacement[0].participants[0].playerId = 'unknown-event-participant';
    const array = arrays[0]!;
    await route.fulfill({ response, body: body.slice(0, array.getStart(source)) + JSON.stringify(replacement) + body.slice(array.end) });
    intercepted = true;
  });
  return () => intercepted;
}
