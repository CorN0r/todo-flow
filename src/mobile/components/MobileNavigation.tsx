import { CalendarDays, CheckSquare2, Home, ListTodo, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';

const primaryItems = [
  { to: '/mobile/today', label: '今天', icon: Home },
  { to: '/mobile/tasks', label: '任务', icon: ListTodo },
  { to: '/mobile/calendar', label: '日历', icon: CalendarDays },
  { to: '/mobile/habits', label: '习惯', icon: CheckSquare2 },
  { to: '/mobile/settings', label: '设置', icon: Settings },
];

export function MobileBottomNavigation() {
  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--mobile-color-border)] bg-[var(--mobile-color-nav)] px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur"
    >
      <div className="grid grid-cols-5 gap-1">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'mobile-nav-motion flex min-h-14 flex-col items-center justify-center gap-1 rounded-[var(--mobile-radius-md)] text-xs font-medium leading-tight',
                  isActive
                    ? 'bg-[var(--mobile-color-primary-container)] text-[var(--mobile-color-primary)]'
                    : 'text-[var(--mobile-color-text-muted)]',
                )
              }
            >
              <Icon aria-hidden="true" className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
