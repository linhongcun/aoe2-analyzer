/** Explicit omission is shared by current opening, share and source-usage presentation. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { civs } from '../../src/data';
import { buildOrders } from '../../src/data/buildOrders';
import { bonusTechs, bonusUsage } from '../../src/domain/bonusUsage';
import { civBonuses } from '../../src/domain/civBonus';
import { civSimNotes, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { simSupport } from '../../src/domain/simSupport';
import { buildShareCard, type ShareInput } from '../../src/features/builds/shareCard';
import { validateDocument } from '../../scripts/content-schema.mjs';
import source from './fixtures/jurchens197-source.json';
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const NOTE = '按资源不耗尽估算，尸体腐烂与耗尽未模拟，不腐烂收益未计入';
const KNIGHT = '女真没有骑士；骑士方案仅供通用模板经济估算。';
const jurchens = civs.find((c) => c.en === 'Jurchens')!;
const order = (id: string) => buildOrders.find((bo) => bo.id === id)!;
const input = (id: string): ShareInput => ({
  view: { top: null, timeout: false, tcIdleTotal: 0 } as ShareInput['view'],
  target: undefined,
  boId: id,
  boNameZh: order(id).name.zh,
  civEn: 'Jurchens',
  civZh: '女真',
  targetZh: order(id).target.age === 3 ? '城堡' : '封建',
  dist: 4,
  defaultDist: 4,
  house: true,
  patchBuild: __DATA_SOURCES__.patch.build,
  siteRoot: 'example/',
});
describe('Jurchens current model and honest disclosures', () => {
  it('selector admits Jurchens while the other five incomplete civilizations remain disabled', () => {
    expect(simSupport('Jurchens')).toBe(true);
    for (const civ of ['Chinese', 'Gurjaras', 'Mapuche', 'Poles', 'Romans']) expect(simSupport(civ)).toBe(false);
  });
  it.each(buildOrders)('$id includes the no-decay boundary and only the Knight economic template has an extra warning', (bo) => {
    const expected = bo.id === 'fast-castle-knights' ? [NOTE, KNIGHT] : [NOTE];
    expect(civSimNotes(E, 'Jurchens', bo.id)).toEqual(expected);
    const tl = simulateBuild(bo, 'Jurchens', E, ups);
    for (const line of expected) expect(tl.model.assumptions).toContain(line);
    expect(tl.model.assumptions.join('；')).toContain('当前8套开局');
    if (bo.id !== 'fast-castle-knights') expect(tl.model.assumptions).not.toContain(KNIGHT);
    expect(tl.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    expect(tl.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
    const card = buildShareCard(input(bo.id));
    expect(card.basis).toBe(`按女真计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}\n${expected.join('\n')}`);
    expect(card.url).toContain('civ=Jurchens');
  });
  it('no-decay source usage stays off and discloses the omitted resource model', () => {
    const b = civBonuses(jurchens).find((x) => !x.team && x.idx === 0)!;
    expect(bonusTechs(b).techs).toContain(993);
    const line = bonusUsage(b).find((x) => x.tool === 'sim');
    expect(line).toMatchObject({ on: false });
    expect(line!.note).toContain('未计入');
    expect(line!.note).toContain('腐烂');
    expect(line!.note).toContain('耗尽');
    expect(line!.note).not.toContain('已计入');
  });
  it('siege and defensive upgrade usage says current openings do not research those targets', () => {
    const b = civBonuses(jurchens).find((x) => !x.team && x.idx === 3)!;
    expect(bonusTechs(b).techs).toContain(995);
    const line = bonusUsage(b).find((x) => x.tool === 'sim');
    expect(line).toMatchObject({ on: false });
    expect(line!.note).toMatch(/(当前|现有).*开局/);
    expect(line!.note).toMatch(/(未研究|不研究|不涉及)/);
    expect(line!.note).not.toContain('已计入');
  });
  it('malformed production source does not advertise the fully checked omission policy', () => {
    const e = structuredClone(E);
    e.civEco.Jurchens!.find((r) => r.tech === 993)!.effects.push({ kind: 'res', res: 91, op: 'add', v: 100 });
    expect(civSimNotes(e, 'Jurchens', 'scouts-18')).toEqual([]);
  });
  it('the data-eco reading boundary explicitly permits complete Jurchen raw context', () => {
    const e = structuredClone(eco);
    for (const id of [993, 995] as const) {
      const r = e.civEco.Jurchens.find((r) => r.tech === id)! as unknown as Record<string, unknown>;
      r.jurchenTech = structuredClone(source[String(id) as '993' | '995']);
    }
    expect(validateDocument('src/data/eco.json', e).valid).toBe(true);
  });
  it('Generic share fallback and other civilizations cannot inherit Jurchen caveats', () => {
    const i = { ...input('scouts-18'), civEn: 'Generic', civZh: '通用' };
    expect(buildShareCard(i).basis).toBe(`按通用计 · 走路 4 格 · 游戏版本 ${__DATA_SOURCES__.patch.build}`);
    expect(civSimNotes(E, 'Generic', 'fast-castle-knights')).not.toContain(NOTE);
    expect(civSimNotes(E, 'Britons', 'fast-castle-knights')).not.toContain(KNIGHT);
  });
});
