import { readFileSync } from 'node:fs';

type Rgb = [number, number, number];

/** WCAG 相对亮度 → 对比度 */
export function contrast(foreground: Rgb, background: Rgb): number {
  const luminance = ([r, g, b]: Rgb) => {
    const channel = (v: number) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hex(color: string): Rgb {
  const value = color.trim().replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(value)) throw new Error(`only #rrggbb is supported, got "${color}"`);
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as Rgb;
}

/** 半透明的一层叠在底色上 */
export function blend(top: Rgb, alpha: number, under: Rgb): Rgb {
  return top.map((v, i) => Math.round(v * alpha + under[i] * (1 - alpha))) as Rgb;
}

/**
 * 类名里写的背景色画出来的样子:`bg-[#rrggbb]` 直接用,`bg-[rgba(r, g, b, a)]` 叠在 under 上,
 * 没写就是 under 本身。只看浅色主题的写法,`dark:` 前缀的不算
 */
export function paintedBackground(className: string, under: Rgb): Rgb {
  const hexClass = /(?:^|\s)bg-\[(#[0-9A-Fa-f]{6})\]/.exec(className);
  if (hexClass) return hex(hexClass[1]);
  const rgbaClass = /(?:^|\s)bg-\[rgba\(([^)]+)\)\]/.exec(className);
  if (rgbaClass) {
    const [r, g, b, a = 1] = rgbaClass[1].split(/[ ,]+/).filter(Boolean).map(Number);
    return blend([r, g, b], a, under);
  }
  return under;
}

/** index.css 里某个选择器规则中某个属性的取值 */
export function cssValue(selector: string, property: string): string {
  const css = readFileSync('src/index.css', 'utf8');
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for "${selector}" in src/index.css`);
  const body = css.slice(at, css.indexOf('}', at));
  const value = new RegExp(`${property}:\\s*([^;]+);`).exec(body)?.[1];
  if (!value) throw new Error(`no ${property} in the rule for "${selector}"`);
  return value.trim();
}
