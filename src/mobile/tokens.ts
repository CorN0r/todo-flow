import type { CSSProperties } from 'react';

export type MobileThemeName = 'light' | 'dark' | 'lumina';

export interface MobileThemeTokens {
  colors: {
    background: string;
    surface: string;
    surfaceRaised: string;
    border: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    primary: string;
    primaryPressed: string;
    primaryContainer: string;
    danger: string;
    warning: string;
    success: string;
    nav: string;
  };
  typography: {
    title: string;
    subtitle: string;
    body: string;
    caption: string;
  };
  spacing: {
    pageX: string;
    pageTop: string;
    bottomNav: string;
    control: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    sheet: string;
  };
  elevation: {
    card: string;
    sheet: string;
    fab: string;
  };
  motion: {
    fast: string;
    normal: string;
    easing: string;
  };
}

export const mobileThemes: Record<MobileThemeName, MobileThemeTokens> = {
  light: {
    colors: {
      background: '#F6F6FA',
      surface: '#FFFFFF',
      surfaceRaised: '#FFFFFF',
      border: '#E5E7EB',
      text: '#111827',
      textMuted: '#6B7280',
      textSubtle: '#9CA3AF',
      primary: '#6D63E6',
      primaryPressed: '#5F54D7',
      primaryContainer: '#EFEEFF',
      danger: '#EF4444',
      warning: '#F59E0B',
      success: '#10B981',
      nav: 'rgba(255,255,255,0.96)',
    },
    typography: {
      title: '1.5rem',
      subtitle: '1.0625rem',
      body: '0.9375rem',
      caption: '0.75rem',
    },
    spacing: {
      pageX: '20px',
      pageTop: '20px',
      bottomNav: '92px',
      control: '44px',
    },
    radius: {
      sm: '8px',
      md: '10px',
      lg: '14px',
      sheet: '22px',
    },
    elevation: {
      card: '0 1px 2px rgba(17,24,39,0.06)',
      sheet: '0 -18px 48px rgba(17,24,39,0.20)',
      fab: '0 14px 34px rgba(109,99,230,0.34)',
    },
    motion: {
      fast: '140ms',
      normal: '220ms',
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  },
  dark: {
    colors: {
      background: '#11111D',
      surface: '#19192A',
      surfaceRaised: '#202036',
      border: 'rgba(255,255,255,0.08)',
      text: 'rgba(255,255,255,0.92)',
      textMuted: 'rgba(255,255,255,0.64)',
      textSubtle: 'rgba(255,255,255,0.42)',
      primary: '#8A82FF',
      primaryPressed: '#A39DFF',
      primaryContainer: 'rgba(138,130,255,0.16)',
      danger: '#F87171',
      warning: '#FBBF24',
      success: '#34D399',
      nav: 'rgba(25,25,42,0.96)',
    },
    typography: {
      title: '1.5rem',
      subtitle: '1.0625rem',
      body: '0.9375rem',
      caption: '0.75rem',
    },
    spacing: {
      pageX: '20px',
      pageTop: '20px',
      bottomNav: '92px',
      control: '44px',
    },
    radius: {
      sm: '8px',
      md: '10px',
      lg: '14px',
      sheet: '22px',
    },
    elevation: {
      card: '0 1px 2px rgba(0,0,0,0.22)',
      sheet: '0 -18px 48px rgba(0,0,0,0.42)',
      fab: '0 14px 34px rgba(0,0,0,0.34)',
    },
    motion: {
      fast: '140ms',
      normal: '220ms',
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  },
  lumina: {
    colors: {
      background: '#FBFAFF',
      surface: '#FFFFFF',
      surfaceRaised: '#FFFFFF',
      border: '#E9E5FF',
      text: '#1E1B33',
      textMuted: '#6A6384',
      textSubtle: '#9C94B8',
      primary: '#7C72F6',
      primaryPressed: '#6B61E8',
      primaryContainer: '#F1EFFF',
      danger: '#E5484D',
      warning: '#F59E0B',
      success: '#12A46F',
      nav: 'rgba(255,255,255,0.96)',
    },
    typography: {
      title: '1.5rem',
      subtitle: '1.0625rem',
      body: '0.9375rem',
      caption: '0.75rem',
    },
    spacing: {
      pageX: '20px',
      pageTop: '20px',
      bottomNav: '92px',
      control: '44px',
    },
    radius: {
      sm: '8px',
      md: '10px',
      lg: '14px',
      sheet: '22px',
    },
    elevation: {
      card: '0 1px 2px rgba(124,114,246,0.08)',
      sheet: '0 -18px 48px rgba(65,56,150,0.18)',
      fab: '0 14px 34px rgba(124,114,246,0.32)',
    },
    motion: {
      fast: '140ms',
      normal: '220ms',
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  },
};

export function resolveMobileTheme(theme: string, resolvedTheme: 'light' | 'dark'): MobileThemeName {
  if (theme === 'lumina') return 'lumina';
  return resolvedTheme === 'dark' ? 'dark' : 'light';
}

export function mobileThemeStyle(themeName: MobileThemeName): CSSProperties {
  const tokens = mobileThemes[themeName];
  return {
    '--mobile-color-bg': tokens.colors.background,
    '--mobile-color-surface': tokens.colors.surface,
    '--mobile-color-surface-raised': tokens.colors.surfaceRaised,
    '--mobile-color-border': tokens.colors.border,
    '--mobile-color-text': tokens.colors.text,
    '--mobile-color-text-muted': tokens.colors.textMuted,
    '--mobile-color-text-subtle': tokens.colors.textSubtle,
    '--mobile-color-primary': tokens.colors.primary,
    '--mobile-color-primary-pressed': tokens.colors.primaryPressed,
    '--mobile-color-primary-container': tokens.colors.primaryContainer,
    '--mobile-color-danger': tokens.colors.danger,
    '--mobile-color-warning': tokens.colors.warning,
    '--mobile-color-success': tokens.colors.success,
    '--mobile-color-nav': tokens.colors.nav,
    '--mobile-font-title': tokens.typography.title,
    '--mobile-font-subtitle': tokens.typography.subtitle,
    '--mobile-font-body': tokens.typography.body,
    '--mobile-font-caption': tokens.typography.caption,
    '--mobile-space-page-x': tokens.spacing.pageX,
    '--mobile-space-page-top': tokens.spacing.pageTop,
    '--mobile-space-bottom-nav': tokens.spacing.bottomNav,
    '--mobile-size-control': tokens.spacing.control,
    '--mobile-radius-sm': tokens.radius.sm,
    '--mobile-radius-md': tokens.radius.md,
    '--mobile-radius-lg': tokens.radius.lg,
    '--mobile-radius-sheet': tokens.radius.sheet,
    '--mobile-shadow-card': tokens.elevation.card,
    '--mobile-shadow-sheet': tokens.elevation.sheet,
    '--mobile-shadow-fab': tokens.elevation.fab,
    '--mobile-motion-fast': tokens.motion.fast,
    '--mobile-motion-normal': tokens.motion.normal,
    '--mobile-motion-easing': tokens.motion.easing,
  } as CSSProperties;
}
