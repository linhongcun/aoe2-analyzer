/** Short build/deployment checks; detailed interactions and four widths run once in CI. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const check = expect.configure({ timeout: 10_000 });
export function assertFooter(actual, expected) {
  assert.match(expected.commit, /^[0-9a-f]{40}$/);
  assert.equal(actual.version?.trim(), expected.version, 'Published version differs from the intended build');
  const build = actual.build?.match(/[0-9a-f]{7,40}/)?.[0];
  assert.ok(build && expected.commit.startsWith(build), 'Published build must identify the exact main commit');
}
export function smokeFeatures(features) {
  assert.ok(Array.isArray(features) && features.every((x) => typeof x === 'string'), 'Invalid feature smoke plan');
  return [...new Set(features.includes('all') ? ['units', 'simulator', ...features.filter((x) => x !== 'all')] : features)].sort();
}
/** Core full plans must exercise the supported build economy as well as page-local builds plans. */
export function needsBuildsSmoke(features) {
  return features.includes('all') || features.includes('builds');
}
export async function checkSite({ site, version, commit, features = [] }) {
  const root = new URL(site);
  assert.ok(['http:', 'https:'].includes(root.protocol), 'Smoke checks need an HTTP site');
  const browser = await chromium.launch();
  const errors = [];
  const visited = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const observe = (opened) => {
      opened.on('pageerror', (error) => errors.push(error.message));
      opened.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
    };
    observe(page);
    page.context().on('page', observe);
    const goto = async (route) => {
      const url = new URL(root);
      url.searchParams.set('_deployment_check', String(Date.now()));
      url.hash = route;
      await page.goto(url.href);
      await check(page.locator('[data-t="footer-app-version"]').first()).toBeVisible();
      assertFooter(
        {
          version: await page.locator('[data-t="footer-app-version"]').first().textContent(),
          build: await page.locator('[data-t="footer-build"]').first().textContent(),
        },
        { version, commit },
      );
      await check(page.locator('main h1, main h2').first()).toBeVisible();
      visited.push(route);
    };
    await goto('/');
    const metadata = JSON.parse(readFileSync(new URL('../src/data/page-metadata.json', import.meta.url), 'utf8'));
    const internalSourceText =
      /\b(?:sha(?:-?[0-9]+)?|csv|commit)\b|提交(?:号|哈希)?\s*[0-9a-f]{7,40}|\b(?:main|master)\s+[0-9a-f]{7,40}\b|src\/(?:content|data)\/|themkdemiiir\/aoe2-guide@/iu;
    if (needsBuildsSmoke(features)) {
      // Compare real rendered inventory at the same early step, before later build-resource waits diverge.
      const inventory = async () => {
        const detail = page.getByRole('region', { name: '步骤详情', exact: true });
        await check(detail).toBeVisible();
        const amount = async (resource) =>
          Number(
            await detail
              .locator(':scope > span')
              .filter({ hasText: new RegExp('^' + resource + '\\s') })
              .locator('b')
              .textContent(),
          );
        return { food: await amount('食物'), wood: await amount('木头'), gold: await amount('黄金') };
      };
      await goto('/builds?bo=drush-fc&step=8');
      const generic = await inventory();
      await goto('/builds?bo=drush-fc&civ=Portuguese&step=8');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按葡萄牙计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-t="civ-note"]')).toHaveText('采果兼产木材按连续收入估算');
      const portuguese = await inventory();
      assert.equal(portuguese.food, generic.food, 'Forager wood must preserve the main food income');
      assert.ok(portuguese.wood > generic.wood, 'Portuguese foragers must increase the actual wood stock');
      await page.locator('#tlciv').click();
      const picker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(picker.locator('[data-civ="Portuguese"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(picker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await goto('/builds?bo=drush-fc&civ=Portuguese&step=6');
      const eco = JSON.parse(readFileSync(new URL('../src/data/eco.json', import.meta.url), 'utf8'));
      const goldMultiplier = eco.civEco.Portuguese.find((row) => row.tech === 559).effects.find(
        (effect) => effect.target === 'class:' + eco.units['74'].class,
      ).v;
      await check(page.locator('[data-t="step-cost"]')).toContainText('黄金 ' + eco.units['74'].cost.Gold * goldMultiplier);
      const share = page.locator('[data-t="share-card-btn"]:visible').first();
      await check(share).not.toHaveAttribute('aria-disabled', 'true');
      await share.click();
      await check(page.locator('[data-t="share-card"]')).toContainText('按葡萄牙计');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Portuguese');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await goto('/duel?a=74.Portuguese.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveText('未计入：葡萄牙 采浆果同时产木头（采果兼产木材，未建模）');
      console.log(
        'Verified Portuguese economy: selectable, actual Food/Wood inventory, gold discount, share card, continuous estimate and unchanged real-cost boundary',
      );
      // This checkpoint has the same actual start clock for both civilizations; later clocks can diverge.
      await goto('/builds?bo=scouts-18&step=4');
      const genericWoodCheckpoint = await inventory();
      const genericClock = Number(await page.locator('[data-step="3"]').getAttribute('data-start-at'));
      await goto('/builds?bo=scouts-18&civ=Shu&step=4');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按蜀计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-t="civ-note"]')).toContainText('伐木兼产食物按连续收入估算');
      const knightNote = '蜀不能训练骑士；骑士方案仅供通用模板经济估算。';
      await check(page.locator('[data-t="civ-note"]')).toContainText(knightNote);
      const shu = await inventory();
      const shuClock = Number(await page.locator('[data-step="3"]').getAttribute('data-start-at'));
      assert.ok(Number.isFinite(genericClock) && genericClock > 0);
      assert.equal(shuClock, genericClock, 'Compare the actual same-clock checkpoint, not just the same step number');
      assert.equal(shu.wood, genericWoodCheckpoint.wood, 'Lumberjack food must preserve the primary wood stock at this checkpoint');
      assert.ok(shu.food > genericWoodCheckpoint.food, 'Shu lumberjacks must increase the actual food stock');
      await page.locator('#tlciv').click();
      const shuPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(shuPicker.locator('[data-civ="Shu"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(shuPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="share-card"]')).toContainText('按蜀计');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Shu');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await goto('/builds?bo=fast-castle-knights&civ=Shu');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="card-basis"]')).toContainText(knightNote);
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await goto('/duel?a=74.Shu.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveText('未计入：蜀 伐木同时产食物（伐木兼产食物，未建模）');
      console.log(
        'Verified Shu economy: same-clock actual Food/Wood inventory, selectable, share card, knight-template limit and unchanged real-cost boundary',
      );
      await goto('/builds?bo=drush-fc&step=10');
      const genericGold = await inventory();
      const genericGoldClock = Number(await page.locator('[data-step="9"]').getAttribute('data-start-at'));
      await goto('/builds?bo=drush-fc&civ=Malians&step=10');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按马里计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-t="civ-note"]')).toHaveText('采金交仓额外黄金按连续收入估算');
      const malians = await inventory();
      const maliansClock = Number(await page.locator('[data-step="9"]').getAttribute('data-start-at'));
      assert.ok(Number.isFinite(genericGoldClock) && genericGoldClock > 0);
      assert.equal(maliansClock, genericGoldClock, 'Malian gold stock must be compared at the same actual clock');
      assert.ok(malians.gold > genericGold.gold, 'Malian gold miners must increase the actual gold inventory');
      await page.locator('#tlciv').click();
      const maliansPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(maliansPicker.locator('[data-civ="Malians"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(maliansPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="share-card"]')).toContainText('按马里计');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Malians');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      // The pinned build has 2 houses, 4 farms and 2 TCs; compare actual paid amounts, including the half-price boundary.
      await goto('/builds?bo=fast-castle-boom&civ=Malians&step=1');
      await check(page.locator('[data-t="step-cost"]')).toContainText('木头 42');
      await goto('/builds?bo=fast-castle-boom&civ=Malians&step=8');
      await check(page.locator('[data-t="step-cost"]')).toContainText('木头 240');
      await goto('/builds?bo=fast-castle-boom&civ=Malians&step=13');
      await check(page.locator('[data-t="step-cost"]')).toContainText('木头 468');
      await check(page.locator('[data-t="step-cost"]')).toContainText('石头 200');
      await goto('/duel?a=74.Malians.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveText('未计入：马里 采金加成（存放黄金加成，未建模）');
      console.log(
        'Verified Malians economy: same-clock actual Gold inventory, selectable, share card, paid house/TC wood, unchanged farm cost and real-cost boundary',
      );
      for (const step of [4, 8]) {
        await goto(`/builds?bo=hybrid-fish-18&step=${step}`);
        const genericVarangianCheckpoint = await inventory();
        const genericVarangianClock = Number(await page.locator(`[data-step="${step - 1}"]`).getAttribute('data-start-at'));
        await goto(`/builds?bo=hybrid-fish-18&civ=Varangians&step=${step}`);
        await check(page.locator('[data-t="sum-civ"]')).toHaveText('按瓦兰吉人计');
        await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
        await check(page.locator('[data-t="civ-note"]')).toHaveText('牧羊、狩猎和捕鱼兼产黄金按连续收入估算');
        const varangianCheckpoint = await inventory();
        const varangianClock = Number(await page.locator(`[data-step="${step - 1}"]`).getAttribute('data-start-at'));
        assert.ok(Number.isFinite(genericVarangianClock) && genericVarangianClock > 0);
        assert.equal(varangianClock, genericVarangianClock, 'Compare Varangian inventory at the same actual clock');
        assert.equal(varangianCheckpoint.food, genericVarangianCheckpoint.food, 'Varangian extra gold preserves primary food income');
        assert.equal(varangianCheckpoint.wood, genericVarangianCheckpoint.wood);
        assert.ok(varangianCheckpoint.gold > genericVarangianCheckpoint.gold, 'Varangian food gathering must increase the actual gold inventory');
      }
      await page.locator('#tlciv').click();
      const varangianPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(varangianPicker.locator('[data-civ="Varangians"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(varangianPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="share-card"]')).toContainText('按瓦兰吉人计');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Varangians');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await goto('/duel?a=74.Varangians.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"]')).toBeVisible();
      await check(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveCount(0);
      console.log(
        'Verified Varangians economy: same-clock early and hybrid fishing Gold inventory, primary Food/Wood preserved, selectable, share card and original farm-based real cost',
      );
      await goto('/builds?bo=feudal-drush-18&step=9');
      const genericShepherd = await inventory();
      const genericShepherdClock = Number(await page.locator('[data-step="8"]').getAttribute('data-start-at'));
      await goto('/builds?bo=feudal-drush-18&civ=Tatars&step=9');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按鞑靼计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-t="civ-note"]')).toHaveText('牧羊按产量与工作率配对估算；新增羊和资源耗尽未模拟');
      const tatars = await inventory();
      const tatarClock = Number(await page.locator('[data-step="8"]').getAttribute('data-start-at'));
      assert.equal(genericShepherdClock, 379.6);
      assert.equal(tatarClock, genericShepherdClock, 'Compare paired shepherd income at the same actual clock');
      assert.equal(genericShepherd.food, 244);
      assert.equal(tatars.food, 245, 'Preserve the real1.00009 paired-data residual rather than normalize to1 or claim50% speed');
      assert.equal(tatars.wood, genericShepherd.wood);
      assert.equal(tatars.gold, genericShepherd.gold);
      await page.locator('#tlciv').click();
      const tatarPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(tatarPicker.locator('[data-civ="Tatars"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(tatarPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="share-card"]')).toContainText('按鞑靼计');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Tatars');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await goto('/civ/Tatars/bonus/0');
      await check(page.locator('#bonus [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await check(page.locator('#bonus [data-usage="sim"]')).toContainText('已计入牧羊产量与工作率配对；羊总量和耗尽未模拟');
      await goto('/civ/Tatars/bonus/2');
      await check(page.locator('#bonus')).toContainText('城镇中心会产生 2 头绵羊');
      await check(page.locator('#bonus [data-usage="sim"][data-on="true"]')).toHaveCount(0);
      await goto('/duel?a=74.Tatars.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"]')).toBeVisible();
      await check(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveCount(0);
      console.log(
        'Verified Tatars economy: same-clock379.6s Food245vs244, paired coefficients, selectable, share, correct sheep/TC attribution and original farm-based real cost',
      );
      await goto('/builds?bo=archers-19&civ=Mayans&step=1');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按玛雅计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-t="civ-note"]')).toContainText('资源产量与工作率配对估算；储量和耗尽未模拟');
      await check(page.locator('[data-t="civ-note"]')).toContainText('玛雅无马厩；侦察骑兵、骑士方案仅供通用模板经济估算');
      assert.deepEqual(await inventory(), { food: 150, wood: 200, gold: 100 });
      await check(page.getByRole('region', { name: '步骤详情', exact: true })).toContainText('5/5');
      await goto('/builds?bo=archers-19&civ=Mayans&step=8');
      assert.equal(Number(await page.locator('[data-step="7"]').getAttribute('data-start-at')), 571.9);
      assert.deepEqual(await inventory(), { food: 477, wood: 376, gold: 50 });
      const mayanDetail = page.getByRole('region', { name: '步骤详情', exact: true });
      await check(mayanDetail).toContainText('20/25');
      await check(
        mayanDetail
          .locator(':scope > span')
          .filter({ hasText: /^石头\s/ })
          .locator('b'),
      ).toHaveText('200');
      await page.locator('#tlciv').click();
      const mayanPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(mayanPicker.locator('[data-civ="Mayans"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(mayanPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      for (const bo of ['scouts-18', 'fast-castle-knights']) {
        await goto(`/builds?bo=${bo}&civ=Mayans`);
        await page.locator('[data-t="share-card-btn"]:visible').first().click();
        await check(page.locator('[data-t="card-basis"]')).toContainText('玛雅无马厩；侦察骑兵、骑士方案仅供通用模板经济估算');
        await check(page.locator('[data-t="card-url"]')).toContainText('civ=Mayans');
        await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      }
      await goto('/civ/Mayans/bonus/1');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('已计入资源产量与工作率配对；储量和耗尽未模拟');
      await goto('/duel?a=4.Mayans.4.f.&b=4.Franks.4.f.&m=t');
      const mayanUncounted = page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]');
      await check(mayanUncounted).toHaveCount(4);
      await check(mayanUncounted).toContainText(Array(4).fill('资源多持续 15%，不是采集变快，暂不计入'));
      console.log(
        'Verified Mayans economy: own4-villager150Food start,571.9s Food477/Wood376/Gold50/Stone200,pop20/25, paired-source explanation, both generic cavalry shares and original real-cost boundary; no pure-productivity Generic comparison claimed',
      );
      await goto('/builds?bo=fast-castle-boom&civ=Sicilians&step=13');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按西西里计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-t="civ-note"]')).toContainText('按实际施工形态计入城镇中心、城堡和防御工事加成');
      await check(page.locator('[data-t="civ-note"]')).toContainText('农田升级额外储量、耗尽和续种未模拟');
      assert.equal(Number(await page.locator('[data-step="12"]').getAttribute('data-start-at')), 932.6);
      assert.deepEqual(await inventory(), { food: 931, wood: 469, gold: 133 });
      const sicilianDetail = page.getByRole('region', { name: '步骤详情', exact: true });
      await check(sicilianDetail.locator(':scope > span').filter({ hasText: /^石头\s/ })).toHaveText('石头 300');
      await check(page.locator('[data-t="step-cost"]')).toContainText('木头 550');
      await check(page.locator('[data-t="step-cost"]')).toContainText('石头 200');
      await page.locator('#tlciv').click();
      const sicilianPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(sicilianPicker.locator('[data-civ="Sicilians"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(sicilianPicker.locator('[data-civ="Poles"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="share-card"]')).toContainText('按西西里计');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Sicilians');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await goto('/civ/Sicilians/bonus/4');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('实际施工工期');
      await goto('/civ/Sicilians/bonus/1');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'false');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('也未估算节省的木材');
      await goto('/construction?cv=1&building=109&civ=Sicilians&age=3&techs=&builders=1&baseline=1&tc=1&task=&walk=3&farm=0');
      await check(page.getByTestId('construction-seconds')).toHaveText('75 秒');
      await goto('/duel?a=74.Sicilians.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveText('未计入：西西里 农田食物储量（农田升级，未建模）');
      console.log(
        'Verified Sicilians economy: own932.6s Food931/Wood469/Gold133/Stone300, actual two-TC cost550Wood/200Stone, sourced75s one-builder TC, selector/share/source usage and original real-cost boundary',
      );
      await goto('/builds?bo=archers-19&civ=Wei&step=11');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按魏计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      assert.equal(Number(await page.locator('[data-step="10"]').getAttribute('data-start-at')), 744.6);
      assert.deepEqual(await inventory(), { food: 573, wood: 429, gold: 167 });
      const weiDetail = page.getByRole('region', { name: '步骤详情', exact: true });
      await check(weiDetail).toContainText('23/30');
      await check(weiDetail.locator(':scope > span').filter({ hasText: /^石头\s/ })).toHaveText('石头 200');
      await check(page.locator('[data-t="paid-villager-total"]')).toHaveAttribute('data-count', '17');
      await check(page.locator('[data-t="bonus-villager-total"]')).toHaveText('1个村民');
      const weiGrant = page.locator('[data-t="bonus-villager-event"]');
      await check(weiGrant).toHaveCount(1);
      await check(weiGrant).toHaveAttribute('data-at', '609.4');
      await check(weiGrant).toHaveAttribute('data-trigger', '202');
      assert.notEqual(Number(await weiGrant.getAttribute('data-at')), 584.5, 'Wei grant must use research completion, not its independently observed start');
      await check(page.locator('[data-t="civ-note"]')).toContainText('住房政策未经当前版本客户端实测');
      await check(page.locator('[data-t="civ-note"]')).not.toContainText('魏没有骑士');
      await page.locator('#tlciv').click();
      const weiPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(weiPicker.locator('[data-civ="Wei"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(weiPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await goto('/builds?bo=fast-castle-knights&civ=Wei');
      await check(page.locator('[data-t="civ-note"]')).toContainText('魏没有骑士；骑士方案仅供通用模板经济估算');
      await check(page.locator('.tl-summary li').nth(3).locator('b')).toHaveText('27');
      await check(page.locator('.tl-age[data-age="castle"]')).toContainText('27 村民 · 人口 28/35');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="card-basis"]')).toContainText('满住房仍计入赠送');
      await check(page.locator('[data-t="card-basis"]')).toContainText('未经当前版本客户端实测');
      await check(page.locator('[data-t="card-basis"]')).toContainText('魏没有骑士');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Wei');
      await goto('/civ/Wei/bonus/0');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('研究完成');
      await check(page.locator('#bonus .bonusbody [data-usage="gather"]')).toHaveAttribute('data-on', 'false');
      await check(page.locator('#bonus .bonusbody [data-usage="gather"]')).toContainText('赠送村民未计入真实成本');
      await goto('/duel?a=74.Wei.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"]')).toBeVisible();
      await check(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveCount(0);
      console.log(
        'Verified Wei economy: own744.6s Food573/Wood429/Gold167/Stone200 pop23/30; 17paid/1free, tech202 completion609.4 vs start584.5; Knight-template-only warning, client-untested housing disclosure, source usage and unchanged real-cost empty warning state',
      );
      await goto('/builds?bo=archers-19&civ=Bengalis&step=11');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按孟加拉计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      assert.equal(Number(await page.locator('[data-step="10"]').getAttribute('data-start-at')), 744.6);
      assert.deepEqual(await inventory(), { food: 623, wood: 429, gold: 181 });
      const bengaliDetail = page.getByRole('region', { name: '步骤详情', exact: true });
      await check(bengaliDetail).toContainText('23/30');
      await check(bengaliDetail.locator(':scope > span').filter({ hasText: /^石头\s/ })).toHaveText('石头 200');
      await check(page.locator('[data-t="paid-villager-total"]')).toHaveAttribute('data-count', '16');
      await check(page.locator('[data-t="bonus-villager-total"]')).toHaveText('2个村民');
      const bengaliGrant = page.locator('[data-t="bonus-villager-event"]');
      await check(bengaliGrant).toHaveCount(1);
      await check(bengaliGrant).toHaveAttribute('data-at', '584.4');
      await check(bengaliGrant).toHaveAttribute('data-trigger', '101');
      await check(bengaliGrant).toHaveAttribute('data-count', '2');
      assert.notEqual(Number(await bengaliGrant.getAttribute('data-at')), 454.4, 'Bengali grant must use reached age, not the independently observed click');
      await check(page.locator('.tl-age[data-age="feudal"]')).toContainText('21 村民 · 人口 22/25');
      await check(page.locator('[data-t="civ-note"]')).toContainText('每座已完成城镇中心');
      await check(page.locator('[data-t="civ-note"]')).toContainText('住房政策未经当前版本客户端实测');
      await check(page.locator('[data-t="civ-note"]')).not.toContainText('没有骑士');
      await page.locator('#tlciv').click();
      const bengaliPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(bengaliPicker.locator('[data-civ="Bengalis"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(bengaliPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await goto('/builds?bo=fast-castle-knights&civ=Bengalis');
      await check(page.locator('[data-t="civ-note"]')).toContainText('孟加拉没有骑士；骑士方案仅供通用模板经济估算');
      await check(page.locator('.tl-summary li').nth(3).locator('b')).toHaveText('27');
      await check(page.locator('.tl-age[data-age="castle"]')).toContainText('27 村民 · 人口 28/30');
      await check(page.locator('[data-t="bonus-villager-event"]')).toHaveCount(2);
      await check(page.locator('[data-t="bonus-villager-total"]')).toHaveText('4个村民');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="card-basis"]')).toContainText('每座完成城镇中心赠送2个村民');
      await check(page.locator('[data-t="card-basis"]')).toContainText('满住房仍计入赠送');
      await check(page.locator('[data-t="card-basis"]')).toContainText('未经当前版本客户端实测');
      await check(page.locator('[data-t="card-basis"]')).toContainText('孟加拉没有骑士');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Bengalis');
      await goto('/civ/Bengalis/bonus/0');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('到达新时代');
      await check(page.locator('#bonus .bonusbody [data-usage="gather"]')).toHaveAttribute('data-on', 'false');
      await check(page.locator('#bonus .bonusbody [data-usage="gather"]')).toContainText('赠送村民未计入真实成本');
      await goto('/duel?a=74.Bengalis.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"]')).toBeVisible();
      await check(page.locator('[data-t="rc-a"] [data-t="rc-unsupported"]')).toHaveCount(0);
      console.log(
        'Verified Bengalis economy: own744.6s Food623/Wood429/Gold181/Stone200 pop23/30; 16paid/2free, reachedFeudal584.4 vs click454.4; castle27/pop28/30 and4free; completed-TC/housing disclosure, Knight-template-only warning, source usage and original real-cost empty state',
      );
      await goto('/builds?bo=scouts-18&civ=Armenians&step=3');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按亚美尼亚计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-step="2"] .n')).toContainText('每辆骡车按60木、15食物计费');
      const armenianDetail = page.getByRole('region', { name: '步骤详情', exact: true });
      await check(armenianDetail.getByRole('link', { name: '骡车', exact: true })).toHaveAttribute('href', '#/building/1808');
      await check(armenianDetail.locator('[data-t="step-cost"]')).toContainText('食物 15');
      await check(armenianDetail.locator('[data-t="step-cost"]')).toContainText('木头 60');
      await check(page.locator('[data-t="civ-note"]')).toContainText('对应研究完成后');
      await page.locator('#tlciv').click();
      const armenianPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(armenianPicker.locator('[data-civ="Armenians"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(armenianPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await goto('/builds?bo=archers-19&civ=Armenians&step=9');
      await check(page.locator('[data-step="8"] .n')).toContainText('60木、15食物');
      await check(page.locator('[data-t="step-cost"]')).toContainText('木头 25');
      await check(page.getByRole('region', { name: '步骤详情', exact: true }).getByRole('link', { name: '骡车', exact: true })).toBeVisible();
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="card-basis"]')).toContainText('逐次改为付费骡车');
      await check(page.locator('[data-t="card-basis"]')).toContainText('对应研究完成后');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Armenians');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      for (const index of [0, 1]) {
        await goto('/civ/Armenians/bonus/' + index);
        await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
        await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText(index === 0 ? '逐次付费骡车费用' : '对应研究完成后');
      }
      await goto('/duel?a=74.Armenians.3.f.&b=74.Magyars.3.f.&m=t');
      await check(page.locator('[data-t="rc-a"]')).toContainText('需研究科技，未建模');
      console.log(
        'Verified Armenian economy: physical Mule Cart60Wood/15Food and source-backed site mapping, primary House cost preserved in compound block, research-completion disclosure, selectable/share/source usage, fixed-distance model disclosure and original real-cost boundary',
      );
      await goto('/builds?bo=scouts-18&civ=Georgians&step=1');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按格鲁吉亚计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      assert.deepEqual(await inventory(), { food: 200, wood: 200, gold: 100 });
      await check(page.getByRole('region', { name: '步骤详情', exact: true })).toContainText(/人口\s+4\/5/);
      await check(page.locator('[data-t="civ-note"]')).toContainText('开局已有1辆免费骡车，不占人口');
      await check(page.locator('[data-t="civ-note"]')).toContainText('原营地动作仍逐次新增付费骡车');
      await goto('/builds?bo=scouts-18&civ=Georgians&step=3');
      const georgianDetail = page.getByRole('region', { name: '步骤详情', exact: true });
      await check(georgianDetail.getByRole('link', { name: '骡车', exact: true })).toHaveAttribute('href', '#/building/1808');
      await check(georgianDetail.locator('[data-t="step-cost"]')).toContainText('食物 20');
      await check(georgianDetail.locator('[data-t="step-cost"]')).toContainText('木头 80');
      await page.locator('#tlciv').click();
      const georgianPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(georgianPicker.locator('[data-civ="Georgians"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(georgianPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await page.locator('[data-t="share-card-btn"]:visible').first().click();
      await check(page.locator('[data-t="card-basis"]')).toContainText('开局已有1辆免费骡车，不占人口');
      await check(page.locator('[data-t="card-basis"]')).toContainText('每辆80木、20食物');
      await check(page.locator('[data-t="card-basis"]')).toContainText('移动和自动复用未模拟');
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Georgians');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await goto('/civ/Georgians/bonus/0');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText('起始免费骡车与逐次付费骡车');
      console.log(
        'Verified Georgian economy: normal initial stock/population, separate starting free cart, paid80Wood/20Food cart, selectable civilization and consistent share/source disclosure',
      );
      const slavicFarmNote = '农田按供给上限连续估算，近距离可能低于原通用估算，不代表游戏内加成减益';
      await goto('/builds?bo=fast-castle-boom&civ=Slavs');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按斯拉夫计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-t="civ-note"]')).toHaveText(slavicFarmNote);
      await page.locator('#tlciv').click();
      const slavicPicker = page.getByRole('dialog', { name: '文明', exact: true });
      await check(slavicPicker.locator('[data-civ="Slavs"]')).toBeVisible();
      await check(slavicPicker.locator('[data-civ="Slavs"]')).not.toHaveAttribute('aria-disabled', 'true');
      await check(slavicPicker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      const slavicShare = page.locator('[data-t="share-card-btn"]:visible').first();
      await check(slavicShare).not.toHaveAttribute('aria-disabled', 'true');
      await slavicShare.click();
      await check(page.locator('[data-t="card-basis"]')).toContainText(slavicFarmNote);
      await check(page.locator('[data-t="card-url"]')).toContainText('civ=Slavs');
      await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      await goto('/builds?bo=scouts-18&civ=Slavs');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按斯拉夫计');
      await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      await check(page.locator('[data-t="civ-note"]')).toHaveCount(0);
      await goto('/civ/Slavs/bonus/0');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
      await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText(slavicFarmNote);
      console.log(
        'Verified Slavic public UI: fast-castle-boom summary, steady-estimate caveat and share URL; Slavs-enabled/Chinese-disabled selector; scouts without farm note; bonus0 simulation usage',
      );
      const khmerPrerequisiteNote = '当前开局免建筑前置已计入，显式建筑照常付费建造';
      const khmerFarmNote = '农田按免回仓与供给上限连续估算，结果可能低于原通用估算，不代表游戏内加成减益';
      for (const bo of ['fast-castle-boom', 'fast-castle-knights']) {
        await goto(`/builds?bo=${bo}&civ=Khmer`);
        await check(page.locator('[data-t="sum-civ"]')).toHaveText('按高棉计');
        await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
        await check(page.locator('[data-t="civ-note"]').filter({ hasText: khmerPrerequisiteNote })).toHaveCount(1);
        await check(page.locator('[data-t="civ-note"]').filter({ hasText: khmerFarmNote })).toHaveCount(1);
        if (bo === 'fast-castle-boom') {
          await page.locator('#tlciv').click();
          const picker = page.getByRole('dialog', { name: '文明', exact: true });
          await check(picker.locator('[data-civ="Khmer"]')).not.toHaveAttribute('aria-disabled', 'true');
          await check(picker.locator('[data-civ="Chinese"]')).toHaveAttribute('aria-disabled', 'true');
          await page.keyboard.press('Escape');
        }
        await page.locator('[data-t="share-card-btn"]:visible').first().click();
        await check(page.locator('[data-t="card-basis"]')).toContainText(khmerPrerequisiteNote);
        await check(page.locator('[data-t="card-basis"]')).toContainText(khmerFarmNote);
        await check(page.locator('[data-t="card-url"]')).toContainText('civ=Khmer');
        await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      }
      await goto('/builds?bo=scouts-18&civ=Khmer');
      await check(page.locator('[data-t="sum-civ"]')).toHaveText('按高棉计');
      await check(page.locator('[data-t="civ-note"]').filter({ hasText: khmerPrerequisiteNote })).toHaveCount(1);
      await check(page.locator('[data-t="civ-note"]').filter({ hasText: khmerFarmNote })).toHaveCount(0);
      for (const idx of [0, 1]) {
        await goto(`/civ/Khmer/bonus/${idx}`);
        await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'true');
        await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText(idx === 0 ? khmerPrerequisiteNote : khmerFarmNote);
      }
      console.log(
        'Verified Khmer public UI: both FC summaries, prerequisite and bounded-farm notes/share URLs; Khmer-enabled/Chinese-disabled selector; scouts prerequisite-only note; bonus0/1 simulation usage',
      );
    }
    if (features.includes('builds') || features.includes('all')) {
      const jurchenNote = '按资源不耗尽估算，尸体腐烂与耗尽未模拟，不腐烂收益未计入';
      const jurchenKnight = '女真没有骑士；骑士方案仅供通用模板经济估算。';
      for (const bo of ['scouts-18', 'fast-castle-knights']) {
        await goto(`/builds?bo=${bo}&civ=Jurchens`);
        await check(page.locator('[data-t="sum-civ"]')).toHaveText('按女真计');
        await check(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
        await check(page.locator('[data-t="civ-note"]')).toContainText(jurchenNote);
        if (bo === 'fast-castle-knights') await check(page.locator('[data-t="civ-note"]')).toContainText(jurchenKnight);
        else await check(page.locator('[data-t="civ-note"]')).not.toContainText(jurchenKnight);
        await page.locator('[data-t="share-card-btn"]:visible').first().click();
        await check(page.locator('[data-t="card-basis"]')).toContainText(jurchenNote);
        await check(page.locator('[data-t="card-url"]')).toContainText('civ=Jurchens');
        await page.getByRole('dialog', { name: '分享卡', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      }
      for (const idx of [0, 3]) {
        await goto(`/civ/Jurchens/bonus/${idx}`);
        await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toHaveAttribute('data-on', 'false');
        await check(page.locator('#bonus .bonusbody [data-usage="sim"]')).toContainText(idx === 0 ? '腐烂' : '当前8套开局');
      }
      console.log('Verified Jurchen public UI: explicit decay/exhaustion omission, no fake income, Knight economic-template warning, share URLs and both omitted bonus usages');
    }
    for (const feature of smokeFeatures(features)) {
      if (feature === 'builds') {
        const order = JSON.parse(readFileSync(new URL('../src/data/build-orders/scouts-18.json', import.meta.url), 'utf8'));
        for (const view of ['practice', 'print']) {
          await goto(`/builds?bo=scouts-18&view=${view}`);
          const sources = page.getByRole('region', { name: '开局来源与估算限制', exact: true });
          if (view === 'print') await page.emulateMedia({ media: 'print' });
          await check(sources).toBeVisible();
          await check(sources).not.toContainText(internalSourceText);
          await check(sources).toContainText('MIT License，© 2026 Mehmet Kaan Demir');
          await check(sources).toContainText('游戏内容 © Microsoft');
          await check(sources).toContainText('中文步骤说明为本项目原创表述，未复制原文');
          for (const source of order.sources) {
            await check(sources.getByRole('link', { name: source.title, exact: true })).toHaveAttribute('href', source.url);
            await check(sources).toContainText(source.url);
            await check(sources).toContainText(source.author);
            await check(sources).toContainText(source.accessed);
          }
          await page.emulateMedia({ media: 'screen' });
        }
        console.log('Verified public build sources: practice, print, public links, dates and complete MIT attribution');
      } else if (feature === 'gameGuide') {
        const guide = JSON.parse(readFileSync(new URL('../src/content/game-guide.json', import.meta.url), 'utf8'));
        const pinned = guide.sources['pinned-techs'];
        const version = pinned.version.match(/\bDE[0-9]+\b/u)?.[0];
        assert.ok(version, 'Fixed technology citation must retain its game version');
        await goto('/game-guide?v=1&card=ages&context=standard&victory=conquest');
        const sources = page.locator('.gg-sources');
        await sources.locator('summary').click();
        await check(sources).not.toContainText(internalSourceText);
        const fixed = sources.locator('.gg-source').filter({ has: page.getByRole('link', { name: pinned.title, exact: true }) });
        await check(fixed.getByRole('link', { name: pinned.title, exact: true })).toHaveAttribute('href', pinned.url);
        await check(fixed).toContainText(version);
        await check(fixed).toContainText(pinned.checkedAt);
        console.log('Verified public game-guide sources: DE version, checked date and fixed public link');
      } else if (feature === 'patches') {
        await goto('/patches/185872');
        const summary = page.locator('.patch-tree-summary');
        await summary.locator('summary').click();
        await check(summary.getByRole('link', { name: '萨拉森', exact: true })).toHaveAttribute('href', '#/tree/Saracens');
        await check(summary.locator('a[href="#/tech/54"]').first()).toBeVisible();
        const sources = JSON.parse(readFileSync(new URL('./data_sources.json', import.meta.url), 'utf8'));
        if (sources.patch.build === 185872) {
          const presets = page.getByRole('region', { name: '骑马弩兵与骑射手预置', exact: true });
          const configurations = [
            ['castle-britons-byzantines', 'a=2700.Britons.3..&b=39.Byzantines.3..&m=1'],
            ['castle-franks-byzantines', 'a=2700.Franks.3..&b=39.Byzantines.3..&m=1'],
            ['imperial-britons-byzantines', 'a=2701.Britons.4..&b=474.Byzantines.4..&m=1'],
          ];
          await check(presets).toBeVisible();
          await check(presets.locator('[data-preset]')).toHaveCount(3);
          await check(presets.getByRole('link', { name: '打开对照', exact: true })).toHaveCount(3);
          for (const [key, query] of configurations)
            await check(presets.locator(`[data-preset="${key}"]`).getByRole('link', { name: '打开对照', exact: true })).toHaveAttribute(
              'href',
              `#/duel?${query}`,
            );
          await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: root.origin });
          const franks = presets.locator('[data-preset="castle-franks-byzantines"]');
          await franks.getByRole('button', { name: /复制对照链接/ }).click();
          await check(franks.getByRole('status')).toHaveText('对照链接已复制。');
          const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
          assert.equal(copied.origin, root.origin);
          assert.equal(copied.pathname, new URL('duel/', root).pathname);
          assert.equal(copied.hash, '');
          assert.equal(copied.searchParams.toString(), configurations[1][1]);
          const fresh = await page.context().newPage();
          try {
            await fresh.goto(copied.href);
            for (const reload of [false, true]) {
              if (reload) await fresh.reload();
              await check(fresh.locator('#duel-res')).toBeVisible();
              assert.equal(new URL(fresh.url()).hash, `#/duel?${configurations[1][1]}`);
              await check(fresh.locator('#duel-a .duel-head')).toContainText('骑马弩兵');
              await check(fresh.locator('#duel-a .duel-head')).toContainText('法兰克');
              await check(fresh.locator('#duel-b .duel-head')).toContainText('骑射手');
              await check(fresh.locator('#duel-b .duel-head')).toContainText('拜占庭');
              for (const side of ['a', 'b']) {
                await check(fresh.locator(`#duel-${side} .duel-age`)).toHaveText('城堡时代');
                await check(fresh.locator(`#duel-${side}`).getByRole('radio', { name: '无科技', exact: true })).toHaveAttribute('aria-checked', 'true');
              }
              await check(fresh.getByRole('radio', { name: '1v1', exact: true })).toHaveAttribute('aria-checked', 'true');
            }
          } finally {
            await fresh.close();
          }
          console.log('Verified DE185872 presets: three exact links, real clipboard, stable Duel entry and refresh');
        }
      } else if (feature === 'matchup') {
        await goto('/matchup');
        await check(page.locator('#mres')).toBeVisible();
        for (const [id, civ] of [
          ['ma', 'Franks'],
          ['me', 'Britons'],
        ]) {
          await page.locator(`#${id}`).click();
          await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
        }
        await page.getByRole('link', { name: '骑士：用法兰克模拟', exact: true }).click();
        await check(page.locator('#simciv')).toHaveAttribute('data-value', 'Franks');
        await check(page.locator('#simage')).toHaveValue('4');
        await check(page.locator('#sim input[type="checkbox"]:checked')).toHaveCount(0);
      } else if (feature === 'duel') {
        const expand = () => page.locator('#duel details').evaluateAll((details) => details.forEach((element) => (element.open = true)));
        const duelHeadings = async () => {
          const result = await new AxeBuilder({ page }).include('#duel').withRules(['heading-order']).analyze();
          assert.deepEqual(result.violations, [], 'Published Duel headings skip a level');
          await check(page.locator('.duel-head').getByRole('heading', { level: 2 })).toHaveCount(2);
        };
        const sides = 'a=569.Franks.4.f.&b=359.Japanese.4.f.';
        await goto(`/duel?${sides}&m=1&be=1`);
        await check(page.locator('#duel-res')).toBeVisible();
        await duelHeadings();
        await expand();
        await duelHeadings();
        await goto(`/duel?${sides}&m=t&vil=10&min=10`);
        await check(page.locator('#duel-res')).toBeVisible();
        await expand();
        await page.locator('#duel-a [data-t="rc-basis-btn"]').click();
        await check(page.locator('#duel-a [data-t="rc-pop"]')).toBeVisible();
        await duelHeadings();
        await goto('/duel?a=569.Britons.4.f.&b=359.Japanese.4.f.&m=1');
        await check(page.locator('#duel-pending')).toBeVisible();
        await expand();
        await duelHeadings();
        const panelTitle = '科技模拟器 选择文明与科技，查看属性变化与累计研究费用';
        for (const [route, children] of [
          [
            '/unit/38/Franks/4/?tab=sim',
            ['马厩', '铁匠铺', '城堡（独特科技）', '城堡', '团队加成（开关）', '累计研究费用（0 项）', '克制加成 / Bonus damage', '护甲类别（防御）'],
          ],
          [
            '/building/82?tab=sim&civ=Britons&age=4',
            ['城堡', '铁匠铺', '城镇中心', '大学', '城堡（独特科技）', '团队加成（开关）', '累计研究费用（0 项）', '克制加成 / Bonus damage'],
          ],
        ]) {
          await goto(route);
          const panel = page.locator('#sim');
          await check(panel).toBeVisible();
          assert.deepEqual(
            await panel
              .getByRole('heading')
              .evaluateAll((headings) => headings.map((heading) => ({ tag: heading.tagName, text: heading.textContent.replace(/\s+/g, ' ').trim() }))),
            [{ tag: 'H3', text: panelTitle }, ...children.map((text) => ({ tag: 'H4', text }))],
            'Published shared simulator default headings changed',
          );
          const result = await new AxeBuilder({ page }).include('main').withRules(['heading-order']).analyze();
          const violations = await Promise.all(
            result.violations.map(async (violation) => ({
              id: violation.id,
              targets: await Promise.all(
                violation.nodes.map(async (node) => {
                  assert.equal(typeof node.target[0], 'string', 'Expected a document heading target');
                  return page.locator(node.target[0]).evaluate((heading) => ({ tag: heading.tagName, text: heading.textContent.replace(/\s+/g, ' ').trim() }));
                }),
              ),
            })),
          );
          assert.deepEqual(violations, [{ id: 'heading-order', targets: [{ tag: 'H3', text: panelTitle }] }], 'Published shared simulator baseline changed');
        }
        await goto('/unit/38');
        await page.locator('[data-t="rc-basis-btn"]').first().click();
        await check(page.locator('[data-t="rc-pop"]').getByRole('heading', { level: 4, name: '采集时间怎么算', exact: true })).toBeVisible();
        console.log('Verified Duel heading-order: default, expanded, time popup, unavailable; Unit/Building default headings and Unit Basis retained');
        await goto('/duel?a=569.Franks.4.f.0-1&b=359.Japanese.4.f.2&m=t&vil=19&min=13&bud=8800&be=1');
        const presets = page.getByRole('region', { name: '波希米亚预置对战', exact: true });
        const dataBuild = JSON.parse(readFileSync(new URL('./data_sources.json', import.meta.url), 'utf8')).patch.build;
        if (dataBuild === 185872) {
          const configurations = [
            { key: 'castle-hussite-mangonel', query: 'a=1704.Bohemians.3.c.&b=280.Franks.3.c.&m=1', a: '胡斯派战车', b: '轻型投石车', age: '城堡时代' },
            { key: 'imperial-hussite-onager', query: 'a=1706.Bohemians.4.c.&b=550.Franks.4.c.&m=1', a: '精锐胡斯派战车', b: '中型投石车', age: '帝王时代' },
          ];
          const selected = async (preset) => {
            await check(page.locator('#duel-res')).toBeVisible();
            assertFooter(
              {
                version: await page.locator('[data-t="footer-app-version"]').first().textContent(),
                build: await page.locator('[data-t="footer-build"]').first().textContent(),
              },
              { version, commit },
            );
            assert.equal(new URL(page.url()).hash, '#/duel?' + preset.query);
            for (const [side, unit, civ] of [
              ['a', preset.a, '波希米亚'],
              ['b', preset.b, '法兰克'],
            ]) {
              await check(page.locator('#duel-' + side + ' .duel-head')).toContainText(unit);
              await check(page.locator('#duel-' + side + ' .duel-head')).toContainText(civ);
              await check(page.locator('#duel-' + side + ' .duel-age')).toHaveText(preset.age);
              await check(page.locator('#duel-' + side).getByRole('radio', { name: '当前时代满科技', exact: true })).toHaveAttribute('aria-checked', 'true');
            }
            await check(page.getByRole('radio', { name: '1v1', exact: true })).toHaveAttribute('aria-checked', 'true');
          };
          await check(presets.locator('article[data-preset]')).toHaveCount(2);
          await check(presets).toContainText(/DE\s*185872/);
          await page.getByRole('button', { name: '查看波希米亚预置', exact: true }).click();
          await check(presets).toBeFocused();
          for (const preset of configurations) {
            const open = presets.locator('[data-preset="' + preset.key + '"]').getByRole('link', { name: '打开对照', exact: true });
            await check(open).toHaveAttribute('href', '#/duel?' + preset.query);
            await open.click();
            await selected(preset);
          }
          await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: root.origin });
          const before = page.url();
          const first = presets.locator('[data-preset="castle-hussite-mangonel"]');
          await first.getByRole('button', { name: /复制对照链接/ }).click();
          await check(first.getByRole('status')).toHaveText('对照链接已复制。');
          assert.equal(page.url(), before);
          const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
          assert.equal(copied.origin, root.origin);
          assert.equal(copied.pathname, new URL('duel/', root).pathname);
          assert.equal(copied.hash, '');
          assert.equal(copied.searchParams.toString(), configurations[0].query);
          await page.goto(copied.href);
          await selected(configurations[0]);
          await page.reload();
          await selected(configurations[0]);
          console.log(
            'Verified two DE185872 Bohemian presets: exact links, current-age settings, fresh query, discoverability, real clipboard, static entry and reload',
          );
        } else {
          await check(presets).toHaveCount(0);
          await check(page.getByRole('button', { name: '查看波希米亚预置', exact: true })).toHaveCount(0);
        }
      } else if (feature === 'simulator' || feature === 'simRoute') {
        await goto('/unit/38/Franks/4/?tab=sim');
        await check(page.locator('#simciv')).toHaveAttribute('data-value', 'Franks');
      } else if (feature === 'compare') {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: root.origin });
        await goto('/compare?a=Mapuche&b=Muisca');
        await check(page.locator('#ca')).toHaveAttribute('data-value', 'Mapuche');
        await page.locator('#ca').click();
        await page.getByRole('dialog', { name: '文明 A', exact: true }).locator('[role="option"][data-civ="Franks"]').click();
        await page.getByRole('button', { name: '复制链接', exact: true }).click();
        await check(page.locator('#compare .detail-copy [role="status"]')).toHaveText('链接已复制');
        const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
        assert.equal(copied.origin, root.origin);
        assert.equal(copied.pathname, new URL('compare/', root).pathname);
        assert.equal(copied.hash, '');
        assert.equal(copied.searchParams.get('a'), 'Franks');
        assert.equal(copied.searchParams.get('b'), 'Muisca');
        const fresh = await page.context().newPage();
        try {
          await fresh.goto(copied.href);
          await check(fresh.locator('#ca')).toHaveAttribute('data-value', 'Franks');
          await check(fresh.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
          await fresh.reload();
          await check(fresh.locator('#ca')).toHaveAttribute('data-value', 'Franks');
          await check(fresh.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
        } finally {
          await fresh.close();
        }
      } else {
        const route = '/' + feature.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        if (metadata[route]) {
          await goto(route);
          if (feature === 'units') {
            await check(page.locator('a[href^="#/unit/"]').first()).toBeVisible();
            for (const civ of ['Poles', 'Lithuanians']) {
              await goto(`/civ/${civ}`);
              const unique = page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: '独特单位', exact: true }) });
              const regional = page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: '区域单位', exact: true }) });
              await check(unique.getByRole('link', { name: '波兰翼骑兵', exact: true })).toHaveCount(0);
              await check(regional.getByRole('link', { name: '波兰翼骑兵', exact: true })).toHaveAttribute('href', `#/unit/1707/${civ}/4/`);
            }
            await goto('/unit/1707/Lithuanians/4/');
            await check(page.locator('.dhead-tags')).toContainText('区域单位');
          }
          if (feature === 'civs') {
            await check(page.locator('#grid .card').first()).toBeVisible();
            await goto('/civ/Franks');
            const regional = page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: '区域单位', exact: true }) });
            await check(page.locator('.dside .sideblk > h4').nth(1)).toHaveText('区域单位');
            await check(page.locator('.dmain').getByRole('heading', { name: '区域单位', exact: true })).toHaveCount(0);
            await check(regional.getByRole('link', { name: '骑马弩兵', exact: true })).toHaveAttribute('href', '#/unit/2700/Franks/3/');
            await check(regional.getByRole('link', { name: '重装骑马弩兵', exact: true })).toHaveAttribute('href', '#/unit/2701/Franks/4/');
            await goto('/civ/Japanese');
            await check(page.locator('.dside').getByRole('heading', { name: '独特单位', exact: true })).toBeVisible();
            await check(regional).toHaveCount(0);
            const buildings = page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: '区域建筑', exact: true }) });
            await check(buildings).toHaveCount(0);
            const unique = page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: '独特建筑', exact: true }) });
            await check(unique).toHaveCount(0);
            await check(page.locator('.dside .sideblk > h4').nth(1)).toHaveText('快速入口');
            await goto('/civ/Armenians');
            await check(page.locator('.dside .sideblk > h4').nth(2)).toHaveText('区域建筑');
            await check(page.locator('.dside .sideblk > h4').nth(3)).toHaveText('快速入口');
            await check(buildings.getByRole('link')).toHaveText(['骡车', '强化教堂']);
            await check(buildings.getByRole('link', { name: '强化教堂', exact: true })).toHaveAttribute('href', '#/building/1806?civ=Armenians&age=3');
            await check(page.locator('.dmain').getByRole('heading', { name: '区域建筑', exact: true })).toHaveCount(0);
            await check(unique).toHaveCount(0);
            await goto('/civ/Bulgarians');
            await check(unique.getByRole('link')).toHaveText(['营垒']);
            await check(unique.getByRole('link', { name: '营垒', exact: true })).toHaveAttribute('href', '#/building/1251?civ=Bulgarians&age=3');
            await check(regional).toHaveCount(0);
            await check(buildings).toHaveCount(0);
            await check(page.locator('.dside .sideblk > h4').nth(2)).toHaveText('快速入口');
            await check(page.locator('.dmain').getByRole('heading', { name: '独特建筑', exact: true })).toHaveCount(0);
          }
        }
      }
      assert.deepEqual(errors, [], 'Deployment smoke found browser errors');
    }
    assert.deepEqual(errors, [], 'Deployment smoke found browser errors');
    console.log(`Verified ${version} / ${commit.slice(0, 7)}: ${visited.join(', ')}`);
    return visited;
  } finally {
    await browser.close();
  }
}
async function main() {
  const position = process.argv.indexOf('--site');
  const site = position >= 0 ? process.argv[position + 1] : 'https://linhongcun.github.io/aoe2-analyzer/';
  const planPosition = process.argv.indexOf('--plan');
  const path = planPosition >= 0 ? process.argv[planPosition + 1] : process.env.CI_PLAN_PATH;
  const raw = path ? JSON.parse(readFileSync(path, 'utf8')) : { features: [] };
  const plan = raw.plan ?? raw;
  await checkSite({
    site,
    version: process.env.RELEASE_VERSION || `v${JSON.parse(readFileSync('package.json', 'utf8')).version}`,
    commit: process.env.EXPECTED_DEPLOYED_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    features: plan.features,
  });
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
