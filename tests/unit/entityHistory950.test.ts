import { describe, expect, it } from 'vitest';
import {
  HISTORY_CONFLICT_NOTE,
  HISTORY_EMPTY,
  historyDateLine,
  historyIsConflict,
  historyScopeText,
  historyVerification,
} from '../../src/shared/ui/PatchHistory';

describe('#950 更新历史密度文案', () => {
  it('有官方发行日时把发行日和公告公开日写成同一句', () => {
    expect(historyDateLine({ releaseDate: '2026-10-27', publishedAt: '2026-10-28', date: '2026-10-27' })).toBe(
      '官方发行日（公告当地日期） 2026-10-27 · DE 正式版 · 公告公开（北京时间） 2026-10-28',
    );
    expect(historyDateLine({ releaseDate: '2023-04-11', date: '2023-04-11' })).toBe('官方发行日（公告当地日期） 2023-04-11 · DE 正式版');
  });

  it('没有官方发行日时用档案日期，不把档案日期说成已核对发行日', () => {
    expect(historyDateLine({ date: '2026-09-23' })).toBe('档案日期 2026-09-23（不是已核对的官方发行日）');
  });

  it('范围说明包含分批、空缺、历史数值和档案标记边界', () => {
    const text = historyScopeText(['188329', '81058']);
    expect(text).toContain('分批收录 DE 正式版 188329、81058');
    expect(text).toContain('版本之间有空缺，没有出现在这里不代表从未改动');
    expect(text).toContain('历史数值不是当前数值');
    expect(text).toContain('档案标记不按数值重新判定，也不能直接证明整体对局强弱');
    expect(text).not.toContain('6 条');
    expect(text).not.toContain('26 条');
  });

  it('冲突短状态和横幅互补，空态用已审句', () => {
    expect(historyVerification({ verification: 'official', provenance: 'dat' })).toBe('已核对当时官方记录');
    expect(historyVerification({ provenance: 'source-conflict' })).toBe('来源冲突，尚未确认');
    expect(historyVerification({ verification: 'conflict', provenance: 'dat' })).toBe('来源冲突，尚未确认');
    expect(historyVerification({ verification: 'unverified', provenance: 'note' })).toBe('未核实');
    expect(historyVerification({ provenance: 'official-history' })).toBe('既有来源记录，尚未完成逐条原文核对');
    expect(historyIsConflict({ provenance: 'source-conflict' })).toBe(true);
    expect(historyIsConflict({ verification: 'official', provenance: 'dat' })).toBe(false);
    expect(HISTORY_CONFLICT_NOTE).toBe('不按数值改写档案标记。');
    expect(HISTORY_CONFLICT_NOTE).not.toContain('来源冲突，尚未确认');
    expect(HISTORY_EMPTY).toBe('尚未收录该对象的更新历史。这不代表它从未改动。');
  });
});
