/**
 * HTML 处理工具函数。用于富文本编辑器与纯文本显示之间的转换。
 */

/**
 * 去除 HTML 标签，返回纯文本。
 * 用于 TaskCard/StickyNote 等需要截断预览的场景。
 */
export function stripHtml(html: string): string {
  if (typeof html !== 'string') return '';
  return html
    // 块级元素换行
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    // 移除所有 HTML 标签
    .replace(/<[^>]+>/g, '')
    // 解码常见 HTML 实体
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // 合并多余空白
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 快速检测字符串是否包含 HTML 标签。
 */
export function isHtml(str: string): boolean {
  if (typeof str !== 'string') return false;
  return /<[a-z][\s\S]*>/i.test(str);
}

/**
 * 将纯文本包装为 HTML 段落，用于向后兼容旧数据。
 * 双换行 → 新段落，单换行 → <br>
 */
export function wrapPlainText(text: string): string {
  if (!text || isHtml(text)) return text;
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
