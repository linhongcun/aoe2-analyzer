import type { Dlc } from './types';

export const DLCS: Dlc[] = [
  {
    zh: '国王时代',
    en: 'The Age of Kings',
    year: 1999,
    civs: ['Chinese', 'Japanese', 'Mongols', 'Persians', 'Saracens', 'Turks', 'Goths', 'Teutons', 'Vikings', 'Britons', 'Celts', 'Franks', 'Byzantines'],
  },
  { zh: '征服者', en: 'The Conquerors', year: 2000, civs: ['Koreans', 'Huns', 'Spanish', 'Aztecs', 'Mayans'] },
  { zh: '失落帝国', en: 'The Forgotten', year: 2013, civs: ['Hindustanis', 'Magyars', 'Slavs', 'Italians', 'Incas'] },
  { zh: '非洲王国', en: 'The African Kingdoms', year: 2015, civs: ['Berbers', 'Portuguese', 'Ethiopians', 'Malians'] },
  { zh: '蛮王崛起', en: 'Rise of the Rajas', year: 2016, civs: ['Vietnamese', 'Burmese', 'Khmer', 'Malay'] },
  { zh: '最后的可汗', en: 'The Last Khans', year: 2019, civs: ['Tatars', 'Cumans', 'Bulgarians', 'Lithuanians'] },
  { zh: '西方霸主', en: 'Lords of the West', year: 2021, civs: ['Burgundians', 'Sicilians'] },
  { zh: '公爵的崛起', en: 'Dawn of the Dukes', year: 2021, civs: ['Poles', 'Bohemians'] },
  { zh: '印度王朝', en: 'Dynasties of India', year: 2022, civs: ['Bengalis', 'Gurjaras', 'Dravidians'] },
  { zh: '罗马归来', en: 'Return of Rome', year: 2023, civs: ['Romans'] },
  { zh: '皇家山脉', en: 'The Mountain Royals', year: 2023, civs: ['Armenians', 'Georgians'] },
  { zh: '三国', en: 'Three Kingdoms', year: 2025, civs: ['Khitans', 'Jurchens', 'Shu', 'Wei', 'Wu'] },
  { zh: '最后的酋长', en: 'The Last Chieftains', year: 2026, civs: ['Mapuche', 'Muisca', 'Tupi'] },
  { zh: '维京传奇', en: 'The Viking Sagas', year: 2026, civs: ['Danes', 'Varangians', 'Saxons'] },
];

export const CIV_DLC: Record<string, number> = {};
DLCS.forEach((d, i) => d.civs.forEach((c) => (CIV_DLC[c] = i)));

/** 通用单位/科技：仅标注可靠已知的引入版本，其余不标注 */
export const COMMON_DLC: Record<string, number> = {
  'Eagle Scout': 1,
  'Eagle Warrior': 1,
  'Elite Eagle Warrior': 1,
  Hussar: 1,
  Halberdier: 1,
  Petard: 1,
  Bloodlines: 1,
  Caravan: 1,
  'Herbal Medicine': 1,
  Heresy: 1,
  Theocracy: 1,
  'Parthian Tactics': 1,
  'Thumb Ring': 1,
  'Battle Elephant': 4,
  'Elite Battle Elephant': 4,
  'Steppe Lancer': 5,
  'Elite Steppe Lancer': 5,
  'Fire Lancer': 11,
  'Elite Fire Lancer': 11,
  'Varangian Guard': 13,
  'Elite Varangian Guard': 13,
  'Mounted Crossbowman': 13,
  'Winged Hussar': 7,
};

export function dlcOf(o: { en: string; type?: string | null; civs: string[] }): number | null {
  if (o.en in COMMON_DLC) return COMMON_DLC[o.en]!;
  if ((o.type === 'UniqueUnit' || o.type === 'UniqueTech') && o.civs.length === 1) return CIV_DLC[o.civs[0]!] ?? null;
  return null;
}
export const civDlc = (en: string): number | null => CIV_DLC[en] ?? null;

/** DLC 筛选：'' 全部，'none' 未标注，数字字符串为 DLC 序号 */
export const dlcMatch = (dlc: number | null, v: string): boolean => v === '' || (v === 'none' ? dlc == null : dlc === +v);
