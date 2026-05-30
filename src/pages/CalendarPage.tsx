import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useCalendarStore } from '../stores/calendarStore';
import type { ViewMode } from '../stores/calendarStore';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { MonthView } from '../components/calendar/MonthView';
import { WeekView } from '../components/calendar/WeekView';
import { DayView } from '../components/calendar/DayView';

export function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentDate, goNext, goPrev, goToday, setViewMode } = useCalendarStore();
  const segments = location.pathname.split('/');
  const viewMode: ViewMode = (segments[segments.length - 1] as ViewMode) || 'month';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
            <CalendarRange size={18} className="text-violet-500" />
          </div>
          <h3 className="text-[20px] font-bold text-[#111827] dark:text-white/90">{currentDate.getFullYear()}年{currentDate.getMonth() + 1}月</h3>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="p-1 rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors" aria-label="Previous">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToday}
              className="text-xs px-2 py-1 rounded border border-[#E5E7EB] dark:border-white/[0.07] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors"
            >
              今天
            </button>
            <button onClick={goNext} className="p-1 rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors" aria-label="Next">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex bg-[#F3F4F6] dark:bg-white/[0.06] rounded-lg p-0.5">
          {([
            ['month', '月'],
            ['week', '周'],
            ['day', '天'],
          ] as [ViewMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => {
                setViewMode(mode);
                navigate(`/calendar/${mode}`);
              }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-white dark:bg-[#1e1e32] text-[#111827] dark:text-white/90 shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827] dark:hover:text-white/90'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Routes>
        <Route index element={<Navigate to="month" replace />} />
        <Route path="month" element={<MonthView />} />
        <Route path="week" element={<WeekView />} />
        <Route path="day" element={<DayView />} />
      </Routes>
    </div>
  );
}
