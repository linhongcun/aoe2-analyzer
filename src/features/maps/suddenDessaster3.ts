export const SD3_SOURCE = 'https://www.twestaoe.net/events/suddendessaster3';
export const SD3_CHECKED_AT = '2026-11-04';

/** Bounded handbook paraphrases; Chinese names are local search aliases. */
export const SD3_MAPS = [
  { id: 'sd3-arena', en: 'Arena', name: '竞技场', tip: '基地背面没有城墙，护主城也要留意绕后。' },
  { id: 'sd3-canberra', en: 'Canberra', name: '堪培拉', tip: '狭河可运送攻城兵和爆破兵，主城边沿也需防登陆。' },
  { id: 'sd3-hideout', en: 'Hideout', name: '藏身之处', tip: '树林能被砍穿或轰开，别把林线当作主城的永久屏障。' },
  { id: 'sd3-holy-hollow', en: 'Holy Hollow', name: '圣谷', tip: '火药桶会连锁炸开林地，护主城时要盯住新通道。' },
  { id: 'sd3-kerak', en: 'Kerak', name: '凯拉克', tip: '开局有三座主城，必须全部被毁才会败北。' },
  { id: 'sd3-mauerfall', en: 'Mauerfall', name: '倒墙', tip: '主基地没有金石矿，外出取矿时也要留住主城防守。' },
  { id: 'sd3-mesa-verde', en: 'Mesa Verde', name: '梅萨维德', tip: '资源集中在暴露的中央，发展经济时别放空主城。' },
  { id: 'sd3-monkey-island', en: 'Monkey Island', name: '猴岛', tip: '占领帐篷可训练爆破兵，主城要防多方向偷袭。' },
  { id: 'sd3-mountain-forward', en: 'Mountain Forward', name: '山前据点', tip: '双基地隔墙分布，中立墙可拆，防守基地也不能放空。' },
  { id: 'sd3-thin-ice', en: 'Thin Ice', name: '薄冰', tip: '码头被毁会使整片冰面及其上的东西坠水，护城也要护码头。' },
  { id: 'sd3-zewalls', en: 'ZeWalls', name: '交错城墙', tip: '两座主城分居对角，中立墙不能被村民攻击却能修理。' },
] as const;
