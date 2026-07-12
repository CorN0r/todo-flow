import { ListFilter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskStatusFilter } from '../../lib/taskStatusFilter';

export function FilteredTaskEmptyState({
  filter,
  onShowAll,
}: {
  filter: Exclude<TaskStatusFilter, 'all'>;
  onShowAll: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center py-10 text-center">
      <ListFilter size={36} aria-hidden className="mb-3 text-[#D1D5DB] dark:text-white/15" />
      <p className="mb-3 text-[14px] font-medium text-[#6B7280] dark:text-white/55">
        {t(`filter.empty.${filter}`)}
      </p>
      <button
        type="button"
        onClick={onShowAll}
        className="h-8 rounded-md border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3 text-[12px] font-medium text-[#7C72F6] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.08]"
      >
        {t('filter.showAll')}
      </button>
    </div>
  );
}
