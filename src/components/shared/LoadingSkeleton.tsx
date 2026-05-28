import { cn } from '../../lib/cn';

export function LoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading tasks">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] animate-pulse"
        >
          <div className="w-5 h-5 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06]" />
          <div className={cn('h-4 bg-[#F3F4F6] dark:bg-white/[0.06] rounded flex-1', i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-1/2' : 'w-2/3')} />
          <div className="w-16 h-3 bg-[#F3F4F6] dark:bg-white/[0.06] rounded" />
        </div>
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="border border-[#F3F4F6] dark:border-white/[0.07] rounded-[10px] overflow-hidden animate-pulse" role="status" aria-label="Loading calendar">
      <div className="grid grid-cols-7 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => (
          <div key={name} className="text-center text-xs py-1">
            <div className="h-3 w-6 mx-auto bg-[#F3F4F6] dark:bg-white/[0.06] rounded" />
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-[#F3F4F6] dark:border-white/[0.06] last:border-b-0">
          {Array.from({ length: 7 }).map((_, di) => (
            <div key={di} className="min-h-[80px] border-r border-[#F3F4F6] dark:border-white/[0.06] last:border-r-0 p-1">
              <div className="flex justify-between mb-1">
                <div className="w-6 h-6 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06]" />
                <div className="w-5 h-4 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06]" />
              </div>
              <div className="space-y-1">
                <div className="h-3 bg-[#F3F4F6] dark:bg-white/[0.06] rounded w-full" />
                <div className="h-3 bg-[#F3F4F6] dark:bg-white/[0.06] rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ))}
      <span className="sr-only">Loading calendar...</span>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Loading task details">
      <div className="flex items-start gap-4">
        <div className="w-7 h-7 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] mt-1" />
        <div className="flex-1">
          <div className="h-7 bg-[#F3F4F6] dark:bg-white/[0.06] rounded w-3/4" />
        </div>
      </div>
      <div>
        <div className="h-3 bg-[#F3F4F6] dark:bg-white/[0.06] rounded w-20 mb-2" />
        <div className="h-20 bg-[#F3F4F6] dark:bg-white/[0.06] rounded-[10px]" />
      </div>
      <div>
        <div className="h-3 bg-[#F3F4F6] dark:bg-white/[0.06] rounded w-20 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-[10px] bg-[#F9FAFB] dark:bg-white/[0.03]">
              <div className="w-9 h-9 rounded-lg bg-[#F3F4F6] dark:bg-white/[0.06]" />
              <div className="h-3 bg-[#F3F4F6] dark:bg-white/[0.06] rounded w-12" />
              <div className="h-4 bg-[#F3F4F6] dark:bg-white/[0.06] rounded flex-1" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading task details...</span>
    </div>
  );
}
