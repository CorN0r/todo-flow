import type { ReactNode } from 'react';

interface PageHeaderProps {
  icon?: ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
}

export function PageHeader({ icon, iconBg, title, subtitle }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {icon && (
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg || 'transparent' }}
        >
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
