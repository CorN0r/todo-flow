import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto mb-3 text-[#9CA3AF] flex items-center justify-center opacity-40">
        {icon}
      </div>
      <p className="text-[14px] text-[#6B7280] mb-1 font-medium">{title}</p>
      {description && (
        <p className="text-[13px] text-[#9CA3AF]">{description}</p>
      )}
    </div>
  );
}
