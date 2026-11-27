import { describe, expect, it } from 'vitest';
import { errMessage } from '../../lib/errMessage';

// 提示组件只能渲染文本:这里返回的必须永远是字符串,而且是有意义的那一句
describe('errMessage', () => {
  it('字符串原样返回', () => {
    expect(errMessage('数据库被锁定')).toBe('数据库被锁定');
  });

  it('Error 取它的 message', () => {
    expect(errMessage(new Error('磁盘已满'))).toBe('磁盘已满');
  });

  it('带 message 的普通对象取 message', () => {
    expect(errMessage({ code: 'save_timeout', message: '任务保存超时,请稍后重试' })).toBe('任务保存超时,请稍后重试');
  });

  it('空值和没有 message 的值也有话说', () => {
    expect(errMessage(null)).toBe('未知错误');
    expect(errMessage(undefined)).toBe('未知错误');
    expect(errMessage(new Error(''))).toBe('Error');
    expect(errMessage(42)).toBe('42');
    expect(errMessage({})).toBe('[object Object]');
  });

  it('不管传什么,返回的都是字符串', () => {
    for (const value of ['x', new Error('x'), { message: 'x' }, {}, null, 0, Symbol('s')]) {
      expect(typeof errMessage(value)).toBe('string');
    }
  });
});
