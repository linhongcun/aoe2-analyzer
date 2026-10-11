/** 效果目标集审计：期望值逐条引用 AoE2 Fandom Wiki 科技页正文 */
import { describe, expect, it } from 'vitest';
import raw from '../../src/data/buildings.json';
import { techAffects } from '../../src/domain/affects';
import { buildingType } from '../../src/domain/buildings';
import type { Building } from '../../src/domain/types';
import { tech, units } from './helpers';

const bs = (raw as unknown as Building[]).map((b) => ({ ...b, dlc: null, type: buildingType(b.en) }));
const hit = (t: string) => {
  const g = techAffects(tech(t), units, bs).flatMap((x) => x.rows);
  return new Set([...g.flatMap((r) => r.units.map((u) => u.en)), ...g.flatMap((r) => r.buildings.map((b) => b.en))]);
};
const has = (t: string, yes: string[], no: string[] = []) => {
  const s = hit(t);
  yes.forEach((n) => expect(s, `${t} should affect ${n}`).toContain(n));
  no.forEach((n) => expect(s, `${t} should NOT affect ${n}`).not.toContain(n));
};

describe('effect target sets vs AoE2 Fandom Wiki', () => {
  // Wiki Fletching/Bodkin Arrow/Bracer: "Galleys, Longships, Caravels, Harbors, and Kreposts also benefit ... as well as Skirmishers, Genitours, and Bombard Towers"; TC "+1 attack and Line of Sight, but no range"
  it('Fletching line', () => {
    for (const t of ['Fletching', 'Bodkin Arrow', 'Bracer'])
      has(
        t,
        [
          'Archer',
          'Elite Skirmisher',
          'Genitour',
          'Cavalry Archer',
          'Galley',
          'Galleon',
          'Longship',
          'Caravel',
          'Keep',
          'Castle',
          'Krepost',
          'Harbor',
          'Bombard Tower',
          'Town Center',
        ],
        ['Hand Cannoneer', 'Fire Ship', 'Cannon Galleon', 'Paladin'],
      );
  });
  // Wiki Chemistry: "+1 attack of defensive structures, non-gunpowder archers, ranged non-gunpowder siege units, and most ranged non-gunpowder ships"
  it('Chemistry', () =>
    has(
      'Chemistry',
      ['Arbalester', 'Mangonel', 'Scorpion', 'Trebuchet (Packed)', 'Ballista Elephant', 'Galleon', 'Keep', 'Bombard Tower'],
      ['Hand Cannoneer', 'Bombard Cannon', 'Organ Gun', 'Paladin'],
    ));
  // Wiki Bloodlines: "hit points of all mounted units +20"; changelog TF: Missionaries are affected
  it('Bloodlines', () =>
    has(
      'Bloodlines',
      ['Paladin', 'Hussar', 'Camel Rider', 'Battle Elephant', 'Cavalry Archer', 'Steppe Lancer', 'Missionary'],
      ['Champion', 'Arbalester', 'Mangonel'],
    ));
  // Wiki Husbandry: "movement speed of Missionaries, cavalry, and mounted archers +10%"
  it('Husbandry', () => has('Husbandry', ['Paladin', 'Cavalry Archer', 'Missionary'], ['Champion']));
  // Wiki Forging/Iron Casting/Blast Furnace: "infantry, cavalry, and Hulk-line melee attack"; Ballista Elephant not increased
  it('Blacksmith melee attack', () => {
    for (const t of ['Forging', 'Iron Casting', 'Blast Furnace'])
      has(t, ['Champion', 'Paladin', 'Hulk', 'War Hulk'], ['Ballista Elephant', 'Arbalester', 'Galley']);
  });
  // Wiki Scale/Chain/Plate Barding Armor: "cavalry units and the Missionary"
  it('Barding armor', () =>
    has('Scale Barding Armor', ['Paladin', 'Camel Rider', 'Battle Elephant', 'Steppe Lancer', 'Missionary'], ['Cavalry Archer', 'Champion']));
  // Wiki Padded/Leather/Ring Archer Armor: "all archers"
  it('Archer armor', () => has('Padded Archer Armor', ['Arbalester', 'Cavalry Archer', 'Elite Skirmisher'], ['Paladin', 'Champion']));
  // Wiki Scale/Chain/Plate Mail Armor, Squires, Arson: infantry
  it('Infantry techs', () => {
    for (const t of ['Scale Mail Armor', 'Squires', 'Arson']) has(t, ['Champion', 'Halberdier'], ['Paladin', 'Arbalester']);
  });
  // Wiki Gambesons: "Militia, Fire Lancer, and Varangian Guard lines"
  it('Gambesons', () => has('Gambesons', ['Champion', 'Fire Lancer'], ['Halberdier', 'Eagle Warrior']));
  // Wiki Thumb Ring: all archers (foot and mounted), not gunpowder; Skirmisher/Genitour/Slinger accuracy only
  it('Thumb Ring', () => {
    has('Thumb Ring', ['Arbalester', 'Cavalry Archer', 'Elite Skirmisher', 'Genitour'], ['Hand Cannoneer']);
    const rows = techAffects(tech('Thumb Ring'), units, bs).flatMap((x) => x.rows);
    expect(rows.find((r) => r.units.some((u) => u.en === 'Elite Skirmisher'))!.effect).not.toContain('攻击速度');
  });
  // Wiki Parthian Tactics: "mounted archers (except Genitours), and Arambai"
  it('Parthian Tactics', () => has('Parthian Tactics', ['Cavalry Archer', 'Mangudai', 'Arambai'], ['Genitour', 'Elite Genitour', 'Arbalester']));
  // Wiki Masonry/Architecture: "Buildings"; Hoardings: Castles, Donjons, Kreposts; Arrowslits: towers + Donjon; Town Watch/Patrol: building LOS
  it('Building techs', () => {
    has('Masonry', ['Castle', 'House', 'Town Center'], ['Stone Wall']); // .dat：Masonry 不作用于城墙
    has('Hoardings', ['Castle', 'Krepost', 'Donjon'], ['Keep', 'Town Center']);
    has('Arrowslits', ['Watch Tower', 'Guard Tower', 'Keep', 'Donjon'], ['Castle']);
    has('Heated Shot', ['Castle', 'Krepost', 'Keep', 'Watch Tower']); // .dat 科技 380：塔类对船只加成 ×2.25，城堡/营垒 +4；船坞/巨港需 Thalassocracy（组合科技 736）
    has('Town Watch', ['House', 'Castle']);
  });
});
