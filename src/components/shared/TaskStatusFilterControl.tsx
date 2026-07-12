import { useState } from 'react';
import { Check, ListFilter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  TASK_STATUS_FILTERS,
  type TaskStatusCounts,
  type TaskStatusFilter,
} from '../../lib/taskStatusFilter';
import { Portal } from './Portal';

interface TaskStatusFilterControlProps {
  value: TaskStatusFilter;
  counts: TaskStatusCounts;
  onChange: (value: TaskStatusFilter) => void;
}

const PRIMARY_FILTERS: TaskStatusFilter[] = ['all', 'active', 'completed'];
const SECONDARY_FILTERS: TaskStatusFilter[] = ['suspended', 'abandoned', 'overdue'];

export function TaskStatusFilterControl({ value, counts, onChange }: TaskStatusFilterControlProps) {
  const { t } = useTranslation();
  const [openMenu, setOpenMenu] = useState<'secondary' | 'compact' | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 4, left: 8 });

  const label = (filter: TaskStatusFilter) => t(`filter.status.${filter}`);
  const labelWithCount = (filter: TaskStatusFilter) => `${label(filter)} ${counts[filter]}`;
  const selectedSecondary = SECONDARY_FILTERS.includes(value) ? value : null;
  const menuOptions = openMenu === 'compact' ? [...TASK_STATUS_FILTERS] : SECONDARY_FILTERS;

  const choose = (filter: TaskStatusFilter) => {
    onChange(filter);
    setOpenMenu(null);
  };

  const toggleMenu = (kind: 'secondary' | 'compact', button: HTMLButtonElement) => {
    if (openMenu === kind) {
      setOpenMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 180) });
    setOpenMenu(kind);
  };

  return (
    <>
      <div className="hidden xl:flex items-center gap-1" aria-label={t('filter.statusMenu')}>
        {PRIMARY_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={value === filter}
            onClick={() => choose(filter)}
            className={`h-[24px] inline-flex items-center px-2 rounded-full text-[12px] font-medium transition-colors ${
              value === filter
                ? 'bg-[#7C72F6] text-white'
                : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] dark:text-white/60 hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1]'
            }`}
          >
            {labelWithCount(filter)}
          </button>
        ))}
        <button
          type="button"
          aria-label={t('filter.moreStatuses')}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'secondary'}
          aria-pressed={!!selectedSecondary}
          onClick={(event) => toggleMenu('secondary', event.currentTarget)}
          className={`h-[24px] inline-flex items-center gap-1 px-2 rounded-full text-[12px] font-medium transition-colors ${
            selectedSecondary
              ? 'bg-[#7C72F6] text-white'
              : 'bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] dark:text-white/60 hover:bg-[#E5E7EB] dark:hover:bg-white/[0.1]'
          }`}
        >
          <ListFilter size={12} aria-hidden />
          {selectedSecondary ? labelWithCount(selectedSecondary) : t('filter.moreStatuses')}
        </button>
      </div>

      <button
        type="button"
        aria-label={t('filter.statusMenu')}
        aria-haspopup="menu"
        aria-expanded={openMenu === 'compact'}
        onClick={(event) => toggleMenu('compact', event.currentTarget)}
        className="xl:hidden h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md bg-white dark:bg-[#1e1e32] border border-[#E5E7EB] dark:border-white/[0.07] text-[12px] font-medium text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06] transition-colors"
      >
        <ListFilter size={13} aria-hidden className="text-[#6B7280]" />
        {labelWithCount(value)}
      </button>

      {openMenu && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
          <div
            role="menu"
            aria-label={t('filter.statusMenu')}
            className="fixed z-50 min-w-[180px] rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] p-1 shadow-xl"
            style={menuPosition}
          >
            {menuOptions.map((filter) => (
              <button
                key={filter}
                type="button"
                role="menuitemradio"
                aria-checked={value === filter}
                onClick={() => choose(filter)}
                className={`flex min-h-9 w-full items-center justify-between gap-4 rounded-md px-3 text-left text-[13px] transition-colors ${
                  value === filter
                    ? 'bg-[#7C72F6]/10 text-[#7C72F6] font-medium'
                    : 'text-[#374151] dark:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]'
                }`}
              >
                <span>{label(filter)}</span>
                <span className="flex items-center gap-2 tabular-nums text-[#9CA3AF]">
                  {counts[filter]}
                  {value === filter && <Check size={13} aria-hidden className="text-[#7C72F6]" />}
                </span>
              </button>
            ))}
          </div>
        </Portal>
      )}
    </>
  );
}
