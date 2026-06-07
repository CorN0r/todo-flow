import { addDays, format, getDay } from 'date-fns';

export interface ParsedTitle {
  title: string;
  dueDate: string | null;
  reminder: string | null;
  priority: number | null;
  recurrence: string | null;
  tagName: string | null;
}

const DAY_NAMES: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
  '日': 0, '天': 0, '七': 0,
};

const DIGIT_MAP: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

const RECURRENCE_PATTERNS: [RegExp, string][] = [
  [/^每天$/, 'daily'],
  [/^每周$/, 'weekly'],
  [/^每月$/, 'monthly'],
  [/^每年$/, 'yearly'],
  [/^每(\d+)天$/, 'daily'],
  [/^每(\d+)周$/, 'weekly'],
  [/^每(\d+)个?月$/, 'monthly'],
  [/^每(\d+)年$/, 'yearly'],
];

function parseChineseNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s === '十') return 10;
  if (s.startsWith('十')) return 10 + (DIGIT_MAP[s[1]] || 0);
  if (s.endsWith('十')) return (DIGIT_MAP[s[0]] || 0) * 10;
  if (s.includes('十')) {
    const [a, b] = s.split('十');
    return (DIGIT_MAP[a] || 0) * 10 + (DIGIT_MAP[b] || 0);
  }
  return DIGIT_MAP[s] ?? null;
}

function parseTimeExpression(s: string): string | null {
  const cleaned = s.replace(/：/g, ':').replace(/\s+/g, '');
  const match = cleaned.match(/^(下午|上午|中午|晚上|傍晚|凌晨|早上)?(\d{1,2})[点时:](\d{0,2})?分?$/);
  if (!match) return null;

  let hour = parseInt(match[2], 10);
  const minute = match[3] ? parseInt(match[3], 10) : 0;
  const period = match[1];

  if (period === '下午' || period === '晚上' || period === '傍晚') {
    if (hour < 12) hour += 12;
  } else if (period === '中午' && hour < 12) {
    hour += 12;
  } else if (period === '凌晨' && hour === 12) {
    hour = 0;
  }

  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseDateExpression(input: string): { date: string; consumedText: string; reminder: string | null } | null {
  const cleaned = input.replace(/：/g, ':').replace(/\s+/g, '');
  const today = new Date();

  const match = cleaned.match(
    /^(今天|明天|后天|大后天|下周([一二三四五六日天七])|下下?周([一二三四五六日天七])|(\d+|(?:[一二两三四五六七八九十]+))天后|下周|下个月(\d{1,2}|(?:[一二两三四五六七八九十]+))[号日]?)(.*)$/,
  );

  if (!match) return null;

  const keyword = match[1];
  let targetDate: Date | null = null;
  let consumedText = '';
  let timeStr: string | null = null;

  if (keyword === '今天') {
    targetDate = today;
    consumedText = '今天';
  } else if (keyword === '明天') {
    targetDate = addDays(today, 1);
    consumedText = '明天';
  } else if (keyword === '后天') {
    targetDate = addDays(today, 2);
    consumedText = '后天';
  } else if (keyword === '大后天') {
    targetDate = addDays(today, 3);
    consumedText = '大后天';
  } else if (keyword === '下周') {
    targetDate = addDays(today, 7);
    consumedText = '下周';
  } else if (match[2]) {
    const targetDay = DAY_NAMES[match[2]];
    if (targetDay !== undefined) {
      const currentDay = getDay(today);
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      targetDate = addDays(today, diff);
      consumedText = `下周${match[2]}`;
    }
  } else if (match[3]) {
    const targetDay = DAY_NAMES[match[3]];
    if (targetDay !== undefined) {
      const currentDay = getDay(today);
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      targetDate = addDays(today, diff + 7);
      consumedText = `下下周${match[3]}`;
    }
  } else if (match[4]) {
    const n = parseChineseNumber(match[4]);
    if (n !== null) {
      targetDate = addDays(today, n);
      consumedText = `${match[4]}天后`;
    }
  } else if (match[5]) {
    const dayNum = parseChineseNumber(match[5]);
    if (dayNum !== null && dayNum >= 1 && dayNum <= 31) {
      targetDate = new Date(today.getFullYear(), today.getMonth() + 1, dayNum);
      consumedText = `下个月${match[5]}号`;
    }
  }

  if (!targetDate) return null;

  const rest = match[6] || '';
  if (rest.length > 0) {
    const timeMatch = rest.match(/^(下午|上午|中午|晚上|傍晚|凌晨|早上)?(\d{1,2})[点时:](\d{0,2})?分?/);
    if (timeMatch) {
      const parsed = parseTimeExpression(timeMatch[0]);
      if (parsed) {
        timeStr = parsed;
        consumedText += timeMatch[0];
      }
    }
  }

  const dateStr = format(targetDate, 'yyyy-MM-dd');
  return {
    date: timeStr ? `${dateStr} ${timeStr}` : dateStr,
    consumedText,
    reminder: null,
  };
}

function parseRecurrenceWord(s: string): string | null {
  for (const [re, type] of RECURRENCE_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const interval = m[1] ? parseInt(m[1], 10) : 1;
      return JSON.stringify({ type, interval });
    }
  }
  // Handle Chinese: 每三天, 每两周
  const cnMatch = s.match(/^每([一二两三四五六七八九十]+)天$/);
  if (cnMatch) {
    const n = parseChineseNumber(cnMatch[1]);
    if (n) return JSON.stringify({ type: 'daily', interval: n });
  }
  const cnWeekMatch = s.match(/^每([一二两三四五六七八九十]+)周$/);
  if (cnWeekMatch) {
    const n = parseChineseNumber(cnWeekMatch[1]);
    if (n) return JSON.stringify({ type: 'weekly', interval: n });
  }
  return null;
}

export function parseTaskTitle(input: string): ParsedTitle {
  let title = input.trim();
  let dueDate: string | null = null;
  let reminder: string | null = null;
  let priority: number | null = null;
  let recurrence: string | null = null;
  let tagName: string | null = null;

  // Extract priority: !! or !!! at end
  const priorityMatch = title.match(/(!{1,4})\s*$/);
  if (priorityMatch) {
    priority = priorityMatch[1].length;
    title = title.replace(priorityMatch[0], '').trim();
  }

  // Extract #tagName
  const tagMatch = title.match(/#(\S+)/);
  if (tagMatch) {
    tagName = tagMatch[1];
    title = title.replace(tagMatch[0], '').trim();
  }

  // Extract date expression (e.g. 明天, 后天, 下周X)
  const dateResult = parseDateExpression(title);
  if (dateResult) {
    dueDate = dateResult.date;
    reminder = dateResult.reminder;
    title = title.replace(dateResult.consumedText, '').trim();
  }

  // Extract recurrence word (e.g. 每天, 每周, 每3天) - at the end
  const recMatch = title.match(
    /(每天|每周|每月|每年|每\d+天|每\d+周|每\d+个?月|每\d+年|每[一二两三四五六七八九十]+天|每[一二两三四五六七八九十]+周)$/,
  );
  if (recMatch) {
    const parsed = parseRecurrenceWord(recMatch[1]);
    if (parsed) {
      recurrence = parsed;
      title = title.replace(recMatch[1], '').trim();
    }
  }

  title = title.replace(/^[,，。、\s]+/, '').replace(/[,，。、\s]+$/, '');

  return {
    title: title || input.trim(),
    dueDate,
    reminder,
    priority,
    recurrence,
    tagName,
  };
}

export function parseTaskInput(
  input: string,
  existingTags: { id: string; name: string }[] = [],
) {
  const parsed = parseTaskTitle(input);
  return {
    ...parsed,
    tagId: matchTagName(parsed.tagName, existingTags),
  };
}

export function matchTagName(
  tagName: string | null,
  tags: { id: string; name: string }[],
): string | undefined {
  if (!tagName) return undefined;
  const exact = tags.find((t) => t.name === tagName);
  if (exact) return exact.id;
  const lower = tagName.toLowerCase();
  const fuzzy = tags.find((t) => t.name.toLowerCase() === lower);
  return fuzzy?.id;
}
