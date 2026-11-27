/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { menuSurface } from './popupSurface';

// 菜单类浮层必须不透明:玻璃主题会把 bg-white / dark:bg-[#1e1e32] 改写成很淡的半透明色,
// 下面的文字和标签会透上来。这里从三个角度守住:辅助函数、样式表、各组件里的类名。

// 工具类排在 .popover-surface 之后,同一元素上再写这些类会把不透明背景盖掉
const THINNED_BY_GLASS = /\bbg-white\b|dark:bg-\[#1e1e32\]|glass-panel/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(path) ? [path] : [];
  });
}

// 颜色里的不透明度;认不出的写法返回 NaN,调用处按“不合格”处理
function alphaOf(color: string): number {
  const value = color.trim();
  const hex = /^#([0-9a-f]+)$/i.exec(value);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 6) return 1;
    if (digits.length === 4) return parseInt(digits[3] + digits[3], 16) / 255;
    return parseInt(digits.slice(6), 16) / 255;
  }
  const functional = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (functional) return functional[1] === undefined ? 1 : Number(functional[1]);
  return Number.NaN;
}

describe('popover surfaces stay opaque', () => {
  it('menuSurface() is the popover class plus a border', () => {
    const classes = menuSurface().split(/\s+/);
    expect(classes).toContain('popover-surface');
    expect(classes).toContain('border');
    expect(classes.some((name) => THINNED_BY_GLASS.test(name))).toBe(false);
  });

  it('.popover-surface sets an opaque background in every theme', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const rules = [...css.matchAll(/^([.\w-\\[\]#/ ]*?)\.popover-surface\s*\{([^}]*)\}/gm)];
    const themes = rules.map(([, selector, body]) => {
      const background = /background-color:\s*([^;]+);/.exec(body)?.[1];
      expect(background, `no background-color in "${selector}.popover-surface"`).toBeDefined();
      expect(alphaOf(background!), `"${selector}.popover-surface" background ${background} lets content through`).toBe(1);
      return selector.split('.').map((name) => name.trim()).filter((name) => name && name !== 'popover-surface').sort().join('.');
    });
    expect(themes).toEqual(expect.arrayContaining(['', 'dark', 'glass', 'warm', 'lumina']));
  });

  it('no component pairs .popover-surface with a class the glass theme thins out', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles('src/components'), ...sourceFiles('src/pages')]) {
      const text = readFileSync(file, 'utf8');
      for (const literal of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const value = literal[1] ?? literal[2] ?? literal[3] ?? '';
        if (value.includes('popover-surface') && THINNED_BY_GLASS.test(value)) offenders.push(`${file}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
