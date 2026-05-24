import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useCalendarStore } from '../stores/calendarStore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from '../lib/date';
import { MonthView } from '../components/calendar/MonthView';
import { WeekView } from '../components/calendar/WeekView';
import { DayView } from '../components/calendar/DayView';

export function CalendarPage() {
  const navigate = useNavigate();
  const { currentDate, viewMode, goNext, goPrev, goToday, setViewMode } = useCalendarStore();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{format(currentDate, 'MMMM yyyy')}</h3>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="p-1 rounded hover:bg-accent transition-colors">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToday}
              className="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
            >
              Today
            </button>
            <button onClick={goNext} className="p-1 rounded hover:bg-accent transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex bg-muted rounded-lg p-0.5">
          {(['month', 'week', 'day'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setViewMode(mode);
                navigate(`/calendar/${mode}`);
              }}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode}
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
