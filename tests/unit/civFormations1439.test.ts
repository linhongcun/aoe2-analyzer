import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import formationContract from '../../data/reference/civ-formations-contract.json';
import { formationProblems } from '../../scripts/check-civ-formations.mjs';
import { isPublicSourceUrl } from '../../src/content/schema/policy.mjs';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { projectFormation, publishedFormations, type FormationView } from '../../src/domain/civFormations';
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import { FormationText } from '../../src/features/civs/components/CivFormations';

const DOC_SHA_1439 = 'e9de5773c335e61abced408011361b4e39b94de5';
const TARGET_CIVS = ['Mongols', 'Huns', 'Tatars', 'Khitans'] as const;

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;
const renderFormationText = (text: string) => renderToStaticMarkup(createElement(FormationText, { text }));

const BOUNDARY_SPLIT_RE =
  /<span class="num nw">[^<]*\d+\s*(?:个|名|只|座|条|辆)<\/span>\s*(?:[\u4e00-\u9fff]{1,10}?(?:兵|弩|炮|车|塔|民|船|象|士|手|侣|机|城|堡|从|厩|场|营|厂))|<span class="num nw">\d+\s*座[\u4e00-\u9fff]*(?:骑兵|火枪手|劲弩手|弩手|长戟兵|诸葛弩|飞刀女兵|冠军剑士|双手剑士|象兵|手推炮|骑射手)<\/span>|<span class="num nw">[+\-−]?\d+(?:\.\d+)?<\/span>\s*(?:远甲|移速|增箭|项|农|厩|厂|营|场)|<span class="num nw">[^<]*\d+\s*人<\/span>\s*口/g;
const UNWRAPPED_RELIC_OR_JIAN = /<span class="num nw">[^<]*\d[^<]*<\/span>\s*(?:圣物|件)/g;
const UNWRAPPED_ZHI = /<span class="num nw">[^<]*\d[^<]*<\/span>\s*只/g;
const BARE_NUM_DUI = /<span class="num nw">[+\-−]?\d+(?:\.\d+)?(?:\s*(?:\/|:|–|—|-|至|\u2192)\s*[+\-−]?\d+(?:\.\d+)?)*<\/span>\s*对/g;

function findFormationViolations(html: string): string[] {
  const hits: string[] = [];
  for (const m of html.matchAll(BOUNDARY_SPLIT_RE)) hits.push(m[0]);
  for (const m of html.matchAll(UNWRAPPED_RELIC_OR_JIAN)) hits.push(m[0]);
  for (const m of html.matchAll(UNWRAPPED_ZHI)) {
    const idx = m.index ?? 0;
    const before = html.slice(0, idx);
    const after = html.slice(idx + m[0].length);
    if (!(/预算\s*$/.test(before) && /^够/.test(after))) hits.push(m[0]);
  }
  for (const m of html.matchAll(BARE_NUM_DUI)) {
    const idx = m.index ?? 0;
    const before = html.slice(0, idx);
    const after = html.slice(idx + m[0].length);
    const allowed = /预算\s*$/.test(before) && /^\s*<span class="num nw">/.test(after);
    if (!allowed) hits.push(m[0]);
  }
  return hits;
}

describe('Issue 1439 草原骑射四国推荐阵容契约、结构投影、去重与文案守卫', () => {
  it('全站 37 国 76 路契约通过，仅四国钉 DOC_SHA_1439，原有 33 国零引用且去重计数不变量守恒', async () => {
    expect(formationProblems(civFormationContent, formationContract)).toEqual([]);
    expect(formationContract.fixedSourceCommit).toBe('8d1adeacc7c97374ee6d95d9cabfceb793d080d3');
    expect(civFormationContent).toHaveLength(37);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(76);

    const EXPECTED_RANGES: Record<(typeof TARGET_CIVS)[number], readonly [number, number]> = {
      Mongols: [1828, 1867],
      Huns: [1869, 1908],
      Tatars: [1910, 1949],
      Khitans: [1951, 1989],
    };

    const targetSet = new Set<string>(TARGET_CIVS);
    let targetRouteCount = 0;
    for (const civ of civFormationContent) {
      if (targetSet.has(civ.civ)) {
        const [startLine, endLine] = EXPECTED_RANGES[civ.civ as (typeof TARGET_CIVS)[number]];
        const expectedUrl = `https://github.com/linhongcun/aoe2-analyzer/blob/${DOC_SHA_1439}/role/game-strategy.md#L${startLine}-L${endLine}`;
        expect(civ.source.content, civ.civ).toBe(expectedUrl);
        expect(civ.source.discussion, civ.civ).toBe('https://github.com/linhongcun/aoe2-analyzer/issues/1439');
        expect(civ.routes, civ.civ).toHaveLength(2);
        for (const r of civ.routes) {
          targetRouteCount += 1;
          expect(r.source, `${civ.civ}/${r.id} inherits civ.source`).toBeUndefined();
          expect([r.status, r.playtest, r.age], `${civ.civ}/${r.id}`).toEqual(['approved', 'pending', 4]);
          expect(r.tabHint, `${civ.civ}/${r.id} tabHint`).toBeTruthy();
          expect(r.tabHint!.length, `${civ.civ}/${r.id} tabHint <= 48`).toBeLessThanOrEqual(48);
          expect(r.scenarios?.length ?? 0, `${civ.civ}/${r.id} scenarios`).toBeGreaterThanOrEqual(3);
          const lines = r.evidence.sourceLines ?? [];
          expect(lines.length, `${civ.civ}/${r.id} sourceLines`).toBeGreaterThan(0);
          for (let i = 0; i < lines.length; i += 1) {
            expect(lines[i], `${civ.civ}/${r.id} line ${lines[i]}`).toBeGreaterThanOrEqual(startLine);
            expect(lines[i], `${civ.civ}/${r.id} line ${lines[i]}`).toBeLessThanOrEqual(endLine);
            if (i > 0) expect(lines[i], `${civ.civ}/${r.id} ascending`).toBeGreaterThan(lines[i - 1]!);
          }
          const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
          expect(new Set(hrefs).size, `${civ.civ}/${r.id} unique href`).toBe(hrefs.length);
          for (const href of hrefs) expect(isPublicSourceUrl(href), `${civ.civ}/${r.id} ${href}`).toBe(true);
        }
      } else {
        expect(civ.source.content, civ.civ).not.toContain(DOC_SHA_1439);
        for (const r of civ.routes) expect(r.source?.content ?? '', `${civ.civ}/${r.id}`).not.toContain(DOC_SHA_1439);
      }
    }
    expect(targetRouteCount).toBe(8);

    const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
    const sharedCounts: Record<string, number> = {};
    for (const civ of civFormationContent) {
      const views: FormationView[] = publishedFormations(civ).map((r) => projectFormation(r, civ.civ, DATA_PATCH, { core, trees }, civ.routes, civ.source));
      expect(
        views.every((v) => v.status === 'current'),
        civ.civ,
      ).toBe(true);
      const deduped = dedupeFormationClauses(views);
      if (deduped.shared.length > 0) sharedCounts[civ.civ] = deduped.shared.length;
    }
    expect(sharedCounts).toEqual({ Teutons: 1, Franks: 2, Poles: 2, Mapuche: 5 });
  });

  it('四国路线选择分支、零城堡隔离与缺可选科技/单位降级投影符合预期', async () => {
    const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
    const dropUnit = (uid: number) => ({
      core: { ...core, unitById: Object.fromEntries(Object.entries(core.unitById).filter(([k]) => Number(k) !== uid)) },
      trees,
    });
    const dropTech = (tid: number) => ({
      core: { ...core, techById: Object.fromEntries(Object.entries(core.techById).filter(([k]) => Number(k) !== tid)) },
      trees,
    });

    // 蒙古零城堡路线：缺 choice 分支 1372/441 整卡不可用；缺城堡科技 6 操练仅降级补城局面与账本链接
    const mon = byCiv('Mongols');
    const monZero = route('Mongols', 'mongols-hca-zero-castle');
    expect(monZero.required.map(({ id }) => id)).toEqual([474]);
    expect(monZero.choices?.map(({ entities }) => entities.map(({ id }) => id))).toEqual([[1372], [441]]);
    for (const uid of [1372, 441] as const) {
      expect(projectFormation(monZero, 'Mongols', DATA_PATCH, dropUnit(uid), mon.routes, mon.source).status).toBe('unavailable');
    }
    const monNoDrill = projectFormation(monZero, 'Mongols', DATA_PATCH, dropTech(6), mon.routes, mon.source);
    expect(monNoDrill.status).toBe('current');
    if (monNoDrill.status === 'current') {
      const afterCastle = monNoDrill.scenarios.find((s) => s.id === 'after-castle-drill')!;
      expect(afterCastle.state).toBe('partial');
      expect(afterCastle.actionHint).toBeUndefined();
      expect(afterCastle.links).toEqual([]);
      expect(monNoDrill.evidenceLinks.some((l) => l.label.includes('10690'))).toBe(false);
      expect(monNoDrill.evidenceLinks.some((l) => l.label.includes('9740'))).toBe(true);
    }

    // 匈奴主路：缺 483 掠夺者时隐藏答刺罕马厩补充与答刺罕 PK 链接
    const hun = byCiv('Huns');
    const hunMain = route('Huns', 'huns-paladin-hca');
    const hunNoMarauders = projectFormation(hunMain, 'Huns', DATA_PATCH, dropTech(483), hun.routes, hun.source);
    expect(hunNoMarauders.status).toBe('current');
    if (hunNoMarauders.status === 'current') {
      expect(hunNoMarauders.supplements.flatMap((s) => s.entities.map((e) => e.entity.id))).not.toContain(887);
      const fort = hunNoMarauders.scenarios.find((s) => s.id === 'vs-fortifications')!;
      expect(fort.state).toBe('partial');
      expect(fort.actionHint).toBeUndefined();
    }

    // 鞑靼零城堡路线：缺 687 丝护甲时剔除补城档链接，保留零城堡无 687 链接
    const tat = byCiv('Tatars');
    const tatZero = route('Tatars', 'tatars-steppe-hca-zero-castle');
    const tatNoSilk = projectFormation(tatZero, 'Tatars', DATA_PATCH, dropTech(687), tat.routes, tat.source);
    expect(tatNoSilk.status).toBe('current');
    if (tatNoSilk.status === 'current') {
      expect(tatNoSilk.evidenceLinks.some((l) => l.label.includes('补城含丝护甲'))).toBe(false);
      expect(tatNoSilk.evidenceLinks.some((l) => l.label.includes('10090'))).toBe(false);
      expect(tatNoSilk.evidenceLinks.some((l) => l.label.includes('9790'))).toBe(true);
      expect(tatNoSilk.evidenceLinks.some((l) => l.label.includes('12/37'))).toBe(true);
    }

    // 契丹次路：缺 1006 札甲时隐藏含札甲 6240 账本与含札甲辽刀链接，保留 5490 基础净额
    const khi = byCiv('Khitans');
    const khiAlt = route('Khitans', 'khitans-liaodao-rocket-cart');
    const khiNoLamellar = projectFormation(khiAlt, 'Khitans', DATA_PATCH, dropTech(1006), khi.routes, khi.source);
    expect(khiNoLamellar.status).toBe('current');
    if (khiNoLamellar.status === 'current') {
      expect(khiNoLamellar.evidenceLinks.some((l) => l.label.includes('6240'))).toBe(false);
      expect(khiNoLamellar.evidenceLinks.some((l) => l.label.includes('5490'))).toBe(true);
    }
  });

  it('双边 FormationText 零拆词守卫覆盖全部正文、tabHint 与 scenarios 文本，且抗招降与未建模边界表述合规', () => {
    const mustReject = ['4 座马厩', '4 座靶场', '1 座攻城武器厂', '（57 名村民）', '6 远甲', '1.54 移速', '30 只', '30 对 33'];
    for (const bad of mustReject) {
      expect(findFormationViolations(renderFormationText(bad)).length, `mustReject: ${bad}`).toBeGreaterThan(0);
    }
    const mustAllow = [
      '持续生产 · 精锐蒙古突骑（城堡 2 座）＋翼骑兵（马厩 4 座）· 57 名村民（含征招）',
      '预算 3000 · 城堡 30 名契丹重装骑射手 对 33 名匈奴城堡骑射手（等资源负，敌剩 9/33）',
      '6/7 护甲',
    ];
    for (const ok of mustAllow) {
      expect(findFormationViolations(renderFormationText(ok)), `mustAllow: ${ok}`).toEqual([]);
    }

    let checkedRoutes = 0;
    for (const civName of TARGET_CIVS) {
      const civ = byCiv(civName);
      const civTexts = [civ.lead, civ.source.boundary];
      for (const text of civTexts) {
        expect(findFormationViolations(renderFormationText(text)), `${civName} civ text: ${text}`).toEqual([]);
      }
      for (const r of civ.routes) {
        checkedRoutes += 1;
        const texts = [
          r.title,
          r.tabHint,
          r.condition,
          r.reason,
          r.limitation,
          r.attack,
          r.defense,
          r.alternatives,
          r.evidence.scope,
          r.evidence.recognition,
          r.evidence.playtest,
          r.evidence.recordedVersion,
          ...r.required.flatMap(({ role, research }) => [role, research?.effect, research?.caveat]),
          ...(r.choices ?? []).flatMap(({ title, preconditions, entities }) => [title, ...preconditions, ...entities.map(({ role }) => role)]),
          ...(r.prerequisites ?? []).flatMap(({ role, condition }) => [role, condition]),
          ...(r.supplements ?? []).flatMap(({ condition, label, entities }) => [condition, label, ...entities.map(({ role }) => role)]),
          ...(r.adjustments ?? []).flatMap(({ when, text, fallback, decision }) => [
            when,
            text,
            fallback,
            decision?.condition,
            decision?.also,
            decision?.exception,
          ]),
          ...(r.scenarios ?? []).flatMap(({ chipLabel, actionHint, title, when, summary, caveats }) => [
            chipLabel,
            actionHint,
            title,
            when,
            summary,
            ...(caveats ?? []).map(({ text }) => text),
          ]),
          ...(r.evidence.links ?? []).map(({ label }) => label),
        ].filter((v): v is string => Boolean(v));

        for (const text of texts) {
          expect(findFormationViolations(renderFormationText(text)), `${civName}/${r.id} violation in: ${text}`).toEqual([]);
        }
      }
    }
    expect(checkedRoutes).toBe(8);

    // 维护者实战口径防回归：禁止「大后期怕僧侣海」类失真表述，鞑靼须限定抗招降窗口，契丹/鞑靼显性写清未建模项与官方译名
    const fourCivSerialized = JSON.stringify(TARGET_CIVS.map((name) => byCiv(name)));
    expect(fourCivSerialized).not.toMatch(/大后期怕僧侣海|怕僧侣海招降|答剌罕/);
    const tatarsSerialized = JSON.stringify(byCiv('Tatars'));
    expect(tatarsSerialized).toContain('城堡至帝王初期小规模精锐对拼或竞技场僧侣快攻');
    expect(tatarsSerialized).toContain('高海拔');
    expect(tatarsSerialized).toContain('攻击产金');
    const khitansSerialized = JSON.stringify(byCiv('Khitans'));
    expect(khitansSerialized).toContain('牧场效率尚未计入');
    expect(khitansSerialized).toContain('斡鲁朵骑兵');
    expect(khitansSerialized).toContain('25% 近战伤害');
    expect(khitansSerialized).toContain('落地燃烧');
    expect(khitansSerialized).toContain('多弹丸');
    expect(khitansSerialized).toContain('持续流血');
  });
});
