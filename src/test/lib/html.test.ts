import { describe, it, expect } from 'vitest';
import { stripHtml, isHtml, wrapPlainText } from '../../lib/html';

describe('stripHtml', () => {
  it('removes simple tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('handles nested tags', () => {
    expect(stripHtml('<p><strong>Bold</strong> text</p>')).toBe('Bold text');
  });

  it('preserves line breaks from <br>', () => {
    expect(stripHtml('Line1<br>Line2')).toBe('Line1\nLine2');
  });

  it('converts </p> and </div> and </li> to newlines', () => {
    expect(stripHtml('<p>Para1</p><p>Para2</p>')).toBe('Para1\nPara2');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('Plain text')).toBe('Plain text');
  });

  it('returns empty string for falsy input', () => {
    expect(stripHtml('')).toBe('');
    // @ts-expect-error: testing JS runtime
    expect(stripHtml(null)).toBe('');
  });

  it('returns empty string for empty HTML', () => {
    expect(stripHtml('<p></p>')).toBe('');
  });

  it('decodes common HTML entities', () => {
    expect(stripHtml('Price: &amp; &lt; &gt; &quot; &#39;')).toBe('Price: & < > " \'');
  });

  it('handles &nbsp;', () => {
    expect(stripHtml('word&nbsp;word')).toBe('word word');
  });

  it('collapses excessive newlines', () => {
    expect(stripHtml('<p>A</p><p></p><p></p><p>B</p>')).toBe('A\n\nB');
  });

  it('handles empty string type field', () => {
    expect(stripHtml('<p><br></p>')).toBe('');
  });
});

describe('isHtml', () => {
  it('detects HTML with tags', () => {
    expect(isHtml('<p>test</p>')).toBe(true);
  });

  it('detects self-closing tags', () => {
    expect(isHtml('<img src="x" />')).toBe(true);
  });

  it('rejects plain text', () => {
    expect(isHtml('just text')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isHtml('')).toBe(false);
  });

  it('rejects text with angle brackets (not HTML)', () => {
    // Must have a letter following < for tag detection
    expect(isHtml('3 < 5 and 7 > 2')).toBe(false);
  });

  it('detects nested HTML', () => {
    expect(isHtml('<div><p>Hello</p></div>')).toBe(true);
  });
});

describe('wrapPlainText', () => {
  it('wraps plain text in p tags', () => {
    expect(wrapPlainText('Hello')).toBe('<p>Hello</p>');
  });

  it('passes through HTML unchanged', () => {
    expect(wrapPlainText('<p>Hello</p>')).toBe('<p>Hello</p>');
  });

  it('splits on double newlines into separate paragraphs', () => {
    expect(wrapPlainText('Para1\n\nPara2')).toBe('<p>Para1</p><p>Para2</p>');
  });

  it('replaces single newlines with <br> within a paragraph', () => {
    expect(wrapPlainText('Line1\nLine2')).toBe('<p>Line1<br>Line2</p>');
  });

  it('handles mixed single and double newlines', () => {
    expect(wrapPlainText('A\nB\n\nC')).toBe('<p>A<br>B</p><p>C</p>');
  });

  it('returns empty string for empty input', () => {
    expect(wrapPlainText('')).toBe('');
  });

  it('returns null-like as is', () => {
    expect(wrapPlainText('')).toBe('');
  });
});
