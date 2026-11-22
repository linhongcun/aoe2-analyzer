export interface CompareFactParts {
  main: string;
  en?: string;
  desc?: string;
}

const MATCH_OPEN: Record<string, string> = {
  ')': '(',
  '）': '（',
};

/** 从末尾成对括号向左回溯定位匹配左括号，支持中英文嵌套括号。 */
function findTrailingParenStart(text: string): number {
  const closeCh = text[text.length - 1];
  if (!closeCh || !(closeCh in MATCH_OPEN)) return -1;
  const stack: string[] = [MATCH_OPEN[closeCh]!];
  for (let i = text.length - 2; i >= 0; i -= 1) {
    const ch = text[i]!;
    if (ch in MATCH_OPEN) {
      stack.push(MATCH_OPEN[ch]!);
      continue;
    }
    if (ch === '(' || ch === '（') {
      // 兼容不严格混用中英文括号的嵌套尾部，栈空即停止。
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/**
 * 解析文明对比表 uu / ct / it / tb 单元格文本，将主名称、英文副行与括号说明拆分为结构化片段（Issue 1285）。
 */
export function parseCompareFact(raw: string): CompareFactParts {
  const trimmed = raw.trim();
  if (!trimmed) return { main: '' };

  const sep = Math.max(trimmed.lastIndexOf('｜'), trimmed.lastIndexOf('|'));
  if (sep > 0) {
    const left = trimmed.slice(0, sep).trim();
    const en = trimmed.slice(sep + 1).trim();
    const openAt = findTrailingParenStart(left);
    if (openAt > 0) {
      const main = left.slice(0, openAt).trim();
      const desc = left.slice(openAt + 1, -1).trim();
      if (main) {
        return {
          main,
          ...(en ? { en } : {}),
          ...(desc ? { desc } : {}),
        };
      }
    }
    return {
      main: left,
      ...(en ? { en } : {}),
    };
  }

  const openAt = findTrailingParenStart(trimmed);
  if (openAt > 0) {
    const inside = trimmed.slice(openAt + 1, -1).trim();
    const main = trimmed.slice(0, openAt).trim();
    if (main && /[A-Za-z]/.test(inside)) {
      return { main, en: inside };
    }
  }

  return { main: trimmed };
}
