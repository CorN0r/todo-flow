import { cn } from '../../lib/cn';

export function LoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-lg border bg-card animate-pulse"
        >
          <div className="w-5 h-5 rounded-full bg-muted" />
          <div className={cn('h-4 bg-muted rounded flex-1', i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-1/2' : 'w-2/3')} />
          <div className="w-16 h-3 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}
