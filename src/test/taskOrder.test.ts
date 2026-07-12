import { describe, expect, it } from 'vitest';
import { mergeVisibleTaskOrder } from '../lib/taskOrder';

const task = (id: string) => ({ id });

describe('mergeVisibleTaskOrder', () => {
  it('uses the requested order when every task is visible', () => {
    expect(mergeVisibleTaskOrder([task('a'), task('b')], [task('b'), task('a')]).map((item) => item.id))
      .toEqual(['b', 'a']);
  });

  it('reorders only visible slots and preserves hidden relative order', () => {
    const all = ['a', 'b', 'c', 'd', 'e'].map(task);
    const visible = ['e', 'c', 'a'].map(task);
    expect(mergeVisibleTaskOrder(all, visible).map((item) => item.id)).toEqual(['e', 'b', 'c', 'd', 'a']);
  });

  it('keeps the full order when one or no tasks are visible', () => {
    const all = ['a', 'b', 'c'].map(task);
    expect(mergeVisibleTaskOrder(all, [task('b')]).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(mergeVisibleTaskOrder(all, []).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignores visible items that are outside the base order', () => {
    const all = ['a', 'b'].map(task);
    expect(mergeVisibleTaskOrder(all, [task('missing'), task('a')]).map((item) => item.id)).toEqual(['a', 'b']);
  });
});
