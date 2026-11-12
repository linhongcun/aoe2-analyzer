import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PatchEntry } from '../../src/domain/patches';
import { parseResourceChange, parseResourceValue, segmentUnchanged, type ValueSegment } from '../../src/domain/resourceValue';
import { ResourceValue } from '../../src/shared/ui/ResourceValue';

/** #956 基线 45 条；#955 核实通过的 14 条费用补上资源名后，显示图标的是 59 条。档案总数仍是 366。 */
const ICON_IDS = [
  '125283-002-003',
  '125283-003-004',
  '125283-019-024',
  '185872-14',
  '185872-24',
  '185872-25',
  '185872-27',
  '185872-37',
  '185872-40',
  '185872-41',
  '185872-42',
  '185872-43',
  '185872-46',
  '185872-48',
  '185872-49',
  '185872-51',
  '185872-54',
  '185872-55',
  '185872-59',
  '185872-61',
  '188329-1',
  '188329-3',
  '66692-001-001',
  '66692-002-002',
  '66692-005-006',
  '81058-5',
  '81058-6',
  '81058-7',
  '81058-12',
  '81058-17',
  '81058-19',
  '81058-23',
  '81058-24',
  '81058-38',
  '81058-43',
  '81058-49',
  '81058-61',
  '81058-69',
  '81058-70',
  '81058-71',
  '81058-74',
  '81058-79',
  '81058-80',
  '81058-81',
  '81058-86',
  '81058-87',
  '81058-88',
  '81058-109',
  '81058-111',
  '81058-119',
  '81058-124',
  '81058-125',
  '81058-130',
  '81058-132',
  '81058-142',
  '81058-143',
  '81058-144',
  '81058-146',
  '81058-148',
] as const;

/** #955 已对照官方原文核实，只保留本条改动的那种资源。 */
const VERIFIED_185872_COSTS = {
  '185872-24': ['Gold', '70', '80'],
  '185872-25': ['Gold', '70', '80'],
  '185872-27': ['Food', '30', '35'],
  '185872-40': ['Wood', '45', '50'],
  '185872-41': ['Gold', '50', '55'],
  '185872-42': ['Wood', '45', '50'],
  '185872-43': ['Gold', '50', '55'],
  '185872-46': ['Food', '65', '75'],
  '185872-48': ['Food', '70', '75'],
  '185872-49': ['Food', '70', '75'],
  '185872-51': ['Food', '0', '30'],
  '185872-54': ['Wood', '35', '40'],
  '185872-55': ['Wood', '35', '40'],
  '185872-61': ['Gold', '25', '35'],
} as const;

function loadEntries() {
  return readdirSync('src/data/patches')
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => (JSON.parse(readFileSync(`src/data/patches/${name}`, 'utf8')) as { entries: PatchEntry[] }).entries);
}

function entry(id: string) {
  const found = loadEntries().find((item) => item.id === id);
  if (!found) throw new Error(`缺少档案 ${id}`);
  return found;
}

function resource(segments: readonly ValueSegment[] | undefined, name: 'Food' | 'Wood' | 'Gold' | 'Stone') {
  const found = segments?.find((segment) => segment.kind === 'resource' && segment.resource === name);
  if (!found || found.kind !== 'resource') throw new Error(`缺少资源 ${name}`);
  return found;
}

describe('更新历史资源前后值 #956', () => {
  it('语法正例保留原顺序，简写和全称是同一资源，秒可以跟在资源后面', () => {
    expect(parseResourceValue('60 食物、80 黄金')?.map((segment) => (segment.kind === 'resource' ? segment.resource : segment.kind))).toEqual(['Food', 'Gold']);
    expect(parseResourceValue('60食物、80黄金')?.map((segment) => segment.amount)).toEqual([60, 80]);
    expect(parseResourceValue('650 食物')).toMatchObject([{ kind: 'resource', resource: 'Food', digits: '650' }]);
    expect(parseResourceValue('10 石料')).toMatchObject([{ kind: 'resource', resource: 'Stone' }]);
    const mixed = parseResourceValue('50 木、100 金、50 秒');
    expect(mixed).toMatchObject([
      { kind: 'resource', resource: 'Wood', digits: '50' },
      { kind: 'resource', resource: 'Gold', digits: '100' },
      { kind: 'time', digits: '50' },
    ]);
    expect(parseResourceValue('10 食物、20 秒、30 秒')).toMatchObject([
      { kind: 'resource', resource: 'Food' },
      { kind: 'time', digits: '20' },
      { kind: 'time', digits: '30' },
    ]);
  });

  it('语法反例整串失败，不猜测资源', () => {
    for (const text of [
      '-10 食物',
      '1.5 食物',
      '50%',
      '折扣50%',
      '200 食物 + 每名村民 10 食物',
      '10 食物、10 食物',
      '10 木、20 木材',
      '34 秒',
      '34 秒、32 秒',
      '食物基础交易价100',
      '70',
      '起始 150 食物',
      '60  食物',
      '60 食物、 80 黄金',
      ' 60 食物',
      '60 食物\n',
    ]) {
      expect(parseResourceValue(text), text).toBeNull();
    }
  });

  it('全量档案里显示图标的条目就是这 59 条', () => {
    const entries = loadEntries();
    const iconIds = entries.flatMap((item) => (parseResourceChange(item) ? [item.id] : []));
    expect(entries).toHaveLength(366);
    expect(iconIds).toHaveLength(59);
    expect([...iconIds].sort()).toEqual([...ICON_IDS].sort());
  });

  it('185872 已核实的 14 条费用只标出本条改动的资源', () => {
    for (const [id, [resource, before, after]] of Object.entries(VERIFIED_185872_COSTS)) {
      const change = parseResourceChange(entry(id));
      expect(change?.before, id).toEqual([{ kind: 'resource', resource, amount: Number(before), digits: before }]);
      expect(change?.after, id).toEqual([{ kind: 'resource', resource, amount: Number(after), digits: after }]);
    }
  });

  it('纯数字、百分比、公式、描述词、交易价和只有时间都保持文字', () => {
    for (const id of ['66692-015-032', '125283-022-029', '81058-114', '81058-48', '81058-96', '125283-010-013', '81058-21', '81058-22', '81058-2']) {
      expect(parseResourceChange(entry(id)), id).toBeNull();
    }
    expect(entry('81058-48').before).toBe('1200 食物、650 黄金');
    expect(parseResourceValue(entry('81058-48').before!)).not.toBeNull();
  });

  it('188329-3 的黄金未变，81058-19 的食物未变、黄金和木材有变化', () => {
    const single = entry('188329-3');
    expect(single.before).toBe('60 食物、80 黄金');
    expect(single.after).toBe('70 食物、80 黄金');
    const singleChange = parseResourceChange(single);
    expect(segmentUnchanged(resource(singleChange?.before, 'Gold'), singleChange?.after)).toBe(true);
    expect(segmentUnchanged(resource(singleChange?.after, 'Gold'), singleChange?.before)).toBe(true);
    expect(segmentUnchanged(resource(singleChange?.before, 'Food'), singleChange?.after)).toBe(false);
    expect(segmentUnchanged(resource(singleChange?.after, 'Food'), singleChange?.before)).toBe(false);

    const swap = entry('81058-19');
    expect(swap.before).toBe('400 食物、200 黄金');
    expect(swap.after).toBe('400 食物、200 木材');
    const swapChange = parseResourceChange(swap);
    expect(segmentUnchanged(resource(swapChange?.before, 'Food'), swapChange?.after)).toBe(true);
    expect(segmentUnchanged(resource(swapChange?.after, 'Food'), swapChange?.before)).toBe(true);
    expect(segmentUnchanged(resource(swapChange?.before, 'Gold'), swapChange?.after)).toBe(false);
    expect(segmentUnchanged(resource(swapChange?.after, 'Wood'), swapChange?.before)).toBe(false);

    const time = parseResourceChange({ before: '50 木、10 秒', after: '50 木材、10 秒' });
    expect(segmentUnchanged(resource(time?.before, 'Wood'), time?.after)).toBe(true);
    const seconds = time?.before?.find((segment) => segment.kind === 'time');
    expect(seconds?.kind).toBe('time');
    if (!seconds) throw new Error('缺少秒');
    expect(segmentUnchanged(seconds, time?.after)).toBe(false);

    const only = parseResourceChange({ after: '850 食物' });
    expect(only?.before).toBeUndefined();
    expect(segmentUnchanged(resource(only?.after, 'Food'), only?.before)).toBe(false);
  });

  it('图标用资源全称，秒不加图标，未变和有变化只体现在样式', () => {
    const ship = parseResourceChange(entry('185872-14'));
    const before = renderToStaticMarkup(createElement(ResourceValue, { segments: ship!.before!, other: ship!.after, variant: 'history' }));
    expect(before).toContain('alt="木材"');
    expect(before).toContain('title="木材"');
    expect(before).toContain('alt="黄金"');
    expect(before).not.toContain('alt="木"');
    expect(before).not.toContain('alt="金"');
    expect(before).not.toContain('aria-hidden');
    expect(before.match(/<img /g)).toHaveLength(2);
    expect(before).toContain('50 秒');
    expect(before).toContain('resource-values-history');
    expect(before).not.toContain('resource-value-same');
    expect(before.match(/resource-value-changed/g)).toHaveLength(3);

    const cost = parseResourceChange(entry('188329-3'));
    const history = renderToStaticMarkup(createElement(ResourceValue, { segments: cost!.before!, other: cost!.after, variant: 'history' }));
    expect(history).toMatch(/resource-value-changed[\s\S]*alt="食物"[\s\S]*resource-value-same[\s\S]*alt="黄金"/);
    const patch = renderToStaticMarkup(createElement(ResourceValue, { segments: cost!.after!, other: cost!.before, variant: 'patch' }));
    expect(patch).toContain('resource-values-patch');
    expect(patch).toMatch(/src="[^"]*img\/stats\/food\.webp"/);
    expect(patch).toMatch(/src="[^"]*img\/stats\/gold\.webp"/);
  });
});
