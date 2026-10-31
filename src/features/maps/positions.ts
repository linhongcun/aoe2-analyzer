/**
 * 开图 4v4 边路 / 中路编辑稿（issue 559）。
 * 理由按 civs.json 里的文明加成来写，不读天梯，也不按边位 / 口袋分排序。
 * 缺这张图，或某一侧数组为空：页面画待补，不补人、不删人。
 */
export interface MapPosTip {
  civ: string;
  reason: string;
}

export interface MapPositions {
  mode: 'open-4v4';
  flank: MapPosTip[];
  pocket: MapPosTip[];
}

export const mapPositions: Record<string, MapPositions> = {
  arabia: {
    mode: 'open-4v4',
    flank: [
      { civ: 'Britons', reason: '城堡时代起步弓手射程更远，边路适合用弓线牵制侧翼。' },
      { civ: 'Ethiopians', reason: '步弓手攻击更快，长枪兵升级免费，边路射骑都能接。' },
      { civ: 'Mayans', reason: '步弓手费用逐时代下降，资源也更耐用，边路弓线更好维持。' },
      { civ: 'Vietnamese', reason: '开局能看到敌方城镇中心，步弓手生命更高，适合边路先找对手。' },
      { civ: 'Italians', reason: '升时代更省，步弓手护甲更高，边路可以转到热那亚弩手。' },
      { civ: 'Saracens', reason: '市场更省、交易税更低，步弓手对建筑伤害更高，边路弓线有经济回转。' },
    ],
    pocket: [
      { civ: 'Franks', reason: '骑兵从封建时代起生命更高，磨坊科技免费，中路适合发育后出骑士。' },
      { civ: 'Huns', reason: '不用盖房屋，马厩工作更快，中路可以更顺地转骑士。' },
      { civ: 'Persians', reason: '城镇中心干活更快也更结实，中路先把村民铺开，再转骑士。' },
      { civ: 'Lithuanians', reason: '城镇中心会额外带来食物，驻守圣物能加强骑士，中路适合先收圣物再推进。' },
      { civ: 'Cumans', reason: '封建时代可以再盖一座城镇中心，中路更容易把经济铺开。' },
      { civ: 'Teutons', reason: '农田更便宜，城堡时代起骑兵近战护甲更高，中路适合顶住再推。' },
    ],
  },
};

export function mapPosTips(mapId: string, side: 'flank' | 'pocket'): MapPosTip[] {
  return mapPositions[mapId]?.[side] ?? [];
}
