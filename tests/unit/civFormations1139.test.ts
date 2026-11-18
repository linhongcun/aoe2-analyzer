import { describe, expect, it } from 'vitest';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation, publishedFormations } from '../../src/domain/civFormations';
import { resolveFormationSource } from '../../src/domain/civFormationsSource.mjs';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;
const catalog = async () => ({ core: await loadCore(), trees: await loadTrees() });

describe('#1139 文明路线契约与投影', () => {
  it('发布 26 个新增文明与四条回归路线，不包含魏蜀吴', () => {
    expect(civFormationContent).toHaveLength(28);
    expect(civFormationContent.flatMap(({ routes }) => routes)).toHaveLength(43);
    expect(['Wei', 'Shu', 'Wu'].some((name) => civFormationContent.some((entry) => entry.civ === name))).toBe(false);
    expect(civFormationContent.slice(0, 2).map(({ civ, routes }) => [civ, routes.length])).toEqual([
      ['Spanish', 3],
      ['Georgians', 1],
    ]);
    expect(Object.fromEntries(civFormationContent.slice(2).map(({ civ, routes }) => [civ, routes.length]))).toEqual({
      Chinese: 2,
      Hindustanis: 1,
      Turks: 2,
      Byzantines: 1,
      Malians: 1,
      Malay: 2,
      Sicilians: 1,
      Goths: 1,
      Koreans: 2,
      Jurchens: 1,
      Saxons: 1,
      Teutons: 3,
      Franks: 3,
      Vietnamese: 1,
      Lithuanians: 1,
      Poles: 3,
      Bulgarians: 1,
      Magyars: 1,
      Bohemians: 1,
      Aztecs: 1,
      Incas: 2,
      Mayans: 1,
      Mapuche: 2,
      Muisca: 1,
      Tupi: 2,
      Japanese: 1,
    });
  });

  it('所有固定目录实体按各路线与显式阶段可用，路线来源逐条解析', async () => {
    const resources = await catalog();
    for (const content of civFormationContent) {
      for (const item of publishedFormations(content)) {
        const view = projectFormation(item, content.civ, DATA_PATCH, resources, content.routes, content.source);
        expect(resolveFormationSource(content.source, item)).toBeTruthy();
        expect(view.status, `${content.civ}/${item.id}`).toBe('current');
        if (view.status !== 'current') continue;
        expect(view.required.length).toBe(item.required.length);
        expect(view.prerequisites.length).toBe(item.prerequisites.length);
        expect(view.required.map(({ entity }) => entity.id)).toEqual(item.required.map(({ id }) => id));
        expect(view.prerequisites.map(({ entity }) => entity.id)).toEqual(item.prerequisites.map(({ id }) => id));
        expect(view.choices.map(({ id, entities }) => [id, entities.map(({ entity }) => entity.id)])).toEqual(
          (item.choices ?? []).map(({ id, entities }) => [id, entities.map(({ id: entityId }) => entityId)]),
        );
        expect(view.supplements.map(({ entities }) => entities.map(({ entity }) => entity.id))).toEqual(
          item.supplements.map(({ entities }) => entities.map(({ id }) => id)),
        );
      }
    }
  });

  it('保留 Malay 独立帝王缺金剑士路线、年龄推进和前置', async () => {
    const progression = route('Malay', 'malay-battle-elephant-progression');
    const swords = route('Malay', 'malay-two-handed-swordsman-sustain');
    expect([progression.age, progression.composition, progression.required.map((ref) => [ref.id, ref.age ?? progression.age])]).toEqual([
      3,
      'progression',
      [
        [1132, 3],
        [1134, 4],
      ],
    ]);
    expect([swords.age, swords.composition, swords.required.map((ref) => ref.id)]).toEqual([4, 'combined', [473]]);
    expect(swords.condition).toContain('强征兵役');
    expect(swords.prerequisites.map((ref) => ref.id)).toEqual([625]);
    const resources = await catalog();
    const view = projectFormation(progression, 'Malay', DATA_PATCH, resources, byCiv('Malay').routes, byCiv('Malay').source);
    expect(view.status).toBe('current');
    if (view.status === 'current') expect(view.required.map((ref) => ref.age)).toEqual([3, 4]);
  });

  it('波兰骑士线路明确逐龄推进，土耳其骑射/亲兵是独立择一卡', () => {
    const poles = route('Poles', 'poles-discount-knights');
    expect([poles.age, poles.composition, poles.required.map((ref) => [ref.id, ref.age ?? poles.age])]).toEqual([
      3,
      'progression',
      [
        [38, 3],
        [283, 4],
      ],
    ]);
    const turks = route('Turks', 'turks-existing-line-choice');
    expect(turks.composition).toBe('choice');
    expect(turks.required).toEqual([]);
    expect(turks.choices?.map(({ title, entities }) => [title, entities.map(({ id }) => id)])).toEqual([
      ['重装骑射手', [474]],
      ['精锐苏丹亲兵', [557]],
    ]);
    expect(route('Turks', 'turks-hussar-handcannon').id).not.toBe(turks.id);
  });

  it('攻城器和机制科技保持可选，西西里骑士只作延续调整', () => {
    const china = route('Chinese', 'china-fire-lancer-tower');
    expect(china.playtest).toBe('pending');
    expect([...china.required, ...china.prerequisites].some(({ id }) => id === 462)).toBe(false);
    expect(china.supplements.some((group) => group.entities.some(({ id }) => id === 462))).toBe(true);
    for (const civName of ['Byzantines', 'Koreans', 'Jurchens', 'Lithuanians']) {
      for (const item of byCiv(civName).routes) {
        const hasSiegeChoice = item.supplements.some((group) => group.entities.some(({ id }) => id === 36 || id === 331));
        if (!hasSiegeChoice) continue;
        expect(
          [...item.required, ...item.prerequisites].some(({ id }) => id === 36 || id === 331),
          `${civName}/${item.id}`,
        ).toBe(false);
      }
    }
    const sicilians = byCiv('Sicilians');
    expect(sicilians.routes).toHaveLength(1);
    expect(sicilians.routes[0]!.supplements.some((group) => group.mode === 'continuation-adjustment' && group.entities.some(({ id }) => id === 283))).toBe(
      true,
    );
    expect(byCiv('Vietnamese').routes[0]!.supplements.every((group) => group.mode === 'conditional')).toBe(true);
    const vietnamese = byCiv('Vietnamese').routes[0]!;
    const imperialSkirmisher = vietnamese.supplements.flatMap(({ entities }) => entities).find(({ historicalName }) => historicalName === '帝王掷矛手');
    expect([imperialSkirmisher?.id, imperialSkirmisher?.age]).toEqual([1155, 4]);
    const bulgarians = route('Bulgarians', 'bulgarians-krepost-konnik');
    expect(bulgarians.condition).not.toMatch(/\b(?:1254|1225)\b/);
    expect(bulgarians.evidence.scope).toContain('1254');
  });

  it('候选与历史证据不升格：阿兹特克、印加候选分卡且保留印加主路', () => {
    const aztec = route('Aztecs', 'aztecs-eagle-skirmisher');
    expect(aztec.status).toBe('candidate');
    const main = route('Incas', 'incas-kamayuk-skirmisher');
    const candidate = route('Incas', 'incas-champi-candidate');
    expect(main.required.map(({ id }) => id)).toEqual([879, 6]);
    expect(candidate.status).toBe('candidate');
    expect(candidate.required.map(({ id }) => id)).toEqual([2554]);
    expect(candidate.prerequisites.map(({ id }) => id)).toEqual([517]);
    expect(candidate.title).toContain('蔷琵战士');
    expect(candidate.condition).toContain('弩炮');
    expect(candidate.condition).toContain('接敌与护卫');
    expect(candidate.evidence.playtest).toContain('实战未核实');
    expect(candidate.evidence.recognition).toContain('维护者已更正');
    expect(candidate.evidence.recognition).not.toContain('未经维护者确认');
    expect(resolveFormationSource(byCiv('Incas').source, candidate)?.discussion).toBe('https://app.devin.ai/sessions/998ba78b2edf4799bb383d10b7e8eef9');
    expect(byCiv('Koreans').routes.some(({ id }) => id.includes('crossbow-garrison'))).toBe(false);
  });

  it('印加主路的反弩炮调整只引用独立候选，候选缺实体或前置时使用保守回退', async () => {
    const resources = await catalog();
    const incas = byCiv('Incas');
    const main = route('Incas', 'incas-kamayuk-skirmisher');
    const candidate = route('Incas', 'incas-champi-candidate');
    expect(main.adjustments![2]!.requires).toEqual([{ kind: 'route', id: candidate.id }]);
    for (const text of [main.reason, main.limitation, main.attack, main.defense]) expect(text).not.toContain('蔷琵战士');

    const project = (catalogResources: Awaited<ReturnType<typeof catalog>>) =>
      projectFormation(main, 'Incas', DATA_PATCH, catalogResources, incas.routes, incas.source);
    const expectedFallback = main.adjustments![2]!.fallback;
    const current = project(resources);
    expect(current.status).toBe('current');
    if (current.status === 'current') {
      const adjustment = current.adjustments.find(({ id }) => id === main.adjustments![2]!.id);
      expect(adjustment).toMatchObject({ unavailable: true, text: expectedFallback });
      expect(adjustment?.text).not.toContain('蔷琵战士');
    }

    const missingUnit = { ...resources.core.unitById };
    delete missingUnit[2554];
    const withoutCandidateUnit = project({ core: { ...resources.core, unitById: missingUnit }, trees: resources.trees });
    expect(withoutCandidateUnit.status).toBe('current');
    if (withoutCandidateUnit.status === 'current')
      expect(withoutCandidateUnit.adjustments.find(({ id }) => id === main.adjustments![2]!.id)?.text).toBe(expectedFallback);

    const missingTech = { ...resources.core.techById };
    delete missingTech[517];
    const withoutCandidatePrerequisite = project({ core: { ...resources.core, techById: missingTech }, trees: resources.trees });
    expect(withoutCandidatePrerequisite.status).toBe('current');
    if (withoutCandidatePrerequisite.status === 'current')
      expect(withoutCandidatePrerequisite.adjustments.find(({ id }) => id === main.adjustments![2]!.id)?.text).toBe(expectedFallback);
  });

  it('required、前置或 choice 分支按其有效时代整卡不可用，可选补充仅局部隐藏', async () => {
    const resources = await catalog();
    const malay = byCiv('Malay');
    const progression = route('Malay', 'malay-battle-elephant-progression');
    const byUnit = { ...resources.core.unitById };
    delete byUnit[1134];
    expect(
      projectFormation(progression, 'Malay', DATA_PATCH, { core: { ...resources.core, unitById: byUnit }, trees: resources.trees }, malay.routes, malay.source)
        .status,
    ).toBe('unavailable');
    const inheritedAge = structuredClone(progression);
    delete inheritedAge.required[1]!.age;
    expect(projectFormation(inheritedAge, 'Malay', DATA_PATCH, resources, malay.routes, malay.source).status).toBe('unavailable');

    const swords = route('Malay', 'malay-two-handed-swordsman-sustain');
    const unitById = { ...resources.core.unitById };
    delete unitById[36];
    const optionalMissing = projectFormation(
      swords,
      'Malay',
      DATA_PATCH,
      { core: { ...resources.core, unitById }, trees: resources.trees },
      malay.routes,
      malay.source,
    );
    expect(optionalMissing.status).toBe('current');
    if (optionalMissing.status === 'current') {
      const ids = optionalMissing.supplements.flatMap((group) => group.entities.map(({ entity }) => entity.id));
      expect(ids).not.toContain(36);
      expect(ids).toContain(359);
    }

    const turks = byCiv('Turks');
    const choiceRoute = route('Turks', 'turks-existing-line-choice');
    const choicesMissing = { ...resources.core.unitById };
    delete choicesMissing[557];
    expect(
      projectFormation(
        choiceRoute,
        'Turks',
        DATA_PATCH,
        { core: { ...resources.core, unitById: choicesMissing }, trees: resources.trees },
        turks.routes,
        turks.source,
      ).status,
    ).toBe('unavailable');

    const candidate = route('Incas', 'incas-champi-candidate');
    const techById = { ...resources.core.techById };
    delete techById[517];
    expect(
      projectFormation(
        candidate,
        'Incas',
        DATA_PATCH,
        { core: { ...resources.core, techById }, trees: resources.trees },
        byCiv('Incas').routes,
        byCiv('Incas').source,
      ).status,
    ).toBe('unavailable');
  });

  it('草稿不公开；unverified 即使版本失配也只投影来源与待核实文字', () => {
    const content = byCiv('Chinese');
    const approved = route('Chinese', 'china-chu-ko-nu');
    const draftContent = { ...content, routes: [{ ...approved, status: 'draft' as const }] };
    expect(publishedFormations(draftContent)).toEqual([]);
    expect(projectFormation(draftContent.routes[0]!, 'Chinese', DATA_PATCH).status).toBe('draft');

    const unverified = { ...approved, status: 'unverified' as const, patch: { ...approved.patch, build: approved.patch.build - 1 } };
    const view = projectFormation(unverified, 'Chinese', DATA_PATCH, undefined, [], content.source);
    expect(view.status).toBe('unverified');
    if (view.status === 'unverified') {
      expect(view).not.toHaveProperty('route');
      expect(view).not.toHaveProperty('required');
      expect(view.pendingText).toContain('待核实');
      expect(view.source?.content).toContain('8d1adeacc7c97374ee6d95d9cabfceb793d080d3');
    }
  });

  it('路线依赖按目标时代和前置判断，候选依赖只在候选边界内可见', async () => {
    const resources = await catalog();
    const spanish = byCiv('Spanish');
    const base = route('Spanish', 'paladin-skirmisher');
    const dependency = { kind: 'route' as const, id: 'candidate-target' };
    const candidateTarget = {
      ...route('Spanish', 'handcannon-halberdier'),
      id: dependency.id,
      status: 'candidate' as const,
      condition: '只在织物盾完成并有安全接敌时使用。',
    };
    const candidateParent = {
      ...base,
      status: 'candidate' as const,
      adjustments: [{ ...base.adjustments![0]!, text: '仅在候选条件成立时引用。', requires: [dependency] }],
    };
    const view = projectFormation(candidateParent, 'Spanish', DATA_PATCH, resources, [...spanish.routes, candidateTarget], spanish.source);
    expect(view.status).toBe('current');
    if (view.status === 'current')
      expect(view.adjustments[0]).toMatchObject({ text: '仅在候选条件成立时引用。', candidateBoundary: candidateTarget.condition });

    const unconditional = projectFormation(
      { ...candidateParent, status: 'approved' },
      'Spanish',
      DATA_PATCH,
      resources,
      [...spanish.routes, candidateTarget],
      spanish.source,
    );
    expect(unconditional.status).toBe('current');
    if (unconditional.status === 'current') expect(unconditional.adjustments[0]).toMatchObject({ unavailable: true, text: '避开正面接战。' });

    const wrongAge = {
      ...candidateTarget,
      age: 3 as const,
      required: [{ kind: 'unit' as const, id: 773, historicalName: '精锐西班牙征服者', role: '候选测试' }],
    };
    const ageChecked = projectFormation(candidateParent, 'Spanish', DATA_PATCH, resources, [...spanish.routes, wrongAge], spanish.source);
    expect(ageChecked.status).toBe('current');
    if (ageChecked.status === 'current') expect(ageChecked.adjustments[0]).toMatchObject({ unavailable: true });

    const unverifiedTarget = { ...candidateTarget, status: 'unverified' as const };
    const blockedTarget = projectFormation(candidateParent, 'Spanish', DATA_PATCH, resources, [...spanish.routes, unverifiedTarget], spanish.source);
    expect(blockedTarget.status).toBe('current');
    if (blockedTarget.status === 'current') expect(blockedTarget.adjustments[0]).toMatchObject({ unavailable: true });
    const draftTarget = { ...candidateTarget, status: 'draft' as const };
    const draftDependency = projectFormation(candidateParent, 'Spanish', DATA_PATCH, resources, [...spanish.routes, draftTarget], spanish.source);
    expect(draftDependency.status).toBe('current');
    if (draftDependency.status === 'current') expect(draftDependency.adjustments[0]).toMatchObject({ unavailable: true });

    const incas = byCiv('Incas');
    const incaMain = route('Incas', 'incas-kamayuk-skirmisher');
    const incaTarget = { ...route('Incas', 'incas-champi-candidate'), id: 'incas-dependency-target', status: 'approved' as const };
    const incaParent = {
      ...incaMain,
      adjustments: [
        {
          id: 'anti-siege',
          when: '弩炮',
          text: '仅在目标路线可用时引用。',
          requires: [{ kind: 'route' as const, id: incaTarget.id }],
          fallback: '保持已认可主路。',
        },
      ],
    };
    const techById = { ...resources.core.techById };
    delete techById[517];
    const missingPrerequisite = projectFormation(
      incaParent,
      'Incas',
      DATA_PATCH,
      { core: { ...resources.core, techById }, trees: resources.trees },
      [...incas.routes, incaTarget],
      incas.source,
    );
    expect(missingPrerequisite.status).toBe('current');
    if (missingPrerequisite.status === 'current') expect(missingPrerequisite.adjustments[0]).toMatchObject({ unavailable: true, text: '保持已认可主路。' });
  });
});
