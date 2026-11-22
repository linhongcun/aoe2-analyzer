import { describe, expect, it } from 'vitest';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation, publishedFormations } from '../../src/domain/civFormations';
import { resolveFormationSource } from '../../src/domain/civFormationsSource.mjs';
import { assertDefinedProperties } from './civFormationsTestUtils';

const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;
const catalog = async () => ({ core: await loadCore(), trees: await loadTrees() });

describe('#1139 文明路线契约与投影', () => {
  it('保留 #1139 的 26 个新增文明与四条回归路线', () => {
    const originalContent = civFormationContent.filter(({ civ }) => !['Wei', 'Shu', 'Wu', 'Britons', 'Persians'].includes(civ));
    expect(originalContent).toHaveLength(28);
    expect(originalContent.flatMap(({ routes }) => routes)).toHaveLength(46);
    expect(originalContent.slice(0, 2).map(({ civ, routes }) => [civ, routes.length])).toEqual([
      ['Spanish', 3],
      ['Georgians', 1],
    ]);
    expect(Object.fromEntries(originalContent.slice(2).map(({ civ, routes }) => [civ, routes.length]))).toEqual({
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
      Vietnamese: 3,
      Lithuanians: 1,
      Poles: 3,
      Bulgarians: 1,
      Magyars: 1,
      Bohemians: 1,
      Aztecs: 2,
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

  it('高丽战车与驻塔路线、女真路线保留各自版本和实战边界', () => {
    const wagons = route('Koreans', 'koreans-war-wagon-halberdier');
    const garrison = route('Koreans', 'koreans-fire-lancer-garrison');
    const jurchens = route('Jurchens', 'jurchens-fire-lancer-tower');

    expect([wagons.status, wagons.playtest, wagons.composition, wagons.age, wagons.required.map(({ id }) => id)]).toEqual([
      'approved',
      'unreported',
      'combined',
      4,
      [829, 359],
    ]);
    expect(wagons.supplements).toHaveLength(1);
    expect(wagons.supplements[0]!.mode).toBe('as-needed');
    expect(wagons.supplements[0]!.condition).toBe('按需少量手推炮');
    expect(wagons.supplements[0]!.entities.map(({ id }) => id)).toEqual([36]);
    expect(wagons.evidence.recordedVersion).toBe('章节资料核对：v0.77.102 · DE 188329 · 84988dd；旧战车路线的单独对局版本未记录');
    expect(wagons.evidence.sourceLines).toEqual([171, 415, 419]);
    expect(wagons.evidence.scope).not.toContain('来源行');

    expect([garrison.status, garrison.playtest, garrison.composition, garrison.age, garrison.required.map(({ id }) => id)]).toEqual([
      'approved',
      'pending',
      'combined',
      4,
      [235, 1903],
    ]);
    expect(garrison.evidence.recognition).toContain('用户提出以火矛驻塔替换旧弩手驻塔的变体');
    expect(garrison.evidence.recognition).not.toContain('固定策略记录将此路线列为认可方案');
    expect(garrison.evidence.playtest).toContain('用户只观察到火矛驻塔会放箭');
    expect(garrison.evidence.playtest).toContain('新组合仍待实战验证');
    expect(garrison.evidence.playtest).toContain('没有逐箭计数、伤害或胜率验证');
    expect(garrison.evidence.recordedVersion).toBe(
      '章节综合资料核对：v0.77.102 · DE 188329 · 84988dd；鼓风炉机制补记：v0.77.105 · DE 188329（未记构建）；驻军预览复核：v0.99.0 · DE 188329 · 531df91',
    );
    expect(garrison.evidence.sourceLines).toEqual([527, 531, 535, 536, 537, 538, 540, 542, 544, 550, 551, 552, 553, 559, 560, 561, 562, 564, 566]);
    expect(garrison.evidence.scope).not.toContain('来源行');
    expect(garrison.required[0]!.role).toBe('主要固定远程火力与掩体');
    expect(garrison.required[1]!.role).toBe('驻塔增箭、出塔清冲车并保护塔和炮');
    expect(garrison.attack).toContain('先取得施工空间');
    expect(garrison.attack).toContain('保留撤退与维修资源');
    expect(garrison.attack).toContain('成型塔阵不能倒推为施工中的保护');
    expect(garrison.limitation).toContain('驻军仍占人口，建塔仍耗石');
    expect(garrison.limitation).toContain('出塔清冲车会减少驻塔火力');
    expect(garrison.limitation).toContain('站内理论预览，不含每箭伤害，未与客户端逐项核对');
    expect(garrison.limitation).toContain('塔能输出不等于可省略拆城堡手段');
    const longRange = garrison.adjustments?.find(({ when }) => when === '巨投、长射程火炮');
    expect(longRange?.text).toContain('约 13 射程的箭塔可压过 12 射程的普通手推炮');
    expect(longRange?.decision?.exception).toContain('火炮术后 14 射程的土耳其手推炮，塔射程不足');
    expect(garrison.limitation).not.toContain('14 射程');
    expect(garrison.limitation).toContain('鼓风炉缺口对火矛驻塔输出的影响仅为机制推断，待实战验证');
    expect(garrison.limitation).toContain('火矛出塔清冲车或接骑兵仍有近战攻击科技缺口');
    expect(garrison.limitation).not.toContain('主要固定远程火力与掩体');

    expect([jurchens.status, jurchens.playtest, jurchens.composition, jurchens.age, jurchens.required.map(({ id }) => id)]).toEqual([
      'approved',
      'pending',
      'combined',
      4,
      [235, 1903, 441],
    ]);
    expect(jurchens.evidence.recordedVersion).toBe('v0.77.105 · DE 188329 · cd9382c；驻军预览复核：v0.99.0 · DE 188329 · 531df91');
    expect(jurchens.evidence.scope).toContain('描述前线箭塔、驻塔火矛和翼骑主路');
    expect(jurchens.evidence.scope).not.toContain('来源行');
  });

  it('保留 Malay 独立帝王缺金剑士路线、年龄推进和前置', async () => {
    const progression = route('Malay', 'malay-battle-elephant-progression');
    assertDefinedProperties(progression, 'adjustments');
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
    expect(swords.condition).toContain('帝王后期/消耗局');
    expect(swords.condition).toContain('黄金不足');
    expect(swords.condition).toContain('强征兵役');
    expect(swords.prerequisites.map((ref) => ref.id)).toEqual([625]);
    expect(swords.reason).toContain('将民兵系黄金成本换为额外食物');
    expect(swords.reason).toContain('免费步兵护甲');
    expect(swords.limitation).toContain('科技本身仍耗食物和黄金');
    expect(swords.limitation).toContain('双手剑士与长戟兵都占食物');
    expect(swords.limitation).toContain('不能把双手剑士当作无条件肉盾或自动转型');
    expect(swords.status).toBe('approved');
    expect(swords.playtest).toBe('unreported');
    expect(swords.evidence.playtest).toContain('未确认用户亲自实战这套具体混编');
    expect(swords.evidence.playtest).toContain('本轮未做新模拟或实战验证');
    expect(swords.evidence.sourceLines).toEqual([355, 356, 357]);
    expect(swords.evidence.scope).not.toContain('来源行');
    const crossbowSupport = progression.adjustments.find(({ id }) => id === 'malay-battle-elephant-progression-adjustment-first')!;
    expect(crossbowSupport.requires).toEqual([{ kind: 'unit', id: 24, age: 3 }]);
    expect(crossbowSupport.fallback).toContain('隐藏该条件支援');
    const arbalesterSupport = progression.supplements.find(({ entities }) => entities.some(({ id }) => id === 492))!;
    expect(arbalesterSupport.mode).toBe('as-needed');
    expect(arbalesterSupport.condition).toContain('已有弩手基础');
    expect(arbalesterSupport.condition).toContain('不是固定第三主力');
    expect(arbalesterSupport.entities).toEqual([expect.objectContaining({ kind: 'unit', id: 492, historicalName: '劲弩手', age: 4 })]);
    expect(progression.required.map(({ id }) => id)).not.toContain(492);
    expect(progression.limitation).toContain('可用畜牧与骑兵鳞甲，但缺血统、骑兵锁甲和骑兵钢甲');
    expect(progression.limitation).toContain('劲弩需独立兵种线升级和射手攻防科技');
    expect(progression.status).toBe('approved');
    expect(progression.playtest).toBe('unreported');
    expect(progression.evidence.playtest).toContain('未确认用户亲自实战这套具体混编');
    expect(progression.evidence.playtest).toContain('本轮未做新模拟或实战验证');
    expect(progression.evidence.sourceLines).toEqual([355, 356, 357]);
    expect(progression.evidence.scope).not.toContain('来源行');
    const cavalrySupport = progression.supplements.find(({ entities }) => entities.some(({ id }) => id === 359))!;
    const siegeSupport = progression.supplements.find(({ entities }) => entities.some(({ id }) => id === 36))!;
    expect(cavalrySupport.mode).toBe('as-needed');
    expect(cavalrySupport.condition).toBe('按骑兵压力');
    expect(cavalrySupport.entities.map(({ id }) => id)).toEqual([359]);
    expect(cavalrySupport.condition).not.toMatch(/拆防|攻城/);
    expect(siegeSupport.mode).toBe('as-needed');
    expect(siegeSupport.condition).toContain('按拆防/反攻城需求');
    expect(siegeSupport.condition).toContain('手推炮需攻城武器厂生产');
    expect(siegeSupport.condition).not.toContain('攻城技师');
    expect(siegeSupport.condition).not.toContain('骑兵');
    expect(siegeSupport.entities.map(({ id }) => id)).toEqual([36]);
    const siegeEngineer = progression.supplements.find(({ mode }) => mode === 'mechanism-support')!;
    expect(siegeEngineer.condition).toContain('完成攻城技师研究后才生效');
    expect(siegeEngineer.condition).toContain('不是手推炮训练前置');
    expect(siegeEngineer.entities.map(({ id }) => id)).toEqual([377]);
    expect(siegeSupport.entities[0]!.role).toContain('攻城武器厂生产');
    expect(siegeSupport.entities[0]!.role).not.toContain('攻城技师');
    expect(progression.prerequisites).toEqual([]);
    expect(progression.required.map(({ id }) => id)).not.toContain(36);
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
    expect(turks.status).toBe('approved');
    expect(turks.playtest).toBe('unreported');
    expect(turks.required).toEqual([]);
    expect(turks.condition).toContain('已有骑射手或苏丹亲兵基础');
    expect(turks.condition).toContain('按条件择一延续为重装骑射手或精锐苏丹亲兵');
    expect(turks.condition).toContain('不为采用该延续路线从零另起兵线');
    expect(turks.condition).toContain('两者并非同时必需');
    expect(turks.reason).toContain('沿已有骑射手或苏丹亲兵基础按条件延续');
    expect(turks.reason).toContain('不必强转火枪');
    expect(turks.limitation).toContain('从零转重装骑射手仍需补升级与科技投入');
    expect(turks.limitation).toContain('贴身 PK 不能否定骑射手的射程和机动');
    expect(turks.limitation).toContain('苏丹亲兵依赖城堡产能和精锐升级');
    expect(turks.evidence.recordedVersion).toBe('v0.77.102 · DE 188329 · 84988dd');
    expect(turks.evidence.sourceLines).toEqual([273, 274, 277]);
    expect(turks.alternatives).toBeUndefined();
    expect(turks.choices?.map(({ title, entities }) => [title, entities.map(({ id }) => id)])).toEqual([
      ['重装骑射手', [474]],
      ['精锐苏丹亲兵', [557]],
    ]);
    expect(route('Turks', 'turks-hussar-handcannon').id).not.toBe(turks.id);
  });

  it('土耳其主路理由保留保存火枪与炮的经验，限制只含投入和工具核实边界', () => {
    const main = route('Turks', 'turks-hussar-handcannon');

    expect(main.reason).toContain('保存火枪与手推炮的投入');
    expect(main.reason).toContain('可补充的翼骑承担消耗');
    expect(main.limitation).toContain('抗箭不等于能硬穿长戟阵');
    expect(main.limitation).toContain('火枪与翼骑仍争食物');
    expect(main.limitation).toContain('手推炮推进时需要保护');
    expect(main.limitation).toContain('炮的属性不等于拆石质建筑所需时间');
    expect(main.limitation).toContain('目前攻城工具仅核验无甲城堡（2 个手推炮 11 次 / 65 秒）与无甲大型箭塔（1 个手推炮 9 次 / 52 秒）');
    expect(main.limitation).toContain('城镇中心、瞭望箭塔、石墙、城门及带石匠或建筑学配置仍待核实');
    expect(main.limitation).not.toMatch(/掩护、拦截|保存下来的输出核心|免费化学|14 射程|100 生命/);
    expect(main.alternatives).toBe('重装骑士不作默认替代：与翼骑职责重叠并增加黄金消耗。');
    expect(main.evidence.scope).not.toContain('来源行');
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
    const vietnamese = route('Vietnamese', 'vietnamese-defensive-tower');
    expect(vietnamese.supplements[0]!.mode).toBe('choice');
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

  it('中国主路保留未记录版本边界，理由与限制不串入火矛驻塔PK数据', () => {
    const main = route('Chinese', 'china-chu-ko-nu');
    const fireLancer = route('Chinese', 'china-fire-lancer-tower');
    const fireLancerAdjustments = fireLancer.adjustments ?? [];
    const mainText = `${main.reason} ${main.limitation}`;
    expect(main.evidence.sourceLines).toEqual([194, 196, 198]);
    expect(main.evidence.recordedVersion).toBe('原讨论的完整站点版本与构建未记录，不将后续版本补作原观察');
    expect(main.evidence.scope).toContain('原讨论的完整站点版本和构建未记录');
    expect(main.evidence.scope).not.toContain('来源行');
    expect(main.reason).toContain('经常使用精锐诸葛弩＋轻骑兵＋少量巨型投石机');
    expect(main.limitation).toContain('诸葛弩训练耗木金，轻骑耗食物');
    expect(main.reason).not.toContain('投入与边界');
    expect(main.limitation).not.toContain('投入与边界');
    expect(mainText).not.toMatch(/火矛|19\/85|48\/192|接触 PK/);
    expect(fireLancerAdjustments[0]!.text).toContain('火矛兵和长戟兵一起顶');
    expect(fireLancerAdjustments[0]!.text).toContain('19/85');
  });

  it('西西里萨金特配置作为基础主路，骑士延续保留为条件调整', () => {
    const sicilian = route('Sicilians', 'sicilians-serjeant-light-cavalry');
    const knightContinuation = sicilian.supplements.find(({ mode }) => mode === 'continuation-adjustment');

    expect(sicilian.condition).toBe('已认可的萨金特卫兵＋轻骑基础配置；按位置与资源扩展，已有骑士线的延续只是条件调整。');
    expect(sicilian.reason).toBe(
      '精锐萨金特卫兵（军士）＋轻骑兵＋少量巨型投石机。卫兵凭高护甲承担正面接战与输出；轻骑提供机动，清理可接近的射手和攻城器；巨投拆城堡等关键防御。',
    );
    expect(sicilian.limitation).toBe(
      '卫兵＋长戟可能一起受成群弩炮压制；减少所受额外伤害不等于减少所有基础伤害。轻骑已能完成清理任务时，优先用好已有兵种。卫兵与骑兵都争食物，步骑共享近战攻击但护甲和兵种升级分开；锁子甲、骑士线、城楼箭系各有新增投入。高护甲不代表卫兵必胜所有骑兵，城楼也受远程攻城和固定位置限制。',
    );
    expect(sicilian.evidence.scope).not.toContain('来源行');
    expect(knightContinuation?.condition).toContain('黄金和骑士科技允许');
  });

  it('条顿三路分别记录农田经济边界、本路线职责与限制', () => {
    const paladin = route('Teutons', 'teutons-paladin-skirmisher');
    const halberdier = route('Teutons', 'teutons-halberdier-handcannon');
    const knight = route('Teutons', 'teutons-elite-knight-skirmisher');
    assertDefinedProperties(paladin, 'attack', 'defense');
    assertDefinedProperties(halberdier, 'attack', 'defense');
    assertDefinedProperties(knight, 'attack', 'defense');
    const economicBoundary = '农田费用 -40% 降低建造和重播农田的木材成本，可支撑长期补兵，但不提升农作速度或产量。';

    for (const item of [paladin, halberdier, knight]) {
      expect(item.reason).toContain(economicBoundary);
      expect(item.evidence.sourceLines).toContain(547);
      expect(item.evidence.scope).not.toContain('来源行');
    }

    expect(paladin.limitation).toContain('游侠在帝王时代有 +2 近战护甲，但缺畜牧');
    expect(paladin.limitation).toContain('满科技射程 7');
    expect(paladin.limitation).toContain('不能替昂贵游侠吸收前线损耗');
    expect(paladin.limitation).not.toMatch(/条顿骑士|重装甲|城堡产能/);
    expect(paladin.attack).toContain('游侠＋精锐掷矛手');
    expect(paladin.defense).toContain('昂贵游侠');
    expect(paladin.attack + paladin.defense).not.toMatch(/火枪手|条顿骑士/);

    expect(halberdier.limitation).toBe('这条慢速路线怕弓手、骑射手和投石车。');
    expect(halberdier.attack).toContain('长戟兵＋火枪手');
    expect(halberdier.defense).toContain('长戟兵与火枪手');
    expect(halberdier.attack + halberdier.defense).not.toMatch(/游侠|精锐掷矛手|条顿骑士/);

    expect(knight.condition).toBe('近战重、狭口或已有阵地。');
    expect(knight.limitation).toContain('条顿骑士需要城堡产能');
    expect(knight.limitation).toContain('不等于必须反复前推城堡');
    expect(knight.attack).toContain('条顿骑士＋精锐掷矛手');
    expect(knight.defense).toContain('条顿骑士与精锐掷矛手');
    expect(knight.attack + knight.defense).not.toMatch(/游侠|火枪手|长戟兵/);
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
