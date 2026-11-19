import { describe, expect, it } from 'vitest';
import { historyFixture } from '../helpers/civUpdatesFixture';
import { projectReaderEvents, readerNodes } from '../../src/domain/historyReader';
import { defaultHistoryVersions } from '../../src/shared/ui/useEntityHistory';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { UpdateEventCard } from '../../src/shared/ui/CivUpdates';

describe('inline entity history', () => {
  const data = historyFixture();
  for (const [id, events, versions] of [
    ['civ/Armenians', 12, 6],
    ['unit/1699', 7, 5],
    ['building/50', 1, 1],
    ['tech/463', 2, 2],
    ['tech/3', 0, 0],
  ] as const) {
    it(`preserves every projected event for ${id}`, () => {
      const entity = data.entities.find((row) => row.id === id)!;
      const views = projectReaderEvents(data, entity);
      const nodes = readerNodes(data, views, false);
      expect(views).toHaveLength(events);
      expect(nodes).toHaveLength(versions);
      expect(new Set(nodes.flatMap((node) => node.rows.map((view) => view.event.id))).size).toBe(events);
      expect(
        nodes
          .flatMap((node) => node.rows)
          .map((view) => view.event.id)
          .sort(),
      ).toEqual(views.map((view) => view.event.id).sort());
      expect(defaultHistoryVersions(nodes)).toHaveLength(versions <= 2 ? versions : 1);
      if (versions) expect(nodes[0]?.id).toBe(id === 'building/50' ? 'de-125283' : 'de-185872');
    });
  }
  it('opens zero, one, two, or only the latest of many versions', () => {
    expect(defaultHistoryVersions([])).toEqual([]);
    expect(defaultHistoryVersions([{ id: 'latest' }])).toEqual(['latest']);
    expect(defaultHistoryVersions([{ id: 'latest' }, { id: 'older' }])).toEqual(['latest', 'older']);
    expect(defaultHistoryVersions([{ id: 'latest' }, { id: 'older' }, { id: 'unknown' }])).toEqual(['latest']);
  });
  it('keeps missing dates missing and distinct effects separate', () => {
    const entity = data.entities.find((row) => row.id === 'tech/463')!;
    const nodes = readerNodes(data, projectReaderEvents(data, entity), false);
    expect(nodes.map((node) => node.version?.releaseDate)).toEqual([null, '2023-04-11']);
    expect(nodes[1]?.rows[0]?.event.claims.flatMap((claim) => claim.effects).length).toBeGreaterThan(1);
  });
  it('names the affected object for the Armenian Mule Cart cost change', () => {
    const entity = data.entities.find((row) => row.id === 'civ/Armenians')!;
    const view = projectReaderEvents(data, entity).find((row) => row.event.id === 'ev-se-9456ae2b-899a-4f1b-b1e5-5832d1dd8090')!;
    expect(view.event.versionId).toBe('de-99311');
    const markup = renderToStaticMarkup(
      h(
        MemoryRouter,
        null,
        h(UpdateEventCard, {
          data,
          event: view.event,
          sourceEvent: view.original,
          inline: { view, entity, evidenceOpen: false, toggleEvidence: () => undefined },
        }),
      ),
    );
    const effect = markup.split('data-history-effect="cl-se-9456ae2b-899a-4f1b-b1e5-5832d1dd8090-structured-1"')[1]!.split('</li>')[0]!;
    expect(effect).toContain('<div class="civ-update-entities">');
    expect(effect).toContain('href="/building/1808">骡车</a>');
    expect(effect).toContain('木材成本');
    expect(effect).toContain('100');
    expect(effect).toContain('80');
  });
  for (const id of ['tech/463', 'building/50']) {
    it(`uses projected effect scopes and claim verification for ${id}`, () => {
      const entity = data.entities.find((row) => row.id === id)!;
      for (const view of projectReaderEvents(data, entity)) {
        const markup = renderToStaticMarkup(
          h(
            MemoryRouter,
            null,
            h(UpdateEventCard, {
              data,
              event: view.event,
              sourceEvent: view.original,
              inline: { view, entity, evidenceOpen: false, toggleEvidence: () => undefined },
            }),
          ),
        );
        const scopes = [...new Set(view.event.claims.flatMap((claim) => claim.effects.map((effect) => (effect.scope ?? view.original.scope).scopeKind)))];
        for (const scope of scopes) expect(markup).toContain(`data-inline-scope="${scope}"`);
        const verification = view.event.claims.filter((claim) => claim.effects.length).map((claim) => claim.verification);
        for (const value of verification) expect(markup).toContain(`data-inline-verification="${value}"`);
        if (id === 'building/50') expect(scopes).toContain('team');
        expect(markup).toContain('依据与原文');
        expect(markup).not.toContain('<details class="civ-update-references" open');
      }
    });
  }
});
