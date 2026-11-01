// #580：阿拉伯 1v1「全部」里每一家都有新手友好度。理由只复述站内加成原文，不看胜率。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { friendliness, TIER_LABEL, type BeginnerNotes, type LadderSnapshot } from '../../src/domain/ladder';

type CivFile = { en: string; bon: string[] };

const notes = JSON.parse(readFileSync('src/data/ladder-beginner.json', 'utf8')) as BeginnerNotes;
const civs = JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as CivFile[];
const snapshot = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const FILLED = new Set(['easy', 'mid', 'advanced']);
const KEPT_NOTE = '新手友好度是站内编辑口径，不由胜率推导。未列出的文明显示为待补；胜率仍只读天梯快照。';

function sentenceCount(text: string) {
  return text
    .split(/[。！？]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

/** 理由里要能对上所引加成的一段原文。短加成则整句都要出现。 */
function quotedLength(reason: string, bonus: string) {
  let best = 0;
  for (let start = 0; start < bonus.length; start += 1) {
    for (let end = bonus.length; end > start + best; end -= 1) {
      if (reason.includes(bonus.slice(start, end))) {
        best = end - start;
        break;
      }
    }
  }
  return best;
}

describe('天梯新手友好度补齐 #580', () => {
  it('口径注释保持原句', () => {
    expect(notes.note).toBe(KEPT_NOTE);
  });

  it('全部段每一家都有档名、一两句理由，且理由引用站内加成原文', () => {
    const all = snapshot.brackets.find((bracket) => bracket.key === 'all');
    expect(all?.civs.length).toBe(56);
    const byEn = new Map(notes.entries.map((entry) => [entry.en, entry]));
    expect(byEn.size).toBe(notes.entries.length);
    const civByEn = new Map(civs.map((civ) => [civ.en, civ]));

    for (const stat of all?.civs ?? []) {
      const entry = byEn.get(stat.en);
      expect(entry, stat.en).toBeTruthy();
      if (!entry) continue;
      expect(FILLED.has(entry.tier), `${stat.en} 档名`).toBe(true);
      expect(TIER_LABEL[entry.tier]).toMatch(/^(易上手|中等|进阶)$/);
      const reason = entry.reason?.trim() ?? '';
      const sentences = sentenceCount(reason);
      expect(sentences, `${stat.en} ${reason}`).toBeGreaterThanOrEqual(1);
      expect(sentences, `${stat.en} ${reason}`).toBeLessThanOrEqual(2);
      expect(reason, stat.en).not.toMatch(/胜率|出场率/);
      const civ = civByEn.get(stat.en);
      expect(civ, stat.en).toBeTruthy();
      expect(entry.bonusIdx?.length ?? 0, stat.en).toBeGreaterThan(0);
      for (const idx of entry.bonusIdx ?? []) {
        const bonus = civ?.bon[idx];
        expect(bonus, `${stat.en}#${idx}`).toEqual(expect.any(String));
        if (!bonus) continue;
        const need = Math.min(8, bonus.length);
        expect(quotedLength(reason, bonus), `${stat.en}#${idx} ${bonus}`).toBeGreaterThanOrEqual(need);
      }
      const shown = friendliness(stat.en, notes.entries);
      expect(shown.tier).toBe(entry.tier);
      expect(shown.reason).toBe(reason);
      expect(shown.bonusIdx).toEqual(entry.bonusIdx);
    }

    expect(notes.entries.filter((entry) => entry.tier === 'pending')).toEqual([]);
    for (const en of ['Romans', 'Vikings', 'Bulgarians', 'Wu']) {
      expect(FILLED.has(byEn.get(en)?.tier ?? ''), en).toBe(true);
    }
  });
});
