import { describe, expect, it } from 'vitest';
import baseline from './__fixtures__/notes-baseline.json';
import { SIM_NOTE_LIST, SIM_NOTES, type SimNote } from '../../src/domain/mechanismNotes';

describe('#800 备注注册表 SimNote', () => {
  it('所有导出的备注常量都有唯一 id、scope、status 和原文', () => {
    expect(SIM_NOTE_LIST.length).toBeGreaterThan(60);
    const ids = new Set<string>();
    for (const note of SIM_NOTE_LIST) {
      expect(note.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(note.id), note.id).toBe(false);
      ids.add(note.id);
      expect(note.scope).toMatch(/^(build-sim|ui)$/);
      expect(['verified', 'unverified', 'assumption']).toContain(note.status);
      expect(note.text.length).toBeGreaterThan(0);
      expect(SIM_NOTES[note.id]).toBe(note);
    }
  });

  it('注册表与迁移前基线逐字一致', () => {
    expect(SIM_NOTE_LIST).toEqual(baseline as SimNote[]);
  });
});
