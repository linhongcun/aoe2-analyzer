import { expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import techs from '../../src/data/techs.json';

it('#518 女真城堡科技与科技详情统一译名，保留文明介绍与帝王科技原文', () => {
  const civ = civs.find((item) => item.en === 'Jurchens')!;
  const tech = techs.find((item) => item.id === 996)!;
  expect(tech.zh).toBe('强化堡垒');
  expect(civ.ct).toBe(`${tech.zh} (防御工事每分钟恢复 500 生命值)｜${tech.en}`);
  expect(civ.ct).not.toMatch(/加固堡垒|\n/);
  expect(civ.it).toBe('霹雳炸弹 (火箭推车、掷弹兵和楼船在被击败时爆炸；炮弹会产生额外爆炸)｜Thunderclap Bombs');
  expect(tech.desc).toBe('防御工事和城镇中心每分钟恢复 500 生命值。');
  expect({ py: tech.py, pyi: tech.pyi }).toEqual({ py: 'qianghuabaolei', pyi: 'qhbl' });
});
