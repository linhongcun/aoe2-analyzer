import entries from './history.json';

/** 本站依据逐页核对的官方介绍撰写的摘要；出处与核对日期随每条保留。 */
export interface CivHistoryEntry {
  summary: string;
  paragraphs: readonly string[];
  source: { label: string; url: string };
  checkedOn: string;
}

export const CIV_HISTORY: Readonly<Record<string, CivHistoryEntry | undefined>> = entries;
