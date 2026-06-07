import { describe, it, expect } from 'vitest';
import { parseTaskTitle, matchTagName, parseTaskInput } from '../lib/nlp';

const YYYY_MM_DD_RE = /^\d{4}-\d{2}-\d{2}$/;

describe('parseTaskTitle', () => {
  describe('plain text', () => {
    it('returns input as title with no extra fields', () => {
      const r = parseTaskTitle('Buy groceries');
      expect(r.title).toBe('Buy groceries');
      expect(r.dueDate).toBeNull();
      expect(r.priority).toBeNull();
      expect(r.recurrence).toBeNull();
      expect(r.tagName).toBeNull();
      expect(r.reminder).toBeNull();
    });

    it('trims whitespace', () => {
      expect(parseTaskTitle('  hello  ').title).toBe('hello');
    });
  });

  describe('date parsing', () => {
    it('parses 今天', () => {
      const r = parseTaskTitle('今天开会');
      expect(r.title).toBe('开会');
      expect(r.dueDate).toMatch(YYYY_MM_DD_RE);
    });

    it('parses 明天', () => {
      const r = parseTaskTitle('明天买菜');
      expect(r.title).toBe('买菜');
      expect(r.dueDate).toMatch(YYYY_MM_DD_RE);
    });

    it('parses 后天', () => {
      const r = parseTaskTitle('后天交报告');
      expect(r.title).toBe('交报告');
      expect(r.dueDate).toMatch(YYYY_MM_DD_RE);
    });

    it('parses 大后天', () => {
      const r = parseTaskTitle('大后天旅行');
      expect(r.title).toBe('旅行');
      expect(r.dueDate).toMatch(YYYY_MM_DD_RE);
    });

    it('parses 下周X', () => {
      const r = parseTaskTitle('下周一开始');
      expect(r.title).toBe('开始');
      expect(r.dueDate).toMatch(YYYY_MM_DD_RE);
    });

    it('parses X天后 with digits', () => {
      const r = parseTaskTitle('3天后还书');
      expect(r.title).toBe('还书');
      expect(r.dueDate).toMatch(YYYY_MM_DD_RE);
    });
  });

  describe('time parsing', () => {
    it('parses 明天下午3点 with time', () => {
      const r = parseTaskTitle('明天下午3点开会');
      expect(r.title).toBe('开会');
      expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2} 15:00$/);
      expect(r.reminder).toBeNull();
    });

    it('parses 明天上午10点', () => {
      const r = parseTaskTitle('明天上午10点交报告');
      expect(r.title).toBe('交报告');
      expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2} 10:00$/);
      expect(r.reminder).toBeNull();
    });

    it('parses 晚上8点', () => {
      const r = parseTaskTitle('明天晚上8点聚餐');
      expect(r.title).toBe('聚餐');
      expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2} 20:00$/);
      expect(r.reminder).toBeNull();
    });

    it('parses 明天3点 (no period, treated as 3:00)', () => {
      const r = parseTaskTitle('明天3点取快递');
      expect(r.title).toBe('取快递');
      expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2} 03:00$/);
      expect(r.reminder).toBeNull();
    });
  });

  describe('priority parsing', () => {
    it('parses ! at end as priority 1', () => {
      const r = parseTaskTitle('Buy milk !');
      expect(r.title).toBe('Buy milk');
      expect(r.priority).toBe(1);
    });

    it('parses !! as priority 2', () => {
      const r = parseTaskTitle('Fix bug !!');
      expect(r.title).toBe('Fix bug');
      expect(r.priority).toBe(2);
    });

    it('parses !!! as priority 3', () => {
      const r = parseTaskTitle('Deploy server !!!');
      expect(r.title).toBe('Deploy server');
      expect(r.priority).toBe(3);
    });

    it('parses !!!! as priority 4', () => {
      const r = parseTaskTitle('Critical issue !!!!');
      expect(r.title).toBe('Critical issue');
      expect(r.priority).toBe(4);
    });

    it('does not parse ! in the middle of text', () => {
      const r = parseTaskTitle('Hello! World');
      expect(r.title).toBe('Hello! World');
      expect(r.priority).toBeNull();
    });
  });

  describe('tag parsing', () => {
    it('parses #tagName', () => {
      const r = parseTaskTitle('Review PR #编程');
      expect(r.title).toBe('Review PR');
      expect(r.tagName).toBe('编程');
    });

    it('parses #tag at end', () => {
      const r = parseTaskTitle('Fix build #devops');
      expect(r.title).toBe('Fix build');
      expect(r.tagName).toBe('devops');
    });

    it('parses tag with only one # when multiple present', () => {
      const r = parseTaskTitle('Call client #销售');
      expect(r.title).toBe('Call client');
      expect(r.tagName).toBe('销售');
    });
  });

  describe('recurrence parsing', () => {
    it('parses 每天', () => {
      const r = parseTaskTitle('健身每天');
      expect(r.title).toBe('健身');
      expect(r.recurrence).toBe('{"type":"daily","interval":1}');
    });

    it('parses 每周', () => {
      const r = parseTaskTitle('周报每周');
      expect(r.title).toBe('周报');
      expect(r.recurrence).toBe('{"type":"weekly","interval":1}');
    });

    it('parses 每3天', () => {
      const r = parseTaskTitle('吃药每3天');
      expect(r.title).toBe('吃药');
      expect(r.recurrence).toBe('{"type":"daily","interval":3}');
    });

    it('parses 每2周', () => {
      const r = parseTaskTitle('发工资每2周');
      expect(r.title).toBe('发工资');
      expect(r.recurrence).toBe('{"type":"weekly","interval":2}');
    });
  });

  describe('combined patterns', () => {
    it('parses date + priority', () => {
      const r = parseTaskTitle('明天开会 !!');
      expect(r.title).toBe('开会');
      expect(r.dueDate).toMatch(YYYY_MM_DD_RE);
      expect(r.priority).toBe(2);
    });

    it('parses date + tag', () => {
      const r = parseTaskTitle('明天买菜 #生活');
      expect(r.title).toBe('买菜');
      expect(r.dueDate).toMatch(YYYY_MM_DD_RE);
      expect(r.tagName).toBe('生活');
    });

    it('parses date + time + tag + priority', () => {
      const r = parseTaskTitle('明天下午3点开会 #工作 !!');
      expect(r.title).toBe('开会');
      expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2} 15:00$/);
      expect(r.reminder).toBeNull();
      expect(r.tagName).toBe('工作');
      expect(r.priority).toBe(2);
    });

    it('parses recurrence + priority', () => {
      const r = parseTaskTitle('健身每天 !!');
      expect(r.title).toBe('健身');
      expect(r.recurrence).toBe('{"type":"daily","interval":1}');
      expect(r.priority).toBe(2);
    });
  });
});

describe('matchTagName', () => {
  const tags = [
    { id: 't1', name: '工作' },
    { id: 't2', name: '生活' },
    { id: 't3', name: 'DevOps' },
  ];

  it('finds exact match', () => {
    expect(matchTagName('工作', tags)).toBe('t1');
  });

  it('finds case-insensitive match', () => {
    expect(matchTagName('devops', tags)).toBe('t3');
  });

  it('returns undefined for no match', () => {
    expect(matchTagName('未知', tags)).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(matchTagName(null, tags)).toBeUndefined();
  });
});

describe('parseTaskInput', () => {
  const tags = [{ id: 't1', name: '工作' }];

  it('returns tagId when tag matches', () => {
    const r = parseTaskInput('开会 #工作', tags);
    expect(r.tagId).toBe('t1');
  });

  it('returns undefined tagId when no match', () => {
    const r = parseTaskInput('开会 #未知', tags);
    expect(r.tagId).toBeUndefined();
  });
});
