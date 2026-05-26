import { describe, it, expect, afterEach } from 'vitest';
import { resetTheme } from '../test-utils';

const KEY_VARS = [
  '--background', '--foreground', '--card', '--card-foreground',
  '--popover', '--popover-foreground', '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
  '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
  '--border', '--input', '--ring', '--radius', '--sidebar', '--sidebar-foreground',
];

function collectCSSVars(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {};
  for (const v of KEY_VARS) {
    const val = styles.getPropertyValue(v);
    if (val) vars[v] = val;
  }
  return vars;
}

describe('CSS variable audit', () => {
  afterEach(() => {
    resetTheme();
  });

  it('light theme CSS variables', () => {
    document.documentElement.classList.remove('dark');
    const vars = collectCSSVars();
    expect(vars).toMatchSnapshot();
  });

  it('dark theme CSS variables', () => {
    document.documentElement.classList.add('dark');
    const vars = collectCSSVars();
    expect(vars).toMatchSnapshot();
  });
});
